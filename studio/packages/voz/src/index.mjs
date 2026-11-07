// @praeko/studio-voz: narração (TTS), normalização de volume e tempos por palavra (Scribe). Só Node; precisa de `ffmpeg` no PATH.
// A chave vem do ambiente (ELEVENLABS_API_KEY) e o id da voz de uma variável nomeada em `marca.voz.idEnv`: nada de segredo no git.
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { carregarConfig, obterChave, resolverVoz } from "./config.mjs";
import { gerarComFailover, salvarBuffer } from "./roteador.mjs";
import { criarVoiceStudio } from "./provedores/voicestudio.mjs";
import { alinharPeloRoteiro, juntarNumeros } from "./alinhamento.mjs";
import { audioMudo, estimarPalavras } from "./estimado.mjs";
import { lerBlocos, narrarBlocos } from "./blocos.mjs";

export * from "./config.mjs";
export { gerarComFailover, saldos } from "./roteador.mjs";
export { criarVoiceStudio, prepararTexto } from "./provedores/voicestudio.mjs";
export { estimarPalavras, audioMudo } from "./estimado.mjs";
export { lerBlocos, narrarBlocos, juntarAudios } from "./blocos.mjs";
export { alinharPeloRoteiro, palavrasDoRoteiro, juntarNumeros } from "./alinhamento.mjs";
import { createReadStream, existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";

/** @typedef {{ t: string, a: number, b: number }} Palavra */

const par = (arq) => mkdirSync(dirname(arq), { recursive: true });

/** Troca termos que a voz lê errado (`{ "meusite.com.br": "meu site ponto com ponto br" }`). Só vale para o texto falado. */
export function aplicarPronuncia(texto, mapa = {}) {
  let t = texto;
  for (const [de, para] of Object.entries(mapa)) t = t.split(de).join(para);
  return t;
}

/** Corrige palavras da legenda que o Scribe escreve errado (`{ "0,40": "quarenta" }`). Compara sem maiúsculas e sem pontuação final. */
export function aplicarCorrecoes(palavras, mapa = {}) {
  const k = (s) => s.toLowerCase().replace(/[.,!?:;"]+$/g, "");
  const m = Object.fromEntries(Object.entries(mapa).map(([a, b]) => [k(a), b]));
  return palavras.map((p) => (m[k(p.t)] ? { ...p, t: m[k(p.t)] } : p));
}

/** Normaliza o volume (loudnorm). Devolve a duração em segundos. */
export function normalizarAudio(entrada, saida, lufs = -15) {
  par(saida);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", entrada, "-af", `loudnorm=I=${lufs}:TP=-1.5`, "-ar", "44100", saida]);
  return duracao(saida);
}
export function duracao(arq) {
  return +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", arq]).toString().trim();
}

/**
 * Gera a narração. `voz` é um apelido de `vozes.json` ("minha-voz") ou o formato antigo `{ provedor, idEnv, modelo }`.
 * O roteador escolhe a conta, confere o saldo e troca de conta se a cota acabar. Texto no eleven_v4 aceita tags como [curious].
 */
export async function gerarVoz({ texto, saida, voz, lufs = -15, pronuncia, log = () => {}, semFailover = false, config = carregarConfig() }) {
  const v = resolverVoz(voz, config);
  const falado = aplicarPronuncia(texto.trim(), pronuncia);
  let buffer, ext = "mp3", conta = null, tentativas = [];
  if (v.provedor === "voicestudio") {
    const vs = criarVoiceStudio({ base: config.voicestudio?.base });
    const st = await vs.disponivel();
    if (!st.ok) throw new Error(`VoiceStudio indisponível: ${st.motivo}`);
    log(`[voz] voicestudio ${st.versao} (${st.device}), voz ${v.apelido} (${v.id})`);
    buffer = await vs.gerar({ texto: falado, id: v.id, modelo: v.modelo, idioma: v.idioma, ajustes: v.ajustes });
    ext = "wav"; conta = "local";
  } else {
    const r = await gerarComFailover({ texto: falado, voz: v, config, log, semFailover });
    buffer = r.buffer; conta = r.conta; tentativas = r.tentativas;
  }
  const bruto = `${saida}.bruto.${ext}`;
  salvarBuffer(buffer, bruto);
  const d = normalizarAudio(bruto, saida, lufs);
  unlinkSync(bruto);
  return { arquivo: saida, duracao: d, conta, provedor: v.provedor, tentativas };
}

/**
 * Tempos por palavra. `alinhador`: "scribe" (ElevenLabs, gasta crédito) ou "voicestudio" (faster-whisper local, grátis).
 * Com `roteiro`, corrige quase-acertos de grafia pelo texto original (esbuild/Sbuild, ninguém/ninguem); `correcoes` aplica o mapa da marca.
 */
export async function alinhar({ audio, alinhador = "scribe", idioma = "por", roteiro, correcoes, config = carregarConfig() }) {
  let palavras, eventos = [], texto;
  if (alinhador === "voicestudio") {
    const vs = criarVoiceStudio({ base: config.voicestudio?.base });
    const st = await vs.disponivel();
    if (!st.ok) throw new Error(`VoiceStudio indisponível: ${st.motivo}`);
    ({ palavras, texto } = await vs.transcrever({ audio, bytes: readFileSync(audio), idioma: idioma === "por" ? "pt" : idioma }));
  } else if (alinhador === "scribe") {
    const ref = (config.contas?.elevenlabs || []).map((c) => `elevenlabs/${c}`).find((r) => obterChave(r));
    if (!ref) throw new Error("alinhar: nenhuma chave do ElevenLabs encontrada (cofre do sistema, ~/.config/praeko ou ELEVENLABS_API_KEY)");
    const client = new ElevenLabsClient({ apiKey: obterChave(ref) });
    const r = await client.speechToText.convert({ file: createReadStream(audio), modelId: "scribe_v1", languageCode: idioma, timestampsGranularity: "word", tagAudioEvents: true });
    palavras = r.words.filter((w) => w.type === "word").map((w) => ({ t: w.text, a: +w.start.toFixed(2), b: +w.end.toFixed(2) }));
    eventos = r.words.filter((w) => w.type === "audio_event").map((w) => ({ t: w.text, a: +w.start.toFixed(2) }));
    texto = r.text;
  } else throw new Error(`alinhador desconhecido: ${alinhador}`);
  palavras = juntarNumeros(palavras);
  let corrigidas = [];
  if (roteiro) ({ palavras, corrigidas } = alinharPeloRoteiro(palavras, roteiro));
  return { palavras: aplicarCorrecoes(palavras, correcoes), eventos, texto, corrigidas };
}

/**
 * Gera UM trecho curto (uma frase de abertura, um bloco): áudio em `arquivo` e tempos locais por palavra.
 * Provedor `estimado` não fala (mp3 mudo); os outros usam voz + alinhador como o `narrar`.
 */
export async function narrarTrecho({ texto, arquivo, marca = {}, qualidade, voz, alinhador, log = () => {}, semFailover = false, config = carregarConfig() }) {
  const alias = voz || (qualidade && config.qualidade?.[qualidade]) || marca.voz;
  const v = resolverVoz(alias, config);
  if (v.provedor === "estimado") {
    const est = estimarPalavras(aplicarPronuncia(texto.trim(), marca.pronuncia), { wpm: v.palavrasPorMin });
    audioMudo(arquivo, est.duracao);
    return { duracao: est.duracao, palavras: aplicarCorrecoes(est.palavras, marca.legendaCorrige), estimada: true, voz: v.apelido };
  }
  const g = await gerarVoz({ texto, saida: arquivo, voz: alias, pronuncia: marca.pronuncia, log, semFailover, config });
  const al = await alinhar({ audio: arquivo, alinhador: alinhador || v.alinhador || "scribe", roteiro: texto, correcoes: marca.legendaCorrige, config });
  return { duracao: g.duracao, palavras: al.palavras, estimada: false, voz: v.apelido, conta: g.conta };
}

/**
 * Passo completo: lê `<pasta>/roteiro.txt`, gera `<pasta>/voz.mp3` e `<pasta>/palavras.json`
 * (e `palavras.ts` com `export const PALAVRAS`, pronto para importar no episódio).
 */
export async function narrar({ pasta, marca, nomeConstante = "PALAVRAS", log = () => {}, semFailover = false, voz, qualidade, alinhador, config = carregarConfig() }) {
  const texto = readFileSync(join(pasta, "roteiro.txt"), "utf8");
  const alias = voz || (qualidade && config.qualidade?.[qualidade]) || marca.voz;
  const v = resolverVoz(alias, config);
  const marcador = join(pasta, "voz.estimada");
  if (lerBlocos(texto).length) {
    // LONGO: roteiro em blocos (`## título`), um áudio por bloco com cache, juntados com pausa
    const estimado = v.provedor === "estimado";
    const r = await narrarBlocos({
      pasta, roteiro: texto, chave: `${alias}|${v.provedor}|${v.modelo ?? ""}|${JSON.stringify(marca.pronuncia ?? {})}`, log,
      gerarBloco: async ({ texto: tb, arquivo }) => {
        if (estimado) {
          const est = estimarPalavras(aplicarPronuncia(tb.trim(), marca.pronuncia), { wpm: v.palavrasPorMin });
          audioMudo(arquivo, est.duracao);
          return { duracao: est.duracao, palavras: aplicarCorrecoes(est.palavras, marca.legendaCorrige) };
        }
        const g = await gerarVoz({ texto: tb, saida: arquivo, voz: alias, pronuncia: marca.pronuncia, log, semFailover, config });
        const al = await alinhar({ audio: arquivo, alinhador: alinhador || v.alinhador || "scribe", roteiro: tb, correcoes: marca.legendaCorrige, config });
        return { duracao: g.duracao, palavras: al.palavras };
      },
    });
    if (estimado) writeFileSync(marcador, "voz estimada: gere a final antes de publicar (praeko studio voz <slug> --qualidade final)\n"); else if (existsSync(marcador)) unlinkSync(marcador);
    writeFileSync(join(pasta, "palavras.json"), JSON.stringify(r.palavras));
    writeFileSync(join(pasta, "palavras.ts"), `import { Palavra } from "@praeko/studio-core";\n\nexport const ${nomeConstante}: Palavra[] = ${JSON.stringify(r.palavras)};\n`);
    writeFileSync(join(pasta, "blocos.json"), JSON.stringify(r.blocos, null, 2) + "\n");
    return { duracao: r.duracao, palavras: r.palavras.length, eventos: [], conta: estimado ? "-" : "blocos", provedor: v.provedor, voz: v.apelido, corrigidas: [], estimada: estimado, blocos: r.blocos.length, regerados: r.regerados, reaproveitados: r.reaproveitados };
  }
  if (v.provedor === "estimado") {
    // rascunho mudo: tempos estimados do roteiro e áudio em silêncio; serve para montar e conferir cenas
    const falado = aplicarPronuncia(texto.trim(), marca.pronuncia);
    const est = estimarPalavras(falado, { wpm: v.palavrasPorMin });
    const palavras = aplicarCorrecoes(est.palavras, marca.legendaCorrige);
    audioMudo(join(pasta, "voz.mp3"), est.duracao);
    writeFileSync(marcador, "voz estimada: gere a final antes de publicar (praeko studio voz <slug> --qualidade final)\n");
    writeFileSync(join(pasta, "palavras.json"), JSON.stringify(palavras));
    writeFileSync(join(pasta, "palavras.ts"), `import { Palavra } from "@praeko/studio-core";\n\nexport const ${nomeConstante}: Palavra[] = ${JSON.stringify(palavras)};\n`);
    return { duracao: est.duracao, palavras: palavras.length, eventos: [], conta: "-", provedor: "estimado", voz: v.apelido, corrigidas: [], estimada: true };
  }
  if (existsSync(marcador)) unlinkSync(marcador);
  const g = await gerarVoz({ texto, saida: join(pasta, "voz.mp3"), voz: alias, pronuncia: marca.pronuncia, log, semFailover, config });
  const al = await alinhar({ audio: g.arquivo, alinhador: alinhador || v.alinhador || "scribe", roteiro: texto, correcoes: marca.legendaCorrige, config });
  writeFileSync(join(pasta, "palavras.json"), JSON.stringify(al.palavras));
  writeFileSync(join(pasta, "palavras.ts"), `import { Palavra } from "@praeko/studio-core";\n\nexport const ${nomeConstante}: Palavra[] = ${JSON.stringify(al.palavras)};\n`);
  return { duracao: g.duracao, palavras: al.palavras.length, eventos: al.eventos, conta: g.conta, provedor: g.provedor, voz: v.apelido, corrigidas: al.corrigidas };
}

import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, basename } from "node:path";
import { createHash } from "node:crypto";
import { juntarAudios, narrar, narrarTrecho } from "@praeko/studio-voz";
import { pacote, validar } from "@praeko/studio-publicar";
import { checarEpisodio, folha } from "@praeko/studio-revisar";
import { acharProjeto, episodio, pascal } from "./projeto.mjs";
import * as M from "./modelos.mjs";
import { compilarEpisodio } from "./compilar.mjs";
import { cortarAudio, fatiar, lerJson, resolverPonto } from "./corte.mjs";
import { avisosHF, motorDe, preverHF, renderHF } from "./motor.mjs";

import { AQUI, RAIZ_PACOTE, VERSAO } from "./versao.mjs";
import { avisoCurto, avisoTexto, idioma } from "./licencas.mjs";
import { detectar, instalarSkill } from "./skill.mjs";
// Subcomandos de voz (saldo, vozes, conta, config) são scripts próprios: em desenvolvimento ficam em packages/voz/bin; no pacote publicado, em dist/voz-<nome>.mjs (um bundle por script).
const VOZ_BIN = (n) => { const empacotado = join(AQUI, "voz-" + n); return existsSync(empacotado) ? empacotado : join(AQUI, "..", "..", "voz", "bin", n); };
const flag = (a, k) => { const i = a.indexOf("--" + k); return i >= 0 ? a[i + 1] : undefined; };
const tem = (a, k) => a.includes("--" + k);
const publicDir = (p) => resolve(p.raiz, p.marca.publico || "public");
const escreve = (arq, txt) => { mkdirSync(dirname(arq), { recursive: true }); writeFileSync(arq, txt); };
const rodar = (cmd, args, cwd) => new Promise((ok) => { const c = spawn(cmd, args, { cwd, stdio: "inherit", shell: false }); c.on("error", (e) => { console.error(`erro ao rodar ${cmd}: ${e.message}`); ok(1); }); c.on("exit", (code) => ok(code ?? 1)); });
/** Roda o Remotion do projeto direto pelo Node (sem npx nem .cmd: vale igual no macOS, Linux e Windows). */
const rodarRemotion = (p, args) => {
  let cli;
  try { cli = join(dirname(createRequire(join(p.raiz, "package.json")).resolve("@remotion/cli/package.json")), "remotion-cli.js"); }
  catch { throw new Error("o @remotion/cli não está instalado neste projeto: rode `npm install` na pasta do projeto (ou crie com `praeko studio init`)"); }
  return rodar(process.execPath, [cli, ...args], p.raiz);
};
/** `npm` sem shell: no Windows, o npm-cli.js que acompanha o Node; nos outros, o `npm` do PATH. */
const npmInstalar = (cwd) => process.platform === "win32" ? rodar(process.execPath, [join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"), "install", "--loglevel=error"], cwd) : rodar("npm", ["install", "--loglevel=error"], cwd);
const icone = { ok: "✓", aviso: "⚠", erro: "✗" };

export async function init(a) {
  const uso = 'uso: praeko studio init <pasta> [--nome "Meu Canal"] [--handle @meucanal] [--agent claude,codex|all] [--lang pt|en] [--dev <caminho do repositório do Studio>] [--sem-instalar]';
  if (!a[0] || a[0].startsWith("--")) throw new Error(uso);
  const pasta = resolve(a[0]);
  if (existsSync(pasta) && readdirSync(pasta).length) throw new Error(`${pasta} já existe e não está vazia`);
  const nome = flag(a, "nome") || basename(pasta), handle = flag(a, "handle") || "@" + (nome.toLowerCase().replace(/[^a-z0-9]+/g, "") || "meucanal");
  const dev = flag(a, "dev") ? resolve(flag(a, "dev")) : null;
  if (dev && !existsSync(join(dev, "packages", "core", "package.json"))) throw new Error(`--dev ${dev}: não achei packages/core (aponte para a pasta studio/ do repositório do Praeko)`);
  const slugNome = nome.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "meu-canal";
  escreve(join(pasta, "package.json"), M.pacoteProjeto({ nome: slugNome, dev: dev ? relative(pasta, dev).split("\\").join("/") : null, versaoStudio: VERSAO }));
  escreve(join(pasta, "marca.json"), M.marcaInicial({ nome, handle }));
  escreve(join(pasta, "remotion.config.ts"), dev ? M.remotionConfigDev : M.remotionConfigBase);
  escreve(join(pasta, "tsconfig.json"), M.tsconfig);
  escreve(join(pasta, "src", "index.ts"), M.indexTs);
  escreve(join(pasta, "src", "marca.ts"), M.marcaTs);
  escreve(join(pasta, "src", "Root.tsx"), M.rootTsx);
  escreve(join(pasta, ".gitignore"), "node_modules/\nout/\n.hf/\n.praeko-studio/\n.env\n.env.*\n.DS_Store\n");
  escreve(join(pasta, "README.md"), `# ${nome}\n\nProjeto de vídeo do Praeko Studio. Primeiro vídeo: \`npx praeko-studio novo meu-primeiro\` (ou \`praeko studio novo meu-primeiro\`). Confira o ambiente com \`praeko studio doctor\`.\n`);
  cpSync(join(RAIZ_PACOTE, "modelos", "sfx"), join(pasta, "public", "sfx"), { recursive: true });
  mkdirSync(join(pasta, "public", "capa"), { recursive: true });
  copyFileSync(join(RAIZ_PACOTE, "modelos", "avatar.png"), join(pasta, "public", "capa", "avatar.png"));
  mkdirSync(join(pasta, "episodios"), { recursive: true });
  const ag = flag(a, "agent"), agentes = ag ? (ag === "all" ? "all" : ag.split(",").map((x) => x.trim())) : (detectar(pasta).length ? detectar(pasta) : ["claude", "codex"]);
  const feitos = instalarSkill({ dir: pasta, agentes, lang: flag(a, "lang") || idioma() });
  console.log(`projeto criado em ${pasta}${dev ? " (modo --dev: pacotes por caminho local)" : ""}`);
  for (const f of feitos) console.log(`  instruções para ${f.agente}: ${f.arquivo}`);
  console.log("\n" + avisoTexto());
  if (!tem(a, "sem-instalar")) { const c = await npmInstalar(pasta); if (c) throw new Error("npm install falhou"); }
  console.log(`\npróximo passo: cd ${pasta} && npx praeko-studio novo meu-primeiro --titulo "Meu primeiro vídeo"`);
}

export function novo(a) {
  const proj = acharProjeto(), slug = a[0];
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error("uso: praeko studio novo <slug-em-minusculas-com-hifen> [--titulo \"Título do vídeo\"]");
  const pasta = join(proj.raiz, "episodios", slug);
  if (existsSync(pasta)) throw new Error(`${pasta} já existe`);
  const id = pascal(slug), capa = `Capa${id}`, titulo = flag(a, "titulo") || slug.replace(/-/g, " ");
  const palavras = titulo.toUpperCase().split(/\s+/).filter(Boolean), tam = Math.ceil(palavras.length / Math.min(3, palavras.length));
  const tri = [];
  for (let i = 0; i < palavras.length; i += tam) tri.push(palavras.slice(i, i + tam).join(" "));
  const longo = tem(a, "longo");
  escreve(join(pasta, "roteiro.txt"), longo ? M.roteiroLongo : M.roteiroInicial);
  escreve(join(pasta, "publicacao.json"), M.publicacaoInicial({ titulo }));
  escreve(join(pasta, "episodio.json"), JSON.stringify({ id, capa, titulo }, null, 2) + "\n");
  escreve(join(pasta, "palavras.ts"), `import { Palavra } from "@praeko/studio-core";\n\nexport const PALAVRAS: Palavra[] = [];\n`);
  if (longo) {
    escreve(join(pasta, "episodio.yaml"), M.longoYaml({ id, titulo }));
    escreve(join(pasta, "cenas.tsx"), M.cenasLongoTsx);
    escreve(join(pasta, "episodio.tsx"), M.longoTsx({ id, slug }));
  } else {
    escreve(join(pasta, "episodio.yaml"), M.episodioYaml({ id, capa, titulo }));
    escreve(join(pasta, "cenas.tsx"), M.cenasTsx({ capa, linhas: tri }));
    escreve(join(pasta, "episodio.tsx"), M.episodioTsx({ id, slug }));
  }
  const r0 = compilarEpisodio(pasta);
  if (r0.erros.length) throw new Error("o episódio inicial não compilou: " + r0.erros.join("; "));
  // registra no Root.tsx (entre os comentários "praeko-studio:")
  const root = join(proj.raiz, "src", "Root.tsx");
  let s = readFileSync(root, "utf8");
  const m = ["praeko-studio", "bardo"].find((x) => s.includes(`// ${x}:/imports`) && s.includes(`{/* ${x}:/composicoes */}`)); // "bardo:" é o marcador dos projetos criados antes do rename
  if (!m) throw new Error("src/Root.tsx sem os marcadores `praeko-studio:imports` e `praeko-studio:composicoes`: registre o episódio à mão");
  s = s.replace(`// ${m}:/imports`, `import { ${id}Composition } from "../episodios/${slug}/episodio";
// ${m}:/imports`).replace(`{/* ${m}:/composicoes */}`, `<${id}Composition />
    {/* ${m}:/composicoes */}`);
  writeFileSync(root, s);
  console.log(`episódio criado: episodios/${slug}/ (id ${id}). Próximo: escreva roteiro.txt e rode \`praeko studio voz ${slug} --qualidade rascunho\``);
}

export async function voz(a) {
  const sub = a[0];
  if (["saldo", "vozes", "conta", "config"].includes(sub)) {
    const bin = { saldo: "saldo.mjs", vozes: "vozes.mjs", conta: "conta.mjs", config: "config.mjs" }[sub];
    return rodar(process.execPath, [VOZ_BIN(bin), ...a.slice(1)], process.cwd());
  }
  const proj = acharProjeto(), ep = episodio(proj, sub);
  if (existsSync(join(ep.pasta, "corte.json"))) throw new Error(`"${sub}" é um corte derivado de um longo: a voz vem de lá. Gere a voz do longo e rode \`praeko studio corte ${sub} --refazer\``);
  const r = await narrar({ pasta: ep.pasta, marca: proj.marca, nomeConstante: "PALAVRAS", log: (m) => console.error(m), semFailover: tem(a, "sem-failover"), voz: flag(a, "voz"), qualidade: flag(a, "qualidade"), alinhador: flag(a, "alinhador") });
  const destino = join(publicDir(proj), "audio", `${ep.id}.mp3`);
  mkdirSync(dirname(destino), { recursive: true });
  copyFileSync(join(ep.pasta, "voz.mp3"), destino);
  if (r.corrigidas?.length) console.log("legenda corrigida pelo roteiro:", r.corrigidas.map(([x, y]) => `${x}→${y}`).join(", "));
  if (r.blocos) console.log(`longo em ${r.blocos} blocos: ${r.regerados} gerado(s), ${r.reaproveitados} reaproveitado(s) do cache · ${r.duracao.toFixed(1)} s · ${r.palavras} palavras · inícios dos blocos em episodios/${ep.slug}/blocos.json`);
  if (r.estimada) console.log(`voz ESTIMADA (sem fala, ~190 palavras/min) · ${r.duracao.toFixed(1)} s · ${r.palavras} palavras → ${relative(proj.raiz, destino)}\n⚠ serve para montar e conferir cenas; os tempos mudam com a voz final (rode \`praeko studio compilar\` de novo). Âncoras com número: o roteiro diz por extenso, a voz real devolve dígitos.`);
  else if (!r.blocos) console.log(`voz ${r.voz} (${r.provedor}, ${r.conta}) · ${r.duracao.toFixed(1)} s · ${r.palavras} palavras → ${relative(proj.raiz, destino)}`);
}

/**
 * `praeko studio corte <longo> <novo-slug> --de <ref> --ate <ref> [--abertura "frase de gancho" [--qualidade rascunho|final|local]] [--titulo "T"]`
 * Short vertical fatiado da voz do longo (sem gastar voz). `ref`: segundos, "bloco:N" ou "frase".
 * `--abertura` gera voz só para essa frase (entra antes do trecho). `praeko studio corte <slug> --refazer` refatia depois que a voz do longo mudou
 * (aceita `--abertura "novo texto"` e `--sem-abertura`). `praeko studio corte <slug> --soltar` apaga a ligação com o longo: vira um Short comum.
 */
export async function corte(a) {
  const proj = acharProjeto();
  const refazer = tem(a, "refazer"), soltar = tem(a, "soltar");
  const slug = refazer || soltar ? a[0] : a[1];
  const uso = 'uso: praeko studio corte <longo> <novo-slug> --de <segundos|bloco:N|"frase"> --ate <…> [--abertura "gancho"] [--titulo "T"]  |  praeko studio corte <slug> --refazer [--abertura "…"|--sem-abertura]  |  praeko studio corte <slug> --soltar';
  if (!slug || (!refazer && !soltar && !a[0])) throw new Error(uso);
  const arqCorte = join(proj.raiz, "episodios", slug, "corte.json");
  if (soltar) {
    if (!existsSync(arqCorte)) throw new Error(`"${slug}" não tem corte.json (não é um corte derivado)`);
    unlinkSync(arqCorte);
    console.log(`"${slug}" solto do longo: agora é um Short comum. O áudio e o roteiro ficam como estão; edite o roteiro.txt e rode \`praeko studio voz ${slug} --qualidade final\` para uma voz nova de ponta a ponta.`);
    return 0;
  }
  let cfg;
  if (refazer) { cfg = lerJson(arqCorte); if (!cfg) throw new Error(`"${slug}" não tem corte.json (não é um corte derivado)`); }
  else cfg = { longo: a[0], de: flag(a, "de"), ate: flag(a, "ate") };
  if (flag(a, "abertura")) cfg.abertura = { texto: flag(a, "abertura"), qualidade: flag(a, "qualidade") || cfg.abertura?.qualidade || "rascunho" };
  if (tem(a, "sem-abertura")) delete cfg.abertura;
  if (cfg.de === undefined || cfg.ate === undefined) throw new Error("faltam --de e --ate");
  const lg = episodio(proj, cfg.longo);
  const palavras = lerJson(join(lg.pasta, "palavras.json"), []), blocos = lerJson(join(lg.pasta, "blocos.json"), []);
  if (!palavras.length || !existsSync(join(lg.pasta, "voz.mp3"))) throw new Error(`o longo "${cfg.longo}" ainda não tem voz: rode \`praeko studio voz ${cfg.longo} --qualidade rascunho\``);
  const t0 = resolverPonto(cfg.de, "de", { palavras, blocos }), t1 = resolverPonto(cfg.ate, "ate", { palavras, blocos });
  if (t1 - t0 < 5) throw new Error(`trecho de ${(t1 - t0).toFixed(1)} s é curto demais (de ${t0.toFixed(2)} a ${t1.toFixed(2)}); mínimo 5 s`);
  const f = fatiar(palavras, t0, t1);
  if (f.duracao > 180) throw new Error(`trecho de ${f.duracao.toFixed(0)} s: escolha um trecho menor`);
  if (!refazer) novo([slug, "--titulo", flag(a, "titulo") || slug.replace(/-/g, " ")]);
  const ep = episodio(proj, slug);
  // áudio: [abertura própria] + trecho do longo
  const trecho = join(ep.pasta, "voz-trecho.mp3");
  cortarAudio(join(lg.pasta, "voz.mp3"), trecho, f.ini, f.fim);
  let pal = f.palavras, total = f.duracao, estimada = existsSync(join(lg.pasta, "voz.estimada")), roteiro = f.palavras.map((p) => p.t).join(" ");
  if (cfg.abertura) {
    const alias = cfg.abertura.qualidade, chave = createHash("sha1").update(`${cfg.abertura.texto}|${alias}|${JSON.stringify(proj.marca.pronuncia ?? {})}`).digest("hex").slice(0, 10);
    const base = join(ep.pasta, "voz-abertura", chave);
    mkdirSync(dirname(base), { recursive: true });
    if (!existsSync(base + ".mp3") || !existsSync(base + ".json")) {
      console.log(`abertura: gerando voz (${alias}) para "${cfg.abertura.texto}"`);
      const r = await narrarTrecho({ texto: cfg.abertura.texto, arquivo: base + ".mp3", marca: proj.marca, qualidade: alias, log: (m) => console.error(m) });
      writeFileSync(base + ".json", JSON.stringify({ duracao: r.duracao, palavras: r.palavras, estimada: r.estimada }));
    } else console.log("abertura: reaproveitada do cache");
    const ab = JSON.parse(readFileSync(base + ".json", "utf8")), GAP = 0.25, desloca = ab.duracao + GAP;
    juntarAudios([base + ".mp3", trecho], join(ep.pasta, "voz.mp3"), GAP);
    pal = [...ab.palavras, ...f.palavras.map((p) => ({ ...p, a: +(p.a + desloca).toFixed(2), b: +(p.b + desloca).toFixed(2) }))];
    total = +(desloca + f.duracao).toFixed(2);
    roteiro = cfg.abertura.texto + "\n" + roteiro;
    estimada = estimada || ab.estimada;
  } else copyFileSync(trecho, join(ep.pasta, "voz.mp3"));
  unlinkSync(trecho);
  escreve(join(ep.pasta, "roteiro.txt"), roteiro + "\n");
  escreve(join(ep.pasta, "palavras.json"), JSON.stringify(pal));
  escreve(join(ep.pasta, "palavras.ts"), `import { Palavra } from "@praeko/studio-core";\n\nexport const PALAVRAS: Palavra[] = ${JSON.stringify(pal)};\n`);
  escreve(arqCorte, JSON.stringify(cfg, null, 2) + "\n");
  const destino = join(publicDir(proj), "audio", `${ep.id}.mp3`);
  mkdirSync(dirname(destino), { recursive: true });
  copyFileSync(join(ep.pasta, "voz.mp3"), destino);
  if (estimada) escreve(join(ep.pasta, "voz.estimada"), "voz estimada: gere a final (no longo, e `praeko studio corte " + slug + " --refazer`; a abertura com --qualidade final) antes de publicar\n");
  else if (existsSync(join(ep.pasta, "voz.estimada"))) unlinkSync(join(ep.pasta, "voz.estimada"));
  if (!refazer) { // ajusta o YAML inicial à duração e o pacote ao "vídeo completo"
    const y = join(ep.pasta, "episodio.yaml");
    let t = readFileSync(y, "utf8");
    t = t.replace(/^duracao: .*$/m, "duracao: { voz: 2.5 }          # 2,5 s depois do fim da voz (acompanha a voz)").replace(/^fechamento: .*$/m, "fechamento: { inicio: { voz: -2 }, cta: VÍDEO COMPLETO NO YOUTUBE }");
    writeFileSync(y, t);
    const pj = join(ep.pasta, "publicacao.json"), meta = JSON.parse(readFileSync(pj, "utf8"));
    meta.videoCompleto = "[LINK_DO_LONGO]"; meta.antesDePublicar = ["Assistir com som.", "Preencher [LINK_DO_LONGO] (só publicar depois do longo)."];
    writeFileSync(pj, JSON.stringify(meta, null, 2) + "\n");
  }
  const r = compilarEpisodio(ep.pasta);
  console.log(`corte "${slug}": ${total.toFixed(1)} s (${t0.toFixed(2)}–${t1.toFixed(2)} do longo "${cfg.longo}"${cfg.abertura ? " + abertura própria" : ""}), ${pal.length} palavras${refazer ? " (refeito)" : ""}`);
  r.avisos.forEach((x) => console.log(`${icone.aviso} ${x}`)); r.erros.forEach((x) => console.log(`${icone.erro} ${x}`));
  if (!refazer) console.log(`próximo: escreva as cenas em episodios/${slug}/episodio.yaml (\`inicio\` e \`quando\` aceitam frases deste trecho) e rode \`praeko studio render ${slug}\``);
  return r.erros.length ? 1 : 0;
}

/** Compila episodio.yaml se existir (render, capa e checar chamam isto antes). Devolve 1 se houver erros. */
function compilaSeHouver(ep) {
  if (!existsSync(join(ep.pasta, "episodio.yaml"))) return 0;
  const r = compilarEpisodio(ep.pasta);
  r.avisos.forEach((x) => console.log(`${icone.aviso} ${x}`)); r.erros.forEach((x) => console.log(`${icone.erro} ${x}`));
  return r.erros.length ? 1 : 0;
}
export function compilar(a) {
  const p = acharProjeto(), ep = episodio(p, a[0]);
  const r = compilarEpisodio(ep.pasta);
  if (!r.erros.length && motorDe(p, ep, flag(a, "motor")) === "hyperframes") r.avisos.push(...avisosHF(ep));
  r.avisos.forEach((x) => console.log(`${icone.aviso} ${x}`)); r.erros.forEach((x) => console.log(`${icone.erro} ${x}`));
  if (!r.erros.length) console.log(`${icone.ok} episodios/${ep.slug}/episodio.spec.json (${r.spec.cenas.length} cenas)`);
  console.log(`\n${r.erros.length} erro(s), ${r.avisos.length} aviso(s)`);
  return r.erros.length ? 1 : 0;
}
export function prever(a = []) {
  const p = acharProjeto(), slug = a.find((x) => !x.startsWith("--") && x !== flag(a, "motor"));
  if (slug && motorDe(p, episodio(p, slug), flag(a, "motor")) === "hyperframes") return compilaSeHouver(episodio(p, slug)) || preverHF(p, episodio(p, slug));
  return rodarRemotion(p, ["studio", "src/index.ts"]);
}
export async function render(a) {
  avisoCurto();
  const p = acharProjeto(), ep = episodio(p, a[0]), esc = flag(a, "escala");
  if (compilaSeHouver(ep)) return 1;
  if (motorDe(p, ep, flag(a, "motor")) === "hyperframes") return renderHF(p, ep);
  mkdirSync(join(p.raiz, "out"), { recursive: true });
  const c = await rodarRemotion(p, ["render", "src/index.ts", ep.id, ep.mp4, ...(esc ? ["--scale", esc] : [])]);
  if (!c) console.log(`renderizado: ${relative(process.cwd(), ep.mp4)}`);
  return c;
}
export async function capa(a) {
  const p = acharProjeto(), ep = episodio(p, a[0]);
  if (compilaSeHouver(ep)) return 1;
  mkdirSync(join(p.raiz, "out"), { recursive: true });
  const specArq = join(ep.pasta, "episodio.spec.json");
  const spec = existsSync(specArq) ? JSON.parse(readFileSync(specArq, "utf8")) : null;
  if (spec && !spec.fechamento && spec.capa) { // longo: capa 16:9 (YouTube) e vertical (Instagram)
    const a = join(p.raiz, "out", `${ep.slug}-capa-1280x720.png`), v = join(p.raiz, "out", `${ep.slug}-capa-vertical-1080x1920.png`);
    const c1 = await rodarRemotion(p, ["still", "src/index.ts", spec.capa.id, a]);
    const c2 = c1 ? c1 : await rodarRemotion(p, ["still", "src/index.ts", `${spec.capa.id}Vertical`, v]);
    if (!c2) console.log(`capas: ${relative(process.cwd(), a)} · ${relative(process.cwd(), v)}`);
    return c2;
  }
  const c = await rodarRemotion(p, ["still", "src/index.ts", ep.capa, ep.png]);
  if (!c) console.log(`capa: ${relative(process.cwd(), ep.png)}`);
  return c;
}
export function folhaCmd(a) {
  const p = acharProjeto(), alvo = a[0];
  const video = existsSync(alvo || "") ? resolve(alvo) : episodio(p, alvo).mp4;
  const saida = join(p.raiz, "out", `${(alvo || "").split("/").pop().replace(/\.mp4$/, "")}-folha.png`);
  const r = folha({ video, saida, n: +(flag(a, "n") || 12), colunas: +(flag(a, "colunas") || 6) });
  console.log(`mosaico de ${r.n} quadros: ${relative(process.cwd(), r.saida)}`);
}
export function checar(a) {
  const p = acharProjeto(), ep = episodio(p, a[0]);
  const estimada = existsSync(join(ep.pasta, "voz.estimada")) ? [{ nivel: "aviso", msg: "a voz é ESTIMADA (rascunho mudo): gere a final antes de publicar (praeko studio voz " + ep.slug + " --qualidade final)" }] : [];
  const extra = existsSync(join(ep.pasta, "episodio.yaml")) ? compilarEpisodio(ep.pasta, { gravar: false }) : null;
  const res = [...estimada, ...(extra ? [...extra.erros.map((msg) => ({ nivel: "erro", msg })), ...extra.avisos.map((msg) => ({ nivel: "aviso", msg }))] : []), ...checarEpisodio({ pasta: ep.pasta, marca: p.marca, video: existsSync(ep.mp4) ? ep.mp4 : undefined })];
  for (const x of res) console.log(`${icone[x.nivel]} ${x.msg}`);
  const erros = res.filter((x) => x.nivel === "erro").length, avisos = res.filter((x) => x.nivel === "aviso").length;
  console.log(`\n${erros} erro(s), ${avisos} aviso(s)`);
  return erros ? 1 : 0;
}
export function pacoteCmd(a) {
  const p = acharProjeto(), ep = episodio(p, a[0]);
  const meta = JSON.parse(readFileSync(join(ep.pasta, "publicacao.json"), "utf8"));
  const specArq = join(ep.pasta, "episodio.spec.json");
  if (meta.formato === "longo" && !meta.capitulos && existsSync(specArq)) { // capítulos = cenas do longo (título em minúsculas, primeira maiúscula)
    const spec = JSON.parse(readFileSync(specArq, "utf8"));
    meta.capitulos = spec.cenas.map((c) => ({ t: c.inicio, titulo: c.titulo.charAt(0) + c.titulo.slice(1).toLowerCase() }));
  }
  const v = validar({ marca: p.marca, ep: meta });
  const saida = join(ep.pasta, "textos.md");
  writeFileSync(saida, pacote({ marca: p.marca, ep: meta }));
  console.log(`escrito ${relative(process.cwd(), saida)}; ${v.erros.length} erro(s), ${v.avisos.length} aviso(s)`);
  v.erros.forEach((e) => console.log("  ✗", e)); v.avisos.forEach((e) => console.log("  ⚠", e));
  return v.erros.length ? 1 : 0;
}

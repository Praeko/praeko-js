// Narração em BLOCOS (longos): o roteiro tem cabeçalhos `## 1 · O GANCHO`; cada bloco vira um áudio, com cache por conteúdo
// (editar um bloco só regera esse bloco), e todos são juntados com uma pausa. Os tempos de cada bloco são deslocados para o vídeo inteiro.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** `## título` abre um bloco. Texto antes do primeiro cabeçalho (se houver) é ignorado. Devolve `[]` se não há cabeçalhos. */
export function lerBlocos(roteiro) {
  const blocos = [];
  let atual = null;
  for (const linha of roteiro.split("\n")) {
    const m = linha.match(/^##\s+(.*)$/);
    if (m) { atual = { titulo: m[1].trim(), linhas: [] }; blocos.push(atual); continue; }
    if (atual) atual.linhas.push(linha);
  }
  return blocos.map((b, i) => ({ n: i + 1, titulo: b.titulo, texto: b.linhas.join("\n").trim() })).filter((b) => b.texto);
}

export const hashBloco = (texto, chave) => createHash("sha1").update(chave + "\n" + texto).digest("hex").slice(0, 10);

/** Junta mp3s com `gap` s de silêncio entre eles (mono, 44,1 kHz). */
export function juntarAudios(arquivos, saida, gap = 0.6) {
  const entradas = [];
  const filtros = [];
  const rotulos = [];
  arquivos.forEach((a, i) => {
    entradas.push("-i", a);
    filtros.push(`[${i}:a]aresample=44100,aformat=channel_layouts=mono[a${i}]`);
    rotulos.push(`[a${i}]`);
    if (i < arquivos.length - 1 && gap > 0) { filtros.push(`anullsrc=r=44100:cl=mono,atrim=0:${gap}[g${i}]`); rotulos.push(`[g${i}]`); }
  });
  filtros.push(`${rotulos.join("")}concat=n=${rotulos.length}:v=0:a=1[out]`);
  execFileSync("ffmpeg", ["-v", "error", "-y", ...entradas, "-filter_complex", filtros.join(";"), "-map", "[out]", "-ar", "44100", "-q:a", "2", saida]);
}

/**
 * Gera um bloco por vez. `gerarBloco({ texto, arquivo })` deve escrever o áudio e devolver `{ duracao, palavras }` (tempos locais ao bloco).
 * Devolve `{ palavras (do vídeo todo), blocos: [{n, titulo, a, b}], duracao, regerados, reaproveitados }`.
 */
export async function narrarBlocos({ pasta, roteiro, chave, gerarBloco, gap = 0.6, log = () => {} }) {
  const blocos = lerBlocos(roteiro);
  if (!blocos.length) throw new Error("roteiro sem blocos: abra cada bloco com uma linha `## título`");
  const dir = join(pasta, "voz-blocos");
  mkdirSync(dir, { recursive: true });
  const partes = [];
  let regerados = 0, reaproveitados = 0;
  for (const b of blocos) {
    const base = join(dir, `${String(b.n).padStart(2, "0")}-${hashBloco(b.texto, chave)}`);
    if (existsSync(base + ".mp3") && existsSync(base + ".json")) { reaproveitados++; log(`[bloco ${b.n}] ${b.titulo}: reaproveitado`); }
    else {
      log(`[bloco ${b.n}] ${b.titulo}: gerando…`);
      const r = await gerarBloco({ texto: b.texto, arquivo: base + ".mp3", n: b.n });
      writeFileSync(base + ".json", JSON.stringify({ duracao: r.duracao, palavras: r.palavras }));
      regerados++;
    }
    partes.push({ ...b, arquivo: base + ".mp3", ...JSON.parse(readFileSync(base + ".json", "utf8")) });
  }
  juntarAudios(partes.map((p) => p.arquivo), join(pasta, "voz.mp3"), gap);
  let t = 0, palavras = [];
  const mapa = [];
  partes.forEach((p, i) => {
    const a = +t.toFixed(2);
    palavras = palavras.concat(p.palavras.map((w) => ({ ...w, a: +(w.a + t).toFixed(2), b: +(w.b + t).toFixed(2) })));
    t += p.duracao;
    mapa.push({ n: p.n, titulo: p.titulo, a, b: +t.toFixed(2) });
    if (i < partes.length - 1) t += gap;
  });
  return { palavras, blocos: mapa, duracao: +t.toFixed(2), regerados, reaproveitados };
}

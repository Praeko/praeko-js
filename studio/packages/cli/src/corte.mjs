// Cortes derivados: um Short vertical fatiado da VOZ de um longo (sem gerar voz de novo). Funções puras + ffmpeg.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/** Acha o índice da 1ª palavra de uma frase (comparando sem acento nem pontuação). -1 se não achar. */
export function acharFrase(palavras, frase, nth = 0) {
  const f = String(frase).split(/\s+/).map(norm).filter(Boolean), W = palavras.map((p) => norm(p.t));
  let c = 0;
  for (let k = 0; k <= W.length - f.length; k++) if (f.every((w, j) => W[k + j] === w)) { if (c === nth) return k; c++; }
  return -1;
}

/**
 * `ref`: número (s) · "bloco:N" · "frase". `ponta` "de" = início (de uma frase: quando ela começa; de um bloco: início do bloco);
 * "ate" = fim (de uma frase: quando a última palavra termina; de um bloco: fim do bloco).
 */
export function resolverPonto(ref, ponta, { palavras, blocos }) {
  if (typeof ref === "number") return ref;
  const s = String(ref).trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return +s;
  const b = s.match(/^bloco:(\d+)$/);
  if (b) {
    const x = blocos?.[+b[1] - 1];
    if (!x) throw new Error(`bloco ${b[1]} não existe (blocos.json tem ${blocos?.length ?? 0}; rode \`praeko studio voz\` no longo)`);
    return ponta === "de" ? x.a : x.b;
  }
  const i = acharFrase(palavras, s);
  if (i < 0) throw new Error(`frase "${s}" não aparece na voz do longo`);
  if (ponta === "de") return palavras[i].a;
  const n = s.split(/\s+/).filter(Boolean).length;
  return +palavras[i + n - 1].b.toFixed(2);
}

/** Fatia as palavras entre t0 e t1 e re-ancora em 0 (com `pad` s de respiro antes da primeira). */
export function fatiar(palavras, t0, t1, { pad = 0.2, cauda = 0.3 } = {}) {
  const ini = Math.max(0, t0 - pad), fim = t1 + cauda;
  const eps = 0.03;
  const sel = palavras.filter((p) => p.a >= t0 - eps && p.b <= t1 + eps).map((p) => ({ ...p, a: +(p.a - ini).toFixed(2), b: +(p.b - ini).toFixed(2) }));
  return { palavras: sel, ini, fim, duracao: +(fim - ini).toFixed(2) };
}

/** Corta o áudio [ini, fim] com fade curto nas pontas (re-codifica para ficar exato). */
export function cortarAudio(entrada, saida, ini, fim) {
  const d = fim - ini;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(ini), "-t", String(d), "-i", entrada, "-af", `afade=t=in:d=0.03,afade=t=out:st=${Math.max(0, d - 0.06).toFixed(2)}:d=0.06`, "-ar", "44100", "-q:a", "2", saida]);
}

export const lerJson = (arq, padrao) => (existsSync(arq) ? JSON.parse(readFileSync(arq, "utf8")) : padrao);
export { join };

// Voz "estimada": sem TTS e sem áudio de fala. Estima o tempo de cada palavra do roteiro (~190 palavras/min) e gera um mp3 mudo,
// só para montar e conferir cenas. Grátis, instantâneo e não depende de nada rodando. NÃO serve para ouvir ritmo nem para publicar.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const PAUSAS = { final: 0.38, virgula: 0.16, dois: 0.2, tag: 0.45 };

/** Tira as tags de entonação ([curious]) mas guarda onde havia `[short pause]`. */
function tokens(texto) {
  const out = [];
  for (const m of texto.matchAll(/\[([^\]]*)\]|(\S+)/g)) {
    if (m[1] !== undefined) { if (/pause/i.test(m[1]) && out.length) out[out.length - 1].pausa += PAUSAS.tag; continue; }
    out.push({ t: m[2], pausa: 0 });
  }
  return out;
}

/** `[{t, a, b}]` com tempos estimados. `wpm` = palavras por minuto de fala corrida (sem contar pausas). */
export function estimarPalavras(texto, { wpm = 190, inicio = 0.3 } = {}) {
  const toks = tokens(texto);
  if (!toks.length) return { palavras: [], duracao: 0 };
  const medio = 60 / wpm, mediaLetras = toks.reduce((a, k) => a + k.t.replace(/[^\p{L}\p{N}]/gu, "").length, 0) / toks.length || 1;
  let t = inicio;
  const palavras = toks.map((k) => {
    const letras = k.t.replace(/[^\p{L}\p{N}]/gu, "").length || 1;
    const dur = Math.min(0.9, Math.max(0.14, medio * (0.4 + 0.6 * (letras / mediaLetras))));
    const a = +t.toFixed(2), b = +(t + dur).toFixed(2);
    t = b + k.pausa + (/[.!?…]["”)]*$/.test(k.t) ? PAUSAS.final : /[,;]["”)]*$/.test(k.t) ? PAUSAS.virgula : /:["”)]*$/.test(k.t) ? PAUSAS.dois : 0);
    return { t: k.t, a, b };
  });
  return { palavras, duracao: +(t + 0.2).toFixed(2) };
}

/** mp3 mudo de `segundos`. */
export function audioMudo(saida, segundos) {
  mkdirSync(dirname(saida), { recursive: true });
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", String(segundos), "-q:a", "9", saida]);
}

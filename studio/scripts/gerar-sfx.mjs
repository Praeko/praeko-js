// Sintetiza os efeitos sonoros do modelo de projeto (pop, ding, thump, whoosh) do zero: ondas senoidais e ruído pseudoaleatório determinístico.
// Os arquivos são criação do Praeko Studio (MIT, como o resto do código), sem amostras de terceiros. Uso: node scripts/gerar-sfx.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44100, saida = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "cli", "modelos", "sfx");
const gerar = (dur, f) => Float64Array.from({ length: Math.round(dur * SR) }, (_, i) => f(i / SR, i));
let seed = 1234567;
const ruido = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 31 - 1; };
const sons = {
  ding: gerar(0.9, (t) => Math.exp(-4.5 * t) * (0.55 * Math.sin(2 * Math.PI * 1318.5 * t) + 0.3 * Math.sin(2 * Math.PI * 1975.5 * t) + 0.15 * Math.sin(2 * Math.PI * 2637 * t))),
  pop: gerar(0.16, (t) => Math.exp(-28 * t) * Math.sin(2 * Math.PI * (180 + 520 * Math.exp(-40 * t)) * t)),
  thump: gerar(0.5, (t) => Math.exp(-9 * t) * Math.sin(2 * Math.PI * (48 + 90 * Math.exp(-30 * t)) * t) * 0.95),
  whoosh: (() => { let lp = 0; return gerar(0.55, (t) => { const env = Math.sin(Math.PI * Math.min(1, t / 0.55)) ** 2, a = 0.04 + 0.5 * env; lp += a * (ruido() - lp); return lp * env * 1.6; }); })(),
};
mkdirSync(saida, { recursive: true });
for (const [nome, amostras] of Object.entries(sons)) {
  const pico = amostras.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1, buf = Buffer.alloc(44 + amostras.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + amostras.length * 2, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(amostras.length * 2, 40);
  amostras.forEach((v, i) => buf.writeInt16LE(Math.round((v / pico) * 0.8 * 32767), 44 + i * 2));
  writeFileSync(join(saida, nome + ".wav"), buf);
}
console.log("sfx gerados em " + saida);

// Synthesizes the sound effects of the project template (pop, ding, thump, whoosh) from scratch: sine waves and deterministic pseudo-random noise.
// The files are Praeko Studio's own creation (MIT, like the rest of the code), with no third-party samples. Usage: node scripts/generate-sfx.mjs
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44100, cliDir = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "cli"), output = join(cliDir, existsSync(join(cliDir, "templates")) ? "templates" : "modelos", "sfx");
const synth = (duration, f) => Float64Array.from({ length: Math.round(duration * SR) }, (_, i) => f(i / SR, i));
let seed = 1234567;
const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 31 - 1; };
const sounds = {
  ding: synth(0.9, (t) => Math.exp(-4.5 * t) * (0.55 * Math.sin(2 * Math.PI * 1318.5 * t) + 0.3 * Math.sin(2 * Math.PI * 1975.5 * t) + 0.15 * Math.sin(2 * Math.PI * 2637 * t))),
  pop: synth(0.16, (t) => Math.exp(-28 * t) * Math.sin(2 * Math.PI * (180 + 520 * Math.exp(-40 * t)) * t)),
  thump: synth(0.5, (t) => Math.exp(-9 * t) * Math.sin(2 * Math.PI * (48 + 90 * Math.exp(-30 * t)) * t) * 0.95),
  whoosh: (() => { let lp = 0; return synth(0.55, (t) => { const env = Math.sin(Math.PI * Math.min(1, t / 0.55)) ** 2, a = 0.04 + 0.5 * env; lp += a * (noise() - lp); return lp * env * 1.6; }); })(),
};
mkdirSync(output, { recursive: true });
for (const [name, samples] of Object.entries(sounds)) {
  const peak = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1, buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => buf.writeInt16LE(Math.round((v / peak) * 0.8 * 32767), 44 + i * 2));
  writeFileSync(join(output, name + ".wav"), buf);
}
console.log("sfx written to " + output);

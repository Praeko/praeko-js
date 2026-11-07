// Derived cuts: a vertical Short sliced from a long video's VOICE (no new voice). Pure functions + ffmpeg.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import type { Words } from "./compile.ts";

const norm = (s: unknown): string => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
export type Block = { n?: number; title?: string; a: number; b: number };

/** Index of the first word of a phrase (comparing without accents or punctuation). -1 if not found. */
export function findPhraseIndex(words: Words, phrase: string, nth = 0): number {
  const f = String(phrase).split(/\s+/).map(norm).filter(Boolean), W = words.map((p) => norm(p.t));
  let c = 0;
  for (let k = 0; k <= W.length - f.length; k++) if (f.every((w, j) => W[k + j] === w)) { if (c === nth) return k; c++; }
  return -1;
}

/**
 * `ref`: number (s) · "block:N" · "phrase". `end` "from" = start (of a phrase: when it begins; of a block: block start);
 * "to" = end (of a phrase: when its last word ends; of a block: block end).
 */
export function resolvePoint(ref: string | number, end: "from" | "to", { words, blocks }: { words: Words; blocks?: Block[] }): number {
  if (typeof ref === "number") return ref;
  const s = String(ref).trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return +s;
  const b = s.match(/^block:(\d+)$/);
  if (b) {
    const x = blocks?.[+b[1]! - 1];
    if (!x) throw new Error(`block ${b[1]} does not exist (blocks.json has ${blocks?.length ?? 0}; run \`praeko studio voice\` on the long video)`);
    return end === "from" ? x.a : x.b;
  }
  const i = findPhraseIndex(words, s);
  if (i < 0) throw new Error(`phrase "${s}" does not appear in the voice of the long video`);
  if (end === "from") return words[i]!.a;
  const n = s.split(/\s+/).filter(Boolean).length;
  return +words[i + n - 1]!.b.toFixed(2);
}

/** Slices the words between t0 and t1 and re-anchors them at 0 (with `pad` s of breathing room before the first). */
export function sliceWords(words: Words, t0: number, t1: number, { pad = 0.2, tail = 0.3 } = {}): { words: Words; start: number; end: number; duration: number } {
  const start = Math.max(0, t0 - pad), end = t1 + tail;
  const eps = 0.03;
  const sel = words.filter((p) => p.a >= t0 - eps && p.b <= t1 + eps).map((p) => ({ ...p, a: +(p.a - start).toFixed(2), b: +(p.b - start).toFixed(2) }));
  return { words: sel, start, end, duration: +(end - start).toFixed(2) };
}

/** Cuts the audio [start, end] with a short fade at both ends (re-encodes to be exact). */
export function cutAudio(input: string, output: string, start: number, end: number): void {
  const d = end - start;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(start), "-t", String(d), "-i", input, "-af", `afade=t=in:d=0.03,afade=t=out:st=${Math.max(0, d - 0.06).toFixed(2)}:d=0.06`, "-ar", "44100", "-q:a", "2", output]);
}

export const readJson = <T>(file: string, fallback: T): T => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback);

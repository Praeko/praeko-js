// "Estimated" voice: no TTS and no speech audio. Estimates each script word's timing (~190 words/min) and writes a silent mp3,
// just to assemble and check scenes. Free, instant, needs nothing running. NOT for judging rhythm or publishing.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type Word = { t: string; a: number; b: number };

const PAUSES = { final: 0.38, comma: 0.16, colon: 0.2, tag: 0.45 };

/** Drops intonation tags ([curious]) but remembers where `[short pause]` was. */
function tokens(text: string): { t: string; pause: number }[] {
  const out: { t: string; pause: number }[] = [];
  for (const m of text.matchAll(/\[([^\]]*)\]|(\S+)/g)) {
    if (m[1] !== undefined) { if (/pause/i.test(m[1]) && out.length) (out[out.length - 1] as { pause: number }).pause += PAUSES.tag; continue; }
    out.push({ t: m[2] as string, pause: 0 });
  }
  return out;
}

/** Words with estimated timings. `wpm` = words per minute of running speech (pauses not counted). */
export function estimateWords(text: string, { wpm = 190, start = 0.3 }: { wpm?: number; start?: number } = {}): { words: Word[]; duration: number } {
  const toks = tokens(text);
  if (!toks.length) return { words: [], duration: 0 };
  const avg = 60 / wpm, avgLetters = toks.reduce((a, k) => a + k.t.replace(/[^\p{L}\p{N}]/gu, "").length, 0) / toks.length || 1;
  let t = start;
  const words = toks.map((k) => {
    const letters = k.t.replace(/[^\p{L}\p{N}]/gu, "").length || 1;
    const dur = Math.min(0.9, Math.max(0.14, avg * (0.4 + 0.6 * (letters / avgLetters))));
    const a = +t.toFixed(2), b = +(t + dur).toFixed(2);
    t = b + k.pause + (/[.!?…]["”)]*$/.test(k.t) ? PAUSES.final : /[,;]["”)]*$/.test(k.t) ? PAUSES.comma : /:["”)]*$/.test(k.t) ? PAUSES.colon : 0);
    return { t: k.t, a, b };
  });
  return { words, duration: +(t + 0.2).toFixed(2) };
}

/** Silent mp3 of `seconds` seconds. */
export function silentAudio(output: string, seconds: number): void {
  mkdirSync(dirname(output), { recursive: true });
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", String(seconds), "-q:a", "9", output]);
}

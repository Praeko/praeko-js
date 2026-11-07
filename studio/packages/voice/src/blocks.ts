// BLOCK narration (long videos): the script has headings like `## 1 · THE HOOK`; each block becomes one audio, cached by content
// (editing one block only regenerates that block), and all are joined with a pause. Each block's timings are shifted to the whole video.
//
// Cache file names (the ONE place they are defined; `praeko studio migrate` documents it):
//   <folder>/voice-blocks/<NN>-<hash>.mp3 and .json, where NN is the block number padded to 2 digits and
//   hash = sha1(blockCacheKey + "\n" + blockText) first 10 hex chars,
//   blockCacheKey = `${voiceAlias}|${provider}|${model}|${JSON.stringify(pronunciation ?? {})}`.
//   The .json holds { duration, words } (block-local timings).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Word } from "./estimated.ts";

export type Block = { n: number; title: string; text: string };
export type BlockMark = { n: number; title: string; a: number; b: number };

/** `## title` opens a block. Text before the first heading (if any) is ignored. Returns `[]` when there are no headings. */
export function readBlocks(script: string): Block[] {
  const blocks: { title: string; lines: string[] }[] = [];
  let current: { title: string; lines: string[] } | null = null;
  for (const line of script.split("\n")) {
    const m = line.match(/^##\s+(.*)$/);
    if (m) { current = { title: (m[1] as string).trim(), lines: [] }; blocks.push(current); continue; }
    if (current) current.lines.push(line);
  }
  return blocks.map((b, i) => ({ n: i + 1, title: b.title, text: b.lines.join("\n").trim() })).filter((b) => b.text);
}

/** The cache key string that goes into the block hash (see the header). */
export const blockCacheKey = ({ voiceAlias, provider, model, pronunciation }: { voiceAlias: string; provider: string; model?: string; pronunciation?: Record<string, string> }): string =>
  `${voiceAlias}|${provider}|${model ?? ""}|${JSON.stringify(pronunciation ?? {})}`;
export const blockHash = (text: string, key: string): string => createHash("sha1").update(key + "\n" + text).digest("hex").slice(0, 10);
/** Cache hash of a hook sentence (`praeko studio cut --hook`): sha1(`${text}|${quality}|${JSON.stringify(pronunciation ?? {})}`) first 10 hex chars. */
export const hookHash = ({ text, quality, pronunciation }: { text: string; quality: string; pronunciation?: Record<string, string> }): string =>
  createHash("sha1").update(`${text}|${quality}|${JSON.stringify(pronunciation ?? {})}`).digest("hex").slice(0, 10);

/** Joins mp3s with `gap` s of silence between them (mono, 44.1 kHz). */
export function joinAudios(files: string[], output: string, gap = 0.6): void {
  const inputs: string[] = [], filters: string[] = [], labels: string[] = [];
  files.forEach((f, i) => {
    inputs.push("-i", f);
    filters.push(`[${i}:a]aresample=44100,aformat=channel_layouts=mono[a${i}]`);
    labels.push(`[a${i}]`);
    if (i < files.length - 1 && gap > 0) { filters.push(`anullsrc=r=44100:cl=mono,atrim=0:${gap}[g${i}]`); labels.push(`[g${i}]`); }
  });
  filters.push(`${labels.join("")}concat=n=${labels.length}:v=0:a=1[out]`);
  execFileSync("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", filters.join(";"), "-map", "[out]", "-ar", "44100", "-q:a", "2", output]);
}

/**
 * Generates one block at a time. `generateBlock({ text, file })` must write the audio and return `{ duration, words }` (block-local timings).
 * Returns `{ words (whole video), blocks: [{ n, title, a, b }], duration, regenerated, reused }`.
 */
export async function narrateBlocks({ folder, script, key, generateBlock, gap = 0.6, log = () => {} }: {
  folder: string; script: string; key: string; generateBlock: (a: { text: string; file: string; n: number }) => Promise<{ duration: number; words: Word[] }>; gap?: number; log?: (m: string) => void;
}): Promise<{ words: Word[]; blocks: BlockMark[]; duration: number; regenerated: number; reused: number }> {
  const blocks = readBlocks(script);
  if (!blocks.length) throw new Error("script has no blocks: open each block with a `## title` line");
  const dir = join(folder, "voice-blocks");
  mkdirSync(dir, { recursive: true });
  const parts: (Block & { file: string; duration: number; words: Word[] })[] = [];
  let regenerated = 0, reused = 0;
  for (const b of blocks) {
    const base = join(dir, `${String(b.n).padStart(2, "0")}-${blockHash(b.text, key)}`);
    if (existsSync(base + ".mp3") && existsSync(base + ".json")) { reused++; log(`[block ${b.n}] ${b.title}: reused`); }
    else {
      log(`[block ${b.n}] ${b.title}: generating…`);
      const r = await generateBlock({ text: b.text, file: base + ".mp3", n: b.n });
      writeFileSync(base + ".json", JSON.stringify({ duration: r.duration, words: r.words }));
      regenerated++;
    }
    parts.push({ ...b, file: base + ".mp3", ...JSON.parse(readFileSync(base + ".json", "utf8")) });
  }
  joinAudios(parts.map((p) => p.file), join(folder, "voice.mp3"), gap);
  let t = 0, words: Word[] = [];
  const marks: BlockMark[] = [];
  parts.forEach((p, i) => {
    const a = +t.toFixed(2);
    words = words.concat(p.words.map((w) => ({ ...w, a: +(w.a + t).toFixed(2), b: +(w.b + t).toFixed(2) })));
    t += p.duration;
    marks.push({ n: p.n, title: p.title, a, b: +t.toFixed(2) });
    if (i < parts.length - 1) t += gap;
  });
  return { words, blocks: marks, duration: +t.toFixed(2), regenerated, reused };
}

// @praeko/studio-review: cheap checks before the expensive render: script, voice, video (duration, loudness, empty frames) and a contact sheet.
import { execFileSync, spawnSync } from "node:child_process";
import type { SpawnSyncOptions } from "node:child_process";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { aiTicWarnings, validate } from "@praeko/studio-publish";
import type { Brand, Publication } from "@praeko/studio-publish";

export type Level = "ok" | "warning" | "error";
export type Finding = { level: Level; msg: string };

const ff = (args: string[], opts: SpawnSyncOptions = {}) => spawnSync("ffmpeg", ["-hide_banner", ...args], { encoding: "utf8", maxBuffer: 1 << 28, ...opts });
export function duration(file: string): number {
  return +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim();
}
export function videoInfo(file: string): { width: number; height: number; fps: number; duration: number } {
  const [w, h, fps] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "csv=p=0", file]).toString().trim().split(",");
  const [n, d] = (fps as string).split("/").map(Number);
  return { width: +(w as string), height: +(h as string), fps: (n as number) / (d || 1), duration: duration(file) };
}

/** Contact sheet of evenly spaced frames: `contactSheet({ video, output, count = 12, columns = 6, width = 270 })`. */
export function contactSheet({ video, output, count = 12, columns = 6, width = 270 }: { video: string; output: string; count?: number; columns?: number; width?: number }): { output: string; count: number; duration: number } {
  const d = duration(video), rows = Math.ceil(count / columns);
  mkdirSync(dirname(output), { recursive: true });
  const r = ff(["-v", "error", "-y", "-i", video, "-vf", `fps=${count}/${d.toFixed(3)},scale=${width}:-1,tile=${columns}x${rows}`, "-frames:v", "1", output]);
  if (r.status !== 0) throw new Error("contact sheet: " + String(r.stderr).slice(0, 200));
  return { output, count, duration: d };
}

/** Integrated loudness (LUFS) and true peak (dBTP). */
export function loudness(file: string): { lufs: number | null; peak: number | null } {
  const r = ff(["-nostats", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const t = String(r.stderr);
  const I = t.match(/\n\s*I:\s+(-?[\d.]+) LUFS/g), P = t.match(/\n\s*Peak:\s+(-?[\d.]+) dBFS/g);
  return { lufs: I ? +((I[I.length - 1] as string).match(/-?[\d.]+(?= LUFS)/) as RegExpMatchArray)[0] : null, peak: P ? +((P[P.length - 1] as string).match(/-?[\d.]+(?= dBFS)/) as RegExpMatchArray)[0] : null };
}

/**
 * "Empty" frames: 1 frame per second, ignores the caption strip (bottom 18%) and the chapter label (top-left corner);
 * empty = fewer than 1.2% light pixels. Returns `{ total, empty, stretches: [[start, end]] }` (stretches of 3 s or more).
 */
export function emptyFrames(video: string, { threshold = 0.012, minimum = 3 }: { threshold?: number; minimum?: number } = {}): { total: number; empty: number; stretches: [number, number][] } {
  const { width, height } = videoInfo(video), w = 108, h = Math.round((height * w) / width);
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", video, "-vf", `fps=1,scale=${w}:${h},format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 1 << 28 });
  const buf = r.stdout, n = Math.floor(buf.length / (w * h)), fractions: number[] = [];
  for (let q = 0; q < n; q++) {
    let light = 0, tot = 0;
    for (let y = 0; y < Math.floor(h * 0.82); y++) for (let x = 0; x < w; x++) {
      if (y < h * 0.12 && x < w * 0.4) continue;
      tot++; if ((buf[q * w * h + y * w + x] as number) > 50) light++;
    }
    fractions.push(light / tot);
  }
  const flags = fractions.map((f) => f < threshold), stretches: [number, number][] = [];
  let start: number | null = null;
  [...flags, false].forEach((x, i) => { if (x && start === null) start = i; if (!x && start !== null) { if (i - start >= minimum) stretches.push([start, i]); start = null; } });
  return { total: n, empty: flags.filter(Boolean).length, stretches };
}

const OK_TAGS = new Set(["curious", "thoughtful", "confident", "sarcastic", "excited", "short pause"]);
/** Checks the script (spoken text). Returns `[{ level, msg }]`. */
export function checkScript(text: string, brand: Brand = {}): Finding[] {
  const r: Finding[] = [];
  text = text.replace(/^##[^\n]*$/gm, ""); // block headings (long videos) are not spoken text
  const tags = [...text.matchAll(/\[([^\]]+)\]/g)].map((m) => (m[1] as string).toLowerCase());
  const odd = [...new Set(tags.filter((t) => !OK_TAGS.has(t)))];
  if (odd.length) r.push({ level: "warning", msg: `tags outside the list used so far: ${odd.map((t) => `[${t}]`).join(", ")}` });
  const clean = text.replace(/\[[^\]]*\]/g, " ");
  const digits = clean.match(/\d[\d.,]*/g);
  if (digits) r.push({ level: "warning", msg: `digits in the spoken text (spell numbers out): ${[...new Set(digits)].slice(0, 6).join(", ")}` });
  for (const w of aiTicWarnings(brand, text)) r.push({ level: "warning", msg: `AI text tic: ${w}` });
  if (/https?:\/\/|\.com\b|\.br\b/i.test(clean)) r.push({ level: "warning", msg: "web address in the spoken text: write it as it is spoken (e.g. “my site dot com”) or use the brand's `pronunciation`" });
  const words = clean.split(/\s+/).filter(Boolean).length;
  r.push({ level: "ok", msg: `${words} words, ~${Math.round((words / 190) * 60)} s of speech (190 words/min)` });
  for (const name of brand.bannedNames || []) if (new RegExp(`\\b${name}\\b`, "i").test(clean)) r.push({ level: "error", msg: `banned name in the script: ${name}` });
  return r;
}

/**
 * Checks an episode: script, voice/words, publication and (if `video` exists) duration, loudness and empty frames.
 * `folder`: episodes/<slug>; `video`: path of the mp4 (optional).
 */
export function checkEpisode({ folder, brand, video }: { folder: string; brand: Brand; video?: string }): Finding[] {
  const r: Finding[] = [], add = (level: Level, msg: string) => r.push({ level, msg });
  const file = (n: string) => join(folder, n);
  if (existsSync(file("script.txt"))) r.push(...checkScript(readFileSync(file("script.txt"), "utf8"), brand)); else add("error", "missing script.txt");
  let speechEnd: number | null = null;
  if (existsSync(file("words.json"))) {
    const p = JSON.parse(readFileSync(file("words.json"), "utf8")) as { t: string; a: number; b: number }[];
    speechEnd = p[p.length - 1]?.b ?? null;
    const gaps = p.slice(1).filter((x, i) => x.a - (p[i] as { b: number }).b > 2.5).length;
    add(gaps ? "warning" : "ok", gaps ? `${gaps} pause(s) longer than 2.5 s between words` : `${p.length} timed words`);
    if (existsSync(file("voice.mp3")) && speechEnd !== null) { const d = duration(file("voice.mp3")); add(Math.abs(d - speechEnd) > 2 ? "warning" : "ok", `voice.mp3 ${d.toFixed(1)} s; last word at ${speechEnd.toFixed(1)} s`); }
  } else add("warning", "no words.json yet (run `praeko studio voice`)");
  if (existsSync(file("publication.json"))) {
    const publication = JSON.parse(readFileSync(file("publication.json"), "utf8")) as Publication, v = validate({ brand, publication });
    v.errors.forEach((e) => add("error", "publication: " + e)); v.warnings.forEach((e) => add("warning", "publication: " + e));
    const missing = [!publication.yt?.description && "YouTube description", !publication.ig?.caption && "Instagram caption", !publication.tiktok?.caption && "TikTok caption", !(publication.hashtags?.youtube || []).length && "hashtags"].filter(Boolean);
    if (missing.length) add("warning", `publication.json still lacks: ${missing.join(", ")}`);
    else if (!v.errors.length && !v.warnings.length) add("ok", "publication has no errors or warnings");
  } else add("warning", "no publication.json");
  if (video && existsSync(video)) {
    const i = videoInfo(video);
    add(i.width === 1080 && i.height === 1920 ? "ok" : "warning", `video ${i.width}x${i.height} at ${i.fps} fps, ${i.duration.toFixed(1)} s`);
    if (speechEnd && i.duration < speechEnd + 1) add("error", `video (${i.duration.toFixed(1)} s) ends before the speech does (${speechEnd.toFixed(1)} s)`);
    const vol = loudness(video);
    if (vol.lufs !== null) add(vol.lufs < -19 || vol.lufs > -11 ? "warning" : "ok", `loudness ${vol.lufs} LUFS (target ≈ −15), peak ${vol.peak} dBFS`);
    const vz = emptyFrames(video);
    add(vz.stretches.length ? "warning" : "ok", vz.stretches.length ? `nearly empty frames for ${vz.stretches.map(([a, b]) => `${a}-${b}s`).join(", ")} (${vz.empty}/${vz.total} s)` : `no empty stretches (${vz.empty}/${vz.total} s nearly empty)`);
  } else add("ok", "video not rendered yet (the loudness and empty-frame checks wait for the render)");
  return r;
}

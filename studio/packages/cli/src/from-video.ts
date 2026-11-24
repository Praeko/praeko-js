// `praeko studio new <slug> --from-video file.mp4 [--lang pt|en|auto] [--cloud] [--transcript transcript.json] [--title "T"]`: an episode over the person's own video.
// The video is copied to public/video/ (the original is never changed), its speech is transcribed on this machine (the cloud only with --cloud) into words.json/words.ts,
// and episode.yaml gets the video as its `base` layer (its own sound, no `voice:` and no `outro`). Nothing is uploaded or published.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { InputError, TranscribeError, transcribe } from "@praeko/studio-voice";
import type { TranscriptResult } from "@praeko/studio-voice";
import { hasAudio, videoInfo } from "@praeko/studio-review";
import { compileEpisode } from "./compile.ts";
import { findProject, pascal } from "./project.ts";
import type { Project } from "./project.ts";
import * as T from "./templates.ts";
import { STUDIO_NPX } from "./version.ts";

/** Containers the render engines read as a base video. Anything else: convert it first (the message says how). */
export const VIDEO_EXTS = [".mp4", ".mov", ".m4v", ".webm"] as const;
export type Word = { t: string; a: number; b: number };
export type FromVideoIO = {
  /** Test hook: replaces the transcription (gets the extracted 16 kHz WAV). */
  transcribeImpl?: (o: { file: string; language: string; allowCloud?: boolean; log: (m: string) => void }) => Promise<Pick<TranscriptResult, "words" | "text" | "engine" | "language">>;
  log?: (m: string) => void;
};

const flag = (a: string[], k: string): string | undefined => { const i = a.indexOf("--" + k); return i >= 0 && a[i + 1] !== undefined && !a[i + 1]!.startsWith("--") ? a[i + 1] : undefined; };
const has = (a: string[], k: string): boolean => a.includes("--" + k);
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Words as words.json keeps them: text and times rounded to 1/100 s; empty words dropped. */
export function cleanWords(words: unknown): Word[] {
  if (!Array.isArray(words)) throw new Error("the transcript has no word list (expected `words`: [{ t, a, b }])");
  return words.filter((w: any) => w && typeof w.t === "string" && w.t.trim() && Number.isFinite(w.a) && Number.isFinite(w.b)).map((w: any) => ({ t: w.t.trim(), a: round2(w.a), b: round2(Math.max(w.a, w.b)) }));
}
/** What the Whisper output is known to get wrong for captions: words with no duration and numbers written as digits. */
export function transcriptWarnings(words: Word[]): string[] {
  const out: string[] = [];
  const zero = words.filter((w) => w.b - w.a < 0.005);
  if (zero.length) out.push(`${zero.length} word(s) with zero duration (the caption flashes or is skipped): ${zero.slice(0, 6).map((w) => `"${w.t}" at ${w.a.toFixed(2)} s`).join(", ")}; check them in words.json`);
  const digits = [...new Set(words.filter((w) => /\d/.test(w.t)).map((w) => w.t))];
  if (digits.length) out.push(`number(s) written as digits in the captions: ${digits.slice(0, 6).join(", ")}; keep them, or spell them out with \`captionFixes\` in brand.json; a \`when\` phrase must use the digits too`);
  return out;
}

/** Extracts the audio track to a 16 kHz mono WAV (what the local engines read) in a temporary folder. */
function extractAudio(video: string, dir: string): string {
  const wav = join(dir, "audio.wav");
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", video, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav], { encoding: "utf8" });
  if (r.error) throw new Error("ffmpeg not found on PATH: install it (macOS: `brew install ffmpeg`; Debian/Ubuntu: `sudo apt install ffmpeg`; Windows: `winget install ffmpeg`) and try again");
  if (r.status !== 0 || !existsSync(wav)) throw new Error(`ffmpeg could not extract the audio of ${basename(video)}: ${String(r.stderr).trim().split("\n").slice(-2).join(" ")}`);
  return wav;
}

export async function newFromVideo(a: string[], io: FromVideoIO = {}, register: (p: Project, id: string, slug: string) => void): Promise<number> {
  const log = io.log ?? ((m: string) => console.log(m));
  const proj = findProject(), slug = a[0];
  const usage = `usage: ${STUDIO_NPX} new <slug> --from-video <file.mp4> [--lang pt|en|auto] [--cloud] [--transcript <transcript.json>] [--title "Video title"]`;
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error(usage);
  const srcFlag = flag(a, "from-video");
  if (!srcFlag) throw new Error(usage);
  if (["long", "image", "carousel"].some((k) => has(a, k))) throw new Error("--from-video makes a vertical Short over your video: it does not go with --long, --image or --carousel");
  const src = resolve(srcFlag);
  if (!existsSync(src) || !statSync(src).isFile()) throw new Error(`--from-video ${srcFlag}: file not found`);
  const ext = extname(src).toLowerCase();
  if (!(VIDEO_EXTS as readonly string[]).includes(ext)) throw new Error(`--from-video ${srcFlag}: use ${VIDEO_EXTS.join(", ")} (convert first, e.g. \`ffmpeg -i "${basename(src)}" -c:v libx264 -c:a aac "${basename(src, extname(src))}.mp4"\`)`);
  const language = flag(a, "lang") ?? "auto";
  if (!["pt", "en", "auto"].includes(language)) throw new Error(`--lang ${language}: use pt, en or auto`);
  const folder = join(proj.root, "episodes", slug);
  if (existsSync(folder)) throw new Error(`${folder} already exists`);
  const pub = resolve(proj.root, proj.brand.publicDir || "public"), fileName = slug + ext, target = join(pub, "video", fileName);
  if (existsSync(target)) throw new Error(`${relative(proj.root, target)} already exists: choose another slug or remove it`);
  let info: { width: number; height: number; fps: number; duration: number };
  try { info = videoInfo(src); } catch { throw new Error(`--from-video ${srcFlag}: ffprobe could not read a video stream (is it a video file? is ffmpeg installed?)`); }
  if (!(info.duration > 0)) throw new Error(`--from-video ${srcFlag}: the video has no duration`);
  if (!hasAudio(src)) throw new Error(`--from-video ${srcFlag}: the video has no audio track, so there is nothing to transcribe for the captions`);

  // 1. transcript (before anything is written: a failure leaves the project as it was)
  let words: Word[], text: string, engine = "transcript file", spoken = language;
  const given = flag(a, "transcript");
  if (given) {
    let j: any;
    try { j = JSON.parse(readFileSync(resolve(given), "utf8")); } catch (e: any) { throw new Error(`--transcript ${given}: ${e.code === "ENOENT" ? "file not found" : "not valid JSON"}`); }
    words = cleanWords(Array.isArray(j) ? j : j?.words);
    text = typeof j?.text === "string" && j.text.trim() ? j.text.trim() : words.map((w) => w.t).join(" ");
    if (typeof j?.language === "string") spoken = j.language;
  } else {
    const tmp = mkdtempSync(join(tmpdir(), "praeko-from-video-"));
    try {
      const wav = extractAudio(src, tmp);
      log(`transcribing ${basename(src)} (${info.duration.toFixed(1)} s) on this machine${has(a, "cloud") ? " (cloud allowed: --cloud)" : ""}…`);
      const allowCloud = has(a, "cloud") ? true : undefined;
      const r = io.transcribeImpl ? await io.transcribeImpl({ file: wav, language, allowCloud, log }) : await transcribe({ file: wav, language, allowCloud, log });
      words = cleanWords(r.words); text = (r.text || words.map((w) => w.t).join(" ")).trim(); engine = r.engine; spoken = r.language || language;
    } catch (e: any) {
      if (e instanceof TranscribeError || e instanceof InputError) throw new Error(`${e.message}\n(the local model: \`${STUDIO_NPX} transcribe --download-model\`, only after your yes; or --cloud; or --transcript <file.json> from \`${STUDIO_NPX} transcribe\`)`);
      throw e;
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  if (!words.length) throw new Error("the transcript has no words: is there speech in the video? (try --lang pt or --lang en)");

  // 2. files: the video copy, the words, the episode
  const id = pascal(slug), cover = `Cover${id}`, title = flag(a, "title") || slug.replace(/-/g, " ");
  const upper = title.toUpperCase().split(/\s+/).filter(Boolean), size = Math.ceil(upper.length / Math.min(3, upper.length));
  const lines: string[] = [];
  for (let i = 0; i < upper.length; i += size) lines.push(upper.slice(i, i + size).join(" "));
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(src, target);
  const put = (n: string, body: string): void => { mkdirSync(folder, { recursive: true }); writeFileSync(join(folder, n), body); };
  put("words.json", JSON.stringify(words));
  put("words.ts", T.wordsTs(words));
  put("script.txt", text + "\n"); // what is said in the video (the transcript): `check` and `review` read it; there is no voice to make
  put("publication.json", T.initialPublication({ title, synthetic: false }));
  put("episode.json", JSON.stringify({ id, cover, title, source: "video", video: `video/${fileName}` }, null, 2) + "\n");
  put("episode.yaml", T.fromVideoYaml({ id, cover, title, src: `video/${fileName}`, duration: round2(info.duration) }));
  put("scenes.tsx", T.scenesTsx({ cover, lines }));
  put("episode.tsx", T.episodeTsx({ id, slug }));

  // 3. compile and register (same as `new`)
  const r0 = compileEpisode(folder);
  if (r0.errors.length) throw new Error("the episode did not compile: " + r0.errors.join("; ") + (r0.errors.some((e) => /missing "(voice|outro)"/.test(e)) ? ` (this Studio does not know the \`base\` video layer yet: update @praeko/studio, -core and -kit)` : ""));
  register(proj, id, slug);
  log(`episode created from your video: episodes/${slug}/ (id ${id}) · ${info.width}x${info.height}, ${info.duration.toFixed(1)} s · ${words.length} words (${engine}, ${spoken}) · copy in ${relative(proj.root, target)} (the original was not changed)`);
  for (const w of [...transcriptWarnings(words), ...r0.warnings]) log(`⚠ ${w}`);
  if (info.width * 16 !== info.height * 9) log(`⚠ the video is ${info.width}x${info.height}, not 9:16: \`fit: cover\` fills the vertical frame and crops what does not fit`);
  log(`next: add scenes and items in episodes/${slug}/episode.yaml (\`when\` accepts phrases of your video), then \`${STUDIO_NPX} render ${slug} --seconds 10\` for a quick look and \`${STUDIO_NPX} render ${slug}\``);
  return 0;
}

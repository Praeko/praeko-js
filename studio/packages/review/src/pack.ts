// The review package: frames, manifest.json and REVIEW.md of a rendered video, or of the slides of an image piece or carousel.
// Studio measures and extracts; it calls no language model. The agent of the person reads the package and does the judging (REVIEW.md says how).
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Brand } from "@praeko/studio-publish";
import { DEFAULTS } from "@praeko/studio-publish";
import { contactSheet, loudness, videoInfo } from "./index.ts";
import { FRAME_DEFAULTS, frameName, pickFrames } from "./frames.ts";
import { DEFAULT_COLORS, audioFindings, contrastFindings, contrastPairs, fileFindings, frozenFindings, layoutFindings, openingFindings, sceneFindings, slideFindings, speechFindings, speechSpans } from "./findings.ts";
import type { SlideLimits } from "./findings.ts";
import { contentFraction, extractFrame, frameDifference, grayFrames, grayImage, hasAudio, imageSize, reduceImage, silences } from "./media.ts";
import { collectRules, scanTexts } from "./rules.ts";
import { renderReview } from "./guide.ts";
import type { GuideOptions } from "./guide.ts";
import type { ContrastPair, FrameInfo, LayoutIssue, ReviewFinding, ReviewFormat, ReviewKind, SceneInfo, Silence, SlideInfo, TextSource, Word } from "./types.ts";

export const SCHEMA = "praeko-studio-review/1";
export type Manifest = {
  schema: typeof SCHEMA; schemaVersion: 1; generatedAt: string; slug: string; kind: ReviewKind; format: ReviewFormat; source: string;
  video: { duration: number; fps: number; width: number; height: number; hasAudio: boolean } | null;
  scenes: SceneInfo[];
  speech: { words: number; wordsPerSecond: number; firstWordAt: number; lastWordAt: number; spans: { start: number; end: number; words: number; text: string }[] } | null;
  frames: FrameInfo[]; slides: SlideInfo[];
  audio: { integratedLufs: number | null; truePeakDb: number | null; silences: Silence[] } | null;
  contactSheet: string | null;
  brand: { name: string; handle: string; colors: Record<string, string>; fonts: { title: string; mono: string }; contrast: ContrastPair[] };
  rules: { forbiddenPhrases: { phrase: string; source: string }[]; bannedNames: number };
  limits: { every: number; maxFrames: number; frameWidth: number };
  findings: ReviewFinding[];
  summary: { error: number; warning: number; info: number };
  notSeen: string[];
};

export const NOT_SEEN_VIDEO = ["movement between frames (animation, easing, speed of entrances)", "fine sync between voice, captions and sound effects", "audio beyond loudness, true peak and silences (voice quality, music, pronunciation)", "anything that appears and goes away between two frames", "meaning, humor and taste"];
export const NOT_SEEN_SLIDES = ["how the slides look and swipe inside the Instagram app", "whether the alt text is true to the picture (only its length, repetition and shared words are measured)", "meaning, humor and taste"];

const RANK = { error: 0, warning: 1, info: 2 } as const;
function sorted(list: ReviewFinding[]): ReviewFinding[] {
  return list.map((x, i) => ({ x, i })).sort((a, b) => (a.x.time ?? Infinity) - (b.x.time ?? Infinity) || (a.x.slide ?? 0) - (b.x.slide ?? 0) || RANK[a.x.severity] - RANK[b.x.severity] || a.i - b.i).map((e) => e.x);
}
function brandBlock(brand: Brand, pairs: ContrastPair[]): Manifest["brand"] {
  const b = brand as Brand & { colors?: Record<string, string>; fonts?: { title?: string; mono?: string } };
  return { name: b.name ?? "", handle: b.handle ?? "", colors: { ...DEFAULT_COLORS, ...(b.colors ?? {}) }, fonts: { title: b.fonts?.title ?? "", mono: b.fonts?.mono ?? "" }, contrast: pairs };
}
function begin(outDir: string): void {
  if (!basename(outDir).endsWith("-review")) throw new Error(`refusing to clear ${outDir}: the review folder is named <slug>-review`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, "frames"), { recursive: true });
}

export type VideoReviewInput = {
  slug: string; video: string; videoRel: string; outDir: string; format: "short" | "long";
  every?: number; maxFrames?: number; width?: number;
  scenes: SceneInfo[]; specDuration: number | null; specMissing: boolean;
  words: Word[]; estimatedVoice: boolean; brand: Brand; playbook: string | null;
  /** texts to scan besides the captions (script, scene texts, publication.json) */
  texts: TextSource[]; layout: LayoutIssue[]; coverMissing: boolean; coverName: string;
  /** an existing contact sheet to reuse (out/<slug>-contact-sheet.png); one is made when absent */
  contactSheetFile?: string | null; now?: () => Date;
};

export function buildVideoReview(i: VideoReviewInput): Manifest {
  const every = i.every ?? FRAME_DEFAULTS.every, maxFrames = i.maxFrames ?? FRAME_DEFAULTS.maxFrames, width = i.width ?? FRAME_DEFAULTS.width;
  if (!(every > 0)) throw new Error("--every takes a number of seconds above 0");
  if (!Number.isInteger(maxFrames) || maxFrames < 2) throw new Error("--max-frames takes a whole number of at least 2");
  const info = videoInfo(i.video), audio = hasAudio(i.video);
  begin(i.outDir);
  // measures
  const loud = audio ? loudness(i.video) : { lufs: null, peak: null }, quiet = audio ? silences(i.video, info.duration) : [];
  const fps = info.duration <= 300 ? 4 : info.duration <= 900 ? 2 : 1;
  const gray = grayFrames(i.video, { fps, width: 96, sourceWidth: info.width, sourceHeight: info.height });
  const content = gray.frames.map((f, k) => ({ t: k / fps, fraction: contentFraction(f) }));
  const diffs = gray.frames.slice(1).map((f, k) => ({ t: (k + 1) / fps, diff: frameDifference(gray.frames[k] as Uint8Array, f) }));
  // frames
  const picked = pickFrames({ duration: info.duration, scenes: i.scenes, every, maxFrames }), frames: FrameInfo[] = [];
  for (const p of picked) { const file = frameName(p.time); extractFrame(i.video, p.time, join(i.outDir, "frames", file), width); frames.push({ file, time: p.time, scene: p.scene, reason: p.reason }); }
  let sheet: string | null = null;
  if (i.contactSheetFile && existsSync(i.contactSheetFile)) { copyFileSync(i.contactSheetFile, join(i.outDir, "contact-sheet.png")); sheet = "contact-sheet.png"; }
  else { try { contactSheet({ video: i.video, output: join(i.outDir, "contact-sheet.png"), count: 12, columns: 6 }); sheet = "contact-sheet.png"; } catch { sheet = null; } }
  // findings
  const pairs = contrastPairs(i.brand), rules = collectRules(i.brand, i.playbook);
  const caption = i.words.length ? captionSource(i.words) : null;
  const findings = sorted([
    ...openingFindings(content, i.scenes.find((s) => s.kind === "scene")?.start ?? null),
    ...sceneFindings(i.scenes, i.format), ...frozenFindings(diffs, info.duration),
    ...audioFindings({ hasAudio: audio, lufs: loud.lufs, peak: loud.peak, silences: quiet, duration: info.duration, estimatedVoice: i.estimatedVoice }),
    ...speechFindings(i.words),
    ...fileFindings({ format: i.format, duration: info.duration, specDuration: i.specDuration, width: info.width, height: info.height, coverMissing: i.coverMissing, coverName: i.coverName, specMissing: i.specMissing }),
    ...layoutFindings(i.layout), ...contrastFindings(pairs),
    ...scanTexts([...(caption ? [caption] : []), ...i.texts], rules, i.brand),
  ]);
  const manifest: Manifest = {
    schema: SCHEMA, schemaVersion: 1, generatedAt: (i.now ?? (() => new Date()))().toISOString(), slug: i.slug, kind: "video", format: i.format, source: i.videoRel,
    video: { duration: +info.duration.toFixed(2), fps: +info.fps.toFixed(3), width: info.width, height: info.height, hasAudio: audio },
    scenes: i.scenes,
    speech: i.words.length ? { words: i.words.length, wordsPerSecond: +(i.words.length / Math.max(0.5, (i.words[i.words.length - 1] as Word).b - (i.words[0] as Word).a)).toFixed(2), firstWordAt: (i.words[0] as Word).a, lastWordAt: (i.words[i.words.length - 1] as Word).b, spans: speechSpans(i.words) } : null,
    frames, slides: [],
    audio: audio ? { integratedLufs: loud.lufs, truePeakDb: loud.peak, silences: quiet } : null,
    contactSheet: sheet, brand: brandBlock(i.brand, pairs),
    rules: { forbiddenPhrases: rules.phrases, bannedNames: rules.bannedNames.length },
    limits: { every, maxFrames, frameWidth: width }, findings, summary: summarize(findings), notSeen: NOT_SEEN_VIDEO,
  };
  return manifest;
}
/** The words as one text with a map from a character to the second it is spoken (so a forbidden phrase in the captions has a time). */
function captionSource(words: Word[]): TextSource {
  const starts: { at: number; time: number }[] = [];
  let text = "";
  for (const w of words) { starts.push({ at: text.length, time: w.a }); text += (text ? " " : "") + w.t; }
  return { source: "captions", text, timeAt: (idx) => { let t = (starts[0] as { time: number }).time; for (const s of starts) { if (s.at <= idx) t = s.time; else break; } return t; } };
}
const summarize = (list: ReviewFinding[]): Manifest["summary"] => ({ error: list.filter((x) => x.severity === "error").length, warning: list.filter((x) => x.severity === "warning").length, info: list.filter((x) => x.severity === "info").length });

export type SlideReviewInput = {
  slug: string; kind: "image" | "carousel"; outDir: string; outRel: string; width?: number;
  slides: { n: number; file: string; alt: string; text: string[]; hasTitle: boolean }[];
  limits: SlideLimits; brand: Brand; playbook: string | null; texts: TextSource[]; layout: LayoutIssue[];
  /** the Instagram caption and hashtags (publication.json), to check the limits */
  caption: string; hashtags: string[]; now?: () => Date;
};
export function buildSlideReview(i: SlideReviewInput): Manifest {
  const width = i.width ?? FRAME_DEFAULTS.width;
  begin(i.outDir);
  const slides: SlideInfo[] = [];
  for (const s of i.slides) {
    const rendered = existsSync(s.file) && statSync(s.file).isFile();
    let frame: string | null = null, size: { width: number; height: number } | null = null, fraction: number | null = null;
    if (rendered) {
      size = imageSize(s.file); frame = `slide-${String(s.n).padStart(2, "0")}.jpg`;
      reduceImage(s.file, join(i.outDir, "frames", frame), width);
      const g = grayImage(s.file); fraction = g ? contentFraction(g.frame) : null;
    }
    slides.push({ n: s.n, file: s.file.split(/[\\/]/).slice(-2).join("/"), frame, width: size?.width ?? null, height: size?.height ?? null, bytes: rendered ? statSync(s.file).size : 0, rendered, alt: s.alt, text: s.text, contentFraction: fraction === null ? null : +fraction.toFixed(4) });
  }
  const pairs = contrastPairs(i.brand), rules = collectRules(i.brand, i.playbook);
  const L = { ...DEFAULTS.limits, ...(i.brand.publishing?.limits ?? {}) }, caption = i.caption.trim(), extra: ReviewFinding[] = [];
  const cap = (severity: ReviewFinding["severity"], code: string, message: string, evidence: string): void => { extra.push({ severity, time: null, code, message, evidence }); };
  if (!caption) cap("warning", "caption_empty", "the Instagram caption is empty", "ig.caption in publication.json has no text");
  if (`${caption}\n${i.hashtags.join(" ")}`.length > L.instagram) cap("error", "caption_too_long", "the Instagram caption is over the limit", `${`${caption}\n${i.hashtags.join(" ")}`.length} characters; limit ${L.instagram}`);
  if (i.hashtags.length > L.hashtagsInstagram) cap("error", "hashtags_too_many", "too many hashtags for Instagram", `${i.hashtags.length} hashtags; limit ${L.hashtagsInstagram}`);
  const findings = sorted([
    ...slideFindings(slides.map((s, k) => ({ n: s.n, rendered: s.rendered, width: s.width, height: s.height, bytes: s.bytes, alt: s.alt, text: s.text, contentFraction: s.contentFraction, hasTitle: (i.slides[k] as { hasTitle: boolean }).hasTitle })), i.kind, i.limits),
    ...layoutFindings(i.layout), ...contrastFindings(pairs), ...extra, ...scanTexts(i.texts, rules, i.brand),
  ]);
  return {
    schema: SCHEMA, schemaVersion: 1, generatedAt: (i.now ?? (() => new Date()))().toISOString(), slug: i.slug, kind: i.kind, format: i.kind, source: i.outRel,
    video: null, scenes: [], speech: null, frames: [], slides, audio: null, contactSheet: null, brand: brandBlock(i.brand, pairs),
    rules: { forbiddenPhrases: rules.phrases, bannedNames: rules.bannedNames.length },
    limits: { every: 0, maxFrames: i.slides.length, frameWidth: width }, findings, summary: summarize(findings), notSeen: NOT_SEEN_SLIDES,
  };
}

/** Writes manifest.json and REVIEW.md into the review folder (REVIEW.md in the language of `guide`). */
export function writeReview(outDir: string, manifest: Manifest, guide: GuideOptions = {}): { manifest: string; guide: string } {
  const m = join(outDir, "manifest.json"), g = join(outDir, "REVIEW.md");
  writeFileSync(m, JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(g, renderReview(manifest, guide));
  return { manifest: m, guide: g };
}
export const readManifest = (outDir: string): Manifest => JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf8")) as Manifest;

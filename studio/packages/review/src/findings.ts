// Deterministic findings of the review package. Every function takes measured data and returns findings that quote their evidence; none calls a model
// and none invents what it cannot compute. The thresholds are constants, documented in docs/review.md.
import type { Brand } from "@praeko/studio-publish";
import type { ContrastPair, LayoutIssue, ReviewFinding, ReviewFormat, SceneInfo, Silence, Word } from "./types.ts";

export const THRESHOLDS = {
  /** the opening window (s) and the share of pixels that must differ from the background in at least one sample of it */
  opening: 1.5, openingContent: 0.012,
  sceneMin: 1, sceneMax: { short: 8, long: 120 },
  silenceMin: 2, lufs: [-19, -11] as readonly [number, number], truePeakMax: -1,
  /** a stretch of this many seconds whose frames change less than `frozenDifference` (mean gray level, 0 to 255) is "stopped"; one at the very end up to `frozenEndAllowance` s is an end card */
  frozenMin: 3, frozenDifference: 0.5, frozenEndAllowance: 4,
  wordsPerSecondMax: 4, wordsWindow: 5, wordMin: 0.15, wordRun: 3, speechStartMax: 2,
  readingWordsPerSecond: 5, readingMinWords: 8,
  duration: { short: [8, 90], long: [120, 1800] } as Record<"short" | "long", readonly [number, number]>, durationMismatch: 1,
  contrastText: 4.5, contrastLarge: 3,
  slideWordsMax: 35, altMin: 15, aspectTolerance: 0.03,
} as const;

/** `m:ss`, with a tenth of a second when the time is not a whole second (`0:01.5`). */
export function clock(t: number): string {
  const r = Math.round(t * 10) / 10, m = Math.floor(r / 60), s = r - m * 60, whole = Math.abs(s - Math.round(s)) < 1e-9;
  return `${m}:${(whole ? String(Math.round(s)) : s.toFixed(1)).padStart(whole ? 2 : 4, "0")}`;
}
const f = (severity: ReviewFinding["severity"], time: number | null, code: string, message: string, evidence: string, slide?: number): ReviewFinding => ({ severity, time: time === null ? null : +time.toFixed(2), code, message, evidence, ...(slide !== undefined ? { slide } : {}) });
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

// ---------- video: opening, change, stopped frames ----------
export type ContentSample = { t: number; fraction: number };
/** The first 1.5 s show nothing: in no sample of the window does the content (pixels unlike the background) reach 1.2%. Needs at least two samples. */
export function openingFindings(samples: ContentSample[], firstSceneStart: number | null): ReviewFinding[] {
  const out: ReviewFinding[] = [], win = samples.filter((s) => s.t <= THRESHOLDS.opening + 1e-9);
  if (win.length >= 2 && win.every((s) => s.fraction < THRESHOLDS.openingContent)) out.push(f("warning", 0, "opening_empty", "nothing on screen in the first 1.5 s: the opening decides retention", `content in 0–${THRESHOLDS.opening} s: at most ${pct(Math.max(...win.map((s) => s.fraction)))} of the pixels (${win.length} samples; minimum ${pct(THRESHOLDS.openingContent)})`));
  if (firstSceneStart !== null && firstSceneStart >= THRESHOLDS.opening) out.push(f("warning", 0, "opening_scene_late", "the first scene starts after the 1.5 s of the opening", `scene 1 starts at ${clock(firstSceneStart)}`));
  return out;
}
export function sceneFindings(scenes: SceneInfo[], format: "short" | "long"): ReviewFinding[] {
  const out: ReviewFinding[] = [], max = THRESHOLDS.sceneMax[format];
  for (const s of scenes) {
    const label = `${s.kind === "scene" ? "scene" : s.kind} ${s.n}`;
    if (s.kind === "scene" && s.duration < THRESHOLDS.sceneMin) out.push(f("warning", s.start, "scene_too_short", `${label} is shorter than ${THRESHOLDS.sceneMin} s: there is no time to read it`, `${label} lasts ${s.duration.toFixed(1)} s (${clock(s.start)}–${clock(s.end)})`));
    if (s.kind === "scene" && s.duration > max) out.push(f("warning", s.start, "scene_too_long", `${label} lasts more than ${max} s without a change of scene`, `${label} lasts ${s.duration.toFixed(1)} s (${clock(s.start)}–${clock(s.end)})`));
    const words = s.text.join(" ").split(/\s+/).filter(Boolean).length;
    if (s.kind === "scene" && words >= THRESHOLDS.readingMinWords && words / s.duration > THRESHOLDS.readingWordsPerSecond) out.push(f("warning", s.start, "onscreen_reading_speed", `${label} has more text than can be read in its time (estimate: every item counted as visible at once)`, `${words} words in ${s.duration.toFixed(1)} s (${(words / s.duration).toFixed(1)} words/s; limit ${THRESHOLDS.readingWordsPerSecond})`));
  }
  return out;
}
/** Samples (`t`, mean change since the previous sample, 0 to 255) with a long run of almost identical frames. */
export function frozenFindings(diffs: { t: number; diff: number }[], duration: number): ReviewFinding[] {
  const out: ReviewFinding[] = [];
  let start: number | null = null, run: number[] = [];
  const close = (end: number): void => {
    if (start === null) return;
    const len = end - start;
    const atEnd = end >= duration - 0.5;
    if (len >= THRESHOLDS.frozenMin && !(atEnd && len <= THRESHOLDS.frozenEndAllowance)) out.push(f("warning", start, "frames_frozen", "the picture hardly changes for a long stretch: it looks stopped", `mean change between frames ${(run.reduce((a, b) => a + b, 0) / run.length).toFixed(2)} of 255 from ${clock(start)} to ${clock(end)} (${len.toFixed(1)} s; stopped means under ${THRESHOLDS.frozenDifference})`));
    start = null; run = [];
  };
  for (let i = 0; i < diffs.length; i++) {
    const d = diffs[i] as { t: number; diff: number }, prev = diffs[i - 1];
    if (d.diff < THRESHOLDS.frozenDifference) { if (start === null) start = prev ? prev.t : 0; run.push(d.diff); } else close(prev ? prev.t : d.t);
  }
  close(duration);
  return out;
}

// ---------- audio ----------
export function audioFindings({ hasAudio, lufs, peak, silences, duration, estimatedVoice }: { hasAudio: boolean; lufs: number | null; peak: number | null; silences: Silence[]; duration: number; estimatedVoice: boolean }): ReviewFinding[] {
  const out: ReviewFinding[] = [];
  if (estimatedVoice) out.push(f("warning", null, "voice_estimated", "the voice is ESTIMATED (a silent draft): make the final voice before judging the audio or publishing", "the voice.estimated marker file exists in the episode folder"));
  if (!hasAudio) { out.push(f("warning", null, "audio_missing", "the video has no audio track", "ffprobe found no audio stream")); return out; }
  for (const s of silences) if (s.duration >= THRESHOLDS.silenceMin) out.push(f("warning", s.start, "silence_long", `silence of ${s.duration.toFixed(1)} s`, `below -40 dB from ${clock(s.start)} to ${clock(s.end)}${s.duration >= duration - 0.5 ? " (the whole video)" : ""}`));
  if (lufs !== null && (lufs < THRESHOLDS.lufs[0] || lufs > THRESHOLDS.lufs[1])) out.push(f("warning", null, "loudness_out_of_range", `loudness is ${lufs < THRESHOLDS.lufs[0] ? "low" : "high"} for short-form video (target about -15 LUFS)`, `integrated ${lufs} LUFS (EBU R128); accepted ${THRESHOLDS.lufs[0]} to ${THRESHOLDS.lufs[1]}`));
  if (peak !== null && peak > THRESHOLDS.truePeakMax) out.push(f("warning", null, "true_peak_high", "the audio peaks close to clipping", `true peak ${peak} dBFS; limit ${THRESHOLDS.truePeakMax}`));
  return out;
}

// ---------- speech and captions ----------
export function speechFindings(words: Word[]): ReviewFinding[] {
  const out: ReviewFinding[] = [];
  if (!words.length) return out;
  const first = words[0] as Word, last = words[words.length - 1] as Word;
  if (first.a > THRESHOLDS.speechStartMax) out.push(f("warning", 0, "speech_starts_late", `the voice only starts at ${clock(first.a)}: the opening is silent`, `first word "${first.t}" at ${first.a.toFixed(2)} s; limit ${THRESHOLDS.speechStartMax} s`));
  const span = last.b - first.a, win = Math.min(THRESHOLDS.wordsWindow, span);
  if (span >= 3) {
    let open: { start: number; peak: number; at: number } | null = null;
    const close = (): void => { if (open) out.push(f("warning", open.start, "speech_too_fast", "the speech is too fast to follow", `${open.peak.toFixed(1)} words/s at ${clock(open.at)} (window of ${win.toFixed(0)} s; limit ${THRESHOLDS.wordsPerSecondMax}; 190 words/min is 3.2)`)); open = null; };
    for (let t = first.a; t + win <= last.b + 1e-9; t += 1) {
      const rate = words.filter((w) => w.a >= t && w.a < t + win).length / win;
      if (rate > THRESHOLDS.wordsPerSecondMax) { if (!open) open = { start: t, peak: rate, at: t }; else if (rate > open.peak) { open.peak = rate; open.at = t; } } else close();
    }
    close();
  }
  let run: Word[] = [];
  const flush = (): void => { if (run.length >= THRESHOLDS.wordRun) out.push(f("warning", (run[0] as Word).a, "caption_flash", "captions flash by faster than they can be read", `${run.length} words in a row of under ${THRESHOLDS.wordMin} s each: "${run.map((w) => w.t).join(" ").slice(0, 60)}" (${run.map((w) => (w.b - w.a).toFixed(2)).join(", ")} s)`)); run = []; };
  for (const w of words) { if (w.b - w.a < THRESHOLDS.wordMin) run.push(w); else flush(); }
  flush();
  return out;
}
/** Where the voice speaks: words closer than `gap` seconds belong to the same stretch. */
export function speechSpans(words: Word[], gap = 0.8): { start: number; end: number; words: number; text: string }[] {
  const spans: { start: number; end: number; words: number; text: string }[] = [];
  for (const w of words) {
    const s = spans[spans.length - 1];
    if (s && w.a - s.end <= gap) { s.end = +w.b.toFixed(2); s.words++; s.text += " " + w.t; } else spans.push({ start: +w.a.toFixed(2), end: +w.b.toFixed(2), words: 1, text: w.t });
  }
  return spans.map((s) => ({ ...s, text: s.text.length > 160 ? s.text.slice(0, 157) + "…" : s.text }));
}

// ---------- the file: duration, shape, cover, layout ----------
export function fileFindings({ format, duration, specDuration, width, height, coverMissing, coverName, specMissing }: { format: "short" | "long"; duration: number; specDuration: number | null; width: number; height: number; coverMissing: boolean; coverName: string; specMissing: boolean }): ReviewFinding[] {
  const out: ReviewFinding[] = [], [lo, hi] = THRESHOLDS.duration[format], want = format === "short" ? 9 / 16 : 16 / 9, ratio = width / height;
  if (duration < lo || duration > hi) out.push(f("warning", null, "duration_unexpected", `the video is ${duration < lo ? "shorter" : "longer"} than expected for a ${format === "short" ? "vertical short" : "long video"} (expected ${lo} to ${hi} s)`, `the video lasts ${duration.toFixed(1)} s`));
  if (specDuration !== null && Math.abs(specDuration - duration) > THRESHOLDS.durationMismatch) out.push(f("warning", null, "duration_mismatch", "the video does not last what episode.yaml says: render it again", `video ${duration.toFixed(1)} s, spec ${specDuration.toFixed(1)} s`));
  if (Math.abs(ratio / want - 1) > THRESHOLDS.aspectTolerance) out.push(f("warning", null, "aspect_unexpected", `the picture is not ${format === "short" ? "9:16" : "16:9"}`, `${width}x${height} (ratio ${ratio.toFixed(3)}; expected ${want.toFixed(3)})`));
  else if ((format === "short" && width < 1080) || (format === "long" && width < 1920)) out.push(f("info", null, "preview_resolution", "rendered below full size (a --scale preview): do not judge sharpness or publish this file", `${width}x${height}; full size is ${format === "short" ? "1080x1920" : "1920x1080"}`));
  if (coverMissing) out.push(f("warning", null, "cover_missing", "no cover image was rendered", `out/${coverName} does not exist (run \`praeko studio cover\`)`));
  if (specMissing) out.push(f("info", null, "spec_missing", "no compiled episode.spec.json: the scenes and their texts are unknown", "run `praeko studio compile` before the review for the scene frames and texts"));
  return out;
}
export const layoutFindings = (issues: LayoutIssue[]): ReviewFinding[] => issues.map((i) => f("warning", i.time, "text_outside_safe_area", i.message, i.evidence, i.slide));

// ---------- brand contrast (WCAG 2.x), from brand.json ----------
export const DEFAULT_COLORS: Record<string, string> = { background: "#14110f", accent: "#f4b942", text: "#f3ece0", muted: "#a89c8a", ok: "#7ee787", error: "#ff6b5e", info: "#7fd7ff", extra: "#a98bff", box: "#2a2118", code: "#1b1610" };
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
function rgb(hex: string): [number, number, number] | null {
  if (!HEX.test(hex)) return null;
  const h = hex.length === 4 ? hex.slice(1).split("").map((c) => c + c).join("") : hex.slice(1), n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function luminance(hex: string): number | null {
  const c = rgb(hex);
  if (!c) return null;
  const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG contrast ratio of two #hex colors (1 to 21), or null if either is not a hex color. */
export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a), lb = luminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return +((hi + 0.05) / (lo + 0.05)).toFixed(2);
}
const PAIRS: [string, string, number][] = [["text", "background", 4.5], ["muted", "background", 4.5], ["accent", "background", 3], ["ok", "background", 3], ["error", "background", 3], ["info", "background", 3], ["extra", "background", 3], ["text", "box", 4.5], ["accent", "box", 3], ["text", "code", 4.5]];
export function contrastPairs(brand: Brand): ContrastPair[] {
  const colors = { ...DEFAULT_COLORS, ...((brand as { colors?: Record<string, string> }).colors ?? {}) }, out: ContrastPair[] = [];
  for (const [fg, bg, required] of PAIRS) {
    const a = colors[fg], b = colors[bg], ratio = a && b ? contrastRatio(a, b) : null;
    if (ratio !== null && a && b) out.push({ pair: `${fg} on ${bg}`, foreground: a, background: b, ratio, required, ok: ratio >= required });
  }
  return out;
}
export const contrastFindings = (pairs: ContrastPair[]): ReviewFinding[] => pairs.filter((p) => !p.ok).map((p) => f("warning", null, "low_contrast", `${p.pair} is hard to read`, `${p.foreground} on ${p.background}: ${p.ratio}:1; WCAG needs ${p.required}:1${p.required === THRESHOLDS.contrastLarge ? " (large text)" : ""}`));

// ---------- image pieces and carousels ----------
export type SlideCheckInput = { n: number; rendered: boolean; width: number | null; height: number | null; bytes: number; alt: string; text: string[]; contentFraction: number | null; hasTitle: boolean };
export type SlideLimits = { width: number; height: number; bytesMax: number; altMax: number; carouselMin: number; carouselMax: number };
const GENERIC_ALT = /^(image|imagem|photo|foto|slide|picture)?\s*\d*$|\.(jpe?g|png|webp)$|^(slide|image|imagem)[\s_-]*\d+/i;
const words = (s: string): string[] => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
export function slideFindings(slides: SlideCheckInput[], kind: "image" | "carousel", limits: SlideLimits): ReviewFinding[] {
  const out: ReviewFinding[] = [], N = slides.length;
  if (kind === "carousel" && (N < limits.carouselMin || N > limits.carouselMax)) out.push(f("error", null, "carousel_count", `a carousel takes ${limits.carouselMin} to ${limits.carouselMax} slides`, `${N} slide(s) in episode.yaml`));
  if (kind === "image" && N !== 1) out.push(f("error", null, "image_count", "an image post has exactly one slide", `${N} slides in episode.yaml`));
  const seenAlt = new Map<string, number>();
  for (const s of slides) {
    const at = (code: string, sev: ReviewFinding["severity"], msg: string, ev: string): void => { out.push(f(sev, null, code, msg, ev, s.n)); };
    if (!s.rendered) { at("slide_missing", "error", `slide ${s.n} is not rendered`, `out/<slug>-slide-${String(s.n).padStart(2, "0")}.jpg does not exist (run \`praeko studio slides\`)`); continue; }
    if (s.width !== null && s.height !== null && (s.width !== limits.width || s.height !== limits.height)) at("slide_size", "error", `slide ${s.n} is not ${limits.width}x${limits.height} (4:5), the Instagram feed size`, `${s.width}x${s.height}`);
    if (s.bytes > limits.bytesMax) at("slide_too_big", "error", `slide ${s.n} is over the Instagram limit of ${limits.bytesMax / 1048576} MB`, `${(s.bytes / 1048576).toFixed(1)} MB`);
    if (s.contentFraction !== null && s.contentFraction < THRESHOLDS.openingContent) at("slide_nearly_empty", "warning", `slide ${s.n} is nearly empty`, `${pct(s.contentFraction)} of the pixels differ from the background (minimum ${pct(THRESHOLDS.openingContent)})`);
    const alt = s.alt.trim(), n = alt.split(/\s+/).filter(Boolean).length;
    if (!alt) at("alt_missing", "error", `slide ${s.n} has no alt text`, "alt is empty in episode.yaml");
    else {
      if (alt.length > limits.altMax) at("alt_too_long", "error", `alt text of slide ${s.n} is over the limit`, `${alt.length} characters; limit ${limits.altMax}`);
      else if (alt.length < THRESHOLDS.altMin || n < 3) at("alt_too_short", "warning", `alt text of slide ${s.n} is too short to describe the image`, `${alt.length} characters, ${n} word(s): "${alt.slice(0, 60)}"`);
      if (GENERIC_ALT.test(alt)) at("alt_generic", "warning", `alt text of slide ${s.n} is generic (a file name or "image 1")`, `"${alt.slice(0, 60)}"`);
      const key = alt.toLowerCase(), other = seenAlt.get(key);
      if (other !== undefined) at("alt_repeated", "warning", `slide ${s.n} repeats the alt text of slide ${other}`, `"${alt.slice(0, 60)}"`); else seenAlt.set(key, s.n);
      const shown = s.text.join(" "), sw = new Set(words(shown));
      if (alt.toLowerCase() === shown.trim().toLowerCase() && shown.trim()) at("alt_equals_text", "info", `alt text of slide ${s.n} only repeats the text on the slide: say what the image shows too`, `"${alt.slice(0, 60)}"`);
      else if (sw.size >= 3 && !words(alt).some((w) => sw.has(w))) at("alt_unrelated_to_text", "info", `alt text of slide ${s.n} mentions none of the words written on the slide`, `${sw.size} distinct words on the slide, 0 in the alt text`);
    }
    const wordCount = s.text.join(" ").split(/\s+/).filter(Boolean).length;
    if (wordCount > THRESHOLDS.slideWordsMax) at("slide_text_dense", "warning", `slide ${s.n} has a lot of text for a phone screen`, `${wordCount} words; limit ${THRESHOLDS.slideWordsMax}`);
    if (s.n === 1 && !s.hasTitle && !s.text.length) at("first_slide_empty", "warning", "the first slide has no text: it is the hook of the carousel", "slide 1 has no title and no text items");
  }
  const firstLine = new Map<string, number>();
  for (const s of slides) { const t = (s.text[0] ?? "").trim().toLowerCase(); if (!t) continue; const o = firstLine.get(t); if (o !== undefined) out.push(f("info", null, "slide_text_repeated", `slide ${s.n} opens with the same text as slide ${o}`, `"${t.slice(0, 60)}"`, s.n)); else firstLine.set(t, s.n); }
  return out;
}

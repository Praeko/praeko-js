// Each deterministic finding has a case that fires and a case that does not. No video, no ffmpeg: the rules take measured data.
import test from "node:test";
import assert from "node:assert/strict";
import { THRESHOLDS, audioFindings, clock, contrastFindings, contrastPairs, contrastRatio, fileFindings, frozenFindings, layoutFindings, openingFindings, sceneFindings, slideFindings, speechFindings, speechSpans } from "../src/findings.ts";
import type { SlideCheckInput, SlideLimits } from "../src/findings.ts";
import type { SceneInfo, Word } from "../src/types.ts";

const codes = (l: { code: string }[]): string[] => l.map((x) => x.code);
const scene = (n: number, start: number, end: number, text: string[] = ["x"]): SceneInfo => ({ n, kind: "scene", start, end, duration: +(end - start).toFixed(2), text });
const W = (list: [string, number, number][]): Word[] => list.map(([t, a, b]) => ({ t, a, b }));

test("clock: m:ss, with a tenth when not a whole second", () => {
  assert.equal(clock(0), "0:00"); assert.equal(clock(2), "0:02"); assert.equal(clock(61.4), "1:01.4"); assert.equal(clock(125), "2:05");
});

test("opening_empty: fires when no sample of the first 1.5 s has content, not when one has", () => {
  const empty = [0, 0.25, 0.5, 1, 1.5].map((t) => ({ t, fraction: 0.002 }));
  const r = openingFindings(empty, 0);
  assert.deepEqual(codes(r), ["opening_empty"]); assert.equal(r[0]!.time, 0); assert.match(r[0]!.evidence, /at most 0\.2% of the pixels \(5 samples; minimum 1\.2%\)/);
  assert.deepEqual(openingFindings([...empty.slice(0, 2), { t: 1, fraction: 0.2 }], 0), []);
  assert.deepEqual(openingFindings([{ t: 0, fraction: 0 }], 0), [], "one sample is not enough to say anything");
  assert.deepEqual(openingFindings([{ t: 0, fraction: 0 }, { t: 3, fraction: 0 }], 0), [], "samples after the window do not count");
});
test("opening_scene_late: the first scene starts at or after 1.5 s", () => {
  assert.deepEqual(codes(openingFindings([], 2)), ["opening_scene_late"]);
  assert.deepEqual(openingFindings([], 1.4), []); assert.deepEqual(openingFindings([], null), []);
});
test("scene_too_short, scene_too_long (by format) and onscreen_reading_speed", () => {
  assert.deepEqual(codes(sceneFindings([scene(1, 0, 0.6)], "short")), ["scene_too_short"]);
  assert.deepEqual(sceneFindings([scene(1, 0, 1)], "short"), []);
  assert.deepEqual(codes(sceneFindings([scene(1, 0, 9)], "short")), ["scene_too_long"]);
  assert.deepEqual(sceneFindings([scene(1, 0, 9)], "long"), [], "a long video allows longer scenes");
  assert.deepEqual(codes(sceneFindings([scene(1, 0, 130)], "long")), ["scene_too_long"]);
  const busy = scene(1, 0, 2, ["one two three four five six seven eight nine ten eleven twelve"]);
  const r = sceneFindings([busy], "short");
  assert.deepEqual(codes(r), ["onscreen_reading_speed"]); assert.match(r[0]!.evidence, /12 words in 2\.0 s \(6\.0 words\/s; limit 5\)/);
  assert.deepEqual(sceneFindings([scene(1, 0, 4, ["one two three four five six seven eight nine ten"])], "short"), []);
  assert.deepEqual(sceneFindings([{ ...scene(2, 5, 5.2), kind: "outro" }], "short"), [], "a closing screen is not judged on length");
});
test("frames_frozen: a long run of almost identical frames, but not a short one and not a short end card", () => {
  const still = (from: number, to: number) => { const o = []; for (let t = from; t <= to; t += 0.25) o.push({ t, diff: 0.1 }); return o; };
  const moving = (from: number, to: number) => { const o = []; for (let t = from; t <= to; t += 0.25) o.push({ t, diff: 9 }); return o; };
  const r = frozenFindings([...moving(0.25, 2), ...still(2.25, 7), ...moving(7.25, 10)], 10);
  assert.deepEqual(codes(r), ["frames_frozen"]); assert.equal(r[0]!.time, 2); assert.match(r[0]!.evidence, /0\.10 of 255 from 0:02 to 0:07 \(5\.0 s/);
  assert.deepEqual(frozenFindings([...moving(0.25, 4), ...still(4.25, 6), ...moving(6.25, 10)], 10), [], "2 s is not long");
  assert.deepEqual(frozenFindings([...moving(0.25, 6), ...still(6.25, 10)], 10), [], "a 4 s end card is allowed");
  assert.deepEqual(codes(frozenFindings([...moving(0.25, 2), ...still(2.25, 10)], 10)), ["frames_frozen"], "a long stillness that reaches the end is not an end card");
  assert.deepEqual(codes(frozenFindings(still(0.25, 8), 8)), ["frames_frozen"], "the whole video stopped");
});
test("audio: estimated voice, no track, long silence, loudness, true peak", () => {
  const ok = { hasAudio: true, lufs: -15, peak: -3, silences: [], duration: 30, estimatedVoice: false };
  assert.deepEqual(audioFindings(ok), []);
  assert.deepEqual(codes(audioFindings({ ...ok, estimatedVoice: true })), ["voice_estimated"]);
  assert.deepEqual(codes(audioFindings({ ...ok, hasAudio: false })), ["audio_missing"]);
  const s = audioFindings({ ...ok, silences: [{ start: 4, end: 7.5, duration: 3.5 }, { start: 10, end: 11, duration: 1 }] });
  assert.deepEqual(codes(s), ["silence_long"]); assert.equal(s[0]!.time, 4); assert.match(s[0]!.evidence, /0:04 to 0:07\.5/);
  assert.match(audioFindings({ ...ok, silences: [{ start: 0, end: 30, duration: 30 }] })[0]!.evidence, /the whole video/);
  assert.match(audioFindings({ ...ok, lufs: -25 })[0]!.message, /low/); assert.match(audioFindings({ ...ok, lufs: -8 })[0]!.message, /high/);
  assert.deepEqual(audioFindings({ ...ok, lufs: -19 }), []); assert.deepEqual(audioFindings({ ...ok, lufs: null, peak: null }), []);
  assert.deepEqual(codes(audioFindings({ ...ok, peak: -0.2 })), ["true_peak_high"]);
});
test("speech: late start, too fast, caption flash; a normal pace fires nothing", () => {
  const normal = W(Array.from({ length: 12 }, (_, i) => ["w" + i, i * 0.35 + 0.3, i * 0.35 + 0.6] as [string, number, number]));
  assert.deepEqual(speechFindings(normal), []);
  assert.deepEqual(codes(speechFindings(normal.map((w) => ({ ...w, a: w.a + 2.5, b: w.b + 2.5 })))), ["speech_starts_late"]);
  const fast = W(Array.from({ length: 40 }, (_, i) => ["w" + i, i * 0.2, i * 0.2 + 0.18] as [string, number, number]));
  const f = speechFindings(fast);
  assert.deepEqual(codes(f), ["speech_too_fast"]); assert.match(f[0]!.evidence, /5\.0 words\/s/);
  const flash = speechFindings(W([["a", 0.3, 0.9], ["b", 1, 1.1], ["c", 1.2, 1.3], ["d", 1.4, 1.5], ["e", 1.6, 2.4], ["f", 3, 3.5]]));
  assert.deepEqual(codes(flash), ["caption_flash"]); assert.equal(flash[0]!.time, 1);
  assert.deepEqual(speechFindings(W([["a", 0.3, 0.9], ["b", 1, 1.1], ["c", 1.2, 1.3], ["d", 1.4, 2.4]])), [], "only two short words in a row");
  assert.deepEqual(speechFindings([]), []);
});
test("speechSpans groups words closer than 0.8 s", () => {
  const s = speechSpans(W([["a", 0, 0.3], ["b", 0.4, 0.7], ["c", 3, 3.3]]));
  assert.deepEqual(s.map((x) => [x.start, x.end, x.words, x.text]), [[0, 0.7, 2, "a b"], [3, 3.3, 1, "c"]]);
});
test("file: duration, mismatch, aspect, preview scale, cover, missing spec", () => {
  const base = { format: "short" as const, duration: 30, specDuration: 30, width: 1080, height: 1920, coverMissing: false, coverName: "x-cover.png", specMissing: false };
  assert.deepEqual(fileFindings(base), []);
  assert.deepEqual(codes(fileFindings({ ...base, duration: 5, specDuration: 5 })), ["duration_unexpected"]);
  assert.deepEqual(codes(fileFindings({ ...base, duration: 120, specDuration: 120 })), ["duration_unexpected"]);
  assert.deepEqual(fileFindings({ ...base, format: "long", duration: 400, specDuration: 400, width: 1920, height: 1080 }), []);
  assert.deepEqual(codes(fileFindings({ ...base, format: "long", duration: 60, specDuration: 60, width: 1920, height: 1080 })), ["duration_unexpected"]);
  assert.deepEqual(codes(fileFindings({ ...base, specDuration: 33 })), ["duration_mismatch"]);
  assert.deepEqual(fileFindings({ ...base, specDuration: 30.5 }), []);
  assert.deepEqual(codes(fileFindings({ ...base, width: 1920, height: 1080 })), ["aspect_unexpected"]);
  const p = fileFindings({ ...base, width: 540, height: 960 });
  assert.deepEqual(codes(p), ["preview_resolution"]); assert.equal(p[0]!.severity, "info");
  assert.deepEqual(codes(fileFindings({ ...base, coverMissing: true })), ["cover_missing"]);
  assert.deepEqual(codes(fileFindings({ ...base, specMissing: true, specDuration: null })), ["spec_missing"]);
});
test("low_contrast: computed from brand colors (WCAG), default colors pass, a pale accent fails", () => {
  assert.equal(contrastRatio("#000000", "#ffffff"), 21); assert.equal(contrastRatio("#fff", "#fff"), 1); assert.equal(contrastRatio("red", "#fff"), null);
  assert.deepEqual(contrastFindings(contrastPairs({})), []);
  const bad = contrastFindings(contrastPairs({ colors: { background: "#f4f4f4", accent: "#f0f0a0", text: "#f0f0f0" } } as any));
  assert.ok(codes(bad).every((c) => c === "low_contrast")); assert.ok(bad.some((x) => /accent on background/.test(x.message)));
  assert.match(bad.find((x) => /text on background/.test(x.message))!.evidence, /#f0f0f0 on #f4f4f4: [\d.]+:1; WCAG needs 4\.5:1$/);
  assert.equal(THRESHOLDS.contrastText, 4.5);
});
test("text_outside_safe_area wraps the layout issues the CLI computed", () => {
  const r = layoutFindings([{ time: 3, message: "scene 2: x", evidence: "e" }, { time: null, slide: 2, message: "slide 2: y", evidence: "e" }]);
  assert.deepEqual(r.map((x) => [x.code, x.time, x.slide]), [["text_outside_safe_area", 3, undefined], ["text_outside_safe_area", null, 2]]);
});

const LIM: SlideLimits = { width: 1080, height: 1350, bytesMax: 8 * 1048576, altMax: 1000, carouselMin: 2, carouselMax: 20 };
const slide = (n: number, o: Partial<SlideCheckInput> = {}): SlideCheckInput => ({ n, rendered: true, width: 1080, height: 1350, bytes: 200_000, alt: "A dark card with the headline about the weekly report and a chart", text: ["Weekly report headline", "Numbers on the chart"], contentFraction: 0.2, hasTitle: true, ...o });
test("slides: a clean carousel fires nothing", () => {
  assert.deepEqual(slideFindings([slide(1, { alt: "First slide: a headline about shipping on Fridays" }), slide(2, { alt: "Second slide: a chart of deploys per week", text: ["Deploys per week", "More text here"] })], "carousel", LIM), []);
});
test("slides: count, missing file, size, bytes, empty picture", () => {
  assert.deepEqual(codes(slideFindings([slide(1)], "carousel", LIM)), ["carousel_count"]);
  assert.deepEqual(codes(slideFindings([slide(1), slide(2)], "image", LIM)), ["image_count", "alt_repeated", "slide_text_repeated"]);
  assert.deepEqual(codes(slideFindings([slide(1, { rendered: false })], "image", LIM)), ["slide_missing"]);
  assert.deepEqual(codes(slideFindings([slide(1, { width: 1080, height: 1080 })], "image", LIM)), ["slide_size"]);
  assert.deepEqual(codes(slideFindings([slide(1, { bytes: 9 * 1048576 })], "image", LIM)), ["slide_too_big"]);
  assert.deepEqual(codes(slideFindings([slide(1, { contentFraction: 0.001 })], "image", LIM)), ["slide_nearly_empty"]);
});
test("slides: alt text missing, too long, too short, generic, repeated, equal to the text, unrelated", () => {
  const one = (alt: string, text?: string[]) => codes(slideFindings([slide(1, { alt, ...(text ? { text } : {}) })], "image", LIM));
  assert.deepEqual(one(""), ["alt_missing"]);
  assert.deepEqual(one("x".repeat(1001), []), ["alt_too_long"]);
  assert.deepEqual(one("Weekly card"), ["alt_too_short"]);
  assert.ok(one("slide 1").includes("alt_generic")); assert.ok(one("IMG_2031.jpg").includes("alt_generic"));
  assert.deepEqual(one("Weekly report headline Numbers on the chart", ["Weekly report headline", "Numbers on the chart"]), ["alt_equals_text"]);
  assert.deepEqual(one("A photo of a mountain lake at dawn with mist", ["Weekly report headline", "Numbers on the chart"]), ["alt_unrelated_to_text"]);
  assert.deepEqual(one("A dark card with the weekly headline and a chart of numbers"), []);
});
test("slides: dense text, empty first slide, repeated opening line", () => {
  assert.deepEqual(codes(slideFindings([slide(1, { alt: "A wall of text that lists word1 and word2 and many more", text: [Array.from({ length: 40 }, (_, i) => "word" + i).join(" ")] })], "image", LIM)), ["slide_text_dense"]);
  assert.deepEqual(codes(slideFindings([slide(1, { text: [], hasTitle: false, alt: "A plain dark background with nothing written on it" })], "image", LIM)), ["first_slide_empty"]);
  const r = slideFindings([slide(1, { alt: "First slide about weekly reports and charts" }), slide(2, { alt: "Second slide about monthly reports and tables", text: ["Weekly report headline", "Tables of the month"] })], "carousel", LIM);
  assert.deepEqual(codes(r), ["slide_text_repeated"]);
});

// The review package built from real (synthetic) media with ffmpeg: frames, manifest, REVIEW.md, and the guide snapshots. Skipped, loudly, when ffmpeg is missing.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCHEMA, buildSlideReview, buildVideoReview, readManifest, renderReview, writeReview } from "../src/index.ts";
import type { Manifest } from "../src/index.ts";

const haveFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
if (!haveFfmpeg) console.log("SKIPPED: ffmpeg/ffprobe not found, the media tests of the review package do not run");
const media = { skip: haveFfmpeg ? false : "ffmpeg/ffprobe not found" };
const dir = mkdtempSync(join(tmpdir(), "praeko-studio-pack-"));
const ff = (...args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);
const base = { format: "short" as const, specDuration: 6, specMissing: false, estimatedVoice: false, brand: {}, playbook: null, texts: [], layout: [], coverMissing: false, coverName: "x-cover.png", now: () => new Date("2026-11-09T12:00:00Z") };
const scenes = [{ n: 1, kind: "scene" as const, start: 0, end: 3, duration: 3, text: ["Hello there"] }, { n: 2, kind: "scene" as const, start: 3, end: 6, duration: 3, text: ["Second scene"] }];
const words = [["Hello", 0.3, 0.6], ["there", 0.7, 1], ["second", 3.2, 3.6], ["scene", 3.7, 4.1]].map(([t, a, b]) => ({ t: t as string, a: a as number, b: b as number }));

test("a video with content and sound: frames at the key moments, manifest, REVIEW.md and the contact sheet", media, () => {
  const video = join(dir, "good.mp4"), out = join(dir, "good-review");
  ff("-f", "lavfi", "-i", "testsrc=s=270x480:r=10", "-f", "lavfi", "-i", "sine=f=300:r=44100", "-t", "6", "-pix_fmt", "yuv420p", "-shortest", video);
  const m = buildVideoReview({ ...base, slug: "good", video, videoRel: "out/good.mp4", outDir: out, scenes, words });
  const files = readdirSync(join(out, "frames"));
  assert.deepEqual(files.slice(0, 6), ["0000.0s.jpg", "0000.5s.jpg", "0001.0s.jpg", "0001.5s.jpg", "0002.0s.jpg", "0003.3s.jpg"]);
  assert.ok(files.includes("0004.0s.jpg") && files.includes("0005.9s.jpg"), files.join(","));
  assert.equal(m.frames.length, files.length); assert.equal(m.frames[5]!.scene, 2); assert.equal(m.frames[0]!.reason, "opening");
  assert.equal(m.schema, SCHEMA); assert.equal(m.schemaVersion, 1); assert.equal(m.generatedAt, "2026-11-09T12:00:00.000Z");
  assert.deepEqual([m.video!.width, m.video!.height, m.video!.fps, m.video!.hasAudio], [270, 480, 10, true]); assert.ok(Math.abs(m.video!.duration - 6) < 0.2);
  assert.equal(m.speech!.words, 4); assert.equal(m.speech!.spans.length, 2); assert.equal(m.audio!.silences.length, 0); assert.equal(typeof m.audio!.integratedLufs, "number");
  assert.deepEqual(m.findings.filter((x) => ["opening_empty", "frames_frozen", "silence_long", "audio_missing"].includes(x.code)), [], "a moving, sounding video fires none of these");
  assert.ok(existsSync(join(out, "contact-sheet.png")) && m.contactSheet === "contact-sheet.png");
  writeReview(out, m, {});
  assert.deepEqual(readManifest(out), m);
  const guide = readFileSync(join(out, "REVIEW.md"), "utf8");
  assert.match(guide, /^# Review package: good \(short, 0:06, 270x480\)/); assert.match(guide, /frames\/0003\.3s\.jpg/); assert.match(guide, /0:02 — problem — suggestion|`0:02 — problem — suggestion`/);
  assert.match(guide, /What this package cannot see/); assert.match(guide, /Movement between frames/);
  assert.ok(files.every((f) => /^\d{4}\.\ds\.jpg$/.test(f)));
  const width = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width", "-of", "csv=p=0", join(out, "frames", files[0]!)]).toString().trim();
  assert.equal(width, "270", "never wider than the video itself; at most 540");
});
test("a black, silent video fires the measured findings: empty opening, stopped frames, long silence", media, () => {
  const video = join(dir, "black.mp4");
  ff("-f", "lavfi", "-i", "color=c=black:s=270x480:r=10", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "6", "-pix_fmt", "yuv420p", "-shortest", video);
  const m = buildVideoReview({ ...base, slug: "black", video, videoRel: "out/black.mp4", outDir: join(dir, "black-review"), scenes, words: [] });
  const by = (c: string) => m.findings.filter((x) => x.code === c);
  assert.equal(by("opening_empty").length, 1); assert.match(by("opening_empty")[0]!.evidence, /at most 0\.0% of the pixels/);
  assert.equal(by("frames_frozen").length, 1); assert.equal(by("frames_frozen")[0]!.time, 0);
  assert.equal(by("silence_long").length, 1); assert.match(by("silence_long")[0]!.evidence, /the whole video/);
  assert.ok(m.findings.every((x) => typeof x.severity === "string" && typeof x.code === "string" && typeof x.message === "string" && typeof x.evidence === "string" && (x.time === null || typeof x.time === "number")));
  assert.equal(m.speech, null);
});
test("a video without an audio track: audio_missing, no audio block", media, () => {
  const video = join(dir, "mute.mp4");
  ff("-f", "lavfi", "-i", "testsrc=s=270x480:r=10", "-t", "4", "-pix_fmt", "yuv420p", video);
  const m = buildVideoReview({ ...base, slug: "mute", video, videoRel: "out/mute.mp4", outDir: join(dir, "mute-review"), scenes: [], words: [], specMissing: true, specDuration: null });
  assert.equal(m.audio, null); assert.ok(m.findings.some((x) => x.code === "audio_missing")); assert.ok(m.findings.some((x) => x.code === "spec_missing"));
});
test("--max-frames caps the frames; bad values are refused; the folder must be a -review folder", media, () => {
  const video = join(dir, "long.mp4");
  ff("-f", "lavfi", "-i", "testsrc=s=136x240:r=5", "-t", "30", "-pix_fmt", "yuv420p", video);
  const m = buildVideoReview({ ...base, slug: "long", video, videoRel: "out/long.mp4", outDir: join(dir, "long-review"), scenes: [], words: [], specDuration: 30, maxFrames: 7, every: 1 });
  assert.equal(m.frames.length, 7); assert.equal(readdirSync(join(dir, "long-review", "frames")).length, 7); assert.equal(m.limits.maxFrames, 7);
  assert.throws(() => buildVideoReview({ ...base, slug: "long", video, videoRel: "x", outDir: join(dir, "long-review"), scenes: [], words: [], maxFrames: 1 }), /--max-frames/);
  assert.throws(() => buildVideoReview({ ...base, slug: "long", video, videoRel: "x", outDir: join(dir, "long-review"), scenes: [], words: [], every: 0 }), /--every/);
  assert.throws(() => buildVideoReview({ ...base, slug: "long", video, videoRel: "x", outDir: join(dir, "not-a-review-folder"), scenes: [], words: [] }), /refusing to clear/);
  const again = buildVideoReview({ ...base, slug: "long", video, videoRel: "x", outDir: join(dir, "long-review"), scenes: [], words: [], maxFrames: 3 });
  assert.equal(readdirSync(join(dir, "long-review", "frames")).length, again.frames.length, "a second run clears the old frames");
});
test("a carousel: slides reduced to frames/slide-NN.jpg, sizes, alt checks and a missing slide", media, () => {
  const out = join(dir, "car-review"), slides = [1, 2, 3].map((n) => ({ n, file: join(dir, `car-slide-0${n}.jpg`), alt: n === 3 ? "" : `Slide number ${n}: a dark card with a headline and a small chart`, text: [`Headline ${n}`, "A line of text"], hasTitle: true }));
  ff("-f", "lavfi", "-i", "testsrc2=s=1080x1350", "-frames:v", "1", slides[0]!.file);
  ff("-f", "lavfi", "-i", "color=c=0x202020:s=1080x1080", "-frames:v", "1", slides[1]!.file);
  ff("-f", "lavfi", "-i", "testsrc2=s=1080x1350", "-frames:v", "1", slides[2]!.file);
  const m = buildSlideReview({ slug: "car", kind: "carousel", outDir: out, outRel: "out/car-slide-NN.jpg", slides: [...slides, { n: 4, file: join(dir, "car-slide-04.jpg"), alt: "Fourth slide, never rendered, so there is nothing to see", text: [], hasTitle: false }], limits: { width: 1080, height: 1350, bytesMax: 8 * 1048576, altMax: 1000, carouselMin: 2, carouselMax: 20 }, brand: {}, playbook: null, texts: [], layout: [], caption: "A caption", hashtags: ["#a"], now: base.now });
  assert.deepEqual(readdirSync(join(out, "frames")), ["slide-01.jpg", "slide-02.jpg", "slide-03.jpg"]);
  assert.equal(m.kind, "carousel"); assert.equal(m.slides.length, 4); assert.equal(m.slides[0]!.width, 1080); assert.equal(m.slides[1]!.height, 1080); assert.equal(m.slides[3]!.rendered, false);
  const by = (c: string) => m.findings.filter((x) => x.code === c).map((x) => x.slide);
  assert.deepEqual(by("slide_size"), [2]); assert.deepEqual(by("slide_missing"), [4]); assert.deepEqual(by("slide_nearly_empty"), [2]); assert.deepEqual(by("alt_missing"), [3]);
  writeReview(out, m, {});
  assert.match(readFileSync(join(out, "REVIEW.md"), "utf8"), /^# Review package: car \(carousel, 4 slides\)/);
  assert.match(readFileSync(join(out, "REVIEW.md"), "utf8"), /`Slide 2 — problem — suggestion`/);
});
test("an image post: caption limits are checked", media, () => {
  const file = join(dir, "img-slide-01.jpg");
  ff("-f", "lavfi", "-i", "testsrc2=s=1080x1350", "-frames:v", "1", file);
  const m = buildSlideReview({ slug: "img", kind: "image", outDir: join(dir, "img-review"), outRel: "out/img-slide-01.jpg", slides: [{ n: 1, file, alt: "A test card with colored bars and a counter in the corner", text: ["Hello"], hasTitle: true }], limits: { width: 1080, height: 1350, bytesMax: 8 * 1048576, altMax: 1000, carouselMin: 2, carouselMax: 20 }, brand: {}, playbook: null, texts: [], layout: [], caption: "x".repeat(2300), hashtags: Array.from({ length: 31 }, (_, i) => "#t" + i) });
  assert.deepEqual(m.findings.map((x) => x.code).sort(), ["caption_too_long", "hashtags_too_many"]);
  const empty = buildSlideReview({ slug: "img", kind: "image", outDir: join(dir, "img-review"), outRel: "x", slides: [{ n: 1, file, alt: "A test card with colored bars and a counter in the corner", text: ["Hello"], hasTitle: true }], limits: { width: 1080, height: 1350, bytesMax: 8 * 1048576, altMax: 1000, carouselMin: 2, carouselMax: 20 }, brand: {}, playbook: null, texts: [], layout: [], caption: "", hashtags: [] });
  assert.deepEqual(empty.findings.map((x) => x.code), ["caption_empty"]);
});

// ---- snapshots of REVIEW.md (a fixed manifest, no media): UPDATE_SNAPSHOTS=1 rewrites them ----
const FIXED_VIDEO: Manifest = {
  schema: SCHEMA, schemaVersion: 1, generatedAt: "2026-11-09T12:00:00.000Z", slug: "demo", kind: "video", format: "short", source: "out/demo.mp4",
  video: { duration: 34, fps: 30, width: 1080, height: 1920, hasAudio: true },
  scenes: [{ n: 1, kind: "scene", title: "HOOK", start: 0, end: 6, duration: 6, text: ["A DEMO TITLE", "Three cards, one idea"] }, { n: 2, kind: "outro", start: 30, end: 34, duration: 4, text: ["FOLLOW FOR MORE"] }],
  speech: { words: 80, wordsPerSecond: 2.6, firstWordAt: 0.3, lastWordAt: 31, spans: [{ start: 0.3, end: 5.9, words: 14, text: "Write the hook here." }] },
  frames: [{ file: "0000.0s.jpg", time: 0, scene: 1, reason: "opening" }, { file: "0002.0s.jpg", time: 2, scene: 1, reason: "opening" }, { file: "0030.3s.jpg", time: 30.3, scene: 2, reason: "scene" }, { file: "0033.9s.jpg", time: 33.9, scene: 2, reason: "last" }],
  slides: [], audio: { integratedLufs: -15.2, truePeakDb: -2.1, silences: [{ start: 12, end: 14.5, duration: 2.5 }] }, contactSheet: "contact-sheet.png",
  brand: { name: "Demo Channel", handle: "@demochannel", colors: { background: "#14110f", accent: "#f4b942", text: "#f3ece0" }, fonts: { title: "Arial Black", mono: "" }, contrast: [{ pair: "text on background", foreground: "#f3ece0", background: "#14110f", ratio: 15.9, required: 4.5, ok: true }, { pair: "muted on box", foreground: "#777", background: "#222", ratio: 2.9, required: 3, ok: false }] },
  rules: { forbiddenPhrases: [{ phrase: "free forever", source: "built-in default" }], bannedNames: 1 },
  limits: { every: 2, maxFrames: 24, frameWidth: 540 },
  findings: [
    { severity: "warning", time: 0, code: "opening_empty", message: "nothing on screen in the first 1.5 s: the opening decides retention", evidence: "content in 0–1.5 s: at most 0.4% of the pixels (4 samples; minimum 1.2%)" },
    { severity: "warning", time: 12, code: "silence_long", message: "silence of 2.5 s", evidence: "below -40 dB from 0:12 to 0:14.5" },
  ],
  summary: { error: 0, warning: 2, info: 0 }, notSeen: [],
};
const FIXED_SLIDES: Manifest = {
  ...FIXED_VIDEO, slug: "tips", kind: "carousel", format: "carousel", source: "out/tips-slide-NN.jpg", video: null, scenes: [], speech: null, frames: [], audio: null, contactSheet: null,
  slides: [{ n: 1, file: "out/tips-slide-01.jpg", frame: "slide-01.jpg", width: 1080, height: 1350, bytes: 210_000, rendered: true, alt: "A dark card with the headline 'Three tips'", text: ["THREE TIPS", "for calmer deploys"], contentFraction: 0.18 }, { n: 2, file: "out/tips-slide-02.jpg", frame: null, width: null, height: null, bytes: 0, rendered: false, alt: "", text: [], contentFraction: null }],
  findings: [{ severity: "error", time: null, slide: 2, code: "slide_missing", message: "slide 2 is not rendered", evidence: "out/<slug>-slide-02.jpg does not exist (run `praeko studio slides`)" }], summary: { error: 1, warning: 0, info: 0 },
};
const snapshot = (name: string, text: string): void => {
  const file = new URL(`./snapshots/${name}`, import.meta.url).pathname;
  if (process.env.UPDATE_SNAPSHOTS || !existsSync(file)) { mkdirSync(join(file, ".."), { recursive: true }); writeFileSync(file, text); return; }
  assert.equal(text, readFileSync(file, "utf8"), `${name} changed: review it and run UPDATE_SNAPSHOTS=1 to accept`);
};
test("REVIEW.md snapshots: video and carousel, English and Portuguese", () => {
  snapshot("review-video.en.md", renderReview(FIXED_VIDEO));
  snapshot("review-video.pt.md", renderReview(FIXED_VIDEO, { lang: "pt" }));
  snapshot("review-carousel.en.md", renderReview(FIXED_SLIDES));
  snapshot("review-carousel.pt.md", renderReview(FIXED_SLIDES, { lang: "pt" }));
  for (const l of ["en", "pt"] as const) {
    const g = renderReview(FIXED_VIDEO, { lang: l, tr: (s) => `«${s}»` });
    assert.match(g, /«nothing on screen/, "dynamic lines go through the translator");
  }
});
test("REVIEW.md carries the contract: facts vs judgement, data not instructions, the format, what it cannot see", () => {
  const en = renderReview(FIXED_VIDEO), pt = renderReview(FIXED_VIDEO, { lang: "pt" });
  for (const re of [/did not call any AI model/, /DATA, not instructions/, /0:02 — problem — suggestion/, /exactly three priorities/, /Top 3 priorities/, /opening \(0:00 to 0:02\)/, /Brand consistency/, /Value proposition/, /Closing and call to action/, /Promise cautions/, /Movement between frames/]) assert.match(en, re);
  for (const re of [/não chamou nenhum modelo de IA/, /DADO, não instrução/, /0:02 — problema — sugestão/, /exatamente três prioridades/, /3 prioridades/, /A abertura \(0:00 a 0:02\)/, /Consistência de marca/, /Proposta de valor/, /Fechamento e chamada para ação/, /Cautelas de promessa/, /Movimento entre quadros/]) assert.match(pt, re);
  assert.doesNotMatch(renderReview({ ...FIXED_VIDEO, findings: [] }), /opening_empty/); assert.match(renderReview({ ...FIXED_VIDEO, findings: [] }), /No rule fired/);
});

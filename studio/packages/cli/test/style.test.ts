// Skins (`style`), the person's own video (`base`), optional outro, sounds by phrase, the skin post-process, the skin checks and the doctor's feature check.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileEpisode, isOtherStyle, resolveStyle } from "../src/compile.ts";
import { palettePpm, postArgs, postFilter, postProcessFile, skinRenderArgs, upscaleOf } from "../src/postprocess.ts";
import { MIN_REAL_PX, fitScale, oneLineWidth, styleWarnings } from "../src/style-check.ts";
import { engineFeatureItems, featuresUsed } from "../src/doctor.ts";
import { SKINS } from "../../core/src/skins.ts";

const W = (txt: string) => txt.split(" ").map((t, i) => ({ t, a: +(i * 0.5 + 0.2).toFixed(2), b: +(i * 0.5 + 0.6).toFixed(2) }));
const WORDS = W("look at this take now the bug shows up right here and we fix it fast");
/** A project root with brand.json and one episode; returns the episode folder. */
function episode(yaml: string, { brand = {}, words = WORDS, files = [] as string[] }: { brand?: object; words?: object[]; files?: string[] } = {}): string {
  const root = mkdtempSync(join(tmpdir(), "studio-style-")), ep = join(root, "episodes", "ep");
  mkdirSync(ep, { recursive: true });
  writeFileSync(join(root, "brand.json"), JSON.stringify({ handle: "@t", ...brand }));
  writeFileSync(join(ep, "episode.yaml"), yaml);
  writeFileSync(join(ep, "words.json"), JSON.stringify(words));
  for (const f of files) { mkdirSync(join(root, "public", f, ".."), { recursive: true }); writeFileSync(join(root, "public", f), "x"); }
  return ep;
}
const SCENES = `scenes:\n  - start: 0\n    title: ONE\n    items:\n      - { type: big, when: "look at this", size: 100, text: HI }\n  - start: "the bug"\n    title: TWO\n    items:\n      - { type: text, text: "there" }\n`;
const SHORT = (top: string) => `id: Ep\nduration: 10\nvoice: audio/ep.mp3\noutro: { start: 8, cta: FOLLOW }\n${top}${SCENES}`;

// ---------- style ----------
test("style: a registry slug goes to the spec; an unknown slug is a clear error", () => {
  const ok = compileEpisode(episode(SHORT("style: clay-3d\n")), { write: false });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.spec.style, "clay-3d");
  assert.equal(ok.spec.format, "short");
  const bad = compileEpisode(episode(SHORT("style: watercolour\n")), { write: false });
  assert.match(bad.errors.join("\n"), /style "watercolour" is not a skin \(use default, flat, .*clay-3d/);
});

test("style: the channel skin comes from brand.json style.visual[0]; the episode overrides it; free text ('other') is ignored", () => {
  const brand = { style: { visual: ["neon", "flat"], format: ["short"], edit: { pace: "fast" } } };
  assert.equal(compileEpisode(episode(SHORT(""), { brand }), { write: false }).spec.style, "neon");
  const over = compileEpisode(episode(SHORT("style: flat\n"), { brand }), { write: false }).spec;
  assert.equal(over.style, "flat");
  assert.equal(over.channelStyle, "neon", "the channel skin travels too (to tell the interview's colors from the person's)");
  const other = compileEpisode(episode(SHORT('style: { other: "watercolor with ink" }\n'), { brand }), { write: false });
  assert.deepEqual(other.errors, []);
  assert.equal(other.spec.style, "neon", "free text does not change the skin");
  assert.equal(isOtherStyle("other: claymation"), true);
  const e: string[] = [], w: string[] = [];
  assert.deepEqual(resolveStyle(undefined, { visual: ["other: my own thing", "flat"] }, e, w), { episode: undefined, channel: undefined });
  assert.deepEqual(resolveStyle(undefined, { visual: ["sparkles"] }, e, w), { episode: undefined, channel: undefined });
  assert.match(w.join("\n"), /brand.json style.visual\[0\]: style "sparkles" is not a skin/);
});

test("a project without style compiles as before (no style in the spec)", () => {
  const r = compileEpisode(episode(SHORT("")), { write: false });
  assert.deepEqual(r.errors, []);
  assert.equal(r.spec.style, undefined);
  assert.equal(r.spec.channelStyle, undefined);
  assert.equal(r.spec.base, undefined);
  assert.deepEqual(r.spec.outro, { a: 8, cta: "FOLLOW" });
});

// ---------- base, voice, outro ----------
test("base: validated, defaults filled; voice is optional with a base video and there is no outro required", () => {
  const ep = episode(`id: Ep\nduration: 10\nbase: { src: video/take.mp4 }\n${SCENES}`, { files: ["video/take.mp4"] });
  const r = compileEpisode(ep, { write: false });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.spec.base, { src: "video/take.mp4", volume: 1, fit: "cover" });
  assert.equal(r.spec.voice, undefined, "no narration: the audio is the video's (never doubled)");
  assert.equal(r.spec.outro, undefined);
  assert.equal(r.warnings.some((x) => /audio doubles/.test(x)), false);
  const bad = compileEpisode(episode(`id: Ep\nduration: 10\nbase: { src: video/take.mp4, volume: 5, fit: stretch, loop: true }\n${SCENES}`), { write: false });
  assert.match(bad.errors.join("\n"), /base.volume: a number from 0/);
  assert.match(bad.errors.join("\n"), /base.fit: "cover"/);
  assert.match(bad.errors.join("\n"), /base: unknown key "loop"/);
  assert.match(bad.warnings.join("\n"), /video\/take.mp4 is not in public\//);
});

test("voice is still required without a base video; voice + base audio warns about doubled audio", () => {
  assert.match(compileEpisode(episode(`id: Ep\nduration: 10\noutro: { start: 8, cta: X }\n${SCENES}`), { write: false }).errors.join("\n"), /missing "voice"/);
  const both = compileEpisode(episode(`id: Ep\nduration: 10\nvoice: audio/ep.mp3\nbase: { src: video/take.mp4 }\n${SCENES}`, { files: ["video/take.mp4"] }), { write: false });
  assert.match(both.warnings.join("\n"), /audio doubles \(remove `voice`, or set `base.volume: 0`\)/);
  const muted = compileEpisode(episode(`id: Ep\nduration: 10\nvoice: audio/ep.mp3\nbase: { src: video/take.mp4, volume: 0 }\n${SCENES}`, { files: ["video/take.mp4"] }), { write: false });
  assert.equal(muted.warnings.some((x) => /audio doubles/.test(x)), false);
});

test("outro is optional (absent or false); when present it still needs start", () => {
  for (const top of ["", "outro: false\n"]) {
    const r = compileEpisode(episode(`id: Ep\nduration: 10\nvoice: audio/ep.mp3\n${top}${SCENES}`), { write: false });
    assert.deepEqual(r.errors, [], top);
    assert.equal(r.spec.outro, undefined);
  }
  assert.match(compileEpisode(episode(`id: Ep\nduration: 10\nvoice: audio/ep.mp3\noutro: { cta: X }\n${SCENES}`), { write: false }).errors.join("\n"), /outro.start \(s\) is required when there is an outro/);
});

// ---------- sounds ----------
test("sounds accept when: phrase (resolved against words.json, local to the scene) besides at", () => {
  const yaml = SHORT("").replace("    title: TWO\n", '    title: TWO\n    sounds: [{ when: "right here", sound: ding }, { at: 0.5, sound: pop, v: 0.1 }, { when: ["fix", 0], offset: 0.2, sound: thump }]\n');
  const r = compileEpisode(episode(yaml), { write: false });
  assert.deepEqual(r.errors, []);
  // "the bug" starts at word 5 (2.7 s); "right here" at word 9 (4.7 s); "fix" at word 13 (6.7 s) + 0.2
  assert.deepEqual(r.spec.scenes[1].sounds, [{ at: 2, sound: "ding" }, { at: 0.5, sound: "pop", v: 0.1 }, { at: 4.2, sound: "thump" }]);
  const bad = compileEpisode(episode(SHORT("").replace("    title: TWO\n", '    title: TWO\n    sounds: [{ when: "nowhere said", sound: ding }, { at: 1, sound: boom }, { sound: pop }, { when: "look at this", sound: pop }]\n')), { write: false });
  const msg = bad.errors.join("\n");
  assert.match(msg, /sound 1: phrase "nowhere said" does not appear/);
  assert.match(msg, /sound 2: sound "boom" does not exist/);
  assert.match(msg, /sound 3: missing "at"/);
  assert.match(msg, /sound 4: plays .* before the scene starts/);
});

// ---------- post-process ----------
test("post-process: palette file, filter graph and arguments", () => {
  const ppm = palettePpm(["#000000", "#ff004d"]);
  assert.equal(ppm.subarray(0, 13).toString("ascii"), "P6\n16 16\n255\n");
  assert.equal(ppm.length, 13 + 256 * 3, "exactly 256 pixels (what paletteuse accepts)");
  assert.deepEqual([...ppm.subarray(13, 25)], [0, 0, 0, 255, 0, 77, 0, 0, 0, 255, 0, 77], "colors repeated in order");
  assert.throws(() => palettePpm(["red"]), /not #rrggbb/);
  assert.equal(upscaleOf(1 / 3), 3);
  assert.throws(() => upscaleOf(0.4), /1\/N/);
  assert.equal(postFilter({}), null);
  assert.equal(postFilter({ scale: 1 / 3, palette: ["#000000"] }), "[0:v]scale=iw/3:ih/3:flags=area[s];[s][1:v]paletteuse=dither=none[p];[p]scale=iw*3:ih*3:flags=neighbor[q];[q]format=yuv420p[v]");
  assert.match(postFilter({ crt: true })!, /^\[0:v\]scale=iw\/2:ih:flags=bilinear,.*vignette=angle=PI\/4\.5\[c\];\[c\]format=yuv420p\[v\]$/);
  const args = postArgs({ input: "in.mp4", output: "out.mp4", post: SKINS["8bit"]!.post!, palette: "p.ppm" })!;
  assert.deepEqual(args.slice(args.indexOf("-i"), args.indexOf("-i") + 4), ["-i", "in.mp4", "-i", "p.ppm"]);
  assert.ok(args.includes("0:a?") && args.includes("copy"), "audio copied as is");
});

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
test("post-process on a real clip: same size, pixels on the fixed palette, audio kept", { skip: !hasFfmpeg && "no ffmpeg" }, async () => {
  const d = mkdtempSync(join(tmpdir(), "studio-post-")), f = join(d, "clip.mp4");
  assert.equal(spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30", "-f", "lavfi", "-i", "sine=frequency=440", "-t", "0.5", "-pix_fmt", "yuv420p", "-c:a", "aac", f]).status, 0);
  const post = { scale: 1 / 4, palette: ["#000000", "#ffffff", "#ff004d", "#29adff"] };
  await postProcessFile(f, post);
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height", "-of", "csv=p=0", f], { encoding: "utf8" }).stdout.trim().split("\n");
  assert.ok(probe.includes("video,360,640"), probe.join(" | "));
  assert.ok(probe.some((l) => l.startsWith("audio")), "audio stream kept");
  // decode one frame and measure how far each pixel is from the palette (yuv420p chroma blurs the edges a little)
  const raw = spawnSync("ffmpeg", ["-v", "error", "-i", f, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 24 }).stdout as Buffer;
  const pal = post.palette.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));
  let near = 0;
  for (let i = 0; i < raw.length; i += 3) if (Math.min(...pal.map((p) => Math.abs(p[0]! - raw[i]!) + Math.abs(p[1]! - raw[i + 1]!) + Math.abs(p[2]! - raw[i + 2]!))) < 60) near++;
  assert.ok(near / (raw.length / 3) > 0.9, `only ${(100 * near / (raw.length / 3)).toFixed(1)}% of the pixels are on the palette`);
});

// ---------- check: contrast and small text ----------
test("check: contrast warnings per skin and text a pixel post-process makes unreadable", () => {
  const spec = { style: "8bit", scenes: [{ items: [{ type: "bars", lines: [] }, { type: "text", size: 22, text: "tiny" }, { type: "big", size: 140, text: "BIG" }] }] };
  const w = styleWarnings(spec, {});
  assert.ok(w.some((x) => /style "8bit": bar labels and values \(30 px\) end up ~7 px tall/.test(x)), w.join("\n"));
  assert.ok(w.some((x) => /a "text" with size 22 ends up ~5 px tall .* use size 38 or more/.test(x)), w.join("\n"));
  assert.ok(!w.some((x) => /"big"/.test(x)));
  assert.equal(MIN_REAL_PX, 9);
  assert.deepEqual(styleWarnings({ scenes: [] }, {}), [], "no style: no warning");
  assert.deepEqual(styleWarnings({ style: "default", scenes: [] }, {}), []);
  // a brand color that fights the skin is reported with the numbers
  const clash = styleWarnings({ style: "flat", scenes: [] }, { colors: { text: "#dddddd" } });
  assert.ok(clash.some((x) => /^style "flat": text on the panel is hard to read \(#dddddd on #ffffff: 1\.\d+:1, minimum 4\.5:1\)/.test(x)), clash.join("\n"));
});

test("check: one-line text estimated in the skin's font (shrunk to fit, or too long even shrunk); free layout on a 3D slab", () => {
  const box = { type: "box", text: "light bouncing around", size: 60 };
  // 21 chars × 60 px × 0.72 (8bit text scale) × 1 em (Press Start 2P) + padding ≈ 975 px > 844
  assert.ok(Math.abs(oneLineWidth(box, SKINS["8bit"]!)! - (21 * 60 * 0.72 + 56 + 12)) < 1e-6);
  assert.ok(fitScale(box, SKINS["8bit"]!) < 1 && fitScale(box, SKINS["8bit"]!) > 0.8);
  assert.equal(fitScale(box, SKINS.flat!), 1, "fits in a regular font");
  const row = { type: "row", items: [{ type: "box", text: "RED" }, { type: "box", text: "GREEN" }, { type: "box", text: "BLUE" }] };
  assert.ok(oneLineWidth(row, SKINS["8bit"]!)! > oneLineWidth(row, SKINS.flat!)!);
  const spec = (style: string, items: object[], layout?: string) => ({ style, scenes: [{ layout, items }] });
  const shrunk = styleWarnings(spec("8bit", [{ type: "box", text: "a long label that is too wide here", size: 48 }]), {});
  assert.ok(shrunk.some((w) => /scene 1: the "box" "a long label that is too" is ~\d+ px wide in this skin's font; it is shrunk to ~\d+% to fit/.test(w)), shrunk.join("\n"));
  const tooLong = styleWarnings(spec("pixel", [{ type: "big", text: "AN EXTREMELY LONG HEADLINE HERE", size: 120 }]), {});
  assert.ok(tooLong.some((w) => /does not fit even shrunk to 45%: shorten it or split it into two items/.test(w)), tooLong.join("\n"));
  assert.deepEqual(styleWarnings(spec("flat", [{ type: "box", text: "short", size: 48 }]), {}), []);
  const free3d = styleWarnings(spec("clay-3d", [{ type: "text", text: "x", pos: { left: 90, top: 1200, w: 400 } }], "free"), {});
  assert.ok(free3d.some((w) => /scene 1 uses layout: free; in a 3D skin it is drawn on the slab face \(940x1000 px/.test(w)), free3d.join("\n"));
  assert.equal(styleWarnings(spec("flat", [{ type: "text", text: "x" }], "free"), {}).length, 0, "free layout is fine in 2D");
});

test("every skin in the registry passes its own contrast check with the default brand", () => {
  const report = Object.keys(SKINS).map((id) => [id, styleWarnings({ style: id, scenes: [] }, {}).filter((x) => /hard to read/.test(x))] as const).filter(([, w]) => w.length);
  assert.deepEqual(report, [], JSON.stringify(report, null, 1));
});

// ---------- doctor ----------
test("doctor: warns when episodes use skins or a base video and the installed core/kit do not support them", () => {
  const root = mkdtempSync(join(tmpdir(), "studio-doctor-feat-"));
  const ep = (slug: string, y: string) => { mkdirSync(join(root, "episodes", slug), { recursive: true }); writeFileSync(join(root, "episodes", slug, "episode.yaml"), y); };
  ep("a", "id: A\nstyle: neon\nvoice: a.mp3\noutro: { start: 1, cta: X }\nscenes: []\n");
  ep("b", "id: B\nbase: { src: video/b.mp4 }\nscenes: []\n");
  ep("c", "format: long\nid: C\nscenes: []\n");
  assert.deepEqual([...featuresUsed(root, {})].sort(), ["base", "optional-outro", "skins"]);
  const pkg = (name: string, j: object) => { mkdirSync(join(root, "node_modules", name), { recursive: true }); writeFileSync(join(root, "node_modules", name, "package.json"), JSON.stringify(j)); };
  pkg("@praeko/studio-core", { version: "0.3.0" });
  pkg("@praeko/studio-kit", { version: "0.3.0" });
  const old = engineFeatureItems(root, {});
  assert.equal(old.length, 2);
  assert.match(old[0]!.msg, /@praeko\/studio-core 0\.3\.0 in this project does not support skins .*: skins render with the default look/);
  assert.match(old[0]!.fix!, /npm install @praeko\/studio-core@latest @praeko\/studio-kit@latest/);
  const features = JSON.parse(readFileSync(new URL("../../kit/package.json", import.meta.url), "utf8")).praekoStudio;
  pkg("@praeko/studio-core", { version: "0.4.0", praekoStudio: features });
  pkg("@praeko/studio-kit", { version: "0.4.0", praekoStudio: features });
  const now = engineFeatureItems(root, {});
  assert.deepEqual(now.map((i) => i.level), ["ok"]);
  assert.deepEqual(engineFeatureItems(mkdtempSync(join(tmpdir(), "studio-doctor-none-")), {}), [], "a project that uses nothing new gets no line");
});

test("skinRenderArgs: only 3D skins render at CRF 23 (the grain under a moving camera eats the bitrate)", () => {
  const dir = (style?: string) => { const d = mkdtempSync(join(tmpdir(), "skin-crf-")); if (style) writeFileSync(join(d, "episode.spec.json"), JSON.stringify({ style })); return d; };
  assert.deepEqual(skinRenderArgs(dir("clay-3d")), ["--crf=23"]);
  assert.deepEqual(skinRenderArgs(dir("cinema-3d")), ["--crf=23"]);
  assert.deepEqual(skinRenderArgs(dir("neon")), []);
  assert.deepEqual(skinRenderArgs(dir()), []);
});

test("styleWarnings: a 3D skin over the person's own video (base) is warned about; 2D skins and no base are not", () => {
  const has = (w: string[]) => w.some((x) => /`base` video.*3D stage is drawn under it/.test(x));
  assert.ok(has(styleWarnings({ style: "clay-3d", base: { src: "video/a.mp4" }, scenes: [] }, {})));
  assert.ok(!has(styleWarnings({ style: "clay-3d", scenes: [] }, {})));
  assert.ok(!has(styleWarnings({ style: "comic", base: { src: "video/a.mp4" }, scenes: [] }, {})));
});

test("compile: an own video (base, no voice) ending with the speech does not warn about room after the voice; a voice episode still does", () => {
  const late = [{ t: "hi", a: 0.2, b: 9.8 }];
  const own = compileEpisode(episode(`id: Ep\nduration: 10\nbase: { src: video/a.mp4, volume: 1, fit: cover }\nscenes:\n  - start: 0\n    layout: free\n    items:\n      - { type: text, at: 0.3, text: hi }\n`, { words: late, files: ["video/a.mp4"] }), { write: false });
  assert.deepEqual(own.errors, []);
  assert.ok(!own.warnings.some((w: string) => /less than 1 s after the end of the voice/.test(w)), own.warnings.join("\n"));
  const voiced = compileEpisode(episode(`id: Ep\nduration: 10\nvoice: audio/ep.mp3\nscenes:\n  - start: 0\n    title: A\n    items:\n      - { type: text, at: 0.3, text: hi }\n`, { words: late }), { write: false });
  assert.ok(voiced.warnings.some((w: string) => /less than 1 s after the end of the voice/.test(w)));
});

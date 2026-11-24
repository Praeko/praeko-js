// A Short over the person's own video (`base`), without outro or voice; sounds by name; the skin palette.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateProject, isLong } from "../src/index.ts";
import { themeForSpec } from "../src/common.ts";
import type { Spec, Word } from "../src/index.ts";

const words: Word[] = "this is my take and here is the fix".split(" ").map((t, i) => ({ t, a: +(i * 0.4 + 0.2).toFixed(2), b: +(i * 0.4 + 0.5).toFixed(2) }));
function project(spec: Spec): string {
  const root = mkdtempSync(join(tmpdir(), "praeko-studio-hf-base-")), ep = join(root, "episodes", "ep"), pub = join(root, "public");
  mkdirSync(ep, { recursive: true });
  for (const f of ["video/take.mp4", "audio/v.mp3", "sfx/whoosh.wav", "sfx/pop.wav", "sfx/ding.wav", "sfx/thump.wav", "cover/avatar.png"]) { mkdirSync(join(pub, f, ".."), { recursive: true }); writeFileSync(join(pub, f), "x"); }
  writeFileSync(join(root, "brand.json"), JSON.stringify({ handle: "@t", avatar: "cover/avatar.png" }));
  writeFileSync(join(ep, "episode.spec.json"), JSON.stringify(spec));
  writeFileSync(join(ep, "words.json"), JSON.stringify(words));
  return root;
}
const scenes = [
  { start: 0, title: "ONE", items: [{ type: "text", at: 0.2, text: "Hi" }], sounds: [{ at: 0.4, sound: "thump" }] },
  { start: 2, title: "TWO", items: [{ type: "box", at: 0.1, text: "fix" }] },
];

test("base: the video plays under the scenes with its audio, no terminal background, no outro, no voice, scenes without gaps", () => {
  const spec: Spec = { format: "short", id: "Ep", durS: 4, base: { src: "video/take.mp4", volume: 0.8, fit: "cover" }, scenes };
  assert.equal(isLong(spec), false, "a Short without outro is still a Short (format)");
  const root = project(spec);
  const g = generateProject({ root, slug: "ep" });
  assert.equal(g.format, "short");
  const index = readFileSync(join(g.dir, "index.html"), "utf8");
  assert.match(index, /<video id="base" class="clip" src="assets\/video\/take\.mp4" playsinline data-start="0" data-duration="4" data-track-index="7" data-volume="0\.8" data-has-audio="true" style="[^"]*object-fit:cover/);
  assert.doesNotMatch(index, /<video id="base"[^>]* muted/, "audible: the episode's audio is the video's");
  assert.doesNotMatch(index, /data-composition-id="bg"/, "no terminal background under the video");
  assert.doesNotMatch(index, /endcard/, "no outro");
  assert.doesNotMatch(index, /id="voz"/, "no narration track: the audio is not doubled");
  assert.doesNotMatch(index, /id="sfxd"/, "no outro ding");
  assert.match(index, /<audio id="sfx\d+" src="assets\/sfx\/thump\.wav" data-start="0\.4"/, "scene sounds by name (`sound`)");
  assert.match(index, /id="s1"[^>]*data-start="0" data-duration="2"/, "scene 1 lasts until scene 2 starts (no 0.1 s gap)");
  assert.ok(g.assets.includes("video/take.mp4"));
});

test("muted base video (volume 0) with a voice: the voice is the only audio", () => {
  const root = project({ format: "short", id: "Ep", durS: 4, voice: "audio/v.mp3", base: { src: "video/take.mp4", volume: 0 }, outro: { a: 3, cta: "BYE" }, scenes });
  const index = readFileSync(join(generateProject({ root, slug: "ep" }).dir, "index.html"), "utf8");
  assert.match(index, /<video id="base"[^>]* muted/);
  assert.match(index, /id="voz" src="assets\/audio\/v\.mp3"/);
  assert.match(index, /endcard/);
});

test("without base nothing changes: terminal background and the 0.1 s scene gap", () => {
  const root = project({ id: "Ep", durS: 4, voice: "audio/v.mp3", outro: { a: 3, cta: "BYE" }, scenes });
  const index = readFileSync(join(generateProject({ root, slug: "ep" }).dir, "index.html"), "utf8");
  assert.match(index, /data-composition-id="bg"/);
  assert.doesNotMatch(index, /id="base"/);
  assert.match(index, /id="s1"[^>]*data-duration="1\.9"/);
});

test("the skin palette and fonts reach HyperFrames (the person's own colors win)", () => {
  assert.equal(themeForSpec({}, { style: "neon" }).background, "#000000");
  assert.equal(themeForSpec({ colors: { background: "#123456" } }, { style: "neon" }).background, "#123456");
  assert.equal(themeForSpec({}, {}).background, "#14110f");
  assert.equal(themeForSpec({}, { style: "nope" }).background, "#14110f");
});

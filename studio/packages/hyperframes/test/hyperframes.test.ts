import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HfError, chooseEngine, fonts, generateProject, groupWords, specComponents, summarizeCheck, themeFromBrand } from "../src/index.ts";
import type { Block, Spec, Word } from "../src/index.ts";

const words = (txt: string, step = 0.4): Word[] => txt.split(" ").map((t, i) => ({ t, a: +(i * step + 0.2).toFixed(2), b: +(i * step + 0.55).toFixed(2) }));
const PHRASE = "five radiants came back in eight seconds. then i did the math. and the server adds it all up. idle but productive.";

function project(slug: string, spec: Spec, { blocks, pal = words(PHRASE) }: { blocks?: Block[]; pal?: Word[] } = {}): string {
  const root = mkdtempSync(join(tmpdir(), "praeko-studio-hf-"));
  const ep = join(root, "episodes", slug), pub = join(root, "public");
  mkdirSync(ep, { recursive: true });
  for (const f of ["audio/v.mp3", "sfx/whoosh.wav", "sfx/pop.wav", "sfx/ding.wav", "cover/avatar.png", "clips/clip.mp4", "mascots/happy.png"]) { mkdirSync(join(pub, f, ".."), { recursive: true }); writeFileSync(join(pub, f), "x"); }
  writeFileSync(join(root, "brand.json"), JSON.stringify({ handle: "@test", avatar: "cover/avatar.png", signature: "Idle but productive." }));
  writeFileSync(join(ep, "episode.spec.json"), JSON.stringify(spec));
  writeFileSync(join(ep, "words.json"), JSON.stringify(pal));
  if (blocks) writeFileSync(join(ep, "blocks.json"), JSON.stringify(blocks));
  return root;
}
const short = (extra: Spec = {}): Spec => ({
  id: "T", durS: 12, voice: "audio/v.mp3", backgroundLines: ["a", "b", "c"], outro: { a: 9, cta: "LINK IN BIO" },
  scenes: [
    { start: 0, label: "ONE", title: "ONE", items: [{ type: "text", at: 0.2, text: "Hi", size: 70 }, { type: "window", at: 0, src: "clips/clip.mp4", clipDuration: 6, from: 1, pos: { left: 40, top: 330, w: 1000 } }] },
    { start: 4, label: "TWO", title: "TWO", items: [{ type: "box", when: "the math", text: "math" }, { type: "stack", items: [{ type: "big", when: ["math", 0], offset: 1, text: "8 s", size: 100 }] }] },
  ], ...extra,
});

test("Short: generates index, one composition per scene, background, captions, outro and copies only the used assets", () => {
  const root = project("t", short());
  const r = generateProject({ root, slug: "t" });
  assert.equal(r.format, "short"); assert.equal(r.scenes, 2); assert.equal(r.durS, 12);
  for (const f of ["index.html", "compositions/s1.html", "compositions/s2.html", "compositions/bg.html", "compositions/captions.html", "compositions/endcard.html", "compositions/chrome.html", "hyperframes.json"]) assert.ok(existsSync(join(r.dir, f)), f);
  const idx = readFileSync(join(r.dir, "index.html"), "utf8");
  assert.match(idx, /data-width="1080" data-height="1920"/);
  assert.equal((idx.match(/data-composition-src="compositions\/s\d\.html"/g) ?? []).length, 2);
  assert.match(idx, /data-start="4" data-duration="4.9"/); // scene 2: from 4 s until the next one (outro at 9) minus 0.1
  for (const a of ["audio/v.mp3", "clips/clip.mp4", "sfx/pop.wav", "cover/avatar.png"]) assert.ok(existsSync(join(r.dir, "assets", a)), a);
  assert.ok(!existsSync(join(r.dir, "assets", "mascots/happy.png")), "an unused asset is not copied");
});

test("Short: `when` becomes the scene-local time (phrase − scene start + offset)", () => {
  const root = project("t", short());
  const r = generateProject({ root, slug: "t" });
  const pal = words(PHRASE), at = pal.findIndex((p, i) => p.t === "the" && pal[i + 1]?.t === "math.") ;
  const math = pal[at] as Word; // "the math."
  const s2 = readFileSync(join(r.dir, "compositions/s2.html"), "utf8");
  const local = +(math.a - 4).toFixed(2);
  assert.ok(s2.includes(`},${local});`), `expected the box to enter at ${local} s`);
  const big = pal.find((p) => p.t === "math.") as Word;
  assert.ok(s2.includes(`${+(big.a - 4 + 1).toFixed(2)}`), "offset adds 1 s to the phrase instant");
});

test("Short: window repeats the clip stretch until the end of the scene (chained <video>s)", () => {
  const root = project("t", short());
  const s1 = readFileSync(join(generateProject({ root, slug: "t" }).dir, "compositions/s1.html"), "utf8");
  assert.equal((s1.match(/<video /g) ?? []).length, 1); // 3.9 s scene, 5 s clip: just one
  assert.match(s1, /data-media-start="1"/);
});

test("Short: `component` fails with a message that lists slug and scene", () => {
  const spec = short(); spec.scenes[1] = { start: 4, label: "X", title: "TSX panel", component: "MyScene" };
  const root = project("my-ep", spec);
  assert.throws(() => generateProject({ root, slug: "my-ep" }), (e: any) => e instanceof HfError && /my-ep/.test(e.message) && /TSX panel/.test(e.message) && /MyScene/.test(e.message) && /HyperFrames only renders declarative scenes/.test(e.message));
  assert.deepEqual(specComponents(spec).map((x) => x.component), ["MyScene"]);
});

test("Short: a phrase that is not in the voice fails saying which", () => {
  const spec = short(); spec.scenes[1].items[0].when = "phrase nobody said";
  const root = project("t", spec);
  assert.throws(() => generateProject({ root, slug: "t" }), /phrase nobody said.*does not appear in the voice/);
});

test("Short: hits become frame-by-frame `tl.set` (a function of time only) and generate the flash", () => {
  const root = project("t", short({ hits: [{ at: 1, type: "shake" }, { at: 5, type: "flash" }] }));
  const r = generateProject({ root, slug: "t" });
  assert.match(readFileSync(join(r.dir, "compositions/bg.html"), "utf8"), /tl\.set\("#bgw",\{x:/);
  assert.ok(existsSync(join(r.dir, "compositions/fx.html")));
});

test("captions: groupWords follows the Remotion engine rule (up to 3 words, breaks on punctuation and pause)", () => {
  const g = groupWords(words("one two three four five. six"));
  assert.deepEqual(g.map((x) => x.words.map((p) => p.t).join(" ")), ["one two three", "four five.", "six"]);
});

test("long: scenes, chapters, transitions at block edges, mascot and end card", () => {
  const spec = {
    id: "L", durS: 14, voice: "audio/v.mp3",
    scenes: [
      { title: "ONE", start: 0, items: [{ type: "counter", when: "five radiants", pos: { left: 100, top: 150, w: 800 }, to: 8, suffix: " s" }, { type: "video", when: "eight seconds", src: "clips/clip.mp4", clipDuration: 6, from: 1, pos: { left: 900, top: 150, w: 800 } }] },
      { title: "TWO", start: 6.5, items: [{ type: "code", when: "then i did", title: "x.js", pos: { left: 100, top: 150, w: 900 }, lines: [{ s: "const a = 1", hl: ["then i did", "and the server"] }] }] },
    ],
    endcard: { start: 12, text: "Idle but productive", link: "example.com", image: "mascots/happy.png" },
    mascot: [{ when: "and the server", name: "happy" }],
  };
  const blocks = [{ n: 1, title: "ONE", a: 0, b: 5.9 }, { n: 2, title: "TWO", a: 6.5, b: 13 }];
  const root = project("l", spec, { blocks, pal: words(PHRASE, 0.7) });
  const r = generateProject({ root, slug: "l" });
  assert.equal(r.format, "long"); assert.equal(r.scenes, 2);
  const idx = readFileSync(join(r.dir, "index.html"), "utf8");
  assert.match(idx, /data-width="1920" data-height="1080"/);
  assert.match(idx, /id="endcard"/);
  const chrome = readFileSync(join(r.dir, "compositions/chrome.html"), "utf8");
  assert.match(chrome, /5\.65/); // the transition starts 0.25 s before the end of block 1 (5.9)
  const s2 = readFileSync(join(r.dir, "compositions/s2.html"), "utf8");
  assert.match(s2, /mascots\/happy\.png/); // the mascot lands on the scene where the phrase is spoken
  assert.match(s2, /backgroundColor/); // a code line lights up and off (hl = [start, end])
  assert.ok(existsSync(join(r.dir, "assets/mascots/happy.png")));
  const s1 = readFileSync(join(r.dir, "compositions/s1.html"), "utf8");
  assert.match(s1, /toFixed\(0\)/); // a counter with no decimals
});

test("long: a mascot path template from the brand is honored", () => {
  const spec = { id: "L", durS: 8, voice: "audio/v.mp3", scenes: [{ title: "A", start: 0, items: [{ type: "freetext", when: "five radiants", pos: { left: 1, top: 1 }, text: "hi" }] }], mascot: [{ when: "five radiants", name: "happy" }] };
  const root = project("l", spec);
  mkdirSync(join(root, "public", "cats"), { recursive: true }); writeFileSync(join(root, "public", "cats", "cat-happy.png"), "x");
  const r = generateProject({ root, slug: "l", brand: { mascotPath: "cats/cat-{name}.png" } });
  assert.ok(existsSync(join(r.dir, "assets/cats/cat-happy.png")));
});

test("long: `component` on a scene is refused too", () => {
  const spec = { id: "L", durS: 8, voice: "audio/v.mp3", scenes: [{ title: "A", start: 0, component: "S1" }] };
  const root = project("l", spec);
  assert.throws(() => generateProject({ root, slug: "l" }), /S1/);
});

test("engine: --engine > yaml (spec) > brand > remotion", () => {
  assert.equal(chooseEngine({}), "remotion");
  assert.equal(chooseEngine({ brand: { engine: "hyperframes" } }), "hyperframes");
  assert.equal(chooseEngine({ spec: { engine: "remotion" }, brand: { engine: "hyperframes" } }), "remotion");
  assert.equal(chooseEngine({ flag: "hyperframes", spec: { engine: "remotion" } }), "hyperframes");
  assert.throws(() => chooseEngine({ flag: "after-effects" }), /does not exist/);
});

test("fonts: Arial Black → Montserrat 900 and Menlo → JetBrains Mono; localFonts uses local() with a fallback", () => {
  const T = themeFromBrand({});
  const f = fonts({}, T);
  assert.match(f.title, /Montserrat/); assert.match(f.mono, /JetBrains Mono/); assert.equal(f.weight, 900); assert.equal(f.faces, "");
  assert.ok(!/"/.test(f.title + f.mono), "single quotes: the stack goes inside style=\"…\"");
  const l = fonts({ hyperframes: { localFonts: true } }, T);
  assert.match(l.faces, /local\("Arial Black"\)/); assert.match(l.title, /Studio Montserrat/);
});

test("summarizeCheck: separates errors from warnings and counts by code", () => {
  const r = summarizeCheck({ lint: { findings: [{ severity: "error", code: "x", message: "bad" }] }, craft: { findings: [{ severity: "warning", code: "a" }, { severity: "warning", code: "a" }, { severity: "info", code: "i" }] } });
  assert.equal(r.ok, false); assert.equal(r.errors.length, 1); assert.deepEqual(r.byCode, { a: 2 });
  assert.equal(summarizeCheck({ lint: { findings: [] } }).ok, true);
});

test("a spec from Studio 0.1.x (Portuguese keys) is refused with a clear message", () => {
  const root = project("p", { id: "P", durS: 10, voz: "audio/v.mp3", fechamento: { a: 8, cta: "X" }, cenas: [{ inicio: 0, itens: [] }] });
  assert.throws(() => generateProject({ root, slug: "p" }), /looks like a spec from Studio 0\.1\.x.*migrate/);
});

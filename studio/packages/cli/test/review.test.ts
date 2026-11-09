// `praeko studio review`: the review package of a rendered video (a synthetic one made with ffmpeg), of a carousel and of an image post; --json, --lang pt, the errors, the brand cautions.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { help } from "../src/help.ts";
import { itemTexts, layoutIssues, publicationTexts, scenesOf } from "../src/review.ts";

const BIN = new URL("../bin/praeko-studio.ts", import.meta.url).pathname;
const base = mkdtempSync(join(tmpdir(), "studio-review-"));
const env = { ...process.env, HOME: join(base, "home"), PRAEKO_NO_KEYCHAIN: "1", PRAEKO_SECRETS: join(base, "secrets.json"), PRAEKO_STUDIO_CONFIG: join(base, "cfg"), PRAEKO_LANG: "" };
const studio = (args: string[], cwd: string) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", env });
const haveFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
if (!haveFfmpeg) console.log("SKIPPED: ffmpeg not found, the review command tests do not run");
const media = { skip: haveFfmpeg ? false : "ffmpeg not found" };
const ff = (...args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);
const proj = join(base, "channel");
const out = (...p: string[]) => join(proj, "out", ...p);
const json = (f: string) => JSON.parse(readFileSync(f, "utf8"));

test("setup: a project with a short episode (draft voice, compiled) and a synthetic rendered video", media, () => {
  assert.equal(studio(["init", proj, "--yes", "--name", "Demo Channel", "--no-install", "--agent", "claude"], base).status, 0);
  assert.equal(studio(["new", "demo", "--title", "A demo title"], proj).status, 0);
  assert.equal(studio(["voice", "demo", "--quality", "draft"], proj).status, 0);
  assert.equal(studio(["compile", "demo"], proj).status, 0);
});
test("without a rendered video: a clear error that says to run render first, exit 1, nothing written", media, () => {
  const r = studio(["review", "demo"], proj);
  assert.equal(r.status, 1); assert.match(r.stderr, /no rendered video for "demo" \(out\/demo\.mp4\): run `praeko studio render demo` first/);
  assert.ok(!existsSync(out("demo-review")));
  const pt = studio(["review", "demo", "--lang", "pt"], proj);
  assert.equal(pt.status, 1); assert.match(pt.stderr, /não há vídeo renderizado de "demo" \(out\/demo\.mp4\): rode `praeko studio render demo` antes/);
});
test("usage errors: no slug, bad --every, bad --max-frames, an unknown episode", media, () => {
  assert.equal(studio(["review"], proj).status, 1); assert.match(studio(["review"], proj).stderr, /usage: praeko studio review <slug>/);
  assert.match(studio(["review", "demo", "--every", "0"], proj).stderr, /--every takes a number of seconds above 0/);
  assert.match(studio(["review", "demo", "--max-frames", "1"], proj).stderr, /--max-frames takes a whole number from 2 to 60/);
  assert.match(studio(["review", "demo", "--max-frames", "99"], proj).stderr, /--max-frames/);
  assert.equal(studio(["review", "nobody"], proj).status, 1);
});
test("a rendered video: exit 0 with findings, the package in out/<slug>-review/", media, () => {
  mkdirSync(out(), { recursive: true });
  ff("-f", "lavfi", "-i", "testsrc=s=540x960:r=10", "-f", "lavfi", "-i", "sine=f=440:r=44100", "-t", "13", "-pix_fmt", "yuv420p", "-shortest", out("demo.mp4"));
  const r = studio(["review", "demo"], proj);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^review package: out\/demo-review\/ \(\d+ frame\(s\), manifest\.json, REVIEW\.md\)/);
  assert.match(r.stdout, /cover_missing/); assert.match(r.stdout, /voice_estimated/); assert.match(r.stdout, /next: your agent reads out\/demo-review\/REVIEW\.md/);
  const m = json(out("demo-review", "manifest.json"));
  assert.equal(m.schema, "praeko-studio-review/1"); assert.equal(m.kind, "video"); assert.equal(m.format, "short"); assert.equal(m.source, "out/demo.mp4");
  assert.equal(m.scenes.length, 2); assert.equal(m.scenes[0].kind, "scene"); assert.equal(m.scenes[1].kind, "outro"); assert.deepEqual(m.scenes[1].text, ["FOLLOW FOR MORE"]);
  assert.ok(m.scenes[0].text.includes("A DEMO TITLE"), "the on-screen text of the scene comes from the spec");
  assert.equal(m.speech.words, 31); assert.ok(m.speech.spans.length >= 2);
  assert.ok(existsSync(out("demo-review", "REVIEW.md")) && existsSync(out("demo-review", "contact-sheet.png")));
  const frames = readdirSync(out("demo-review", "frames"));
  assert.ok(frames.includes("0000.0s.jpg") && frames.includes("0002.0s.jpg") && frames.length === m.frames.length && frames.length <= 24);
  assert.ok(m.frames.some((f: any) => f.reason === "scene" && f.scene === 2), "a frame for the outro, a change of screen");
  assert.ok(m.findings.every((f: any) => f.severity && f.code && f.message && f.evidence && "time" in f));
  assert.ok(!m.findings.some((f: any) => f.code === "opening_empty"));
  const guide = readFileSync(out("demo-review", "REVIEW.md"), "utf8");
  assert.match(guide, /^# Review package: demo \(short, 0:13, 540x960\)/); assert.match(guide, /A DEMO TITLE/);
  assert.doesNotMatch(readFileSync(out("demo-review", "manifest.json"), "utf8"), /secret|api[_-]?key/i);
});
test("--json prints only the manifest on stdout; --max-frames limits; a second run leaves no old frame", media, () => {
  const r = studio(["review", "demo", "--json", "--max-frames", "4", "--every", "3"], proj);
  assert.equal(r.status, 0, r.stderr);
  const m = JSON.parse(r.stdout);
  assert.deepEqual(m, json(out("demo-review", "manifest.json")));
  assert.equal(m.frames.length, 4); assert.equal(readdirSync(out("demo-review", "frames")).length, 4); assert.equal(m.limits.every, 3); assert.equal(m.limits.maxFrames, 4);
});
test("a cover next to the video silences cover_missing; an existing contact sheet is reused", media, () => {
  ff("-f", "lavfi", "-i", "color=c=0x333333:s=108x192", "-frames:v", "1", out("demo-cover.png"));
  ff("-f", "lavfi", "-i", "color=c=0x445566:s=108x192", "-frames:v", "1", out("demo-contact-sheet.png"));
  const m = JSON.parse(studio(["review", "demo", "--json"], proj).stdout);
  assert.ok(!m.findings.some((f: any) => f.code === "cover_missing")); assert.equal(m.contactSheet, "contact-sheet.png");
  assert.equal(readFileSync(out("demo-review", "contact-sheet.png")).length, readFileSync(out("demo-contact-sheet.png")).length, "the existing sheet was copied, not remade");
});
test("--lang pt: the output and REVIEW.md in Portuguese, the manifest stays in English", media, () => {
  const r = studio(["review", "demo", "--lang", "pt"], proj);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /pacote de revisão: out\/demo-review\//); assert.match(r.stdout, /a voz é ESTIMADA/); assert.match(r.stdout, /\d+ erro\(s\), \d+ aviso\(s\), \d+ informação\(ões\)/); assert.match(r.stdout, /próximo: o seu agente lê/);
  const guide = readFileSync(out("demo-review", "REVIEW.md"), "utf8");
  assert.match(guide, /^# Pacote de revisão: demo/); assert.match(guide, /Veredito: pronto \| precisa de ajustes/); assert.match(guide, /a voz é ESTIMADA/); assert.match(guide, /medido:/);
  const m = json(out("demo-review", "manifest.json"));
  assert.match(m.findings.find((f: any) => f.code === "voice_estimated").message, /^the voice is ESTIMATED/);
});
test("brand cautions: playbook.md prohibitions, brand.json phrases and banned names are matched in the script, the screen text and publication.json", media, () => {
  writeFileSync(join(proj, "playbook.md"), '# Playbook\n\n## Never say\n- "private beta" outside the waitlist\n- guaranteed results\n');
  const brand = json(join(proj, "brand.json")); brand.bannedNames = ["Someone"]; brand.review = { forbiddenPhrases: ["risk free"] };
  writeFileSync(join(proj, "brand.json"), JSON.stringify(brand));
  writeFileSync(join(proj, "episodes/demo/script.txt"), "Join the private beta today. It is risk free. Ask Someone about it. Guaranteed results for all.\n");
  const pub = json(join(proj, "episodes/demo/publication.json")); pub.ig = { caption: "Free forever, they said." }; writeFileSync(join(proj, "episodes/demo/publication.json"), JSON.stringify(pub));
  const m = JSON.parse(studio(["review", "demo", "--json"], proj).stdout);
  const forbidden = m.findings.filter((f: any) => f.code === "forbidden_phrase").map((f: any) => f.message).sort();
  assert.deepEqual(forbidden, ['forbidden phrase "free forever"', 'forbidden phrase "guaranteed results"', 'forbidden phrase "private beta"', 'forbidden phrase "risk free"']);
  const name = m.findings.find((f: any) => f.code === "banned_name"); assert.equal(name.severity, "error"); assert.match(name.evidence, /script\.txt/);
  assert.match(m.findings.find((f: any) => /free forever/.test(f.message)).evidence, /publication\.json › ig\.caption/);
  assert.match(m.findings.find((f: any) => /private beta/.test(f.message)).evidence, /playbook\.md › Never say/);
  assert.equal(studio(["review", "demo"], proj).status, 0, "findings never fail the command");
});
test("a carousel: no slides rendered is an error that points to `slides`; with slides, one frame per slide and the alt checks", media, () => {
  assert.equal(studio(["new", "tips", "--carousel", "--title", "Three tips"], proj).status, 0);
  const none = studio(["review", "tips"], proj);
  assert.equal(none.status, 1); assert.match(none.stderr, /no rendered slides for "tips" \(out\/tips-slide-01\.jpg…\): run `praeko studio slides tips` first/);
  ff("-f", "lavfi", "-i", "testsrc2=s=1080x1350", "-frames:v", "1", out("tips-slide-01.jpg"));
  const r = studio(["review", "tips", "--json"], proj);
  assert.equal(r.status, 0, r.stderr);
  const m = JSON.parse(r.stdout);
  assert.equal(m.kind, "carousel"); assert.equal(m.slides.length, 2); assert.equal(m.slides[0].rendered, true); assert.equal(m.slides[1].rendered, false);
  assert.deepEqual(readdirSync(out("tips-review", "frames")), ["slide-01.jpg"]);
  assert.ok(m.findings.some((f: any) => f.code === "slide_missing" && f.slide === 2));
  assert.ok(m.findings.some((f: any) => f.code === "alt_generic" || f.code === "alt_too_short" || f.code === "alt_unrelated_to_text" || f.code === "alt_equals_text") || m.slides[0].alt.length > 0);
  assert.equal(m.slides[0].text[0], "THREE TIPS"); assert.equal(m.video, null);
  const guide = readFileSync(out("tips-review", "REVIEW.md"), "utf8");
  assert.match(guide, /^# Review package: tips \(carousel, 2 slides\)/); assert.match(guide, /`Slide 2 — problem — suggestion`/); assert.match(guide, /frames\/slide-01\.jpg/);
  const text = studio(["review", "tips"], proj);
  assert.match(text.stdout, /^review package: out\/tips-review\/ \(1 slide\(s\)/); assert.match(text.stdout, /slide 2 slide_missing/);
});
test("an image post: one slide, alt text rules, the caption limit from publication.json", media, () => {
  assert.equal(studio(["new", "photo", "--image", "--title", "A photo"], proj).status, 0);
  const y = readFileSync(join(proj, "episodes/photo/episode.yaml"), "utf8");
  writeFileSync(join(proj, "episodes/photo/episode.yaml"), y.replace(/alt: ".*"/, 'alt: "photo"'));
  assert.equal(studio(["compile", "photo"], proj).status, 0);
  const pub = json(join(proj, "episodes/photo/publication.json")); pub.ig = { caption: "x".repeat(2300) }; writeFileSync(join(proj, "episodes/photo/publication.json"), JSON.stringify(pub));
  ff("-f", "lavfi", "-i", "testsrc2=s=1080x1350", "-frames:v", "1", out("photo-slide-01.jpg"));
  const m = JSON.parse(studio(["review", "photo", "--json"], proj).stdout);
  assert.equal(m.kind, "image"); const codes = m.findings.map((f: any) => f.code);
  assert.ok(codes.includes("alt_too_short") && codes.includes("alt_generic") && codes.includes("caption_too_long"), codes.join(","));
});

// ---- the pure parts ----
test("itemTexts collects what an item shows: text, parts, lines (strings and parts), nested items, a label", () => {
  assert.deepEqual(itemTexts({ type: "box", text: "Hi" }), ["Hi"]);
  assert.deepEqual(itemTexts({ type: "line", parts: [{ text: "a " }, { text: "b" }] }), ["a b"]);
  assert.deepEqual(itemTexts({ type: "card", lines: [[{ text: "x" }, { text: "y" }], "plain"] }), ["xy", "plain"]);
  assert.deepEqual(itemTexts({ type: "stack", items: [{ type: "text", text: "one" }, { type: "row", items: [{ type: "box", text: "two" }] }] }), ["one", "two"]);
  assert.deepEqual(itemTexts({ type: "bar", label: "Progress" }), ["Progress"]); assert.deepEqual(itemTexts(null), []); assert.deepEqual(itemTexts({ type: "text" }), []);
});
test("scenesOf: short scenes get their end from the next scene or the outro, plus the outro; a long video gets its endcard", () => {
  const short = scenesOf({ durS: 20, outro: { a: 16, cta: "FOLLOW" }, scenes: [{ start: 0, label: "HOOK", items: [{ type: "text", text: "a" }] }, { start: 6, title: "Two", items: [{ type: "text", text: "b" }] }, { start: 12, end: 14, items: [] }] }, "short");
  assert.deepEqual(short.map((s) => [s.n, s.kind, s.start, s.end, s.duration, s.text]), [[1, "scene", 0, 6, 6, ["HOOK", "a"]], [2, "scene", 6, 12, 6, ["b"]], [3, "scene", 12, 14, 2, []], [4, "outro", 16, 20, 4, ["FOLLOW"]]]);
  assert.equal(short[1]!.title, "Two");
  const long = scenesOf({ durS: 300, endcard: { start: 290, text: "Thanks", link: "x.dev" }, scenes: [{ n: 1, title: "Intro", start: 0, items: [] }, { n: 2, title: "Body", start: 60, items: [{ type: "text", text: "t" }] }] }, "long");
  assert.deepEqual(long.map((s) => [s.kind, s.start, s.end]), [["scene", 0, 60], ["scene", 60, 290], ["endcard", 290, 300]]); assert.deepEqual(long[2]!.text, ["Thanks", "x.dev"]);
  assert.deepEqual(scenesOf(null, "short"), []);
});
test("layoutIssues: an absolute item outside the panel, stacked items too tall, a row too wide; nothing for items that fit; slides use their own area", () => {
  const fits = { scenes: [{ start: 0, items: [{ type: "box", text: "ok", pos: { left: 10, top: 10, w: 300, h: 80 } }, { type: "text", text: "short" }] }] };
  assert.deepEqual(layoutIssues(fits, "short"), []);
  const out1 = layoutIssues({ scenes: [{ start: 3, items: [{ type: "box", text: "Wide box", pos: { left: 700, top: 10, w: 400, h: 80 } }] }] }, "short");
  assert.equal(out1.length, 1); assert.equal(out1[0]!.time, 3); assert.match(out1[0]!.message, /scene 1: a "box" item goes outside the safe area \(estimate\)/); assert.match(out1[0]!.evidence, /Wide box: right edge at about 1100 px of 844; area 844x920/);
  const tall = layoutIssues({ scenes: [{ start: 0, items: Array.from({ length: 6 }, () => ({ type: "code", lines: [1, 2, 3, 4] })) }] }, "short");
  assert.match(tall[0]!.message, /do not fit the area/);
  const row = layoutIssues({ scenes: [{ start: 0, items: [{ type: "row", items: [{ type: "box", text: "a long label here" }, { type: "box", text: "another long label" }, { type: "box", text: "third long label" }] }] }] }, "short");
  assert.ok(row.some((x) => /row of items is wider/.test(x.message)));
  assert.deepEqual(layoutIssues({ scenes: [{ start: 0, items: [{ type: "chip", text: "c", pos: { left: 100, top: 100 } }] }] }, "long"), []);
  const sl = layoutIssues({ slides: [{ items: [{ type: "box", text: "x", pos: { left: 1000, top: 10, w: 200, h: 50 } }] }] }, "slide");
  assert.deepEqual([sl[0]!.slide, sl[0]!.time], [1, null]); assert.match(sl[0]!.evidence, /area 1080x1350/);
});
test("publicationTexts lists the non-empty texts, one source each", () => {
  const r = publicationTexts({ title: "T", alternatives: ["A1", ""], yt: { description: "D" }, ig: { caption: "C" }, tiktok: {}, other: "ignored" });
  assert.deepEqual(r.map((x) => x.source), ["publication.json › title", "publication.json › yt.description", "publication.json › ig.caption", "publication.json › alternatives[0]"]);
  assert.deepEqual(publicationTexts(null), []);
});
test("help lists review with its flags and says it calls no AI model; the docs topic exists", () => {
  const h = help("x");
  assert.match(h, /^  review <slug> \[--every <seconds>\] \[--max-frames N\] \[--engine remotion\|hyperframes\] \[--json\]/m); assert.match(h, /No AI model is called/);
  const d = studio(["docs", "review"], proj);
  assert.equal(d.status, 0, d.stderr); assert.match(d.stdout, /REVIEW\.md/); assert.match(d.stdout, /manifest\.json/);
  assert.match(studio(["docs"], proj).stdout, /review/);
});

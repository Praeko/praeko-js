// studio_brief_answers (the interview for an agent without a terminal) and studio_new_episode with fromVideo.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STUDIO_FORMATS, STUDIO_SOURCES, STUDIO_STYLES } from "../src/interview-options.ts";
import { FORMATS, SOURCES, STYLES } from "../../cli/src/styles.ts";
import { FAKE_BIN, REAL_BIN, connect, fakeProject, realProject } from "./helpers.ts";

test("the closed lists of the interview are the CLI's", () => {
  assert.deepEqual([...STUDIO_SOURCES], [...SOURCES]); assert.deepEqual([...STUDIO_FORMATS], [...FORMATS]); assert.deepEqual([...STUDIO_STYLES], [...STYLES]);
});
test("studio_brief_answers runs brief --yes with the answers (real CLI): brief.md, playbook.md and the style block of brand.json", async () => {
  const dir = realProject();
  const c = await connect({ project: dir, studioBin: REAL_BIN });
  const r = await c.call("studio_brief_answers", { source: ["script", "video"], about: "planes", format: ["short", "long"], style: ["clay-3d", "flat", "neon"], styleOther: "watercolor", pace: "fast", captions: "word", effects: ["zoom"], sound: "sfx", face: "face", references: [{ ref: "https://x.test/a", note: "pace,opening" }, { ref: "an old show" }] });
  assert.ok(!r.isError, r.text);
  assert.match(r.body.output.text, /3 visual styles: allowed/);
  const brand = JSON.parse(readFileSync(join(dir, "brand.json"), "utf8"));
  assert.deepEqual(brand.style, { visual: ["clay-3d", "flat", "neon"], format: ["short", "long"], edit: { pace: "fast", captions: "word", effects: ["zoom"], sound: "sfx", face: "face" }, source: ["script", "video"] });
  const brief = readFileSync(join(dir, "brief.md"), "utf8");
  assert.match(brief, /Channel style: Clay 3D/); assert.match(brief, /What I liked: pace, opening/); assert.match(brief, /2\. an old show\n {3}- What I liked: \(not answered yet\)/);
  assert.match(readFileSync(join(dir, "playbook.md"), "utf8"), /## Visual/);
  // only what is given changes
  assert.ok(!(await c.call("studio_brief_answers", { tone: "calm" })).isError);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "brand.json"), "utf8")).style.visual, ["clay-3d", "flat", "neon"]);
  // refused before running anything
  for (const bad of [{ style: ["vaporwave"] }, { format: ["reel"] }, { source: ["podcast"] }, { pace: "slow" }, { effects: ["none", "zoom"] }, {}, { about: "--yes" }, { about: "two\nlines" }, { accent: "blue" }]) {
    const x = await c.call("studio_brief_answers", bad);
    assert.ok(x.isError, JSON.stringify(bad));
  }
  const f = await c.call("studio_brief_answers", { face: "face", source: ["script"] });
  assert.ok(f.isError); assert.match(f.text, /--face face needs --source video/);
  await c.close();
});
test("studio_new_episode fromVideo: a file inside the project, format short only, the CLI gets --from-video and --lang (never --cloud)", async () => {
  const dir = fakeProject([]);
  mkdirSync(join(dir, "media")); writeFileSync(join(dir, "media", "talk.mp4"), "x");
  const c = await connect({ project: dir, studioBin: FAKE_BIN });
  const r = await c.call("studio_new_episode", { slug: "talk", fromVideo: "media/talk.mp4", language: "pt" });
  assert.ok(!r.isError, r.text);
  const argv = JSON.parse(/argv (.*)/.exec(r.body.output.text)![1]!);
  assert.deepEqual(argv.slice(0, 3), ["new", "talk", "--from-video"]); assert.equal(argv[3], join(realpathSync(dir), "media", "talk.mp4")); assert.deepEqual(argv.slice(4), ["--lang", "pt"]);
  for (const [args, re] of [[{ slug: "a", fromVideo: "../outside.mp4" }, /outside|inside|project/i], [{ slug: "b", fromVideo: "media/nope.mp4" }, /not a file in the project/], [{ slug: "c", fromVideo: "media/talk.mp4", format: "long" }, /format short/], [{ slug: "d", fromVideo: "/etc/passwd" }, /./]] as [Record<string, unknown>, RegExp][]) {
    const x = await c.call("studio_new_episode", args);
    assert.ok(x.isError, JSON.stringify(args)); assert.match(x.text, re);
  }
  await c.close();
});

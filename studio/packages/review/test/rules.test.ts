// Frames and brand cautions: which moments are extracted (and the cap), the prohibitions of playbook.md, forbidden phrases, banned names and AI tics.
import test from "node:test";
import assert from "node:assert/strict";
import { FRAME_DEFAULTS, frameName, pickFrames } from "../src/frames.ts";
import { DEFAULT_FORBIDDEN, collectRules, playbookProhibitions, scanTexts } from "../src/rules.ts";
import type { SceneInfo } from "../src/types.ts";

const scenes: SceneInfo[] = [0, 4.1, 9, 13].map((s, i, a) => ({ n: i + 1, kind: "scene" as const, start: s, end: a[i + 1] ?? 18, duration: 1, text: [] }));

test("frameName puts the time in the name", () => {
  assert.equal(frameName(2), "0002.0s.jpg"); assert.equal(frameName(0.5), "0000.5s.jpg"); assert.equal(frameName(12.34), "0012.3s.jpg"); assert.equal(frameName(119.96), "0120.0s.jpg");
});
test("pickFrames: dense opening, one per scene change, every N seconds, the last frame", () => {
  const f = pickFrames({ duration: 18, scenes });
  const t = f.map((x) => x.time);
  for (const o of [0, 0.5, 1, 1.5, 2]) assert.ok(t.includes(o), `opening ${o}`);
  assert.ok(f.some((x) => x.reason === "scene" && x.scene === 2 && Math.abs(x.time - 4.4) < 0.2), "scene 2 starts at 4.1");
  assert.ok(f.some((x) => x.reason === "scene" && x.scene === 3), "scene 3"); assert.ok(f.some((x) => x.reason === "scene" && x.scene === 4), "scene 4");
  assert.equal(f[f.length - 1]!.reason, "last"); assert.equal(f[f.length - 1]!.time, 17.9);
  assert.deepEqual(f.map((x) => x.time), [...t].sort((a, b) => a - b), "in order");
  assert.ok(f.every((x, i) => i === 0 || x.time - f[i - 1]!.time >= FRAME_DEFAULTS.minGap - 1e-9), "never two frames closer than 0.3 s");
  assert.ok(f.some((x) => x.reason === "interval" && x.time === 6), "every 2 s");
  assert.equal(f.find((x) => x.time === 6)?.scene, 2); assert.equal(f.find((x) => x.time === 4)?.scene, 1);
});
test("pickFrames: --every changes the interval and the cap is respected, keeping the opening and the last frame", () => {
  const sparse = pickFrames({ duration: 18, scenes, every: 6 });
  assert.ok(sparse.filter((x) => x.reason === "interval").length < pickFrames({ duration: 18, scenes }).filter((x) => x.reason === "interval").length);
  for (const max of [24, 12, 8, 5]) {
    const f = pickFrames({ duration: 600, scenes: scenes.map((s) => ({ ...s, start: s.start * 30, end: s.end * 30 })), maxFrames: max });
    assert.ok(f.length <= max, `max ${max} got ${f.length}`);
    assert.equal(f[0]!.time, 0); assert.equal(f[f.length - 1]!.reason, "last");
  }
  assert.equal(pickFrames({ duration: 600, scenes: [] }).length, 24, "the default cap is 24");
  const small = pickFrames({ duration: 0.8, scenes: [] });
  assert.ok(small.length >= 1 && small.every((x) => x.time <= 0.7));
});

test("playbookProhibitions: reads the bullets under a prohibitions heading, quoted phrases and short lines, ignoring the rest", () => {
  const md = `# Playbook\n\n## Opening\n- never open with the channel name\n\n## Never say\n- "private beta" outside the waitlist\n- “free for life”\n- guaranteed results\n- a long line that explains something about tone and is not a phrase to match\n- TODO: the agent fills this\n\n### Sub\n- \`risk free\`\n\n## Tone\n- "friendly"\n\n## Proibido\n1. "garantia total"\n`;
  const r = playbookProhibitions(md);
  assert.deepEqual(r.map((x) => x.phrase), ["private beta", "free for life", "guaranteed results", "risk free", "garantia total"]);
  assert.equal(r[0]!.source, "playbook.md › Never say"); assert.equal(r[4]!.source, "playbook.md › Proibido");
  assert.deepEqual(playbookProhibitions("# Playbook\n## Tone\n- \"friendly\"\n"), []);
});
test("collectRules: default, brand.json and playbook phrases, without duplicates; banned names from the brand", () => {
  const r = collectRules({ bannedNames: ["Someone"], review: { forbiddenPhrases: ["Risk Free", "free forever"] } }, "## Forbidden\n- \"risk free\"\n- \"no card needed\"\n");
  assert.deepEqual(r.phrases.map((x) => x.phrase), [...DEFAULT_FORBIDDEN, "Risk Free", "no card needed"]);
  assert.deepEqual(r.bannedNames, ["Someone"]);
  assert.deepEqual(collectRules({}, null).phrases.length, DEFAULT_FORBIDDEN.length);
});
test("scanTexts: a forbidden phrase fires (case and accent insensitive, whole words), a clean text does not", () => {
  const rules = collectRules({ review: { forbiddenPhrases: ["private beta"] } }, null);
  const hit = scanTexts([{ source: "scene 2 on-screen text", text: "Join the Private  Beta today", time: 4 }], rules, {});
  assert.deepEqual(hit.map((x) => [x.code, x.severity, x.time]), [["forbidden_phrase", "warning", 4]]);
  assert.match(hit[0]!.evidence, /scene 2 on-screen text at 0:04: ".*Private Beta.*" \(brand\.json › review\.forbiddenPhrases\)/);
  assert.deepEqual(scanTexts([{ source: "x", text: "a beta of a private kind" }], rules, {}), []);
  assert.deepEqual(codes(scanTexts([{ source: "x", text: "GRÁTIS PARA SEMPRE, diz o anúncio" }], rules, {})), ["forbidden_phrase"], "the built-in default is accent-insensitive");
  assert.deepEqual(scanTexts([{ source: "x", text: "freeforever is one word" }], rules, {}), []);
});
test("scanTexts: banned names are errors with the source and slide; a clean text has none", () => {
  const rules = collectRules({ bannedNames: ["Someone"] }, null);
  const r = scanTexts([{ source: "slide 2 alt text", text: "A portrait of someone smiling", slide: 2 }], rules, {});
  assert.deepEqual(r.map((x) => [x.code, x.severity, x.slide]), [["banned_name", "error", 2]]);
  assert.deepEqual(scanTexts([{ source: "x", text: "Somebody else" }], rules, {}), []);
});
test("scanTexts: AI text tics come from the publish package and can be turned off", () => {
  const tic = { source: "script.txt", text: "This is not a bug, it's a feature." };
  assert.deepEqual(codes(scanTexts([tic], collectRules({}, null), {})), ["ai_text_tic"]);
  assert.deepEqual(scanTexts([tic], collectRules({}, null), { publishing: { aiTics: false } }), []);
  assert.deepEqual(scanTexts([{ source: "x", text: "A plain sentence." }], collectRules({}, null), {}), []);
});
test("scanTexts: captions carry the time of the word; the script does not repeat the same hit (dedupe)", () => {
  const rules = collectRules({ review: { forbiddenPhrases: ["no strings"] } }, null);
  const text = "hello there this has no strings attached";
  const r = scanTexts([{ source: "captions", text, timeAt: (i) => (i >= 17 ? 6.5 : 0) }, { source: "script.txt", text, dedupe: true }], rules, {});
  assert.equal(r.length, 1); assert.equal(r[0]!.time, 6.5); assert.match(r[0]!.evidence, /captions at 0:06\.5/);
});
const codes = (l: { code: string }[]): string[] => l.map((x) => x.code);

import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_THEME, rgba } from "../src/theme.ts";
import { appear, pop } from "../src/util.ts";
import { SKIN_DEFAULT, contrast, defineSkin, mixWhite, parseColor, skinContrast, surfaceFill, themeForSkin, tok } from "../src/skin.ts";
import { PALETTE_DB32, PALETTE_PICO8, SKINS, SKIN_IDS, skinOf } from "../src/skins.ts";
import { fs, motionOf, sfxFile, surfaceStyle } from "../src/skin-style.ts";

test("the registry has every skin of the plan, by English slug", () => {
  assert.deepEqual([...SKIN_IDS].sort(), ["8bit", "blocks-3d", "chalkboard", "cinema-3d", "clay-3d", "comic", "default", "flat", "minimal", "neon", "pixel", "retro-3d", "retro-crt"]);
  for (const [id, s] of Object.entries(SKINS)) {
    assert.equal(s.id, id);
    assert.equal(s.dimension === "3d", !!s.stage, `${id}: 3D skins (and only them) have a stage`);
    assert.ok(s.description.length > 20, `${id} has a description`);
  }
  assert.equal(skinOf("clay-3d"), SKINS["clay-3d"]);
  assert.equal(skinOf("toString"), undefined, "no prototype keys");
  assert.equal(skinOf("nope"), undefined);
});

test("pixel skins carry a fixed palette and a post-process; the rest have none", () => {
  assert.deepEqual(SKINS["8bit"]!.post, { scale: 1 / 3, palette: PALETTE_PICO8 });
  assert.deepEqual(SKINS.pixel!.post, { scale: 1 / 3, palette: PALETTE_DB32 });
  assert.equal(SKINS["retro-crt"]!.post?.crt, true);
  for (const id of ["default", "flat", "neon", "clay-3d"]) assert.equal(SKINS[id]!.post, undefined, id);
  // the palette colors themselves are the skin's palette: every theme color of 8bit is a PICO-8 color
  for (const [k, c] of Object.entries(SKINS["8bit"]!.colors!)) assert.ok(PALETTE_PICO8.includes(c), `8bit ${k} ${c}`);
});

test("defineSkin merges over the default and does not inherit optional extras", () => {
  const s = defineSkin({ id: "x", name: "X", dimension: "2d", description: "a test skin, nothing more", panel: { radius: 3 }, post: { crt: true } });
  assert.equal(s.panel.radius, 3);
  assert.equal(s.panel.fill, SKIN_DEFAULT.panel.fill, "nested objects merge");
  const t = defineSkin({ id: "y", name: "Y", dimension: "2d", description: "another test skin, nothing" }, s);
  assert.equal(t.post, undefined, "post is not inherited from the base");
  assert.equal(t.panel.radius, 3, "tokens are");
});

test("tok resolves theme names, CSS colors and name@alpha", () => {
  assert.equal(tok(DEFAULT_THEME, "accent"), DEFAULT_THEME.accent);
  assert.equal(tok(DEFAULT_THEME, "text@0.55"), rgba(DEFAULT_THEME.text, 0.55), "same string as the kit's old rgba(INK, .55)");
  assert.equal(tok(DEFAULT_THEME, "#123456"), "#123456");
  assert.equal(tok(DEFAULT_THEME, "rgba(0,0,0,.4)"), "rgba(0,0,0,.4)");
  assert.equal(tok(DEFAULT_THEME, undefined), undefined);
  assert.equal(mixWhite("#000000", 0.5), "rgb(128,128,128)");
});

test("regression: the default skin gives exactly the kit's old surface style and motion", () => {
  const c = "#f4b942";
  assert.deepEqual(surfaceStyle(SKIN_DEFAULT, DEFAULT_THEME, c, 22), { background: DEFAULT_THEME.box, border: `4px solid ${c}`, borderRadius: 22, color: DEFAULT_THEME.text });
  assert.equal(surfaceStyle(SKIN_DEFAULT, DEFAULT_THEME, c, 22, true).border, `4px dashed ${c}`);
  const m = motionOf(SKIN_DEFAULT);
  for (let t = 0; t < 2; t += 0.037) {
    assert.equal(m.appear(t, 0.3), appear(t, 0.3));
    assert.equal(m.appear(t, 0.3, 0.25), appear(t, 0.3, 0.25));
    assert.equal(m.pop(t, 0.3), pop(t, 0.3));
  }
  assert.equal(m.slide, 1);
  assert.equal(surfaceFill(SKIN_DEFAULT, DEFAULT_THEME, c), DEFAULT_THEME.box);
});

test("themeForSkin: the skin palette fills what the person did not choose; their own colors stay", () => {
  const flat = SKINS.flat!, clay = SKINS["clay-3d"]!;
  const t1 = themeForSkin(DEFAULT_THEME, flat);
  assert.equal(t1.background, flat.colors!.background, "default colors are not a choice");
  assert.equal(t1.font, flat.font);
  const mine = { ...DEFAULT_THEME, accent: "#00ff00" };
  assert.equal(themeForSkin(mine, flat).accent, "#00ff00", "a color the person changed wins");
  // brand.json written by the interview with the channel skin (clay) and an episode in flat: the clay colors are not the person's choice
  const fromInterview = { ...DEFAULT_THEME, ...clay.colors!, font: clay.font! };
  const t2 = themeForSkin(fromInterview, flat, clay);
  assert.equal(t2.background, flat.colors!.background);
  assert.equal(t2.font, flat.font);
  assert.deepEqual(themeForSkin(DEFAULT_THEME, SKIN_DEFAULT), DEFAULT_THEME, "the default skin changes nothing");
});

test("sounds and text size through the skin", () => {
  assert.equal(sfxFile(SKINS["8bit"]!, "pop", new Set(["sfx-chip/pop.wav"])), "sfx-chip/pop.wav", "the skin's set when the project has it");
  assert.equal(sfxFile(SKINS["8bit"]!, "pop", new Set()), "sfx/pop.wav", "else the default set (never a missing file)");
  assert.equal(sfxFile(SKIN_DEFAULT, "ding", new Set(["sfx-chip/ding.wav"])), "sfx/ding.wav");
  assert.equal(fs(SKIN_DEFAULT, 62), 62);
  assert.equal(fs(SKINS["8bit"]!, 100), 72);
});

test("contrast: WCAG ratio and the pairs of a skin that fall short", () => {
  assert.equal(contrast(parseColor("#000000")!, parseColor("#ffffff")!), 21);
  assert.deepEqual(parseColor("rgba(255, 0, 0, .5)"), { r: 255, g: 0, b: 0, a: 0.5 });
  assert.deepEqual(parseColor("#fff"), { r: 255, g: 255, b: 255, a: 1 });
  assert.equal(parseColor("linear-gradient(red, blue)"), null);
  assert.deepEqual(skinContrast(SKIN_DEFAULT, DEFAULT_THEME), [], "the default look passes");
  // a skin made to fail: dark text on a dark panel
  const bad = defineSkin({ id: "bad", name: "Bad", dimension: "2d", description: "fails on purpose, for the test", panel: { fill: "#111111" } });
  const issues = skinContrast(bad, { ...DEFAULT_THEME, text: "#222222" });
  assert.ok(issues.some((i) => i.where === "text on the panel" && i.ratio < 4.5), JSON.stringify(issues));
});

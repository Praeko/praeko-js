import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_THEME, rgba, themeFromBrand } from "../src/theme.ts";
import { makeAt } from "../src/util.ts";
import type { Word } from "../src/word.ts";

const words: Word[] = [{ t: "Hello", a: 1, b: 1.4 }, { t: "big", a: 1.5, b: 1.8 }, { t: "world", a: 2, b: 2.5 }, { t: "big", a: 3, b: 3.3 }, { t: "world", a: 3.4, b: 3.9 }];

test("themeFromBrand reads the English brand.json shape and keeps defaults", () => {
  const theme = themeFromBrand({ colors: { accent: "#ff0000" }, fonts: { title: "Foo", mono: "Bar" }, handle: "@me", mascotPath: "gatos/gato-{name}.png" });
  assert.equal(theme.accent, "#ff0000");
  assert.equal(theme.background, DEFAULT_THEME.background);
  assert.equal(theme.font, "Foo");
  assert.equal(theme.mono, "Bar");
  assert.equal(theme.handle, "@me");
  assert.equal(theme.mascotPath, "gatos/gato-{name}.png");
});

test("the default theme has English field names only", () => {
  assert.deepEqual(Object.keys(DEFAULT_THEME).sort(), ["accent", "avatar", "background", "box", "code", "coverBackground", "error", "extra", "font", "handle", "info", "mascotPath", "mono", "muted", "ok", "text"]);
  assert.equal(rgba("#f4b942", 0.16), "rgba(244,185,66,0.16)");
});

test("makeAt returns the local start of a phrase and fails loudly in English", () => {
  const at = makeAt(words, [0, 2.9]);
  assert.equal(at(0)("big world", 0), 1.5);
  assert.ok(Math.abs(at(1)("big world", 1) - 0.1) < 1e-9);
  assert.throws(() => at(0)("missing phrase"), /phrase not found: missing phrase/);
});

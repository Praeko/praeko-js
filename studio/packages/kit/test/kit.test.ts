import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveColor } from "../src/color.ts";
import { DEFAULT_THEME } from "@praeko/studio-core";

test("resolveColor maps theme names, passes #hex through and keeps unknown names", () => {
  assert.equal(resolveColor(DEFAULT_THEME, "accent"), DEFAULT_THEME.accent);
  assert.equal(resolveColor(DEFAULT_THEME, "muted"), DEFAULT_THEME.muted);
  assert.equal(resolveColor(DEFAULT_THEME, "#123456"), "#123456");
  assert.equal(resolveColor(DEFAULT_THEME, undefined), undefined);
  assert.equal(resolveColor(DEFAULT_THEME, "nope"), "nope");
});

test("the published kit exposes the English API only", async () => {
  const kit = await import("../dist/index.js");
  for (const name of ["Panel", "Box", "Line", "Big", "Bubble", "Code", "Window", "Phone", "Mascot", "Frame", "EpisodeDecl", "episodeDataFromSpec", "LongDecl", "longDataFromSpec", "CodeL", "CardL", "ChipL", "TextL", "appearL", "LongCovers", "resolveColor"]) {
    assert.equal(typeof (kit as Record<string, unknown>)[name], "function", name);
  }
  for (const old of ["PainelD", "Caixa", "Gato", "Moldura", "EpisodioDecl", "LongoDecl", "CodigoL"]) assert.equal((kit as Record<string, unknown>)[old], undefined, old);
});

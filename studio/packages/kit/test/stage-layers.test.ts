import assert from "node:assert/strict";
import { test } from "node:test";
import { SKINS } from "@praeko/studio-core";
import { stageLayers } from "../src/stage-layers.ts";

const THREE_D = ["clay-3d", "blocks-3d", "retro-3d", "cinema-3d"];

test("stageLayers without a base video: exactly the skin's background, fog, floor and sun (nothing changes)", () => {
  for (const id of THREE_D) {
    const st = SKINS[id]!.stage!;
    assert.deepEqual(stageLayers(st, false), { transparent: false, fog: st.fog, floor: st.floor, sun: !!st.sun }, id);
  }
  assert.equal(stageLayers(SKINS["retro-3d"]!.stage!, false).floor, "grid");
  assert.equal(stageLayers(SKINS["retro-3d"]!.stage!, false).sun, true);
});

test("stageLayers over the person's video: transparent canvas, no floor/wall/grid/sun/fog; shadow only on an invisible floor", () => {
  for (const id of THREE_D) {
    const st = SKINS[id]!.stage!, l = stageLayers(st, true);
    assert.equal(l.transparent, true, id);
    assert.equal(l.fog, null, id);
    assert.equal(l.sun, false, id);
    assert.equal(l.floor, st.shadows ? "shadow" : "none", id);
  }
  assert.equal(stageLayers(SKINS["clay-3d"]!.stage!, true).floor, "shadow");
  assert.equal(stageLayers(SKINS["retro-3d"]!.stage!, true).floor, "none"); // no shadows in retro: nothing under the slab
});

test("the published SlabStage is marked overBase (the Episode puts the base video under it)", async () => {
  const kit = await import("../dist/index.js");
  assert.equal((kit.SlabStage as { overBase?: boolean }).overBase, true);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { sceneWindows } from "../src/timing.ts";

const scenes = [{ start: 0 }, { start: 4 }, { start: 9, end: 11 }];

test("without a base video each scene unmounts 0.1 s before the next one (unchanged look)", () => {
  assert.deepEqual(sceneWindows({ scenes, outro: { a: 12 }, durS: 15 }).map((w) => [w.a, +w.b.toFixed(2), w.panelDur]), [[0, 3.9, 4], [4, 8.9, 5], [9, 10.9, 2]]);
});

test("with a base video nothing unmounts between scenes: only the panel leaves", () => {
  const w = sceneWindows({ scenes, outro: { a: 12 }, durS: 15, base: { src: "video/a.mp4" } });
  assert.deepEqual(w.map((x) => [x.a, x.b]), [[0, 4], [4, 9], [9, 11]]);
  assert.equal(w[0]!.b, w[1]!.a, "no gap: the next scene starts in the same frame");
});

test("without an outro the last scene runs to the end of the episode", () => {
  const w = sceneWindows({ scenes: [{ start: 0 }, { start: 5 }], durS: 14, base: { src: "v.mp4" } });
  assert.deepEqual(w.map((x) => [x.a, x.b, x.panelDur]), [[0, 5, 5], [5, 14, 9]]);
  assert.equal(sceneWindows({ scenes: [{ start: 0 }], durS: 8 })[0]!.panelDur, 8);
});

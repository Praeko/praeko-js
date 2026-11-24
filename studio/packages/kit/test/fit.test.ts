import assert from "node:assert/strict";
import { test } from "node:test";
import { FIT_MIN, nextFit } from "../src/fit.ts";

test("text that fits is untouched (scale 1): the default look does not change", () => {
  assert.equal(nextFit(1, 800, 844), 1);
  assert.equal(nextFit(1, 844.4, 844), 1, "half a pixel of rounding is not an overflow");
});

test("text that overflows shrinks to fit, rounded down, never below FIT_MIN, and only ever shrinks", () => {
  assert.equal(nextFit(1, 1000, 844), 0.84);
  assert.ok(1000 * nextFit(1, 1000, 844) <= 844);
  // measured again at the new size (still a bit wide after a font hinting step): shrinks a little more, from the current scale
  assert.equal(nextFit(0.84, 850, 844), 0.83);
  assert.equal(nextFit(1, 5000, 844), FIT_MIN);
  assert.equal(nextFit(0.6, 400, 844), 0.6, "never grows back (no oscillation between frames)");
  assert.equal(nextFit(1, 900, 0), 1, "no space measured (not laid out): no change");
});

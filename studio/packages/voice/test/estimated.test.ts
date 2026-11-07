import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { duration, estimateWords, narrate } from "../src/index.ts";
import type { Word } from "../src/index.ts";

test("estimateWords: pace near 190 words/min, pause after a period and [short pause]", () => {
  const txt = Array.from({ length: 95 }, () => "word").join(" ");
  const { words, duration: d } = estimateWords(txt);
  assert.equal(words.length, 95);
  assert.ok(d > 28 && d < 33, `duration ${d}`); // 95 words ≈ 30 s
  const a = estimateWords("one two. three"), b = estimateWords("one two three");
  assert.ok((a.words[2] as Word).a - (b.words[2] as Word).a > 0.3); // the period opens a pause
  const c = estimateWords("one [short pause] two"), d2 = estimateWords("one two");
  assert.ok((c.words[1] as Word).a - (d2.words[1] as Word).a > 0.4);
  assert.deepEqual(c.words.map((p) => p.t), ["one", "two"]); // tags are not words
  for (let i = 1; i < words.length; i++) assert.ok((words[i] as Word).a >= (words[i - 1] as Word).b);
});
test("narrate with the estimated voice: writes words, a silent mp3 of the right length and the marker", async () => {
  const folder = mkdtempSync(join(tmpdir(), "praeko-studio-est-"));
  writeFileSync(join(folder, "script.txt"), "[curious] I opened mysite.com. [short pause] There was a bug, simple.");
  const config = { voices: { m: { provider: "estimated", wordsPerMin: 190 } }, quality: {} };
  const r = await narrate({ folder, brand: { pronunciation: { "mysite.com": "my site dot com" } }, voice: "m", config });
  assert.equal(r.estimated, true);
  const words = JSON.parse(readFileSync(join(folder, "words.json"), "utf8")) as Word[];
  assert.deepEqual(words.slice(2, 6).map((p) => p.t), ["my", "site", "dot", "com."]);
  assert.ok(existsSync(join(folder, "voice.estimated")));
  assert.match(readFileSync(join(folder, "voice.estimated"), "utf8"), /estimated voice: generate the final one before publishing/);
  assert.ok(Math.abs(duration(join(folder, "voice.mp3")) - r.duration) < 0.2);
  assert.match(readFileSync(join(folder, "words.ts"), "utf8"), /export const WORDS: Word\[\] =/);
});

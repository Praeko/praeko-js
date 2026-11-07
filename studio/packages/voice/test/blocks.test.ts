import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blockCacheKey, blockHash, duration, hookHash, narrate, readBlocks } from "../src/index.ts";
import type { Word } from "../src/index.ts";

const SCRIPT = "loose text before is ignored\n## 1 · HOOK\nOne two three four five six.\n\n## 2 · MIDDLE\n[curious] Seven eight nine ten eleven twelve thirteen fourteen.\n## 3 · END\nIdle but productive.\n";
const config = { voices: { m: { provider: "estimated", wordsPerMin: 190 } }, quality: {} };

test("readBlocks: headings open blocks, empty ones are dropped, no heading returns []", () => {
  const b = readBlocks(SCRIPT);
  assert.deepEqual(b.map((x) => [x.n, x.title]), [[1, "1 · HOOK"], [2, "2 · MIDDLE"], [3, "3 · END"]]);
  assert.equal((b[0] as { text: string }).text, "One two three four five six.");
  assert.deepEqual(readBlocks("just text"), []);
});
test("narrate in blocks: joins the audio, shifts the timings, writes blocks.json and reuses the cache", async () => {
  const folder = mkdtempSync(join(tmpdir(), "praeko-studio-blocks-"));
  writeFileSync(join(folder, "script.txt"), SCRIPT);
  const r = await narrate({ folder, brand: {}, voice: "m", config });
  assert.equal(r.blocks, 3); assert.equal(r.regenerated, 3); assert.equal(r.reused, 0);
  const blocks = JSON.parse(readFileSync(join(folder, "blocks.json"), "utf8"));
  assert.deepEqual(Object.keys(blocks[0]), ["n", "title", "a", "b"]);
  assert.equal(blocks[0].a, 0);
  assert.ok(Math.abs(blocks[1].a - (blocks[0].b + 0.6)) < 0.02, "0.6 s pause between blocks");
  const words = JSON.parse(readFileSync(join(folder, "words.json"), "utf8")) as Word[];
  const seven = words.find((p) => p.t === "Seven") as Word;
  assert.ok(seven.a >= blocks[1].a, "block 2 timings shifted to the whole video");
  assert.ok(Math.abs(duration(join(folder, "voice.mp3")) - r.duration) < 0.3);
  assert.ok(existsSync(join(folder, "voice.estimated")));
  // edit only block 2: 1 regenerated, 2 reused
  writeFileSync(join(folder, "script.txt"), SCRIPT.replace("Seven eight", "Seven and a half eight"));
  const r2 = await narrate({ folder, brand: {}, voice: "m", config });
  assert.equal(r2.regenerated, 1); assert.equal(r2.reused, 2);
  assert.equal(readdirSync(join(folder, "voice-blocks")).filter((f) => f.endsWith(".mp3")).length, 4); // block 2's old file stays in the cache
});
test("cache file names are derived in one place: pinned hash inputs", async () => {
  const key = blockCacheKey({ voiceAlias: "draft-silent", provider: "estimated", model: undefined, pronunciation: { a: "b" } });
  assert.equal(key, `draft-silent|estimated||${JSON.stringify({ a: "b" })}`);
  const expected = createHash("sha1").update(key + "\n" + "One two three four five six.").digest("hex").slice(0, 10);
  assert.equal(blockHash("One two three four five six.", key), expected);
  assert.equal(hookHash({ text: "Hook", quality: "draft", pronunciation: { a: "b" } }), createHash("sha1").update(`Hook|draft|${JSON.stringify({ a: "b" })}`).digest("hex").slice(0, 10));
  const folder = mkdtempSync(join(tmpdir(), "praeko-studio-hash-"));
  writeFileSync(join(folder, "script.txt"), "## 1 · A\nOne two three four five.\n");
  await narrate({ folder, brand: { pronunciation: { a: "b" } }, voice: "m", config });
  const files = readdirSync(join(folder, "voice-blocks"));
  assert.ok(files.includes(`01-${blockHash("One two three four five.", blockCacheKey({ voiceAlias: "m", provider: "estimated", pronunciation: { a: "b" } }))}.mp3`));
});

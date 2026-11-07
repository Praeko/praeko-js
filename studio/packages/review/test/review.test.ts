import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkEpisode, checkScript, contactSheet, emptyFrames, videoInfo } from "../src/index.ts";

const dir = mkdtempSync(join(tmpdir(), "praeko-studio-rev-"));
const synthetic = (file: string, filter: string) => execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", filter, "-t", "6", "-pix_fmt", "yuv420p", file]);

test("checkScript: digits, odd tags, AI tics, web address and banned name (English messages)", () => {
  const r = checkScript("[curious] There were 4500 hits. This is not a bug, it's a feature. [shouting] See mysite.com and talk to Someone.", { bannedNames: ["Someone"] });
  const msgs = r.map((x) => x.msg).join("\n");
  assert.match(msgs, /digits in the spoken text/); assert.match(msgs, /\[shouting\]/); assert.match(msgs, /AI text tic: .*not X, it's Y/); assert.match(msgs, /web address/);
  assert.ok(r.some((x) => x.level === "error" && /Someone/.test(x.msg)));
});
test("checkScript: a clean text only reports the duration", () => {
  const r = checkScript("[curious] Today the boss of the week opens. [short pause]");
  assert.deepEqual(r.map((x) => x.level), ["ok"]);
  assert.match((r[0] as { msg: string }).msg, /words, ~\d+ s of speech/);
});
test("emptyFrames: a black video is one 6 s empty stretch; a video with content is not", () => {
  const black = join(dir, "black.mp4"), full = join(dir, "full.mp4");
  synthetic(black, "color=c=black:s=270x480:r=10"); synthetic(full, "testsrc=s=270x480:r=10");
  assert.deepEqual(emptyFrames(black).stretches, [[0, 6]]);
  assert.deepEqual(emptyFrames(full).stretches, []);
});
test("contactSheet writes the mosaic and videoInfo reads the dimensions", () => {
  const v = join(dir, "full.mp4"), png = join(dir, "sheet.png");
  assert.equal(videoInfo(v).width, 270);
  contactSheet({ video: v, output: png, count: 6, columns: 3, width: 90 });
  assert.ok(existsSync(png));
});
test("checkEpisode: missing files are reported in English, with levels ok/warning/error", () => {
  const folder = join(dir, "ep"); mkdirSync(folder);
  const r = checkEpisode({ folder, brand: {} });
  assert.deepEqual(r.map((x) => [x.level, x.msg]).slice(0, 2), [["error", "missing script.txt"], ["warning", "no words.json yet (run `praeko studio voice`)"]]);
  assert.ok(r.some((x) => x.msg === "no publication.json"));
  writeFileSync(join(folder, "script.txt"), "Short and clean.");
  writeFileSync(join(folder, "publication.json"), JSON.stringify({ title: "T", ai: { synthetic: true }, hashtags: {} }));
  const r2 = checkEpisode({ folder, brand: {} });
  assert.ok(r2.some((x) => /publication.json still lacks: YouTube description, Instagram caption, TikTok caption, hashtags/.test(x.msg)));
  assert.ok(r2.some((x) => x.msg.startsWith("video not rendered yet")));
});

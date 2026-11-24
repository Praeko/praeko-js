// Acceptance of `new --from-video` end to end: a real project (--dev, npm install), a generated vertical video with sound, one command, a short YAML and a real render.
// It depends on the engine knowing the `base` video layer (core/kit/compile, made by the motor work), so it only runs when asked and when the engine has it:
//   PRAEKO_STUDIO_ACCEPTANCE=1 node --test studio/packages/cli/test/from-video-acceptance.test.ts
// Needs ffmpeg, network for npm install (or a warm npm cache) and Chrome for Remotion. Takes a few minutes. A real raw recording is still checked by a person (see docs/plano-estilo-studio.md 9.5).
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileEpisode } from "../src/compile.ts";

const BIN = fileURLToPath(new URL("../bin/praeko-studio.ts", import.meta.url)), STUDIO = fileURLToPath(new URL("../../..", import.meta.url));
const base = mkdtempSync(join(tmpdir(), "studio-fv-accept-"));
const ENV = { ...process.env, HOME: base, PRAEKO_NO_KEYCHAIN: "1", PRAEKO_STUDIO_CONFIG: join(base, "cfg"), PRAEKO_SECRETS: join(base, "s.json") } as NodeJS.ProcessEnv;
delete ENV.PRAEKO_LANG;
const studio = (args: string[], cwd: string, timeout = 900_000) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", env: ENV, timeout });
const probe = (f: string) => JSON.parse(spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", f], { encoding: "utf8" }).stdout);

function engineHasBase(): boolean {
  const d = mkdtempSync(join(base, "probe-"));
  writeFileSync(join(d, "episode.yaml"), "id: P\nduration: 3\ncaption: 80\nbase: { src: video/p.mp4, volume: 1, fit: cover }\nscenes:\n  - start: 0\n    items:\n      - { type: text, at: 0.3, text: hi }\n");
  return !compileEpisode(d, { write: false }).errors.some((e) => /missing "(voice|outro)"|base/.test(e));
}
const asked = process.env.PRAEKO_STUDIO_ACCEPTANCE === "1";
const skip = !asked ? "set PRAEKO_STUDIO_ACCEPTANCE=1 to run (slow: npm install and a real render)" : !engineHasBase() ? "the engine does not know `base` yet (merge the motor work first)" : false;

test("from-video acceptance: one command over a generated video, a short YAML, a partial and a full render with the video's own sound", { skip, timeout: 1_800_000 }, () => {
  const dir = join(base, "channel");
  const init = studio(["init", dir, "--yes", "--name", "Acceptance", "--source", "video", "--dev", STUDIO], base);
  assert.equal(init.status, 0, init.stdout + init.stderr);
  const video = join(base, "raw take.mp4");
  assert.equal(spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=1080x1920:rate=30", "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000", "-t", "4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", video]).status, 0);
  writeFileSync(join(base, "t.json"), JSON.stringify({ language: "en", text: "This is my own video talking", words: [["This", 0.2, 0.4], ["is", 0.45, 0.6], ["my", 0.65, 0.8], ["own", 0.85, 1.1], ["video", 1.15, 1.6], ["talking", 1.7, 2.3]].map(([t, a, b]) => ({ t, a, b })) }));
  const made = studio(["new", "take", "--from-video", video, "--transcript", join(base, "t.json"), "--title", "My take"], dir);
  assert.equal(made.status, 0, made.stdout + made.stderr);
  // a short YAML: one label tied to a phrase of the video, one hit
  const y = join(dir, "episodes", "take", "episode.yaml");
  writeFileSync(y, readFileSync(y, "utf8").replace(/items:\n[\s\S]*$/, 'items:\n      - { type: big, when: "my own video", size: 96, color: accent, text: "OWN VIDEO" }\nhits:\n  - { at: "talking", type: zoom }\n'));
  const c = studio(["compile", "take"], dir);
  assert.equal(c.status, 0, c.stdout + c.stderr);
  const part = studio(["render", "take", "--seconds", "2"], dir);
  assert.equal(part.status, 0, part.stdout + part.stderr);
  const p2 = probe(join(dir, "out", "take-first-2s.mp4"));
  assert.ok(Math.abs(+p2.format.duration - 2) < 0.15, `partial render lasts ${p2.format.duration} s`);
  const full = studio(["render", "take"], dir);
  assert.equal(full.status, 0, full.stdout + full.stderr);
  const p = probe(join(dir, "out", "take.mp4"));
  const v = p.streams.find((s: any) => s.codec_type === "video");
  assert.equal(v.width, 1080); assert.equal(v.height, 1920);
  assert.ok(p.streams.some((s: any) => s.codec_type === "audio"), "the video's own sound is in the render");
  assert.ok(Math.abs(+p.format.duration - 4) < 0.2, `the render lasts what the video lasts (${p.format.duration} s)`);
  const chk = studio(["check", "take"], dir);
  assert.match(chk.stdout, /own video \(base\): 6 words spoken/);
  assert.ok(existsSync(video), "the original is still there");
});

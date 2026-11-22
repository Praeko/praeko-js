// node --test studio/packages/voice/test  (fake engines: nothing real runs)
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InputError, TranscribeError, parseWhisperCppJson, qualityGate, toSrt, transcribe, writeTranscript } from "../src/transcribe.ts";
import type { TranscribeEngine, EngineOutput } from "../src/transcribe.ts";
import type { VoicesConfig } from "../src/config.ts";

const CONFIG: VoicesConfig = { voices: {}, transcription: { minTimeoutSec: 0 } };
const DUR = 30;
const prepare = () => ({ wav: "/fake/audio.wav", durationSec: DUR, cleanup() {} });
const speech = (n = 60, lang = "pt"): EngineOutput => ({ words: Array.from({ length: n }, (_, i) => ({ t: `w${i}x`, a: +(i * 0.5).toFixed(2), b: +(i * 0.5 + 0.4).toFixed(2) })), language: lang, version: "fake 1" });
const fake = (name: string, run: () => Promise<EngineOutput>, o: { cloud?: boolean; avail?: string | null; calls?: string[] } = {}): TranscribeEngine => ({
  name, cloud: o.cloud, available: async () => o.avail ?? null, run: async () => { o.calls?.push(name); return run(); },
});
const ok = (name: string, o = {}) => fake(name, async () => speech(), o);
const base = { file: "/x/video.mp4", language: "pt", config: CONFIG, prepare };

test("uses the first engine and records one attempt", async () => {
  const r = await transcribe({ ...base, engineImpls: { voicestudio: ok("voicestudio"), "whisper-local": ok("whisper-local"), scribe: ok("scribe", { cloud: true }) } });
  assert.equal(r.engine, "voicestudio"); assert.deepEqual(r.attempts, [{ engine: "voicestudio", ok: true }]);
  assert.equal(r.durationSec, DUR); assert.equal(r.language, "pt"); assert.equal(r.words.length, 60);
});
test("engine down, 429 and timeout fall to the next engine", async () => {
  const mk = (run: () => Promise<EngineOutput>, avail: string | null = null) => ({ voicestudio: fake("voicestudio", run, { avail }), "whisper-local": ok("whisper-local") });
  let r = await transcribe({ ...base, engineImpls: mk(async () => speech(), "unavailable (no response)") });
  assert.equal(r.engine, "whisper-local"); assert.match(r.attempts[0]!.reason!, /unavailable/);
  r = await transcribe({ ...base, engineImpls: mk(async () => { throw new Error("VoiceStudio is busy (429) after several attempts"); }) });
  assert.equal(r.engine, "whisper-local"); assert.match(r.attempts[0]!.reason!, /429/);
  r = await transcribe({ ...base, config: { ...CONFIG, transcription: { minTimeoutSec: 0, localTimeoutFactor: 0.001 } }, engineImpls: { voicestudio: fake("voicestudio", () => new Promise(() => {})), "whisper-local": ok("whisper-local") } });
  assert.equal(r.engine, "whisper-local"); assert.match(r.attempts[0]!.reason!, /timed out/);
});
test("empty output, loop, wrong language, wpm and zero durations are rejected", async () => {
  const bad: [string, () => Promise<EngineOutput>, RegExp][] = [
    ["empty", async () => ({ words: [] }), /empty/],
    ["loop", async () => ({ words: Array.from({ length: 60 }, (_, i) => ({ t: "obrigado", a: i * 0.5, b: i * 0.5 + 0.4 })), language: "pt" }), /loop/],
    ["lang", async () => speech(60, "en"), /detected language en/],
    ["wpm", async () => speech(3), /words per minute/],
    ["zero", async () => ({ words: speech().words.map((w) => ({ ...w, b: w.a })), language: "pt" }), /zero duration/],
  ];
  for (const [name, run, re] of bad) {
    const r = await transcribe({ ...base, engineImpls: { voicestudio: fake("voicestudio", run), "whisper-local": ok("whisper-local") } });
    assert.equal(r.engine, "whisper-local", name); assert.match(r.attempts[0]!.reason!, re, name);
  }
});
test("loop of a multi-word phrase is caught; normal speech passes", () => {
  const loop = Array.from({ length: 40 }, (_, i) => ({ t: ["muito", "bem"][i % 2]!, a: i, b: i + 0.5 }));
  assert.match(qualityGate({ words: loop }, 40, "auto")!, /loop/);
  assert.equal(qualityGate(speech(60), DUR, "pt"), null);
  assert.equal(qualityGate({ ...speech(60), language: "por" }, DUR, "pt"), null); // por = pt
});
test("cloud off: scribe is never called and the error says so", async () => {
  const calls: string[] = [];
  const down = (n: string) => fake(n, async () => ({ words: [] }), { avail: "unavailable", calls });
  await assert.rejects(transcribe({ ...base, engineImpls: { voicestudio: down("voicestudio"), "whisper-local": down("whisper-local"), scribe: ok("scribe", { cloud: true, calls }) } }),
    (e: any) => e instanceof TranscribeError && /cloud engine was not used/.test(e.message) && e.attempts.length === 3 && /cloud disabled/.test(String(e.attempts[2]?.reason)));
  assert.deepEqual(calls, []);
  // asking for scribe alone without consent: error, nothing sent
  await assert.rejects(transcribe({ ...base, engines: ["scribe"], engineImpls: { scribe: ok("scribe", { cloud: true, calls }) } }), /Nothing was sent/);
  assert.deepEqual(calls, []);
});
test("cloud on: scribe only after the local engines failed", async () => {
  const calls: string[] = [];
  const fail = (n: string) => fake(n, async () => { throw new Error("boom"); }, { calls });
  const r = await transcribe({ ...base, allowCloud: true, engineImpls: { voicestudio: fail("voicestudio"), "whisper-local": fail("whisper-local"), scribe: ok("scribe", { cloud: true, calls }) } });
  assert.equal(r.engine, "scribe"); assert.deepEqual(calls, ["voicestudio", "whisper-local", "scribe"]);
  // config flag works the same, and a local success never reaches the cloud
  const calls2: string[] = [];
  const r2 = await transcribe({ ...base, config: { ...CONFIG, transcription: { minTimeoutSec: 0, allowCloud: true } }, engineImpls: { voicestudio: ok("voicestudio", { calls: calls2 }), "whisper-local": ok("whisper-local"), scribe: ok("scribe", { cloud: true, calls: calls2 }) } });
  assert.equal(r2.engine, "voicestudio"); assert.deepEqual(calls2, ["voicestudio"]);
});
test("cloud engine without a key is skipped with a reason even when allowed", async () => {
  const r = await transcribe({ ...base, allowCloud: true, engines: ["scribe", "whisper-local"], engineImpls: { scribe: ok("scribe", { cloud: true, avail: "no ElevenLabs key found" }), "whisper-local": ok("whisper-local") } });
  assert.equal(r.engine, "whisper-local"); assert.equal(r.attempts[0]!.reason, "no ElevenLabs key found");
});
test("corrupt input or no audio stops at once: no engine is tried", async () => {
  const calls: string[] = [];
  await assert.rejects(transcribe({ ...base, prepare: () => { throw new InputError("the file has no audio track"); }, engineImpls: { voicestudio: ok("voicestudio", { calls }), "whisper-local": ok("whisper-local", { calls }) } }), InputError);
  assert.deepEqual(calls, []);
});
test("attempts carry no path and no key", async () => {
  const r = await transcribe({ ...base, engineImpls: { voicestudio: fake("voicestudio", async () => { throw new Error(`ENOENT /${"Users"}/me/secret/dir/model.bin key sk_abcdefgh12345678`); }), "whisper-local": ok("whisper-local") } });
  assert.doesNotMatch(JSON.stringify(r.attempts), /Users|secret|sk_abcdefgh/);
});
test("unknown engine is refused", async () => {
  await assert.rejects(transcribe({ ...base, engines: ["nope"] }), /unknown engine/);
});
test("whisper.cpp JSON: per-word times in seconds, punctuation glued, markers dropped", () => {
  const o = parseWhisperCppJson({ result: { language: "pt" }, transcription: [
    { text: " [_BEG_]", offsets: { from: 0, to: 0 } }, { text: " Olá", offsets: { from: 120, to: 480 } }, { text: ",", offsets: { from: 480, to: 500 } }, { text: " mundo", offsets: { from: 600, to: 1234 } }] });
  assert.deepEqual(o.words, [{ t: "Olá,", a: 0.12, b: 0.5 }, { t: "mundo", a: 0.6, b: 1.23 }]); assert.equal(o.language, "pt");
});
test("SRT format: numbering, timestamps with comma, blank line, two lines for long cues, break on pause and sentence end", () => {
  const w = (t: string, a: number, b: number) => ({ t, a, b });
  const srt = toSrt([w("Olá", 0, 0.4), w("mundo.", 0.5, 1.2), w("Esta", 3725.5, 3726), w("é", 3726, 3726.1), w("uma", 3726.1, 3726.4), w("frase", 3726.4, 3726.9), w("bem", 3726.9, 3727.2), w("comprida", 3727.2, 3727.9), w("para", 3727.9, 3728.1), w("quebrar", 3728.1, 3728.6), w("linha.", 3728.6, 3729)]);
  const [c1, c2] = srt.split("\n\n");
  assert.equal(c1, "1\n00:00:00,000 --> 00:00:01,200\nOlá mundo.");
  assert.match(c2!, /^2\n01:02:05,500 --> 01:02:09,000\nEsta é uma frase bem\ncomprida para quebrar linha\.\n?$/);
  assert.ok(srt.endsWith("\n"));
});
test("writeTranscript writes json, srt and txt with per-word times", () => {
  const dir = mkdtempSync(join(tmpdir(), "tr-test-"));
  const r = { engine: "x", engineVersion: "1", language: "pt", durationSec: 3, words: [{ t: "oi", a: 0.1, b: 0.4 }, { t: "mundo", a: 0.5, b: 1 }], text: "oi mundo", attempts: [{ engine: "x", ok: true }] };
  const f = writeTranscript(r, join(dir, "sub"));
  assert.deepEqual(JSON.parse(readFileSync(f.json, "utf8")).words, r.words);
  assert.equal(readFileSync(f.txt, "utf8"), "oi mundo\n"); assert.ok(existsSync(f.srt));
  assert.match(readFileSync(f.srt, "utf8"), /00:00:00,100 --> 00:00:01,000/);
});

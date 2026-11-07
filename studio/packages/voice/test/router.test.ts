// node --test studio/packages/voice/test
import test from "node:test";
import assert from "node:assert/strict";
import { generateWithFailover } from "../src/router.ts";
import { resolveVoice } from "../src/config.ts";
import type { VoicesConfig } from "../src/config.ts";
import type { VoiceProvider } from "../src/providers/elevenlabs.ts";

const CONFIG: VoicesConfig = { accounts: { elevenlabs: ["a", "b", "c"] }, voices: { v: { provider: "elevenlabs", model: "eleven_v4", ids: { a: "IDA", b: "IDB", c: "IDC" } } }, strategy: {} };
const failure = (statusCode: number, body: unknown) => Object.assign(new Error("x"), { statusCode, body });
process.env.PRAEKO_STUDIO_KEY_ELEVENLABS_A = "ka"; process.env.PRAEKO_STUDIO_KEY_ELEVENLABS_B = "kb"; process.env.PRAEKO_STUDIO_KEY_ELEVENLABS_C = "kc";
const waits: number[] = [];
const base = { config: CONFIG, voice: "v", text: "hello world", wait: async (ms: number) => { waits.push(ms); } };
const factory = (map: Record<string, VoiceProvider>) => (account: string) => map[account] as VoiceProvider;
const balance = (remaining: number) => async () => ({ used: 0, limit: 1e6, remaining, plan: "x", resets: null });
const ok = (remaining = 1e6): VoiceProvider => ({ name: "t", balance: balance(remaining), generate: async ({ id }) => Buffer.from("audio-" + id) });
const failing = (e: unknown, remaining = 1e6): VoiceProvider => ({ name: "t", balance: balance(remaining), generate: async () => { throw e; } });

test("uses the first account when all is well", async () => {
  const r = await generateWithFailover({ ...base, create: factory({ a: ok(), b: ok(), c: ok() }) });
  assert.equal(r.account, "a"); assert.equal(r.buffer.toString(), "audio-IDA");
});
test("skips the account without enough balance", async () => {
  const r = await generateWithFailover({ ...base, create: factory({ a: ok(3), b: ok(), c: ok() }) });
  assert.equal(r.account, "b"); assert.match((r.attempts[0] as { reason: string }).reason, /insufficient balance/);
});
test("exhausted quota (401 quota_exceeded) moves to the next account", async () => {
  const r = await generateWithFailover({ ...base, create: factory({ a: failing(failure(401, { detail: { status: "quota_exceeded" } })), b: ok(), c: ok() }) });
  assert.equal(r.account, "b"); assert.equal((r.attempts[0] as { reason: string }).reason, "quota");
});
test("invalid key (401) moves to the next account", async () => {
  const a: VoiceProvider = { name: "t", balance: async () => { throw failure(401, "invalid_api_key"); }, generate: async () => { throw failure(401, "invalid_api_key"); } };
  const r = await generateWithFailover({ ...base, create: factory({ a, b: ok(), c: ok() }) });
  assert.equal(r.account, "b"); assert.equal((r.attempts[0] as { reason: string }).reason, "auth");
});
test("429 waits and retries on the same account before switching", async () => {
  let n = 0; waits.length = 0;
  const a: VoiceProvider = { name: "t", balance: balance(1e6), generate: async ({ id }) => { if (n++ < 1) throw failure(429, "too_many_concurrent_requests"); return Buffer.from("audio-" + id); } };
  const r = await generateWithFailover({ ...base, create: factory({ a, b: ok(), c: ok() }) });
  assert.equal(r.account, "a"); assert.equal(n, 2); assert.deepEqual(waits, [5000]);
});
test("persistent 429 switches account after the retries", async () => {
  const r = await generateWithFailover({ ...base, create: factory({ a: failing(failure(429, "system_busy")), b: ok(), c: ok() }) });
  assert.equal(r.account, "b"); assert.equal((r.attempts[0] as { reason: string }).reason, "rate");
});
test("text error (400) stops without trying another account", async () => {
  await assert.rejects(generateWithFailover({ ...base, create: factory({ a: failing(failure(400, "invalid text")), b: ok(), c: ok() }) }), /text rejected/);
});
test("an account without a key is skipped; if none works, the error lists the reasons", async () => {
  delete process.env.PRAEKO_STUDIO_KEY_ELEVENLABS_A;
  const r = await generateWithFailover({ ...base, create: factory({ b: ok(), c: ok() }) });
  assert.equal(r.account, "b"); assert.equal((r.attempts[0] as { reason: string }).reason, "no key");
  const bad = failing(failure(402, "payment_required"));
  await assert.rejects(generateWithFailover({ ...base, create: factory({ b: bad, c: bad }) }), /no account could generate.*b: quota.*c: quota/);
  process.env.PRAEKO_STUDIO_KEY_ELEVENLABS_A = "ka";
});
test("noFailover uses only the first account", async () => {
  await assert.rejects(generateWithFailover({ ...base, noFailover: true, create: factory({ a: failing(failure(401, { detail: { status: "quota_exceeded" } })), b: ok(), c: ok() }) }), /no account could generate/);
});
test("resolveVoice: name, the oldest shape and a clear error", () => {
  assert.equal((resolveVoice("v", CONFIG).ids as Record<string, string>).b, "IDB");
  process.env.X_ID = "ABC";
  assert.equal((resolveVoice({ provider: "elevenlabs", idEnv: "X_ID", model: "m" }, CONFIG).ids as Record<string, string>).principal, "ABC");
  assert.throws(() => resolveVoice("nothing", CONFIG), /does not exist/);
});

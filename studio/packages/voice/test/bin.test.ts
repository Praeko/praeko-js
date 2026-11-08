import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bin = (name: string, args: string[], env: Record<string, string> = {}) => spawnSync(process.execPath, [new URL(`../bin/${name}`, import.meta.url).pathname, ...args], { encoding: "utf8", env: { ...process.env, ...env } });

test("account: English usage; the old Portuguese subcommand is gone", () => {
  const r = bin("account.ts", ["add"]); // no name: usage
  assert.equal(r.status, 2); assert.match(r.stderr, /usage: account\.ts list \| account\.ts add <name>/);
  assert.equal(bin("account.ts", ["adicionar"]).status, 2);
});
test("config key: stores from an environment variable, in English; `chave` is not accepted", () => {
  const d = mkdtempSync(join(tmpdir(), "voice-bin-")), env = { PRAEKO_SECRETS: join(d, "s.json"), PRAEKO_NO_KEYCHAIN: "1", MY_KEY: "k-123456" };
  const ok = bin("config.ts", ["key", "elevenlabs/x", "--from-env", "MY_KEY"], env);
  assert.equal(ok.status, 0); assert.match(ok.stdout, /^stored \(file, elevenlabs\/x\): k-1…56/);
  assert.equal(JSON.parse(readFileSync(join(d, "s.json"), "utf8"))["elevenlabs/x"], "k-123456");
  const old = bin("config.ts", ["chave", "elevenlabs/y"], env);
  assert.equal(old.status, 2); assert.match(old.stderr, /usage: config\.ts key/);
});

// ElevenLabs stub: a preload that replaces fetch (account.ts has a fixed host)
const stubFetch = (d: string, voicesJson: string) => {
  const f = join(d, "stub.mjs");
  writeFileSync(f, `globalThis.fetch = async (u) => { const p = String(u); const j = (o) => ({ ok: true, status: 200, json: async () => o });
    if (p.endsWith("/v1/user/subscription")) return j({ tier: "starter", character_limit: 40000, character_count: 504, next_character_count_reset_unix: 1796000000 });
    if (p.endsWith("/v1/voices")) return j({ voices: ${voicesJson} }); return { ok: false, status: 404, json: async () => ({}) }; };\n`);
  return f;
};
const runAdd = (d: string, args: string[], stub: string) => spawnSync(process.execPath, ["--import", stub, new URL("../bin/account.ts", import.meta.url).pathname, "add", ...args], { encoding: "utf8", cwd: d, env: { ...process.env, PRAEKO_SECRETS: join(d, "s.json"), PRAEKO_NO_KEYCHAIN: "1", PRAEKO_STUDIO_CONFIG: join(d, "cfg"), MY_KEY: "sk_test_abcdef" } });

test("account add: with no --voice, uses the project's voice that matches the only clone (not the 'my-voice' placeholder)", () => {
  const d = mkdtempSync(join(tmpdir(), "voice-add-")); writeFileSync(join(d, "brand.json"), "{}");
  writeFileSync(join(d, "voices.json"), JSON.stringify({ accounts: { elevenlabs: ["principal"] }, voices: { narrator: { provider: "elevenlabs", model: "eleven_v4", ids: { principal: "AAA" } } } }));
  const r = runAdd(d, ["distrito", "--from-env", "MY_KEY"], stubFetch(d, '[{ "name": "Narrator", "voice_id": "GJo3", "category": "cloned" }]'));
  assert.equal(r.status, 0, r.stderr + r.stdout); assert.match(r.stdout, /using voice "narrator"/);
  const v = JSON.parse(readFileSync(join(d, "voices.json"), "utf8"));
  assert.deepEqual(v.accounts.elevenlabs, ["principal", "distrito"]); assert.equal(v.voices.narrator.ids.distrito, "GJo3");
  assert.equal(JSON.parse(readFileSync(join(d, "s.json"), "utf8"))["elevenlabs/distrito"], "sk_test_abcdef");
});
test("account add: when no voice id can be found, the key is still stored and the message gives the exact next command", () => {
  const d = mkdtempSync(join(tmpdir(), "voice-add-")); writeFileSync(join(d, "brand.json"), "{}");
  const r = runAdd(d, ["distrito", "--from-env", "MY_KEY"], stubFetch(d, '[{ "name": "Other", "voice_id": "ZZZ", "category": "cloned" }]'));
  assert.equal(r.status, 1); assert.match(r.stderr, /the key WAS stored/); assert.match(r.stderr, /--voice-id ZZZ/);
  assert.equal(JSON.parse(readFileSync(join(d, "s.json"), "utf8"))["elevenlabs/distrito"], "sk_test_abcdef");
});

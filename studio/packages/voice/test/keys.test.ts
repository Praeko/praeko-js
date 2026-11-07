import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, getKey, knownRefs, resolveVoice, storeKey } from "../src/config.ts";

const sandbox = () => {
  const d = mkdtempSync(join(tmpdir(), "voice-cfg-"));
  process.env.PRAEKO_STUDIO_CONFIG = join(d, "user"); process.env.PRAEKO_SECRETS = join(d, "secrets.json"); process.env.PRAEKO_NO_KEYCHAIN = "1";
  delete process.env.ELEVENLABS_API_KEY; delete process.env.ELEVENLABS_VOICE_ID; delete process.env.PRAEKO_STUDIO_KEY_ELEVENLABS_PRINCIPAL;
  return d;
};

test("knownRefs includes the config accounts and the fixed ones", () => {
  const l = knownRefs({ voices: {}, accounts: { elevenlabs: ["principal", "backup"], disabled: { "principal-ws2": "reason" } } });
  assert.deepEqual(l.sort(), ["buffer/principal", "elevenlabs/backup", "elevenlabs/principal", "elevenlabs/principal-ws2", "praeko/main"]);
});
test("default config: nobody's ids, silent draft and an empty user voice", () => {
  sandbox();
  const c = loadConfig(), txt = JSON.stringify(c);
  assert.equal(c.quality?.draft, "draft-silent");
  assert.deepEqual((c.voices["my-voice"] as { ids: object }).ids, {});
  assert.doesNotMatch(txt, /marcone/i);
  assert.doesNotMatch(txt, /"voice_?id"\s*:\s*"[A-Za-z0-9]{18,}"/i); // no real voice id in the default
});
test("layers: project beats user, which beats the default; ELEVENLABS_VOICE_ID applies when there are no ids", () => {
  const d = sandbox();
  mkdirSync(join(d, "user"), { recursive: true });
  writeFileSync(join(d, "user", "voices.json"), JSON.stringify({ voices: { "my-voice": { provider: "elevenlabs", model: "from-user", ids: { principal: "U" } } } }));
  assert.equal(resolveVoice("my-voice", loadConfig()).model, "from-user");
  const proj = join(d, "proj"); mkdirSync(proj); writeFileSync(join(proj, "brand.json"), "{}"); writeFileSync(join(proj, "voices.json"), JSON.stringify({ voices: { "my-voice": { provider: "elevenlabs", model: "from-project", ids: { principal: "P" } } } }));
  const before = process.cwd(); process.chdir(proj);
  try { const v = resolveVoice("my-voice", loadConfig()); assert.equal(v.model, "from-project"); assert.equal((v.ids as Record<string, string>).principal, "P"); } finally { process.chdir(before); }
  sandbox(); process.env.ELEVENLABS_VOICE_ID = "VOICE123";
  assert.equal((resolveVoice("my-voice", loadConfig()).ids as Record<string, string>).principal, "VOICE123");
});
test("keys outside macOS: environment wins, otherwise the secrets file with mode 600; no `security`", () => {
  const d = sandbox();
  assert.equal(getKey("elevenlabs/principal"), null);
  assert.equal(storeKey("elevenlabs/principal", "KEY-X"), "file");
  assert.equal(getKey("elevenlabs/principal"), "KEY-X");
  assert.equal(JSON.parse(readFileSync(join(d, "secrets.json"), "utf8"))["elevenlabs/principal"], "KEY-X");
  if (process.platform !== "win32") assert.equal(statSync(join(d, "secrets.json")).mode & 0o777, 0o600);
  process.env.ELEVENLABS_API_KEY = "FROM-ENV";
  assert.equal(getKey("elevenlabs/principal"), "FROM-ENV");
  delete process.env.ELEVENLABS_API_KEY;
});
test("Praeko key: PRAEKO_KEY works and writing uses the `praeko` CLI account (praeko/chave)", () => {
  const d = sandbox();
  storeKey("praeko/main", "praeko_X");
  assert.equal(JSON.parse(readFileSync(join(d, "secrets.json"), "utf8"))["praeko/chave"], "praeko_X");
  assert.equal(getKey("praeko/main"), "praeko_X");
  process.env.PRAEKO_KEY = "praeko_ENV"; assert.equal(getKey("praeko/main"), "praeko_ENV"); delete process.env.PRAEKO_KEY;
});

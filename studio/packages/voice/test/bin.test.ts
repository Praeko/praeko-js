import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
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

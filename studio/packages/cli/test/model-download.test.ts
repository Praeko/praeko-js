// transcribe --download-model with a fake fetch and a tiny body: the real 547 MB file is never downloaded.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transcribeCommand } from "../src/commands.ts";

const body = Buffer.from("tiny fake model");
const spec = { name: "t", file: "ggml-t.bin", url: "http://fake/m.bin", sha256: createHash("sha256").update(body).digest("hex"), bytes: body.length };
const mkDest = () => join(mkdtempSync(join(tmpdir(), "dm-")), "ggml-t.bin");
const fetchOk = (counter?: { n: number }) => (async () => { if (counter) counter.n++; return new Response(body, { status: 200 }); }) as unknown as typeof fetch;

test("no terminal and no --yes: refuses before any request", async () => {
  const dest = mkDest(), c = { n: 0 };
  await assert.rejects(transcribeCommand(["--download-model"], { interactive: false, say: () => {}, spec, dest, fetchImpl: fetchOk(c) }), /explicit yes/);
  assert.equal(c.n, 0); assert.equal(existsSync(dest), false);
});

test("answer no downloads nothing; answer yes installs and the output shows size, source and hash", async () => {
  const dest = mkDest(), c = { n: 0 }, said: string[] = [];
  assert.equal(await transcribeCommand(["--download-model"], { ask: async () => "n", say: (m) => said.push(m), spec, dest, fetchImpl: fetchOk(c) }), 1);
  assert.equal(c.n, 0); assert.equal(existsSync(dest), false);
  assert.equal(await transcribeCommand(["--download-model"], { ask: async () => "y", say: (m) => said.push(m), spec, dest, fetchImpl: fetchOk(c) }), 0);
  assert.ok(existsSync(dest)); assert.match(said.join("\n"), /http:\/\/fake\/m\.bin/); assert.match(said.join("\n"), /SHA-256 expected/);
});

test("--yes installs; a wrong hash is refused and nothing is installed", async () => {
  const d1 = mkDest(), d2 = mkDest();
  assert.equal(await transcribeCommand(["--download-model", "--yes"], { say: () => {}, spec, dest: d1, fetchImpl: fetchOk() }), 0);
  assert.ok(existsSync(d1));
  await assert.rejects(transcribeCommand(["--download-model", "--yes"], { say: () => {}, spec: { ...spec, sha256: "1".repeat(64) }, dest: d2, fetchImpl: fetchOk() }), /SHA-256/);
  assert.equal(existsSync(d2), false);
});

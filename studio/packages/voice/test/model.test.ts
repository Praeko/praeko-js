// node --test studio/packages/voice/test  (local fake HTTP server and a tiny file: the real 547 MB model is never downloaded)
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MANAGED_MODEL, ModelError, downloadModel } from "../src/model.ts";
import { DEFAULT_MODEL } from "../src/transcribe.ts";

const BODY = Buffer.alloc(200_000, "praeko-model-");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
async function serve(body: Buffer, o: { cutAt?: number; ignoreRange?: boolean } = {}) {
  const hits: Array<string | undefined> = [];
  const srv = createServer((req, res) => {
    hits.push(req.headers.range);
    const m = /bytes=(\d+)-/.exec(req.headers.range || "");
    const from = m && !o.ignoreRange ? +m[1]! : 0;
    res.writeHead(m && !o.ignoreRange ? 206 : 200, { "content-length": body.length - from });
    const chunk = body.subarray(from);
    if (o.cutAt !== undefined && !m) { res.write(chunk.subarray(0, o.cutAt)); setTimeout(() => res.destroy(), 20); } else res.end(chunk);
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(srv.address() as any).port}/m.bin`, hits, close: () => new Promise<void>((r) => { srv.closeAllConnections(); srv.close(() => r()); }) };
}
const spec = (url: string, b = BODY) => ({ name: "t", file: "ggml-t.bin", url, sha256: sha(b), bytes: b.length });

test("managed model constants: default, official source, size and hash", () => {
  assert.equal(DEFAULT_MODEL, "large-v3-turbo-q5_0");
  assert.equal(MANAGED_MODEL.file, `ggml-${DEFAULT_MODEL}.bin`);
  assert.match(MANAGED_MODEL.url, /^https:\/\/huggingface\.co\/ggerganov\/whisper\.cpp\/resolve\/main\/ggml-large-v3-turbo-q5_0\.bin$/);
  assert.match(MANAGED_MODEL.sha256, /^[0-9a-f]{64}$/);
  assert.equal(Math.round(MANAGED_MODEL.bytes / 1048576), 547);
});

test("downloads, verifies the hash and renames; no .part is left", async () => {
  const s = await serve(BODY); const dir = mkdtempSync(join(tmpdir(), "model-ok-")); const dest = join(dir, "models", "ggml-t.bin");
  try {
    const r = await downloadModel({ spec: spec(s.url), dest });
    assert.equal(r.path, dest); assert.deepEqual(readFileSync(dest), BODY); assert.equal(existsSync(`${dest}.part`), false);
  } finally { await s.close(); }
});

test("a file with another hash is refused, deleted and never installed", async () => {
  const s = await serve(BODY); const dir = mkdtempSync(join(tmpdir(), "model-bad-")); const dest = join(dir, "ggml-t.bin");
  try {
    await assert.rejects(downloadModel({ spec: { ...spec(s.url), sha256: "0".repeat(64) }, dest }), (e: any) => e instanceof ModelError && /SHA-256/.test(e.message));
    assert.equal(existsSync(dest), false); assert.equal(existsSync(`${dest}.part`), false);
  } finally { await s.close(); }
});

test("an interrupted download keeps the .part and the next run resumes with Range", async () => {
  const s1 = await serve(BODY, { cutAt: 50_000 }); const dir = mkdtempSync(join(tmpdir(), "model-resume-")); const dest = join(dir, "ggml-t.bin");
  await assert.rejects(downloadModel({ spec: spec(s1.url), dest }), ModelError);
  await s1.close();
  assert.equal(existsSync(dest), false); assert.ok(statSync(`${dest}.part`).size > 0);
  const s2 = await serve(BODY);
  try {
    const r = await downloadModel({ spec: spec(s2.url), dest });
    assert.ok(r.resumedFrom > 0); assert.match(String(s2.hits[0]), /^bytes=\d+-$/); assert.deepEqual(readFileSync(dest), BODY);
  } finally { await s2.close(); }
});

test("a server that ignores Range restarts from zero over a garbage .part", async () => {
  const s = await serve(BODY, { ignoreRange: true }); const dir = mkdtempSync(join(tmpdir(), "model-range-")); const dest = join(dir, "ggml-t.bin");
  writeFileSync(`${dest}.part`, "garbage");
  try { await downloadModel({ spec: spec(s.url), dest }); assert.deepEqual(readFileSync(dest), BODY); } finally { await s.close(); }
});

test("server error stops without installing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "model-err-")); const dest = join(dir, "ggml-t.bin");
  const f = (async () => new Response("no", { status: 503 })) as unknown as typeof fetch;
  await assert.rejects(downloadModel({ spec: spec("http://x/m.bin"), dest, fetchImpl: f }), /503/);
  assert.equal(existsSync(dest), false);
});

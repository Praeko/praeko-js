// Phase 3: the two tools that spend something (studio_upload, studio_voice final) are TWO-STEP, the Praeko key is only used inside the process, and an admin key is warned about.
// Everything runs against a fake Praeko on localhost and a fake ElevenLabs balance client: no real service, no real key.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Confirmations } from "../src/confirm.ts";
import { FAKE_BIN, FAKE_PRAEKO, REAL_BIN, SECRETS, connect, fakePraeko, fakeProject, noSecret, realProject, tmp } from "./helpers.ts";

const withOut = (slug = "quick", cover = true): string => {
  const dir = fakeProject();
  mkdirSync(join(dir, "out"), { recursive: true });
  writeFileSync(join(dir, "out", `${slug}.mp4`), Buffer.alloc(2048, 7));
  if (cover) writeFileSync(join(dir, "out", `${slug}-cover.png`), Buffer.alloc(512, 9));
  return dir;
};

test("confirmations: random, short, bound to the arguments, single use, expiring, void after wrong tries", () => {
  let now = 1_000_000;
  const c = new Confirmations(() => now, 60_000);
  const a = c.issue("t", { slug: "x" }, { n: 1 });
  assert.match(a.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.notEqual(c.issue("t", { slug: "x" }).code, a.code);
  assert.equal(c.verify("t", { slug: "x" }, { n: 1 }, a.code).ok, true);
  assert.equal(c.verify("t", { slug: "x" }, { n: 1 }, a.code.toLowerCase().replace("-", " ")).ok, true, "case and separator do not matter");
  assert.equal(c.verify("other", { slug: "x" }, { n: 1 }, a.code).ok, false);
  assert.equal((c.verify("t", { slug: "y" }, { n: 1 }, a.code) as any).reason, "arguments_changed");
  assert.equal((c.verify("t", { slug: "x" }, { n: 2 }, a.code) as any).reason, "arguments_changed", "the extra binding counts");
  c.burn(a.code);
  assert.equal((c.verify("t", { slug: "x" }, { n: 1 }, a.code) as any).reason, "unknown_code", "single use");
  const b = c.issue("t", { slug: "x" });
  now += 60_001;
  assert.equal((c.verify("t", { slug: "x" }, null, b.code) as any).reason, "expired");
  const d = c.issue("t", { slug: "x" });
  for (let i = 0; i < 4; i++) assert.equal((c.verify("t", { slug: "z" }, null, d.code) as any).reason, "arguments_changed");
  assert.equal((c.verify("t", { slug: "z" }, null, d.code) as any).reason, "too_many_tries");
  assert.equal((c.verify("t", { slug: "x" }, null, d.code) as any).reason, "unknown_code", "void even for the right arguments");
  for (let i = 0; i < 100; i++) c.issue("t", { i });
  assert.ok(c.size <= 32, "pending codes are capped");
});

test("studio_upload: the preview changes nothing; only the code runs it, once; the answer has media ids and no key", async () => {
  const api = await fakePraeko("write");
  const c = await connect({ project: withOut(), studioBin: FAKE_BIN, praeko: { url: api.url, wait: async () => {} } });
  try {
    const p = await c.call("studio_upload", { slug: "quick" });
    assert.ok(!p.isError, p.text);
    assert.equal(p.body.preview, true); assert.equal(p.body.executed, false);
    assert.deepEqual(p.body.files.map((f: any) => [f.role, f.path, f.bytes]), [["video", "out/quick.mp4", 2048], ["cover", "out/quick-cover.png", 512]]);
    assert.equal(p.body.totalBytes, 2560);
    assert.equal(p.body.destination.service, api.url);
    assert.match(p.body.confirmation_code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.match(p.body.next_step, /NOTHING was done/);
    assert.equal(api.requests.length, 0, "the preview made no request to Praeko");
    // wrong code, wrong slug, garbage: nothing goes out
    assert.equal((await c.call("studio_upload", { slug: "quick", confirm: "ZZZZ-ZZZZ" })).body.reason, "unknown_code");
    assert.ok((await c.call("studio_upload", { slug: "other", confirm: p.body.confirmation_code })).isError);
    assert.equal(api.requests.length, 0);
    const r = await c.call("studio_upload", { slug: "quick", confirm: p.body.confirmation_code });
    assert.ok(!r.isError, r.text);
    assert.equal(r.body.executed, true);
    assert.deepEqual(r.body.uploaded.map((u: any) => [u.role, u.type, u.bytes, u.state]), [["video", "video", 2048, "ready"], ["cover", "cover", 512, "ready"]]);
    assert.match(r.body.uploaded[0].mediaId, /^med_\d{4}$/);
    assert.match(r.body.next, /Nothing was published/);
    assert.deepEqual([...new Set(api.requests.map((q) => q.path.replace(/med_\d+/, "ID")))].sort(), ["/v1/media", "/v1/media/ID/content"], "only the media library routes: no post, no schedule");
    assert.ok(api.requests.every((q) => q.auth === `Bearer ${FAKE_PRAEKO}`), "the key travels only as the Authorization header to the configured service");
    assert.equal(api.requests.length, 4);
    assert.equal((await c.call("studio_upload", { slug: "quick", confirm: p.body.confirmation_code })).body.reason, "unknown_code", "a code works once");
    assert.equal(api.requests.length, 4);
    for (const t of [p, r]) noSecret("upload", t.text);
  } finally { await c.close(); await api.close(); }
});

test("studio_upload: a changed file, an expired code, no cover, no video, no key, an escaping link", async () => {
  const api = await fakePraeko("write");
  let now = Date.now();
  const dir = withOut("quick", false);
  const c = await connect({ project: dir, studioBin: FAKE_BIN, praeko: { url: api.url, wait: async () => {} }, confirm: { now: () => now, ttlMs: 60_000 } });
  try {
    const p = await c.call("studio_upload", { slug: "quick" });
    assert.equal(p.body.files.length, 1); assert.match(p.body.note, /no cover/);
    writeFileSync(join(dir, "out", "quick.mp4"), Buffer.alloc(4096, 1)); // re-rendered after the preview
    const changed = await c.call("studio_upload", { slug: "quick", confirm: p.body.confirmation_code });
    assert.ok(changed.isError); assert.equal(changed.body.reason, "arguments_changed");
    const p2 = await c.call("studio_upload", { slug: "quick" });
    now += 61_000;
    assert.equal((await c.call("studio_upload", { slug: "quick", confirm: p2.body.confirmation_code })).body.reason, "expired");
    const p3 = await c.call("studio_upload", { slug: "quick" });
    const ok = await c.call("studio_upload", { slug: "quick", confirm: p3.body.confirmation_code });
    assert.equal(ok.body.uploaded.length, 1); assert.equal(ok.body.uploaded[0].bytes, 4096);
    const noVideo = await c.call("studio_upload", { slug: "slow" });
    assert.ok(noVideo.isError); assert.match(noVideo.body.error, /render the episode first/);
    // a link that leads out of the project is refused even if the target exists
    const outside = tmp("elsewhere"); writeFileSync(join(outside, "x.mp4"), "outside");
    symlinkSync(join(outside, "x.mp4"), join(dir, "out", "other.mp4"));
    const link = await c.call("studio_upload", { slug: "other" });
    assert.ok(link.isError); assert.match(link.body.error, /outside the project/);
  } finally { await c.close(); }
  const nokey = await connect({ project: withOut(), studioBin: FAKE_BIN, praeko: { url: api.url, getKey: () => null } });
  const r = await nokey.call("studio_upload", { slug: "quick" });
  assert.ok(r.isError); assert.match(r.body.error, /no Praeko key/); assert.match(r.body.error, /never ask for the key/i);
  await nokey.close(); await api.close();
});

test("studio_upload: a failure keeps what already went up, and the key is scrubbed from the server's own words", async () => {
  const api = await fakePraeko("write");
  const c = await connect({ project: withOut(), studioBin: FAKE_BIN, praeko: { url: api.url, wait: async () => {} } });
  try {
    api.failVideoUpload = true;
    const p = await c.call("studio_upload", { slug: "quick" });
    const r = await c.call("studio_upload", { slug: "quick", confirm: p.body.confirmation_code });
    assert.ok(r.isError); assert.match(r.body.error, /upload failed/); assert.match(r.body.error, /file_too_large/);
    noSecret("failed upload", r.text);
  } finally { await c.close(); await api.close(); }
});

test("studio_upload refuses a service URL that is not https (or localhost), and brand.json cannot redirect the key", async () => {
  const dir = withOut();
  writeFileSync(join(dir, "brand.json"), JSON.stringify({ name: "Fake", publishing: { praeko: { url: "https://evil.example" } } }));
  const api = await fakePraeko("write");
  const c = await connect({ project: dir, studioBin: FAKE_BIN, praeko: { url: api.url, wait: async () => {} } });
  try {
    const p = await c.call("studio_upload", { slug: "quick" });
    assert.equal(p.body.destination.service, api.url, "brand.json is ignored for the service URL");
    assert.doesNotMatch(p.text, /evil\.example/);
  } finally { await c.close(); await api.close(); }
  const bad = await connect({ project: withOut(), studioBin: FAKE_BIN, praeko: { url: "http://example.com" } });
  const r = await bad.call("studio_upload", { slug: "quick" });
  assert.ok(r.isError); assert.match(r.body.error, /invalid Praeko URL/);
  await bad.close();
});

// ---------- final voice

const fakeEleven = (remaining: number, calls: string[] = []) => (account: string, _key: string) => ({
  name: "fake", generate: async () => { throw new Error("must never generate in a test"); },
  balance: async () => { calls.push(account); return { used: 100000 - remaining, limit: 100000, remaining, plan: "creator", resets: new Date("2027-01-01T00:00:00Z") }; },
}) as any;

function voiceProject(script = "Hello there. This is the narration of the test video."): string {
  const dir = fakeProject();
  writeFileSync(join(dir, "episodes", "quick", "script.txt"), script);
  writeFileSync(join(dir, "voices.json"), JSON.stringify({ accounts: { elevenlabs: ["principal"] }, voices: { "my-voice": { provider: "elevenlabs", ids: { principal: "voice-id-1" }, aligner: "scribe" } }, quality: { final: "my-voice" } }));
  return dir;
}

test("studio_voice final: a preview with characters, account and balance; the job starts only with the code; draft stays free", async () => {
  const calls: string[] = [];
  const dir = voiceProject();
  const c = await connect({ project: dir, studioBin: FAKE_BIN, voice: { create: fakeEleven(50000, calls) } });
  try {
    const p = await c.call("studio_voice", { slug: "quick", quality: "final" });
    assert.ok(!p.isError, p.text);
    assert.equal(p.body.preview, true); assert.equal(p.body.executed, false);
    assert.equal(p.body.scriptCharacters, "Hello there. This is the narration of the test video.".length);
    assert.equal(p.body.willUse.account, "principal"); assert.equal(p.body.willUse.remaining, 50000);
    assert.equal(p.body.sufficient, true); assert.deepEqual(p.body.warnings, []);
    assert.equal(p.body.provider, "elevenlabs"); assert.equal(p.body.free, false);
    assert.match(p.body.confirmation_code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.equal(c.jobs.list().length, 0, "the preview started nothing");
    noSecret("voice preview", p.text);
    // a stale code is refused before any balance request
    const before = calls.length;
    assert.equal((await c.call("studio_voice", { slug: "quick", quality: "final", confirm: "ZZZZ-ZZZZ" })).body.reason, "unknown_code");
    assert.equal(calls.length, before, "no request to the provider for a wrong code");
    assert.ok((await c.call("studio_voice", { slug: "quick", quality: "draft", confirm: p.body.confirmation_code })).isError, "draft takes no code");
    // the script changes after the preview: the code is void
    writeFileSync(join(dir, "episodes", "quick", "script.txt"), "A different, much longer narration than the one that was previewed.");
    assert.equal((await c.call("studio_voice", { slug: "quick", quality: "final", confirm: p.body.confirmation_code })).body.reason, "arguments_changed");
    const p2 = await c.call("studio_voice", { slug: "quick", quality: "final" });
    const r = await c.call("studio_voice", { slug: "quick", quality: "final", confirm: p2.body.confirmation_code });
    assert.ok(!r.isError, r.text); assert.match(r.body.jobId, /^job_[a-f0-9]{16}$/);
    const done = await c.call("studio_job", { jobId: r.body.jobId, waitSeconds: 20 });
    assert.equal(done.body.state, "succeeded", done.text);
    assert.match(done.body.log.text, /fake voice quick/);
    assert.equal((await c.call("studio_voice", { slug: "quick", quality: "final", confirm: p2.body.confirmation_code })).body.reason, "unknown_code", "single use");
    const draft = await c.call("studio_voice", { slug: "quick" });
    assert.ok(!draft.isError && draft.body.jobId, "draft needs no confirmation");
  } finally { await c.close(); }
});

test("studio_voice final: an insufficient balance is a warning in the preview and blocks the run", async () => {
  const c = await connect({ project: voiceProject("x".repeat(500)), studioBin: FAKE_BIN, voice: { create: fakeEleven(100) } });
  try {
    const p = await c.call("studio_voice", { slug: "quick", quality: "final" });
    assert.equal(p.body.sufficient, false); assert.equal(p.body.willUse, null);
    assert.match(p.body.warnings[0], /INSUFFICIENT BALANCE/);
    const r = await c.call("studio_voice", { slug: "quick", quality: "final", confirm: p.body.confirmation_code });
    assert.ok(r.isError); assert.match(r.body.error, /balance is not enough/);
    assert.equal(c.jobs.list().length, 0);
  } finally { await c.close(); }
});

test("studio_voice final: no script, no final voice, a cut and an unreadable balance are clear answers", async () => {
  const noScript = await connect({ project: fakeProject(), studioBin: FAKE_BIN, voice: { create: fakeEleven(1000) } });
  assert.match((await noScript.call("studio_voice", { slug: "quick", quality: "final" })).body.error, /script\.txt does not exist/);
  await noScript.close();
  const dir = voiceProject();
  writeFileSync(join(dir, "episodes", "quick", "cut.json"), "{}");
  const cut = await connect({ project: dir, studioBin: FAKE_BIN, voice: { create: fakeEleven(1000) } });
  assert.match((await cut.call("studio_voice", { slug: "quick", quality: "final" })).body.error, /cut derived from a long video/);
  await cut.close();
  const broken = { create: () => ({ balance: async () => { throw new Error(`HTTP 401 ${SECRETS[0]}`); } }) as any };
  const c = await connect({ project: voiceProject(), studioBin: FAKE_BIN, voice: broken });
  const p = await c.call("studio_voice", { slug: "quick", quality: "final" });
  assert.equal(p.body.sufficient, true, "the router tries an account whose balance it cannot read");
  assert.match(p.body.warnings[0], /could not be read/);
  noSecret("balance error", p.text);
  await c.close();
});

// ---------- admin key warning

test("studio_status warns (does not fail) when the Praeko key is admin, and stays quiet for a write key", async () => {
  const api = await fakePraeko("admin");
  const c = await connect({ project: realProject(), studioBin: REAL_BIN, praeko: { url: api.url, wait: async () => {} } });
  try {
    const admin = await c.call("studio_status");
    assert.ok(!admin.isError, admin.text);
    assert.equal(admin.body.praekoKey.present, true); assert.equal(admin.body.praekoKey.scope, "admin");
    assert.match(admin.body.praekoKey.warning, /write scope/);
    const item = admin.body.doctor.items.find((i: any) => i.id === "key-praeko-scope");
    assert.equal(item.level, "warning");
    assert.deepEqual(api.requests.map((q) => `${q.method} ${q.path}`), ["GET /v1/api-keys"], "one read-only request, and nothing else");
    api.scope = "write";
    const write = await c.call("studio_status");
    assert.equal(write.body.praekoKey.scope, "limited"); assert.equal(write.body.praekoKey.warning, undefined);
    assert.ok(!write.body.doctor.items.some((i: any) => i.id === "key-praeko-scope"));
    for (const t of [admin, write]) noSecret("status", t.text);
  } finally { await c.close(); await api.close(); }
  const none = await connect({ project: realProject(), studioBin: REAL_BIN, praeko: { getKey: () => null } });
  assert.deepEqual((await none.call("studio_status")).body.praekoKey, { present: false });
  await none.close();
  const down = await connect({ project: realProject(), studioBin: REAL_BIN, praeko: { url: "http://127.0.0.1:9" } });
  const d = await down.call("studio_status");
  assert.equal(d.body.praekoKey.scope, "unknown"); assert.ok(!d.isError);
  await down.close();
});

// ---------- the closed list and the secret sweep

test("15 tools: still no publishing, scheduling, queue or account tool, and the only upload goes to the media library", async () => {
  const c = await connect({ project: fakeProject(), studioBin: FAKE_BIN });
  const { tools } = await c.client.listTools();
  assert.equal(tools.length, 15);
  for (const t of tools) {
    assert.doesNotMatch(t.name, /post|schedule|queue|account|connect|publish|login|key|idea|comment|insight|channel/i, t.name);
    assert.match(t.name, /^studio_/);
  }
  const up = tools.find((t) => t.name === "studio_upload")!;
  assert.match(up.description!, /creates no post and publishes nothing/i);
  assert.deepEqual(Object.keys((up.inputSchema as any).properties).sort(), ["confirm", "slug"], "no path, no URL, no key field: the files are fixed by the episode name");
  const voice = tools.find((t) => t.name === "studio_voice")!;
  assert.deepEqual(Object.keys((voice.inputSchema as any).properties).sort(), ["confirm", "quality", "slug"]);
  await c.close();
});

test("secret sweep: with fake keys everywhere, no tool answer, error or job log carries any part of them", async () => {
  const api = await fakePraeko("admin");
  const dir = withOut("quick");
  writeFileSync(join(dir, "episodes", "quick", "script.txt"), `narration ${SECRETS[0]} and ${SECRETS[1]}`);
  writeFileSync(join(dir, "voices.json"), JSON.stringify({ voices: { "my-voice": { provider: "elevenlabs", ids: { principal: "v1" } } }, quality: { final: "my-voice" } }));
  const c = await connect({ project: dir, studioBin: FAKE_BIN, praeko: { url: api.url, wait: async () => {} }, voice: { create: fakeEleven(90000) } });
  try {
    const outs: string[] = [];
    const add = async (name: string, args: Record<string, unknown>) => { const r = await c.call(name, args); outs.push(r.text); return r; };
    outs.push(JSON.stringify((await c.client.listTools()).tools));
    await add("studio_status", {});
    const up = await add("studio_upload", { slug: "quick" });
    await add("studio_upload", { slug: "quick", confirm: "NOPE-NOPE" });
    await add("studio_upload", { slug: "quick", confirm: up.body.confirmation_code });
    api.failVideoUpload = true;
    const up2 = await add("studio_upload", { slug: "quick" });
    await add("studio_upload", { slug: "quick", confirm: up2.body.confirmation_code });
    const v = await add("studio_voice", { slug: "quick", quality: "final" });
    const run = await add("studio_voice", { slug: "quick", quality: "final", confirm: v.body.confirmation_code });
    await add("studio_job", { action: "log", jobId: run.body.jobId, waitSeconds: 10 });
    await add("studio_job", { action: "list" });
    await add("studio_brief_read", {});
    await add("studio_upload", { slug: "../x" });
    for (const [i, o] of outs.entries()) noSecret(`output ${i}`, o);
    // the key reached the fake service only as an Authorization header
    assert.ok(api.requests.length > 0);
  } finally { await c.close(); await api.close(); }
});

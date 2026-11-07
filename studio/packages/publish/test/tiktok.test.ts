import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as tt from "../src/providers/tiktok.ts";

const MB = 1024 * 1024;
const pub: (a: any) => Promise<any> = tt.publish;
const planOf: (a: any) => Promise<string[]> = tt.plan;
const tmp = () => mkdtempSync(join(tmpdir(), "praeko-studio-tt-"));
const file = (dir: string, bytes: number) => { const f = join(dir, "v.mp4"); writeFileSync(f, Buffer.alloc(bytes, 7)); return f; };

/** ctx with a fetch routed by URL; `routes[url-part]` is a function (opts, n) → { status, body } */
function build({ now = new Date("2026-11-06T12:00:00Z"), routes = {} as Record<string, (o: any, n: number) => any>, secrets = {} as Record<string, string> } = {}) {
  const calls: { url: string; opts: any }[] = [], store: Record<string, string> = { ...secrets }, logs: string[] = [];
  const fetchFn = async (url: string, opts: any = {}) => {
    calls.push({ url, opts });
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error("route not simulated: " + url);
    const r = await routes[key]!(opts, calls.filter((c) => c.url.includes(key)).length);
    return { status: r.status ?? 200, ok: (r.status ?? 200) < 400, text: async () => JSON.stringify(r.body ?? {}) };
  };
  const ctx: any = { fetchFn, now: () => now, sleep: async () => {}, log: (m: string) => logs.push(m), tiktok: { pollMs: 0, maxPolls: 5 }, duration: () => 30,
    secrets: { get: (r: string) => store[r] ?? null, set: (r: string, v: string) => { store[r] = v; } } };
  return { ctx, calls, seg: store, logs };
}
const client = JSON.stringify({ key: "K", secret: "S", redirect: "https://example.com/return" });
const freshToken = (now = new Date("2026-11-06T12:00:00Z")) => JSON.stringify({ access_token: "acc", refresh_token: "ref", open_id: "oid", scope: "user.info.basic,video.upload,video.publish", expiresAt: +now + 3600e3, refreshExpiresAt: +now + 100 * 86400e3 });
const ok = (data: unknown) => ({ body: { data, error: { code: "ok", message: "", log_id: "x" } } });

test("chunkPlan: a small file in one part; a medium one; a large one with the last part absorbing the remainder", () => {
  assert.deepEqual(tt.chunkPlan(3 * MB).parts, [{ a: 0, b: 3 * MB - 1, size: 3 * MB }]);
  const p7 = tt.chunkPlan(7 * MB); assert.equal(p7.total, 1); assert.equal(p7.chunk, 7 * MB);
  const p = tt.chunkPlan(25 * MB + 123, 10 * MB);
  assert.equal(p.total, 2); assert.equal(p.chunk, 10 * MB);
  assert.equal(p.parts[0]!.size, 10 * MB); assert.equal(p.parts[1]!.size, 15 * MB + 123);
  assert.equal(p.parts.reduce((s, x) => s + x.size, 0), 25 * MB + 123);
  assert.equal(p.parts[1]!.b, 25 * MB + 122);
  const large = tt.chunkPlan(300 * MB, 64 * MB);
  assert.equal(large.total, 4); assert.ok(large.parts.at(-1)!.size <= 128 * MB);
  assert.throws(() => tt.chunkPlan(0), /empty/);
  assert.throws(() => tt.chunkPlan(5 * 1024 * MB), /4 GB/);
});
test("truncate does not cut a surrogate pair; privacy without an audit becomes SELF_ONLY", () => {
  assert.equal(tt.truncate("abc", 10), "abc");
  const t = tt.truncate("a".repeat(2199) + "😀😀", 2200); assert.ok(t.length <= 2200); assert.ok(!/[\ud800-\udbff]…$/.test(t));
  assert.deepEqual(tt.effectivePrivacy({ requested: "PUBLIC_TO_EVERYONE", audited: false }), { level: "SELF_ONLY", warning: "privacy PUBLIC_TO_EVERYONE → SELF_ONLY (app not audited)" });
  assert.equal(tt.effectivePrivacy({ requested: "PUBLIC_TO_EVERYONE", audited: true }).level, "PUBLIC_TO_EVERYONE");
  assert.throws(() => tt.effectivePrivacy({ requested: "PUBLIC_TO_EVERYONE", audited: true, creatorOptions: ["SELF_ONLY"] }), /outside the account/);
});
test("authorizationUrl e extractCode", () => {
  const u = new URL(tt.authorizationUrl({ key: "K", redirect: "https://e.com/r", state: "st" }));
  assert.equal(u.origin + u.pathname, "https://www.tiktok.com/v2/auth/authorize/");
  assert.equal(u.searchParams.get("scope"), "user.info.basic,video.upload,video.publish");
  assert.equal(u.searchParams.get("client_key"), "K");
  assert.deepEqual(tt.extractCode("https://e.com/r?code=abc%2Axyz&state=st&scopes=x"), { code: "abc*xyz", state: "st" });
  assert.equal(tt.extractCode("abc%2Bdef").code, "abc+def");
  assert.throws(() => tt.extractCode("https://e.com/r?error=access_denied&error_description=no"), /access_denied/);
});
test("connect: without a code it prints the URL; with --url it exchanges the code and stores the token", async () => {
  const { ctx, seg, logs } = build({ routes: { "/v2/oauth/token/": (o: any) => { assert.ok(o.body.includes("grant_type=authorization_code")); assert.ok(o.body.includes("code=abc")); assert.ok(o.body.includes("redirect_uri=https%3A%2F%2Fexample.com%2Freturn")); return { body: { access_token: "A", refresh_token: "R", open_id: "O", scope: "user.info.basic,video.upload", expires_in: 7200, refresh_expires_in: 15552000, token_type: "Bearer" } }; } } });
  await tt.connect({ ctx, args: ["--client-key", "K", "--client-secret", "S", "--redirect", "https://example.com/return"] });
  assert.ok(logs.join("\n").includes("https://www.tiktok.com/v2/auth/authorize/"));
  const state = JSON.parse(seg["tiktok/pending"]!).state;
  await tt.connect({ ctx, args: ["--url", `https://example.com/return?code=abc&state=${state}`] });
  const tok = JSON.parse(seg["tiktok/token"]!);
  assert.equal(tok.access_token, "A"); assert.equal(tok.refresh_token, "R");
  assert.equal(tok.expiresAt, +new Date("2026-11-06T12:00:00Z") + 7200e3);
  assert.ok(logs.join("\n").includes("missing video.publish"));
  await assert.rejects(tt.connect({ ctx, args: ["--url", "https://example.com/return?code=abc&state=other"] }), /state/);
});
test("validToken renews close to expiry and stores the new refresh token", async () => {
  const now = new Date("2026-11-06T12:00:00Z");
  const old = JSON.stringify({ access_token: "old", refresh_token: "r1", open_id: "o", scope: "s", expiresAt: +now + 60e3, refreshExpiresAt: +now + 50 * 86400e3 });
  const { ctx, seg } = build({ now, secrets: { "tiktok/client": client, "tiktok/token": old }, routes: { "/v2/oauth/token/": (o: any) => { assert.ok(o.body.includes("grant_type=refresh_token") && o.body.includes("refresh_token=r1")); return { body: { access_token: "fresh", refresh_token: "r2", expires_in: 7200, refresh_expires_in: 15552000, open_id: "o", scope: "s" } }; } } });
  assert.equal(await tt.validToken(ctx), "fresh");
  assert.equal(JSON.parse(seg["tiktok/token"]!).refresh_token, "r2");
  const { ctx: c2 } = build({ now, secrets: { "tiktok/client": client, "tiktok/token": freshToken(now) } });
  assert.equal(await tt.validToken(c2), "acc"); // still valid: no network call
  const expired = JSON.stringify({ access_token: "a", refresh_token: "r", expiresAt: +now - 1, refreshExpiresAt: +now - 1 });
  await assert.rejects(tt.validToken(build({ now, secrets: { "tiktok/client": client, "tiktok/token": expired } }).ctx), /connect/);
  await assert.rejects(tt.validToken(build().ctx), /not connected/);
});
test("status: connected shows the name; without a token it says how to connect", async () => {
  assert.equal((await tt.status({ ctx: build().ctx })).connected, false);
  const { ctx } = build({ secrets: { "tiktok/client": client, "tiktok/token": freshToken() }, routes: { "/v2/user/info/": () => ok({ user: { display_name: "Dev Channel", open_id: "oid" } }) } });
  const s = await tt.status({ ctx }); assert.equal(s.connected, true); assert.ok(s.detail.includes("Dev Channel"));
});
test("publish as a draft (inbox): init only with source_info, parts with Content-Range, waits for SEND_TO_USER_INBOX", async () => {
  const dir = tmp(), v = file(dir, 12 * MB);
  const puts: any[] = [];
  const { ctx, calls, logs } = build({ secrets: { "tiktok/client": client, "tiktok/token": freshToken() }, routes: {
    "/inbox/video/init/": (o: any) => { const b = JSON.parse(o.body); assert.equal(b.post_info, undefined); assert.equal(b.source_info.source, "FILE_UPLOAD"); assert.equal(b.source_info.video_size, 12 * MB); assert.equal(b.source_info.total_chunk_count, 1); return ok({ publish_id: "p1", upload_url: "https://up.tiktok/x" }); },
    "up.tiktok/x": (o: any) => { puts.push(o.headers); return { status: 201, body: {} }; },
    "/status/fetch/": (o: any, n: number) => ok({ status: n < 2 ? "PROCESSING_UPLOAD" : "SEND_TO_USER_INBOX" }) } });
  const item: any = { video: v, texts: { text: "Video caption" }, options: {} };
  const r = await pub({ item, ctx });
  assert.equal(r.id, "p1"); assert.equal(r.mode, "draft"); assert.equal(r.status, "SEND_TO_USER_INBOX"); assert.equal(r.caption, "Video caption");
  assert.equal(puts.length, 1); assert.equal(puts[0]["content-range"], `bytes 0-${12 * MB - 1}/${12 * MB}`); assert.equal(puts[0]["content-length"], String(12 * MB));
  assert.ok(!calls.some((c) => c.url.includes("creator_info")), "draft does not query creator info");
  assert.ok(logs.join("\n").includes("Video caption"));
  assert.equal(item.prep.publish_id, "p1");
  rmSync(dir, { recursive: true, force: true });
});
test("publish direct: creator info, SELF_ONLY forced without an audit, several parts, status PUBLISH_COMPLETE", async () => {
  const dir = tmp(), v = file(dir, 25 * MB + 5);
  const ranges: string[] = [];
  const { ctx, logs } = build({ secrets: { "tiktok/client": client, "tiktok/token": freshToken() }, routes: {
    "/creator_info/query/": () => ok({ creator_username: "devchannel", privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"], comment_disabled: false, duet_disabled: true, stitch_disabled: false, max_video_post_duration_sec: 300 }),
    "/v2/post/publish/video/init/": (o: any) => { const b = JSON.parse(o.body); assert.equal(b.post_info.privacy_level, "SELF_ONLY"); assert.equal(b.post_info.disable_duet, true); assert.equal(b.post_info.video_cover_timestamp_ms, 0); assert.equal(b.post_info.title, "Caption"); assert.equal(b.source_info.chunk_size, 10 * MB); assert.equal(b.source_info.total_chunk_count, 2); return ok({ publish_id: "p2", upload_url: "https://up.tiktok/y" }); },
    "up.tiktok/y": (o: any) => { ranges.push(o.headers["content-range"]); return { status: ranges.length === 1 ? 206 : 201, body: {} }; },
    "/status/fetch/": () => ok({ status: "PUBLISH_COMPLETE", publicaly_available_post_id: [123] }) } });
  const r = await pub({ item: { video: v, texts: { text: "Caption" }, options: { mode: "direct", privacy: "PUBLIC_TO_EVERYONE" } }, ctx });
  assert.equal(r.mode, "direct"); assert.equal(r.status, "PUBLISH_COMPLETE"); assert.equal(r.url, "https://www.tiktok.com/@devchannel/video/123");
  assert.deepEqual(ranges, [`bytes 0-${10 * MB - 1}/${25 * MB + 5}`, `bytes ${10 * MB}-${25 * MB + 4}/${25 * MB + 5}`]);
  assert.ok(logs.join("\n").includes("SELF_ONLY"));
  rmSync(dir, { recursive: true, force: true });
});
test("publish direct, audited, uses the requested privacy and respects the maximum duration", async () => {
  const dir = tmp(), v = file(dir, 2 * MB);
  let priv = "";
  const routes = { "/creator_info/query/": () => ok({ creator_username: "u", privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"], max_video_post_duration_sec: 20 }),
    "/v2/post/publish/video/init/": (o: any) => { priv = JSON.parse(o.body).post_info.privacy_level; return ok({ publish_id: "p3", upload_url: "https://up.tiktok/z" }); },
    "up.tiktok/z": () => ({ status: 201 }), "/status/fetch/": () => ok({ status: "PUBLISH_COMPLETE" }) };
  const seg = { "tiktok/client": client, "tiktok/token": freshToken() };
  const a = build({ secrets: seg, routes }); a.ctx.duration = () => 15;
  await pub({ item: { video: v, texts: { text: "x" }, options: { mode: "direct", privacy: "PUBLIC_TO_EVERYONE", audited: true } }, ctx: a.ctx });
  assert.equal(priv, "PUBLIC_TO_EVERYONE");
  const b = build({ secrets: seg, routes }); b.ctx.duration = () => 40;
  await assert.rejects(pub({ item: { video: v, texts: { text: "x" }, options: { mode: "direct", audited: true } }, ctx: b.ctx }), /can only post up to 20 s/);
  rmSync(dir, { recursive: true, force: true });
});
test("an error from an unaudited client becomes a clear message", async () => {
  const dir = tmp(), v = file(dir, 1 * MB);
  const { ctx } = build({ secrets: { "tiktok/client": client, "tiktok/token": freshToken() }, routes: {
    "/creator_info/query/": () => ok({ privacy_level_options: ["SELF_ONLY"] }),
    "/v2/post/publish/video/init/": () => ({ status: 403, body: { error: { code: "unaudited_client_can_only_post_to_private_accounts", message: "x", log_id: "l" } } }) } });
  await assert.rejects(pub({ item: { video: v, texts: { text: "x" }, options: { mode: "direct" } }, ctx }), /has not been audited yet/);
  const c2 = build({ secrets: { "tiktok/client": client, "tiktok/token": freshToken() }, routes: { "/inbox/video/init/": () => ({ status: 403, body: { error: { code: "spam_risk_too_many_pending_share", message: "" } } }) } });
  await assert.rejects(pub({ item: { video: v, texts: { text: "x" }, options: {} }, ctx: c2.ctx }), /5 pending uploads/);
  rmSync(dir, { recursive: true, force: true });
});
test("retry: if the earlier attempt already reached the inbox, it does not create another; a processing failure is explained", async () => {
  const dir = tmp(), v = file(dir, 1 * MB);
  const seg = { "tiktok/client": client, "tiktok/token": freshToken() };
  const a = build({ secrets: seg, routes: { "/status/fetch/": () => ok({ status: "SEND_TO_USER_INBOX" }) } });
  const r = await pub({ item: { video: v, texts: {}, options: {}, prep: { publish_id: "earlier" } }, ctx: a.ctx });
  assert.equal(r.id, "earlier"); assert.equal(r.resumed, true); assert.ok(!a.calls.some((c) => c.url.includes("init")));
  const b = build({ secrets: seg, routes: { "/inbox/video/init/": () => ok({ publish_id: "p9", upload_url: "https://up.tiktok/w" }), "up.tiktok/w": () => ({ status: 201 }), "/status/fetch/": () => ok({ status: "FAILED", fail_reason: "file_format_check_failed" }) } });
  await assert.rejects(pub({ item: { video: v, texts: {}, options: {} }, ctx: b.ctx }), /file_format_check_failed/);
  rmSync(dir, { recursive: true, force: true });
});
test("upload: 5xx retries; 403 says the upload_url expired", async () => {
  const dir = tmp(), v = file(dir, 1 * MB);
  const base = { "tiktok/client": client, "tiktok/token": freshToken() };
  let n = 0;
  const a = build({ secrets: base, routes: { "/inbox/video/init/": () => ok({ publish_id: "p", upload_url: "https://up.tiktok/r" }), "up.tiktok/r": () => ({ status: ++n < 3 ? 503 : 201 }), "/status/fetch/": () => ok({ status: "SEND_TO_USER_INBOX" }) } });
  assert.equal((await pub({ item: { video: v, texts: {}, options: {} }, ctx: a.ctx })).status, "SEND_TO_USER_INBOX"); assert.equal(n, 3);
  const b = build({ secrets: base, routes: { "/inbox/video/init/": () => ok({ publish_id: "p", upload_url: "https://up.tiktok/e" }), "up.tiktok/e": () => ({ status: 403 }) } });
  await assert.rejects(pub({ item: { video: v, texts: {}, options: {} }, ctx: b.ctx }), /expired/);
  rmSync(dir, { recursive: true, force: true });
});
test("plan summarizes mode, privacy and parts; the module honors the registry contract", async () => {
  const dir = tmp(), v = file(dir, 30 * MB);
  const l = await planOf({ item: { video: v, options: { mode: "direct", privacy: "PUBLIC_TO_EVERYONE" }, texts: {} } });
  assert.ok(l.some((x) => x.includes("SELF_ONLY") && x.includes("not audited")));
  assert.ok(l.some((x) => /3 chunk\(s\) of 10\.0 MB/.test(x)));
  assert.ok((await planOf({ item: { video: v, options: {}, texts: {} } }))[0]!.startsWith("mode: draft"));
  assert.equal(tt.name, "tiktok"); assert.equal(tt.network, "tiktok"); assert.equal(tt.immediate, false);
  for (const f of ["connect", "status", "publish", "plan"] as const) assert.equal(typeof tt[f], "function");
  rmSync(dir, { recursive: true, force: true });
});

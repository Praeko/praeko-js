import test from "node:test";
import assert from "node:assert/strict";
import * as ig from "../src/providers/instagram.ts";

const T0 = new Date("2026-11-06T20:00:00Z");
/** Fake ctx: `routes` match method+path and return JSON; every call is recorded in `calls`. */
function create({ token = { token: "TOK", userId: "17841", username: "mychannel", type: "BUSINESS", expiresAt: new Date(+T0 + 40 * 864e5).toISOString() } as any, routes = {} as Record<string, any>, now = T0 } = {}) {
  const secrets = new Map<string, string>(token ? [["instagram/token", JSON.stringify(token)]] : []);
  const calls: { key: string; body: any }[] = [], removed: string[] = [], hosted: string[] = [], logs: string[] = [];
  const ctx: any = {
    brand: {}, now: () => now, pause: async () => {}, log: (m: string) => logs.push(m),
    secrets: { get: (r: string) => secrets.get(r) ?? null, set: (r: string, v: string) => secrets.set(r, v) },
    host: async (file: string, slug: string) => { const key = `${slug}/x/${file.split("/").pop()}`; hosted.push(key); return { url: `https://m.example.com/${key}`, key }; },
    removeHosted: async (c: string) => { removed.push(c); },
    convertCover: (c: string) => c.replace(/\.png$/, ".jpg"),
    probe: () => ({ codec: "h264", width: 1080, height: 1920, fps: 30, duration: 40 }),
    fetchFn: async (url: string, init: any) => {
      const u = new URL(url), key = `${init.method} ${u.pathname.replace(/^\/v[\d.]+\//, "/")}`;
      const body = init.body ? Object.fromEntries(new URLSearchParams(init.body)) : Object.fromEntries(u.searchParams);
      calls.push({ key, body });
      const r = routes[key];
      if (r === undefined) return { ok: false, status: 404, text: async () => JSON.stringify({ error: { message: `unexpected route ${key}` } }) };
      const v: any = typeof r === "function" ? r(body) : r;
      return { ok: !v.error, status: v.error ? 400 : 200, text: async () => JSON.stringify(v) };
    },
  };
  return { ctx, secrets, calls, removed, hosted, logs };
}
const item = (o: Record<string, any> = {}): any => ({ id: "i1", slug: "raid", network: "instagram", when: "2026-11-06T20:30:00.000Z", video: "/p/video.mp4", cover: "/p/cover.png", texts: { text: "Caption #a #b", pinnedComment: "Comment" }, options: {}, ...o });
const happy = (extra: Record<string, any> = {}): Record<string, any> => ({
  "POST /17841/media": { id: "C1" },
  "GET /C1": { status_code: "FINISHED" },
  "GET /17841/content_publishing_limit": { data: [{ quota_usage: 3, config: { quota_total: 100 } }] },
  "POST /17841/media_publish": { id: "M1" },
  "GET /M1": { permalink: "https://www.instagram.com/reel/abc/" },
  ...extra,
});

test("full flow: hosts, creates the REELS container with cover_url, publishes, removes the hosted files", async () => {
  const c = create({ routes: happy() });
  const r = await ig.publish({ item: item(), ctx: c.ctx });
  assert.deepEqual([r.id, r.url], ["M1", "https://www.instagram.com/reel/abc/"]);
  const cont = c.calls.find((x) => x.key === "POST /17841/media")!.body;
  assert.equal(cont.media_type, "REELS"); assert.equal(cont.share_to_feed, "true"); assert.equal(cont.caption, "Caption #a #b");
  assert.ok(cont.video_url.endsWith("/video.mp4")); assert.ok(cont.cover_url.endsWith("/cover.jpg"), "a PNG cover becomes JPEG"); assert.equal(cont.access_token, "TOK");
  assert.equal(c.calls.find((x) => x.key === "POST /17841/media_publish")!.body.creation_id, "C1");
  assert.deepEqual(c.removed.sort(), c.hosted.sort()); assert.equal(c.removed.length, 2);
});
test("polling: IN_PROGRESS until FINISHED", async () => {
  let n = 0;
  const c = create({ routes: happy({ "GET /C1": () => ({ status_code: ++n < 3 ? "IN_PROGRESS" : "FINISHED" }) }) });
  await ig.publish({ item: item(), ctx: c.ctx });
  assert.equal(n, 3);
});
test("container in ERROR: message, hosted files removed, prep dropped (recreated next time)", async () => {
  const c = create({ routes: happy({ "GET /C1": { status_code: "ERROR", status: "bad format" } }) });
  const it = item();
  await assert.rejects(ig.publish({ item: it, ctx: c.ctx }), /ERROR.*bad format/);
  assert.equal(it.prep, null); assert.equal(c.removed.length, 2);
  assert.ok(!c.calls.some((x) => x.key.endsWith("media_publish")));
});
test("still processing after the limit: an error that keeps the prep and the hosted files (reused)", async () => {
  const c = create({ routes: happy({ "GET /C1": { status_code: "IN_PROGRESS" } }) });
  const it = item({ options: { intervalMs: 60e3, maxWaitMs: 180e3 } });
  await assert.rejects(ig.publish({ item: it, ctx: c.ctx }), /still processing/);
  assert.equal(it.prep.containerId, "C1"); assert.equal(c.removed.length, 0);
  // new attempt: does not create another container nor host again
  const before = c.calls.filter((x) => x.key === "POST /17841/media").length, h = c.hosted.length;
  c.ctx.fetchFn = ((orig: any) => async (u: string, i: any) => (u.includes("/C1") ? { ok: true, status: 200, text: async () => JSON.stringify({ status_code: "FINISHED" }) } : orig(u, i)))(c.ctx.fetchFn);
  const r = await ig.publish({ item: it, ctx: c.ctx });
  assert.equal(r.id, "M1"); assert.equal(c.calls.filter((x) => x.key === "POST /17841/media").length, before); assert.equal(c.hosted.length, h);
});
test("prepare alone (15 min before) stores the prep; publish then reuses it", async () => {
  const c = create({ routes: happy() }), it = item();
  const prep = await ig.prepare({ item: it, ctx: c.ctx });
  assert.equal(prep.containerId, "C1"); assert.equal(it.prep, prep);
  await ig.publish({ item: it, ctx: c.ctx });
  assert.equal(c.calls.filter((x) => x.key === "POST /17841/media").length, 1);
});
test("a container older than 23 h is dropped and recreated", async () => {
  let ids = 0;
  const c = create({ routes: happy({ "POST /17841/media": () => ({ id: "C" + ++ids }), "GET /C1": { status_code: "FINISHED" }, "GET /C2": { status_code: "FINISHED" } }) });
  const it = item();
  await ig.prepare({ item: it, ctx: c.ctx });
  c.ctx.now = () => new Date(+T0 + 24 * 3600e3);
  const p2 = await ig.prepare({ item: it, ctx: c.ctx });
  assert.equal(p2.containerId, "C2");
});
test("already published in an earlier attempt: does not publish again", async () => {
  const c = create({ routes: {} });
  const it = item({ prep: { containerId: "C1", published: "M1", result: { id: "M1" } } });
  assert.deepEqual(await ig.publish({ item: it, ctx: c.ctx }), { id: "M1" });
  assert.equal(c.calls.length, 0);
});
test("after publishing, a failure on the link or the comment is not an error", async () => {
  const c = create({ routes: happy({ "GET /M1": { error: { message: "x" } }, "POST /M1/comments": { error: { message: "without scope" } } }) });
  const r = await ig.publish({ item: item({ options: { comment: true } }), ctx: c.ctx });
  assert.equal(r.id, "M1"); assert.equal(r.url, undefined);
  assert.ok(c.logs.some((l) => /comment failed/.test(l)));
});
test("an exhausted quota blocks before publish", async () => {
  const c = create({ routes: happy({ "GET /17841/content_publishing_limit": { data: [{ quota_usage: 100, config: { quota_total: 100 } }] } }) });
  await assert.rejects(ig.publish({ item: item(), ctx: c.ctx }), /quota/);
  assert.ok(!c.calls.some((x) => x.key.endsWith("media_publish")));
});
test("a token close to expiring is renewed and stored; an expired one gives a clear error", async () => {
  const t = { token: "OLD", userId: "17841", username: "u", type: "BUSINESS", expiresAt: new Date(+T0 + 5 * 864e5).toISOString() };
  const c = create({ token: t, routes: { "GET /refresh_access_token": { access_token: "NEW", token_type: "bearer", expires_in: 5184000 } } });
  const r = await ig.validToken(c.ctx);
  assert.equal(r.token, "NEW"); assert.equal(JSON.parse(c.secrets.get("instagram/token")!).token, "NEW");
  assert.equal(c.calls[0]!.body.grant_type, "ig_refresh_token");
  assert.ok(Math.round(ig.daysLeft(JSON.parse(c.secrets.get("instagram/token")!), T0)) === 60);
  const e = create({ token: { ...t, expiresAt: new Date(+T0 - 864e5).toISOString() } });
  await assert.rejects(ig.validToken(e.ctx), /expired/);
  await assert.rejects(ig.validToken(create({ token: null }).ctx), /not connected/);
});
test("a failed renewal keeps the current token (still valid)", async () => {
  const t = { token: "OLD", userId: "1", username: "u", expiresAt: new Date(+T0 + 5 * 864e5).toISOString() };
  const c = create({ token: t, routes: { "GET /refresh_access_token": { error: { message: "token too fresh" } } } });
  assert.equal((await ig.validToken(c.ctx)).token, "OLD");
});
test("connect validates /me, stores the token and exchanges it for a long-lived one with --app-secret", async () => {
  const c = create({ token: null, routes: { "GET /me": { user_id: "17841", username: "mychannel", account_type: "BUSINESS" }, "GET /access_token": { access_token: "LONG", expires_in: 5184000 } } });
  assert.equal(await ig.connect({ ctx: c.ctx, args: ["--token", "SHORT", "--app-secret", "SECRET"] }), 0);
  const s = JSON.parse(c.secrets.get("instagram/token")!);
  assert.deepEqual([s.token, s.userId, s.username, s.type], ["LONG", "17841", "mychannel", "BUSINESS"]);
  assert.equal(c.calls[1]!.body.grant_type, "ig_exchange_token");
  const st = await ig.status({ ctx: c.ctx });
  assert.ok(st.connected && st.detail.includes("@mychannel") && /valid for (59|60) more days/.test(st.detail));
  const c2 = create({ token: null, routes: { "GET /me": { error: { message: "Invalid OAuth access token" } } } });
  await assert.rejects(ig.connect({ ctx: c2.ctx, args: ["--token", "BAD"] }), /Invalid OAuth/);
});
test("status without a token, and a non-professional account warns", async () => {
  assert.equal((await ig.status({ ctx: create({ token: null }).ctx })).connected, false);
  const c = create({ token: null, routes: { "GET /me": { user_id: "1", username: "personal", account_type: "PERSONAL" } } });
  await ig.connect({ ctx: c.ctx, args: ["--token", "T"] });
  assert.ok(c.logs.some((l) => /professional/.test(l)));
});
test("a caption that is too long is refused before hosting; plan lists video warnings", async () => {
  const c = create({ routes: happy() });
  await assert.rejects(ig.prepare({ item: item({ texts: { text: "x".repeat(2300) } }), ctx: c.ctx }), /2200/);
  assert.equal(c.hosted.length, 0);
  c.ctx.probe = () => ({ codec: "vp9", width: 1920, height: 1080, fps: 120, duration: 2 });
  const l = await ig.plan({ item: item({ video: "/does/not/exist.mp4" }), ctx: c.ctx });
  assert.ok(l.some((x) => /outside 3 s/.test(x)) && l.some((x) => /fps/.test(x)) && l.some((x) => /codec/.test(x)));
});
test("without a cover it uses thumb_offset when configured", async () => {
  const c = create({ routes: happy() });
  await ig.prepare({ item: item({ cover: null, options: { thumbnailMs: 1500 } }), ctx: c.ctx });
  const cont = c.calls.find((x) => x.key === "POST /17841/media")!.body;
  assert.equal(cont.thumb_offset, "1500"); assert.equal(cont.cover_url, undefined);
});

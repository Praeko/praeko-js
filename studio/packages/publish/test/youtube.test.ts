import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import * as yt from "../src/providers/youtube.ts";

const NOW = Date.parse("2026-11-04T20:00:00Z");
const resp = (status: number, body: unknown, headers: Record<string, string> = {}): any => ({ ok: status >= 200 && status < 300, status, headers: { get: (k: string) => headers[k.toLowerCase()] ?? null }, json: async () => (typeof body === "string" ? JSON.parse(body) : body), text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
const secrets = (start: Record<string, string> = {}) => { const m: Record<string, string> = { ...start }; return { m, get: (r: string) => m[r] ?? null, set: (r: string, v: string) => { m[r] = v; } }; };
const CLIENT = JSON.stringify({ client_id: "id", client_secret: "sec" });
const freshToken = (extra: Record<string, unknown> = {}) => JSON.stringify({ access_token: "AT", refresh_token: "RT", expiry: NOW + 3600e3, ...extra });
const fakeFile = (size: number) => () => ({ size, read: (i: number, n: number) => Buffer.alloc(Math.min(n, size - i), 1), close() {} });
const mkctx = (fetchFn: any, seg: any = secrets({ "youtube/client": CLIENT, "youtube/token": freshToken() }), extra: Record<string, unknown> = {}): any => ({ fetchFn, secrets: seg, log: () => {}, deps: { now: () => NOW, sleep: async () => {}, openFile: fakeFile(1000), ...extra } });
const item = (o: Record<string, any> = {}): any => ({ slug: "s", network: "youtube", when: "2026-11-06T20:30:00.000Z", video: "/x/v.mp4", cover: null, texts: { title: "Title", text: "Description" }, options: {}, ...o });

test("mode → privacyStatus e publishAt", () => {
  assert.equal(yt.buildMetadata(item(), NOW).status.privacyStatus, "private");
  assert.equal(yt.buildMetadata(item(), NOW).status.publishAt, undefined);
  const scheduled = yt.buildMetadata(item({ options: { mode: "scheduled" } }), NOW).status;
  assert.equal(scheduled.privacyStatus, "private"); assert.equal(scheduled.publishAt, "2026-11-06T20:30:00.000Z");
  assert.equal(yt.buildMetadata(item({ options: { mode: "public" } }), NOW).status.privacyStatus, "public");
  assert.throws(() => yt.buildMetadata(item({ options: { mode: "scheduled" }, when: "2026-11-01T00:00:00Z" }), NOW), /in the past/);
  assert.throws(() => yt.buildMetadata(item({ options: { mode: "x" } }), NOW), /invalid/);
});
test("metadata: title cut at 100, category 28, language from the options (default en), not made for kids", () => {
  const m = yt.buildMetadata(item({ texts: { title: "a".repeat(150), text: "d" } }), NOW);
  assert.ok(m.snippet.title.length <= 100); assert.equal(m.snippet.categoryId, "28"); assert.equal(m.snippet.defaultLanguage, "en"); assert.equal(yt.buildMetadata(item({ options: { language: "pt" } }), NOW).snippet.defaultLanguage, "pt");
  assert.equal(m.status.selfDeclaredMadeForKids, false);
});
test("PKCE: the S256 challenge from the RFC 7636 example and the authorization URL", () => {
  assert.equal(yt.pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  const u = new URL(yt.authorizationUrl({ clientId: "c", redirect: "http://127.0.0.1:1", challenge: "d", state: "s" }));
  assert.equal(u.searchParams.get("code_challenge_method"), "S256"); assert.equal(u.searchParams.get("access_type"), "offline");
  assert.ok(u.searchParams.get("scope")!.includes("youtube.upload"));
});
test("token: uses the valid one without network; renews the expired one and stores it", async () => {
  let calls = 0;
  const seg = secrets({ "youtube/client": CLIENT, "youtube/token": freshToken({ expiry: NOW + 3600e3 }) });
  assert.equal(await yt.validToken(mkctx(async () => { calls++; }, seg)), "AT"); assert.equal(calls, 0);
  const seg2 = secrets({ "youtube/client": CLIENT, "youtube/token": freshToken({ expiry: NOW - 1 }) });
  let body = "";
  const f = async (_url: string, o: any) => { body = o.body; return resp(200, { access_token: "NEW", expires_in: 3600 }); };
  assert.equal(await yt.validToken(mkctx(f, seg2)), "NEW");
  assert.ok(body.includes("grant_type=refresh_token") && body.includes("refresh_token=RT"));
  assert.equal(JSON.parse(seg2.m["youtube/token"]!).access_token, "NEW"); assert.equal(JSON.parse(seg2.m["youtube/token"]!).refresh_token, "RT");
});
test("token: invalid_grant explains Testing mode", async () => {
  const seg = secrets({ "youtube/client": CLIENT, "youtube/token": freshToken({ expiry: NOW - 1 }) });
  await assert.rejects(yt.validToken(mkctx(async () => resp(400, { error: "invalid_grant" }), seg)), /7 days/);
});
test("resumable: session → chunked PUT (308 → 201) and the right headers", async () => {
  const calls: any[] = [];
  const f = async (url: string, o: any = {}) => {
    calls.push({ url: String(url), m: o.method, h: o.headers || {}, n: o.body?.length });
    if (String(url).includes("uploadType=resumable")) return resp(200, {}, { location: "https://up/session" });
    if (String(url) === "https://up/session") {
      const cr = o.headers["content-range"];
      return cr.endsWith("/20000000") && cr.startsWith("bytes 0-") ? resp(308, {}, { range: "bytes=0-8388607" }) : cr.startsWith("bytes 8388608-") ? resp(308, {}, { range: "bytes=0-16777215" }) : resp(201, { id: "VID1" });
    }
    throw new Error("unexpected url " + url);
  };
  const ctx = mkctx(f, undefined, { openFile: fakeFile(20000000) });
  const v = await yt.uploadVideo({ ctx, file: "/x/v.mp4", metadata: yt.buildMetadata(item(), NOW) });
  assert.equal(v.id, "VID1");
  const start = calls[0]; assert.equal(start.h["x-upload-content-length"], "20000000"); assert.ok(start.url.includes("part=snippet%2Cstatus") || start.url.includes("part=snippet,status")); assert.equal(start.h.authorization, "Bearer AT");
  assert.deepEqual(calls.slice(1).map((c) => c.h["content-range"]), ["bytes 0-8388607/20000000", "bytes 8388608-16777215/20000000", "bytes 16777216-19999999/20000000"]);
});
test("resumable: a 503 resumes by asking bytes */total", async () => {
  let puts = 0; const cr: string[] = [];
  const f = async (url: string, o: any = {}) => {
    if (String(url).includes("uploadType=resumable")) return resp(200, {}, { location: "https://up/s" });
    cr.push(o.headers["content-range"]); puts++;
    if (puts === 1) return resp(503, "unavailable");
    if (o.headers["content-range"].startsWith("bytes */")) return resp(308, {}, {});
    return resp(201, { id: "V2" });
  };
  const v = await yt.uploadVideo({ ctx: mkctx(f), file: "/x/v.mp4", metadata: {} });
  assert.equal(v.id, "V2"); assert.ok(cr.some((c) => c.startsWith("bytes */")));
});
test("an exhausted quota becomes a clear message", async () => {
  const f = async () => resp(403, { error: { message: "quota", errors: [{ reason: "quotaExceeded" }] } });
  await assert.rejects(yt.uploadVideo({ ctx: mkctx(f), file: "/x/v.mp4", metadata: {} }), /YouTube API quota exhausted/);
  assert.match(yt.errorMessage(403, JSON.stringify({ error: { errors: [{ reason: "uploadLimitExceeded" }] } })), /daily upload limit/);
});
function fullFlow({ thumbnailFailed = false } = {}) {
  const log: string[] = [];
  const f = async (url: string, o: any = {}) => {
    const u = String(url); log.push(u);
    if (u.includes("uploadType=resumable")) return resp(200, {}, { location: "https://up/s" });
    if (u === "https://up/s") return resp(201, { id: "VID9" });
    if (u.includes("part=processingDetails")) return resp(200, { items: [{ processingDetails: { processingStatus: "succeeded" } }] });
    if (u.includes("thumbnails/set")) return thumbnailFailed ? resp(403, { error: { message: "no", errors: [{ reason: "forbidden" }] } }) : resp(200, { items: [{}] });
    throw new Error("unexpected url " + u);
  };
  return { f, log };
}
test("publish: uploads private, sets the thumbnail and returns links", async () => {
  const { f, log } = fullFlow();
  const r = await yt.publish({ item: item({ cover: "/x/cover.png" }), ctx: mkctx(f, undefined, { openFile: (a: string) => fakeFile(a.endsWith("png") ? 500 : 1000)() }) });
  assert.equal(r.id, "VID9"); assert.equal(r.url, "https://youtu.be/VID9"); assert.equal(r.privacy, "private"); assert.equal(r.thumbnail, true);
  assert.ok(log.some((u) => u.includes("thumbnails/set?videoId=VID9")));
});
test("publish: a failing thumbnail does not bring it down (warning)", async () => {
  const { f } = fullFlow({ thumbnailFailed: true });
  const r = await yt.publish({ item: item({ cover: "/x/cover.png" }), ctx: mkctx(f, undefined, { openFile: (a: string) => fakeFile(a.endsWith("png") ? 500 : 1000)() }) });
  assert.equal(r.id, "VID9"); assert.equal(r.thumbnail, false); assert.ok(r.warnings.some((x) => /thumbnail not set/.test(x)));
});
test("publish without a cover does not call thumbnails; status reads the channel", async () => {
  const { f, log } = fullFlow();
  await yt.publish({ item: item(), ctx: mkctx(f) });
  assert.ok(!log.some((u) => u.includes("thumbnails")));
  const s = await yt.status({ ctx: mkctx(async () => resp(200, { items: [{ snippet: { title: "Dev Channel" } }] })) });
  assert.deepEqual(s, { connected: true, detail: "Dev Channel" });
  assert.equal((await yt.status({ ctx: mkctx(async () => {}, secrets()) })).connected, false);
});
test("connect: loopback + PKCE exchanges the code and stores the tokens (server and browser simulated)", async () => {
  const seg = secrets(); let openedUrl = "", handler: any, port = 4321;
  const srv = Object.assign(new EventEmitter(), { listen: (_p: number, _h: string, cb: () => void) => cb(), address: () => ({ port }), close() {} });
  const calls: any[] = [];
  const f = async (url: string, o: any = {}) => {
    calls.push(String(url));
    if (String(url).includes("oauth2.googleapis.com/token")) { assert.ok(o.body.includes("code_verifier=") && o.body.includes("code=COD")); return resp(200, { access_token: "A", refresh_token: "R", expires_in: 3600, scope: yt.SCOPES.join(" ") }); }
    if (String(url).includes("channels")) return resp(200, { items: [{ snippet: { title: "My Channel" } }] });
    throw new Error("url " + url);
  };
  const ctx = mkctx(f, seg, {
    createServer: (h: any) => { handler = h; return srv; },
    openBrowser: (u: string) => { openedUrl = u; const state = new URL(u).searchParams.get("state"); setImmediate(() => handler({ url: `/?code=COD&state=${state}` }, { writeHead() { return this; }, end() {} })); },
  });
  const exit = await yt.connect({ ctx, args: ["--client-id", "ID", "--client-secret", "SECRET"] });
  assert.equal(exit, 0);
  assert.ok(openedUrl.includes("code_challenge_method=S256") && openedUrl.includes("127.0.0.1%3A4321"));
  assert.equal(JSON.parse(seg.m["youtube/token"]!).refresh_token, "R"); assert.equal(JSON.parse(seg.m["youtube/client"]!).client_id, "ID");
});
test("connect without credentials gives instructions", async () => {
  await assert.rejects(yt.connect({ ctx: mkctx(async () => {}, secrets()), args: [] }), /client-id/);
});
test("plan shows mode and cover", async () => {
  const l = await yt.plan({ item: item({ cover: "/x/c.png" }), ctx: mkctx(async () => {}) });
  assert.ok(l.join("\n").includes("privacy private") && l.join("\n").includes("c.png"));
});

test("publication with ai.synthetic: containsSyntheticMedia goes in the status (and only then)", () => {
  const base: any = { slug: "x", title: "T", texts: { title: "T", text: "d" }, when: "2026-12-01T10:00:00Z" };
  assert.equal("containsSyntheticMedia" in yt.buildMetadata({ ...base, options: {} }).status, false);
  assert.equal(yt.buildMetadata({ ...base, options: { syntheticContent: true } }).status.containsSyntheticMedia, true);
});

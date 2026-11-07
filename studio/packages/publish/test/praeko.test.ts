import test from "node:test";
import assert from "node:assert/strict";
import { praeko } from "../src/index.ts";
import type { Brand, Publication } from "../src/index.ts";

const { client, buildPost, isoWithOffset, praekoConfig, normalizeUrl, errorMessageFor, PraekoError, KEY_REF } = praeko;
const brand: Brand = { links: { main: "https://example.com/" }, publishing: { praeko: {} } };
const publication: Publication = { title: "Title", campaign: "camp", format: "short", yt: { description: "Desc", pinnedComment: "Pinned" }, ig: { caption: "IG caption" }, hashtags: { youtube: ["#a"], instagram: ["#b"], tiktok: ["#c"] } };
const Q = { youtube: "2026-11-06T20:30:00.000Z", instagram: "2026-11-06T21:00:00.000Z", tiktok: "2026-11-06T21:30:00.000Z" };
const noWait = async () => {}; // no waiting between retries

/** Fake fetch: `routes` is a function (method, path, init, n) → { status, body }; records the calls. */
function fake(routes: (method: string, path: string, init: any, n: number) => any) {
  const calls: any[] = [];
  const fetchFn = (async (url: string, init: any) => {
    const u = new URL(url), c = { method: init.method, path: u.pathname + u.search, url, headers: init.headers, body: init.body };
    calls.push(c);
    const r = await routes(c.method, c.path, init, calls.length);
    const status = r.status ?? 200, text = typeof r.body === "string" ? r.body : JSON.stringify(r.body ?? {});
    return { ok: status < 400, status, text: async () => text };
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}
const json = (c: any) => JSON.parse(c.body);

test("key and url: the keychain ref, https required, default https://praeko.app", () => {
  assert.equal(KEY_REF, "praeko/main");
  assert.equal(normalizeUrl(), "https://praeko.app");
  assert.equal(normalizeUrl("https://praeko.app///"), "https://praeko.app");
  assert.equal(normalizeUrl("http://localhost:8787"), "http://localhost:8787");
  assert.throws(() => normalizeUrl("http://praeko.app"), /https/);
});
test("without a key: a useful error and no network call", async () => {
  const { fetchFn, calls } = fake(() => ({}));
  await assert.rejects(client({ fetchFn }).channels(), /no Praeko key.*--via praeko --key.*PRAEKO_STUDIO_KEY_PRAEKO_MAIN/);
  assert.equal(calls.length, 0);
});
test("channels: GET /v1/channels with Bearer and X-Arauto-Contract: en", async () => {
  const { fetchFn, calls } = fake(() => ({ body: { channels: [{ network: "youtube", id: "c1", connected: true }] } }));
  const cs = await client({ key: "arauto_K", fetchFn }).channels();
  assert.equal(cs[0]!.id, "c1");
  assert.equal(calls[0]!.method, "GET"); assert.equal(calls[0]!.url, "https://praeko.app/v1/channels");
  assert.equal(calls[0]!.headers.authorization, "Bearer arauto_K"); assert.equal(calls[0]!.headers["x-arauto-contract"], "en");
});
test("the service url comes from publishing.praeko.url", async () => {
  assert.equal(praekoConfig({ publishing: { praeko: { url: "https://my.praeko.dev/" } } }).url, "https://my.praeko.dev/");
  const { fetchFn, calls } = fake(() => ({ body: { channels: [] } }));
  await client({ url: "https://my.praeko.dev/", key: "arauto_K", fetchFn }).channels();
  assert.equal(calls[0]!.url, "https://my.praeko.dev/v1/channels");
});

test("small media: POST /v1/media with simple:true and PUT .../content with the bytes", async () => {
  const bytes = Buffer.from("0123456789");
  const { fetchFn, calls } = fake((m) => m === "POST" ? { body: { id: "m1", state: "uploading" } } : { body: { id: "m1", state: "ready" } });
  const m = await client({ key: "arauto_K", fetchFn }).uploadMedia({ size: 10, name: "f", mime: "x", close() {}, read: async (i: number, n: number) => bytes.subarray(i, i + n) }, { type: "video", name: "v.mp4", mime: "video/mp4" });
  assert.equal(m.id, "m1"); assert.equal(m.state, "ready");
  assert.equal(calls.length, 2);
  assert.deepEqual(json(calls[0]), { type: "video", name: "v.mp4", mime: "video/mp4", size: 10, simple: true });
  assert.equal(calls[1]!.method, "PUT"); assert.equal(calls[1]!.path, "/v1/media/m1/content");
  assert.equal(calls[1]!.headers["content-type"], "application/octet-stream"); assert.equal(Buffer.from(calls[1]!.body).toString(), "0123456789");
});
test("large media: equal parts (the last one smaller), then complete, type cover", async () => {
  const bytes = Buffer.alloc(10, 1);
  const { fetchFn, calls } = fake((_m, c) => c === "/v1/media" ? { body: { id: "m2", minPartSize: 4, maxPartSize: 8 } } : c.endsWith("/complete") ? { body: { id: "m2", state: "ready" } } : { body: {} });
  const progress: number[][] = [];
  const m = await client({ key: "arauto_K", fetchFn, simpleMax: 5, part: 4 }).uploadMedia({ size: 10, name: "f", mime: "x", close() {}, read: async (i: number, n: number) => bytes.subarray(i, i + n) }, { type: "cover", name: "c.png", mime: "image/png", onProgress: (x: number, t: number) => progress.push([x, t]) });
  assert.equal(m.state, "ready");
  assert.deepEqual(json(calls[0]), { type: "cover", name: "c.png", mime: "image/png", size: 10 }); // no simple flag
  assert.deepEqual(calls.slice(1, 4).map((c) => [c.method, c.path, c.body.length]), [["PUT", "/v1/media/m2/parts/1", 4], ["PUT", "/v1/media/m2/parts/2", 4], ["PUT", "/v1/media/m2/parts/3", 2]]);
  assert.deepEqual([calls[4]!.method, calls[4]!.path], ["POST", "/v1/media/m2/complete"]);
  assert.deepEqual(progress.at(-1), [10, 10]);
});

test("buildPost: items per network, ISO with the Brazil offset, default modes (YouTube scheduled, Instagram via buffer, TikTok draft)", () => {
  const b = buildPost({ brand, publication, id: "ep-1", media: { video: "mv", cover: "mc" }, networks: ["youtube", "instagram", "tiktok"], when: Q });
  assert.equal(b.id, "ep-1"); assert.equal(b.title, "Title");
  assert.deepEqual(b.media, { video: "mv", cover: "mc" });
  assert.deepEqual(b.items, [
    { network: "youtube", scheduledFor: "2026-11-06T17:30:00-03:00", mode: "scheduled" },
    { network: "instagram", scheduledFor: "2026-11-06T18:00:00-03:00", via: "buffer" },
    { network: "tiktok", scheduledFor: "2026-11-06T18:30:00-03:00", mode: "draft" },
  ]);
  assert.deepEqual(b.options, { format: "short" });
  assert.equal(b.texts.youtube.title, "Title"); assert.equal(b.texts.youtube.pinnedComment, "Pinned");
  assert.ok(b.texts.youtube.text.includes("utm_source=youtube") && b.texts.youtube.text.includes("#a"));
  assert.ok(b.texts.instagram.text.endsWith("#b")); assert.equal(b.texts.instagram.title, undefined);
  assert.ok(b.texts.tiktok.text.length > 0);
});
test("buildPost: brand.json options (Instagram via meta, TikTok direct, channels), long, media only for Instagram", () => {
  const m = { ...brand, publishing: { praeko: { instagram: { via: "meta" }, tiktok: { mode: "direct", frameMs: 1500 }, channels: { tiktok: "tk2" } } } };
  const b = buildPost({ brand: m, publication: { ...publication, format: "long" }, id: "x", media: { video: "mv" }, networkMedia: { instagram: { video: "mi" } }, networks: ["instagram", "tiktok"], when: Q, offset: "-03:00" });
  assert.deepEqual(b.items[0], { network: "instagram", scheduledFor: "2026-11-06T18:00:00-03:00", via: "meta", media: { video: "mi" } });
  assert.deepEqual(b.items[1], { network: "tiktok", scheduledFor: "2026-11-06T18:30:00-03:00", channel: "tk2", mode: "direct" });
  assert.deepEqual(b.options, { format: "long", tiktok: { privacy: "SELF_ONLY", coverFrameMs: 1500 } });
  assert.deepEqual(b.media, { video: "mv" }); // no cover
});
test("buildPost: unknown network, missing time and invalid options give errors", () => {
  assert.throws(() => buildPost({ brand, publication, id: "x", media: { video: "v" }, networks: ["orkut"], when: {} }), /unknown network/);
  assert.throws(() => buildPost({ brand, publication, id: "x", media: { video: "v" }, networks: ["youtube"], when: {} }), /no time set/);
  assert.throws(() => praekoConfig({ publishing: { praeko: { instagram: { via: "x" } } } }), /instagram\.via/);
  assert.throws(() => praekoConfig({ publishing: { praeko: { tiktok: { mode: "x" } } } }), /tiktok\.mode/);
});
test("isoWithOffset", () => {
  assert.equal(isoWithOffset("2026-11-06T20:30:00.000Z"), "2026-11-06T17:30:00-03:00");
  assert.equal(isoWithOffset("2026-11-06T02:00:00.000Z", "-03:00"), "2026-11-05T23:00:00-03:00");
  assert.equal(isoWithOffset("2026-11-06T20:30:00.000Z", "+01:00"), "2026-11-06T21:30:00+01:00");
  assert.throws(() => isoWithOffset("2026-11-06T20:30:00Z", "BRT"), /invalid offset/);
});

test("createPost: POST /v1/posts with the body and no retry on a server error", async () => {
  const { fetchFn, calls } = fake(() => ({ status: 500, body: { error: { code: "internal_error", message: "boom" } } }));
  await assert.rejects(client({ key: "arauto_K", fetchFn, wait: noWait }).createPost({ id: "x" }), /internal Praeko error/);
  assert.equal(calls.length, 1); // creating twice would duplicate
  assert.equal(calls[0]!.method, "POST"); assert.equal(calls[0]!.path, "/v1/posts");
});
test("server errors become clear messages: refused key, scope, existing id, invalid field; the key never shows up", async () => {
  const e = (status: number, code: string, message: string) => fake(() => ({ status, body: { error: { code, message } } }));
  let s = e(401, "invalid_api_key", "invalid key");
  await assert.rejects(client({ key: "arauto_SECRET", fetchFn: s.fetchFn }).createPost({}), (x: any) => { assert.ok(x instanceof PraekoError); assert.equal(x.status, 401); assert.equal(x.code, "invalid_api_key"); assert.match(x.message, /refused the key.*--via praeko --key/); assert.ok(!x.message.includes("arauto_SECRET")); return true; });
  s = e(403, "forbidden", "insufficient scope");
  await assert.rejects(client({ key: "arauto_K", fetchFn: s.fetchFn }).createPost({}), /write scope/);
  s = e(409, "id_exists", "a post with id x already exists");
  await assert.rejects(client({ key: "arauto_K", fetchFn: s.fetchFn }).createPost({}), (x: any) => x.code === "id_exists" && /already exists on Praeko/.test(x.message));
  s = e(422, "invalid_field", "instagram: caption too long");
  await assert.rejects(client({ key: "arauto_K", fetchFn: s.fetchFn }).createPost({}), /HTTP 422, invalid_field.*caption too long/);
  s = e(400, "message_with_key", "see arauto_SECRET here");
  await assert.rejects(client({ key: "arauto_SECRET", fetchFn: s.fetchFn }).createPost({}), (x: any) => !x.message.includes("arauto_SECRET") && /see … here/.test(x.message));
});
test("an answer that is not JSON and an unknown error code: useful messages", async () => {
  await assert.rejects(client({ key: "arauto_K", fetchFn: fake(() => ({ status: 502, body: "<html>Bad gateway</html>" })).fetchFn }).createPost({}), /Praeko answered HTTP 502/);
  await assert.rejects(client({ key: "arauto_K", fetchFn: fake(() => ({ status: 404, body: { error: { code: "no_such_post", message: "x" } } })).fetchFn }).status("a"), /HTTP 404/);
  assert.match(errorMessageFor(404, "post_not_found", "post a does not exist"), /does not know that post/);
});
test("GET retries on network failure and 429; part PUTs too; then it works", async () => {
  let n = 0;
  const f1 = (async () => { if (++n < 3) throw new Error("ECONNRESET"); return { ok: true, status: 200, text: async () => JSON.stringify({ channels: [{ network: "tiktok" }] }) }; }) as unknown as typeof fetch;
  assert.equal((await client({ key: "arauto_K", fetchFn: f1, wait: noWait }).channels()).length, 1); assert.equal(n, 3);
  const g = fake((_m, _c, _i, k) => k < 2 ? { status: 429, body: { error: { code: "rate_limited", message: "slow down" } } } : { body: { id: "p", items: [] } });
  assert.equal((await client({ key: "arauto_K", fetchFn: g.fetchFn, wait: noWait }).status("p")).id, "p"); assert.equal(g.calls.length, 2);
  const f2 = (async () => { throw new Error("no network"); }) as unknown as typeof fetch;
  await assert.rejects(client({ key: "arauto_K", fetchFn: f2, wait: noWait }).channels(), /no connection to Praeko \(no network\)/);
});
test("status and cancel: GET and DELETE /v1/posts/:id (escaped id)", async () => {
  const { fetchFn, calls } = fake((m: string) => ({ body: m === "GET" ? { id: "ep 1", items: [{ network: "youtube", state: "scheduled" }] } : { id: "ep 1", canceled: ["i1"], kept: [{ network: "tiktok", state: "sent" }] } }));
  const c = client({ key: "arauto_K", fetchFn });
  assert.equal((await c.status("ep 1")).items[0].state, "scheduled");
  const r = await c.cancel("ep 1");
  assert.deepEqual(r.canceled, ["i1"]); assert.equal(r.kept[0].state, "sent");
  assert.deepEqual(calls.map((x) => [x.method, x.path]), [["GET", "/v1/posts/ep%201"], ["DELETE", "/v1/posts/ep%201"]]);
});

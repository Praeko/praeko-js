import test from "node:test";
import assert from "node:assert/strict";
import { buildPosts, createPost, deletePost, gql, listChannels, parseWhen, pickChannels, textsByNetwork } from "../src/index.ts";
import type { Brand, Publication } from "../src/index.ts";
import { hostingConfig, objectKey, upload } from "../src/hosting.ts";
import { argsFfmpeg, sameAspect } from "../src/cover-frame.ts";

const brand: Brand = { links: { main: "https://example.com/" }, publishing: { buffer: { youtube: { categoryId: 28 } } } };
const publication: Publication = { title: "Title", campaign: "camp", format: "short", yt: { description: "Desc" }, ig: { caption: "IG caption", pinnedComment: "Comment" }, hashtags: { youtube: ["#a"], instagram: ["#b"] } };

test("parseWhen: dd/mm hh:mm at the Brazil offset becomes UTC", () => {
  assert.equal(parseWhen("06/11 17:30", { now: new Date("2026-11-04T12:00:00Z") }), "2026-11-06T20:30:00.000Z");
  assert.equal(parseWhen("2026-11-06T17:30"), "2026-11-06T20:30:00.000Z");
  assert.equal(parseWhen("2026-11-06T17:30:00Z"), "2026-11-06T17:30:00.000Z");
});
test("parseWhen: without a year and already past goes to next year; garbage is an error", () => {
  assert.equal(parseWhen("02/01 10:00", { now: new Date("2026-11-04T12:00:00Z") }).slice(0, 4), "2027");
  assert.throws(() => parseWhen("tomorrow"), /invalid date/);
});
test("buildPosts: one post per network, types and metadata", () => {
  const q = "2026-11-06T20:30:00.000Z";
  const ps = buildPosts({ brand, publication, channels: { youtube: "c1", instagram: "c2", tiktok: "c3" }, videoUrl: "https://x/v.mp4", when: { all: q }, networks: ["youtube", "instagram", "tiktok"] });
  assert.equal(ps.length, 3);
  const [yt, ig, tt] = ps.map((p) => p.input) as [any, any, any];
  assert.equal(yt.mode, "customScheduled"); assert.equal(yt.schedulingType, "automatic"); assert.equal(yt.dueAt, q);
  assert.equal(yt.metadata.youtube.title, "Title"); assert.equal(yt.metadata.youtube.categoryId, "28"); assert.equal(yt.metadata.youtube.madeForKids, false);
  assert.equal(ig.metadata.instagram.type, "reel"); assert.equal(ig.metadata.instagram.firstComment, undefined);
  assert.ok(tt.assets[0].video.metadata.thumbnailOffset >= 0);
  assert.ok(yt.text.includes("utm_source=youtube") && yt.text.includes("#a"));
  assert.ok(ig.text.endsWith("#b"));
});
test("buildPosts: reminder uses notification and a missing time is an error", () => {
  const p = buildPosts({ brand, publication, channels: { youtube: "c" }, videoUrl: "https://x/v.mp4", when: { youtube: "2026-11-06T20:30:00.000Z" }, networks: ["youtube"], reminder: true });
  assert.equal(p[0]!.input.schedulingType, "notification");
  assert.throws(() => buildPosts({ brand, publication, channels: { youtube: "c" }, videoUrl: "u", when: {}, networks: ["youtube"] }), /no time set/);
});
test("textsByNetwork of a long video includes the chapters", () => {
  const t = textsByNetwork({ brand, publication: { ...publication, format: "long", chapters: [{ t: 0, title: "A" }, { t: 20, title: "B" }, { t: 40, title: "C" }] } });
  assert.ok(t.youtube.text.includes("0:00 A") && t.youtube.text.includes("0:40 C"));
});
const reply = (body: unknown, ok = true) => (async () => ({ ok, status: ok ? 200 : 401, text: async () => JSON.stringify(body) })) as unknown as typeof fetch;
test("gql: sends the Bearer key and handles errors", async () => {
  let seen: any;
  const f = (async (url: string, o: any) => { seen = { url, o }; return { ok: true, status: 200, text: async () => JSON.stringify({ data: { ok: 1 } }) }; }) as unknown as typeof fetch;
  assert.deepEqual(await gql("query{x}", {}, { key: "K", fetchFn: f }), { ok: 1 });
  assert.equal(seen.url, "https://api.buffer.com"); assert.equal(seen.o.headers.authorization, "Bearer K");
  await assert.rejects(gql("q", {}, { key: "K", fetchFn: reply({ errors: [{ message: "bad" }] }, false) }), /bad/);
  await assert.rejects(gql("q", {}, { fetchFn: reply({}) }), /no Buffer key/);
});
test("listChannels + pickChannels", async () => {
  const f = (async (_u: string, o: any) => { const q = JSON.parse(o.body).query; const data = q.includes("organizations") ? { account: { organizations: [{ id: "o1", name: "Org" }] } } : { channels: [{ id: "a", displayName: "YT", service: "youtube" }, { id: "b", name: "ig", service: "instagram" }, { id: "c", name: "ig2", service: "instagram" }] }; return { ok: true, status: 200, text: async () => JSON.stringify({ data }) }; }) as unknown as typeof fetch;
  const cs = await listChannels({ key: "K", fetchFn: f });
  assert.equal(cs.length, 3);
  const r = pickChannels({ brand, channels: cs, networks: ["youtube", "instagram", "tiktok"] });
  assert.equal(r.channels.youtube, "a"); assert.equal(r.missing.length, 2);
  assert.equal(pickChannels({ brand: { publishing: { buffer: { channels: { instagram: "c" } } } }, channels: cs, networks: ["instagram"] }).channels.instagram, "c");
});
test("createPost and deletePost handle MutationError", async () => {
  assert.equal((await createPost({}, { key: "K", fetchFn: reply({ data: { createPost: { post: { id: "p1", dueAt: "x" } } } }) })).id, "p1");
  await assert.rejects(createPost({}, { key: "K", fetchFn: reply({ data: { createPost: { message: "Invalid URL" } } }) }), /Invalid URL/);
  assert.equal(await deletePost("p1", { key: "K", fetchFn: reply({ data: { deletePost: { __typename: "DeletePostSuccess" } } }) }), true);
});
test("hosting: random key, config and upload with an injected wrangler", () => {
  assert.equal(objectKey("s", "/x/v.mp4", "abc"), "s/abc/v.mp4");
  assert.throws(() => hostingConfig({}), /no hosting/);
  assert.throws(() => hostingConfig({ publishing: { hosting: { type: "r2", bucket: "b", baseUrl: "http://x" } } }), /https/);
  let args: string[] = [];
  const s = upload({ h: { bucket: "b", baseUrl: "https://m.example.com/" }, slug: "s", file: "/x/v.mp4", cwd: ".", exec: (_c, a) => { args = a; return { status: 0 }; } });
  assert.ok(s.url.startsWith("https://m.example.com/s/") && s.url.endsWith("/v.mp4"));
  assert.ok(args.includes("--remote") && args.includes("video/mp4"));
  assert.throws(() => upload({ h: { bucket: "b", baseUrl: "https://m" }, slug: "s", file: "v.mp4", cwd: ".", exec: () => ({ status: 1 }) }), /wrangler/);
});
test("cover on the frames: filter only on the first frames, audio copied, aspect ratio checked", () => {
  const a = argsFfmpeg({ video: "v.mp4", cover: "c.png", output: "o.mp4", width: 1080, height: 1920, frames: 2 });
  const f = a[a.indexOf("-filter_complex") + 1]!;
  assert.ok(f.includes("lt(n,2)") && f.includes("scale=1080:1920"));
  assert.ok(a.includes("copy") && a.includes("0:a?"));
  assert.ok(sameAspect({ width: 1080, height: 1920 }, { width: 540, height: 960 }));
  assert.ok(!sameAspect({ width: 1280, height: 720 }, { width: 1080, height: 1920 }));
});
test("buildPosts: thumbnailMs as a parameter applies to Instagram and TikTok", () => {
  const ps = buildPosts({ brand, publication, channels: { instagram: "c", tiktok: "d" }, videoUrl: "u", when: { all: "2026-11-06T20:30:00.000Z" }, networks: ["instagram", "tiktok"], thumbnailMs: 0 });
  assert.equal(ps[0]!.input.assets[0].video.metadata.thumbnailOffset, 0);
  assert.equal(ps[1]!.input.assets[0].video.metadata.thumbnailOffset, 0);
});

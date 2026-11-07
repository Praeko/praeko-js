// praeko studio schedule --via praeko: FAKE fetch, no real network call, nothing is really sent.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { schedule } from "../src/schedule.ts";

const SLUG = "my-ep";
const META = { title: "A title", campaign: "camp", format: "short", yt: { description: "YouTube description", pinnedComment: "Pinned" }, ig: { caption: "IG caption" }, tiktok: { caption: "TT caption" }, hashtags: { youtube: ["#a"], instagram: ["#b"], tiktok: ["#c"] }, ai: { synthetic: true } };
const WHEN = "2099-11-06T17:30"; // far away and without a zone: Brazil's (-03:00) applies
const noWait = async () => {};

/** Test project: brand.json, src/index.ts, an episode with publication.json, fake video and cover (any bytes). */
function project(publishing: any = {}) {
  const root = mkdtempSync(join(tmpdir(), "praeko-studio-praeko-"));
  mkdirSync(join(root, "src")); writeFileSync(join(root, "src", "index.ts"), "");
  writeFileSync(join(root, "brand.json"), JSON.stringify({ links: { main: "https://example.com/" }, publishing }));
  mkdirSync(join(root, "episodes", SLUG), { recursive: true }); mkdirSync(join(root, "out"));
  writeFileSync(join(root, "episodes", SLUG, "publication.json"), JSON.stringify(META));
  writeFileSync(join(root, "out", `${SLUG}.mp4`), "fake-video"); writeFileSync(join(root, "out", `${SLUG}-cover.png`), "fake-cover");
  return root;
}
const schedFile = (root: string, ext = "") => join(root, "episodes", SLUG, `schedule${ext}.json`);

type Call = { method: string; path: string; headers: any; body: any };
/** Runs `schedule` inside the project, with console.log captured and a fake fetch. */
async function run(root: string, args: string[], { routes, key = "praeko_TEST", store }: { routes?: (c: Call) => any; key?: string | null; store?: (ref: string, k: string) => unknown } = {}) {
  const calls: Call[] = [], out: string[] = [], cwd = process.cwd(), log = console.log;
  const fetchFn = async (url: any, init: any) => {
    const u = new URL(url), c: Call = { method: init.method, path: u.pathname, headers: init.headers, body: init.body };
    calls.push(c);
    const r = (await routes?.(c)) ?? { body: {} };
    const status = r.status ?? 200;
    return { ok: status < 400, status, text: async () => JSON.stringify(r.body ?? {}) } as any;
  };
  process.chdir(root); console.log = (...x: any[]) => out.push(x.join(" "));
  let code: number | undefined, error: any;
  try { code = await schedule(args, { fetchFn, wait: noWait, getKey: (ref) => (ref === "praeko/main" ? key : null), storeKey: store || (() => { throw new Error("should not store"); }) }); }
  catch (e) { error = e; }
  finally { process.chdir(cwd); console.log = log; }
  return { calls, text: out.join("\n"), code, error };
}
const CHANNELS = { channels: [{ network: "youtube", id: "yt1", name: "YT channel", connected: true }, { network: "instagram", id: "ig1", name: "mychannel", connected: true, default: true }, { network: "instagram", id: "ig2", name: "other", connected: true }, { network: "tiktok", id: "tt1", name: "tt", connected: true }] };
/** Happy fake server: channels, media, post. */
function happy() {
  let m = 0;
  return (c: Call) => {
    if (c.method === "GET" && c.path === "/v1/channels") return { body: CHANNELS };
    if (c.method === "POST" && c.path === "/v1/media") return { body: { id: `m${++m}`, state: "uploading" } };
    if (c.method === "PUT" && c.path.endsWith("/content")) return { body: { state: "ready" } };
    if (c.method === "POST" && c.path === "/v1/posts") { const b = JSON.parse(c.body); return { status: 201, body: { id: b.id, items: b.items.map((i: any, n: number) => ({ id: `it${n + 1}`, network: i.network, state: "scheduled", scheduledFor: new Date(i.scheduledFor).toISOString() })) } }; }
    return { status: 404, body: { error: { code: "route_not_found", message: "route?" } } };
  };
}
const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");

test("the default provider is still Buffer (without --via and without brand publishing.provider)", async () => {
  const root = project();
  const r = await run(root, [SLUG, "--when", WHEN]);
  assert.equal(r.error, undefined); assert.equal(r.code, 0);
  assert.match(r.text, /SIMULATION \(nothing will be sent; use --send\)/); assert.doesNotMatch(r.text, /PRAEKO/);
  assert.equal(r.calls.length, 0);
});
test("brand.json → publishing.provider picks the default; --via buffer wins; an invalid provider gives a clear error", async () => {
  const root = project({ provider: "praeko" });
  assert.match((await run(root, [SLUG, "--when", WHEN, "--via", "buffer"])).text, /SIMULATION \(nothing will be sent/);
  assert.match((await run(root, [SLUG, "--when", WHEN], { key: null })).text, /SIMULATION ON PRAEKO/);
  assert.match((await run(root, [SLUG, "--when", WHEN, "--via", "zap"])).error.message, /provider "zap" is unknown.*buffer or praeko/);
  assert.match((await run(project({ provider: "arauto" }), [SLUG, "--when", WHEN])).error.message, /publishing\.provider/);
});
test("--via praeko without a key: simulates without network, but --send refuses with a useful message and writes nothing", async () => {
  const root = project();
  const sim = await run(root, [SLUG, "--when", WHEN, "--via", "praeko"], { key: null });
  assert.equal(sim.code, 0); assert.equal(sim.calls.length, 0);
  const send = await run(root, [SLUG, "--when", WHEN, "--via", "praeko", "--send"], { key: null });
  assert.match(send.error.message, /no Praeko key.*--via praeko --key/); assert.equal(send.calls.length, 0);
  assert.ok(!existsSync(schedFile(root)));
});
test("a simulation with a key only reads the channels (no write call), shows the plan and does not write a schedule", async () => {
  const root = project();
  const r = await run(root, [SLUG, "--when", WHEN, "--via", "praeko"], { routes: happy() });
  assert.equal(r.code, 0, r.error?.message);
  assert.deepEqual(r.calls.map((c) => `${c.method} ${c.path}`), ["GET /v1/channels"]);
  assert.equal(writes(r.calls).length, 0);
  assert.match(r.text, /SIMULATION ON PRAEKO/); assert.match(r.text, /YouTube .*scheduled \(Praeko uploads it private and schedules it\)/);
  assert.match(r.text, /Instagram .*via buffer/); assert.match(r.text, /TikTok .*draft/);
  assert.ok(!existsSync(schedFile(root)));
});
test("a simulation warns about a channel that is not connected, but only --send refuses", async () => {
  const root = project();
  const routes = () => ({ body: { channels: [{ network: "youtube", id: "yt1", connected: true }, { network: "tiktok", connected: false }, { network: "instagram", id: "ig1", connected: true }] } });
  const sim = await run(root, [SLUG, "--when", WHEN, "--via", "praeko"], { routes });
  assert.match(sim.text, /TikTok: is not connected on Praeko/);
  const send = await run(root, [SLUG, "--when", WHEN, "--via", "praeko", "--send"], { routes });
  assert.match(send.error.message, /TikTok: is not connected/); assert.equal(writes(send.calls).length, 0);
});
test("--send: uploads video and cover (simple media), creates the post with the slug id, a fixed time with offset and writes Praeko's schedule.json", async () => {
  const root = project();
  const r = await run(root, [SLUG, "--when", WHEN, "--via", "praeko", "--send", "--no-cover-frame"], { routes: happy() });
  assert.equal(r.error, undefined, r.error?.message); assert.equal(r.code, 0);
  assert.deepEqual(r.calls.map((c) => `${c.method} ${c.path}`), ["GET /v1/channels", "POST /v1/media", "PUT /v1/media/m1/content", "POST /v1/media", "PUT /v1/media/m2/content", "POST /v1/posts"]);
  for (const c of r.calls) { assert.equal(c.headers.authorization, "Bearer praeko_TEST"); assert.equal(c.headers["x-arauto-contract"], "en"); }
  assert.deepEqual([JSON.parse(r.calls[1]!.body), JSON.parse(r.calls[3]!.body)].map((b) => [b.type, b.name, b.mime, b.simple]), [["video", `${SLUG}.mp4`, "video/mp4", true], ["cover", `${SLUG}-cover.png`, "image/png", true]]);
  const post = JSON.parse(r.calls[5]!.body);
  assert.equal(post.id, SLUG); assert.equal(post.title, "A title"); assert.deepEqual(post.media, { video: "m1", cover: "m2" });
  assert.deepEqual(post.items, [
    { network: "youtube", scheduledFor: "2099-11-06T17:30:00-03:00", mode: "scheduled" },
    { network: "instagram", scheduledFor: "2099-11-06T17:30:00-03:00", via: "buffer" },
    { network: "tiktok", scheduledFor: "2099-11-06T17:30:00-03:00", mode: "draft" },
  ]);
  assert.equal(post.texts.youtube.title, "A title"); assert.equal(post.options.format, "short");
  const sched = JSON.parse(readFileSync(schedFile(root), "utf8"));
  assert.equal(sched.provider, "praeko"); assert.equal(sched.postId, SLUG); assert.equal(sched.slug, SLUG); assert.equal(sched.videoUrl, null);
  assert.deepEqual(sched.posts.map((x: any) => [x.network, x.id, x.postId]), [["youtube", "it1", SLUG], ["instagram", "it2", SLUG], ["tiktok", "it3", SLUG]]);
  assert.ok(sched.posts.every((x: any) => x.dueAt));
  assert.doesNotMatch(r.text + JSON.stringify(sched), /praeko_TEST/);
});
test("--networks and per-network times: only the chosen items, each at its time", async () => {
  const root = project();
  const r = await run(root, [SLUG, "--via", "praeko", "--yt", "2099-11-06T17:30", "--tt", "2099-11-06T19:00", "--networks", "yt,tt", "--send", "--no-cover-frame"], { routes: happy() });
  assert.equal(r.error, undefined, r.error?.message);
  const post = JSON.parse(r.calls.at(-1)!.body);
  assert.deepEqual(post.items.map((i: any) => [i.network, i.scheduledFor]), [["youtube", "2099-11-06T17:30:00-03:00"], ["tiktok", "2099-11-06T19:00:00-03:00"]]);
});
test("brand.json options: direct TikTok, Instagram through Meta (25 min) and a pinned channel", async () => {
  const root = project({ praeko: { tiktok: { mode: "direct" }, instagram: { via: "meta" }, channels: { instagram: "ig2" } } });
  const routes = (c: Call) => (c.path === "/v1/channels" ? { body: { channels: CHANNELS.channels.map((x) => (x.network === "instagram" ? { ...x, meta: { connected: true } } : x)) } } : happy()(c));
  const r = await run(root, [SLUG, "--when", WHEN, "--via", "praeko", "--send"], { routes });
  assert.equal(r.error, undefined, r.error?.message);
  const post = JSON.parse(r.calls.at(-1)!.body);
  assert.deepEqual(post.items.find((i: any) => i.network === "tiktok"), { network: "tiktok", scheduledFor: "2099-11-06T17:30:00-03:00", mode: "direct" });
  assert.deepEqual(post.items.find((i: any) => i.network === "instagram"), { network: "instagram", scheduledFor: "2099-11-06T17:30:00-03:00", channel: "ig2", via: "meta" });
  assert.deepEqual(post.options.tiktok, { privacy: "SELF_ONLY" });
  // via meta without Meta connected on Praeko: refuses before uploading anything
  const no = await run(project({ praeko: { instagram: { via: "meta" } } }), [SLUG, "--when", WHEN, "--via", "praeko", "--send"], { routes: happy() });
  assert.match(no.error.message, /Meta API is not connected/); assert.equal(writes(no.calls).length, 0);
  // less than 25 min ahead on Instagram via meta
  const soon = new Date(Date.now() + 10 * 60e3).toISOString();
  const short = await run(project({ praeko: { instagram: { via: "meta" } } }), [SLUG, "--via", "praeko", "--networks", "ig", "--when", soon], { routes: happy() });
  assert.match(short.error.message, /less than 25 minutes/);
});
test("--reminder does not exist on Praeko: refuses with a clear message; --url too", async () => {
  const root = project();
  assert.match((await run(root, [SLUG, "--when", WHEN, "--via", "praeko", "--reminder"])).error.message, /--reminder does not exist on Praeko.*--via buffer/);
  assert.match((await run(root, [SLUG, "--when", WHEN, "--via", "praeko", "--url", "https://x/v.mp4"])).error.message, /--url is Buffer's/);
});
test("a failure creating the post: the server error is shown and the media that was uploaded is removed (no orphans)", async () => {
  const root = project();
  const base = happy();
  const routes = (c: Call) => (c.method === "POST" && c.path === "/v1/posts" ? { status: 422, body: { error: { code: "invalid_field", message: "instagram: caption too long" } } } : c.method === "DELETE" ? { body: {} } : base(c));
  const r = await run(root, [SLUG, "--when", WHEN, "--via", "praeko", "--send", "--no-cover-frame"], { routes });
  assert.match(r.error.message, /HTTP 422, invalid_field.*caption too long/);
  assert.deepEqual(r.calls.filter((c) => c.method === "DELETE").map((c) => c.path), ["/v1/media/m1", "/v1/media/m2"]);
  assert.ok(!existsSync(schedFile(root)));
});
test("id already exists: with a cancelled post it uses slug-2; with the same networks still alive, it refuses", async () => {
  const base = happy();
  const exists = (state: string) => (c: Call) => c.method === "POST" && c.path === "/v1/posts" && JSON.parse(c.body).id === SLUG ? { status: 409, body: { error: { code: "id_exists", message: "already exists" } } } : c.method === "GET" && c.path === `/v1/posts/${SLUG}` ? { body: { id: SLUG, items: [{ network: "youtube", state }] } } : base(c);
  const r = await run(project(), [SLUG, "--when", WHEN, "--via", "praeko", "--networks", "yt", "--send", "--no-cover-frame"], { routes: exists("canceled") });
  assert.equal(r.error, undefined, r.error?.message);
  assert.equal(JSON.parse(r.calls.at(-1)!.body).id, `${SLUG}-2`);
  const v = await run(project(), [SLUG, "--when", WHEN, "--via", "praeko", "--networks", "yt", "--send", "--no-cover-frame"], { routes: exists("scheduled") });
  assert.match(v.error.message, /already exists on Praeko with YouTube \(scheduled\)/);
});
test("--status and --cancel use the postId of schedule.json; cancelling leaves what already went out", async () => {
  const root = project();
  await run(root, [SLUG, "--when", WHEN, "--via", "praeko", "--send", "--no-cover-frame"], { routes: happy() });
  const routes = (c: Call) => (c.method === "GET" ? { body: { id: SLUG, title: "A title", items: [{ network: "youtube", state: "scheduled", scheduledFor: "2099-11-06T20:30:00Z" }, { network: "tiktok", state: "sent", url: "https://tt/x" }] } } : { body: { canceled: [{ network: "youtube" }, { network: "instagram" }], kept: [{ network: "tiktok", state: "sent" }] } });
  const st = await run(root, [SLUG, "--status"], { routes }); // without --via: follows the provider of the schedule
  assert.equal(st.error, undefined, st.error?.message);
  assert.deepEqual(st.calls.map((c) => `${c.method} ${c.path}`), [`GET /v1/posts/${SLUG}`]);
  assert.match(st.text, /YouTube\s+scheduled/); assert.match(st.text, /TikTok\s+sent .*https:\/\/tt\/x/);
  const ca = await run(root, [SLUG, "--cancel", "--via", "praeko"], { routes });
  assert.deepEqual(ca.calls.map((c) => `${c.method} ${c.path}`), [`DELETE /v1/posts/${SLUG}`]);
  assert.match(ca.text, /cancelled on Praeko: my-ep \(2 pending item/); assert.match(ca.text, /TikTok stayed \(sent\)/);
  assert.ok(!existsSync(schedFile(root)) && existsSync(schedFile(root, ".cancelled")));
});
test("--cancel --networks: only when the network fills the whole post (Praeko cancels the whole post)", async () => {
  const root = project();
  await run(root, [SLUG, "--when", WHEN, "--via", "praeko", "--send", "--no-cover-frame"], { routes: happy() });
  const r = await run(root, [SLUG, "--cancel", "--networks", "yt"], { routes: () => ({ body: {} }) });
  assert.match(r.error.message, /cancels the whole post.*YouTube/); assert.equal(writes(r.calls).length, 0);
  assert.ok(existsSync(schedFile(root)));
});
test("it never mixes providers: a Buffer schedule is not touched by Praeko and vice versa", async () => {
  const buf = project();
  writeFileSync(schedFile(buf), JSON.stringify({ slug: SLUG, title: "t", videoUrl: "https://v/x.mp4", objectKey: "k", posts: [{ network: "youtube", id: "b1", dueAt: "2099-11-06T20:30:00.000Z" }] })); // no `provider`: Buffer
  const a = await run(buf, [SLUG, "--cancel", "--via", "praeko"], { routes: happy() });
  assert.match(a.error.message, /scheduled by Buffer.*--via buffer/); assert.equal(a.calls.length, 0);
  assert.match((await run(buf, [SLUG, "--status", "--via", "praeko"], { routes: happy() })).error.message, /scheduled by Buffer/);
  assert.match((await run(buf, [SLUG, "--when", WHEN, "--via", "praeko", "--send"], { routes: happy() })).error.message, /already scheduled by Buffer: cancel it there first/);
  const sbuf = await run(buf, [SLUG, "--status"], { routes: happy() });
  assert.equal(sbuf.error, undefined); assert.match(sbuf.text, /video: https:\/\/v\/x\.mp4/); assert.equal(sbuf.calls.length, 0);
  const pk = project();
  writeFileSync(schedFile(pk), JSON.stringify({ provider: "praeko", slug: SLUG, postId: SLUG, posts: [{ network: "youtube", id: "it1", postId: SLUG, dueAt: "2099-11-06T20:30:00.000Z" }] }));
  const b = await run(pk, [SLUG, "--cancel", "--via", "buffer"], { routes: happy() });
  assert.match(b.error.message, /scheduled by Praeko.*--via praeko/); assert.equal(b.calls.length, 0); assert.ok(existsSync(schedFile(pk)));
});
test("--clear on Praeko: no hosting; archives to schedule.done.json only if nothing is pending", async () => {
  const root = project();
  await run(root, [SLUG, "--when", WHEN, "--via", "praeko", "--send", "--no-cover-frame"], { routes: happy() });
  const pending = await run(root, [SLUG, "--clear"], { routes: () => ({ body: { id: SLUG, items: [{ network: "youtube", state: "scheduled" }] } }) });
  assert.match(pending.error.message, /still pending item\(s\).*--cancel/); assert.ok(existsSync(schedFile(root)));
  const ok = await run(root, [SLUG, "--clear"], { routes: () => ({ body: { id: SLUG, items: [{ network: "youtube", state: "sent" }] } }) });
  assert.equal(ok.error, undefined); assert.match(ok.text, /no hosted video to clear/);
  assert.ok(!existsSync(schedFile(root)) && existsSync(schedFile(root, ".done")));
});
test("--channels --via praeko lists id, network, name and the default account", async () => {
  const r = await run(project(), ["--channels", "--via", "praeko"], { routes: happy() });
  assert.equal(r.code, 0, r.error?.message);
  assert.deepEqual(r.calls.map((c) => `${c.method} ${c.path}`), ["GET /v1/channels"]);
  assert.match(r.text, /instagram\s+ig1\s+mychannel\s+\(default\)/); assert.match(r.text, /instagram\s+ig2\s+other\s*$/m); assert.match(r.text, /youtube\s+yt1\s+YT channel/);
  assert.match((await run(project(), ["--channels", "--via", "praeko"], { key: null })).error.message, /no Praeko key/);
});
test("--key with --via praeko stores under praeko/main and refuses a key that is not Praeko's", async () => {
  const stored: [string, string][] = [];
  const r = await run(project(), ["--via", "praeko", "--key", "praeko_NEW"], { store: (ref, k) => stored.push([ref, k]) });
  assert.equal(r.code, 0); assert.deepEqual(stored, [["praeko/main", "praeko_NEW"]]);
  assert.match(r.text, /system keychain.*praeko\/main/); assert.doesNotMatch(r.text, /praeko_NEW/);
  const bad = await run(project(), ["--via", "praeko", "--key", "something-else"], { store: (ref, k) => stored.push([ref, k]) });
  assert.match(bad.error.message, /does not look like a Praeko key/); assert.equal(stored.length, 1);
  const buf = await run(project(), ["--key", "bufferkey"], { store: (ref, k) => stored.push([ref, k]) }); // without --via: still Buffer's
  assert.deepEqual(stored.at(-1), ["buffer/principal", "bufferkey"]); assert.match(buf.text, /Buffer key stored/);
});
test("an episode with a publication error does not schedule (same rule as Buffer)", async () => {
  const root = project();
  writeFileSync(join(root, "episodes", SLUG, "publication.json"), JSON.stringify({ ...META, hashtags: { instagram: Array.from({ length: 31 }, (_, i) => `#t${i}`) } }));
  const r = await run(root, [SLUG, "--when", WHEN, "--via", "praeko", "--send"], { routes: happy() });
  assert.equal(r.code, 1); assert.match(r.text, /✗ more than 30 hashtags/); assert.equal(r.calls.length, 0);
});
// Instagram through Buffer: the Instagram item carries a copy of the video with the cover in the first 2 frames (needs ffmpeg; skipped without it).
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
test("Instagram via buffer: the cover pasted into the first 2 frames becomes media of the Instagram item only", { skip: !hasFfmpeg && "no ffmpeg" }, async () => {
  const root = project();
  const f = (...a: string[]) => assert.equal(spawnSync("ffmpeg", ["-v", "error", "-y", ...a]).status, 0);
  f("-f", "lavfi", "-i", "testsrc=size=90x160:rate=10:duration=1", "-pix_fmt", "yuv420p", join(root, "out", `${SLUG}.mp4`));
  f("-f", "lavfi", "-i", "color=c=red:size=90x160", "-frames:v", "1", join(root, "out", `${SLUG}-cover.png`));
  const r = await run(root, [SLUG, "--when", WHEN, "--via", "praeko", "--send"], { routes: happy() });
  assert.equal(r.error, undefined, r.error?.message);
  assert.deepEqual(r.calls.filter((c) => c.method === "PUT").map((c) => c.path), ["/v1/media/m1/content", "/v1/media/m2/content", "/v1/media/m3/content"]);
  const post = JSON.parse(r.calls.at(-1)!.body);
  assert.deepEqual(post.media, { video: "m1", cover: "m2" });
  assert.deepEqual(post.items.find((i: any) => i.network === "instagram").media, { video: "m3" });
  assert.equal(post.items.find((i: any) => i.network === "youtube").media, undefined);
  assert.ok(existsSync(join(root, "episodes", SLUG, "..", "..", "out", `${SLUG}.cover.mp4`)));
});

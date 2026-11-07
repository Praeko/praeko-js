import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../src/cli.ts";

const FIX = fileURLToPath(new URL("./fixtures", import.meta.url));
process.env.PRAEKO_NO_KEYCHAIN = "1";
const forbidden = async (u) => { throw new Error("FORBIDDEN NETWORK in test: " + u); };
const run = async (args, extra = {}) => { const lines = []; const code = await runCli(args, { log: (m) => lines.push(String(m)), error: (m) => lines.push(String(m)), ctxExtra: { fetchFn: forbidden, ...extra } }); return { code, output: lines.join("\n") }; };
const setup = () => { const dir = mkdtempSync(join(tmpdir(), "praeko-cli-")); cpSync(FIX, dir, { recursive: true }); process.env.PRAEKO_SECRETS = join(dir, "secrets.json"); return dir; };
const base = (dir) => ["--config", join(dir, "praeko.json")];

test("post: the simulation shows the plan per network, creates no queue and does not touch the network", async () => {
  const dir = setup();
  const r = await run(["post", join(dir, "packages", "test-package"), "--when", "30/12 17:30", "--networks", "yt,ig,tt", "--tt", "30/12 18:00", "--tt-mode", "direct", ...base(dir)]);
  assert.equal(r.code, 0); assert.match(r.output, /SIMULATION.*\[local\]/);
  assert.match(r.output, /YouTube\s+now/); assert.match(r.output, /Instagram\s+30\/12\/2026/); assert.match(r.output, /TikTok\s+30\/12\/2026.*mode direct/);
  assert.match(r.output, /privacy: SELF_ONLY/); assert.match(r.output, /none of this is published/);
  assert.ok(!existsSync(join(dir, ".praeko", "fila.json")));
  rmSync(dir, { recursive: true, force: true });
});
test("post: finds the package by name in <root>/packages and accepts --yt-mode scheduled", async () => {
  const dir = setup();
  const r = await run(["post", "test-package", "--when", "30/12 17:30", "--networks", "yt", "--yt-mode", "scheduled", ...base(dir)]);
  assert.equal(r.code, 0); assert.match(r.output, /YouTube\s+30\/12\/2026/); assert.match(r.output, /publishes by itself at/);
  rmSync(dir, { recursive: true, force: true });
});
test("guards: invalid mode, [LINK_…] marker, banned hashtag and network without a time", async () => {
  const dir = setup(), pk = join(dir, "packages", "test-package");
  assert.equal((await run(["post", pk, "--when", "30/12 17:30", "--networks", "tt", "--tt-mode", "x", ...base(dir)])).code, 1);
  const meta = JSON.parse(readFileSync(join(pk, "publication.json"), "utf8"));
  writeFileSync(join(pk, "publication.json"), JSON.stringify({ ...meta, yt: { descricao: "veja [LINK_DO_LONGO]" } }));
  const m = await run(["post", pk, "--when", "30/12 17:30", "--networks", "yt", ...base(dir)]);
  assert.equal(m.code, 1); assert.match(m.output, /unfilled marker/);
  writeFileSync(join(pk, "publication.json"), JSON.stringify({ ...meta, hashtags: { youtube: ["#bitcoin"] } }));
  const h = await run(["post", pk, "--when", "30/12 17:30", "--networks", "yt", ...base(dir)]);
  assert.equal(h.code, 1); assert.match(h.output, /banned hashtag/);
  writeFileSync(join(pk, "publication.json"), JSON.stringify(meta));
  const s = await run(["post", pk, "--networks", "ig", ...base(dir)]); // without --when: Instagram goes "now"; it only simulates
  assert.equal(s.code, 0); assert.match(s.output, /Instagram\s+now/);
  rmSync(dir, { recursive: true, force: true });
});
test("schedule (Buffer): simulation, and Buffer refuses a time that already passed", async () => {
  const dir = setup(), pk = join(dir, "packages", "test-package");
  const r = await run(["schedule", pk, "--when", "30/12 17:30", "--networks", "yt,ig", ...base(dir)]);
  assert.equal(r.code, 0); assert.match(r.output, /\[buffer\]/); assert.match(r.output, /YouTube\s+30\/12\/2026/);
  const passado = await run(["schedule", pk, "--when", "2020-01-01T10:00", "--networks", "yt", ...base(dir)]);
  assert.equal(passado.code, 1); assert.match(passado.output, /less than 5 minutes|already past/);
  rmSync(dir, { recursive: true, force: true });
});
test("queue: list and `comment <id>` releases the manual item and comments (simulated network)", async () => {
  const dir = setup(); const { enfileirar } = await import("@praeko/core");
  assert.match((await run(["queue", "list", ...base(dir)])).output, /queue empty/);
  const it = enfileirar(dir, { slug: "s", rede: "youtube", provedor: "youtube", acao: "comentar", manual: true, quando: null, videoId: "VID", textos: { comentarioFixo: "hi" }, opcoes: {} });
  assert.match((await run(["queue", "list", ...base(dir)])).output, /\[comentar, manual\]/);
  const seg = { "youtube/cliente": JSON.stringify({ client_id: "i", client_secret: "s" }), "youtube/token": JSON.stringify({ access_token: "AT", refresh_token: "RT", expiry: Date.now() + 3600e3 }) };
  const fetchFn = async (url, o = {}) => { const j = url.includes("channels") ? { items: [{ id: "C" }] } : { id: "COM" }; return { ok: true, status: 200, headers: { get: () => null }, json: async () => j, text: async () => JSON.stringify(j) }; };
  const r = await run(["queue", "comment", it.id, ...base(dir)], { fetchFn, segredos: { obter: (k) => seg[k] ?? null, guardar() {} } });
  assert.equal(r.code, 0); assert.match(r.output, /comment posted/);
  assert.match((await run(["queue", "list", ...base(dir)])).output, /sent/);
  rmSync(dir, { recursive: true, force: true });
});
test("account status without credentials: not connected (code 1) and help (code 0)", async () => {
  const dir = setup();
  const r = await run(["account", "youtube", "status", ...base(dir)], { segredos: { obter: () => null, guardar() {} } });
  assert.equal(r.code, 1); assert.match(r.output, /NOT connected/);
  assert.equal((await run(["help"])).code, 0);
  rmSync(dir, { recursive: true, force: true });
});

// ---- remote service (Praeko on Cloudflare), with a fake client in place of the SDK ----
import { hashChave } from "@praeko/core/chaves";
const fake = (extra = {}) => { const calls = []; const reg = (n, r) => (...a) => { calls.push([n, ...a]); return r instanceof Function ? r(...a) : r; };
  return { calls, media: { upload: reg("media.upload", (_f, o) => ({ id: "M-" + o.type })) }, posts: { create: reg("posts.create", (p) => ({ id: p.id, items: p.items.map((d, i) => ({ id: "d" + i, network: d.network, state: d.draft ? "draft" : "scheduled", scheduledFor: d.scheduledFor ?? "2026-11-06T20:30:00.000Z", custom: false })) })), list: reg("posts.list", { total: 1, posts: [{ id: "ep-1", state: "queued", title: "My video", tags: ["raide"], items: [{ network: "youtube", state: "scheduled", scheduledFor: "2026-11-06T20:30:00.000Z" }] }] }), publishNow: reg("posts.publishNow", { items: [{ network: "youtube", state: "scheduled" }] }) }, channels: { slots: reg("channels.slots", { timezone: "America/Sao_Paulo", slots: [{ day: "fri", time: "17:30" }] }), setSlots: reg("channels.setSlots", (_r, v) => ({ timezone: "America/Sao_Paulo", slots: v.map((x) => ({ day: x.split(" ")[0], time: x.split(" ")[1] })), rescheduled: [1] })), connect: reg("channels.connect", { url: "https://accounts.example/auth?x=1" }), list: reg("channels.list", { channels: [] }) }, apiKeys: { create: reg("apiKeys.create", (n, e) => ({ id: "chv_1", scope: e, key: "arauto_NOVA" })), list: reg("apiKeys.list", { keys: [{ id: "chv_1", name: "bardo", prefix: "arauto_abc", scope: "write", revoked: false, lastUsedAt: null }] }), revoke: reg("apiKeys.revoke", {}) }, calendar: reg("calendar", { items: [{ scheduledFor: "2026-11-06T20:30:00.000Z", network: "youtube", state: "scheduled", title: "My video", custom: false }], freeSlots: [{ network: "youtube", scheduledFor: "2026-11-09T01:00:00.000Z" }] }), ...extra }; };

test("remote: post --server --queue simulates and, with --send, uploads the media and creates the post with queue and tags", async () => {
  const dir = setup(), a = fake(), pk = join(dir, "packages", "test-package");
  const sim = await run(["post", pk, "--server", "https://praeko.example", "--queue", "--networks", "yt", "--tag", "raide, dia-5", ...base(dir)], { praeko: a });
  assert.equal(sim.code, 0, sim.output); assert.match(sim.output, /SIMULATION.*\[remote\]/); assert.match(sim.output, /next queue slot/); assert.equal(a.calls.length, 0, "simulação não chama o serviço");
  const r = await run(["post", pk, "--server", "https://praeko.example", "--queue", "--networks", "yt", "--tag", "raide, dia-5", "--yt-mode", "scheduled", "--send", ...base(dir)], { praeko: a });
  assert.equal(r.code, 0, r.output); assert.match(r.output, /✓ YouTube scheduled for/);
  const created = a.calls.find((c) => c[0] === "posts.create")[1];
  assert.equal(created.id, "test-package"); assert.deepEqual(created.tags, ["raide", "dia-5"]);
  assert.deepEqual(created.items, [{ network: "youtube", mode: "scheduled", queue: true }]); assert.deepEqual(created.media, { video: "M-video", cover: "M-cover" });
  assert.ok(created.title && created.texts.youtube.title, "English fields");
  assert.equal(a.calls.filter((c) => c[0] === "media.upload").length, 2);
  rmSync(dir, { recursive: true, force: true });
});
test("remote: --draft goes as a draft; a package id with odd characters is cleaned", async () => {
  const dir = setup(), a = fake(); cpSync(join(dir, "packages", "test-package"), join(dir, "packages", "Ep 1: o começo"), { recursive: true });
  const r = await run(["post", join(dir, "packages", "Ep 1: o começo"), "--server", "https://x", "--draft", "--networks", "yt", "--send", ...base(dir)], { praeko: a });
  assert.equal(r.code, 0, r.output); const c = a.calls.find((x) => x[0] === "posts.create")[1];
  assert.match(c.id, /^[A-Za-z0-9_-]+$/); assert.equal(c.items[0].draft, true); assert.match(r.output, /YouTube draft/);
  rmSync(dir, { recursive: true, force: true });
});
test("remote: slots, posts, calendar, publish-now and account connect", async () => {
  const dir = setup(), a = fake();
  const v = await run(["slots", "youtube", "fri", "17:30", "sun", "22:00", "--timezone", "America/Sao_Paulo", ...base(dir)], { praeko: a });
  assert.match(v.output, /YouTube slots.*fri 17:30, sun 22:00; 1 queue item/); assert.deepEqual(a.calls.find((c) => c[0] === "channels.setSlots").slice(1), ["youtube", ["fri 17:30", "sun 22:00"], { timezone: "America/Sao_Paulo" }]);
  assert.match((await run(["slots", "youtube", ...base(dir)], { praeko: a })).output, /fri 17:30/);
  assert.equal((await run(["slots", "youtube", "fri", ...base(dir)], { praeko: a })).code, 1);
  const p = await run(["posts", "--state", "queued", ...base(dir)], { praeko: a }); assert.match(p.output, /ep-1\s+queued\s+My video.*youtube:scheduled.*#raide/);
  assert.deepEqual(a.calls.find((c) => c[0] === "posts.list")[1], { state: "queued", channel: undefined, tag: undefined, limit: undefined });
  const cal = await run(["calendar", ...base(dir)], { praeko: a }); assert.match(cal.output, /YouTube scheduled  My video/); assert.match(cal.output, /YouTube free slot/);
  assert.match((await run(["publish-now", "ep-1", ...base(dir)], { praeko: a })).output, /YouTube\s+scheduled/);
  const cn = await run(["account", "youtube", "connect", "--server", "https://x", ...base(dir)], { praeko: a }); assert.match(cn.output, /accounts\.example\/auth/);
  rmSync(dir, { recursive: true, force: true });
});
test("key: create --sql generates the key and the SQL (database scope spelling) with the right hash; create/list/revoke through the service", async () => {
  const dir = setup(), a = fake();
  const s = await run(["key", "create", "--name", "ad'min", "--scope", "admin", "--sql", ...base(dir)]);
  assert.equal(s.code, 0, s.output); const key = /(praeko_[A-Za-z0-9_-]+)/.exec(s.output)[1];
  assert.ok(s.output.includes(await hashChave(key)), "the SQL carries the hash of the key shown"); assert.ok(!/INSERT[^\n]*praeko_[A-Za-z0-9_-]{30,}/.test(s.output), "the plain key does not go in the SQL");
  assert.match(s.output, /ad''min/); assert.match(s.output, /'admin'/);
  const w = await run(["key", "create", "--name", "x", "--scope", "write", "--sql", ...base(dir)]); assert.match(w.output, /'escrita'/, "the database stores escrita");
  assert.equal((await run(["key", "create", "--sql", ...base(dir)])).code, 1);
  assert.match((await run(["key", "create", "--name", "bardo", "--server", "https://x", ...base(dir)], { praeko: a })).output, /arauto_NOVA/);
  assert.deepEqual(a.calls.find((c) => c[0] === "apiKeys.create").slice(1), ["bardo", "write"]);
  assert.match((await run(["key", "list", ...base(dir)], { praeko: a })).output, /chv_1\s+write\s+bardo/);
  assert.match((await run(["key", "revoke", "chv_1", ...base(dir)], { praeko: a })).output, /revoked/);
  delete process.env.ARAUTO_CHAVE; delete process.env.PRAEKO_KEY; const none = await run(["posts", "--server", "https://x", ...base(dir)]);
  assert.equal(none.code, 1); assert.match(none.output, /missing the service key/);
  rmSync(dir, { recursive: true, force: true });
});

// ---- Instagram through Buffer on the remote service: cover on the first 2 frames and adoption ----
import { spawnSync } from "node:child_process";
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
const withIds = () => { const a = fake(); let n = 0; a.media.upload = (f, o) => { a.calls.push(["media.upload", f, o]); return { id: `M${++n}-${o.type}` }; }; return a; };

test("remote + Instagram: the target gets a copy of the video with the cover on the first 2 frames (extra media of the target)", { skip: !hasFfmpeg && "no ffmpeg" }, async () => {
  const dir = setup(), a = withIds(), pk = join(dir, "packages", "test-package");
  const sim = await run(["post", pk, "--server", "https://x", "--when", "30/12 17:30", "--networks", "yt,ig", "--yt-mode", "scheduled", ...base(dir)], { praeko: a });
  assert.equal(sim.code, 0, sim.output); assert.match(sim.output, /Instagram: cover on the first 2 frames/); assert.equal(a.calls.length, 0); assert.ok(!existsSync(join(dir, ".praeko", "test-package-instagram.mp4")), "a cópia só sai no --send");
  const r = await run(["post", pk, "--server", "https://x", "--when", "30/12 17:30", "--networks", "yt,ig", "--yt-mode", "scheduled", "--send", ...base(dir)], { praeko: a });
  assert.equal(r.code, 0, r.output); assert.match(r.output, /cover pasted on the first 2 frames/);
  assert.ok(existsSync(join(dir, ".praeko", "test-package-instagram.mp4")));
  const uploads = a.calls.filter((c) => c[0] === "media.upload");
  assert.equal(uploads.length, 3, "video, cover and the Instagram copy");
  const created = a.calls.find((c) => c[0] === "posts.create")[1], ig = created.items.find((d) => d.network === "instagram"), yt = created.items.find((d) => d.network === "youtube");
  assert.deepEqual(created.media, { video: "M1-video", cover: "M2-cover" }); assert.deepEqual(ig.media, { video: "M3-video" }); assert.equal(yt.media, undefined, "só o Instagram leva cópia");
  rmSync(dir, { recursive: true, force: true });
});
test("remote + Instagram: --no-cover-in-frame turns it off; a long video gets no cover in the frames", { skip: !hasFfmpeg && "no ffmpeg" }, async () => {
  const dir = setup(), a = withIds(), pk = join(dir, "packages", "test-package");
  const r = await run(["post", pk, "--server", "https://x", "--when", "30/12 17:30", "--networks", "ig", "--no-cover-in-frame", "--send", ...base(dir)], { praeko: a });
  assert.equal(r.code, 0, r.output); assert.equal(a.calls.filter((c) => c[0] === "media.upload").length, 2); assert.equal(a.calls.find((c) => c[0] === "posts.create")[1].items[0].media, undefined);
  const meta = JSON.parse(readFileSync(join(pk, "publication.json"), "utf8"));
  writeFileSync(join(pk, "publication.json"), JSON.stringify({ ...meta, formato: "longo" }));
  const l = await run(["post", pk, "--server", "https://x", "--when", "30/12 17:30", "--networks", "ig", ...base(dir)], { praeko: a });
  assert.match(l.output, /cover not pasted on the long video/);
  rmSync(dir, { recursive: true, force: true });
});
test("remote: adopt-buffer registers in the dashboard a Reel already scheduled in Buffer (without calling Buffer) and requires the fields", async () => {
  const dir = setup(), a = fake(); a.posts.adopt = (p) => { a.calls.push(["posts.adopt", p]); return { id: p.id, items: [{ state: "scheduled", scheduledFor: p.scheduledFor }] }; };
  const r = await run(["adopt-buffer", "--id", "longo-ig", "--title", "I was about to close the gap", "--when", "30/12 10:00", "--buffer-id", "6aebc2a5", "--text", "Caption", "--server", "https://x", ...base(dir)], { praeko: a });
  assert.equal(r.code, 0, r.output); assert.match(r.output, /adopted: longo-ig/);
  const esperado = { id: "longo-ig", title: "I was about to close the gap", network: "instagram", scheduledFor: "2026-12-30T13:00:00.000Z", external: { provider: "buffer", id: "6aebc2a5" }, texts: { instagram: { text: "Caption" } } };
  assert.deepEqual(a.calls.find((x) => x[0] === "posts.adopt")[1], esperado);
  assert.equal((await run(["adopt-buffer", "--title", "x", "--server", "https://x", ...base(dir)], { praeko: a })).code, 1);
  rmSync(dir, { recursive: true, force: true });
});

// ---- TikTok on the remote service ----
test("remote + TikTok: post carries mode, privacy and cover frame, and warns about the audit and the cover image", async () => {
  const dir = setup(), a = fake(), pk = join(dir, "packages", "test-package");
  const args = ["post", pk, "--server", "https://x", "--when", "30/12 17:30", "--networks", "tt", "--tt-mode", "direct", "--tt-privacy", "SELF_ONLY", "--tt-frame", "1500"];
  const sim = await run([...args, ...base(dir)], { praeko: a });
  assert.equal(sim.code, 0, sim.output); assert.match(sim.output, /SIMULATION/); assert.match(sim.output, /TikTok\s+30\/12\/2026.*mode direct/); assert.match(sim.output, /only SELF_ONLY.*audited|audited by TikTok/);
  assert.equal(a.calls.filter(([n]) => n === "posts.create").length, 0);
  const r = await run([...args, "--send", ...base(dir)], { praeko: a });
  assert.equal(r.code, 0, r.output);
  const request = a.calls.find(([n]) => n === "posts.create")[1];
  assert.deepEqual(request.items.map((d) => [d.network, d.mode]), [["tiktok", "direct"]]); assert.deepEqual(request.options.tiktok, { privacy: "SELF_ONLY", coverFrameMs: 1500 });
  const draft = await run(["post", pk, "--server", "https://x", "--when", "30/12 17:30", "--networks", "tt", ...base(dir)], { praeko: a });
  assert.match(draft.output, /TikTok draft: the video lands in the app inbox/);
  rmSync(dir, { recursive: true, force: true });
});
test("tiktok: import, videos, status, connect and disconnect through the service; account tiktok status/disconnect with --server goes to the service", async () => {
  const dir = setup(), connected = { channels: [{ network: "tiktok", connected: true, detail: "Dev Ocioso" }] };
  const a = fake({ insights: { import: (o) => ({ imported: [{ network: o.network, simulated: !!o.dryRun, found: 5, created: 3, updated: 2, views: 900, likes: 80, comments: 6 }] }) }, content: { list: (o) => ({ total: 1, items: [{ publishedAt: "2026-11-02T12:00:00Z", network: o.network, views: 321, reactions: 40, title: "Test video" }] }) } });
  a.channels.list = (o) => (o?.verify ? connected : { channels: [] }); a.channels.disconnect = async (r) => { a.calls.push(["channels.disconnect", r]); return { disconnected: true, revokedAtTiktok: true }; };
  const imp = await run(["tiktok", "import", "--dry-run", ...base(dir)], { praeko: a }); assert.equal(imp.code, 0, imp.output); assert.match(imp.output, /TikTok \(simulation\): 5 found · 3 new · 2 updated · 900 views/);
  const vid = await run(["tiktok", "videos", ...base(dir)], { praeko: a }); assert.match(vid.output, /TikTok\s+321 views\s+40 reactions\s+Test video/);
  const st = await run(["tiktok", "status", ...base(dir)], { praeko: a }); assert.equal(st.code, 0); assert.match(st.output, /TikTok: connected \(Dev Ocioso\)/); assert.match(st.output, /audited/);
  assert.match((await run(["account", "tiktok", "status", "--server", "https://x", ...base(dir)], { praeko: a })).output, /TikTok: connected/);
  assert.match((await run(["tiktok", "connect", ...base(dir)], { praeko: a })).output, /accounts\.example\/auth/);
  a.channels.list = () => ({ channels: [{ network: "tiktok", connected: false, detail: "not connected" }] });
  assert.equal((await run(["tiktok", "status", ...base(dir)], { praeko: a })).code, 1);
  assert.equal((await run(["tiktok", "nope", ...base(dir)], { praeko: a })).code, 1);
  rmSync(dir, { recursive: true, force: true });
});
test("youtube, insights and followers through the service read the English fields", async () => {
  const dir = setup();
  const a = fake({
    youtube: {
      listVideos: (o) => { a.calls.push(["youtube.listVideos", o]); return { videos: [{ id: "V1", publishedAt: "2026-11-02T12:00:00Z", privacy: "public", viewCount: 9, title: "Video" }], next: null }; },
      getVideo: async () => ({ video: { title: "T", url: "https://y/V1", privacy: "public", publishedAt: "2026-11-02T12:00:00Z", viewCount: 9, likes: 2, comments: 1, description: "desc" } }),
      editVideo: (id, o) => { a.calls.push(["youtube.editVideo", id, o]); return { before: { title: "A", description: "d" }, after: { title: "B", description: "d" }, changed: true, written: !o.dryRun }; },
      comments: (o) => { a.calls.push(["youtube.comments", o]); return { comments: [{ id: "T1", publishedAt: "2026-11-02T12:00:00Z", videoId: "V1", fromOwner: false, answered: false, author: "Ana", text: "hi" }], next: null }; },
      reply: async () => ({ id: "R1" }), resolve: async () => ({}), reopen: async () => ({}),
    },
    insights: { get: (o) => { a.calls.push(["insights.get", o]); return { cards: { posts: 2, views: 100, reactions: 10, comments: 3, engagement: 13, followers: 50, followersChange: 2, change: {} }, sources: {}, topPosts: [{ title: "Top", network: "youtube", reactions: 5, comments: 1, views: 50 }], channels: [{ network: "youtube", posts: 2, reactions: 10, comments: 3, engagement: 13 }], summary: [{ title: "Summary", text: "ok" }], collection: { collecting: false }, reading48h: [], reading48hText: "| table |" }; } },
    channels: { followers: async () => ({ records: [{ day: "2026-11-04", followers: 1000, source: "manual" }] }), setFollowers: async (n, v, o) => { a.calls.push(["channels.setFollowers", n, v, o]); return { followers: v, day: "2026-11-04" }; } },
  });
  assert.match((await run(["youtube", "videos", "--max", "5", ...base(dir)], { praeko: a })).output, /V1\s.*public.*Video/);
  assert.match((await run(["youtube", "video", "V1", ...base(dir)], { praeko: a })).output, /9 views · 2 likes/);
  const ed = await run(["youtube", "edit", "V1", "--title", "B", "--send", ...base(dir)], { praeko: a }); assert.match(ed.output, /EDITING/); assert.match(ed.output, /written to YouTube/);
  assert.equal(a.calls.find((c) => c[0] === "youtube.editVideo")[2].dryRun, false);
  assert.match((await run(["youtube", "comments", "--unanswered", ...base(dir)], { praeko: a })).output, /NO REPLY  Ana: hi/);
  assert.match((await run(["youtube", "reply", "T1", "--text", "thanks", "--send", ...base(dir)], { praeko: a })).output, /replied \(R1\)/);
  const ins = await run(["insights", "--days", "7", "--type", "long", "--compare", ...base(dir)], { praeko: a }); assert.match(ins.output, /posts 2 · views 100 · reactions 10 · comments 3/); assert.match(ins.output, /• Summary: ok/);
  const ig = a.calls.filter((c) => c[0] === "insights.get"); assert.equal(ig[0][1].type, "long"); assert.equal(ig[0][1].compare, true);
  assert.match((await run(["insights", "48h", ...base(dir)], { praeko: a })).output, /\| table \|/);
  assert.match((await run(["followers", "instagram", ...base(dir)], { praeko: a })).output, /2026-11-04\s+1000\s+manual/);
  assert.match((await run(["followers", "instagram", "1200", "--day", "2026-11-04", ...base(dir)], { praeko: a })).output, /1200 followers/);
  assert.deepEqual(a.calls.find((c) => c[0] === "channels.setFollowers").slice(1), ["instagram", 1200, { day: "2026-11-04" }]);
  rmSync(dir, { recursive: true, force: true });
});

test("PRAEKO_KEY and PRAEKO_SERVER apply (with ARAUTO_CHAVE as a fallback) and the help introduces itself as Praeko", async () => {
  const calls = [], client = { posts: { list: async () => ({ posts: [], total: 0 }) } };
  const prev = { s: process.env.PRAEKO_SERVER, k: process.env.PRAEKO_KEY, c: process.env.ARAUTO_CHAVE };
  try {
    process.env.PRAEKO_SERVER = "https://praeko.example"; process.env.PRAEKO_KEY = "arauto_" + "x".repeat(24); delete process.env.ARAUTO_CHAVE;
    const out = []; await runCli(["posts"], { log: (x) => out.push(String(x)), error: (x) => out.push(String(x)), ctxExtra: { praeko: client } });
    assert.ok(!out.some((l) => /missing the service address|missing the service key/.test(l)), out.join("\n"));
    const help = []; await runCli(["help"], { log: (x) => help.push(String(x)) });
    assert.match(help.join("\n"), /Praeko CLI/); assert.match(help.join("\n"), /PRAEKO_KEY/); void calls;
  } finally { for (const [k, v] of [["PRAEKO_SERVER", prev.s], ["PRAEKO_KEY", prev.k], ["ARAUTO_CHAVE", prev.c]]) v === undefined ? delete process.env[k] : (process.env[k] = v); }
});

test("key migrate: copies from the old Keychain to the new one (secrets double), without printing a secret", async () => {
  const dir = setup();
  const next = new Map(), old = new Map([["praeko/chave", "arauto_SEGREDO_DA_CHAVE_ANTIGA_123456"], ["youtube/token", "TOKEN-SECRETO-ANTIGO"]]);
  const secrets = { obterNovo: (r) => next.get(r) ?? null, obterAntigoGuardado: (r) => old.get(r) ?? null, obter: (r) => next.get(r) ?? old.get(r) ?? null, guardar: (r, v) => { next.set(r, v); return "keyiro"; } };
  const r = await run(["key", "migrate"], { segredos: secrets });
  assert.equal(r.code, 0, r.output);
  assert.match(r.output, /praeko\/chave: copied/); assert.match(r.output, /youtube\/token: copied/); assert.match(r.output, /2 item\(s\) copied/);
  assert.ok(!r.output.includes("SEGREDO_DA_CHAVE") && !r.output.includes("TOKEN-SECRETO"), "no value appears in the output");
  assert.equal(next.get("praeko/chave"), "arauto_SEGREDO_DA_CHAVE_ANTIGA_123456"); assert.equal(next.get("youtube/token"), "TOKEN-SECRETO-ANTIGO"); assert.equal(old.size, 2, "o old continua onde estava");
  const again = await run(["key", "migrate"], { segredos: secrets });
  assert.equal(again.code, 0); assert.match(again.output, /nothing to copy/); assert.match(again.output, /praeko\/chave: already in the new one/);
  assert.match((await run(["help"])).output, /key migrate/);
  rmSync(dir, { recursive: true, force: true });
});


test("usage and usage log through the service: English summary, filters become the contract query", async () => {
  const dir = setup(), calls = [];
  const a = fake({ usage: {
    get: (o) => { calls.push(["usage.get", o]); return { days: 7, total: 120, succeeded: 117, errors: 3, p95Ms: 412, peakPerMinute: 30, limitPerMinute: 300, byDay: [{ day: "2026-11-05", total: 120, errors: 3 }], byKey: [{ id: "k1", name: "CLI no Mac", total: 100, errors: 1, lastAt: "2026-11-05T12:00:00Z" }, { id: "session", name: "Painel", total: 20, errors: 2, lastAt: "2026-11-05T13:00:00Z" }] }; },
    log: (o) => { calls.push(["usage.log", o]); return { records: [{ id: "01", method: "GET", route: "/v1/posts/:id", status: 404, durationMs: 12, key: "k1", keyName: "CLI no Mac", createdAt: "2026-11-05T12:00:00Z" }], next: "01ZZ" }; },
  } });
  const r = await run(["usage", "--days", "7", ...base(dir)], { praeko: a });
  assert.equal(r.code, 0, r.output); assert.match(r.output, /calls 120 · success 97.5% · errors 3 · p95 412 ms · peak 30\/min \(limit 300\/min\)/); assert.match(r.output, /CLI no Mac\s+100 calls · 1 errors/);
  assert.deepEqual(calls[0], ["usage.get", { days: "7" }]);
  const l = await run(["usage", "log", "--key-id", "session", "--code", "4xx", "--route", "/v1/posts", "--method", "GET", "--limit", "5", ...base(dir)], { praeko: a });
  assert.equal(l.code, 0, l.output); assert.match(l.output, /GET\s+404\s+12 ms\s+\/v1\/posts\/:id/); assert.match(l.output, /--cursor 01ZZ/);
  assert.deepEqual(calls[1], ["usage.log", { key: "session", status: "4xx", route: "/v1/posts", method: "GET", days: undefined, limit: "5", cursor: undefined }]);
  assert.equal((await run(["usage", "nope", ...base(dir)], { praeko: a })).code, 1);
  rmSync(dir, { recursive: true, force: true });
});

test("webhook through the service: create shows the secret once; list, test, deliveries, pause, events and remove", async () => {
  const dir = setup(), ch = [], w = { id: "wh_1", url: "https://c.example/h", events: ["post.sent"], active: true };
  const d = { id: "whd_1", event: "ping.test", state: "delivered", attempts: 1, lastStatus: 200, createdAt: "2026-11-05T12:00:00Z" };
  const reg = (n, r) => (...x) => { ch.push([n, ...x]); return r; };
  const a = fake({ webhooks: { list: reg("list", { webhooks: [w], events: [] }), create: reg("create", { ...w, secret: "whsec_SEGREDO" }), test: reg("test", { delivery: d }), deliveries: reg("deliveries", { deliveries: [d] }), redeliver: reg("redeliver", { delivery: d }), update: reg("update", { ...w, active: false }), remove: reg("remove", { deleted: "wh_1" }), rotateSecret: reg("rotate", { secret: "whsec_NOVO" }) } });
  const r = (args) => run([...args, ...base(dir)], { praeko: a });
  const cr = await r(["webhook", "create", "--url", "https://c.example/h", "--events", "post.sent, post.failed"]);
  assert.equal(cr.code, 0, cr.output); assert.match(cr.output, /shown only now\): whsec_SEGREDO/); assert.deepEqual(ch.at(-1), ["create", { url: "https://c.example/h", events: ["post.sent", "post.failed"] }]);
  assert.match((await r(["webhook", "list"])).output, /wh_1\s+active\s+https:\/\/c\.example\/h\s+\[post\.sent\]/);
  const t = await r(["webhook", "test", "wh_1"]); assert.equal(t.code, 0); assert.match(t.output, /ping\.test\s+delivered\s+200/);
  assert.match((await r(["webhook", "deliveries", "wh_1"])).output, /whd_1/);
  assert.equal((await r(["webhook", "retry", "wh_1", "whd_1"])).code, 0); assert.deepEqual(ch.at(-1), ["redeliver", "wh_1", "whd_1"]);
  assert.match((await r(["webhook", "pause", "wh_1"])).output, /paused/); assert.deepEqual(ch.at(-1), ["update", "wh_1", { active: false }]);
  await r(["webhook", "events", "wh_1", "post.failed"]); assert.deepEqual(ch.at(-1), ["update", "wh_1", { events: ["post.failed"] }]);
  assert.match((await r(["webhook", "rotate-secret", "wh_1"])).output, /whsec_NOVO/);
  assert.match((await r(["webhook", "remove", "wh_1"])).output, /removed/);
  assert.equal((await r(["webhook", "create"])).code, 1); assert.equal((await r(["webhook", "test"])).code, 1); assert.equal((await r(["webhook", "nope", "a"])).code, 1);
  rmSync(dir, { recursive: true, force: true });
});

// ---- English only: no Portuguese aliases, help or messages ----
test("Portuguese commands and flags are gone: they are unknown (code 2, help) instead of aliases", async () => {
  const dir = setup();
  for (const cmd of ["postar", "agendar", "fila", "conta", "canais", "calendario", "vagas", "publicar-agora", "youtube-agendar", "adotar-buffer", "importar", "conteudo", "seguidores", "chave", "ajuda"]) {
    const r = await run([cmd, ...base(dir)]);
    assert.equal(r.code, 2, `${cmd} must not be a command`); assert.match(r.output, /Praeko CLI/);
  }
  assert.equal((await run(["help"])).code, 0);
  assert.equal((await run(["--ajuda"])).code, 2);
  // a Portuguese flag is just an unknown flag now: --quando does not set the time
  const pk = join(dir, "packages", "test-package");
  const r = await run(["post", pk, "--quando", "30/12 17:30", "--networks", "ig", ...base(dir)]);
  assert.match(r.output, /Instagram\s+now/, "--quando is ignored: Instagram goes now");
  rmSync(dir, { recursive: true, force: true });
});
test("the help is English: no Portuguese words and no 'Deprecated aliases' paragraph", async () => {
  const h = (await run(["help"])).output;
  assert.doesNotMatch(h, /Deprecated aliases|em português|in Portuguese/i);
  assert.doesNotMatch(h, /[áéíóúãõçâêô]/);
  for (const w of ["postar", "agendar", "calendario", "seguidores", "conteudo", "publicacao", "marca.json", "arauto.json"]) assert.ok(!h.includes(w), `help mentions ${w}`);
  assert.match(h, /publication\.json/); assert.match(h, /praeko\.json/);
});
test("errors and logs are English (missing config, missing package, missing server key)", async () => {
  const dir = setup();
  const noConfig = await run(["queue", "list", "--config", join(dir, "nope", "praeko.json")]);
  assert.equal(noConfig.code, 1); assert.match(noConfig.output, /^error: /m); assert.doesNotMatch(noConfig.output, /erro:|não|achei/);
  const noPackage = await run(["post", "does-not-exist", "--when", "30/12 17:30", ...base(dir)]);
  assert.equal(noPackage.code, 1); assert.match(noPackage.output, /package "does-not-exist" not found/);
  rmSync(dir, { recursive: true, force: true });
});
test("praeko.json and publication.json are English; only praeko.json is read as the project file; links.main is optional", async () => {
  const dir = setup(), pk = join(dir, "packages", "test-package");
  // no links at all: the package carries no tracked link and nothing fails
  const cfg = JSON.parse(readFileSync(join(dir, "praeko.json"), "utf8")); delete cfg.links;
  writeFileSync(join(dir, "praeko.json"), JSON.stringify(cfg));
  const r = await run(["post", pk, "--when", "30/12 17:30", "--networks", "yt", ...base(dir)]);
  assert.equal(r.code, 0, r.output);
  // legacy project files are not looked up any more
  const { acharConfig } = await import("@praeko/core");
  writeFileSync(join(dir, "marca.json"), JSON.stringify({ publicacao: { fusoOffset: "-03:00" } })); rmSync(join(dir, "praeko.json"));
  assert.equal(acharConfig(dir), null);
  rmSync(dir, { recursive: true, force: true });
});
test("PRAEKO_SECRETS picks the secrets file and PRAEKO_NO_KEYCHAIN skips the Keychain", async () => {
  const { segredos, arquivoSegredos, semChaveiro } = await import("@praeko/core");
  const dir = setup(); const file = join(dir, "custom-secrets.json"); const prev = process.env.PRAEKO_SECRETS;
  try {
    process.env.PRAEKO_SECRETS = file; assert.equal(arquivoSegredos(), file);
    assert.equal(semChaveiro({ PRAEKO_NO_KEYCHAIN: "1" } as any), true); assert.equal(semChaveiro({} as any), false);
    assert.equal(segredos.guardar("buffer/principal", "tok"), "arquivo"); assert.equal(JSON.parse(readFileSync(file, "utf8"))["buffer/principal"], "tok");
    delete process.env.PRAEKO_SECRETS;
    assert.match(arquivoSegredos(), /\.config\/praeko\/secrets\.json$/);
  } finally { if (prev === undefined) delete process.env.PRAEKO_SECRETS; else process.env.PRAEKO_SECRETS = prev; rmSync(dir, { recursive: true, force: true }); }
});

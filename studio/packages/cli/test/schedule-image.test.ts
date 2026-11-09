// praeko studio schedule --via praeko for an IMAGE piece: FAKE fetch, no real network call. The photo goes up as `type: image` and the post as `kind: "image"`.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { schedule } from "../src/schedule.ts";

const SLUG = "dica";
const WHEN = "2099-11-06T17:30";
const ALT = "Slide com o título da dica";
const jpeg = (w: number, h: number): Buffer => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0, 0x11, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]), Buffer.alloc(2000)]);

function project(publishing: any = {}, { size = [1080, 1350] as [number, number], images = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "praeko-studio-image-"));
  mkdirSync(join(root, "src")); writeFileSync(join(root, "src", "index.ts"), "");
  writeFileSync(join(root, "brand.json"), JSON.stringify({ publishing }));
  const ep = join(root, "episodes", SLUG); mkdirSync(ep, { recursive: true }); mkdirSync(join(root, "out"));
  writeFileSync(join(ep, "episode.yaml"), `format: image\nid: Dica\nslides:\n  - alt: "${ALT}"\n    items:\n      - { type: text, text: "x" }\n`);
  writeFileSync(join(ep, "publication.json"), JSON.stringify({ title: "Dica de PR", format: "image", kind: "image", ai: { synthetic: false }, ig: { caption: "Um PR, uma ideia." }, hashtags: { instagram: ["#dev"] }, images: images ? [{ file: `out/${SLUG}-slide-01.jpg`, alt: ALT }] : [] }));
  writeFileSync(join(root, "out", `${SLUG}-slide-01.jpg`), jpeg(...size));
  return root;
}
type Call = { method: string; path: string; body: any; headers: any };
async function run(root: string, args: string[], routes?: (c: Call) => any) {
  const calls: Call[] = [], out: string[] = [], cwd = process.cwd(), log = console.log;
  const fetchFn = async (url: any, init: any) => {
    const u = new URL(url), c: Call = { method: init.method, path: u.pathname, body: init.body, headers: init.headers };
    calls.push(c);
    const r = (await routes?.(c)) ?? { body: {} }, status = r.status ?? 200;
    return { ok: status < 400, status, text: async () => JSON.stringify(r.body ?? {}) } as any;
  };
  process.chdir(root); console.log = (...x: any[]) => out.push(x.join(" "));
  let code: number | undefined, error: any;
  try { code = await schedule(args, { fetchFn, wait: async () => {}, getKey: (ref) => (ref === "praeko/main" ? "praeko_TEST" : null), storeKey: () => { throw new Error("should not store"); } }); }
  catch (e) { error = e; }
  finally { process.chdir(cwd); console.log = log; }
  return { calls, text: out.join("\n"), code, error };
}
const ok = (warnings: any[] = []) => (c: Call) => {
  if (c.method === "POST" && c.path === "/v1/media") return { body: { id: "m1", state: "uploading" } };
  if (c.method === "PUT" && c.path.endsWith("/content")) return { body: { state: "ready" } };
  if (c.method === "POST" && c.path === "/v1/posts") { const b = JSON.parse(c.body); return { status: 201, body: { id: b.id, items: [{ id: "it1", network: "instagram", state: "scheduled", scheduledFor: "2099-11-06T20:30:00.000Z", ...(warnings.length ? { warnings } : {}) }] } }; }
  return { status: 404, body: { error: { code: "route_not_found", message: "route?" } } };
};

test("simulation: shows the image, the Instagram time and the alt-text warning for Buffer; sends nothing, no network", async () => {
  const root = project();
  const r = await run(root, [SLUG, "--via", "praeko", "--when", WHEN]);
  assert.equal(r.error, undefined); assert.equal(r.code, 0); assert.equal(r.calls.length, 0);
  assert.match(r.text, /SIMULATION ON PRAEKO .*Dica de PR \(image post\)/); assert.match(r.text, /image: episodes\/.*\n|image: out\/dica-slide-01\.jpg \(1080x1350/);
  assert.match(r.text, /Instagram .* via buffer/); assert.match(r.text, /alt text is ignored when Instagram goes through Buffer/);
  const meta = await run(project({ praeko: { instagram: { via: "meta" } } }), [SLUG, "--via", "praeko", "--when", WHEN]);
  assert.doesNotMatch(meta.text, /alt text is ignored/); assert.match(meta.text, /via meta/);
});
test("--send: uploads the JPEG as type image, then posts kind image with media.images [{ media, alt }] and ONE Instagram item; saves schedule.json; prints the item warnings", async () => {
  const root = project();
  const r = await run(root, [SLUG, "--via", "praeko", "--when", WHEN, "--send"], ok([{ code: "alt_ignored", message: "alt text is not applied when publishing through Buffer" }]));
  assert.equal(r.error, undefined, r.error?.message); assert.equal(r.code, 0);
  const media = r.calls.find((c) => c.method === "POST" && c.path === "/v1/media")!, post = r.calls.find((c) => c.path === "/v1/posts")!;
  assert.deepEqual(JSON.parse(media.body), { type: "image", name: "dica-slide-01.jpg", mime: "image/jpeg", size: 2041, simple: true });
  const b = JSON.parse(post.body);
  assert.deepEqual([b.kind, b.id, b.title, b.media, b.texts], ["image", SLUG, "Dica de PR", { images: [{ media: "m1", alt: ALT }] }, { instagram: { text: "Um PR, uma ideia. #dev" } }]);
  assert.equal(b.items.length, 1); assert.deepEqual([b.items[0].network, b.items[0].via, b.items[0].scheduledFor], ["instagram", "buffer", "2099-11-06T17:30:00-03:00"]);
  assert.equal(b.media.video, undefined); assert.equal(b.options, undefined);
  assert.ok(!r.calls.some((c) => c.method === "POST" && c.path === "/v1/media" && JSON.parse(c.body).type !== "image"), "no video or cover upload");
  assert.match(r.text, /alt_ignored: alt text is not applied/);
  const saved = JSON.parse(readFileSync(join(root, "episodes", SLUG, "schedule.json"), "utf8"));
  assert.deepEqual([saved.provider, saved.kind, saved.postId, saved.posts.length], ["praeko", "image", SLUG, 1]);
  assert.ok(!JSON.stringify(r.calls.map((c) => c.body ?? "")).includes("praeko_TEST"), "the key is never in a body");
});
test("--send: a server error removes the uploaded media (no orphan) and writes no schedule", async () => {
  const root = project();
  const r = await run(root, [SLUG, "--via", "praeko", "--when", WHEN, "--send"], (c) => c.path === "/v1/posts" ? { status: 422, body: { error: { code: "image_aspect_ratio", message: "ratio" } } } : ok()(c));
  assert.match(r.error.message, /image proportion is outside 4:5 to 1\.91:1/);
  assert.ok(r.calls.some((c) => c.method === "DELETE" && c.path === "/v1/media/m1"));
  assert.ok(!existsSync(join(root, "episodes", SLUG, "schedule.json")));
});
test("refuses before any request: other networks, a wrong-size JPEG, no image listed and a time that is too close", async () => {
  const root = project();
  assert.match((await run(root, [SLUG, "--via", "praeko", "--networks", "ig,tt", "--when", WHEN])).error.message, /TikTok: image and carousel posts go only to Instagram/);
  assert.match((await run(root, [SLUG, "--via", "praeko"])).error.message, /missing the time for Instagram/);
  assert.match((await run(root, [SLUG, "--via", "praeko", "--when", "2000-01-01T10:00"])).error.message, /less than 5 minutes/);
  assert.match((await run(project({}, { size: [1080, 1080] }), [SLUG, "--via", "praeko", "--when", WHEN, "--send"])).error.message, /fix the image first/);
  assert.match((await run(project({}, { images: false }), [SLUG, "--via", "praeko", "--when", WHEN])).error.message, /no image in publication\.json/);
});

// ---------------------------------------------------------------------------------------------------------------- carousel
function carouselProject(n: number, publishing: any = {}, { bad = 0 } = {}) {
  const root = mkdtempSync(join(tmpdir(), "praeko-studio-carousel-"));
  mkdirSync(join(root, "src")); writeFileSync(join(root, "src", "index.ts"), "");
  writeFileSync(join(root, "brand.json"), JSON.stringify({ publishing }));
  const ep = join(root, "episodes", SLUG); mkdirSync(ep, { recursive: true }); mkdirSync(join(root, "out"));
  writeFileSync(join(ep, "episode.yaml"), "format: carousel\nid: Dica\nslides: []\n");
  const images = Array.from({ length: n }, (_, i) => ({ file: `out/${SLUG}-slide-${String(i + 1).padStart(2, "0")}.jpg`, alt: `Slide ${i + 1}: ${ALT}` }));
  writeFileSync(join(ep, "publication.json"), JSON.stringify({ title: "Dicas de PR", format: "carousel", kind: "carousel", ai: { synthetic: false }, ig: { caption: "Três dicas." }, hashtags: { instagram: ["#dev"] }, images }));
  images.forEach((im, i) => writeFileSync(join(root, im.file), i + 1 === bad ? jpeg(1080, 1080) : jpeg(1080, 1350)));
  return root;
}
const okMany = () => { let k = 0; return (c: Call) => {
  if (c.method === "POST" && c.path === "/v1/media") return { body: { id: `m${++k}`, state: "uploading" } };
  if (c.method === "PUT" && c.path.endsWith("/content")) return { body: { state: "ready" } };
  if (c.method === "POST" && c.path === "/v1/posts") { const b = JSON.parse(c.body); return { status: 201, body: { id: b.id, items: [{ id: "it1", network: "instagram", state: "scheduled", scheduledFor: "2099-11-06T20:30:00.000Z", warnings: [{ code: "buffer_carousel_unverified", message: "not tested live" }] }] } }; }
  return { status: 404, body: { error: { code: "route_not_found", message: "route?" } } };
}; };
test("carousel simulation: lists every slide and the not-tested-live note for Buffer; sends nothing", async () => {
  const r = await run(carouselProject(3), [SLUG, "--via", "praeko", "--when", WHEN]);
  assert.equal(r.error, undefined); assert.equal(r.code, 0); assert.equal(r.calls.length, 0);
  assert.match(r.text, /Dicas de PR \(carousel, 3 slides\)/); assert.match(r.text, /slide 1: out\/dica-slide-01\.jpg \(1080x1350/); assert.match(r.text, /slide 3: out\/dica-slide-03\.jpg/);
  assert.match(r.text, /a carousel through Buffer was NOT tested live/); assert.match(r.text, /alt text is ignored when Instagram goes through Buffer/);
  assert.match(r.text, /The 3 slides go straight to .*media type image ×3/);
  const meta = await run(carouselProject(3, { praeko: { instagram: { via: "meta" } } }), [SLUG, "--via", "praeko", "--when", WHEN]);
  assert.doesNotMatch(meta.text, /NOT tested live/);
});
test("carousel --send: uploads the N JPEGs ONE BY ONE in slide order as type image, then ONE post kind carousel with media.images in that order; saves schedule.json", async () => {
  const root = carouselProject(4);
  const r = await run(root, [SLUG, "--via", "praeko", "--when", WHEN, "--send"], okMany());
  assert.equal(r.error, undefined, r.error?.message); assert.equal(r.code, 0);
  const uploads = r.calls.filter((c) => c.method === "POST" && c.path === "/v1/media").map((c) => JSON.parse(c.body));
  assert.deepEqual(uploads.map((u) => [u.type, u.name]), [1, 2, 3, 4].map((n) => ["image", `dica-slide-0${n}.jpg`]));
  const posts = r.calls.filter((c) => c.path === "/v1/posts"); assert.equal(posts.length, 1);
  const b = JSON.parse(posts[0]!.body);
  assert.equal(b.kind, "carousel"); assert.deepEqual(b.media, { images: [1, 2, 3, 4].map((n) => ({ media: `m${n}`, alt: `Slide ${n}: ${ALT}` })) });
  assert.equal(b.items.length, 1); assert.equal(b.items[0].network, "instagram"); assert.equal(b.media.video, undefined);
  assert.match(r.text, /uploading slide 3 of 4/); assert.match(r.text, /buffer_carousel_unverified: not tested live/);
  const saved = JSON.parse(readFileSync(join(root, "episodes", SLUG, "schedule.json"), "utf8"));
  assert.deepEqual([saved.kind, saved.postId], ["carousel", SLUG]);
});
test("carousel --send: a server error removes ALL the uploaded media; a bad slide, one slide, 21 slides or other networks are refused before any request", async () => {
  const root = carouselProject(3);
  const h = okMany();
  const r = await run(root, [SLUG, "--via", "praeko", "--when", WHEN, "--send"], (c) => c.path === "/v1/posts" ? { status: 422, body: { error: { code: "carousel_too_many_images", message: "x" } } } : h(c));
  assert.match(r.error.message, /a carousel takes at most 20 slides/);
  assert.deepEqual(r.calls.filter((c) => c.method === "DELETE").map((c) => c.path).sort(), ["/v1/media/m1", "/v1/media/m2", "/v1/media/m3"]);
  assert.ok(!existsSync(join(root, "episodes", SLUG, "schedule.json")));
  const bad = await run(carouselProject(3, {}, { bad: 2 }), [SLUG, "--via", "praeko", "--when", WHEN, "--send"], okMany());
  assert.match(bad.error.message, /fix the slides first/); assert.match(bad.text + "", /./); assert.equal(bad.calls.length, 0);
  for (const n of [1, 21]) { const x = await run(carouselProject(n), [SLUG, "--via", "praeko", "--when", WHEN]); assert.equal(x.code, 1); assert.match(x.text, new RegExp(`${n} images: a carousel takes 2 to 20`)); assert.equal(x.calls.length, 0); }
  assert.match((await run(carouselProject(3), [SLUG, "--via", "praeko", "--networks", "yt", "--when", WHEN])).error.message, /YouTube: image and carousel posts go only to Instagram/);
});

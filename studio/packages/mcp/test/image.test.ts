// Image pieces through the local MCP: new episode (--image), render = slides, cover refused, package, and studio_upload as type image. Fake CLI, fake Praeko on localhost: no real service, no key.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FAKE_BIN, FAKE_PRAEKO, connect, fakePraeko, fakeProject, noSecret } from "./helpers.ts";

const jpeg = (size: number): Buffer => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size - 4, 5)]);
/** A project with `quick` as an image piece (episode.yaml with format image) and, optionally, its rendered slide. */
function imageProject({ rendered = true, size = 4096 } = {}): string {
  const dir = fakeProject();
  writeFileSync(join(dir, "episodes", "quick", "episode.yaml"), 'format: image\nid: Quick\nslides:\n  - alt: "Slide"\n    items:\n      - { type: text, text: "x" }\n');
  mkdirSync(join(dir, "out"), { recursive: true });
  if (rendered) writeFileSync(join(dir, "out", "quick-slide-01.jpg"), jpeg(size));
  return dir;
}
const waitDone = async (c: Awaited<ReturnType<typeof connect>>, jobId: string) => (await c.call("studio_job", { jobId, waitSeconds: 20 })).body;

test("studio_render on an image piece runs `slides` (not render), lists the JPEG as an artifact; scale and hyperframes are refused", async () => {
  const c = await connect({ project: imageProject(), studioBin: FAKE_BIN });
  try {
    const r = await c.call("studio_render", { slug: "quick" });
    assert.ok(!r.isError, r.text);
    const done = await waitDone(c, r.body.jobId);
    assert.equal(done.state, "succeeded"); assert.match(done.log.text, /fake slides quick/); assert.doesNotMatch(done.log.text, /fake render/);
    assert.deepEqual(done.artifacts, ["out/quick-slide-01.jpg"]);
    const s = await c.call("studio_render", { slug: "quick", scale: 0.5 });
    assert.ok(s.isError); assert.match(s.body.error, /scale does not apply to an image piece/);
    const h = await c.call("studio_render", { slug: "quick", engine: "hyperframes" });
    assert.ok(h.isError); assert.match(h.body.error, /render only with Remotion/);
    const cv = await c.call("studio_cover", { slug: "quick" });
    assert.ok(cv.isError); assert.match(cv.body.error, /image piece or carousel has no cover/);
    // a video episode is untouched: still `render`
    const v = await c.call("studio_render", { slug: "other" });
    assert.ok(!v.isError); assert.match((await waitDone(c, v.body.jobId)).log.text, /fake render other/);
  } finally { await c.close(); }
});
test("studio_package runs package for an image piece (it does not publish anything)", async () => {
  const c = await connect({ project: imageProject(), studioBin: FAKE_BIN });
  try {
    const r = await c.call("studio_package", { slug: "quick" });
    assert.ok(!r.isError, r.text); assert.match((await waitDone(c, r.body.jobId)).log.text, /fake package quick/);
  } finally { await c.close(); }
});
test("studio_upload on an image piece: two steps, ONE file (the JPEG) as type image, only media ids come back, and the next step names kind image and media.images", async () => {
  const api = await fakePraeko("write");
  const c = await connect({ project: imageProject(), studioBin: FAKE_BIN, praeko: { url: api.url, wait: async () => {} } });
  try {
    const p = await c.call("studio_upload", { slug: "quick" });
    assert.ok(!p.isError, p.text);
    assert.deepEqual(p.body.files.map((f: any) => [f.role, f.path, f.bytes, f.mime]), [["image", "out/quick-slide-01.jpg", 4096, "image/jpeg"]]);
    assert.equal(p.body.note, undefined, "no 'no cover' note for an image");
    assert.equal(api.requests.length, 0, "the preview made no request");
    const r = await c.call("studio_upload", { slug: "quick", confirm: p.body.confirmation_code });
    assert.ok(!r.isError, r.text);
    assert.deepEqual(r.body.uploaded.map((u: any) => [u.role, u.type, u.bytes, u.state]), [["image", "image", 4096, "ready"]]);
    assert.match(r.body.next, /kind "image" and media\.images/); assert.match(r.body.next, /Nothing was published/);
    assert.deepEqual([...new Set(api.requests.map((q) => q.path.replace(/med_\d+/, "ID")))].sort(), ["/v1/media", "/v1/media/ID/content"], "only the media library: no post");
    assert.ok(api.requests.every((q) => q.auth === `Bearer ${FAKE_PRAEKO}`));
    for (const t of [p, r]) noSecret("image upload", t.text);
  } finally { await c.close(); await api.close(); }
});
test("studio_upload on an image piece: not rendered yet and over 8 MB are clear refusals before any request", async () => {
  const api = await fakePraeko("write");
  const a = await connect({ project: imageProject({ rendered: false }), studioBin: FAKE_BIN, praeko: { url: api.url, wait: async () => {} } });
  const b = await connect({ project: imageProject({ size: 8 * 1024 * 1024 + 1 }), studioBin: FAKE_BIN, praeko: { url: api.url, wait: async () => {} } });
  try {
    const x = await a.call("studio_upload", { slug: "quick" });
    assert.ok(x.isError); assert.match(x.body.error, /out\/quick-slide-01\.jpg does not exist: render the image piece first/);
    const y = await b.call("studio_upload", { slug: "quick" });
    assert.ok(y.isError); assert.match(y.body.error, /over 8 MB/);
    assert.equal(api.requests.length, 0);
  } finally { await a.close(); await b.close(); await api.close(); }
});
test("studio_new_episode with format image passes --image to the CLI and the tool list is still the same 15 with no publishing", async () => {
  const c = await connect({ project: fakeProject(), studioBin: FAKE_BIN });
  try {
    const list = (await c.client.listTools()).tools;
    assert.equal(list.length, 15);
    assert.ok(!list.some((t) => /post|schedule|queue|publish|account/i.test(t.name)), "no tool publishes");
    const fmt = (list.find((t) => t.name === "studio_new_episode")!.inputSchema as any).properties.format.enum;
    assert.deepEqual(fmt, ["short", "long", "image", "carousel"]);
    const n = await c.call("studio_new_episode", { slug: "foto", format: "image" });
    assert.match(n.body.output.text, /fake new foto/);
  } finally { await c.close(); }
});

// ---------------------------------------------------------------------------------------------------------------- carousel
/** A project whose `quick` is a carousel of `slides` slides, with `rendered` of the JPEGs on disk (the first ones). */
function carouselProject(o: { slides?: number; rendered?: number; size?: number; sizes?: number[] } = {}): string {
  const slides = o.slides ?? 3, rendered = o.rendered ?? slides, size = o.size ?? 4096, sizes = o.sizes ?? [];
  const dir = fakeProject();
  const y = `format: carousel\nid: Quick\nslides:\n${Array.from({ length: slides }, (_, i) => `  - alt: "Slide ${i + 1}"\n    items:\n      - { type: text, text: "x" }\n`).join("")}`;
  writeFileSync(join(dir, "episodes", "quick", "episode.yaml"), y);
  mkdirSync(join(dir, "out"), { recursive: true });
  for (let i = 0; i < rendered; i++) writeFileSync(join(dir, "out", `quick-slide-${String(i + 1).padStart(2, "0")}.jpg`), jpeg(sizes[i] ?? size));
  return dir;
}
test("studio_render on a carousel runs `slides` and lists every JPEG as an artifact; the new_episode carousel format passes --carousel", async () => {
  const c = await connect({ project: carouselProject({ slides: 3 }), studioBin: FAKE_BIN });
  try {
    const r = await c.call("studio_render", { slug: "quick" });
    assert.ok(!r.isError, r.text);
    const done = await waitDone(c, r.body.jobId);
    assert.equal(done.state, "succeeded"); assert.match(done.log.text, /fake slides quick/);
    assert.deepEqual(done.artifacts, ["out/quick-slide-01.jpg", "out/quick-slide-02.jpg", "out/quick-slide-03.jpg"]);
    assert.ok((await c.call("studio_cover", { slug: "quick" })).isError);
    const n = await c.call("studio_new_episode", { slug: "dicas", format: "carousel" });
    assert.match(n.body.output.text, /fake new dicas[\s\S]*flag --carousel/);
  } finally { await c.close(); }
});
test("studio_upload on a carousel: the preview lists ALL the slide files with their sizes; the upload goes one by one IN ORDER as type image and returns the mediaIds in slide order", async () => {
  const api = await fakePraeko("write");
  const c = await connect({ project: carouselProject({ slides: 4, sizes: [1000, 2000, 3000, 4000] }), studioBin: FAKE_BIN, praeko: { url: api.url, wait: async () => {} } });
  try {
    const p = await c.call("studio_upload", { slug: "quick" });
    assert.ok(!p.isError, p.text);
    assert.deepEqual(p.body.files.map((f: any) => [f.slide, f.role, f.path, f.bytes]), [1, 2, 3, 4].map((n) => [n, "image", `out/quick-slide-0${n}.jpg`, n * 1000]));
    assert.equal(p.body.totalBytes, 10000); assert.equal(api.requests.length, 0, "the preview made no request");
    const r = await c.call("studio_upload", { slug: "quick", confirm: p.body.confirmation_code });
    assert.ok(!r.isError, r.text);
    assert.deepEqual(r.body.uploaded.map((u: any) => [u.slide, u.type, u.bytes, u.state]), [1, 2, 3, 4].map((n) => [n, "image", n * 1000, "ready"]));
    assert.deepEqual(r.body.mediaIds, ["med_0001", "med_0002", "med_0003", "med_0004"], "ids in slide order");
    assert.match(r.body.next, /kind "carousel" and media\.images/); assert.match(r.body.next, /IN THE ORDER/); assert.match(r.body.next, /Nothing was published/);
    const uploads = api.requests.filter((q) => q.method === "POST" && q.path === "/v1/media"); assert.equal(uploads.length, 4);
    assert.deepEqual([...new Set(api.requests.map((q) => q.path.replace(/med_\d+/, "ID")))].sort(), ["/v1/media", "/v1/media/ID/content"], "only the media library: no post");
    for (const t of [p, r]) noSecret("carousel upload", t.text);
  } finally { await c.close(); await api.close(); }
});
test("studio_upload on a carousel: a missing slide is named, one over 8 MB is named, the total cap and a bad slide count are refused before any request", async () => {
  const api = await fakePraeko("write");
  const ctl = (project: string) => connect({ project, studioBin: FAKE_BIN, praeko: { url: api.url, wait: async () => {} } });
  const a = await ctl(carouselProject({ slides: 3, rendered: 2 })), b = await ctl(carouselProject({ slides: 3, sizes: [100, 8 * 1024 * 1024 + 1, 100] })), d = await ctl(carouselProject({ slides: 1 })), e = await ctl(carouselProject({ slides: 21, size: 100 }));
  const f = await ctl(carouselProject({ slides: 20, size: 6 * 1024 * 1024 }));
  try {
    const x = await a.call("studio_upload", { slug: "quick" });
    assert.ok(x.isError); assert.match(x.body.error, /out\/quick-slide-03\.jpg does not exist: render the carousel first/);
    const y = await b.call("studio_upload", { slug: "quick" });
    assert.ok(y.isError); assert.match(y.body.error, /slide 2 is over 8 MB/);
    assert.match((await d.call("studio_upload", { slug: "quick" })).body.error, /1 slide\(s\): a carousel takes 2 to 20/);
    assert.match((await e.call("studio_upload", { slug: "quick" })).body.error, /21 slide\(s\): a carousel takes 2 to 20/);
    const z = await f.call("studio_upload", { slug: "quick" });
    assert.ok(z.isError); assert.match(z.body.error, /add up to 120\.0 MB, over the 100\.0 MB limit/);
    assert.equal(api.requests.length, 0);
  } finally { for (const c of [a, b, d, e, f]) await c.close(); await api.close(); }
});
test("studio_upload on a carousel: a failure on slide 3 says how many went up and keeps their ids", async () => {
  const api = await fakePraeko("write");
  api.failMediaAt = 3;
  const c = await connect({ project: carouselProject({ slides: 4 }), studioBin: FAKE_BIN, praeko: { url: api.url, wait: async () => {} } });
  try {
    const p = await c.call("studio_upload", { slug: "quick" });
    const r = await c.call("studio_upload", { slug: "quick", confirm: p.body.confirmation_code });
    assert.ok(r.isError);
    assert.match(r.body.error, /after 2 of 4 slides went up \(mediaId med_0001, med_0002; they stay in the library\) \(failed on slide 3\)/);
    assert.deepEqual(r.body.uploaded.map((u: any) => u.slide), [1, 2]);
  } finally { await c.close(); await api.close(); }
});

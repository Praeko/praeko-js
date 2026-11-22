import test from "node:test";
import assert from "node:assert/strict";
import { parseWhen, textsByNetwork } from "../src/index.ts";
import type { Brand, Publication } from "../src/index.ts";
import { hostingConfig, objectKey, upload } from "../src/hosting.ts";
import { argsFfmpeg, sameAspect } from "../src/cover-frame.ts";

const brand: Brand = { links: { main: "https://example.com/" }, publishing: {} };
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
test("textsByNetwork of a long video includes the chapters", () => {
  const t = textsByNetwork({ brand, publication: { ...publication, format: "long", chapters: [{ t: 0, title: "A" }, { t: 20, title: "B" }, { t: 40, title: "C" }] } });
  assert.ok(t.youtube.text.includes("0:00 A") && t.youtube.text.includes("0:40 C"));
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

// Image pieces in the publishing package: validation, texts.md and the body of POST /v1/posts (kind image).
import test from "node:test";
import assert from "node:assert/strict";
import { ALT_MAX, buildPackage, isCarousel, isImage, praeko, validate } from "../src/index.ts";
import type { Brand, Publication } from "../src/index.ts";

const brand: Brand = { name: "Canal", handle: "@canal", publishing: { hashtags: { allowed: [], banned: ["#spam"] }, praeko: { instagram: { via: "meta" }, channels: { instagram: "IG-1" } } } };
const pub = (extra: Partial<Publication> = {}): Publication => ({ title: "Dica de PR", format: "image", kind: "image", ai: { synthetic: false }, ig: { caption: "Um PR, uma ideia.", pinnedComment: "Veja também" }, hashtags: { instagram: ["#dev"] }, images: [{ file: "out/dica-slide-01.jpg", alt: "Slide com o título" }], ...extra });

test("isImage: kind or format image or carousel; isCarousel only for carousel", () => {
  assert.equal(isImage({ kind: "image" }), true); assert.equal(isImage({ format: "image" }), true);
  assert.equal(isImage({ kind: "carousel" }), true); assert.equal(isImage({ format: "carousel" }), true);
  assert.equal(isCarousel({ kind: "carousel" }), true); assert.equal(isCarousel({ kind: "image" }), false);
  assert.equal(isImage({ format: "short" }), false); assert.equal(isImage({}), false);
});
test("validate (image): only Instagram matters: caption, hashtags and alt; no YouTube title, chapters or TikTok checks", () => {
  assert.deepEqual(validate({ brand, publication: pub() }), { errors: [], warnings: [] });
  const longTitle = validate({ brand, publication: pub({ title: "t".repeat(300) }) });
  assert.deepEqual(longTitle.errors, [], "the YouTube title limit does not apply");
  assert.match(validate({ brand, publication: pub({ ig: { caption: "" }, hashtags: {} }) }).errors[0]!, /Instagram caption is empty/);
  assert.match(validate({ brand, publication: pub({ ig: { caption: "x".repeat(2300) } }) }).errors[0]!, /Instagram caption has 2305 characters \(limit 2200\)/);
  assert.match(validate({ brand, publication: pub({ hashtags: { instagram: Array.from({ length: 31 }, (_, i) => `#t${i}`) } }) }).errors.join("|"), /more than 30 hashtags/);
  assert.match(validate({ brand, publication: pub({ hashtags: { instagram: ["#spam"] } }) }).errors[0]!, /banned hashtag/);
});
test("validate (image): alt is required and limited; one image only (several need format carousel); no image yet is a warning; AI disclosure is still asked", () => {
  assert.match(validate({ brand, publication: pub({ images: [{ file: "a.jpg" }] }) }).errors[0]!, /image 1: alt text is required/);
  assert.match(validate({ brand, publication: pub({ images: [{ file: "a.jpg", alt: "   " }] }) }).errors[0]!, /alt text is required/);
  assert.match(validate({ brand, publication: pub({ images: [{ file: "a.jpg", alt: "x".repeat(ALT_MAX + 1) }] }) }).errors[0]!, /alt text has 1001 characters \(limit 1000\)/);
  assert.deepEqual(validate({ brand, publication: pub({ images: [{ file: "a.jpg", alt: "x".repeat(ALT_MAX) }] }) }).errors, []);
  assert.match(validate({ brand, publication: pub({ images: [{ file: "a.jpg", alt: "a" }, { file: "b.jpg", alt: "b" }] }) }).errors[0]!, /an image post takes exactly one image \(use `format: carousel` for 2 to 20\)/);
  const none = validate({ brand, publication: pub({ images: [] }) });
  assert.deepEqual(none.errors, []); assert.match(none.warnings[0]!, /no image listed/);
  assert.match(validate({ brand, publication: pub({ ai: undefined }) }).warnings.join("|"), /AI disclosure missing/);
});
test("buildPackage (image): caption with hashtags, the alt text and the note about YouTube/TikTok; no video sections", () => {
  const md = buildPackage({ brand, publication: pub() });
  assert.match(md, /^# Dica de PR \(image post, publishing package\)/);
  assert.match(md, /Image: `out\/dica-slide-01\.jpg`/);
  assert.match(md, /## Instagram \(photo\): caption\n```\nUm PR, uma ideia\. #dev\n```/);
  assert.match(md, /\*\*Comment to pin:\*\*\n```\nVeja também/);
  assert.match(md, /## Alt text \(accessibility\)\n1\. Slide com o título/);
  assert.match(md, /YouTube and TikTok do not take image posts yet/);
  assert.doesNotMatch(md, /## TikTok|YouTube Shorts|Reels\)/);
  assert.match(buildPackage({ brand, publication: pub({ images: [{ file: "a.jpg" }] }) }), /ERROR: image 1: alt text is required/);
});
test("buildImagePost: kind image, media.images [{ media, alt }], ONE Instagram item with via and the pinned channel; no video, no cover, no options", () => {
  const body = praeko.buildImagePost({ brand, publication: pub(), id: "dica", images: [{ media: "m1", alt: "Slide com o título" }], when: { instagram: "2026-11-10T20:30:00.000Z" } });
  assert.deepEqual(body, {
    id: "dica", kind: "image", title: "Dica de PR",
    media: { images: [{ media: "m1", alt: "Slide com o título" }] },
    texts: { instagram: { text: "Um PR, uma ideia. #dev", pinnedComment: "Veja também" } },
    items: [{ network: "instagram", scheduledFor: "2026-11-10T17:30:00-03:00", via: "meta", channel: "IG-1" }],
  });
  const buf = praeko.buildImagePost({ brand: { ...brand, publishing: {} }, publication: pub({ ig: { caption: "x" }, hashtags: {} }), id: "d", images: [{ media: "m1" }], when: { instagram: "2026-11-10T20:30:00.000Z" } });
  assert.equal(buf.items[0].via, "buffer"); assert.equal(buf.items[0].channel, undefined); assert.deepEqual(buf.media.images, [{ media: "m1" }], "no alt key when there is none");
});
test("buildImagePost refuses other networks, zero or several images and a missing time", () => {
  const base = { brand, publication: pub(), id: "d", images: [{ media: "m1" }], when: { instagram: "2026-11-10T20:30:00.000Z" } };
  assert.throws(() => praeko.buildImagePost({ ...base, networks: ["instagram", "tiktok"] }), /only to Instagram for now/);
  assert.throws(() => praeko.buildImagePost({ ...base, networks: ["youtube"] }), /only to Instagram for now/);
  assert.throws(() => praeko.buildImagePost({ ...base, images: [] }), /1 image or 2 to 20 slides \(0 given\)/);
  assert.throws(() => praeko.buildImagePost({ ...base, images: Array.from({ length: 21 }, () => ({ media: "a" })) }), /1 image or 2 to 20 slides \(21 given\)/);
  assert.throws(() => praeko.buildImagePost({ ...base, publication: pub({ kind: "carousel", format: "carousel" }) }), /a carousel takes at least 2 slides/);
  assert.throws(() => praeko.buildImagePost({ ...base, when: {} }), /no time set for instagram/);
});
test("error hints name the new server codes with an actionable sentence", () => {
  for (const code of ["invalid_image", "image_too_large", "image_aspect_ratio", "kind_not_supported_by_network", "carousel_not_supported", "carousel_too_many_images", "carousel_too_few_images"]) assert.match(praeko.errorMessageFor(422, code, "server text"), new RegExp(`\\[${code}\\]`));
  assert.match(praeko.errorMessageFor(422, "image_aspect_ratio", "x"), /4:5 to 1\.91:1/);
});

const cpub = (n: number, extra: Partial<Publication> = {}): Publication => pub({ format: "carousel", kind: "carousel", images: Array.from({ length: n }, (_, i) => ({ file: `out/dica-slide-${String(i + 1).padStart(2, "0")}.jpg`, alt: `Slide ${i + 1}: texto` })), ...extra });
test("validate (carousel): 2 to 20 slides; alt per slide with its number; no images yet is a warning", () => {
  assert.deepEqual(validate({ brand, publication: cpub(3) }), { errors: [], warnings: [] });
  assert.deepEqual(validate({ brand, publication: cpub(20) }).errors, []);
  assert.match(validate({ brand, publication: cpub(1) }).errors[0]!, /1 images: a carousel takes 2 to 20/);
  assert.match(validate({ brand, publication: cpub(21) }).errors[0]!, /21 images: a carousel takes 2 to 20/);
  const semAlt = cpub(3); semAlt.images![1] = { file: "b.jpg" };
  assert.match(validate({ brand, publication: semAlt }).errors[0]!, /slide 2: alt text is required/);
  const longo = cpub(3); longo.images![2] = { file: "c.jpg", alt: "x".repeat(ALT_MAX + 1) };
  assert.match(validate({ brand, publication: longo }).errors[0]!, /slide 3: alt text has 1001 characters/);
  const nenhuma = validate({ brand, publication: cpub(0) }); assert.deepEqual(nenhuma.errors, []); assert.match(nenhuma.warnings[0]!, /no image listed/);
});
test("buildPackage (carousel): slides in order, the caption and the alt text of every slide", () => {
  const md = buildPackage({ brand, publication: cpub(3) });
  assert.match(md, /^# Dica de PR \(carousel, publishing package\)/);
  assert.match(md, /Slides, in order: `out\/dica-slide-01\.jpg`, `out\/dica-slide-02\.jpg`, `out\/dica-slide-03\.jpg`/);
  assert.match(md, /## Instagram \(carousel\): caption/);
  assert.match(md, /## Alt text \(accessibility\)\nSlide 1\. Slide 1: texto\nSlide 2\. Slide 2: texto\nSlide 3\. Slide 3: texto/);
  assert.match(md, /YouTube and TikTok do not take carousel posts yet/);
});
test("buildImagePost (carousel): kind carousel and media.images in the order given, one alt each", () => {
  const body = praeko.buildImagePost({ brand, publication: cpub(3), id: "dica", images: [{ media: "m3", alt: "c" }, { media: "m1", alt: "a" }, { media: "m2" }], when: { instagram: "2026-11-10T20:30:00.000Z" } });
  assert.equal(body.kind, "carousel"); assert.deepEqual(body.media, { images: [{ media: "m3", alt: "c" }, { media: "m1", alt: "a" }, { media: "m2" }] });
  assert.equal(body.items.length, 1); assert.equal(body.items[0].network, "instagram");
  assert.throws(() => praeko.buildImagePost({ brand, publication: cpub(3), id: "d", images: [{ media: "a" }, { media: "b" }], networks: ["tiktok"], when: { instagram: "2026-11-10T20:30:00.000Z" } }), /only to Instagram for now/);
});

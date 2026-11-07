import test from "node:test";
import assert from "node:assert/strict";
import { buildPackage, destinationLink, formatChapters, link, mmss, validate, validateChapters } from "../src/index.ts";
import type { Brand, Publication } from "../src/index.ts";

const brand: Brand = { links: { main: "https://example.com" } };
const CHAPTERS = [{ t: 0, title: "The hook" }, { t: 31, title: "The problem" }, { t: 75.3, title: "The lesson" }, { t: 3725, title: "The end" }];

test("mmss and formatChapters: m:ss and h:mm:ss", () => {
  assert.equal(mmss(75.3), "1:15");
  assert.equal(mmss(3725), "1:02:05");
  assert.equal(formatChapters(CHAPTERS), "0:00 The hook\n0:31 The problem\n1:15 The lesson\n1:02:05 The end");
});
test("validateChapters: needs 0:00, 3 or more and 10 s each", () => {
  assert.deepEqual(validateChapters(CHAPTERS), []);
  assert.match(validateChapters([{ t: 0, title: "a" }, { t: 20, title: "b" }]).join(), /3 or more/);
  assert.match(validateChapters([{ t: 5, title: "a" }, { t: 20, title: "b" }, { t: 40, title: "c" }]).join(), /0:00/);
  assert.match(validateChapters([{ t: 0, title: "a" }, { t: 4, title: "b" }, { t: 40, title: "c" }]).join(), /minimum 10 s/);
});
test("link: a long video uses utm_medium=long on YouTube", () => {
  assert.match(link(brand, { platform: "youtube", format: "long" })!, /utm_medium=long$/);
  assert.match(link(brand, { platform: "youtube", format: "short" })!, /utm_medium=short$/);
});
test("destinationLink: the named link, then main, then the first link; null without links", () => {
  assert.equal(destinationLink({ links: { main: "https://a.example", docs: "https://b.example" } }, "docs"), "https://b.example");
  assert.equal(destinationLink({ links: { main: "https://a.example", docs: "https://b.example" } }), "https://a.example");
  assert.equal(destinationLink({ links: { game: "https://c.example" } }), "https://c.example");
  assert.equal(destinationLink({}), null);
});
test("buildPackage of a long video: chapters in the description, pinned YouTube comment, Instagram with the vertical cover; error on invalid chapters", () => {
  const publication: Publication = { title: "A long one", format: "long", chapters: CHAPTERS, yt: { description: "Description.", pinnedComment: "Which one was yours?" }, ig: { caption: "Caption." }, hashtags: { youtube: ["#sql"] }, files: { verticalCover: "cover-v.png" } };
  const md = buildPackage({ brand, publication });
  assert.match(md, /⏱ Chapters\n0:00 The hook\n0:31 The problem/);
  assert.match(md, /YouTube \(long\)/);
  assert.match(md, /Which one was yours\?/);
  assert.match(md, /cover-v\.png/);
  assert.deepEqual(validate({ brand, publication }).errors, []);
  assert.match(validate({ brand, publication: { ...publication, chapters: CHAPTERS.slice(0, 2) } }).errors.join(), /chapters: 2 chapter/);
});
test("texts.md of a Short has English headings and nothing else", () => {
  const publication: Publication = { name: "My Short", date: "06/11/2026", title: "My Short", beforePublishing: ["Watch with sound."], yt: { description: "D." }, ig: { caption: "C.", pinnedComment: "Pin me" }, tiktok: { caption: "T." }, hashtags: { youtube: ["#a"] }, facts: ["checked against the repo"], ai: { synthetic: true }, files: { video: "v.mp4", cover: "c.png" } };
  const md = buildPackage({ brand, publication });
  for (const heading of ["# My Short (publishing package, 06/11/2026)", "**Nothing published.**", "## Before publishing", "## Instagram (Reels): caption", "**Comment to pin:**", "## TikTok", "## YouTube Shorts: title", "**Suggested:**", "**Description**", "## Checked against the facts"]) assert.ok(md.includes(heading), heading);
  assert.doesNotMatch(md, /[áéíóúãõç]/i);
});
test("validate: limits, banned hashtags, AI tics (built in and from the brand) and the AI disclosure", () => {
  const b: Brand = { links: {}, publishing: { limits: { youtubeTitle: 10 }, hashtags: { banned: ["#bad"], allowed: ["#ok"] }, aiTicPatterns: [{ regex: "\\bin a nutshell\\b", message: "a custom pattern from the brand" }] } };
  const r = validate({ brand: b, publication: { title: "This title is too long", hashtags: { youtube: ["#bad", "#other"] }, ig: { caption: "It is not a bug, it's a feature " }, yt: { description: "In a nutshell, it works." } } });
  assert.match(r.errors.join("\n"), /title has 22 characters \(limit 10\)/);
  assert.match(r.errors.join("\n"), /banned hashtag on youtube: #bad/);
  assert.match(r.warnings.join("\n"), /hashtag not in the brand list on youtube: #other/);
  assert.equal(r.warnings.filter((w) => w.startsWith("AI text tic")).length, 2);
  assert.match(r.warnings.join("\n"), /AI disclosure missing/);
  const off = validate({ brand: { publishing: { aiTics: false } }, publication: { title: "x", ig: { caption: "It is not a bug, it's a feature" }, ai: { synthetic: false } } });
  assert.deepEqual(off.warnings, []);
});

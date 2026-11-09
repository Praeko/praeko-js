// @praeko/studio-publish: per-platform publishing package (title, description, captions, UTM, hashtags, pinned comment, checks).
// Nothing here knows a brand: everything comes from `brand.json` (links, hashtags, limits) and the episode's `publication.json`.
import type { Brand, Chapter, Labels, Limits, NetworkName, Publication } from "./types.ts";

/** Alt text limit of an image post (Instagram's alt_text; the Praeko server refuses more). */
export const ALT_MAX = 1000;
/** Carousel limits (Instagram: 2 to 20 items). */
export const CAROUSEL_MIN = 2, CAROUSEL_MAX = 20;
/** Is this publication an image piece (a photo post or a carousel)? */
export const isImage = (p: Publication): boolean => p.kind === "image" || p.kind === "carousel" || p.format === "image" || p.format === "carousel";
/** Is it a carousel (kind or format `carousel`)? */
export const isCarousel = (p: Publication): boolean => p.kind === "carousel" || p.format === "carousel";

export type * from "./types.ts";

export const DEFAULTS = {
  utm: { instagram: ["instagram", "bio"], youtube: ["youtube", "short"], tiktok: ["tiktok", "bio"] } as Record<NetworkName, [string, string]>,
  limits: { youtubeTitle: 100, youtubeDescription: 5000, instagram: 2200, tiktok: 2200, hashtagsInstagram: 30 } as Limits,
  bannedHashtags: [] as string[],
  // Tics of AI-written text: an OPTIONAL editorial rule (turn it off with publishing.aiTics: false in brand.json; add patterns for other
  // languages with publishing.aiTicPatterns). It is not the platforms' AI disclosure.
  aiTics: [
    { re: /\bnot [^.!?]{1,45}, (it'?s|but)\s/i, warning: 'the "not X, it\'s Y" structure' },
    { re: /\bno [^,.!?]{1,25}, no [^,.!?]{1,25}, no\b/i, warning: 'the "no X, no Y, no Z" list' },
  ],
};

/** Default labels used inside the generated YouTube description (override with publishing.labels in brand.json). */
export const LABELS: Labels = { chapters: "Chapters", article: "Full article", fullVideo: "Full video" };
export const labels = (brand?: Brand): Labels => ({ ...LABELS, ...(brand?.publishing?.labels || {}) });

/** Destination URL: `destination` (a key of brand.links), else `main`, else the first link of the brand. null if the brand has no links. */
export function destinationLink(brand: Brand, destination?: string): string | null {
  const l = brand.links || {};
  return (destination && l[destination]) || l.main || Object.values(l).find((v) => typeof v === "string" && v) || null;
}
/** The "🔗 Label: url" line of the YouTube description (label in brand.linkLabel, default "Link"); [] if there is no link. */
export const linkLine = (brand: Brand, lk: () => string | null): string[] => { const u = lk(); return u ? [`🔗 ${brand.linkLabel || "Link"}: ${u}`] : []; };

/** Link with UTM. `platform`: instagram | youtube | tiktok; `format`: "short" or "long" (changes the YouTube medium). */
export function link(brand: Brand, { platform, destination, campaign, format }: { platform: NetworkName; destination?: string; campaign?: string; format?: string }): string | null {
  const base = destinationLink(brand, destination);
  if (!base) return null; // links are optional: without a link the package simply carries no tagged link
  const u = { ...DEFAULTS.utm, ...(brand.publishing?.utm || {}) };
  let [source, medium] = u[platform] || [platform, "bio"];
  if (platform === "youtube" && format) medium = format;
  const q = new URLSearchParams({ utm_source: source, utm_medium: medium });
  if (campaign) q.set("utm_campaign", campaign);
  return `${base}${base.includes("?") ? "&" : "?"}${q.toString()}`;
}

const tags = (l?: string[]) => (l || []).join(" ");
const isLong = (p: Publication) => p.format === "long";

/** Seconds → "m:ss" (or "h:mm:ss"). */
export const mmss = (s: number): string => { const t = Math.round(s), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; };
/** `[{ t, title }]` (t in s) → "0:00 Title" lines for the YouTube description. */
export const formatChapters = (list: Chapter[]): string => list.map((c) => `${mmss(c.t)} ${c.title}`).join("\n");
/** YouTube's rules for chapters: start at 0:00, at least 3, each 10 s or more. */
export function validateChapters(list?: Chapter[]): string[] {
  const e: string[] = [];
  if (!list?.length) return e;
  if (list.length < 3) e.push(`${list.length} chapter(s): YouTube only creates chapters with 3 or more`);
  if (Math.round(list[0]!.t) !== 0) e.push("the first chapter must start at 0:00");
  for (let i = 1; i < list.length; i++) if (list[i]!.t - list[i - 1]!.t < 10) e.push(`chapter "${list[i - 1]!.title}" lasts ${(list[i]!.t - list[i - 1]!.t).toFixed(1)} s (minimum 10 s)`);
  return e;
}

/** Warnings for AI text tics: the built-in English patterns plus brand.publishing.aiTicPatterns. */
function ticWarnings(brand: Brand, text: string): string[] {
  if (brand.publishing?.aiTics === false) return [];
  const out = DEFAULTS.aiTics.filter((m) => m.re.test(text)).map((m) => m.warning);
  for (const p of brand.publishing?.aiTicPatterns || []) if (new RegExp(p.regex, "i").test(text)) out.push(p.message);
  return out;
}
/** Tics in a script (spoken text); used by the review package. */
export const aiTicWarnings = ticWarnings;

/** Checks limits, banned hashtags and AI tics. Returns `{ errors, warnings }`. */
export function validate({ brand, publication }: { brand: Brand; publication: Publication }): { errors: string[]; warnings: string[] } {
  const p = publication;
  const L = { ...DEFAULTS.limits, ...(brand.publishing?.limits || {}) };
  const banned = [...DEFAULTS.bannedHashtags, ...(brand.publishing?.hashtags?.banned || [])].map((h) => h.toLowerCase());
  const allowed = (brand.publishing?.hashtags?.allowed || []).map((h) => h.toLowerCase());
  const errors: string[] = [], warnings: string[] = [];
  if (isImage(p)) return validateImage({ brand, publication, L, banned, allowed });
  const yt = `${p.yt?.description || ""}\n${p.chapters ? formatChapters(p.chapters) : ""}\n${tags(p.hashtags?.youtube)}`;
  for (const x of validateChapters(p.chapters)) errors.push(`chapters: ${x}`);
  if ((p.title || "").length > L.youtubeTitle) errors.push(`title has ${p.title!.length} characters (limit ${L.youtubeTitle})`);
  if (yt.length > L.youtubeDescription) errors.push(`YouTube description has ${yt.length} characters (limit ${L.youtubeDescription})`);
  const ig = `${p.ig?.caption || ""}\n${tags(p.hashtags?.instagram)}`;
  if (ig.length > L.instagram) errors.push(`Instagram caption has ${ig.length} characters (limit ${L.instagram})`);
  const tk = `${p.tiktok?.caption || ""}\n${tags(p.hashtags?.tiktok)}`;
  if (tk.length > L.tiktok) warnings.push(`TikTok caption has ${tk.length} characters (suggested limit ${L.tiktok})`);
  if ((p.hashtags?.instagram || []).length > L.hashtagsInstagram) errors.push(`more than ${L.hashtagsInstagram} hashtags on Instagram`);
  for (const [pl, hs] of Object.entries(p.hashtags || {})) for (const h of hs || []) {
    if (banned.includes(h.toLowerCase())) errors.push(`banned hashtag on ${pl}: ${h}`);
    else if (allowed.length && !allowed.includes(h.toLowerCase())) warnings.push(`hashtag not in the brand list on ${pl}: ${h}`);
  }
  const all = [p.title, ...(p.alternatives || []), p.yt?.description, p.ig?.caption, p.ig?.pinnedComment, p.tiktok?.caption, p.commentReply].filter(Boolean).join("\n");
  for (const w of ticWarnings(brand, all)) warnings.push(`AI text tic: ${w}`);
  if (p.ai === undefined || p.ai?.synthetic === undefined) warnings.push('AI disclosure missing: fill in "ai": { "synthetic": true|false } in publication.json (a realistic synthetic voice or generated image that looks real requires the altered/synthetic content label on YouTube, Instagram and TikTok)');
  return { errors, warnings };
}

/** Image piece: only Instagram takes it, so only its caption, hashtags and the alt text of each image are checked (no YouTube title, chapters or TikTok). */
function validateImage({ brand, publication: p, L, banned, allowed }: { brand: Brand; publication: Publication; L: Limits; banned: string[]; allowed: string[] }): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  const ig = `${p.ig?.caption || ""}\n${tags(p.hashtags?.instagram)}`;
  if (!ig.trim()) errors.push("Instagram caption is empty (ig.caption in publication.json)");
  if (ig.length > L.instagram) errors.push(`Instagram caption has ${ig.length} characters (limit ${L.instagram})`);
  if ((p.hashtags?.instagram || []).length > L.hashtagsInstagram) errors.push(`more than ${L.hashtagsInstagram} hashtags on Instagram`);
  for (const [pl, hs] of Object.entries(p.hashtags || {})) for (const h of hs || []) {
    if (banned.includes(h.toLowerCase())) errors.push(`banned hashtag on ${pl}: ${h}`);
    else if (allowed.length && !allowed.includes(h.toLowerCase())) warnings.push(`hashtag not in the brand list on ${pl}: ${h}`);
  }
  const imgs = p.images || [];
  if (!imgs.length) warnings.push("no image listed in publication.json yet: run `praeko studio slides` and `praeko studio package`");
  if (isCarousel(p)) { if (imgs.length && (imgs.length < CAROUSEL_MIN || imgs.length > CAROUSEL_MAX)) errors.push(`${imgs.length} images: a carousel takes ${CAROUSEL_MIN} to ${CAROUSEL_MAX}`); }
  else if (imgs.length > 1) errors.push(`${imgs.length} images: an image post takes exactly one image (use \`format: carousel\` for ${CAROUSEL_MIN} to ${CAROUSEL_MAX})`);
  for (const [i, im] of imgs.entries()) {
    const who = isCarousel(p) ? `slide ${i + 1}` : `image ${i + 1}`;
    if (!String(im.alt || "").trim()) errors.push(`${who}: alt text is required (write \`alt\` on the slide in episode.yaml)`);
    else if (im.alt!.length > ALT_MAX) errors.push(`${who}: alt text has ${im.alt!.length} characters (limit ${ALT_MAX})`);
  }
  const all = [p.title, p.ig?.caption, p.ig?.pinnedComment, ...imgs.map((x) => x.alt)].filter(Boolean).join("\n");
  for (const w of ticWarnings(brand, all)) warnings.push(`AI text tic: ${w}`);
  if (p.ai === undefined || p.ai?.synthetic === undefined) warnings.push('AI disclosure missing: fill in "ai": { "synthetic": true|false } in publication.json (a generated image that looks real requires the altered/synthetic content label on Instagram)');
  return { errors, warnings };
}

/** `texts.md` of an image piece: the Instagram caption, the alt text of each image and the note that YouTube and TikTok do not take image posts yet. */
function buildImagePackage({ brand, publication: p }: { brand: Brand; publication: Publication }): string {
  const v = validate({ brand, publication: p }), o: string[] = [];
  o.push(`# ${p.name || p.title} (${isCarousel(p) ? "carousel" : "image post"}, publishing package${p.date ? ", " + p.date : ""})`, "", `**Nothing published.** ${isCarousel(p) ? "Slides, in order" : "Image"}: ${(p.images || []).map((x) => `\`${x.file}\``).join(", ") || "(none yet)"}.${p.publishOn ? ` Publish: ${p.publishOn}.` : ""}`, "", "## Before publishing");
  (p.beforePublishing || ["Look at the image on a phone screen."]).forEach((x, i) => o.push(`${i + 1}. ${x}`));
  if (v.errors.length || v.warnings.length) { o.push("", "## Automatic check"); v.errors.forEach((e) => o.push(`- ERROR: ${e}`)); v.warnings.forEach((e) => o.push(`- warning: ${e}`)); }
  o.push("", "---", "", `## Instagram (${isCarousel(p) ? "carousel" : "photo"}): caption`, "```", `${p.ig?.caption || ""}${p.hashtags?.instagram?.length ? " " + tags(p.hashtags.instagram) : ""}`, "```");
  if (p.ig?.pinnedComment) o.push("**Comment to pin:**", "```", p.ig.pinnedComment, "```");
  o.push("", "## Alt text (accessibility)");
  (p.images || []).forEach((x, i) => o.push(`${isCarousel(p) ? "Slide " : ""}${i + 1}. ${x.alt || "(missing)"}`));
  o.push("", "Alt text goes to Instagram when it is published through Meta (`via: meta`); through Buffer it is ignored (Praeko warns `alt_ignored`).", "", `YouTube and TikTok do not take ${isCarousel(p) ? "carousel" : "image"} posts yet: this package has only Instagram.`);
  if (p.facts?.length) { o.push("", "---", "", "## Checked against the facts"); p.facts.forEach((x) => o.push(`- ${x}`)); }
  return o.join("\n") + "\n";
}

/** Builds the episode's `texts.md`. */
export function buildPackage({ brand, publication }: { brand: Brand; publication: Publication }): string {
  if (isImage(publication)) return buildImagePackage({ brand, publication });
  const p = publication, R = labels(brand);
  const lk = (platform: NetworkName) => link(brand, { platform, campaign: p.campaign, format: p.format || "short" });
  const v = validate({ brand, publication });
  const o: string[] = [];
  o.push(`# ${p.name || p.title} (publishing package, ${p.date || ""})`.replace(/ \(publishing package, \)/, " (publishing package)"));
  o.push("");
  o.push(`**Nothing published.**${p.files?.video ? ` Video: \`${p.files.video}\`` : ""}${p.files?.cover ? `. Cover: \`${p.files.cover}\`` : ""}.${p.publishOn ? ` Publish: ${p.publishOn}.` : ""}`);
  o.push("", "## Before publishing");
  (p.beforePublishing || ["Watch with sound."]).forEach((x, i) => o.push(`${i + 1}. ${x}`));
  if (lk("youtube")) o.push(`${(p.beforePublishing || [1]).length + 1}. Tagged links: \`${lk("instagram")}\` · \`${lk("youtube")}\` · \`${lk("tiktok")}\``);
  if (v.errors.length || v.warnings.length) {
    o.push("", "## Automatic check");
    v.errors.forEach((e) => o.push(`- ERROR: ${e}`));
    v.warnings.forEach((e) => o.push(`- warning: ${e}`));
  }
  const alternatives = () => { if (p.alternatives?.length) o.push(`Alternatives: ${p.alternatives.map((a) => `\`${a}\``).join(" · ")}`); };
  const facts = () => { if (p.facts?.length) { o.push("", "---", "", "## Checked against the facts"); p.facts.forEach((x) => o.push(`- ${x}`)); } };
  if (isLong(p)) {
    o.push("", "---", "", "## YouTube (long): title", `**Suggested:** \`${p.title}\``);
    alternatives();
    o.push("", "**Description**", "```", p.yt?.description || "", "");
    if (p.chapters?.length) o.push(`⏱ ${R.chapters}`, formatChapters(p.chapters), "");
    o.push(...linkLine(brand, () => lk("youtube")), "", tags(p.hashtags?.youtube), "```");
    if (p.yt?.pinnedComment) o.push("**Comment to pin:**", "```", p.yt.pinnedComment, "```");
    o.push("", "## Instagram (Reel of the long video): caption", "Vertical cover: `" + (p.files?.verticalCover || "vertical cover") + "`", "```", `${p.ig?.caption || ""}${p.hashtags?.instagram ? " " + tags(p.hashtags.instagram) : ""}`, "```");
    if (p.ig?.pinnedComment) o.push("**Comment to pin:**", "```", p.ig.pinnedComment, "```");
    facts();
    return o.join("\n") + "\n";
  }
  o.push("", "---", "", "## Instagram (Reels): caption", "```", `${p.ig?.caption || ""}${p.hashtags?.instagram ? " " + tags(p.hashtags.instagram) : ""}`, "```");
  if (p.ig?.pinnedComment) o.push("**Comment to pin:**", "```", p.ig.pinnedComment, "```");
  o.push("", "## TikTok", "```", `${p.tiktok?.caption || ""}${p.hashtags?.tiktok ? " " + tags(p.hashtags.tiktok) : ""}`, "```");
  o.push("", "## YouTube Shorts: title", `**Suggested:** \`${p.title}\``);
  alternatives();
  o.push("", "**Description**", "```", p.yt?.description || "", "");
  if (p.article) o.push(`📖 ${R.article}: ${p.article}`);
  if (p.fullVideo) o.push(`▶️ ${R.fullVideo}: ${p.fullVideo}`);
  o.push(...linkLine(brand, () => lk("youtube")), "", tags(p.hashtags?.youtube), "```");
  if (p.commentReply) o.push("", "## Suggested reply to the original comment", "```", p.commentReply, "```");
  facts();
  return o.join("\n") + "\n";
}

export * from "./buffer.ts";
export * as hosting from "./hosting.ts";
export * as coverFrame from "./cover-frame.ts";
export * from "./queue.ts";
export * as providers from "./providers/registry.ts";
export * as praeko from "./providers/praeko.ts";

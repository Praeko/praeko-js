// `praeko studio review <slug> [--every <seconds>] [--max-frames N] [--engine remotion|hyperframes] [--json]`
// Builds the REVIEW PACKAGE of a rendered piece in out/<slug>-review/: frames, manifest.json (measured facts) and REVIEW.md (instructions for the person's agent).
// Studio calls no language model: it measures and extracts; the agent (multimodal or not) reads the package and does the judging.
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import YAML from "yaml";
import { buildSlideReview, buildVideoReview, writeReview } from "@praeko/studio-review";
import type { LayoutIssue, Manifest, SceneInfo, TextSource, Word } from "@praeko/studio-review";
import { AREA, CAROUSEL_MAX, CAROUSEL_MIN, compileEpisode, isImagePiece, longRect, measure, rectOf } from "./compile.ts";
import { engineOf, hyperframesMp4 } from "./engine.ts";
import { IMAGE_LIMITS, slideFile } from "./image.ts";
import { lang, translate } from "./i18n.ts";
import { episodeOf, findProject } from "./project.ts";
import type { Episode, Project } from "./project.ts";

const flag = (a: string[], k: string): string | undefined => { const i = a.indexOf("--" + k); return i >= 0 ? a[i + 1] : undefined; };
const has = (a: string[], k: string): boolean => a.includes("--" + k);
const readJson = <T>(f: string, d: T): T => { try { return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as T) : d; } catch { return d; } };
const read = (f: string): string | null => { try { return existsSync(f) ? readFileSync(f, "utf8") : null; } catch { return null; } };
const ICON = { error: "✗", warning: "⚠", info: "·" } as const;
const clock = (t: number): string => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}`;

/** Every string shown by an item of the spec (text, parts, lines, nested items). A collector, not a renderer: what the kit prints for an item type it does not list is not counted. */
export function itemTexts(it: any): string[] {
  if (!it || typeof it !== "object") return [];
  const out: string[] = [];
  if (typeof it.text === "string" && it.text.trim()) out.push(it.text);
  if (Array.isArray(it.parts)) { const t = it.parts.map((p: any) => (typeof p === "string" ? p : p?.text ?? "")).join(""); if (t.trim()) out.push(t); }
  if (Array.isArray(it.lines)) for (const l of it.lines) {
    const t = typeof l === "string" ? l : Array.isArray(l) ? l.map((p: any) => (typeof p === "string" ? p : p?.text ?? p?.s ?? "")).join("") : String(l?.text ?? l?.s ?? l?.label ?? "");
    if (t.trim()) out.push(t);
  }
  for (const c of it.items ?? []) out.push(...itemTexts(c));
  if (typeof it.label === "string" && it.label.trim() && it.type !== "text") out.push(it.label);
  return out;
}

/** The scenes of a compiled spec with their end and on-screen text: the scenes, then the closing screen (a short's outro, a long video's endcard). */
export function scenesOf(spec: any, format: "short" | "long"): SceneInfo[] {
  const list: any[] = Array.isArray(spec?.scenes) ? spec.scenes : [], dur: number = spec?.durS ?? 0, out: SceneInfo[] = [];
  const closing: number | null = format === "short" ? (typeof spec?.outro?.a === "number" ? spec.outro.a : null) : (typeof spec?.endcard?.start === "number" ? spec.endcard.start : null);
  list.forEach((c, i) => {
    const start = Number(c.start) || 0, next = list[i + 1]?.start, end = Number(c.end ?? next ?? closing ?? dur) || dur;
    const text = [...(c.label ? [String(c.label)] : []), ...(c.items ?? []).flatMap(itemTexts)];
    out.push({ n: i + 1, kind: "scene", ...(c.title ? { title: String(c.title) } : {}), start, end: Math.max(start, end), duration: +Math.max(0, end - start).toFixed(2), text });
  });
  if (closing !== null && dur > closing) {
    const text = format === "short" ? (spec.outro?.cta ? [String(spec.outro.cta)] : []) : [spec.endcard?.text, spec.endcard?.link].filter((x) => typeof x === "string" && x) as string[];
    out.push({ n: list.length + 1, kind: format === "short" ? "outro" : "endcard", start: closing, end: dur, duration: +(dur - closing).toFixed(2), text });
  }
  return out;
}

/** Texts that do not fit where the spec puts them (estimates, from the measures `compile` already uses): the panel of a short, the 1920x960 area of a long video, a 1080x1350 slide. */
export function layoutIssues(spec: any, format: "short" | "long" | "slide"): LayoutIssue[] {
  const out: LayoutIssue[] = [];
  const outside = (r: { x: number; y: number; w: number; h: number }, box: { w: number; h: number }): string | null => {
    const bad: string[] = [];
    if (r.x < -1) bad.push(`left edge at ${Math.round(r.x)} px`);
    if (r.y < -1) bad.push(`top edge at ${Math.round(r.y)} px`);
    if (r.x + r.w > box.w + 1) bad.push(`right edge at about ${Math.round(r.x + r.w)} px of ${box.w}`);
    if (r.y + r.h > box.h + 1) bad.push(`bottom edge at about ${Math.round(r.y + r.h)} px of ${box.h}`);
    return bad.length ? bad.join(", ") : null;
  };
  const one = (items: any[], where: string, time: number | null, slide: number | undefined, box: { w: number; h: number }, flowWidth: number, flowMax: number): void => {
    const at = { time, ...(slide !== undefined ? { slide } : {}) };
    for (const it of items) {
      const r = format === "long" ? longRect(it) : rectOf(it), why = r ? outside(r, box) : null;
      if (r && why) out.push({ ...at, message: `${where}: a "${it.type}" item goes outside the safe area (estimate)`, evidence: `${itemTexts(it)[0]?.slice(0, 40) ?? it.type}: ${why}; area ${box.w}x${box.h}` });
    }
    if (format === "long") return;
    const med = items.filter((it) => !it.pos).map((it) => measure(it, flowWidth));
    const height = med.reduce((s, m) => s + m.h, 0) + Math.max(0, med.length - 1) * AREA.gap;
    if (height > flowMax) out.push({ ...at, message: `${where}: the items probably do not fit the area (estimate)`, evidence: `about ${Math.round(height)} px of stacked items; the area has ${flowMax} px` });
    for (const m of med) if (m.overflows) out.push({ ...at, message: `${where}: a row of items is wider than the area (estimate)`, evidence: `about ${Math.round(m.w)} px wide; the area has ${flowWidth} px` });
  };
  if (format === "slide") (spec.slides ?? []).forEach((s: any, i: number) => one(s.items ?? [], `slide ${i + 1}`, null, i + 1, { w: 1080, h: 1350 }, 940, 800));
  else for (const [i, c] of (spec.scenes ?? []).entries()) one(c.items ?? [], `scene ${i + 1}`, Number(c.start) || 0, undefined, format === "short" ? { w: AREA.w, h: AREA.h } : { w: 1920, h: 960 }, AREA.w, AREA.h);
  return out;
}

const spoken = (script: string): string => script.replace(/^##[^\n]*$/gm, "").replace(/\[[^\]]*\]/g, " ");
/** The texts of publication.json that the rules look at, one source each. */
export function publicationTexts(publication: any): TextSource[] {
  const p = publication ?? {}, pick: [string, unknown][] = [["title", p.title], ["yt.description", p.yt?.description], ["yt.pinnedComment", p.yt?.pinnedComment], ["ig.caption", p.ig?.caption], ["ig.pinnedComment", p.ig?.pinnedComment], ["tiktok.caption", p.tiktok?.caption], ["commentReply", p.commentReply], ...((p.alternatives ?? []) as unknown[]).map((x, i): [string, unknown] => [`alternatives[${i}]`, x])];
  return pick.filter(([, v]) => typeof v === "string" && (v as string).trim()).map(([k, v]) => ({ source: `publication.json › ${k}`, text: v as string }));
}

const formatOf = (ep: Episode, publication: any): "short" | "long" => { try { const f = YAML.parse(readFileSync(join(ep.folder, "episode.yaml"), "utf8"))?.format; if (f === "long") return "long"; } catch { /* no yaml */ } return publication?.format === "long" ? "long" : "short"; };
const dict = (): { lang: "en" | "pt"; tr: (s: string) => string } => ({ lang: lang(), tr: (s) => translate(s) });

function reviewVideo(p: Project, ep: Episode, a: string[]): Manifest {
  const publication = readJson<any>(join(ep.folder, "publication.json"), {}), format = formatOf(ep, publication);
  const video = (engineOf(p, ep, flag(a, "engine")) === "hyperframes") ? hyperframesMp4(p, ep) : ep.mp4;
  if (!existsSync(video)) throw new Error(`no rendered video for "${ep.slug}" (${relative(p.root, video)}): run \`praeko studio render ${ep.slug}\` first`);
  const specFile = join(ep.folder, "episode.spec.json");
  let spec: any = readJson<any>(specFile, null);
  if (!spec && existsSync(join(ep.folder, "episode.yaml"))) spec = compileEpisode(ep.folder, { write: false }).spec;
  const scenes = spec ? scenesOf(spec, format) : [], words = readJson<Word[]>(join(ep.folder, "words.json"), []);
  const script = read(join(ep.folder, "script.txt")), texts: TextSource[] = [];
  for (const s of scenes) if (s.text.length) texts.push({ source: `scene ${s.n} on-screen text`, text: s.text.join("\n"), time: s.start });
  if (script) texts.push({ source: "script.txt", text: spoken(script), dedupe: true });
  texts.push(...publicationTexts(publication));
  const cover = format === "long" ? `${ep.slug}-cover-1280x720.png` : `${ep.slug}-cover.png`, sheet = join(p.root, "out", `${ep.slug}-contact-sheet.png`);
  const outDir = join(p.root, "out", `${ep.slug}-review`);
  const m = buildVideoReview({
    slug: ep.slug, video, videoRel: relative(p.root, video), outDir, format, every: flag(a, "every") !== undefined ? Number(flag(a, "every")) : undefined, maxFrames: flag(a, "max-frames") !== undefined ? Number(flag(a, "max-frames")) : undefined,
    scenes, specDuration: typeof spec?.durS === "number" ? spec.durS : null, specMissing: !spec, words, estimatedVoice: existsSync(join(ep.folder, "voice.estimated")),
    brand: p.brand, playbook: read(join(p.root, "playbook.md")), texts, layout: spec ? layoutIssues(spec, format) : [], coverMissing: !existsSync(join(p.root, "out", cover)), coverName: cover, contactSheetFile: sheet,
  });
  writeReview(outDir, m, dict());
  return m;
}

function reviewSlides(p: Project, ep: Episode): Manifest {
  const compiled = readJson<any>(join(ep.folder, "episode.spec.json"), null) ?? compileEpisode(ep.folder, { write: false }).spec;
  if (!compiled?.slides) throw new Error(`"${ep.slug}" has no compiled slides: run \`praeko studio compile ${ep.slug}\``);
  const kind: "image" | "carousel" = compiled.format === "carousel" ? "carousel" : "image", publication = readJson<any>(join(ep.folder, "publication.json"), {});
  const slides = (compiled.slides as any[]).map((s, i) => ({ n: i + 1, file: slideFile(p.root, ep.slug, i + 1), alt: typeof s.alt === "string" ? s.alt : "", text: [...(Array.isArray(s.title) ? (s.title as string[]).map(String) : []), ...(s.items ?? []).flatMap(itemTexts)], hasTitle: Array.isArray(s.title) && s.title.length > 0 }));
  if (!slides.some((s) => existsSync(s.file))) throw new Error(`no rendered slides for "${ep.slug}" (out/${ep.slug}-slide-01.jpg…): run \`praeko studio slides ${ep.slug}\` first`);
  const texts: TextSource[] = [];
  for (const s of slides) { if (s.text.length) texts.push({ source: `slide ${s.n} text`, text: s.text.join("\n"), slide: s.n }); if (s.alt) texts.push({ source: `slide ${s.n} alt text`, text: s.alt, slide: s.n }); }
  texts.push(...publicationTexts(publication));
  const outDir = join(p.root, "out", `${ep.slug}-review`);
  const m = buildSlideReview({
    slug: ep.slug, kind, outDir, outRel: `out/${ep.slug}-slide-NN.jpg`, slides, limits: { width: IMAGE_LIMITS.width, height: IMAGE_LIMITS.height, bytesMax: IMAGE_LIMITS.bytesMax, altMax: IMAGE_LIMITS.altMax, carouselMin: CAROUSEL_MIN, carouselMax: CAROUSEL_MAX },
    brand: p.brand, playbook: read(join(p.root, "playbook.md")), texts, layout: layoutIssues(compiled, "slide"), caption: String(publication?.ig?.caption ?? ""), hashtags: (publication?.hashtags?.instagram ?? []) as string[],
  });
  writeReview(outDir, m, dict());
  return m;
}

export function reviewCommand(a: string[]): number {
  const slug = a[0];
  if (!slug || slug.startsWith("--")) throw new Error("usage: praeko studio review <slug> [--every <seconds>] [--max-frames N] [--engine remotion|hyperframes] [--json]");
  const every = flag(a, "every"), max = flag(a, "max-frames");
  if (every !== undefined && !(Number(every) > 0)) throw new Error("--every takes a number of seconds above 0");
  if (max !== undefined && !(Number.isInteger(Number(max)) && Number(max) >= 2 && Number(max) <= 60)) throw new Error("--max-frames takes a whole number from 2 to 60");
  const p = findProject(), ep = episodeOf(p, slug);
  const m = isImagePiece(ep.folder) ? reviewSlides(p, ep) : reviewVideo(p, ep, a);
  if (has(a, "json")) { process.stdout.write(JSON.stringify(m, null, 2) + "\n"); return 0; }
  const dir = `out/${ep.slug}-review`, n = m.frames.length || m.slides.filter((s) => s.frame).length;
  console.log(`review package: ${dir}/ (${n} ${m.kind === "video" ? "frame(s)" : "slide(s)"}, manifest.json, REVIEW.md)`);
  for (const x of m.findings) console.log(`${ICON[x.severity]} ${x.time !== null ? clock(x.time) + " " : x.slide !== undefined ? `slide ${x.slide} ` : ""}${x.code}: ${translate(x.message)}`);
  console.log(`\n${m.summary.error} error(s), ${m.summary.warning} warning(s), ${m.summary.info} info`);
  console.log(`next: your agent reads ${dir}/REVIEW.md, looks at the ${m.kind === "video" ? "frames" : "slides"} in order and writes the review (the findings are measurements, not a verdict)`);
  return 0;
}

// `praeko studio compile`: episode.yaml → episode.spec.json (what EpisodeDecl/LongDecl read), with validation and overlap detection.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

export type Words = { t: string; a: number; b: number }[];
export type CompileResult = { spec: any; errors: string[]; warnings: string[] };

export const TYPES = ["text", "big", "box", "line", "bubble", "code", "window", "phone", "bar", "bars", "stack", "row", "card"];
const COLORS = ["accent", "text", "muted", "ok", "error", "info", "extra", "box"];
const KEYS = new Set(["type", "when", "offset", "at", "pos", "color", "size", "text", "mono", "font", "align", "lineHeight", "height", "weight", "pop", "noWrap", "noFade", "dim", "dashed", "author", "title", "lines", "parts", "src", "clipDuration", "from", "reg", "tag", "gradient", "gradientAngle", "radius", "background", "border", "fill", "glowAtEnd", "max", "maxWidth", "labelWidth", "step", "gap", "items", "center", "spread"]);
const POS: Record<string, string> = { left: "left", right: "right", top: "top", bottom: "bottom", width: "w", height: "h", w: "w", h: "h" };
const norm = (s: unknown): string => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const COMMA_HINT = ". Inside { … } a comma in the text separates fields: put the text in quotes";

// Usable area of the kit's Panel: 1080 − 2×70 (margins) − 2×48 (padding) = 844 wide; 1000 − 2×40 = 920 high.
export const AREA = { w: 844, h: 920, gap: 22 };

/** Instant (absolute s) where the phrase starts; -1 if it does not exist. */
export function findPhrase(words: Words, phrase: string, nth = 0, after = 0): number {
  const f = String(phrase).split(/\s+/).map(norm).filter(Boolean), W = words.map((p) => norm(p.t));
  let c = 0;
  for (let k = 0; k <= W.length - f.length; k++) if (words[k]!.a >= after && f.every((w, j) => W[k + j] === w)) { if (c === nth) return words[k]!.a; c++; }
  return -1;
}
const sizeOf = (it: any, p = 40): number => it.size ?? p;
/** Rough estimate (px) of an item's width/height in the panel flow. It warns; it does not prove. */
export function measure(it: any, width = AREA.w): { w: number; h: number; wraps?: boolean; overflows?: boolean } {
  const lines = (t: unknown) => String(t ?? "").split("\n");
  switch (it.type) {
    case "text": { const s = sizeOf(it), L = lines(it.text); const w = Math.max(...L.map((l) => l.length)) * s * (it.font === "mono" ? 0.6 : 0.52); return { w, h: L.length * s * (it.lineHeight ?? 1.3) * (it.noWrap ? 1 : Math.max(1, Math.ceil(w / width))) / (w > width && !it.noWrap ? Math.ceil(w / width) : 1), wraps: w > width && !it.noWrap && L.length === 1 }; }
    case "big": { const s = sizeOf(it, 120); return { w: String(it.text).length * s * 0.6, h: s * 1.15 }; }
    case "box": { const s = sizeOf(it); const w = String(it.text).length * s * (it.mono ? 0.6 : 0.52) + 64; return { w, h: s * 1.3 + 36, wraps: w > width }; }
    case "line": { const s = sizeOf(it); const n = (it.parts ?? []).reduce((a: number, p: any) => a + String(p.text).length, 0); return { w: n * s * 0.52, h: s * 1.4, wraps: n * s * 0.52 > width }; }
    case "bubble": return { w: width, h: 100 + Math.ceil(String(it.text).length * 34 * 0.52 / (width - 100)) * 44 };
    case "code": return { w: width, h: 110 + (it.lines?.length ?? 0) * 56 };
    case "card": return { w: width, h: (it.lines?.length ?? 0) * (it.size ?? 40) * 1.45 + 40 };
    case "bar": return { w: width, h: it.height ?? 40 };
    case "bars": return { w: width, h: (it.lines?.length ?? 0) * (34 + (it.gap ?? 16)) };
    case "stack": { const f = (it.items ?? []).map((x: any) => measure(x, width)); return { w: Math.max(0, ...f.map((x: any) => x.w)), h: f.reduce((a: number, x: any) => a + x.h, 0) + Math.max(0, f.length - 1) * (it.gap ?? 20) }; }
    case "row": { const f = (it.items ?? []).map((x: any) => measure(x, width)); const w = f.reduce((a: number, x: any) => a + x.w, 0) + Math.max(0, f.length - 1) * (it.gap ?? 20); return { w, h: Math.max(0, ...f.map((x: any) => x.h)), overflows: w > width }; }
    default: return { w: 0, h: 0 };
  }
}
type Rect = { x: number; y: number; w: number; h: number };
const rectOf = (it: any): Rect | null => { const p = it.pos; if (!p || p.left === undefined || p.top === undefined || p.w === undefined) return null; return { x: p.left, y: p.top, w: p.w, h: p.h ?? measure(it).h }; };
const crosses = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const badColor = (c: unknown): boolean => typeof c === "string" && !c.startsWith("#") && !COLORS.includes(c);

function normalizeItem(it: any, where: string, errors: string[]): any {
  if (!it || typeof it !== "object") { errors.push(`${where}: invalid item`); return it; }
  if (!TYPES.includes(it.type)) errors.push(`${where}: unknown type "${it.type}" (use ${TYPES.join(", ")})`);
  const o = { ...it };
  for (const k of Object.keys(it)) if (!KEYS.has(k)) errors.push(`${where}: unknown key "${k}"${/\s/.test(k) || it[k] === null ? COMMA_HINT : ""}`);
  if (it.pos) { o.pos = {}; for (const [k, v] of Object.entries(it.pos)) { if (!POS[k]) errors.push(`${where}: unknown pos.${k}`); else o.pos[POS[k]!] = v; } }
  for (const k of ["color", "gradient"]) for (const c0 of ([] as any[]).concat(it[k] ?? [])) { const c = typeof c0 === "string" ? c0.split(" ")[0] : c0; if (badColor(c)) errors.push(`${where}: color "${c}" does not exist in the theme (use ${COLORS.join(", ")} or #hex)`); }
  if (it.items) o.items = it.items.map((f: any, i: number) => normalizeItem(f, `${where} › ${f?.type ?? i}`, errors));
  return o;
}
function everyItem(it: any, f: (x: any) => void): void { f(it); (it.items ?? []).forEach((x: any) => everyItem(x, f)); }

/**
 * Time in seconds from: number · "phrase" · { when, nth, after, plus } · { voice: N } (N s after the end of the voice, N may be negative).
 * Returns the value itself if it is none of those (e.g. { block: N }, resolved elsewhere). Records an error if the phrase does not exist.
 */
export function resolveTime(x: any, words: Words, where: string, errors: string[]): any {
  if (typeof x === "number" || x === undefined || x === null) return x;
  if (typeof x === "object" && x.block !== undefined) return x;
  const o = typeof x === "string" ? { when: x } : x;
  if (typeof o.voice === "number") {
    if (!words.length) { errors.push(`${where}: \`{ voice: ${o.voice} }\` needs words.json (run \`praeko studio voice\`)`); return 0; }
    return +(words[words.length - 1]!.b + o.voice).toFixed(2);
  }
  if (typeof o.when !== "string") { errors.push(`${where}: invalid time (use a number, "phrase", { when, nth, after, plus } or { voice: N })`); return 0; }
  if (!words.length) { errors.push(`${where}: "${o.when}" needs words.json (run \`praeko studio voice\`)`); return 0; }
  const t = findPhrase(words, o.when, o.nth ?? 0, o.after ?? 0);
  if (t < 0) { errors.push(`${where}: phrase "${o.when}" does not appear in the voice (words.json)`); return 0; }
  return +(t + (o.plus ?? 0)).toFixed(2);
}

/** `image` (one slide) or `carousel` (2 to 20 slides) when the episode folder is an image piece (`format` in episode.yaml), otherwise undefined. */
export function imageFormat(folder: string): "image" | "carousel" | undefined {
  const f = join(folder, "episode.yaml");
  if (!existsSync(f)) return undefined;
  try { const fm = YAML.parse(readFileSync(f, "utf8"))?.format; return fm === "image" || fm === "carousel" ? fm : undefined; } catch { return undefined; }
}
/** Is the episode folder an image piece (`format: image` or `format: carousel` in episode.yaml)? */
export const isImagePiece = (folder: string): boolean => imageFormat(folder) !== undefined;
/** `engine` written in the yaml of an image piece, if any. */
export const imageEngine = (folder: string): string | undefined => { try { return YAML.parse(readFileSync(join(folder, "episode.yaml"), "utf8"))?.engine; } catch { return undefined; } };

const readJson = <T>(f: string, d: T): T => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d);

/** Compiles an episode folder. Returns { spec, errors, warnings }; writes the JSON only when there are no errors. */
export function compileEpisode(folder: string, { write = true }: { write?: boolean } = {}): CompileResult {
  const errors: string[] = [], warnings: string[] = [], file = join(folder, "episode.yaml");
  if (!existsSync(file)) return { spec: null, errors: [`no episode.yaml in ${folder}`], warnings };
  let y: any;
  try { y = YAML.parse(readFileSync(file, "utf8")); } catch (e: any) { return { spec: null, errors: [`invalid episode.yaml: ${e.message}`], warnings }; }
  if (!y || typeof y !== "object") return { spec: null, errors: ["episode.yaml is empty"], warnings };
  const info: any = readJson(join(folder, "episode.json"), {});
  if (y.format === "image" || y.format === "carousel") return compileImage({ y, info, folder, errors, warnings, write });
  const words: Words = readJson(join(folder, "words.json"), []);
  if (!words.length) warnings.push("words.json is empty or missing: `when` anchors were not checked (run `praeko studio voice`)");
  // phrase times: duration, scene start/end, outro.start and hits become seconds before validating
  if (y.duration !== undefined) y.duration = resolveTime(y.duration, words, "duration", errors);
  if (y.outro && typeof y.outro === "object" && y.outro.start !== undefined) y.outro.start = resolveTime(y.outro.start, words, "outro.start", errors);
  if (y.format === "long" && y.endcard && typeof y.endcard === "object" && y.endcard.start !== undefined) y.endcard.start = resolveTime(y.endcard.start, words, "endcard.start", errors);
  for (const [i, c] of (Array.isArray(y.scenes) ? y.scenes : []).entries()) { if (!c || typeof c !== "object") continue; if (c.start !== undefined) c.start = resolveTime(c.start, words, `scene ${i + 1} › start`, errors); if (c.end !== undefined) c.end = resolveTime(c.end, words, `scene ${i + 1} › end`, errors); }
  for (const [i, g] of (y.hits ?? []).entries()) if (g && g.at !== undefined) g.at = resolveTime(g.at, words, `hit ${i + 1}`, errors);
  if (y.format === "long") return compileLong({ y, info, words, folder, errors, warnings, write });
  for (const k of ["duration", "voice", "outro", "scenes"]) if (y[k] === undefined) errors.push(`missing "${k}"`);
  if (errors.length) return { spec: null, errors, warnings };
  const id = y.id ?? info.id;
  if (!id) errors.push('missing "id" (in the yaml or in episode.json)');
  if (y.engine !== undefined && !["remotion", "hyperframes"].includes(y.engine)) errors.push(`engine "${y.engine}" does not exist (use remotion or hyperframes)`);
  const scenesY: any[] = y.scenes;
  if (!Array.isArray(scenesY) || !scenesY.length) errors.push('"scenes" must be a list');
  const outroAt = y.outro?.start;
  if (typeof outroAt !== "number") errors.push("outro.start (s) is required");
  if (typeof y.duration === "number" && typeof outroAt === "number" && outroAt >= y.duration) errors.push(`outro.start (${outroAt}) must come before the duration (${y.duration})`);
  if (errors.length) return { spec: null, errors, warnings };

  if (words.length) {
    const voiceEnd = words[words.length - 1]!.b;
    if (voiceEnd + 1 > y.duration) warnings.push(`duration (${y.duration} s) leaves less than 1 s after the end of the voice (${voiceEnd.toFixed(2)} s)`);
  }
  const scenes = scenesY.map((c, i) => {
    const name = `scene ${i + 1}${c.title ? ` (${c.title})` : ""}`;
    for (const k of Object.keys(c)) if (!["start", "end", "title", "label", "sounds", "layout", "items", "component"].includes(k)) errors.push(`${name}: unknown key "${k}"${/\s/.test(k) || c[k] === null ? COMMA_HINT : ""}`);
    if (typeof c.start !== "number") errors.push(`${name}: missing "start" (s)`);
    if (i > 0 && c.start <= scenesY[i - 1]!.start) errors.push(`${name}: start ${c.start} does not come after the previous scene`);
    const end = c.end ?? (i + 1 < scenesY.length ? scenesY[i + 1]!.start : outroAt);
    if (end > outroAt + 1e-9 && i === scenesY.length - 1) warnings.push(`${name}: ends (${end}) after the outro (${outroAt})`);
    if (c.component && c.items) errors.push(`${name}: use "component" or "items", not both`);
    if (!c.component && !c.items?.length) errors.push(`${name}: no items`);
    const items: any[] | undefined = c.items?.map((it: any, k: number) => normalizeItem(it, `${name} › item ${k + 1}`, errors));
    for (const it of items ?? []) everyItem(it, (x) => {
      if (x.when === undefined) return;
      const [f, n] = Array.isArray(x.when) ? x.when : [x.when, 0];
      if (!words.length) return;
      const t = findPhrase(words, f, n);
      if (t < 0) errors.push(`${name}: phrase "${f}"${n ? ` (#${n})` : ""} does not appear in the voice (words.json). The aligner sometimes writes numbers as digits`);
      else if (t < c.start - 0.05 || t > end + 0.05) warnings.push(`${name}: "${f}" is spoken at ${t.toFixed(2)} s, outside the scene (${c.start}–${end.toFixed ? end.toFixed(2) : end}): the item appears early or never`);
    });
    if (items && (c.layout ?? "panel") === "panel") {
      const med = items.map((it) => ({ it, m: measure(it) })).filter((x) => !x.it.pos);
      const height = med.reduce((a, x) => a + x.m.h, 0) + Math.max(0, med.length - 1) * AREA.gap;
      if (height > AREA.h) warnings.push(`${name}: items add up to ~${Math.round(height)} px of height and the panel has ${AREA.h} (estimate): it will overflow or overlap`);
      for (const { it, m } of med) {
        if (m.overflows) warnings.push(`${name}: the "${it.type}" row is ~${Math.round(m.w)} px wide and the panel ${AREA.w}: it overflows the edges`);
        else if (m.wraps) warnings.push(`${name}: "${String(it.text ?? "").slice(0, 28)}…" is ~${Math.round(m.w)} px wide (panel ${AREA.w}): it should wrap onto 2 lines; check it or break it with \\n`);
      }
    }
    const abs = (items ?? []).map((it) => ({ it, r: rectOf(it) })).filter((x): x is { it: any; r: Rect } => !!x.r);
    for (let a = 0; a < abs.length; a++) for (let b = a + 1; b < abs.length; b++) if (crosses(abs[a]!.r, abs[b]!.r)) warnings.push(`${name}: "${abs[a]!.it.type}" and "${abs[b]!.it.type}" overlap on screen (absolute positions)`);
    return { start: c.start, ...(c.end !== undefined ? { end: c.end } : {}), label: c.label, sounds: c.sounds, layout: c.layout, title: c.title, items, component: c.component };
  });
  const cv = y.cover && typeof y.cover === "object" ? y.cover : null;
  const spec = {
    id, durS: y.duration, captionPx: y.caption, voice: y.voice, backgroundLines: y.background,
    ...(y.engine ? { engine: y.engine } : {}),
    hits: y.hits?.map((g: any) => ({ at: g.at, type: g.type })),
    outro: { a: outroAt, cta: y.outro.cta },
    scenes,
    cover: cv ? { id: cv.id ?? info.cover, component: cv.component, title: cv.title, color: cv.color, glow: cv.glow, size: cv.size, items: cv.items?.map((it: any, k: number) => normalizeItem(it, `cover › item ${k + 1}`, errors)) } : undefined,
  };
  if (!errors.length && write) writeFileSync(join(folder, "episode.spec.json"), JSON.stringify(spec, (_k, v) => (v === undefined ? undefined : v), 2) + "\n");
  return { spec: errors.length ? null : spec, errors, warnings };
}

// ---------- image and carousel (Instagram: one photo, or 2 to 20 slides, each a 1080x1350 image) ----------
export const CAROUSEL_MIN = 2, CAROUSEL_MAX = 20, ALT_MAX = 1000;
export const IMAGE_SIZE = { name: "4x5", width: 1080, height: 1350 } as const;
const SLIDE_KEYS = ["alt", "title", "color", "glow", "size", "items", "component"];
/** `format: image` (exactly one slide) or `format: carousel` (2 to 20 slides): each slide reuses the items of the cover. No voice, duration, scenes or outro. */
function compileImage({ y, info, folder: _folder, errors, warnings, write }: { y: any; info: any; folder: string; errors: string[]; warnings: string[]; write: boolean }): CompileResult {
  const carousel = y.format === "carousel";
  for (const k of Object.keys(y)) if (!["format", "id", "size", "engine", "slides"].includes(k)) errors.push(`${carousel ? "carousel" : "image"} episode: unknown key "${k}" (use format, id, size, engine, slides; the caption lives in publication.json)`);
  const id = y.id ?? info.id;
  if (!id) errors.push('missing "id" (in the yaml or in episode.json)');
  if (y.engine !== undefined && y.engine !== "remotion") errors.push(`engine "${y.engine}": image pieces render only with Remotion (HyperFrames has no image mode yet)`);
  if (y.size !== undefined && y.size !== IMAGE_SIZE.name) errors.push(`size "${y.size}": only ${IMAGE_SIZE.name} (${IMAGE_SIZE.width}x${IMAGE_SIZE.height}) exists for now`);
  const list: any[] = Array.isArray(y.slides) ? y.slides : [];
  if (!Array.isArray(y.slides) || !list.length) errors.push(carousel ? `"slides" must be a list with ${CAROUSEL_MIN} to ${CAROUSEL_MAX} slides` : '"slides" must be a list with one slide');
  else if (carousel && (list.length < CAROUSEL_MIN || list.length > CAROUSEL_MAX)) errors.push(`${list.length} slide${list.length === 1 ? "" : "s"}: a carousel takes ${CAROUSEL_MIN} to ${CAROUSEL_MAX}${list.length === 1 ? " (for a single image use `format: image`)" : ""}`);
  else if (!carousel && list.length > 1) errors.push(`${list.length} slides: an image piece has exactly one slide (use \`format: carousel\` for ${CAROUSEL_MIN} to ${CAROUSEL_MAX})`);
  const slides = list.slice(0, CAROUSEL_MAX + 1).map((c, i) => {
    const where = `slide ${i + 1}`;
    if (!c || typeof c !== "object") { errors.push(`${where}: invalid slide`); return c; }
    for (const k of Object.keys(c)) if (!SLIDE_KEYS.includes(k)) errors.push(`${where}: unknown key "${k}"${/\s/.test(k) || c[k] === null ? COMMA_HINT : ""}`);
    if (c.component && c.items) errors.push(`${where}: use "component" or "items", not both`);
    if (!c.component && !c.items?.length) errors.push(`${where}: no items`);
    if (c.title !== undefined && (!Array.isArray(c.title) || c.title.length < 1 || c.title.length > 3 || c.title.some((x: unknown) => typeof x !== "string"))) errors.push(`${where}: "title" is a list of 1 to 3 lines (the second one is highlighted)`);
    if (c.alt !== undefined && typeof c.alt !== "string") errors.push(`${where}: "alt" must be text`);
    else if (typeof c.alt === "string" && c.alt.length > ALT_MAX) errors.push(`${where}: alt text has ${c.alt.length} characters (limit ${ALT_MAX})`);
    for (const x of [c.color]) if (badColor(x)) errors.push(`${where}: color "${x}" does not exist in the theme (use ${COLORS.join(", ")} or #hex)`);
    const items = c.items?.map((it: any, k: number) => normalizeItem(it, `${where} › item ${k + 1}`, errors));
    const med = (items ?? []).filter((it: any) => !it.pos).map((it: any) => measure(it, 940));
    const height = med.reduce((a: number, m: any) => a + m.h, 0) + Math.max(0, med.length - 1) * AREA.gap;
    if (height > 800) warnings.push(`${where}: items add up to ~${Math.round(height)} px of height and the slide has ~800 free (estimate): it may overflow`);
    return { id: `${id}Slide${String(i + 1).padStart(2, "0")}`, alt: c.alt, component: c.component, title: c.title, color: c.color, glow: c.glow, size: c.size, items };
  });
  const spec = { id, format: carousel ? "carousel" : "image", size: IMAGE_SIZE.name, width: IMAGE_SIZE.width, height: IMAGE_SIZE.height, slides };
  if (!errors.length && write) writeFileSync(join(_folder, "episode.spec.json"), JSON.stringify(spec, (_k, v) => (v === undefined ? undefined : v), 2) + "\n");
  return { spec: errors.length ? null : spec, errors, warnings };
}

// ---------- long (16:9) ----------
export const TYPES_LONG = ["code", "card", "text", "chip", "freetext", "video", "phone", "bar", "counter", "flow"];
const KEYS_LONG = new Set(["type", "when", "pos", "color", "size", "text", "parts", "title", "lines", "items", "align", "mono", "spacing", "src", "from", "clipDuration", "reg", "tag", "motionDuration", "value", "label", "duration", "to", "prefix", "suffix", "decimals", "nodes", "height"]);
/** Estimated rectangle (px) of a long-form item with an absolute position. */
function longRect(it: any): Rect | null {
  const p = it.pos; if (!p || p.left === undefined || p.top === undefined) return null;
  const txt = it.parts ? it.parts.map((x: any) => x.text).join("") : String(it.text ?? "");
  const reg = it.reg ?? [0, 0, 1920, 1080];
  if (it.type === "video") return { x: p.left, y: p.top, w: p.w ?? 900, h: (p.w ?? 900) * (reg[3] / reg[2]) };
  if (it.type === "phone") return { x: p.left, y: p.top, w: p.w ?? 400, h: (p.w ?? 400) * 16 / 9 };
  if (it.type === "bar") return { x: p.left, y: p.top, w: p.w ?? 800, h: (it.height ?? 46) + (it.label ? 44 : 0) };
  if (it.type === "counter") return { x: p.left, y: p.top, w: p.w ?? 700, h: (it.size ?? 96) * 1.15 };
  if (it.type === "flow") return { x: p.left, y: p.top, w: p.w ?? 1000, h: (it.size ?? 34) * 2.4 };
  if (it.type === "code") return { x: p.left, y: p.top, w: p.w ?? 940, h: 56 + (it.lines?.length ?? 0) * (it.size ?? 32) * 1.5 + 36 };
  if (it.type === "card") return { x: p.left, y: p.top, w: p.w ?? 700, h: p.h ?? 200 };
  if (it.type === "chip") return { x: p.left, y: p.top, w: txt.length * (it.size ?? 34) * 0.55 + 52, h: (it.size ?? 34) + 22 };
  if (it.type === "freetext") { const s = it.size ?? 44, w = p.w ?? txt.length * s * 0.55; return { x: p.left, y: p.top, w, h: s * 1.2 * Math.max(1, Math.ceil(txt.length * s * 0.55 / w)) }; }
  return null;
}
function compileLong({ y, info, words, folder, errors, warnings, write }: { y: any; info: any; words: Words; folder: string; errors: string[]; warnings: string[]; write: boolean }): CompileResult {
  for (const k of ["duration", "voice", "scenes"]) if (y[k] === undefined) errors.push(`missing "${k}"`);
  const id = y.id ?? info.id; if (!id) errors.push('missing "id"');
  if (errors.length) return { spec: null, errors, warnings };
  const timeOk = (x: any, where: string): void => {
    if (typeof x === "number") return;
    const o = typeof x === "string" ? { when: x } : x;
    if (!o || typeof o.when !== "string") { errors.push(`${where}: invalid time (use a number, "phrase" or { when, nth, after, plus })`); return; }
    if (words.length && findPhrase(words, o.when, o.nth ?? 0, o.after ?? 0) < 0) errors.push(`${where}: phrase "${o.when}"${o.nth ? ` (#${o.nth})` : ""}${o.after ? ` after ${o.after}s` : ""} does not appear in the voice (words.json)`);
  };
  const norm1 = (it: any, where: string): any => {
    if (!it || typeof it !== "object") { errors.push(`${where}: invalid item`); return it; }
    if (!TYPES_LONG.includes(it.type)) errors.push(`${where}: unknown type "${it.type}" (use ${TYPES_LONG.join(", ")})`);
    for (const k of Object.keys(it)) if (!KEYS_LONG.has(k)) errors.push(`${where}: unknown key "${k}"${/\s/.test(k) || it[k] === null ? COMMA_HINT : ""}`);
    const o = { ...it };
    if (it.pos) { o.pos = {}; for (const [k, v] of Object.entries(it.pos)) { if (!POS[k]) errors.push(`${where}: unknown pos.${k}`); else o.pos[POS[k]!] = v; } }
    if (badColor(it.color)) errors.push(`${where}: color "${it.color}" does not exist in the theme (use ${COLORS.join(", ")} or #hex)`);
    for (const x of it.parts ?? []) if (badColor(x.color)) errors.push(`${where}: color "${x.color}" does not exist in the theme`);
    if (["code", "card", "chip", "freetext", "video", "phone", "bar", "counter", "flow"].includes(it.type)) { if (it.when === undefined) errors.push(`${where}: missing "when" (the phrase of the voice that makes the item enter)`); if (!it.pos) errors.push(`${where}: missing "pos"`); }
    if (it.when !== undefined) timeOk(it.when, where);
    for (const n of it.nodes ?? []) { if (n.when === undefined) errors.push(`${where}: every "flow" node needs "when"`); else timeOk(n.when, `${where} › node`); }
    if (it.lines && it.type === "code") for (const l of it.lines) if (l.hl) { timeOk(l.hl[0], `${where} › hl`); timeOk(l.hl[1], `${where} › hl`); }
    if (it.items) o.items = it.items.map((f: any, i: number) => norm1(f, `${where} › ${f?.type ?? i}`));
    return o;
  };
  const blocks: any[] = readJson(join(folder, "blocks.json"), []);
  (y.scenes as any[]).forEach((c) => {
    if (c.start && typeof c.start === "object" && c.start.block !== undefined) {
      const b = blocks[c.start.block - 1];
      if (!b) errors.push(`scene "${c.title}": block ${c.start.block} does not exist in blocks.json (run \`praeko studio voice\` with the script in \`## title\` blocks)`);
      else c.start = +(b.a + (c.start.plus ?? 0)).toFixed(2);
    }
  });
  const scenesY: any[] = y.scenes;
  const scenes = scenesY.map((c, i) => {
    const name = `scene ${c.n ?? i + 1} (${c.title ?? "?"})`;
    for (const k of Object.keys(c)) if (!["n", "title", "start", "items", "component"].includes(k)) errors.push(`${name}: unknown key "${k}"${/\s/.test(k) || c[k] === null ? COMMA_HINT : ""}`);
    if (typeof c.start !== "number") errors.push(`${name}: missing "start" (s)`);
    if (i > 0 && c.start <= scenesY[i - 1]!.start) errors.push(`${name}: start ${c.start} does not come after the previous scene`);
    if (c.start >= y.duration) errors.push(`${name}: start after the end of the video`);
    if (c.component && c.items) errors.push(`${name}: use "component" or "items", not both`);
    if (!c.component && !c.items?.length) errors.push(`${name}: no items`);
    const items: any[] | undefined = c.items?.map((it: any, k: number) => norm1(it, `${name} › item ${k + 1}`));
    const end = i + 1 < scenesY.length ? scenesY[i + 1]!.start : y.duration;
    const abs = (items ?? []).map((it) => ({ it, r: longRect(it) })).filter((x): x is { it: any; r: Rect } => !!x.r);
    for (const x of abs) { if (x.r.x + x.r.w > 1920 + 1) warnings.push(`${name}: "${x.it.type}" goes past the right edge (≈${Math.round(x.r.x + x.r.w)} px of 1920)`); if (x.r.y + x.r.h > 960) warnings.push(`${name}: "${x.it.type}" goes down to ≈${Math.round(x.r.y + x.r.h)} px and covers the captions (from ~980 of 1080)`); }
    for (let a = 0; a < abs.length; a++) for (let b = a + 1; b < abs.length; b++) if (crosses(abs[a]!.r, abs[b]!.r)) warnings.push(`${name}: "${abs[a]!.it.type}" and "${abs[b]!.it.type}" overlap if they appear together (estimate)`);
    if (words.length) for (const it of items ?? []) { const w = it.when; const q = w === undefined ? null : (typeof w === "number" ? w : findPhrase(words, typeof w === "string" ? w : w.when, w.nth ?? 0, w.after ?? 0) + (w.plus ?? 0)); if (q !== null && q >= 0 && (q < c.start - 0.05 || q > end + 0.05)) warnings.push(`${name}: "${it.type}" enters at ${q.toFixed(1)} s, outside the scene (${c.start}–${end}): it appears early or never`); }
    return { n: c.n, title: c.title, start: c.start, items, component: c.component };
  });
  if (words.length) { const voiceEnd = words[words.length - 1]!.b; if (voiceEnd + 1 > y.duration) warnings.push(`duration (${y.duration} s) leaves less than 1 s after the end of the voice (${voiceEnd.toFixed(2)} s)`); }
  let cover: any;
  if (y.cover) {
    const c = y.cover, where = "cover";
    for (const k of Object.keys(c)) if (!["id", "title", "mascot", "code", "chips", "color", "glow"].includes(k)) errors.push(`${where}: unknown key "${k}"${/\s/.test(k) || c[k] === null ? COMMA_HINT : ""}`);
    if (!Array.isArray(c.title) || c.title.length !== 2) errors.push(`${where}: "title" needs 2 lines (the second one is highlighted): title: ["TWO CLICKS", "ONE ITEM"]`);
    else for (const l of c.title) if (String(l).length > 16) warnings.push(`${where}: line "${l}" has ${String(l).length} letters; on the 16:9 cover more than ~16 overflows`);
    for (const x of [c.color, ...(c.chips ?? []).map((k: any) => k.color)]) if (badColor(x)) errors.push(`${where}: color "${x}" does not exist in the theme`);
    if (c.code && !(c.code.lines ?? []).length) errors.push(`${where}: code without lines`);
    if ((c.code?.lines ?? []).length > 3) warnings.push(`${where}: more than 3 code lines do not fit in the 16:9 cover card`);
    cover = { id: c.id ?? `Cover${id}`, title: c.title, mascot: c.mascot, code: c.code, chips: c.chips, color: c.color, glow: c.glow };
  }
  let endcard: any;
  if (y.endcard) {
    const f = y.endcard;
    for (const k of Object.keys(f)) if (!["start", "text", "link", "image"].includes(k)) errors.push(`endcard: unknown key "${k}" (use start, text, link, image)`);
    if (typeof f.start !== "number") errors.push('endcard: missing "start" (s, "phrase" or { voice: N })');
    else if (f.start >= y.duration) errors.push(`endcard.start (${f.start}) must come before the duration (${y.duration})`);
    else if (y.duration - f.start < 3) warnings.push(`endcard: only ${(y.duration - f.start).toFixed(1)} s of end screen (use at least 3 s)`);
    endcard = { start: f.start, ...(f.text ? { text: String(f.text) } : {}), ...(f.link ? { link: String(f.link) } : {}), ...(f.image ? { image: String(f.image) } : {}) };
  }
  // mascot (HyperFrames engine only): [{ when, name, plus }] → the mascot image (brand.json mascotPath) appears in the corner at that moment
  const mascot = ((y.mascot ?? []) as any[]).map((m, i) => { timeOk(m?.when, `mascot ${i + 1}`); if (!m?.name) errors.push(`mascot ${i + 1}: missing "name" (the mascot image name; see brand.json mascotPath)`); return { when: m?.when, name: String(m?.name ?? ""), ...(m?.plus !== undefined ? { plus: m.plus } : {}) }; });
  if (y.engine !== undefined && !["remotion", "hyperframes"].includes(y.engine)) errors.push(`engine "${y.engine}" does not exist (use remotion or hyperframes)`);
  const spec = { id, durS: y.duration, voice: y.voice, ...(y.engine ? { engine: y.engine } : {}), scenes, ...(cover ? { cover } : {}), ...(endcard ? { endcard } : {}), ...(mascot.length ? { mascot } : {}) };
  if (!errors.length && write) writeFileSync(join(folder, "episode.spec.json"), JSON.stringify(spec, null, 2) + "\n");
  return { spec: errors.length ? null : spec, errors, warnings };
}

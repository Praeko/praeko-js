// What `praeko studio check` says about the skin of an episode: text/background contrast below the minimum and text that a pixelating
// post-process makes too small to read. Warnings only: a project without `style` gets none.
import { themeFromBrand } from "../../core/src/theme.ts";
import { CONTRAST_MIN, skinContrast, themeForSkin } from "../../core/src/skin.ts";
import { skinOf } from "../../core/src/skins.ts";
import type { Skin } from "../../core/src/skin.ts";

/** Kit text that has a fixed size (px at 1080x1920) per item type: the smallest text each item draws. */
const FIXED_TEXT: Record<string, { size: number; what: string }> = {
  bars: { size: 30, what: "bar labels and values" },
  code: { size: 26, what: "the code header" },
  bubble: { size: 26, what: "the bubble author" },
};
/** Real pixel height of a text after the skin (text scale) and its post-process (render scale). */
const realPx = (skin: Skin, size: number): number => size * (skin.textScale ?? 1) * (skin.post?.scale ?? 1);
/** Below this many real pixels a pixel font stops being readable. */
export const MIN_REAL_PX = 9;

function everyItem(items: any[] | undefined, f: (it: any) => void): void { for (const it of items ?? []) { f(it); everyItem(it.items, f); } }

/** Usable width of the panel (1080 − 2×70 − 2×48), where one-line items live. */
export const PANEL_TEXT_W = 844;
/** Smallest scale the kit shrinks one-line text to (`FIT_MIN` of @praeko/studio-kit). */
export const FIT_MIN = 0.45;
const chars = (s: unknown): number => String(s ?? "").length;
/**
 * Estimated width (px) of a one-line item in the skin's fonts (`fontAspect`/`monoAspect`, em per glyph), or null for items that wrap.
 * box/line/big/code/row are the ones the kit shrinks to fit (`useFitText`/`useFitRow`).
 */
export function oneLineWidth(it: any, skin: Skin): number | null {
  const fs = (n: number) => n * (skin.textScale ?? 1), A = skin.fontAspect, M = skin.monoAspect, stroke = 2 * (skin.surface.stroke || 0);
  switch (it?.type) {
    case "box": return chars(it.text) * fs(it.size ?? 48) * (it.mono ? M : A) + 56 + stroke;
    case "big": return chars(it.text) * fs(it.size ?? 120) * (it.mono ? M : A);
    case "line": { const parts: any[] = it.parts ?? []; return parts.reduce((a, p) => a + chars(p.text) * fs(it.size ?? 46) * (p.mono ? M : A), 0) + Math.max(0, parts.length - 1) * 22 + 60 + stroke; }
    case "code": return Math.max(chars(it.title) * fs(26) * M, ...(it.lines ?? []).map((l: any) => chars(l.s) * fs(30) * M)) + 58 + stroke;
    case "row": { const kids = (it.items ?? []).map((x: any) => oneLineWidth(x, skin) ?? 0); return kids.reduce((a: number, b: number) => a + b, 0) + Math.max(0, kids.length - 1) * (it.gap ?? 20); }
    default: return null;
  }
}
/** The scale the kit will shrink an item to (1 = fits), from the static estimate. */
export const fitScale = (it: any, skin: Skin, avail = PANEL_TEXT_W): number => { const w = oneLineWidth(it, skin); return w && w > avail ? Math.max(FIT_MIN, avail / w) : 1; };

/** Warnings about the skin of a compiled Short spec (`style`), with the project's brand.json. */
export function styleWarnings(spec: any, brand: any): string[] {
  const skin = skinOf(spec?.style);
  if (!skin || skin.id === "default") return [];
  const out: string[] = [];
  const theme = themeForSkin(themeFromBrand(brand ?? {}), skin, skinOf(spec?.channelStyle));
  for (const c of skinContrast(skin, theme)) out.push(`style "${skin.id}": ${c.where} is hard to read (${c.foreground} on ${c.background}: ${c.ratio}:1, minimum ${c.required}:1${c.required === CONTRAST_MIN.large ? " for large text" : ""}); change the color in brand.json or the item's color`);
  // one-line text that the kit has to shrink in this skin's fonts (top-level items of panel scenes; a row is measured as a whole)
  for (const [i, scene] of (spec?.scenes ?? []).entries()) {
    if ((scene.layout ?? "panel") === "free" && skin.dimension === "3d") out.push(`style "${skin.id}": scene ${i + 1} uses layout: free; in a 3D skin it is drawn on the slab face (940x1000 px, the panel area), so its positions count from the face's corner and anything past 940x1000 is cut. Keep free items inside that area or use a 2D skin for this episode`);
    for (const it of scene.items ?? []) {
      const avail = it.pos?.w ?? ((scene.layout ?? "panel") === "free" ? null : PANEL_TEXT_W);
      if (!avail) continue;
      const w = oneLineWidth(it, skin);
      if (!w || w <= avail) continue;
      const k = avail / w, label = `"${it.type}"${it.text ? ` "${String(it.text).slice(0, 24)}"` : ""}`;
      if (k < FIT_MIN) out.push(`style "${skin.id}": scene ${i + 1}: the ${label} is ~${Math.round(w)} px wide in this skin's font and does not fit even shrunk to ${Math.round(FIT_MIN * 100)}%: shorten it or split it into two items`);
      else if (k < 0.75) out.push(`style "${skin.id}": scene ${i + 1}: the ${label} is ~${Math.round(w)} px wide in this skin's font; it is shrunk to ~${Math.round(k * 100)}% to fit (consider shorter text)`);
      if (skin.post?.scale && it.type !== "row" && typeof (it.size ?? (it.type === "box" ? 48 : it.type === "line" ? 46 : undefined)) === "number" && realPx(skin, (it.size ?? (it.type === "box" ? 48 : 46)) * Math.max(k, FIT_MIN)) < MIN_REAL_PX) out.push(`style "${skin.id}": scene ${i + 1}: shrunk to fit, the ${label} ends up under ${MIN_REAL_PX} px tall after the pixel post-process: shorten it`);
    }
  }
  if (skin.post?.scale) {
    const seen = new Set<string>();
    for (const scene of spec?.scenes ?? []) everyItem(scene.items, (it) => {
      const fixed = FIXED_TEXT[it.type];
      if (fixed && !seen.has(it.type) && realPx(skin, fixed.size) < MIN_REAL_PX) { seen.add(it.type); out.push(`style "${skin.id}": ${fixed.what} (${fixed.size} px) end up ~${realPx(skin, fixed.size).toFixed(0)} px tall after the pixel post-process and are hard to read; prefer big, text, box`); }
      const size = it.type === "big" ? it.size : it.size ?? (it.type === "text" || it.type === "card" ? 40 : it.type === "line" ? 46 : it.type === "box" ? 48 : undefined);
      if (typeof size === "number" && realPx(skin, size) < MIN_REAL_PX && !seen.has(`size${size}`)) { seen.add(`size${size}`); out.push(`style "${skin.id}": a "${it.type}" with size ${size} ends up ~${realPx(skin, size).toFixed(0)} px tall after the pixel post-process; use size ${Math.ceil(MIN_REAL_PX / ((skin.textScale ?? 1) * skin.post!.scale!))} or more`); }
    });
  }
  return out;
}

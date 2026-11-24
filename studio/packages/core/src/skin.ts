// SKIN: the whole look of an episode as DATA. The kit reads these tokens; the episode (YAML) does not change.
// Pure TypeScript (no React, no Remotion): the CLI imports this file to validate `style`, check contrast and run the post-process.
import { DEFAULT_THEME } from "./theme.ts";
import type { Theme } from "./theme.ts";

/** A color token: a theme name (`accent`, `text`…), `#hex`, `rgb(…)`/`rgba(…)`, `transparent`, or `name@alpha` / `#hex@alpha`. */
export type ColorToken = string;
export const COLOR_KEYS = ["background", "coverBackground", "accent", "text", "muted", "ok", "error", "info", "extra", "box", "code"] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];
export type SkinColors = Partial<Record<ColorKey, string>>;

/** 3D stage (path A'): the kit's panel DOM is rasterized into a texture on the face of a lit slab, in a three.js stage. All of it is data. */
export type SkinStage = {
  /** surface of the slab, floor and props */
  material: "clay" | "plastic" | "neon" | "pbr";
  /** building-block studs on top of the slab and the props */
  studs?: boolean;
  lights: { hemi: number; hemiSky: string; hemiGround: string; key: number; keyColor: string; fill: number; fillColor: string; rim: number; rimColor: string };
  exposure: number;
  shadows: boolean;
  /** linear fog [near, far] in world units; null = none */
  fog: [number, number] | null;
  /** sweep = floor and back wall in the background color; grid = glowing grid floor; none */
  floor: "sweep" | "grid" | "none";
  /** a striped sun on the horizon (retro) */
  sun?: boolean;
  /** 0..1: the panel face also gives off its own light, so text stays readable under low-key lighting (cinema); 0 = lit only by the stage */
  faceLight?: number;
  /** how many generic props (spheres, rings, capsules…) float around the slab */
  props: number;
  /** CSS over the 3D canvas (under the captions): vignette 0..1 and film grain 0..1 */
  overlay?: { vignette?: number; grain?: number };
};

/** Post-process run by the CLI after the render (ffmpeg, both engines): it is not CSS. */
export type SkinPost = {
  /** render size factor before the upscale (e.g. 1/3 = 360x640 for a Short), upscaled back by nearest neighbor */
  scale?: number;
  /** fixed palette (#hex), applied without dithering */
  palette?: string[];
  /** CRT/VHS: scanlines, chromatic shift, curvature, noise, vignette */
  crt?: boolean;
};

export type Skin = {
  /** slug in English: the key of the registry and the value of `style` */
  id: string;
  name: string;
  dimension: "2d" | "3d";
  /** one line for the brief/playbook */
  description: string;
  /** what an agent must never do in this style (goes to the playbook) */
  avoid: string[];
  /** palette over the brand (see `themeForSkin`: the person's own colors win) */
  colors?: SkinColors;
  /** CSS font stacks (system fonts or a family the project loads; nothing is bundled) */
  font?: string;
  mono?: string;
  /** font files the skin needs, relative to public/ (none ship with the Studio: the person or the agent provides them) */
  fontFaces?: { family: string; src: string }[];
  background: { kind: "terminal" | "plain" | "css"; css?: string };
  panel: { fill: string; stroke: number; strokeColor?: ColorToken; radius: number; shadow: string; titleColor?: ColorToken; titleSize: number; letterSpacing: number; pop: boolean };
  /** surfaces = box, line, bubble, code, card */
  surface: {
    /** box = theme.box; tint = item color at 14%; pastel = item color mixed with white; anything else = a CSS color */
    fill: "box" | "tint" | "pastel" | string;
    /** text color on surfaces (default theme.text) */
    ink?: ColorToken;
    /** border width (0 = none) */
    stroke: number;
    /** hand = a hand-drawn SVG outline (chalk) instead of the CSS border */
    strokeStyle?: "solid" | "hand";
    /** border color (default: the item color) */
    strokeColor?: ColorToken;
    /** multiplier over the kit's radii (22–28 px) */
    radius: number;
    shadow: string;
    /** extra inset shadows (clay) */
    bevel?: string;
    /** comic dots over the surface */
    halftone?: boolean;
  };
  /** neon glow (px) around strokes and big text; 0 = off */
  glow: number;
  /** 0..1 grain over surfaces and the panel */
  grain: number;
  big: { shadow?: string };
  bars: { from: string | null; height: number; radius: number; track: ColorToken; trackStroke: ColorToken | null; blocks?: number };
  code: { header: ColorToken; headerText: ColorToken; body?: ColorToken; ink?: ColorToken };
  /** quote = the kit's bubble with a big quote mark; comic = speech balloon with a tail */
  bubble: { kind: "quote" | "comic" };
  caption: {
    active: ColorToken; spoken: ColorToken; unspoken: ColorToken; shadow: string; uppercase: boolean;
    /** a box behind the caption line (flat pill, comic balloon) */
    box?: { fill: string; radius: string | number; border?: string; shadow?: string; tail?: boolean };
  };
  label: { fill: ColorToken; text: ColorToken; radius: number; shadow: string; border?: string; skew?: number; underline?: string; prefix?: string };
  progress: { height: number; track: string; fill: ColorToken; glow?: string };
  motion: { ease: [number, number, number, number]; dur: number; pop: [number, number, number]; slide: number; steps?: number };
  /** pixel fonts are wider: scales the kit's text sizes */
  textScale?: number;
  /** average glyph width of the title font, in em (uppercase-heavy text): the `check` uses it to estimate when one-line text has to shrink */
  fontAspect: number;
  /** the same for the mono font */
  monoAspect: number;
  lineHeight?: number;
  /** sound set folder under public/ (default `sfx`); a missing folder falls back to `sfx` only if the files are there */
  sfxDir?: string;
  post?: SkinPost;
  /** only 3D skins */
  stage?: SkinStage;
};

/** Reproduces the kit as it was before skins (values copied from parts.tsx/engine.tsx of 0.3.0): rendering with it is identical. */
export const SKIN_DEFAULT: Skin = {
  id: "default", name: "Default", dimension: "2d",
  description: "The Studio's original look: dark background, terminal lines, amber accent, bold rounded cards.",
  avoid: [],
  background: { kind: "terminal" },
  panel: { fill: "rgba(20,17,15,.94)", stroke: 4, radius: 36, shadow: "0 24px 60px rgba(0,0,0,.6)", titleSize: 38, letterSpacing: 5, pop: true },
  surface: { fill: "box", stroke: 4, radius: 1, shadow: "none" },
  glow: 0, grain: 0,
  big: {},
  bars: { from: "#b9453a", height: 34, radius: 10, track: "#1d1812", trackStroke: "#3a2f22" },
  code: { header: "#1c1830", headerText: "#8b86a8" },
  bubble: { kind: "quote" },
  caption: { active: "accent", spoken: "text", unspoken: "text@0.55", shadow: "0 6px 0 #000, 0 0 24px rgba(0,0,0,.85), 4px 0 0 #000, -4px 0 0 #000", uppercase: true },
  label: { fill: "accent", text: "background", radius: 22, shadow: "0 10px 30px rgba(0,0,0,.55)" },
  progress: { height: 10, track: "rgba(0,0,0,.4)", fill: "accent" },
  motion: { ease: [0.16, 1, 0.3, 1], dur: 0.35, pop: [0.6, 1.14, 1], slide: 1 },
  fontAspect: 0.66, monoAspect: 0.6,
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends (infer U)[] ? U[] : T[K] extends object ? DeepPartial<T[K]> : T[K] };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function merge<T>(a: T, b: unknown): T {
  if (!isObj(b)) return a;
  const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
  for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k], v) : v;
  return out as T;
}
/** A skin from the fields that differ from `base` (default: the default skin). Nested objects merge; arrays replace. */
export const defineSkin = (s: DeepPartial<Skin> & { id: string; name: string; dimension: "2d" | "3d"; description: string }, base: Skin = SKIN_DEFAULT): Skin => merge({ ...base, avoid: [], colors: undefined, font: undefined, mono: undefined, post: undefined, stage: undefined, fontFaces: undefined, sfxDir: undefined, textScale: undefined, lineHeight: undefined }, s);

// ---------- colors ----------
export type RGBA = { r: number; g: number; b: number; a: number };
/** #rgb, #rrggbb, #rrggbbaa, rgb(), rgba(), transparent → RGBA (0..255, alpha 0..1); null for anything else (gradients, names). */
export function parseColor(c: string | undefined | null): RGBA | null {
  if (!c) return null;
  const s = c.trim().toLowerCase();
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1]!;
    if (h.length === 3 || h.length === 4) h = h.split("").map((x) => x + x).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const n = parseInt(h.slice(0, 6), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
  }
  m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const p = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.slice(0, 3).some((x) => !Number.isFinite(x))) return null;
    return { r: p[0]!, g: p[1]!, b: p[2]!, a: p.length > 3 && Number.isFinite(p[3]) ? p[3]! : 1 };
  }
  return null;
}
const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
export const toHex = (c: RGBA): string => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
/** `fg` painted over an opaque `bg`. */
export const over = (fg: RGBA, bg: RGBA): RGBA => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });

/** "#f4b942" + 0.16 -> "rgba(244,185,66,0.16)" (same string as core's `rgba`). */
const withAlpha = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
/** Resolves a color token against the theme: theme name, CSS color, or `name@alpha`. Undefined stays undefined. */
export const tok = (T: Theme, v?: ColorToken | null): string | undefined => {
  if (!v) return undefined;
  const [n, a] = v.split("@") as [string, string | undefined];
  const c = n.startsWith("#") || n.startsWith("rgb") || n === "transparent" ? n : ((T as Record<string, unknown>)[n] as string | undefined) ?? n;
  return a !== undefined && c.startsWith("#") && c.length === 7 ? withAlpha(c, +a) : c;
};
/** A #hex color mixed with white (w = 0..1): the pastel surfaces of clay. Non-hex colors pass through. */
export const mixWhite = (hex: string, w: number): string => {
  if (!hex.startsWith("#") || hex.length !== 7) return hex;
  const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => Math.round(x + (255 - x) * w));
  return `rgb(${c.join(",")})`;
};
/** Background color of a surface (box, line, bubble, code, card) whose item color is `color`. */
export const surfaceFill = (S: Skin, T: Theme, color: string): string => {
  const f = S.surface.fill;
  return f === "box" ? T.box : f === "tint" ? (color.startsWith("#") ? withAlpha(color, 0.14) : T.box) : f === "pastel" ? mixWhite(color, 0.72) : (tok(T, f) ?? f);
};

/**
 * The theme an episode renders with: the brand theme plus the skin palette and fonts. A brand color still at the Studio default
 * (or equal to the channel skin's, written by the interview) is not a choice of the person, so the skin's wins; any other brand color stays.
 */
export function themeForSkin(theme: Theme, skin: Skin, channel?: Skin): Theme {
  const out: Theme = { ...theme };
  const untouched = (v: string | undefined, def: string | undefined, ch: string | undefined) => v === undefined || v === def || (ch !== undefined && v === ch);
  for (const k of COLOR_KEYS) {
    const s = skin.colors?.[k];
    if (s !== undefined && untouched(theme[k], DEFAULT_THEME[k], channel?.colors?.[k])) out[k] = s;
  }
  if (skin.font && untouched(theme.font, DEFAULT_THEME.font, channel?.font)) out.font = skin.font;
  if (skin.mono && untouched(theme.mono, DEFAULT_THEME.mono, channel?.mono)) out.mono = skin.mono;
  return out;
}

// ---------- contrast (WCAG 2.x relative luminance) ----------
export function relativeLuminance(c: RGBA): number {
  const [r, g, b] = [c.r, c.g, c.b].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Contrast ratio (1..21) of two opaque colors. */
export function contrast(a: RGBA, b: RGBA): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return +(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)).toFixed(2));
}
export type ContrastIssue = { where: string; foreground: string; background: string; ratio: number; required: number };
/** Minimum ratios: 4.5 for body text, 3 for large/bold text (WCAG AA). */
export const CONTRAST_MIN = { text: 4.5, large: 3 } as const;

/**
 * Text/background pairs of a skin that fall below the minimum, with the episode theme (`themeForSkin`). Semi-transparent colors are painted
 * over what is behind them (surface over panel over background). Gradients and images are skipped (no single color to measure).
 */
export function skinContrast(skin: Skin, T: Theme): ContrastIssue[] {
  const out: ContrastIssue[] = [];
  const bg0 = parseColor(skin.background.kind === "css" ? null : T.background) ?? parseColor(T.background) ?? { r: 0, g: 0, b: 0, a: 1 };
  const solid = (c: string | undefined, under: RGBA): RGBA | null => { const p = parseColor(c); return p ? over(p, under) : null; };
  const panel = skin.dimension === "3d" ? (solid(T.box, bg0) ?? bg0) : (solid(skin.panel.fill, bg0) ?? bg0);
  const add = (where: string, fg: string | undefined, under: RGBA | null, required: number) => {
    const f = parseColor(fg); if (!f || !under) return;
    const ratio = contrast(over(f, under), under);
    if (ratio < required) out.push({ where, foreground: toHex(over(f, under)), background: toHex(under), ratio, required });
  };
  add("panel title", tok(T, skin.panel.titleColor) ?? T.accent, panel, CONTRAST_MIN.large);
  add("text on the panel", T.text, panel, CONTRAST_MIN.text);
  add("muted text on the panel (bars labels)", T.muted, panel, CONTRAST_MIN.text);
  const ink = tok(T, skin.surface.ink) ?? T.text;
  for (const name of ["accent", "info", "error", "ok", "extra"] as const) {
    const fill = solid(surfaceFill(skin, T, T[name]), panel);
    add(`text on a ${name} surface (box, line, bubble, card)`, ink, fill, CONTRAST_MIN.text);
  }
  const codeBody = solid(tok(T, skin.code.body) ?? surfaceFill(skin, T, T.error), panel);
  add("code lines", tok(T, skin.code.ink) ?? T.text, codeBody, CONTRAST_MIN.text);
  const header = solid(tok(T, skin.code.header), panel);
  add("code header", tok(T, skin.code.headerText), header, CONTRAST_MIN.large);
  const labelFill = tok(T, skin.label.fill);
  // a transparent label sits on the background; a gradient label has no single color to measure (skipped)
  if (parseColor(labelFill)) add("scene label", tok(T, skin.label.text), solid(labelFill, bg0), CONTRAST_MIN.large);
  if (skin.caption.box) add("caption on its box", tok(T, skin.caption.spoken), solid(tok(T, skin.caption.box.fill), bg0), CONTRAST_MIN.large);
  return out;
}

/** Same idea as Remotion's `steps`: quantizes a 0..1 progress into n steps (8-bit motion). */
export const stepped = (v: number, n?: number): number => (n ? Math.floor(v * n) / n : v);

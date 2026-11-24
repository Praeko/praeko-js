// Choices of the brand interview about how the channel's videos are made and look: source (script or own video), formats, visual style and editing style.
// Slugs are English (they go into brand.json and episode.yaml); the names shown follow the person's language (pt names live in i18n-pt.ts).
import { PT_STYLES } from "./i18n-pt.ts";

export const SOURCES = ["script", "video"] as const;
export type Source = (typeof SOURCES)[number];
export const FORMATS = ["short", "long", "carousel", "image"] as const;
export type Format = (typeof FORMATS)[number];
export const STYLES_2D = ["flat", "minimal", "neon", "comic", "chalkboard", "pixel", "8bit", "retro-crt"] as const;
export const STYLES_3D = ["clay-3d", "blocks-3d", "retro-3d", "cinema-3d"] as const;
export const STYLES = [...STYLES_2D, ...STYLES_3D] as const;
export type Style = (typeof STYLES)[number];
/** Advised number of visual styles (1 or 2 give the channel an identity); more is allowed, with a soft warning. */
export const STYLE_ADVISED_MAX = 2;

export const PACES = ["calm", "fast"] as const;
export const CAPTIONS = ["word", "phrase", "none"] as const;
export const EFFECTS = ["shake", "zoom", "flash"] as const;
export const SOUNDS = ["sfx", "none"] as const;
export const FACES = ["face", "mascot", "none"] as const;
/** Editing style. A missing key = the Studio default (word captions, the three hits available, the four sound effects available). `effects: []` = none. */
export type Edit = { pace?: (typeof PACES)[number]; captions?: (typeof CAPTIONS)[number]; effects?: (typeof EFFECTS)[number][]; sound?: (typeof SOUNDS)[number]; face?: (typeof FACES)[number] };
export const EDIT_KEYS = ["pace", "captions", "effects", "sound", "face"] as const;

/** What the person liked in a reference (guided answer; free text is still accepted). */
export const LIKED = ["pace", "opening", "look", "captions"] as const;
export type Liked = (typeof LIKED)[number];

/**
 * Visual styles whose skin exists in @praeko/studio-kit (the engine applies them). A style outside this list is kept as an instruction for the agent
 * and the interview says so. Coordinated with the skin registry of the kit (plan, section 11): keep both lists equal.
 */
export const SKINS_READY: readonly string[] = STYLES;
export const presetReady = (slug: string): boolean => SKINS_READY.includes(slug);

type L = "en" | "pt";
const EN_STYLES: Record<Style, { name: string; look: string; never: string }> = {
  flat: { name: "Flat", look: "Solid colors, simple shapes, no gradients or textures; clean and bright.", never: "Never add gradients, drop shadows or photographic textures." },
  minimal: { name: "Minimal", look: "Lots of empty space, one idea per screen, few colors and thin lines.", never: "Never crowd the screen: no more than one highlight per scene, no decoration for its own sake." },
  neon: { name: "Neon", look: "Dark background with glowing lines and text in saturated colors.", never: "Never put neon on a light background or glow on body text that must be read." },
  comic: { name: "Comic book", look: "Thick outlines, flat colors, halftone dots, speech balloons and sound words.", never: "Never use thin outlines or soft gradients; never fill a balloon with more than one short sentence." },
  chalkboard: { name: "Chalkboard", look: "Dark green or black board, chalk-like strokes and handwritten text.", never: "Never use glossy or neon colors; never use perfect geometric shapes for everything." },
  pixel: { name: "Pixel art", look: "Low resolution, hard pixels, a fixed palette; sprites drawn or provided by the person or the agent.", never: "Never smooth or blur the pixels, never mix in high-resolution images; Studio ships no sprites or pixel fonts." },
  "8bit": { name: "8-bit", look: "Console look of the 80s: a fixed palette, big pixels, chiptune-style sounds provided by the person.", never: "Never use colors outside the fixed palette or small text (it becomes unreadable at low resolution)." },
  "retro-crt": { name: "Retro CRT/VHS", look: "Old TV or VHS tape: scan lines, slight color bleed, grain and rounded screen.", never: "Never overdo the noise on text that must be read; no glitch on the captions." },
  "clay-3d": { name: "Clay 3D", look: "Soft clay-like 3D shapes, pastel colors, studio light and soft shadows.", never: "Never use hard shadows or thin outlines; never flat 2D icons on top of the clay." },
  "blocks-3d": { name: "Building blocks 3D", look: "Plastic building blocks with studs, glossy and colorful, in 3D.", never: "Never imitate a toy brand's logo or minifigures; never matte, dull plastic." },
  "retro-3d": { name: "Retro 3D", look: "80s synthwave 3D: grid floor, glowing horizon, emissive lines.", never: "Never use realistic textures or daylight; keep text off the busiest part of the grid." },
  "cinema-3d": { name: "Cinematic 3D", look: "Dark and moody 3D with dramatic light, slow camera moves and depth.", never: "Never use flat, even light or fast cartoon motion; never hide the text in the dark areas." },
};
export const styleName = (slug: string, l: L): string => (l === "pt" ? PT_STYLES[slug]?.name : undefined) ?? (EN_STYLES as Record<string, { name: string }>)[slug]?.name ?? slug;
export const styleLook = (slug: string, l: L): string | undefined => (l === "pt" ? PT_STYLES[slug]?.look : undefined) ?? (EN_STYLES as Record<string, { look: string }>)[slug]?.look;
export const styleNever = (slug: string, l: L): string | undefined => (l === "pt" ? PT_STYLES[slug]?.never : undefined) ?? (EN_STYLES as Record<string, { never: string }>)[slug]?.never;
export const is3d = (slug: string): boolean => (STYLES_3D as readonly string[]).includes(slug);

/**
 * Theme tokens a style suggests for brand.json. They only fill what is still at the default of the previous style (or the Studio's initial value):
 * a color or font the person changed is never replaced. System font stacks only (Studio ships no fonts).
 */
export type StyleTokens = { colors: { background: string; accent: string; text: string; muted: string; box: string; code: string; coverBackground: string }; title?: string };
/** The values `init` writes in brand.json before any style (templates.ts builds the initial brand.json from these). */
export const STUDIO_TOKENS: StyleTokens = { colors: { background: "#14110f", accent: "#f4b942", text: "#f3ece0", muted: "#a89c8a", box: "#2a2118", code: "#1b1610", coverBackground: "#0e0c14" }, title: "'Arial Black', 'Helvetica Neue', system-ui, sans-serif" };
/** The token a key had under `style` (the Studio's own value without a style). */
export const tokenOf = (style: string | undefined, key: keyof StyleTokens["colors"] | "title"): string | undefined => {
  const t = style && (STYLE_TOKENS as Record<string, StyleTokens>)[style] ? (STYLE_TOKENS as Record<string, StyleTokens>)[style]! : STUDIO_TOKENS;
  return key === "title" ? (t.title ?? STUDIO_TOKENS.title) : t.colors[key];
};
export const STYLE_TOKENS: Record<Style, StyleTokens> = {
  flat: { colors: { background: "#1f2a44", accent: "#ffb703", text: "#ffffff", muted: "#a9b4cc", box: "#2b3a5c", code: "#17203a", coverBackground: "#18213a" } },
  minimal: { colors: { background: "#f7f7f4", accent: "#2563eb", text: "#111111", muted: "#5f6368", box: "#ebebe6", code: "#e2e2dc", coverBackground: "#ffffff" }, title: "'Helvetica Neue', Arial, system-ui, sans-serif" },
  neon: { colors: { background: "#0a0614", accent: "#ff2bd6", text: "#e9f7ff", muted: "#8f86b3", box: "#1a0f2e", code: "#120a22", coverBackground: "#06030d" } },
  comic: { colors: { background: "#fff4d6", accent: "#e63946", text: "#111111", muted: "#5a4a3a", box: "#ffe7a8", code: "#fbe3b5", coverBackground: "#fff0c2" }, title: "'Comic Sans MS', 'Chalkboard SE', system-ui, sans-serif" },
  chalkboard: { colors: { background: "#23332b", accent: "#f6e27a", text: "#f2f2ec", muted: "#a9b8ad", box: "#2e4237", code: "#1d2a23", coverBackground: "#1b2821" }, title: "'Chalkboard SE', 'Comic Sans MS', system-ui, sans-serif" },
  pixel: { colors: { background: "#1d2b53", accent: "#ffec27", text: "#fff1e8", muted: "#c2c3c7", box: "#29366f", code: "#141d3a", coverBackground: "#151f3d" }, title: "'Courier New', ui-monospace, monospace" },
  "8bit": { colors: { background: "#0f0f1b", accent: "#f8b800", text: "#fcfcfc", muted: "#a4a4bc", box: "#1f1f33", code: "#0a0a14", coverBackground: "#08080f" }, title: "'Courier New', ui-monospace, monospace" },
  "retro-crt": { colors: { background: "#0b0f0b", accent: "#33ff66", text: "#d8ffd8", muted: "#7fae86", box: "#132013", code: "#070b07", coverBackground: "#050805" }, title: "'Courier New', ui-monospace, monospace" },
  "clay-3d": { colors: { background: "#f6e7d8", accent: "#ff7a59", text: "#3b2f2a", muted: "#7d6b60", box: "#ecd5c0", code: "#e6cdb6", coverBackground: "#f2dcc8" } },
  "blocks-3d": { colors: { background: "#e9eef5", accent: "#e4312b", text: "#1b1b1b", muted: "#5b6270", box: "#d6dfeb", code: "#cdd7e4", coverBackground: "#dfe6f0" } },
  "retro-3d": { colors: { background: "#1a0b2e", accent: "#ff6ad5", text: "#f8f0ff", muted: "#a88fc9", box: "#2a1447", code: "#12071f", coverBackground: "#12071f" } },
  "cinema-3d": { colors: { background: "#0d0d0f", accent: "#e0b15a", text: "#f2efe8", muted: "#9a958c", box: "#1a1a1e", code: "#08080a", coverBackground: "#070708" } },
};

/** Applied by the Studio's engine (true) or kept as an instruction for the agent (false). */
export function appliedByStudio(key: (typeof EDIT_KEYS)[number], value: string): boolean {
  if (key === "captions") return value === "word";
  if (key === "effects") return value !== "none";
  if (key === "sound") return value === "sfx";
  return false; // pace, face, mascot: the agent follows them
}

/** Parses a list answer: numbers (1-based, in the order of `options`) or slugs separated by commas or spaces. Returns null when anything is unknown. */
export function parseChoice<T extends string>(v: string, options: readonly T[], extra: readonly string[] = []): (T | string)[] | null {
  const out: (T | string)[] = [];
  for (const raw of v.split(/[,\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)) {
    const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
    const all = [...options, ...extra];
    const hit = !Number.isNaN(n) && !options.includes(raw as T) ? all[n - 1] : all.find((o) => o === raw);
    if (!hit) return null;
    if (!out.includes(hit)) out.push(hit);
  }
  return out;
}

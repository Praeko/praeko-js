// The skin registry: slug (English) → Skin. Pure data; the CLI validates `style` against it.
// Fonts are CSS stacks with system fallbacks: nothing is bundled (the person or the agent provides font files, sprites and chiptune sounds).
import { SKIN_DEFAULT, defineSkin } from "./skin.ts";
import type { Skin } from "./skin.ts";

/** PICO-8 (16 fixed colors). */
export const PALETTE_PICO8 = ["#000000", "#1d2b53", "#7e2553", "#008751", "#ab5236", "#5f574f", "#c2c3c7", "#fff1e8", "#ff004d", "#ffa300", "#ffec27", "#00e436", "#29adff", "#83769c", "#ff77a8", "#ffccaa"];
/** DawnBringer 32. */
export const PALETTE_DB32 = ["#000000", "#222034", "#45283c", "#663931", "#8f563b", "#df7126", "#d9a066", "#eec39a", "#fbf236", "#99e550", "#6abe30", "#37946e", "#4b692f", "#524b24", "#323c39", "#3f3f74", "#306082", "#5b6ee1", "#639bff", "#5fcde4", "#cbdbfc", "#ffffff", "#9badb7", "#847e87", "#696a6a", "#595652", "#76428a", "#ac3232", "#d95763", "#d77bba", "#8f974a", "#8a6f30"];

const FLAT_UI = "'Helvetica Neue', Helvetica, Arial, sans-serif";

export const SKIN_FLAT = defineSkin({
  id: "flat", name: "Flat", dimension: "2d",
  description: "Light, clean and modern: solid soft colors, no outlines, gentle motion.",
  avoid: ["hard drop shadows", "glow", "textures or grain", "more than one accent per scene"],
  colors: { background: "#f3efe6", coverBackground: "#f3efe6", text: "#1f1d24", muted: "#6b6470", accent: "#d9480f", ok: "#2b8a3e", error: "#c92a2a", info: "#1864ab", extra: "#5f3dc4", box: "#ffffff", code: "#ffffff" },
  fontAspect: 0.56, font: FLAT_UI,
  background: { kind: "plain" },
  panel: { fill: "#ffffff", stroke: 0, radius: 28, shadow: "0 2px 0 rgba(0,0,0,.06)", titleColor: "muted", titleSize: 34, letterSpacing: 3 },
  surface: { fill: "tint", stroke: 0, radius: 0.7, shadow: "none" },
  bars: { from: null, height: 38, radius: 6, track: "#ece7dd", trackStroke: null },
  code: { header: "#f1ede4", headerText: "muted" },
  caption: { active: "accent", spoken: "text", unspoken: "text@0.35", shadow: "none", uppercase: false, box: { fill: "#ffffffee", radius: 26 } },
  label: { fill: "text", text: "background", radius: 10, shadow: "none" },
  progress: { height: 10, track: "#ece7dd", fill: "accent" },
  motion: { ease: [0.4, 0, 0.2, 1], dur: 0.25, pop: [0.9, 1.02, 1], slide: 0.5 },
});

export const SKIN_MINIMAL = defineSkin({
  id: "minimal", name: "Minimal", dimension: "2d",
  description: "Black on off-white with one accent, thin lines, lots of space and almost no motion.",
  avoid: ["more than one accent color", "shadows, glow or textures", "big bouncy animations", "filled colored boxes"],
  colors: { background: "#f6f6f3", coverBackground: "#f6f6f3", text: "#111111", muted: "#5c5c5c", accent: "#e64500", ok: "#1a7f37", error: "#cf222e", info: "#0969da", extra: "#8250df", box: "#ffffff", code: "#ffffff" },
  fontAspect: 0.56, font: "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif",
  background: { kind: "plain" },
  panel: { fill: "transparent", stroke: 0, radius: 0, shadow: "none", titleColor: "muted", titleSize: 30, letterSpacing: 10 },
  surface: { fill: "box", stroke: 2, strokeColor: "text", radius: 0.25, shadow: "none" },
  bars: { from: null, height: 20, radius: 0, track: "#e4e4e0", trackStroke: null },
  code: { header: "#efefeb", headerText: "muted" },
  caption: { active: "accent", spoken: "text", unspoken: "text@0.3", shadow: "none", uppercase: false },
  label: { fill: "transparent", text: "text", radius: 0, shadow: "none", underline: "3px solid #111111" },
  progress: { height: 3, track: "#e4e4e0", fill: "text" },
  motion: { ease: [0.4, 0, 0.2, 1], dur: 0.3, pop: [0.96, 1, 1], slide: 0.3 },
});

export const SKIN_NEON = defineSkin({
  id: "neon", name: "Neon", dimension: "2d",
  description: "Black background, glowing magenta and cyan lines, a faint grid, snappy motion.",
  avoid: ["light backgrounds", "pastel colors", "soft drop shadows (use glow)", "slow fades"],
  colors: { background: "#000000", coverBackground: "#000000", text: "#f4f6ff", muted: "#9aa1c7", accent: "#ff2bd6", ok: "#39ff88", error: "#ff3b5c", info: "#22e4ff", extra: "#b46bff", box: "#04040a", code: "#04040a" },
  fontAspect: 0.66, font: "'Arial Black', system-ui, sans-serif",
  background: { kind: "css", css: "radial-gradient(ellipse at 50% 30%, rgba(255,43,214,.10) 0%, rgba(0,0,0,0) 60%), repeating-linear-gradient(0deg, rgba(34,228,255,.07) 0 2px, transparent 2px 80px), repeating-linear-gradient(90deg, rgba(34,228,255,.07) 0 2px, transparent 2px 80px), #000" },
  panel: { fill: "rgba(0,0,0,.82)", stroke: 3, strokeColor: "info", radius: 14, shadow: "0 0 28px rgba(34,228,255,.55), inset 0 0 28px rgba(34,228,255,.25)", titleColor: "info", titleSize: 36, letterSpacing: 8 },
  surface: { fill: "box", stroke: 3, radius: 0.45, shadow: "none" },
  glow: 18,
  bars: { from: null, height: 30, radius: 2, track: "#000000", trackStroke: "#22e4ff" },
  code: { header: "#0b0b18", headerText: "info" },
  caption: { active: "accent", spoken: "text", unspoken: "text@0.45", shadow: "0 0 18px #ff2bd6, 0 0 4px #000, 3px 3px 0 #000", uppercase: true },
  label: { fill: "#000000", text: "accent", radius: 8, shadow: "0 0 0 3px #ff2bd6, 0 0 30px #ff2bd6" },
  progress: { height: 8, track: "#000000", fill: "info", glow: "0 0 14px #22e4ff" },
  motion: { ease: [0.7, 0, 0.2, 1], dur: 0.18, pop: [1.3, 0.95, 1], slide: 0 },
});

const CRT_FONT = "VT323, 'Courier New', monospace";
export const SKIN_RETRO_CRT = defineSkin({
  id: "retro-crt", name: "Retro CRT", dimension: "2d",
  description: "Green phosphor terminal on a curved, noisy CRT/VHS screen (the scanlines are a post-process).",
  avoid: ["clean flat gradients", "thin fonts", "pure white text", "rounded friendly shapes"],
  colors: { background: "#070b09", coverBackground: "#070b09", text: "#d8ffe0", muted: "#86b394", accent: "#ffb000", ok: "#7dff9a", error: "#ff6b5e", info: "#6fd3ff", extra: "#d7a6ff", box: "#0f1a14", code: "#0f1a14" },
  fontAspect: 0.5, monoAspect: 0.5, font: CRT_FONT, mono: CRT_FONT,
  background: { kind: "css", css: "repeating-linear-gradient(0deg, rgba(125,255,154,.035) 0 2px, transparent 2px 6px), radial-gradient(ellipse at 50% 40%, #12241a 0%, #070b09 75%)" },
  panel: { fill: "rgba(0,0,0,.6)", stroke: 3, strokeColor: "ok", radius: 0, shadow: "0 0 18px rgba(125,255,154,.35)", titleColor: "ok", titleSize: 44, letterSpacing: 4 },
  surface: { fill: "box", stroke: 3, radius: 0, shadow: "none" },
  glow: 6,
  bars: { from: null, height: 30, radius: 0, track: "#0a120d", trackStroke: "ok", blocks: 18 },
  code: { header: "#16261c", headerText: "ok" },
  caption: { active: "accent", spoken: "text", unspoken: "text@0.45", shadow: "0 0 12px rgba(120,255,160,.7), 4px 4px 0 #000", uppercase: true },
  label: { fill: "rgba(0,0,0,.65)", text: "ok", radius: 0, shadow: "0 0 18px rgba(125,255,154,.5)", border: "3px solid #7dff9a", prefix: "> " },
  progress: { height: 12, track: "rgba(0,0,0,.6)", fill: "ok" },
  motion: { ease: [0.2, 0, 0.2, 1], dur: 0.25, pop: [0.9, 1.05, 1], slide: 0.4 },
  textScale: 1.15,
  post: { crt: true },
});

export const SKIN_CHALKBOARD = defineSkin({
  id: "chalkboard", name: "Chalkboard", dimension: "2d",
  description: "Green board, chalk-white handwriting and hand-drawn outlines, like a teacher explaining.",
  avoid: ["filled bright boxes", "glossy shadows", "perfectly straight machine lines", "neon colors"],
  colors: { background: "#1f3a2c", coverBackground: "#1f3a2c", text: "#f4f4ee", muted: "#c9d3c9", accent: "#ffe08a", ok: "#b9f0b0", error: "#ffb3b3", info: "#a8dcff", extra: "#e0c8ff", box: "#24432f", code: "#24432f" },
  fontAspect: 0.56, font: "'Cabin Sketch', 'Chalkboard SE', Chalkboard, 'Comic Sans MS', 'Marker Felt', cursive",
  mono: "'Chalkboard SE', 'Courier New', monospace",
  background: { kind: "css", css: "radial-gradient(ellipse at 50% 35%, rgba(255,255,255,.07) 0%, rgba(0,0,0,0) 60%), radial-gradient(ellipse at 50% 120%, rgba(0,0,0,.35) 0%, rgba(0,0,0,0) 60%), #1f3a2c" },
  panel: { fill: "transparent", stroke: 0, radius: 0, shadow: "none", titleColor: "muted", titleSize: 40, letterSpacing: 3 },
  surface: { fill: "rgba(255,255,255,.04)", stroke: 4, strokeStyle: "hand", radius: 0.6, shadow: "none" },
  big: { shadow: "0 0 2px rgba(255,255,255,.4)" },
  bars: { from: null, height: 30, radius: 4, track: "rgba(255,255,255,.08)", trackStroke: null },
  code: { header: "rgba(255,255,255,.08)", headerText: "muted", body: "rgba(255,255,255,.03)" },
  caption: { active: "accent", spoken: "text", unspoken: "text@0.4", shadow: "0 0 2px rgba(255,255,255,.5), 2px 3px 0 rgba(0,0,0,.25)", uppercase: false },
  label: { fill: "transparent", text: "text", radius: 0, shadow: "none", underline: "5px solid rgba(244,244,238,.75)" },
  progress: { height: 8, track: "rgba(255,255,255,.12)", fill: "rgba(244,244,238,.85)" },
  motion: { ease: [0.3, 0, 0.3, 1], dur: 0.5, pop: [0.9, 1.04, 1], slide: 0.3 },
});

export const SKIN_COMIC = defineSkin({
  id: "comic", name: "Comic", dimension: "2d",
  description: "Comic book: thick black ink outlines, halftone dots, hard offset shadows and speech balloons.",
  avoid: ["thin outlines", "soft blurry shadows", "gradients", "muted grey palettes"],
  colors: { background: "#ffe27a", coverBackground: "#ffe27a", text: "#111111", muted: "#3d3d3d", accent: "#e8262b", ok: "#1f8a3c", error: "#e8262b", info: "#1e6fd9", extra: "#8e44ad", box: "#ffffff", code: "#ffffff" },
  fontAspect: 0.48, font: "Bangers, Impact, 'Arial Black', sans-serif",
  mono: "'Courier New', monospace",
  background: { kind: "css", css: "radial-gradient(rgba(0,0,0,.10) 22%, transparent 24%) 0 0 / 22px 22px, radial-gradient(ellipse at 50% 40%, #fff1b0 0%, #ffe27a 70%)" },
  panel: { fill: "#ffffff", stroke: 7, strokeColor: "#111111", radius: 0, shadow: "12px 12px 0 #111111", titleColor: "text", titleSize: 42, letterSpacing: 2 },
  surface: { fill: "pastel", ink: "text", stroke: 6, strokeColor: "#111111", radius: 0.4, shadow: "6px 6px 0 #111111", halftone: true },
  big: { shadow: "5px 5px 0 #111111" },
  bars: { from: null, height: 36, radius: 0, track: "#ffffff", trackStroke: "#111111" },
  code: { header: "#111111", headerText: "#ffe27a", body: "#ffffff", ink: "#111111" },
  bubble: { kind: "comic" },
  caption: { active: "accent", spoken: "text", unspoken: "text@0.35", shadow: "none", uppercase: true, box: { fill: "#ffffff", radius: "50% / 46%", border: "6px solid #111111", shadow: "8px 10px 0 #111111", tail: true } },
  label: { fill: "accent", text: "#ffffff", radius: 0, shadow: "8px 8px 0 #111111", border: "6px solid #111111", skew: -4 },
  progress: { height: 14, track: "#111111", fill: "accent" },
  motion: { ease: [0.34, 1.56, 0.64, 1], dur: 0.3, pop: [0.4, 1.3, 1], slide: 1.2 },
});

const PIXEL_FONT = "Silkscreen, 'Press Start 2P', 'PressStart2P', 'Courier New', monospace";
const PIXEL_OUTLINE = "6px 6px 0 #000, -3px 0 0 #000, 3px 0 0 #000, 0 -3px 0 #000";
export const SKIN_PIXEL = defineSkin({
  id: "pixel", name: "Pixel art", dimension: "2d",
  description: "Pixel art with the 32-color DawnBringer palette: blocky shapes, hard shadows, stepped motion (pixelated by a post-process).",
  avoid: ["smooth gradients", "blur or glow", "thin fonts or small text", "anti-aliased photos (use sprites)"],
  colors: { background: "#222034", coverBackground: "#222034", text: "#ffffff", muted: "#cbdbfc", accent: "#fbf236", ok: "#99e550", error: "#d95763", info: "#5fcde4", extra: "#d77bba", box: "#3f3f74", code: "#323c39" },
  fontAspect: 1, monoAspect: 1, font: PIXEL_FONT, mono: PIXEL_FONT,
  background: { kind: "css", css: "radial-gradient(#3f3f74 0 4px, transparent 4px) 0 0 / 96px 96px, #222034" },
  panel: { fill: "#222034", stroke: 6, strokeColor: "text", radius: 0, shadow: "12px 12px 0 #000000", titleColor: "accent", titleSize: 30, letterSpacing: 0 },
  surface: { fill: "box", stroke: 6, radius: 0, shadow: "6px 6px 0 #000000" },
  big: { shadow: "6px 6px 0 #45283c" },
  bars: { from: null, height: 36, radius: 0, track: "#000000", trackStroke: "text", blocks: 24 },
  code: { header: "#45283c", headerText: "text" },
  caption: { active: "accent", spoken: "text", unspoken: "muted", shadow: PIXEL_OUTLINE, uppercase: true },
  label: { fill: "#222034", text: "accent", radius: 0, shadow: "8px 8px 0 #000000", border: "6px solid #ffffff" },
  progress: { height: 16, track: "#000000", fill: "accent" },
  motion: { ease: [0, 0, 1, 1], dur: 0.3, pop: [0.5, 1.25, 1], slide: 1, steps: 4 },
  textScale: 0.8, lineHeight: 1.5,
  sfxDir: "sfx-chip",
  post: { scale: 1 / 3, palette: PALETTE_DB32 },
});

const PX8 = "'Press Start 2P', PressStart2P, 'Courier New', monospace";
export const SKIN_8BIT = defineSkin({
  id: "8bit", name: "8-bit", dimension: "2d",
  description: "8-bit console look with the 16-color PICO-8 palette, chunky pixel font and stepped motion (pixelated by a post-process).",
  avoid: ["colors outside the palette", "gradients, blur or glow", "small text (it becomes unreadable)", "long words on one line"],
  colors: { background: "#1d2b53", coverBackground: "#1d2b53", text: "#fff1e8", muted: "#c2c3c7", accent: "#ffec27", ok: "#00e436", error: "#ff004d", info: "#29adff", extra: "#ff77a8", box: "#000000", code: "#000000" },
  fontAspect: 1, monoAspect: 1, font: PX8, mono: PX8,
  background: { kind: "css", css: "radial-gradient(#5f574f 0 3px, transparent 3px) 0 0 / 96px 96px, #1d2b53" },
  panel: { fill: "#000000", stroke: 6, strokeColor: "text", radius: 0, shadow: "12px 12px 0 #000000", titleColor: "accent", titleSize: 30, letterSpacing: 0 },
  surface: { fill: "box", stroke: 6, radius: 0, shadow: "6px 6px 0 #5f574f" },
  big: { shadow: "6px 6px 0 #7e2553" },
  bars: { from: null, height: 36, radius: 0, track: "#000000", trackStroke: "text", blocks: 24 },
  code: { header: "#5f574f", headerText: "text" },
  caption: { active: "accent", spoken: "text", unspoken: "muted", shadow: PIXEL_OUTLINE, uppercase: true },
  label: { fill: "accent", text: "#000000", radius: 0, shadow: "6px 6px 0 #000000" },
  progress: { height: 18, track: "#000000", fill: "error" },
  motion: { ease: [0, 0, 1, 1], dur: 0.3, pop: [0.5, 1.25, 1], slide: 1, steps: 4 },
  textScale: 0.72, lineHeight: 1.6,
  sfxDir: "sfx-chip",
  post: { scale: 1 / 3, palette: PALETTE_PICO8 },
});

// ---------- 3D (the panel goes on the face of a lit slab; label, captions and progress stay flat on top) ----------
const SLAB_PANEL = { fill: "transparent", stroke: 0, radius: 60, shadow: "none", titleColor: "muted", titleSize: 38, letterSpacing: 4, pop: false } as const;

export const SKIN_CLAY_3D = defineSkin({
  id: "clay-3d", name: "Clay 3D", dimension: "3d",
  description: "Soft modelling-clay 3D: rounded pastel slabs, studio light with soft shadows, bouncy squash-and-stretch.",
  avoid: ["hard black outlines", "thin lines", "sharp drop shadows", "neon glow", "tiny text (it sits on a slab in perspective)"],
  colors: { background: "#c9dcef", coverBackground: "#c9dcef", text: "#2e2737", muted: "#5f5569", accent: "#e8682c", ok: "#2f9e55", error: "#e04848", info: "#2f86c8", extra: "#7d5ad6", box: "#fff4e6", code: "#fff4e6" },
  fontAspect: 0.62, font: "'Arial Rounded MT Bold', 'Arial Black', system-ui, sans-serif",
  background: { kind: "plain" },
  panel: SLAB_PANEL,
  surface: { fill: "pastel", ink: "text", stroke: 0, radius: 1.6, shadow: "0 14px 22px rgba(60,40,30,.28)", bevel: "inset 0 -10px 14px rgba(0,0,0,.14), inset 0 8px 12px rgba(255,255,255,.55)" },
  grain: 0.35,
  big: { shadow: "0 6px 0 rgba(0,0,0,.18), 0 14px 18px rgba(60,40,30,.25)" },
  bars: { from: null, height: 44, radius: 22, track: "#efe3d3", trackStroke: null },
  code: { header: "#efe0cc", headerText: "muted", body: "#3b3346", ink: "#fff4e6" },
  caption: { active: "accent", spoken: "#ffffff", unspoken: "#ffffff@0.6", shadow: "0 5px 0 #2e2737, 3px 0 0 #2e2737, -3px 0 0 #2e2737, 0 -3px 0 #2e2737, 0 12px 18px rgba(0,0,0,.3)", uppercase: true },
  label: { fill: "accent", text: "#ffffff", radius: 40, shadow: "inset 0 -8px 10px rgba(0,0,0,.18), inset 0 6px 8px rgba(255,255,255,.45), 0 12px 18px rgba(60,40,30,.3)" },
  progress: { height: 12, track: "rgba(46,39,55,.25)", fill: "accent" },
  motion: { ease: [0.34, 1.56, 0.64, 1], dur: 0.5, pop: [0.4, 1.22, 1], slide: 1.4 },
  stage: {
    material: "clay", lights: { hemi: 1.5, hemiSky: "#ffffff", hemiGround: "#8a7a6a", key: 2.4, keyColor: "#fff1dc", fill: 0.6, fillColor: "#d8e8ff", rim: 0.7, rimColor: "#ffe0b0" },
    exposure: 1, shadows: true, fog: [22, 60], floor: "sweep", props: 7,
  },
});

export const SKIN_BLOCKS_3D = defineSkin({
  id: "blocks-3d", name: "Blocks 3D", dimension: "3d",
  description: "Toy building blocks: glossy primary-color plastic, studs on top, bright daylight.",
  avoid: ["pastel or muted colors", "textures or grain", "thin fonts", "organic blobby shapes"],
  colors: { background: "#9fd3ff", coverBackground: "#9fd3ff", text: "#1b1b1b", muted: "#454a50", accent: "#e3000b", ok: "#237841", error: "#c4000a", info: "#0057a8", extra: "#c46200", box: "#f4f4f4", code: "#f4f4f4" },
  fontAspect: 0.56, font: "'Lilita One', 'Arial Rounded MT Bold', 'Arial Black', sans-serif",
  background: { kind: "plain" },
  panel: SLAB_PANEL,
  surface: { fill: "box", stroke: 6, radius: 0.5, shadow: "0 8px 0 rgba(0,0,0,.25)", bevel: "inset 0 -8px 0 rgba(0,0,0,.12)" },
  big: { shadow: "0 6px 0 rgba(0,0,0,.25)" },
  bars: { from: null, height: 40, radius: 8, track: "#dcdcdc", trackStroke: null, blocks: 40 },
  code: { header: "#1b1b1b", headerText: "#ffd500", body: "#ffffff" },
  caption: { active: "#ffd500", spoken: "#ffffff", unspoken: "#ffffff@0.6", shadow: "0 10px 0 #1b1b1b, 5px 0 0 #1b1b1b, -5px 0 0 #1b1b1b, 0 -5px 0 #1b1b1b", uppercase: true },
  label: { fill: "accent", text: "#ffffff", radius: 16, shadow: "0 12px 0 #1b1b1b, inset 0 -10px 0 rgba(0,0,0,.18)", border: "6px solid #1b1b1b" },
  progress: { height: 18, track: "#1b1b1b", fill: "#ffd500" },
  motion: { ease: [0.34, 1.4, 0.64, 1], dur: 0.4, pop: [0.5, 1.15, 1], slide: 1 },
  stage: {
    material: "plastic", studs: true, lights: { hemi: 1, hemiSky: "#ffffff", hemiGround: "#5d7a5f", key: 2.6, keyColor: "#ffffff", fill: 0.6, fillColor: "#dbe9ff", rim: 0.9, rimColor: "#ffffff" },
    exposure: 1, shadows: true, fog: [40, 120], floor: "sweep", props: 6,
  },
});

export const SKIN_RETRO_3D = defineSkin({
  id: "retro-3d", name: "Retro 3D", dimension: "3d",
  description: "1980s synthwave: a glowing grid floor running to a striped sun, neon wireframe edges, magenta and cyan.",
  avoid: ["daylight or pastel colors", "soft realistic materials", "plain backgrounds", "serif fonts"],
  colors: { background: "#2a0845", coverBackground: "#2a0845", text: "#f4f6ff", muted: "#b9b2ff", accent: "#ff3cac", ok: "#39ff88", error: "#ff3c6e", info: "#22f3ff", extra: "#ffe66d", box: "#140426", code: "#140426" },
  fontAspect: 0.8, font: "Orbitron, 'Arial Black', sans-serif",
  background: { kind: "plain" },
  panel: { ...SLAB_PANEL, titleColor: "info", letterSpacing: 8 },
  surface: { fill: "box", stroke: 3, radius: 0.3, shadow: "none" },
  glow: 14,
  bars: { from: null, height: 30, radius: 2, track: "#05010f", trackStroke: "#22f3ff" },
  code: { header: "#05010f", headerText: "info" },
  caption: { active: "#ffe66d", spoken: "text", unspoken: "text@0.5", shadow: "0 0 18px #ff3cac, 0 0 4px #ff3cac, 0 6px 0 #2a0845", uppercase: true },
  label: { fill: "linear-gradient(180deg,#22f3ff,#8a7dff 50%,#ff3cac)", text: "#05010f", radius: 6, shadow: "0 0 30px rgba(255,60,172,.8)" },
  progress: { height: 10, track: "#140426", fill: "linear-gradient(90deg,#22f3ff,#ff3cac)" },
  motion: { ease: [0.7, 0, 0.2, 1], dur: 0.25, pop: [1.25, 0.95, 1], slide: 0.4 },
  stage: {
    material: "neon", lights: { hemi: 0.6, hemiSky: "#ff9ef0", hemiGround: "#05010f", key: 1.2, keyColor: "#ffffff", fill: 0.4, fillColor: "#22f3ff", rim: 1.2, rimColor: "#ff3cac" },
    exposure: 1.05, shadows: false, fog: [30, 95], floor: "grid", sun: true, props: 5,
  },
});

export const SKIN_CINEMA_3D = defineSkin({
  id: "cinema-3d", name: "Cinema 3D", dimension: "3d",
  description: "Cinematic 3D: low-key warm key light with a cool rim, deep shadows, vignette and film grain, calm camera.",
  avoid: ["bright flat lighting", "cartoon outlines", "saturated toy colors", "fast bouncy motion"],
  colors: { background: "#14161b", coverBackground: "#14161b", text: "#f2efe8", muted: "#b3b6bb", accent: "#ffcf8a", ok: "#8fd18f", error: "#e07a6a", info: "#8cc4ee", extra: "#c7a8ec", box: "#343a45", code: "#1e2128" },
  fontAspect: 0.46, font: "Oswald, 'Helvetica Neue', 'Arial Narrow', sans-serif",
  background: { kind: "plain" },
  panel: { ...SLAB_PANEL, letterSpacing: 10 },
  surface: { fill: "tint", stroke: 2, radius: 0.4, shadow: "0 18px 40px rgba(0,0,0,.5)" },
  bars: { from: null, height: 26, radius: 4, track: "rgba(255,255,255,.08)", trackStroke: null },
  code: { header: "#111318", headerText: "muted" },
  caption: { active: "accent", spoken: "text", unspoken: "text@0.5", shadow: "0 4px 18px rgba(0,0,0,.85), 0 2px 2px rgba(0,0,0,.9)", uppercase: true },
  label: { fill: "transparent", text: "text", radius: 0, shadow: "none", underline: "2px solid rgba(242,239,232,.6)" },
  progress: { height: 4, track: "rgba(255,255,255,.15)", fill: "text" },
  motion: { ease: [0.25, 0.1, 0.25, 1], dur: 0.6, pop: [0.92, 1.02, 1], slide: 0.5 },
  stage: {
    material: "pbr", lights: { hemi: 0.7, hemiSky: "#ffd9b8", hemiGround: "#20283a", key: 4.2, keyColor: "#ffc28a", fill: 0.4, fillColor: "#8fb0ff", rim: 3.2, rimColor: "#9cc8ff" },
    exposure: 1.1, shadows: true, fog: [20, 90], floor: "sweep", props: 4, faceLight: 0.45, overlay: { vignette: 0.45, grain: 0.05 },
  },
});

/** Every skin by slug. `default` is the Studio's original look. */
export const SKINS: Readonly<Record<string, Skin>> = Object.freeze({
  default: SKIN_DEFAULT,
  flat: SKIN_FLAT, minimal: SKIN_MINIMAL, neon: SKIN_NEON, "retro-crt": SKIN_RETRO_CRT, chalkboard: SKIN_CHALKBOARD, comic: SKIN_COMIC, pixel: SKIN_PIXEL, "8bit": SKIN_8BIT,
  "clay-3d": SKIN_CLAY_3D, "blocks-3d": SKIN_BLOCKS_3D, "retro-3d": SKIN_RETRO_3D, "cinema-3d": SKIN_CINEMA_3D,
});
export const SKIN_IDS: readonly string[] = Object.keys(SKINS);
/** The skin of a slug; undefined when the slug is not in the registry. */
export const skinOf = (slug: string | undefined | null): Skin | undefined => (slug && Object.prototype.hasOwnProperty.call(SKINS, slug) ? SKINS[slug] : undefined);

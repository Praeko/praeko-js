// Style helpers of the skin that the kit's parts share (no React context here, so tests run them in Node).
import { Easing, getStaticFiles, interpolate } from "remotion";
import { surfaceFill, tok } from "./skin.ts";
import type { Skin } from "./skin.ts";
import type { Theme } from "./theme.ts";

/** A text size through the skin (pixel fonts are wider). */
export const fs = (S: Skin, n: number): number => (S.textScale ? Math.round(n * S.textScale) : n);

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export type Motion = { appear: (t: number, q: number, d?: number) => number; pop: (t: number, q: number) => number; slide: number };
/** Motion from the skin, with the same signatures as core's `appear`/`pop` (the default skin gives exactly those). */
export function motionOf(S: Skin): Motion {
  const [a, b, c, d] = S.motion.ease, E = Easing.bezier(a, b, c, d), [p0, p1, p2] = S.motion.pop, steps = S.motion.steps, k = S.motion.dur / 0.35;
  return {
    appear: (t, q, d0 = 0.35) => { const v = interpolate(t, [q, q + d0 * k], [0, 1], { ...clamp, easing: E }); return steps ? Math.floor(v * steps) / steps : v; },
    pop: (t, q) => { const v = interpolate(t, [q, q + 0.18, q + 0.4], [p0, p1, p2], { ...clamp, easing: Easing.out(Easing.cubic) }); return steps ? Math.round(v * 4) / 4 : v; },
    slide: S.motion.slide,
  };
}

const NOISE = `url("data:image/svg+xml;utf8,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .2  0 0 0 0 .15  0 0 0 0 .1  0 0 0 .55 0'/></filter><rect width='160' height='160' filter='url(#n)'/></svg>")}")`;
const HALFTONE = "radial-gradient(rgba(0,0,0,.16) 24%, transparent 26%)";

/** Style of a surface (box, line, bubble, code, card) in the item color `color`, base radius `r`. With the default skin it is exactly the kit's old style. */
export function surfaceStyle(S: Skin, T: Theme, color: string, r: number, dash = false): React.CSSProperties {
  const bg = surfaceFill(S, T, color);
  const shadows = [S.surface.shadow, S.surface.bevel, S.glow ? `0 0 ${S.glow}px ${color}, inset 0 0 ${S.glow * 0.6}px ${color}66` : undefined].filter((x) => x && x !== "none");
  const strokeColor = tok(T, S.surface.strokeColor) ?? color;
  const hand = S.surface.strokeStyle === "hand";
  const texture = [S.grain ? NOISE : null, S.surface.halftone ? HALFTONE : null].filter(Boolean) as string[];
  return {
    background: bg,
    ...(texture.length ? { backgroundImage: texture.join(", "), ...(S.surface.halftone ? { backgroundSize: S.grain ? "auto, 18px 18px" : "18px 18px" } : {}), backgroundBlendMode: "multiply" as const, backgroundColor: bg } : {}),
    border: S.surface.stroke && !hand ? `${S.surface.stroke}px ${dash ? "dashed" : "solid"} ${strokeColor}` : dash && !hand ? `3px dashed ${color.startsWith("#") && color.length === 7 ? `${color}99` : "#888888"}` : "none",
    borderRadius: r * S.surface.radius,
    ...(shadows.length ? { boxShadow: shadows.join(", ") } : {}),
    color: tok(T, S.surface.ink) ?? T.text,
    ...(hand ? { position: "relative" as const } : {}),
  };
}
export const panelTexture = (S: Skin): React.CSSProperties => (S.grain && S.panel.fill !== "transparent" ? { backgroundImage: NOISE, backgroundBlendMode: "multiply" } : {});
/** Glow (neon) or the skin's text shadow for big text. */
export const glowText = (S: Skin, color: string): React.CSSProperties => (S.glow ? { textShadow: `0 0 ${S.glow * 0.6}px ${color}, 0 0 ${S.glow * 1.6}px ${color}` } : S.big.shadow ? { textShadow: S.big.shadow } : {});

/** Files under public/ (Remotion's list); empty when the list is unavailable. */
const publicFiles = (): Set<string> => { try { return new Set(getStaticFiles().map((f) => f.name.replace(/^\//, ""))); } catch { return new Set(); } };
/** The sound file of a skin: `<sfxDir>/<name>.wav` when the project has it, else the default `sfx/<name>.wav`. */
export function sfxFile(S: Skin, name: string, files: Set<string> = publicFiles()): string {
  const own = S.sfxDir ? `${S.sfxDir}/${name}.wav` : null;
  return own && files.has(own) ? own : `sfx/${name}.wav`;
}
/** Font files to load: the theme's (brand.json `fonts.files`) and the skin's, only those present in public/. */
export function fontFilesOf(S: Skin, T: Theme, files: Set<string> = publicFiles()): { family: string; src: string }[] {
  return [...(T.fontFiles ?? []), ...(S.fontFaces ?? [])].filter((f) => files.has(f.src.replace(/^\//, "")));
}

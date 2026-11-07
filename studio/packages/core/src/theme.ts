/** Brand tokens. Everything that is a color, font, name or avatar comes from here; the engine and the kit know no brand. */
export type Theme = {
  background: string;      // episode background
  coverBackground: string; // cover background
  accent: string;          // main color (e.g. amber)
  text: string;
  muted: string;           // secondary text
  ok: string;
  error: string;
  info: string;
  extra: string;
  box: string;             // card background
  longBox?: string;        // card background in long videos (default: box)
  code: string;            // code block background
  font: string;            // titles and captions
  mono: string;
  handle: string;          // e.g. @mychannel
  avatar: string;          // path under public/
  /** Mascot image path template under public/; `{name}` is replaced. Default `mascots/{name}.png`. */
  mascotPath?: string;
};

const BASE: Theme = {
  background: "#14110f", coverBackground: "#0e0c14", accent: "#f4b942", text: "#f3ece0", muted: "#a89c8a", ok: "#7ee787", error: "#ff6b5e",
  info: "#7fd7ff", extra: "#a98bff", box: "#2a2118", code: "#1b1610",
  font: "'Arial Black', 'Helvetica Neue', system-ui, sans-serif", mono: "Menlo, 'Courier New', monospace",
  handle: "@yourchannel", avatar: "cover/avatar.png", mascotPath: "mascots/{name}.png",
};
export const DEFAULT_THEME: Theme = BASE;

type BrandLike = {
  colors?: Partial<Theme>; fonts?: { title?: string; mono?: string }; handle?: string; avatar?: string; mascotPath?: string;
};
/** Reads a project's `brand.json` (missing fields use the default theme). */
export const themeFromBrand = (m: BrandLike): Theme => ({
  ...DEFAULT_THEME, ...(m.colors ?? {}),
  ...(m.fonts?.title ? { font: m.fonts.title } : {}), ...(m.fonts?.mono ? { mono: m.fonts.mono } : {}),
  ...(m.handle ? { handle: m.handle } : {}), ...(m.avatar ? { avatar: m.avatar } : {}), ...(m.mascotPath ? { mascotPath: m.mascotPath } : {}),
});

/** "#f4b942" + 0.16 -> "rgba(244,185,66,0.16)". */
export const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

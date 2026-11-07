// Pieces shared by the long-video and Short generators: theme, fonts, phrase timing, assets.
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const HF_VERSION = "0.9.13";
export const f2 = (x: number): number => +Number(x).toFixed(2);
export const esc = (s: unknown): string => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const norm = (s: unknown): string => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

export type Word = { t: string; a: number; b: number };
export type Block = { n: number; title: string; a: number; b: number };
/** The brand.json fields the HyperFrames engine reads (English keys). */
export type Brand = {
  colors?: Partial<Theme>; fonts?: { title?: string; mono?: string }; handle?: string; avatar?: string; signature?: string; publicDir?: string; engine?: string;
  mascotPath?: string; hyperframes?: { localFonts?: boolean };
};
export type Theme = {
  background: string; coverBackground: string; accent: string; text: string; muted: string; ok: string; error: string; info: string; extra: string;
  box: string; longBox?: string; code: string; font: string; mono: string; handle: string; avatar: string; [k: string]: string | undefined;
};
export type Fonts = { title: string; mono: string; weight: number; faces: string };
/** A time as the compiler leaves it in the spec: seconds, a phrase, or `{ when, nth, after, plus }`. */
export type TimeRef = number | string | { when: string; nth?: number; after?: number; plus?: number };
/** The compiled spec (episode.spec.json). The items are loosely typed on purpose: they are validated by `praeko studio compile`. */
export type Spec = any;
export type Files = Record<string, string>;
export type Generated = { files: Files; assets: string[]; durS: number; width: number; height: number; scenes: number };

/** Instant (s) at which the phrase starts in the voice from `from`; -1 if absent (same rule as `praeko studio compile`). */
export function findPhrase(words: Word[], phrase: string, nth = 0, from = 0): number {
  const f = String(phrase).split(/\s+/).map(norm).filter(Boolean), W = words.map((p) => norm(p.t));
  let c = 0;
  for (let k = 0; k <= W.length - f.length; k++) if ((words[k] as Word).a >= from && f.every((w, j) => W[k + j] === w)) { if (c === nth) return (words[k] as Word).a; c++; }
  return -1;
}

const DEFAULT_THEME: Theme = {
  background: "#14110f", coverBackground: "#0e0c14", accent: "#f4b942", text: "#f3ece0", muted: "#a89c8a", ok: "#7ee787", error: "#ff6b5e",
  info: "#7fd7ff", extra: "#a98bff", box: "#2a2118", code: "#1b1610",
  font: "'Arial Black', 'Helvetica Neue', system-ui, sans-serif", mono: "Menlo, 'Courier New', monospace", handle: "@yourchannel", avatar: "cover/avatar.png",
};
/** Same reading as `themeFromBrand` of @praeko/studio-core (which is TSX and does not run in Node). */
export function themeFromBrand(m: Brand = {}): Theme {
  return { ...DEFAULT_THEME, ...(m.colors || {}), ...(m.fonts?.title ? { font: m.fonts.title } : {}), ...(m.fonts?.mono ? { mono: m.fonts.mono } : {}), ...(m.handle ? { handle: m.handle } : {}), ...(m.avatar ? { avatar: m.avatar } : {}) };
}
/** Theme color name (accent, error…) or #hex → CSS color. */
export const color = (T: Theme, c?: string): string | undefined => (c ? (T[c] && !String(c).startsWith("#") ? (T[c] as string) : c) : undefined);

/** Image path of a mascot: `brand.mascotPath` template (default `mascots/{name}.png`). */
export const mascotFile = (brand: Brand, name: string): string => (brand.mascotPath || "mascots/{name}.png").replace("{name}", name);

const BUNDLED = ["Inter", "Montserrat", "Outfit", "Nunito", "Oswald", "League Gothic", "Archivo Black", "Space Mono", "IBM Plex Mono", "JetBrains Mono", "EB Garamond", "Playfair Display", "Source Code Pro", "Noto Sans JP", "Roboto", "Open Sans", "Lato", "Poppins"];
const firstOf = (stack: string): string => String(stack).split(",")[0]!.trim().replace(/^['"]|['"]$/g, "");
/**
 * HyperFrames fonts: only the bundled ones resolve by name. By default the brand font becomes the closest bundled one
 * (Arial Black → Montserrat 900; Menlo → JetBrains Mono), which is portable. With `brand.hyperframes.localFonts: true`
 * the brand font is loaded from the system (`local()`), with the bundled one as a fallback: exact parity with Remotion on this machine.
 */
export function fonts(brand: Brand = {}, T: Theme = themeFromBrand(brand)): Fonts {
  const local = !!brand.hyperframes?.localFonts;
  const title = firstOf(T.font), mono = firstOf(T.mono);
  const heavy = /black|heavy|extrabold|impact/i.test(title);
  const pick = (name: string, bundled: string) => (BUNDLED.includes(name) ? { fam: `'${name}'`, face: "" } : local ? { fam: `'Studio ${bundled}', '${bundled}'`, face: `@font-face{font-family:"Studio ${bundled}";src:local("${name}"),local("${name.replace(/\s+/g, "-")}");font-weight:100 900}` } : { fam: `'${bundled}'`, face: "" });
  const t = pick(title, "Montserrat"), m = pick(mono, "JetBrains Mono");
  return { title: `${t.fam}, sans-serif`, mono: `${m.fam}, monospace`, weight: heavy || !BUNDLED.includes(title) ? 900 : 700, faces: [t.face, m.face].filter(Boolean).join("") };
}

/** Time (s) from: number · "phrase" · { when, nth, after, plus } (the forms `praeko studio compile` leaves in the spec). */
export function timeResolver(words: Word[]): (q?: TimeRef | null, fallback?: number) => number {
  return (q, fallback = 0) => {
    if (q === undefined || q === null) return fallback;
    if (typeof q === "number") return q;
    const o = typeof q === "string" ? { when: q } : q;
    const t = findPhrase(words, o.when, (o as any).nth ?? 0, (o as any).after ?? 0);
    if (t < 0) throw new Error(`phrase "${o.when}" does not appear in the voice (words.json)`);
    return f2(t + ((o as any).plus ?? 0));
  };
}

/** Scenes that depend on TSX (a `component` on the scene). */
export function specComponents(spec: Spec): { scene: number; title: string; component: string }[] {
  const found: { scene: number; title: string; component: string }[] = [];
  (spec.scenes ?? []).forEach((c: any, i: number) => { if (c.component) found.push({ scene: i + 1, title: c.title ?? c.label ?? "", component: c.component }); });
  return found;
}
export class HfError extends Error {}
export function requireNoComponents(slug: string, spec: Spec): void {
  const a = specComponents(spec);
  if (!a.length) return;
  throw new HfError(`"${slug}" uses \`component:\` (TSX) and HyperFrames only renders declarative scenes. Scenes: ${a.map((x) => `${x.scene}${x.title ? ` (${x.title})` : ""} → ${x.component}`).join("; ")}. Convert them to items in episode.yaml or render with --engine remotion.`);
}

/** Copies only the referenced assets (paths relative to publicDir) into <project>/assets/. A missing file is a clear error. */
export function copyAssets({ publicDir, output, paths }: { publicDir: string; output: string; paths: (string | undefined | null)[] }): string[] {
  const list = [...new Set(paths.filter(Boolean) as string[])];
  for (const rel of list) {
    const from = resolve(publicDir, rel), to = join(output, "assets", rel);
    if (!existsSync(from)) throw new HfError(`asset "${rel}" does not exist in ${publicDir}`);
    mkdirSync(dirname(to), { recursive: true });
    if (!existsSync(to) || statSync(to).size !== statSync(from).size) copyFileSync(from, to);
  }
  return list;
}

export const hfFiles = (name: string): Files => ({
  "hyperframes.json": JSON.stringify({ $schema: "https://hyperframes.heygen.com/schema/hyperframes.json", registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry", paths: { blocks: "compositions", components: "compositions/components", assets: "assets" }, media: { autoProxy: true } }, null, 2) + "\n",
  "meta.json": JSON.stringify({ id: name, name, createdAt: "2026-01-01T00:00:00.000Z" }, null, 2) + "\n",
  "package.json": JSON.stringify({ name, private: true, type: "module", scripts: { dev: `npx --yes hyperframes@${HF_VERSION} preview`, check: `npx --yes hyperframes@${HF_VERSION} check`, render: `npx --yes hyperframes@${HF_VERSION} render` } }, null, 2) + "\n",
});

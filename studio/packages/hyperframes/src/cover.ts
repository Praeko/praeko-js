// Covers through HyperFrames: one still composition per cover (Short 1080x1920; long video 1280x720 and vertical 1080x1920), snapshotted by
// `hyperframes snapshot`. Same layout as the Remotion engine's `Frame` and long-video covers; covers that use `component:` (TSX) cannot render here.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { HF_VERSION, HfError, color, copyAssets, esc, fonts, hfFiles, mascotFile, themeFromBrand } from "./common.ts";
import type { Brand, Files, Fonts, Spec, Theme } from "./common.ts";
import { renderItem } from "./short.ts";

/** The cover is a still: snapshot it late enough for every entrance animation to have finished. */
export const COVER_AT = 60;
export const COVER_DURATION = COVER_AT + 1;
const rgba = (hex: string, a: number): string => { const n = parseInt(String(hex).slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

export type CoverProject = { dir: string; width: number; height: number; /** file name under out/ (without folder) */ png: string; label: string };

const page = ({ T, F, W, H, body, js = "" }: { T: Theme; F: Fonts; W: number; H: number; body: string; js?: string }): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
<style>${F.faces}*{margin:0;padding:0}html,body{width:${W}px;height:${H}px;overflow:hidden;background:${T.coverBackground}}</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${COVER_DURATION}" data-width="${W}" data-height="${H}">
${body}
</div>
<script>
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
${js}
window.__timelines["main"] = tl;
</script>
</body>
</html>`;

const codeCard = (c: any, T: Theme, F: Fonts, w: number, scale = 1): string => {
  if (!c?.code) return "";
  const px = (n: number) => n * scale;
  const rows = (c.code.lines ?? []).map((l: any) => l.hl
    ? `<div style="background:${rgba(T.accent, 0.2)};border-left:${px(6)}px solid ${T.accent};margin-left:-${px(24)}px;padding-left:${px(18)}px">${esc(l.s)}</div>`
    : `<div>${esc(l.s)}</div>`).join("");
  return `<div style="width:${w}px;background:${T.code};border:${px(5)}px solid ${T.accent};border-radius:${px(24)}px;overflow:hidden;text-align:left;color:${T.text}"><div style="background:#262034;padding:${px(8)}px ${px(22)}px;font-family:${F.mono};font-weight:400;font-size:${px(24)}px;color:#9a95b8">${esc(c.code.title ?? "")}</div><div style="padding:${px(18)}px ${px(24)}px;font-family:${F.mono};font-weight:400;font-size:${px(30)}px;line-height:1.5;white-space:pre">${rows}</div></div>`;
};
const chips = (c: any, T: Theme, scale = 1, column = false): string => `<div style="display:flex;flex-direction:${column ? "column" : "row"};${column ? "align-items:flex-start;" : ""}gap:${24 * scale}px">${(c.chips ?? []).map((k: any) => `<div style="background:${color(T, k.color) ?? T.accent};color:${T.background};font-size:${48 * scale}px;padding:${10 * scale}px ${34 * scale}px;border-radius:${18 * scale}px">${esc(k.text)}</div>`).join("")}</div>`;
const mascot = (brand: Brand, name: string, size: number): string => `<div style="background:#1c1830;border:6px solid #3a3358;border-radius:30px;padding:12px;display:inline-block"><img src="assets/${mascotFile(brand, name)}" alt="" style="width:${size}px;height:${size}px;image-rendering:pixelated;display:block" /></div>`;

/** The Shorts cover frame (the kit's `Frame`). */
function frame({ T, F, glow, title, accent, size, children }: { T: Theme; F: Fonts; glow: string; title: string[]; accent: string; size: number; children: string }): string {
  return `<div style="position:relative;width:1080px;height:1920px;background:radial-gradient(ellipse at 50% 44%, ${glow} 0%, rgba(0,0,0,0) 56%), ${T.coverBackground};display:flex;flex-direction:column;align-items:center;font-family:${F.title};font-weight:${F.weight};text-align:center;color:${T.text}">
<div style="margin-top:350px;font-size:${size}px;font-weight:900;color:${T.text};line-height:1.02;text-shadow:0 8px 0 #000;white-space:nowrap">${esc(title[0] ?? "")}<br><span style="color:${accent}">${esc(title[1] ?? "")}</span>${title[2] ? `<br>${esc(title[2])}` : ""}</div>
<div style="margin-top:130px;display:flex;flex-direction:column;align-items:center;width:1000px;transform:scale(1.16);transform-origin:top center">${children}</div>
<div style="position:absolute;bottom:400px;left:0;right:0;font-size:52px;color:${T.accent};letter-spacing:2px">${esc(T.handle)}</div></div>`;
}

/** Writes the HyperFrames project(s) of an episode's cover(s) in <root>/.hf/<slug>-cover… and says which PNG each one becomes. */
export function generateCovers({ root, slug, brand }: { root: string; slug: string; brand?: Brand }): { projects: CoverProject[]; assets: string[] } {
  const folder = join(root, "episodes", slug), specFile = join(folder, "episode.spec.json");
  if (!existsSync(specFile)) throw new HfError(`missing ${specFile}: run \`praeko studio compile ${slug}\``);
  const spec = JSON.parse(readFileSync(specFile, "utf8")) as Spec;
  const b: Brand = brand ?? (existsSync(join(root, "brand.json")) ? JSON.parse(readFileSync(join(root, "brand.json"), "utf8")) : {});
  const T = themeFromBrand(b), F = fonts(b, T), publicDir = resolve(root, b.publicDir || "public");
  const cv = spec.cover;
  if (!cv) throw new HfError(`"${slug}" has no \`cover\` in episode.yaml`);
  const isLong = !spec.outro;
  if (!isLong && cv.component) throw new HfError(`the cover of "${slug}" uses \`component: ${cv.component}\` (TSX), which HyperFrames cannot render. Describe the cover with title/items in episode.yaml or run \`praeko studio cover ${slug} --engine remotion\``);
  const out: { name: string; dir: string; W: number; H: number; html: string; png: string; label: string; assets: string[] }[] = [];
  const dirOf = (suffix: string) => resolve(root, ".hf", `${slug}-cover${suffix}`);
  if (!isLong) {
    const ctx = { T, F, k: 0, uid: 0, where: "cover", c: { dur: COVER_DURATION, panelDur: COVER_DURATION } };
    const items = (cv.items ?? []).map((x: any) => renderItem(x, ctx));
    const html = page({ T, F, W: 1080, H: 1920, body: frame({ T, F, glow: cv.glow ?? "rgba(244,185,66,.16)", title: cv.title ?? ["", "", ""], accent: color(T, cv.color) ?? T.accent, size: cv.size ?? 130, children: items.map((x: any) => x.html).join("") }), js: items.map((x: any) => x.js).join("") });
    out.push({ name: "", dir: dirOf(""), W: 1080, H: 1920, html, png: `${slug}-cover.png`, label: "cover", assets: items.flatMap((x: any) => x.assets ?? []) });
  } else {
    const accent = color(T, cv.color) ?? T.accent, mName = cv.mascot as string | undefined;
    const wide = `<div style="position:relative;width:1280px;height:720px;background:radial-gradient(900px 500px at 75% 30%, ${rgba(T.accent, 0.16)}, ${T.background} 70%);font-family:${F.title};font-weight:${F.weight};color:${T.text};overflow:hidden">
<div style="position:absolute;left:70px;top:70px;font-size:92px;line-height:1.05;color:${T.text}">${esc(cv.title[0])}<br><span style="color:${accent}">${esc(cv.title[1])}</span></div>
<div style="position:absolute;left:70px;top:310px">${codeCard(cv, T, F, 700)}</div>
<div style="position:absolute;left:70px;top:560px">${chips(cv, T, 0.9)}</div>
${mName ? `<div style="position:absolute;right:70px;top:150px">${mascot(b, mName, 380)}</div>` : ""}
<div style="position:absolute;right:70px;bottom:50px;font-size:34px;color:${T.accent};letter-spacing:2px">${esc(T.handle)}</div></div>`;
    out.push({ name: "-wide", dir: dirOf("-wide"), W: 1280, H: 720, html: page({ T, F, W: 1280, H: 720, body: wide }), png: `${slug}-cover-1280x720.png`, label: "cover 16:9", assets: mName ? [mascotFile(b, mName)] : [] });
    const inner = `<div style="display:flex;flex-direction:column;align-items:center;gap:34px">${codeCard(cv, T, F, 780)}<div style="display:flex;align-items:center;gap:30px">${mName ? mascot(b, mName, 210) : ""}${chips(cv, T, 0.7, true)}</div></div>`;
    out.push({ name: "-vertical", dir: dirOf("-vertical"), W: 1080, H: 1920, html: page({ T, F, W: 1080, H: 1920, body: frame({ T, F, glow: cv.glow ?? rgba(T.accent, 0.16), title: [cv.title[0], cv.title[1]], accent, size: cv.title.some((l: string) => l.length > 11) ? 104 : 130, children: inner }) }), png: `${slug}-cover-vertical-1080x1920.png`, label: "cover vertical", assets: mName ? [mascotFile(b, mName)] : [] });
  }
  const allAssets: string[] = [];
  for (const p of out) {
    rmSync(join(p.dir, "index.html"), { force: true });
    mkdirSync(p.dir, { recursive: true });
    const files: Files = { ...hfFiles(`${slug}-cover${p.name}-hf`), "index.html": p.html };
    for (const [name, text] of Object.entries(files)) {
      const file = join(p.dir, name);
      if (name === "index.html" || !existsSync(file)) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); }
    }
    allAssets.push(...copyAssets({ publicDir, output: p.dir, paths: p.assets }));
  }
  return { projects: out.map((p) => ({ dir: p.dir, width: p.W, height: p.H, png: p.png, label: p.label })), assets: allAssets };
}

/** Arguments of the HyperFrames CLI that capture the cover still (validated against hyperframes@0.9.13: `snapshot [DIR] --at <s> --output <dir> --keep --no-end`). */
export const snapshotArgs = (dir: string, output: string): string[] => ["--yes", `hyperframes@${HF_VERSION}`, "snapshot", dir, "--at", String(COVER_AT), "--output", output, "--keep", "--no-end"];
/** The file `snapshot --keep --at 60` leaves in the output folder. */
export const snapshotFile = (output: string): string => join(output, `at-${COVER_AT}s.png`);

// Post-process of a skin (`skin.post`), run by `praeko studio render` after either engine: it is ffmpeg, not CSS.
//   scale + palette (pixel, 8bit): shrink by area averaging, map every pixel to the fixed palette WITHOUT dithering, upscale by nearest neighbor.
//   crt (retro-crt): scanlines, chromatic shift, slight curvature, noise and vignette over the whole frame (captions included).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { skinOf } from "../../core/src/skins.ts";
import type { SkinPost } from "../../core/src/skin.ts";

/**
 * A palette as a 16x16 binary PPM (ffmpeg's `paletteuse` wants exactly 256 pixels): the colors in order, repeated to fill the 256 cells
 * (a repeated color changes nothing: every pixel goes to its nearest palette color).
 */
export function palettePpm(colors: string[]): Buffer {
  const px = colors.map((c) => {
    const m = /^#([0-9a-f]{6})$/i.exec(c);
    if (!m) throw new Error(`palette color "${c}" is not #rrggbb`);
    const n = parseInt(m[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  });
  if (!px.length || px.length > 256) throw new Error("a palette has 1 to 256 colors");
  return Buffer.concat([Buffer.from("P6\n16 16\n255\n", "ascii"), Buffer.from(Array.from({ length: 256 }, (_, i) => px[i % px.length]!).flat())]);
}

/** The upscale factor of `scale` (1/3 → 3). */
export const upscaleOf = (scale: number): number => {
  const k = Math.round(1 / scale);
  if (!(scale > 0 && scale < 1) || Math.abs(1 / scale - k) > 1e-6) throw new Error(`post.scale ${scale}: use 1/N with a whole N (1/2, 1/3, 1/4…)`);
  return k;
};

const CRT = [
  "scale=iw/2:ih:flags=bilinear", "scale=iw*2:ih:flags=bicubic", "rgbashift=rh=-5:bh=5:gv=1", "eq=saturation=0.82:contrast=0.96:brightness=0.015", "noise=alls=7:allf=t",
  "drawbox=x=0:y='mod(t*260,ih+200)-200':w=iw:h=70:color=white@0.07:t=fill", "drawgrid=w=iw:h=4:t=2:c=black@0.30", "lenscorrection=k1=-0.06:k2=-0.015:i=bilinear", "vignette=angle=PI/4.5",
];

/**
 * The ffmpeg filter graph of a post-process. Input 0 is the video; with a palette, input 1 is the palette PPM. Output label: [v].
 * Returns null when the post-process does nothing.
 */
export function postFilter(post: SkinPost): string | null {
  const steps: string[] = [];
  let label = "0:v";
  if (post.scale !== undefined || post.palette) {
    const k = post.scale !== undefined ? upscaleOf(post.scale) : 1;
    const shrink = k > 1 ? `scale=iw/${k}:ih/${k}:flags=area` : "null";
    if (post.palette) steps.push(`[${label}]${shrink}[s]`, `[s][1:v]paletteuse=dither=none[p]`, k > 1 ? `[p]scale=iw*${k}:ih*${k}:flags=neighbor[q]` : `[p]null[q]`);
    else steps.push(`[${label}]${shrink},scale=iw*${k}:ih*${k}:flags=neighbor[q]`);
    label = "q";
  }
  if (post.crt) { steps.push(`[${label}]${CRT.join(",")}[c]`); label = "c"; }
  if (!steps.length) return null;
  steps.push(`[${label}]format=yuv420p[v]`);
  return steps.join(";");
}

/** ffmpeg arguments that post-process `input` into `output` (audio copied as is). */
export function postArgs({ input, output, post, palette }: { input: string; output: string; post: SkinPost; palette?: string }): string[] | null {
  const graph = postFilter(post);
  if (!graph) return null;
  if (post.palette && !palette) throw new Error("postArgs: the palette file is missing");
  return ["-v", "error", "-y", "-i", input, ...(post.palette ? ["-i", palette!] : []), "-filter_complex", graph, "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-crf", post.crt ? "21" : "16", "-preset", "medium", "-c:a", "copy", "-movflags", "+faststart", output];
}

const run = (cmd: string, args: string[]): Promise<{ code: number; err: string }> => new Promise((ok) => {
  const c = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"], shell: false });
  let err = ""; c.stderr!.on("data", (d) => (err += d));
  c.on("error", (e) => ok({ code: 1, err: e.message }));
  c.on("exit", (code) => ok({ code: code ?? 1, err }));
});

/** Post-processes `file` in place (written to a temporary file next to it, then renamed). */
export async function postProcessFile(file: string, post: SkinPost, ffmpeg = "ffmpeg"): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "praeko-post-"));
  try {
    const palette = post.palette ? join(dir, "palette.ppm") : undefined;
    if (palette) writeFileSync(palette, palettePpm(post.palette!));
    const out = join(dirname(file), `.${basename(file, ".mp4")}.post.mp4`);
    const args = postArgs({ input: file, output: out, post, palette });
    if (!args) return;
    const r = await run(ffmpeg, args);
    if (r.code) { rmSync(out, { force: true }); throw new Error(`ffmpeg post-process failed: ${r.err.trim().split("\n").slice(-3).join(" | ") || `exit ${r.code}`}`); }
    renameSync(out, file);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** The skin post-process of a rendered episode (from `style` in its episode.spec.json); a no-op for skins without `post`. */
export async function applySkinPost(folder: string, file: string, log: (s: string) => void = console.log): Promise<number> {
  const specFile = join(folder, "episode.spec.json");
  const spec = existsSync(specFile) ? JSON.parse(readFileSync(specFile, "utf8")) : null;
  const skin = skinOf(spec?.style);
  if (!skin?.post || !postFilter(skin.post)) return 0;
  const what = [skin.post.palette ? `${skin.post.palette.length}-color palette` : "", skin.post.scale ? `pixels ×${upscaleOf(skin.post.scale)}` : "", skin.post.crt ? "CRT" : ""].filter(Boolean).join(", ");
  try { await postProcessFile(file, skin.post); } catch (e: any) { log(`✗ post-process of the "${skin.id}" skin: ${e.message}`); return 1; }
  log(`✓ post-process of the "${skin.id}" skin (${what})`);
  return 0;
}

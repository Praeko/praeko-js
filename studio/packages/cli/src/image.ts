// Image pieces (`format: image` and `format: carousel`): the checks on the JPEG that `praeko studio slides` writes, with no image library (it reads only the header).
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { STUDIO_NPX } from "./version.ts";

/** What the Praeko server and Instagram accept for a feed photo (docs/imagens-e-carrosseis.md). */
export const IMAGE_LIMITS = { width: 1080, height: 1350, bytesMax: 8 * 1024 * 1024, altMax: 1000, quality: 92 } as const;

/** Width and height from the first SOFn marker of a JPEG, or null if the bytes are not a JPEG or the header has no frame. */
export function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  if (!(b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)) return null;
  let o = 2;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) return null;
    while (b[o] === 0xff && o < b.length) o++;
    const m = b[o++]!;
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) continue;
    if (m === 0xd9 || m === 0xda) return null;
    if (o + 2 > b.length) return null;
    const len = (b[o]! << 8) | b[o + 1]!;
    if (len < 2) return null;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      if (o + 7 > b.length) return null;
      const height = (b[o + 3]! << 8) | b[o + 4]!, width = (b[o + 5]! << 8) | b[o + 6]!;
      return width > 0 && height > 0 ? { width, height } : null;
    }
    o += len;
  }
  return null;
}

export type ImageCheck = { file: string; bytes: number; width: number | null; height: number | null; errors: string[]; warnings: string[] };
/** Checks one rendered slide: JPEG signature, 1080x1350, at most 8 MB. */
export function checkJpeg(file: string): ImageCheck {
  const errors: string[] = [], warnings: string[] = [];
  if (!existsSync(file)) return { file, bytes: 0, width: null, height: null, errors: [`${file} does not exist`], warnings };
  const bytes = statSync(file).size, head = readFileSync(file).subarray(0, 256 * 1024), s = jpegSize(head);
  if (!s) { errors.push(`${file} is not a JPEG (or its header has no dimensions): \`${STUDIO_NPX} slides\` writes a JPEG`); return { file, bytes, width: null, height: null, errors, warnings }; }
  if (s.width !== IMAGE_LIMITS.width || s.height !== IMAGE_LIMITS.height) errors.push(`image is ${s.width}x${s.height}, expected ${IMAGE_LIMITS.width}x${IMAGE_LIMITS.height} (4:5)`);
  if (bytes > IMAGE_LIMITS.bytesMax) errors.push(`image has ${(bytes / 1048576).toFixed(1)} MB: Instagram accepts up to ${IMAGE_LIMITS.bytesMax / 1048576} MB`);
  return { file, bytes, width: s.width, height: s.height, errors, warnings };
}

/** Seconds one slide may take to render before it is stopped (`praeko studio slides --timeout <seconds>`). */
export const SLIDE_TIMEOUT_S = 180;
/** The slide file names of an image piece or carousel: out/<slug>-slide-01.jpg, -02, … (the order of `slides:` in episode.yaml). */
export const slideFile = (root: string, slug: string, n = 1): string => join(root, "out", `${slug}-slide-${String(n).padStart(2, "0")}.jpg`);

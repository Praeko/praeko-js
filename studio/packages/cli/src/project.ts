// Project discovery: walks up folders until it finds `brand.json` next to `src/index.ts`.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Brand } from "@praeko/studio-publish";

export type Project = { root: string; brand: Brand };
export type Episode = { slug: string; folder: string; id: string; cover: string; title?: string; mp4: string; png: string };

export const LEGACY_MESSAGE = "this project uses the old Portuguese layout: run `praeko studio migrate` (add --dry-run to preview)";

/** Nearest folder (from `from` upwards) that has src/index.ts and a brand file (brand.json, or the old marca.json that only `migrate` understands). */
export function findProjectRoot(from: string = process.cwd()): string | null {
  let d = resolve(from);
  for (;;) {
    if (existsSync(join(d, "src", "index.ts")) && (existsSync(join(d, "brand.json")) || existsSync(join(d, "marca.json")))) return d;
    const p = dirname(d);
    if (p === d) return null;
    d = p;
  }
}
/** True for a project in the 0.1.0 Portuguese layout (marca.json without brand.json, or an episodios/ folder). */
export const isLegacyLayout = (root: string): boolean => (existsSync(join(root, "marca.json")) && !existsSync(join(root, "brand.json"))) || existsSync(join(root, "episodios"));

export function findProject(from: string = process.cwd()): Project {
  const root = findProjectRoot(from);
  if (!root) throw new Error("no Praeko Studio project found (a folder with brand.json and src/index.ts). Run `praeko studio init <folder>` or enter the project folder.");
  if (isLegacyLayout(root)) throw new Error(LEGACY_MESSAGE);
  return { root, brand: JSON.parse(readFileSync(join(root, "brand.json"), "utf8")) };
}
export const pascal = (slug: string): string => slug.split(/[^a-zA-Z0-9]+/).filter(Boolean).map((s) => s[0]!.toUpperCase() + s.slice(1)).join("");
export function episodeOf(project: Project, slug: string | undefined): Episode {
  const folder = join(project.root, "episodes", String(slug));
  if (!slug || !existsSync(folder)) throw new Error(`episode "${slug}" does not exist (${folder}). Create it with: praeko studio new ${slug ?? "<slug>"}`);
  const file = join(folder, "episode.json");
  const info = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { id: pascal(slug), cover: `Cover${pascal(slug)}` };
  return { slug, folder, ...info, mp4: join(project.root, "out", `${slug}.mp4`), png: join(project.root, "out", `${slug}-cover.png`) };
}

// @praeko/studio-hyperframes: Praeko Studio's second render engine. Reads the compiled episode and generates a HyperFrames project (HTML + GSAP).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { HF_VERSION, HfError, copyAssets, hfFiles, fonts, requireNoComponents, specComponents, themeFromBrand } from "./common.ts";
import type { Block, Brand, Spec, Word } from "./common.ts";
import { generateLong } from "./long.ts";
import { generateShort, groupWords } from "./short.ts";
import { COVER_AT, generateCovers, snapshotArgs, snapshotFile } from "./cover.ts";

export { COVER_AT, generateCovers, snapshotArgs, snapshotFile };
export type { CoverProject } from "./cover.ts";
export { HfError, HF_VERSION, specComponents, requireNoComponents, fonts, themeFromBrand, groupWords };
export type { Brand, Spec, Word, Block };

const readJson = <T>(file: string, fallback: T): T => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback);
/** A long video has an `endcard`/no `outro`: the Short spec always has `outro`. */
export const isLong = (spec: Spec): boolean => !spec.outro;

/** Engine choice: --engine > `engine:` of episode.yaml (it goes in the spec) > the brand's `engine` > remotion. */
export function chooseEngine({ flag, spec, brand }: { flag?: string; spec?: Spec; brand?: Brand }): "remotion" | "hyperframes" {
  const m = flag ?? spec?.engine ?? brand?.engine ?? "remotion";
  if (!["remotion", "hyperframes"].includes(m)) throw new HfError(`engine "${m}" does not exist (use remotion or hyperframes)`);
  return m as "remotion" | "hyperframes";
}

/**
 * Generates an episode's HyperFrames project in <root>/.hf/<slug>/ (or `output`).
 * Prerequisites: `praeko studio compile` (episode.spec.json) and `praeko studio voice` (words.json).
 */
export function generateProject({ root, slug, output, brand }: { root: string; slug: string; output?: string; brand?: Brand }): { dir: string; format: "long" | "short"; durS: number; scenes: number; assets: string[]; files: string[] } {
  const folder = join(root, "episodes", slug);
  const specFile = join(folder, "episode.spec.json");
  if (!existsSync(specFile)) throw new HfError(`missing ${specFile}: run \`praeko studio compile ${slug}\``);
  const spec = JSON.parse(readFileSync(specFile, "utf8")) as Spec;
  if (!Array.isArray(spec.scenes)) throw new HfError(`${specFile} has no "scenes": it looks like a spec from Studio 0.1.x. Run \`praeko studio migrate\` and \`praeko studio compile ${slug}\`.`);
  const words = readJson<Word[]>(join(folder, "words.json"), []);
  if (!words.length) throw new HfError(`missing words.json in ${folder}: run \`praeko studio voice ${slug}\``);
  const blocks = readJson<Block[]>(join(folder, "blocks.json"), []);
  const b: Brand = brand ?? readJson<Brand>(join(root, "brand.json"), {});
  const T = themeFromBrand(b), F = fonts(b, T);
  const publicDir = resolve(root, b.publicDir || "public");
  const dir = resolve(output ?? join(root, ".hf", slug));

  requireNoComponents(slug, spec);
  const long = isLong(spec);
  const r = long ? generateLong({ spec, words, blocks, brand: b, T, F, slug }) : generateShort({ spec, words, brand: b, T, F, slug });

  rmSync(join(dir, "compositions"), { recursive: true, force: true });
  rmSync(join(dir, "index.html"), { force: true });
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries({ ...hfFiles(`${slug}-hf`), ...r.files })) {
    const file = join(dir, name);
    if (name.startsWith("compositions/") || name === "index.html" || !existsSync(file)) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); }
  }
  const assets = copyAssets({ publicDir, output: dir, paths: r.assets });
  return { dir, format: long ? "long" : "short", durS: r.durS, scenes: r.scenes, assets, files: Object.keys(r.files) };
}

export type CheckFinding = { level: string; section: string; code: string; msg: string; at?: number };
/** Summarizes the `hyperframes check --json` output (errors and warnings) into short lines. */
export function summarizeCheck(json: any): { ok: boolean; errors: CheckFinding[]; warnings: CheckFinding[]; byCode: Record<string, number> } {
  const found: CheckFinding[] = [];
  for (const section of ["lint", "runtime", "layout", "motion", "contrast", "craft", "audio", "hdr"]) {
    for (const f of json?.[section]?.findings ?? []) found.push({ level: f.severity, section, code: f.code, msg: String(f.message ?? "").slice(0, 160), at: f.time ?? f.timestamp });
  }
  const errors = found.filter((x) => x.level === "error"), warnings = found.filter((x) => x.level === "warning");
  const byCode: Record<string, number> = {};
  for (const a of warnings) byCode[a.code] = (byCode[a.code] ?? 0) + 1;
  return { ok: errors.length === 0, errors, warnings, byCode };
}

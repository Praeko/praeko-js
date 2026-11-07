// Render engine: remotion (default) or hyperframes. `praeko studio render|preview <slug> --engine hyperframes`.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { copyFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { HF_VERSION, HfError, chooseEngine, generateCovers, generateProject, snapshotArgs, snapshotFile, specComponents, summarizeCheck } from "@praeko/studio-hyperframes";
import type { Episode, Project } from "./project.ts";

/** `npx` without a shell: on Windows, the npx-cli.js that ships with Node; elsewhere, the `npx` on PATH. */
const npx = (args: string[]): [string, string[]] => process.platform === "win32" ? [process.execPath, [join(dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js"), ...args]] : ["npx", args];
const run = (command: string, args0: string[], cwd: string, output: "inherit" | "pipe" = "inherit"): Promise<{ code: number; out: string }> => new Promise((ok) => {
  const [cmd, args] = command === "npx" ? npx(args0) : [command, args0];
  const c = spawn(cmd, args, { cwd, shell: false, stdio: output === "inherit" ? "inherit" : ["ignore", "pipe", "inherit"] });
  let out = ""; if (output !== "inherit") c.stdout!.on("data", (d) => (out += d));
  c.on("exit", (code) => ok({ code: code ?? 1, out }));
});
const readSpec = (ep: Episode): any => { const f = join(ep.folder, "episode.spec.json"); return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null; };

/** This episode's engine: --engine > `engine:` of episode.yaml > `engine` of brand.json > remotion. */
export const engineOf = (p: Project, ep: Episode, flag?: string): "remotion" | "hyperframes" => chooseEngine({ flag, spec: readSpec(ep), brand: p.brand as any });

/** Warnings of `praeko studio compile` when the episode goes to HyperFrames (TSX scenes do not exist there). */
export function hyperframesWarnings(ep: Episode): string[] {
  const spec = readSpec(ep);
  return spec ? specComponents(spec).map((x: any) => `hyperframes engine: scene ${x.scene}${x.title ? ` (${x.title})` : ""} uses \`component: ${x.component}\` (TSX) and does not render in HyperFrames`) : [];
}

export const hyperframesMp4 = (p: Project, ep: Episode): string => join(p.root, "out", `${ep.slug}.hf.mp4`);

/** Generates the project, checks it (`hyperframes check`) and renders to out/<slug>.hf.mp4. */
export async function renderHyperframes(p: Project, ep: Episode): Promise<number> {
  let g: ReturnType<typeof generateProject>;
  try { g = generateProject({ root: p.root, slug: ep.slug, brand: p.brand as any }); } catch (e) { if (e instanceof HfError) { console.log(`✗ ${e.message}`); return 1; } throw e; }
  console.log(`✓ HyperFrames project: ${relative(process.cwd(), g.dir)} (${g.format}, ${g.scenes} scenes, ${g.assets.length} assets)`);
  const ck = await run("npx", ["--yes", `hyperframes@${HF_VERSION}`, "check", "--json"], g.dir, "pipe");
  const json = (() => { const i = ck.out.indexOf("{"); try { return JSON.parse(ck.out.slice(i)); } catch { return null; } })();
  if (!json) { console.log("✗ `hyperframes check` did not return JSON; run `npx hyperframes check` in " + relative(process.cwd(), g.dir)); return 1; }
  const r = summarizeCheck(json);
  for (const e of r.errors.slice(0, 8)) console.log(`✗ [${e.code}] ${e.msg}`);
  const summary = Object.entries(r.byCode).map(([k, n]) => `${k}×${n}`).join(", ");
  if (r.warnings.length) console.log(`⚠ ${r.warnings.length} warning(s) from the check: ${summary}`);
  if (!r.ok) return 1;
  mkdirSync(join(p.root, "out"), { recursive: true });
  const output = hyperframesMp4(p, ep);
  const t0 = Date.now();
  const c = await run("npx", ["--yes", `hyperframes@${HF_VERSION}`, "render", "--output", output], g.dir);
  if (!c.code) console.log(`rendered (hyperframes, ${((Date.now() - t0) / 1000).toFixed(0)} s): ${relative(process.cwd(), output)}`);
  return c.code;
}

export async function previewHyperframes(p: Project, ep: Episode): Promise<number> {
  let g: ReturnType<typeof generateProject>;
  try { g = generateProject({ root: p.root, slug: ep.slug, brand: p.brand as any }); } catch (e) { if (e instanceof HfError) { console.log(`✗ ${e.message}`); return 1; } throw e; }
  return (await run("npx", ["--yes", `hyperframes@${HF_VERSION}`, "preview"], g.dir)).code;
}

/** The cover through HyperFrames: one still project per cover (`hyperframes snapshot`), copied to out/. Needs no Remotion. */
export async function coverHyperframes(p: Project, ep: Episode, runner: typeof run = run): Promise<number> {
  let g: ReturnType<typeof generateCovers>;
  try { g = generateCovers({ root: p.root, slug: ep.slug, brand: p.brand as any }); } catch (e) { if (e instanceof HfError) { console.log(`✗ ${e.message}`); return 1; } throw e; }
  mkdirSync(join(p.root, "out"), { recursive: true });
  const made: string[] = [];
  for (const c of g.projects) {
    const snap = join(c.dir, ".snapshot");
    rmSync(snap, { recursive: true, force: true }); // never reuse a stale still
    const r = await runner("npx", snapshotArgs(c.dir, snap), c.dir);
    const file = snapshotFile(snap);
    if (r.code || !existsSync(file)) { console.log(`✗ \`hyperframes snapshot\` did not produce the ${c.label} (${relative(process.cwd(), c.dir)})`); return r.code || 1; }
    const target = join(p.root, "out", c.png);
    copyFileSync(file, target);
    made.push(relative(process.cwd(), target));
  }
  console.log(`${made.length > 1 ? "covers" : "cover"} (hyperframes): ${made.join(" · ")}`);
  return 0;
}

// Every path this server touches is built here from FIXED names plus validated episode slugs, and checked to stay inside the project:
// no absolute paths, no `..`, no NUL, and symlinks are followed only if they land inside the project (writes refuse symlinks altogether).
import { existsSync, lstatSync, mkdirSync, realpathSync, renameSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";

export class UserError extends Error {}

export const SLUG = /^[a-z0-9][a-z0-9-]*$/;
export function assertSlug(slug: unknown): string {
  if (typeof slug !== "string" || slug.length > 80 || !SLUG.test(slug)) throw new UserError('episode name must match ^[a-z0-9][a-z0-9-]*$ (lowercase letters, digits and hyphens, at most 80 characters)');
  return slug;
}

const inside = (root: string, p: string): boolean => p === root || p.startsWith(root + sep);

/** The project folder as the real path, if it has brand.json and src/index.ts (the same markers the Studio uses to find a project). */
export function openProject(dir: string): string {
  let root: string;
  try { root = realpathSync(resolve(dir)); } catch { throw new UserError(`project folder does not exist: ${dir}`); }
  if (!statSync(root).isDirectory()) throw new UserError(`project is not a folder: ${dir}`);
  const brand = join(root, "brand.json");
  if (!existsSync(brand)) throw new UserError(`${dir} has no brand.json: point --project at a Praeko Studio project (create one with \`praeko-studio init <folder>\`)`);
  if (!inside(root, realpathSync(brand))) throw new UserError("brand.json points outside the project");
  return root;
}
/** The CLI looks for src/index.ts to find the project; without it a parent folder could be picked instead. */
export function assertStudioProject(root: string): void {
  if (!existsSync(join(root, "src", "index.ts"))) throw new UserError("this folder has brand.json but no src/index.ts, so it is not a complete Studio project (create it with `praeko-studio init`)");
}

/** Resolves `parts` (relative, validated segments) inside `root`. Throws if anything escapes. The result may not exist yet. */
export function resolveInside(root: string, ...parts: string[]): string {
  for (const part of parts) {
    if (typeof part !== "string" || !part || part.includes("\0") || part.includes("\\") || isAbsolute(part)) throw new UserError(`path outside the project: ${JSON.stringify(part)}`);
    if (part.split("/").some((seg) => seg === ".." || seg === "")) throw new UserError(`path outside the project: ${JSON.stringify(part)}`);
  }
  const target = resolve(root, ...parts);
  if (!inside(root, target)) throw new UserError("path outside the project");
  // the deepest existing ancestor (or the file itself) must really live inside the project once symlinks are resolved
  let probe = target;
  while (!existsSync(probe) && !isLink(probe)) { const up = dirname(probe); if (up === probe) break; probe = up; }
  let real: string;
  try { real = realpathSync(probe); } catch { throw new UserError("path outside the project (broken symlink)"); }
  if (!inside(root, real)) throw new UserError("path outside the project (a symlink leads out of it)");
  return target;
}
const isLink = (p: string): boolean => { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } };

/** Episode folder: must exist, be a real folder inside the project. */
export function episodeFolder(root: string, slug: string): string {
  assertSlug(slug);
  const folder = resolveInside(root, "episodes", slug);
  if (!existsSync(folder) || !statSync(folder).isDirectory()) throw new UserError(`episode "${slug}" does not exist (create it with studio_new_episode)`);
  return folder;
}

/** Writes through a temp file + rename (so a swapped-in symlink is replaced, never followed). Refuses a destination that is a symlink. */
export function writeInside(root: string, text: string, ...parts: string[]): string {
  const target = resolveInside(root, ...parts);
  if (isLink(target)) throw new UserError(`${parts.join("/")} is a symlink: refusing to write through it`);
  mkdirSync(dirname(target), { recursive: true });
  resolveInside(root, ...parts); // again, now that the folder exists
  const tmp = join(dirname(target), `.${basename(target)}.${process.pid}.tmp`);
  try { writeFileSync(tmp, text, { flag: "wx" }); renameSync(tmp, target); }
  finally { try { unlinkSync(tmp); } catch { /* already renamed */ } }
  return target;
}

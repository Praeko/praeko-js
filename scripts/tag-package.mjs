// Maps a release tag to its package and checks the version: `sdk-v0.2.0`, `cli-v0.4.0`, `studio-v0.2.0`, `studio-core-v0.2.0`, `studio-kit-v0.2.0`.
// Used by the workflow (publicar.yml): node scripts/tag-package.mjs "$GITHUB_REF_NAME"   -> prints PACKAGE=<key> and DIR=<folder> (exits 1 if the tag is odd or the version does not match).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const DIRS = { sdk: "packages/sdk", cli: "packages/cli", studio: "studio/packages/cli", "studio-core": "studio/packages/core", "studio-kit": "studio/packages/kit" };
const root = fileURLToPath(new URL("..", import.meta.url));

/** `tag` -> { key, dir, version } or throws. The key is what comes before `-v<semver>` (semver has no "-v"; neither does a package name). */
export function resolveTag(tag, base = root) {
  const m = /^([a-z][a-z-]*)-v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag || "");
  if (!m || !DIRS[m[1]]) throw new Error(`unexpected tag: ${tag} (use ${Object.keys(DIRS).map((k) => k + "-vX.Y.Z").join(", ")})`);
  const [, key, version] = m, dir = DIRS[key];
  const current = JSON.parse(readFileSync(join(base, dir, "package.json"), "utf8")).version;
  if (current !== version) throw new Error(`tag ${tag} does not match ${dir}/package.json (${current})`);
  return { key, dir, version };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { const r = resolveTag(process.argv[2]); console.log(`PACKAGE=${r.key}\nDIR=${r.dir}`); }
  catch (e) { console.error(e.message); process.exit(1); }
}

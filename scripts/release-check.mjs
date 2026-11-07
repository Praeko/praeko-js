// Checks, without publishing anything, what would go to npm: runs `npm pack --dry-run --json` on every publishable package and validates the tarball contents.
// Usage: node scripts/release-check.mjs   (runs the same in the private monorepo and in the tree exported to the public repository; license and repository are always required)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { ISSUES_URL, PUBLIC_REPO, REPO_URL } from "./public-repo.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
export const PACKAGES = { sdk: "packages/sdk", cli: "packages/cli", studio: "studio/packages/cli", "studio-core": "studio/packages/core", "studio-kit": "studio/packages/kit" };
const FORBIDDEN = [/(^|\/)test\//, /\.test\.m?[jt]s$/, /\.check\.ts$/, /(^|\/)\.env/, /\.dev\.vars/, /secrets/i, /\.praeko\//, /\.arauto\//, /node_modules/, /\.map$/, /(^|\/)tsconfig[\w.]*\.json$/, /(^|\/)src\//, /(?<!\.d)\.m?ts$/, /\.(pem|key)$/];

/** Lists what `npm pack` would put in the tarball (without writing the file). Does not run `prepack`: build first (npm run build:sdk, npm run build -w packages/cli), otherwise the list comes out without dist/. */
export function listTarball(dir) {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: join(root, dir), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const [info] = JSON.parse(out.slice(out.indexOf("[")));
  return { files: info.files.map((f) => f.path), size: info.size, unpacked: info.unpackedSize, name: info.filename };
}

const exportTargets = (e) => typeof e === "string" ? [e] : e && typeof e === "object" ? Object.values(e).flatMap(exportTargets) : [];

/** Returns the list of problems (empty = ok). */
export function problems(key) {
  const dir = PACKAGES[key], pkg = JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8"));
  const { files } = listTarball(dir), set = new Set(files), p = [];
  if (pkg.private) p.push("package.json still has private: true");
  if (pkg.publishConfig?.access !== "public") p.push("publishConfig.access must be public");
  if (pkg.publishConfig?.provenance) p.push("publishConfig.provenance must not be true: the owner's manual publish (outside CI) would fail; provenance comes from the workflow (--provenance) and is automatic with the trusted publisher");
  if (!pkg.repository?.url || !pkg.homepage || !pkg.bugs?.url) p.push("missing repository/homepage/bugs");
  if (!pkg.engines?.node) p.push("missing engines.node");
  if (pkg.license !== "MIT") p.push("license must be MIT");
  if (pkg.repository?.url !== REPO_URL) p.push(`repository.url must be ${REPO_URL} (the npm trusted publisher requires it to match the repository ${PUBLIC_REPO}; scripts/public-repo.mjs)`);
  if (pkg.repository?.directory !== dir) p.push(`repository.directory must be ${dir}`);
  if (pkg.bugs?.url !== ISSUES_URL) p.push(`bugs.url must be ${ISSUES_URL}`);
  for (const [a, n] of [["dist/", "dist/ (run the build first: the tarball would ship without the compiled code)"]]) if (!files.some((x) => x.startsWith(a))) p.push(`missing from the tarball: ${n}`);
  for (const ob of ["package.json", "README.md", "CHANGELOG.md", "LICENSE"]) if (!set.has(ob)) p.push(`missing from the tarball: ${ob}`);
  for (const a of files) if (FORBIDDEN.some((r) => r.test(a))) p.push(`file that should not ship: ${a}`);
  const targets = [...exportTargets(pkg.exports), ...(pkg.main ? [pkg.main] : []), ...(pkg.types ? [pkg.types] : []), ...Object.values(typeof pkg.bin === "string" ? { x: pkg.bin } : pkg.bin ?? {})];
  for (const a of targets) if (a !== "./package.json" && !set.has(a.replace(/^\.\//, ""))) p.push(`points to a file outside the tarball: ${a}`);
  const deps = { ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies };
  const published = new Set(Object.keys(PACKAGES).map((k) => JSON.parse(readFileSync(join(root, PACKAGES[k], "package.json"), "utf8")).name));
  for (const d of Object.keys(deps)) if (d.startsWith("@praeko/") && !published.has(d)) p.push(`monorepo dependency in dependencies: ${d} (it should be bundled or published)`);
  if (/^(0\.0\.|)$/.test(pkg.version)) p.push("version still 0.0.x");
  if (key.startsWith("studio") && !set.has("LICENSES.md")) p.push("missing from the tarball: LICENSES.md (the Remotion license notice)");
  if (key.startsWith("studio")) for (const a of files) if (/\.(mp3|mp4|mov|ttf|otf|woff2?)$/i.test(a)) p.push(`media or font in the tarball (license?): ${a}`);
  return p;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const w of ["packages/sdk", "packages/cli"]) execFileSync("npm", ["run", "build", "-w", w], { cwd: root, stdio: "inherit" });
  execFileSync(process.execPath, [join(root, "scripts", "build-studio.mjs")], { stdio: "inherit" });
  let failed = false;
  for (const key of Object.keys(PACKAGES)) {
    const { files, size, unpacked, name } = listTarball(PACKAGES[key]), pr = problems(key);
    console.log(`\n== ${key}: ${name} (${files.length} files, ${size} B packed, ${unpacked} B unpacked)`);
    for (const a of files) console.log("  " + a);
    for (const x of pr) { console.error("  PROBLEM: " + x); failed = true; }
  }
  process.exit(failed ? 1 : 0);
}

// `praeko studio <command>`: hands the command over to Praeko Studio (package @praeko/studio, bin `praeko-studio`), installed separately.
// Where to look, in this order: (1) the current project (node_modules/@praeko/studio), (2) next to this @praeko/cli, (3) the global npm install, (4) a `praeko-studio` on the PATH.
// Without Studio: a message with the install commands and, in an interactive terminal, the offer to run `npx @praeko/studio` right away.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, dirname, join } from "node:path";

export const STUDIO_PACKAGE = "@praeko/studio";
export type Found = { kind: "node" | "binary"; path: string; where: string };
export type Deps = { cwd?: string; env?: NodeJS.ProcessEnv; platform?: string; npmRootGlobal?: () => string | null; here?: string };

/** The file that the Studio package.json `bin` points to, given the package.json. */
function binOf(pkgJson: string): string | null {
  try { const p = JSON.parse(readFileSync(pkgJson, "utf8")), b = typeof p.bin === "string" ? p.bin : p.bin?.["praeko-studio"]; const f = b && join(dirname(pkgJson), b); return f && existsSync(f) ? f : null; } catch { return null; }
}
const resolveFrom = (base: string): string | null => { try { return binOf(createRequire(join(base, "noop.js")).resolve(STUDIO_PACKAGE + "/package.json")); } catch { return null; } };

/** The npm global folder without a shell: `npm root -g` (on Windows, the npm-cli.js that ships with Node). Null if it fails. */
function defaultNpmRootGlobal(platform: string): string | null {
  try {
    const [cmd, args] = platform === "win32" ? [process.execPath, [join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"), "root", "-g"]] : ["npm", ["root", "-g"]];
    const r = spawnSync(cmd as string, args as string[], { encoding: "utf8", shell: false, timeout: 15000 });
    return r.status === 0 ? r.stdout.trim() : null;
  } catch { return null; }
}

export function findStudio(d: Deps = {}): Found | null {
  const cwd = d.cwd ?? process.cwd(), env = d.env ?? process.env, plat = d.platform ?? process.platform;
  let f = resolveFrom(cwd);
  if (f) return { kind: "node", path: f, where: "in this project" };
  f = resolveFrom(d.here ?? import.meta.dirname ?? cwd);
  if (f) return { kind: "node", path: f, where: "next to @praeko/cli" };
  const root = (d.npmRootGlobal ?? (() => defaultNpmRootGlobal(plat)))();
  if (root) { f = binOf(join(root, "@praeko", "studio", "package.json")); if (f) return { kind: "node", path: f, where: "global npm install" }; }
  for (const dir of (env.PATH || env.Path || "").split(delimiter).filter(Boolean)) {
    for (const name of plat === "win32" ? ["praeko-studio.exe"] : ["praeko-studio"]) { const c = join(dir, name); if (existsSync(c)) return { kind: "binary", path: c, where: "on the PATH" }; }
  }
  return null;
}

export const MISSING_MESSAGE = `praeko studio: Praeko Studio (videos with your own agent) is a separate package and was not found.
  Install in the project (recommended):  npm install -D ${STUDIO_PACKAGE}
  Install globally:                      npm install -g ${STUDIO_PACKAGE}
  Run without installing:                npx ${STUDIO_PACKAGE} <command>
  New video project:                     npx ${STUDIO_PACKAGE} init my-channel
The other praeko commands keep working.`;

/** Runs Studio with the arguments. Returns the exit code. `run` and `ask` can be injected in tests. */
export function delegateToStudio(args: string[], d: Deps & { run?: (cmd: string, a: string[], env: NodeJS.ProcessEnv) => number; ask?: () => boolean; error?: (m: string) => void } = {}): number {
  const env: NodeJS.ProcessEnv = { ...(d.env ?? process.env), PRAEKO_STUDIO: "1" };
  const run = d.run ?? ((cmd, a, e) => spawnSync(cmd, a, { stdio: "inherit", env: e, shell: false }).status ?? 1);
  const error = d.error ?? ((m: string) => console.error(m));
  const found = findStudio(d);
  if (found) return found.kind === "node" ? run(process.execPath, [found.path, ...args], env) : run(found.path, args, env);
  error(MISSING_MESSAGE);
  const interactive = process.stdin.isTTY && process.stdout.isTTY;
  const wants = d.ask ? d.ask() : interactive && !(env.PRAEKO_STUDIO_NO_NPX) && askYesNo(`Run it now with \`npx ${STUDIO_PACKAGE}\`? [y/N] `);
  if (!wants) return 1;
  const [cmd, a] = (d.platform ?? process.platform) === "win32" ? [process.execPath, [join(dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js"), "--yes", STUDIO_PACKAGE, ...args]] : ["npx", ["--yes", STUDIO_PACKAGE, ...args]];
  return run(cmd as string, a as string[], env);
}

function askYesNo(question: string): boolean {
  process.stdout.write(question);
  const buf = Buffer.alloc(16);
  try { const n = readSync(0, buf, 0, buf.length, null); return /^[yY]/.test(buf.subarray(0, n).toString()); } catch { return false; }
}

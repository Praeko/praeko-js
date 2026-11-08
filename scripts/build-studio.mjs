// Builds the four publishable Praeko Studio packages: node scripts/build-studio.mjs [core|kit|cli|mcp ...]  (no argument: all of them, in that order)
//   core, kit: esbuild bundles the .ts/.tsx into dist/index.js (ESM; react, remotion and @praeko/studio-core stay external) and tsc writes the .d.ts files
//              (with relative specifiers rewritten to `.js`, which is what consumers resolve).
//   cli (@praeko/studio): one bundle per script (praeko-studio, voice-balance, voice-voices, voice-account, voice-config) with cli+voice+publish+review+hyperframes+yaml inside;
//              only the ElevenLabs SDK stays external (declared dependency).
//   mcp (@praeko/studio-mcp): one bundle (praeko-studio-mcp) with the server code, yaml, the voice package and @praeko/sdk inside; the MCP SDK, zod, the ElevenLabs SDK and @praeko/studio (whose CLI it runs) stay external.
//              Also syncs LICENSE and LICENSES.md from studio/ into each package.
import { build } from "esbuild";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url)), studio = root + "studio/";
const folder = (n) => ({ core: studio + "packages/core/", kit: studio + "packages/kit/", cli: studio + "packages/cli/", mcp: studio + "packages/mcp/" })[n];
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
const readVersion = (n) => JSON.parse(readFileSync(folder(n) + "package.json", "utf8")).version;

export async function syncLicenses() {
  for (const n of ["core", "kit", "cli", "mcp"]) for (const f of ["LICENSE", "LICENSES.md"]) copyFileSync(studio + f, folder(n) + f);
}

/** studio/skill/praeko-studio/SKILL.md is generated from the same text `praeko studio skill install` writes (only needed when the cli is built). */
export async function syncSkill() {
  // studio/skill/praeko-studio/SKILL.md is generated from the same text `praeko studio skill install` writes (single source)
  const { TARGETS } = await import(studio + "packages/cli/src/skill.ts");
  mkdirSync(studio + "skill/praeko-studio", { recursive: true });
  writeFileSync(studio + "skill/praeko-studio/SKILL.md", TARGETS.claude[0].content("en"));
}

async function library(n) {
  const dir = folder(n);
  rmSync(dir + "dist", { recursive: true, force: true });
  await build({
    entryPoints: [dir + "src/index.ts"], outfile: dir + "dist/index.js", bundle: true, format: "esm", platform: "neutral", target: "es2022", jsx: "automatic", logLevel: "error", legalComments: "none",
    external: ["react", "react/jsx-runtime", "react-dom", "remotion", "@praeko/studio-core"], mainFields: ["module", "main"],
  });
  execFileSync(process.execPath, [tsc, "-p", dir + "tsconfig.build.json"], { stdio: "inherit" });
  rewriteDtsSpecifiers(dir + "dist");
}

/** tsc keeps `./x.ts`/`./x.tsx` specifiers in the .d.ts files; consumers need `./x.js`. Rewrites relative specifiers in every .d.ts under `dir`. */
export function rewriteDtsSpecifiers(dir) {
  for (const f of readdirSync(dir, { recursive: true })) {
    if (!String(f).endsWith(".d.ts")) continue;
    const file = dir + "/" + f, text = readFileSync(file, "utf8");
    writeFileSync(file, text.replace(/((?:from|import)\s*\(?\s*["'])(\.{1,2}\/[^"']*?)\.tsx?(["'])/g, "$1$2.js$3"));
  }
}

async function cli() {
  const dir = folder("cli");
  rmSync(dir + "dist", { recursive: true, force: true });
  const voice = studio + "packages/voice/bin/";
  await build({
    entryPoints: { "praeko-studio": dir + "bin/praeko-studio.ts", "voice-balance": voice + "balance.ts", "voice-voices": voice + "voices.ts", "voice-account": voice + "account.ts", "voice-config": voice + "config.ts" },
    outdir: dir + "dist", bundle: true, format: "esm", platform: "node", target: "node22", outExtension: { ".js": ".mjs" }, logLevel: "error", legalComments: "none",
    external: ["@elevenlabs/elevenlabs-js"], define: { __STUDIO_VERSION__: JSON.stringify(readVersion("cli")) },
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  chmodSync(dir + "dist/praeko-studio.mjs", 0o755);
}

async function mcp() {
  const dir = folder("mcp");
  rmSync(dir + "dist", { recursive: true, force: true });
  await build({
    entryPoints: { "praeko-studio-mcp": dir + "bin/praeko-studio-mcp.ts" }, outdir: dir + "dist", bundle: true, format: "esm", platform: "node", target: "node22", outExtension: { ".js": ".mjs" }, logLevel: "error", legalComments: "none",
    external: ["@modelcontextprotocol/sdk", "@modelcontextprotocol/sdk/*", "zod", "@praeko/studio", "@praeko/studio/*", "@elevenlabs/elevenlabs-js"], define: { __MCP_VERSION__: JSON.stringify(readVersion("mcp")) },
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  chmodSync(dir + "dist/praeko-studio-mcp.mjs", 0o755);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await syncLicenses();
  const targets = process.argv.slice(2).length ? process.argv.slice(2) : ["core", "kit", "cli", "mcp"];
  if (targets.includes("cli")) await syncSkill();
  for (const a of targets) {
    if (!["core", "kit", "cli", "mcp"].includes(a)) { console.error("usage: node scripts/build-studio.mjs [core|kit|cli|mcp]"); process.exit(2); }
    if (a === "cli") await cli(); else if (a === "mcp") await mcp(); else await library(a);
    if (!existsSync(folder(a) + "dist")) throw new Error("dist/ was not generated in " + folder(a));
    console.log("ok: " + a);
  }
}

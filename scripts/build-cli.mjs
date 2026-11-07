// Empacota a CLI em dist/ (um arquivo por bin) com esbuild: @praeko/core e @praeko/sdk entram no pacote, então só `@praeko/cli` e `@praeko/sdk` vão ao npm.
import { build } from "esbuild";
import { chmodSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../packages/cli/", import.meta.url));
const { version } = JSON.parse(readFileSync(cli + "package.json", "utf8"));
rmSync(cli + "dist", { recursive: true, force: true });
await build({
  entryPoints: { praeko: cli + "bin/praeko.mjs", arauto: cli + "bin/arauto.mjs" },
  outdir: cli + "dist", bundle: true, splitting: true, chunkNames: "chunks/[name]-[hash]", format: "esm", platform: "node", target: "node22",
  external: ["@praeko/studio-cli"], define: { __PRAEKO_CLI_VERSION__: JSON.stringify(version) }, outExtension: { ".js": ".mjs" }, logLevel: "error", legalComments: "none",
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
for (const f of ["praeko", "arauto"]) chmodSync(`${cli}dist/${f}.mjs`, 0o755);

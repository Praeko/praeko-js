// Compila @praeko/sdk (TypeScript) para packages/sdk/dist: JavaScript ESM (.js) e declarações (.d.ts) geradas pelo tsc, sem mapas nem testes.
// `src/*.ts` usa extensão .ts nos imports relativos (o Node roda esses arquivos direto nos testes); o tsc reescreve para .js na saída (rewriteRelativeImportExtensions).
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const sdk = fileURLToPath(new URL("../packages/sdk/", import.meta.url));
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
rmSync(sdk + "dist", { recursive: true, force: true });
execFileSync(process.execPath, [tsc, "-p", sdk + "tsconfig.build.json"], { stdio: "inherit" });

// O tsc reescreve .ts -> .js nos .js, mas deixa `from "./x.ts"` nas declarações (.d.ts): quem instala o pacote não pode ter isso (TS5097 sem allowImportingTsExtensions).
for (const f of readdirSync(sdk + "dist").filter((n) => n.endsWith(".d.ts"))) {
  const txt = readFileSync(sdk + "dist/" + f, "utf8"), novo = txt.replace(/(from\s+|import\(\s*)(["'])(\.\.?\/[^"']+)\.ts\2/g, "$1$2$3.js$2");
  if (novo !== txt) writeFileSync(sdk + "dist/" + f, novo);
  if (/["']\.\.?\/[^"']*\.ts["']/.test(novo)) throw new Error("dist/" + f + ": sobrou import relativo com extensão .ts");
}

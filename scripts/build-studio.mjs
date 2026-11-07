// Compila os três pacotes publicáveis do Praeko Studio: node scripts/build-studio.mjs [core|kit|cli ...]  (sem argumento: todos, nessa ordem)
//   core, kit: esbuild empacota os .ts/.tsx em dist/index.js (ESM; react, remotion e @praeko/studio-core ficam de fora) e o tsc escreve os .d.ts.
//   cli (@praeko/studio): um bundle por script (praeko-studio, voz-saldo, voz-vozes, voz-conta, voz-config) com cli+voz+publicar+revisar+hyperframes+yaml dentro;
//   só o SDK do ElevenLabs fica externo (dependência declarada). Também sincroniza LICENSE e LICENSES.md do studio/ para cada pacote.
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { chmodSync, copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const raiz = fileURLToPath(new URL("..", import.meta.url)), studio = raiz + "studio/";
const pasta = (n) => ({ core: studio + "packages/core/", kit: studio + "packages/kit/", cli: studio + "packages/cli/" })[n];
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
const lerVersao = (n) => JSON.parse(readFileSync(pasta(n) + "package.json", "utf8")).version;

export async function sincronizarLicencas() {
  for (const n of ["core", "kit", "cli"]) for (const f of ["LICENSE", "LICENSES.md"]) copyFileSync(studio + f, pasta(n) + f);
  // studio/skill/praeko-studio/SKILL.md é gerado do mesmo texto que `praeko studio skill install` grava (uma fonte só)
  const { ALVOS } = await import(studio + "packages/cli/src/skill.mjs");
  mkdirSync(studio + "skill/praeko-studio", { recursive: true });
  writeFileSync(studio + "skill/praeko-studio/SKILL.md", ALVOS.claude[0].conteudo("pt"));
}

async function biblioteca(n) {
  const dir = pasta(n);
  rmSync(dir + "dist", { recursive: true, force: true });
  await build({
    entryPoints: [dir + "src/index.ts"], outfile: dir + "dist/index.js", bundle: true, format: "esm", platform: "neutral", target: "es2022", jsx: "automatic", logLevel: "error", legalComments: "none",
    external: ["react", "react/jsx-runtime", "react-dom", "remotion", "@praeko/studio-core"], mainFields: ["module", "main"],
  });
  execFileSync(process.execPath, [tsc, "-p", dir + "tsconfig.build.json"], { stdio: "inherit" });
}

async function cli() {
  const dir = pasta("cli");
  rmSync(dir + "dist", { recursive: true, force: true });
  const voz = studio + "packages/voz/bin/";
  await build({
    entryPoints: { "praeko-studio": dir + "bin/praeko-studio.mjs", "voz-saldo": voz + "saldo.mjs", "voz-vozes": voz + "vozes.mjs", "voz-conta": voz + "conta.mjs", "voz-config": voz + "config.mjs" },
    outdir: dir + "dist", bundle: true, format: "esm", platform: "node", target: "node22", outExtension: { ".js": ".mjs" }, logLevel: "error", legalComments: "none",
    external: ["@elevenlabs/elevenlabs-js"], define: { __STUDIO_VERSION__: JSON.stringify(lerVersao("cli")) },
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  for (const f of ["praeko-studio.mjs"]) chmodSync(dir + "dist/" + f, 0o755);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await sincronizarLicencas();
  const alvos = process.argv.slice(2).length ? process.argv.slice(2) : ["core", "kit", "cli"];
  for (const a of alvos) {
    if (!["core", "kit", "cli"].includes(a)) { console.error("uso: node scripts/build-studio.mjs [core|kit|cli]"); process.exit(2); }
    if (a === "cli") await cli(); else await biblioteca(a);
    if (!existsSync(pasta(a) + "dist")) throw new Error("dist/ não foi gerado em " + pasta(a));
    console.log("ok: " + a);
  }
}

// Confere o que iria ao npm (sem publicar): conteúdo dos tarballs, exports/bin apontando para arquivos que existem, nada de teste ou segredo, CLI empacotada funcionando.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { listarTarball, problemas } from "../../../scripts/release-check.mjs";

const raiz = fileURLToPath(new URL("../../../", import.meta.url));
execFileSync(process.execPath, [raiz + "scripts/build-cli.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, [raiz + "scripts/build-studio.mjs"], { stdio: "inherit" });
// O dist do sdk é compilado antes dos testes (`npm test` e o `prepare` do npm install); só compila aqui se faltar, porque refazer apaga o dist enquanto outros arquivos de teste o importam.
if (!existsSync(raiz + "packages/sdk/dist/index.js")) execFileSync(process.execPath, [raiz + "scripts/build-sdk.mjs"], { stdio: "inherit" });

test("tarball do sdk: sem problemas, com o dist compilado (JS + .d.ts gerados pelo tsc) e sem fonte, teste, mapa ou tsconfig", () => {
  assert.deepEqual(problemas("sdk"), []);
  const { arquivos } = listarTarball("packages/sdk");
  for (const m of ["index", "node", "contract", "bridge", "contract-docs", "openapi", "legacy", "types"]) for (const ext of ["js", "d.ts"]) assert.ok(arquivos.includes(`dist/${m}.${ext}`), `dist/${m}.${ext}`);
  assert.ok(!arquivos.some((a) => a.startsWith("test/") || a.startsWith("src/") || /\.(map|ts)$/.test(a) && !a.endsWith(".d.ts") || /tsconfig/.test(a)), "só dist/, README, CHANGELOG, LICENSE e package.json");
  for (const a of arquivos.filter((x) => x.endsWith(".d.ts"))) assert.doesNotMatch(readFileSync(raiz + "packages/sdk/" + a, "utf8"), /from\s+["']\.\.?\/[^"']*\.ts["']/, `${a}: import relativo com .ts nas declarações`);
});
test("tarball da cli: sem problemas, sem dependências do monorepo e com o bundle", () => {
  assert.deepEqual(problemas("cli"), []);
  const { arquivos } = listarTarball("packages/cli");
  assert.ok(arquivos.includes("dist/praeko.mjs") && !arquivos.includes("dist/arauto.mjs"), "um só bin (praeko): com dois o npx @praeko/cli falha");
  assert.ok(!arquivos.some((a) => a.startsWith("src/") || a.startsWith("test/") || a.startsWith("bin/")));
  const pkg = JSON.parse(readFileSync(raiz + "packages/cli/package.json", "utf8"));
  assert.equal(pkg.dependencies, undefined);
});
test("cli empacotada: shebang, bit de execução, --version e --help (sem rede, sem Chaveiro)", () => {
  const bin = raiz + "packages/cli/dist/praeko.mjs";
  assert.match(readFileSync(bin, "utf8").split("\n")[0], /^#!\/usr\/bin\/env node$/);
  if (process.platform !== "win32") assert.ok(statSync(bin).mode & 0o111, "sem bit de execução");
  const versao = JSON.parse(readFileSync(raiz + "packages/cli/package.json", "utf8")).version;
  assert.equal(execFileSync(process.execPath, [bin, "--version"], { encoding: "utf8" }).trim(), versao);
  assert.match(execFileSync(process.execPath, [bin, "--help"], { encoding: "utf8" }), /Praeko CLI/);
});
test("o Chaveiro (comando security) só liga no macOS", async () => {
  const { chaveiro } = await import("@praeko/core/segredos").catch(() => import("../../core/src/segredos.ts"));
  const antes = Object.getOwnPropertyDescriptor(process, "platform");
  try { for (const p of ["linux", "win32"]) { Object.defineProperty(process, "platform", { value: p }); assert.equal(chaveiro.ativo(), false); } }
  finally { Object.defineProperty(process, "platform", antes); }
});

test("tarball do @praeko/studio: bin único praeko-studio, bundles, docs, modelos e LICENSES.md; sem fonte, teste, mídia de terceiros nem alias bardo", () => {
  assert.deepEqual(problemas("studio"), []);
  const { arquivos } = listarTarball("studio/packages/cli");
  for (const f of ["dist/praeko-studio.mjs", "dist/voz-saldo.mjs", "dist/voz-vozes.mjs", "dist/voz-conta.mjs", "dist/voz-config.mjs", "docs/episodio-yaml.md", "docs/publicar.md", "modelos/avatar.png", "modelos/sfx/pop.wav", "LICENSES.md", "LICENSE", "README.md", "CHANGELOG.md"]) assert.ok(arquivos.includes(f), f);
  assert.ok(!arquivos.some((a) => /^(src|test|bin)\//.test(a) || /bardo/i.test(a)), "só dist, docs, modelos e metadados");
  const pkg = JSON.parse(readFileSync(raiz + "studio/packages/cli/package.json", "utf8"));
  assert.deepEqual(Object.keys(pkg.bin), ["praeko-studio"]); assert.deepEqual(Object.keys(pkg.dependencies), ["@elevenlabs/elevenlabs-js"]); assert.equal(pkg.engines.node, ">=22");
  for (const peerless of ["remotion", "react"]) assert.equal(pkg.dependencies[peerless], undefined, "o Studio não puxa o Remotion: ele fica no projeto do usuário");
});
test("tarballs de @praeko/studio-core e @praeko/studio-kit: dist com .d.ts, peers remotion/react, sem src nem teste", () => {
  for (const [chave, dir] of [["studio-core", "studio/packages/core"], ["studio-kit", "studio/packages/kit"]]) {
    assert.deepEqual(problemas(chave), []);
    const { arquivos } = listarTarball(dir), pkg = JSON.parse(readFileSync(raiz + dir + "/package.json", "utf8"));
    for (const f of ["dist/index.js", "dist/index.d.ts", "LICENSES.md", "LICENSE"]) assert.ok(arquivos.includes(f), `${chave}: ${f}`);
    assert.ok(!arquivos.some((a) => a.startsWith("src/")));
    assert.match(pkg.peerDependencies.remotion, /^\^4\./); assert.match(pkg.peerDependencies.react, /^\^19/); assert.equal(pkg.dependencies, undefined);
    assert.equal(pkg.license, "MIT"); assert.equal(pkg.publishConfig.access, "public"); assert.equal(pkg.version, "0.1.0");
  }
  assert.equal(JSON.parse(readFileSync(raiz + "studio/packages/kit/package.json", "utf8")).peerDependencies["@praeko/studio-core"], "^0.1.0");
});
test("@praeko/studio empacotado: --version, ajuda e doctor rodam do dist, sem rede nem cofre", () => {
  const bin = raiz + "studio/packages/cli/dist/praeko-studio.mjs", env = { ...process.env, PRAEKO_SEM_CHAVEIRO: "1", HOME: raiz + "studio/packages/cli/dist" };
  assert.equal(execFileSync(process.execPath, [bin, "--version"], { encoding: "utf8", env }).trim(), JSON.parse(readFileSync(raiz + "studio/packages/cli/package.json", "utf8")).version);
  assert.match(execFileSync(process.execPath, [bin, "--help"], { encoding: "utf8", env }), /doctor/);
});

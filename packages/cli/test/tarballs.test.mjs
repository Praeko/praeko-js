// Confere o que iria ao npm (sem publicar): conteúdo dos tarballs, exports/bin apontando para arquivos que existem, nada de teste ou segredo, CLI empacotada funcionando.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { listarTarball, problemas } from "../../../scripts/release-check.mjs";

const raiz = fileURLToPath(new URL("../../../", import.meta.url));
execFileSync(process.execPath, [raiz + "scripts/build-cli.mjs"], { stdio: "inherit" });

test("tarball do sdk: sem problemas e com os tipos do contrato", () => {
  assert.deepEqual(problemas("sdk"), []);
  const { arquivos } = listarTarball("packages/sdk");
  for (const a of ["src/index.mjs", "src/index.d.ts", "src/contract.d.mts", "src/bridge.d.mts", "src/node.d.mts", "src/legacy.mjs"]) assert.ok(arquivos.includes(a), a);
  assert.ok(!arquivos.some((a) => a.startsWith("test/")));
});
test("tarball da cli: sem problemas, sem dependências do monorepo e com o bundle", () => {
  assert.deepEqual(problemas("cli"), []);
  const { arquivos } = listarTarball("packages/cli");
  assert.ok(arquivos.includes("dist/praeko.mjs") && arquivos.includes("dist/arauto.mjs"));
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
  const { chaveiro } = await import("@praeko/core/segredos").catch(() => import("../../core/src/segredos.mjs"));
  const antes = Object.getOwnPropertyDescriptor(process, "platform");
  try { for (const p of ["linux", "win32"]) { Object.defineProperty(process, "platform", { value: p }); assert.equal(chaveiro.ativo(), false); } }
  finally { Object.defineProperty(process, "platform", antes); }
});

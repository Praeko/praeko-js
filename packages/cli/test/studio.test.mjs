// `praeko studio` entrega ao @praeko/studio instalado à parte: projeto, ao lado da CLI, global ou PATH; sem ele, ajuda e (se aceito) npx.
import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { acharStudio, delegarStudio, MENSAGEM_AUSENTE } from "../src/studio.ts";

const tmp = () => realpathSync(mkdtempSync(join(tmpdir(), "praeko-studio-deleg-")));
/** Cria node_modules/@praeko/studio com o bin apontado no package.json. */
function instalar(base) {
  const dir = join(base, "node_modules", "@praeko", "studio");
  mkdirSync(join(dir, "dist"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "@praeko/studio", version: "0.1.0", bin: { "praeko-studio": "dist/praeko-studio.mjs" } }));
  writeFileSync(join(dir, "dist", "praeko-studio.mjs"), "console.log('studio')");
  return join(dir, "dist", "praeko-studio.mjs");
}
const nada = { npmRootGlobal: () => null, aqui: tmp(), env: { PATH: "" } };

test("acha o Studio instalado no projeto atual", () => {
  const proj = tmp(), bin = instalar(proj);
  const r = acharStudio({ ...nada, cwd: join(proj) });
  assert.deepEqual([r.tipo, r.caminho, r.onde], ["node", bin, "neste projeto"]);
});
test("acha o Studio instalado globalmente (npm root -g), mesmo sem estar no projeto", () => {
  const glob = tmp(), bin = instalar(glob);
  const r = acharStudio({ ...nada, cwd: tmp(), npmRootGlobal: () => join(glob, "node_modules") });
  assert.deepEqual([r.caminho, r.onde], [bin, "instalação global do npm"]);
});
test("acha um praeko-studio no PATH (binário próprio)", () => {
  const dir = tmp(), f = join(dir, "praeko-studio");
  writeFileSync(f, "#!/bin/sh\n"); chmodSync(f, 0o755);
  const r = acharStudio({ ...nada, cwd: tmp(), env: { PATH: ["/nao/existe", dir].join(delimiter) }, plataforma: "linux" });
  assert.deepEqual([r.tipo, r.caminho], ["binario", f]);
});
test("o projeto vence a instalação global", () => {
  const proj = tmp(), glob = tmp(), bin = instalar(proj); instalar(glob);
  assert.equal(acharStudio({ ...nada, cwd: proj, npmRootGlobal: () => join(glob, "node_modules") }).caminho, bin);
});
test("delegar: roda o bin do Studio com os argumentos e PRAEKO_STUDIO=1, devolvendo o código de saída", () => {
  const proj = tmp(), bin = instalar(proj); let chamada;
  const code = delegarStudio(["doctor", "--json"], { ...nada, cwd: proj, executar: (cmd, a, env) => { chamada = { cmd, a, env }; return 7; } });
  assert.equal(code, 7);
  assert.equal(chamada.cmd, process.execPath); assert.deepEqual(chamada.a, [bin, "doctor", "--json"]); assert.equal(chamada.env.PRAEKO_STUDIO, "1");
});
test("sem Studio: mensagem útil (npm install, npx) e código 1, sem rodar nada", () => {
  let msg = "", rodou = false;
  const code = delegarStudio(["init", "x"], { ...nada, cwd: tmp(), erro: (m) => { msg += m; }, executar: () => { rodou = true; return 0; }, perguntar: () => false });
  assert.equal(code, 1); assert.equal(rodou, false);
  assert.match(msg, /npm install -D @praeko\/studio/); assert.match(msg, /npx @praeko\/studio/); assert.equal(msg, MENSAGEM_AUSENTE);
});
test("sem Studio e com o 'sim' do usuário: roda npx --yes @praeko/studio com os argumentos", () => {
  let chamada;
  const code = delegarStudio(["init", "x"], { ...nada, cwd: tmp(), plataforma: "linux", erro: () => {}, perguntar: () => true, executar: (cmd, a) => { chamada = [cmd, a]; return 0; } });
  assert.equal(code, 0); assert.deepEqual(chamada, ["npx", ["--yes", "@praeko/studio", "init", "x"]]);
});

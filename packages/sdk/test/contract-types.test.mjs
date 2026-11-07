// Os tipos do contrato (src/contract.d.mts) são gerados de src/contract.mjs: o teste falha se alguém mudar o contrato e esquecer de regenerar.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ARQUIVO, gerar } from "../../../scripts/contract-types.mjs";
import { ERROR_CODES, ROUTES } from "../src/contract.mjs";

test("contract.d.mts está em dia com contract.mjs (rode: npm run types:contract)", () => {
  assert.equal(readFileSync(ARQUIVO, "utf8"), gerar(), "rode: npm run types:contract");
});
test("a geração é determinística e cobre todas as rotas e códigos de erro", () => {
  const a = gerar(), b = gerar();
  assert.equal(a, b);
  for (const r of ROUTES) assert.ok(a.includes(`key: ${JSON.stringify(r.key)}; method: ${JSON.stringify(r.method)}; path: ${JSON.stringify(r.path)}`), `faltou ${r.method} ${r.path}`);
  for (const [pt, en] of Object.entries(ERROR_CODES)) assert.ok(a.includes(`${pt}: ${JSON.stringify(en)};`), `faltou o erro ${pt}`);
  assert.ok(!/\/Users\/|\d{4}-\d{2}-\d{2}T/.test(a), "sem caminho absoluto nem data no arquivo gerado");
});

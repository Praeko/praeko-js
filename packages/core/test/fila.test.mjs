import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enfileirar, executar, lerFila, cancelarItem, proximaAcao, plistLaunchd, MAX_TENTATIVAS } from "../src/fila.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "bardo-fila-"));
const fx = (o = {}) => ({ slug: "s", rede: "instagram", provedor: "instagram", quando: "2026-11-06T20:30:00.000Z", video: "v.mp4", textos: {}, ...o });
const log = () => {};

test("não age antes da hora; prepara na antecedência; publica na hora; não reenvia", async () => {
  const raiz = tmp(); const chamadas = [];
  const prov = { antecedenciaMs: 10 * 60e3, preparar: async () => { chamadas.push("p"); return { container: "c1" }; }, publicar: async ({ item }) => { chamadas.push("pub:" + item.prep.container); return { id: "m1" }; } };
  const it = enfileirar(raiz, fx());
  await executar({ raiz, provedores: { instagram: prov }, ctx: {}, agora: new Date("2026-11-06T19:00:00Z"), log });
  assert.deepEqual(chamadas, []);
  await executar({ raiz, provedores: { instagram: prov }, ctx: {}, agora: new Date("2026-11-06T20:25:00Z"), log });
  assert.deepEqual(chamadas, ["p"]); assert.equal(lerFila(raiz).itens[0].estado, "preparado");
  await executar({ raiz, provedores: { instagram: prov }, ctx: {}, agora: new Date("2026-11-06T20:31:00Z"), log });
  assert.deepEqual(chamadas, ["p", "pub:c1"]); assert.equal(lerFila(raiz).itens[0].estado, "enviado");
  await executar({ raiz, provedores: { instagram: prov }, ctx: {}, agora: new Date("2026-11-07T00:00:00Z"), log });
  assert.equal(chamadas.length, 2, "não reenvia");
  rmSync(raiz, { recursive: true, force: true });
});
test("executor parado: item vencido prepara e publica na mesma passada", async () => {
  const raiz = tmp(); const c = [];
  const prov = { antecedenciaMs: 600e3, preparar: async () => { c.push("p"); return {}; }, publicar: async () => { c.push("pub"); return { id: "x" }; } };
  enfileirar(raiz, fx());
  await executar({ raiz, provedores: { instagram: prov }, ctx: {}, agora: new Date("2026-11-06T22:00:00Z"), log });
  assert.deepEqual(c, ["pub"]); // venceu: publica direto (sem preparar fora da janela)
  rmSync(raiz, { recursive: true, force: true });
});
test("imediato publica ao entrar na fila, ignorando o horário", async () => {
  const raiz = tmp(); let n = 0;
  const prov = { imediato: true, publicar: async () => { n++; return { id: "yt1", url: "https://youtu.be/yt1" }; } };
  const it = enfileirar(raiz, fx({ provedor: "youtube", rede: "youtube" }));
  await executar({ raiz, provedores: { youtube: prov }, ctx: {}, agora: new Date("2026-11-01T00:00:00Z"), soIds: [it.id], log });
  await executar({ raiz, provedores: { youtube: prov }, ctx: {}, agora: new Date("2026-11-01T00:05:00Z"), log });
  assert.equal(n, 1); assert.equal(lerFila(raiz).itens[0].resultado.id, "yt1");
  rmSync(raiz, { recursive: true, force: true });
});
test("erro: tenta de novo e desiste depois de MAX_TENTATIVAS; cancelar impede", async () => {
  const raiz = tmp(); let n = 0;
  const prov = { publicar: async () => { n++; throw new Error("falhou"); } };
  enfileirar(raiz, fx());
  for (let i = 0; i < MAX_TENTATIVAS + 2; i++) await executar({ raiz, provedores: { instagram: prov }, ctx: {}, agora: new Date("2026-11-07T00:00:00Z"), log });
  assert.equal(n, MAX_TENTATIVAS); assert.equal(lerFila(raiz).itens[0].estado, "erro");
  const b = enfileirar(raiz, fx()); cancelarItem(raiz, b.id);
  await executar({ raiz, provedores: { instagram: prov }, ctx: {}, agora: new Date("2026-11-07T00:00:00Z"), log });
  assert.equal(n, MAX_TENTATIVAS);
  rmSync(raiz, { recursive: true, force: true });
});
test("simular não chama o provedor; plist contém o intervalo", async () => {
  const raiz = tmp(); let n = 0;
  enfileirar(raiz, fx());
  await executar({ raiz, provedores: { instagram: { publicar: async () => { n++; } } }, ctx: {}, agora: new Date("2026-11-07T00:00:00Z"), simular: true, log });
  assert.equal(n, 0);
  assert.ok(plistLaunchd({ node: "/n", bardo: "/b", cwd: "/c", minutos: 5, log: "/l" }).includes("<integer>300</integer>"));
  assert.equal(proximaAcao({ estado: "enviado", tentativas: 0, quando: "2026-01-01T00:00:00Z" }, {}, new Date()), null);
  rmSync(raiz, { recursive: true, force: true });
});

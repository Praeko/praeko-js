// SDK: `idempotencyKey` manda o cabeçalho e é o que autoriza repetir um POST (com a MESMA chave); sem ela, POST nunca é repetido. O OpenAPI documenta o cabeçalho.
import test from "node:test";
import assert from "node:assert/strict";
import { Praeko } from "../src/index.mjs";
import { gerarOpenApi } from "../src/openapi.mjs";

const resp = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
function cliente(respostas) {
  const chamadas = [], f = async (url, init) => { chamadas.push({ url, init }); const r = respostas.shift(); if (r instanceof Error) throw r; return r; };
  return { chamadas, praeko: new Praeko({ url: "https://p.test", key: "praeko_chave", fetch: f, wait: async () => {} }) };
}

test("com idempotencyKey (texto): manda o cabeçalho e repete o POST com a mesma chave", async () => {
  const { chamadas, praeko } = cliente([new Error("rede caiu"), resp(503, { error: { code: "internal_error", message: "x" } }), resp(200, { id: "ide_1" })]);
  const r = await praeko.ideas.create({ title: "Oi", idempotencyKey: "minha-chave" });
  assert.equal(r.id, "ide_1"); assert.equal(chamadas.length, 3);
  assert.deepEqual(chamadas.map((c) => c.init.headers["idempotency-key"]), ["minha-chave", "minha-chave", "minha-chave"]);
  assert.ok(!("idempotencyKey" in JSON.parse(chamadas[0].init.body)), "a opção não vai no corpo");
});

test("idempotencyKey: true gera um UUID por chamada e o reutiliza nas repetições", async () => {
  const { chamadas, praeko } = cliente([resp(502, { error: { code: "x", message: "x" } }), resp(200, { id: "p1" }), resp(200, { id: "p2" })]);
  await praeko.posts.create({ title: "t" }, { idempotencyKey: true });
  const k1 = chamadas[0].init.headers["idempotency-key"];
  assert.match(k1, /^[0-9a-f-]{36}$/); assert.equal(chamadas[1].init.headers["idempotency-key"], k1);
  await praeko.posts.create({ title: "t" }, { idempotencyKey: true });
  assert.notEqual(chamadas[2].init.headers["idempotency-key"], k1, "outra chamada, outra chave");
});

test("sem idempotencyKey: sem cabeçalho e o POST não é repetido", async () => {
  const { chamadas, praeko } = cliente([resp(503, { error: { code: "internal_error", message: "x" } }), resp(200, {})]);
  await assert.rejects(() => praeko.posts.create({ title: "t" }), (e) => e.status === 503);
  assert.equal(chamadas.length, 1); assert.ok(!("idempotency-key" in chamadas[0].init.headers));
});

test("4xx com a chave não é repetido (e o código idempotency_key_reuse chega ao erro)", async () => {
  const { chamadas, praeko } = cliente([resp(422, { error: { code: "idempotency_key_reuse", message: "x" } })]);
  await assert.rejects(() => praeko.webhooks.create({ url: "https://a.b/c", idempotencyKey: "k" }), (e) => e.code === "idempotency_key_reuse");
  assert.equal(chamadas.length, 1);
});

test("OpenAPI: o cabeçalho Idempotency-Key aparece nas rotas que o aceitam e só nelas", () => {
  const doc = gerarOpenApi({ agora: 0 }), tem = (op) => op.parameters.some((p) => p.in === "header" && p.name === "Idempotency-Key");
  assert.ok(tem(doc.paths["/v1/posts"].post)); assert.ok(tem(doc.paths["/v1/media"].post)); assert.ok(tem(doc.paths["/v1/media/{id}/complete"].post)); assert.ok(tem(doc.paths["/v1/ideas/{id}"].delete));
  assert.ok(!tem(doc.paths["/v1/posts"].get)); assert.ok(!tem(doc.paths["/v1/media/{id}/parts/{part}"].put)); assert.ok(!tem(doc.paths["/v1/media/{id}/content"].put));
  assert.ok(doc.paths["/v1/posts"].post.responses["422"].description.includes("idempotency_key_reuse")); assert.ok(doc.paths["/v1/posts"].post.responses["409"].description.includes("idempotency_in_progress"));
});

// O OpenAPI 3.1 e a coleção do Postman saem da tabela de rotas e da documentação por rota: aqui se confere que nada ficou de fora e que a forma está certa.
import test from "node:test";
import assert from "node:assert/strict";
import { ROUTES } from "../src/contract.mjs";
import { docDe, materializar } from "../src/contract-docs.mjs";
import { gerarOpenApi, gerarPostman } from "../src/openapi.mjs";

const T0 = Date.parse("2026-11-07T12:00:00Z");

test("openapi: toda rota da tabela vira uma operação (caminho com {param}), com id único, escopo, corpo e erros", () => {
  const o = gerarOpenApi({ agora: T0 });
  assert.equal(o.openapi, "3.1.0"); assert.equal(o.servers[0].url, "https://praeko.app");
  const ids = new Set();
  for (const r of ROUTES) {
    const op = o.paths[r.path.replace(/:([A-Za-z_]+)/g, "{$1}")]?.[r.method.toLowerCase()];
    assert.ok(op, `${r.method} ${r.path} sumiu do OpenAPI`);
    assert.ok(!ids.has(op.operationId), `operationId repetido: ${op.operationId}`); ids.add(op.operationId);
    assert.equal(op["x-praeko-scope"], r.scope);
    for (const m of r.path.matchAll(/:([A-Za-z_]+)/g)) assert.ok(op.parameters.some((p) => p.in === "path" && p.name === m[1] && p.required && p.example), `${r.key}: parâmetro ${m[1]}`);
    assert.deepEqual(op.security, r.scope === "public" ? [] : [{ bearer: [] }]);
    if (r.body === "json") {
      const c = op.requestBody.content["application/json"], d = docDe(r).corpo;
      assert.deepEqual(c.example, materializar(d.example, T0)); assert.equal(c.schema.type, "object");
      assert.deepEqual(Object.keys(c.schema.properties), d.fields.map((f) => f.name));
      assert.deepEqual(c.schema.required ?? [], d.fields.filter((f) => f.required).map((f) => f.name));
    }
    if (r.scope !== "public") assert.ok(op.responses["401"] && op.responses["403"] && op.responses["429"], `${r.key}: sem os erros comuns`);
  }
  const patch = o.paths["/v1/webhooks/{id}"].patch;
  assert.equal(patch.requestBody.content["application/json"].schema.properties.events.items.enum.length, 3);
  assert.equal(patch.summary, "Editar webhook");
  assert.ok(o.paths["/v1/posts"].post.responses["201"].content["application/json"].example.items[0].scheduledFor.startsWith("2026-11-10T20:30"), "a data de exemplo é materializada");
  assert.ok(!JSON.stringify(o).includes("{{em3dias}}"));
  assert.deepEqual(JSON.parse(JSON.stringify(o)), o, "só JSON puro");
});

test("postman: uma pasta por grupo, variáveis baseUrl e praekoKey, corpo de exemplo nas rotas com JSON", () => {
  const p = gerarPostman({ agora: T0 });
  assert.match(p.info.schema, /v2\.1\.0/); assert.deepEqual(p.variable.map((v) => v.key), ["baseUrl", "praekoKey"]);
  const itens = p.item.flatMap((g) => g.item), privadas = ROUTES.filter((r) => r.scope !== "public");
  assert.equal(itens.length, privadas.length);
  const upd = itens.find((i) => /PATCH \/v1\/webhooks\/:id\)/.test(i.name));
  assert.equal(upd.request.url.raw, "{{baseUrl}}/v1/webhooks/:id"); assert.equal(upd.request.url.variable[0].value.slice(0, 3), "wh_");
  assert.deepEqual(JSON.parse(upd.request.body.raw), materializar(docDe(ROUTES.find((r) => r.key === "webhooks.update")).corpo.example, T0));
  assert.ok(upd.request.header.some((h) => h.key === "X-Praeko-Contract" && h.value === "en"));
});

// T-024/12: params que o servidor já lê e o painel já usa precisam estar no contrato (SDK, docs por rota), sem mudar o que vai pela rede:
// `page` em instagram.comments e `dismiss` / `delete_video` em posts.cancel (DELETE /v1/posts/:id).
import test from "node:test";
import assert from "node:assert/strict";
import { Praeko } from "../src/index.ts";
import { ROUTES } from "../src/contract.ts";
import { docDe } from "../src/contract-docs.ts";

const resp = (corpo) => new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
function cliente() {
  const chamadas = [], f = async (url, init) => { chamadas.push({ url: new URL(String(url)), init }); return resp({ ok: true }); };
  return { chamadas, praeko: new Praeko({ url: "https://p.test", key: "praeko_chave", fetch: f, wait: async () => {} }) };
}

test("posts.cancel: sem opções não manda query; dismiss e deleteVideo viram ?dismiss=true&delete_video=true (os nomes que o painel usa)", async () => {
  const { chamadas, praeko } = cliente();
  await praeko.posts.cancel("p1");
  await praeko.posts.cancel("p2", { dismiss: true });
  await praeko.posts.cancel("p3", { dismiss: true, deleteVideo: true, idempotencyKey: "k1" });
  assert.deepEqual(chamadas.map((c) => c.init.method), ["DELETE", "DELETE", "DELETE"]);
  assert.deepEqual(chamadas.map((c) => c.url.search), ["", "?dismiss=true", "?dismiss=true&delete_video=true"]);
  assert.equal(chamadas[2].init.headers["idempotency-key"], "k1");
  await praeko.posts.cancel("p4", { deleteRemote: true });
  assert.equal(chamadas[3].url.search, "?delete_remote=true");
});

test("instagram.comments aceita page (token da próxima página) e o manda na query", async () => {
  const { chamadas, praeko } = cliente();
  await praeko.instagram.comments({ media: "M1", unanswered: true, max: 10, page: "TOKEN" });
  assert.deepEqual(Object.fromEntries(chamadas[0].url.searchParams), { media: "M1", unanswered: "1", max: "10", page: "TOKEN" });
});

test("as docs por rota listam esses params (a doc pública gerada deles sai do mesmo lugar)", () => {
  const consulta = (k) => (docDe(ROUTES.find((r) => r.key === k)).consulta || []).map((c) => c.name);
  assert.deepEqual(consulta("posts.cancel"), ["dismiss", "delete_video", "delete_remote"]);
  assert.ok(consulta("instagram.comments").includes("page"));
});

import test from "node:test";
import assert from "node:assert/strict";
import { praeko } from "../src/index.mjs";

const { cliente, montarPost, isoComFuso, configPraeko, normalizarUrl, mensagemDeErro, ErroPraeko, REF_CHAVE } = praeko;
const marca = { links: { jogo: "https://exemplo.com/" }, publicacao: { praeko: {} } };
const ep = { titulo: "Título", campanha: "camp", formato: "short", yt: { descricao: "Desc", comentarioFixo: "Fixa" }, ig: { legenda: "Legenda IG" }, hashtags: { youtube: ["#a"], instagram: ["#b"], tiktok: ["#c"] } };
const Q = { youtube: "2026-11-06T20:30:00.000Z", instagram: "2026-11-06T21:00:00.000Z", tiktok: "2026-11-06T21:30:00.000Z" };
const sem = async () => {}; // sem espera nas repetições

/** fetch falso: `rotas` é uma função (metodo, caminho, init) → { status, corpo } ; grava as chamadas. */
function falso(rotas) {
  const chamadas = [];
  const fetchFn = async (url, init) => {
    const u = new URL(url), c = { metodo: init.method, caminho: u.pathname + u.search, url, headers: init.headers, corpo: init.body };
    chamadas.push(c);
    const r = await rotas(c.metodo, c.caminho, init, chamadas.length);
    const status = r.status ?? 200, texto = typeof r.corpo === "string" ? r.corpo : JSON.stringify(r.corpo ?? {});
    return { ok: status < 400, status, text: async () => texto };
  };
  return { fetchFn, chamadas };
}
const json = (c) => JSON.parse(c.corpo);

test("chave e url: ref no Chaveiro, https obrigatório, padrão https://praeko.app", () => {
  assert.equal(REF_CHAVE, "praeko/principal");
  assert.equal(normalizarUrl(), "https://praeko.app");
  assert.equal(normalizarUrl("https://praeko.app///"), "https://praeko.app");
  assert.equal(normalizarUrl("http://localhost:8787"), "http://localhost:8787");
  assert.throws(() => normalizarUrl("http://praeko.app"), /https/);
});
test("sem chave: erro útil e nenhuma chamada de rede", async () => {
  const { fetchFn, chamadas } = falso(() => ({}));
  await assert.rejects(cliente({ fetchFn }).canais(), /sem chave do Praeko.*--via praeko --chave.*PRAEKO_STUDIO_KEY_PRAEKO_PRINCIPAL/);
  assert.equal(chamadas.length, 0);
});
test("canais: GET /v1/channels com Bearer e X-Arauto-Contract: en", async () => {
  const { fetchFn, chamadas } = falso(() => ({ corpo: { channels: [{ network: "youtube", id: "c1", connected: true }] } }));
  const cs = await cliente({ chave: "arauto_K", fetchFn }).canais();
  assert.equal(cs[0].id, "c1");
  assert.equal(chamadas[0].metodo, "GET"); assert.equal(chamadas[0].url, "https://praeko.app/v1/channels");
  assert.equal(chamadas[0].headers.authorization, "Bearer arauto_K"); assert.equal(chamadas[0].headers["x-arauto-contract"], "en");
});
test("url do serviço vem de publicacao.praeko.url", async () => {
  assert.equal(configPraeko({ publicacao: { praeko: { url: "https://meu.praeko.dev/" } } }).url, "https://meu.praeko.dev/");
  const { fetchFn, chamadas } = falso(() => ({ corpo: { channels: [] } }));
  await cliente({ url: "https://meu.praeko.dev/", chave: "arauto_K", fetchFn }).canais();
  assert.equal(chamadas[0].url, "https://meu.praeko.dev/v1/channels");
});

test("mídia pequena: POST /v1/media com simple:true e PUT .../content com os bytes", async () => {
  const bytes = Buffer.from("0123456789");
  const { fetchFn, chamadas } = falso((m, c) => m === "POST" ? { corpo: { id: "m1", state: "uploading" } } : { corpo: { id: "m1", state: "ready" } });
  const m = await cliente({ chave: "arauto_K", fetchFn }).subirMidia({ size: 10, read: async (i, n) => bytes.subarray(i, i + n) }, { tipo: "video", nome: "v.mp4", mime: "video/mp4" });
  assert.equal(m.id, "m1"); assert.equal(m.state, "ready");
  assert.equal(chamadas.length, 2);
  assert.deepEqual(json(chamadas[0]), { type: "video", name: "v.mp4", mime: "video/mp4", size: 10, simple: true });
  assert.equal(chamadas[1].metodo, "PUT"); assert.equal(chamadas[1].caminho, "/v1/media/m1/content");
  assert.equal(chamadas[1].headers["content-type"], "application/octet-stream"); assert.equal(Buffer.from(chamadas[1].corpo).toString(), "0123456789");
});
test("mídia grande: partes iguais (a última menor), depois complete, tipo cover", async () => {
  const bytes = Buffer.alloc(10, 1);
  const { fetchFn, chamadas } = falso((m, c) => c === "/v1/media" ? { corpo: { id: "m2", minPartSize: 4, maxPartSize: 8 } } : c.endsWith("/complete") ? { corpo: { id: "m2", state: "ready" } } : { corpo: {} });
  const progresso = [];
  const m = await cliente({ chave: "arauto_K", fetchFn, simpleMax: 5, parte: 4 }).subirMidia({ size: 10, read: async (i, n) => bytes.subarray(i, i + n) }, { tipo: "cover", nome: "c.png", mime: "image/png", aoProgredir: (x, t) => progresso.push([x, t]) });
  assert.equal(m.state, "ready");
  assert.deepEqual(json(chamadas[0]), { type: "cover", name: "c.png", mime: "image/png", size: 10 }); // sem simple
  assert.deepEqual(chamadas.slice(1, 4).map((c) => [c.metodo, c.caminho, c.corpo.length]), [["PUT", "/v1/media/m2/parts/1", 4], ["PUT", "/v1/media/m2/parts/2", 4], ["PUT", "/v1/media/m2/parts/3", 2]]);
  assert.deepEqual([chamadas[4].metodo, chamadas[4].caminho], ["POST", "/v1/media/m2/complete"]);
  assert.deepEqual(progresso.at(-1), [10, 10]);
});

test("montarPost: itens por rede, ISO com fuso do Brasil, modos padrão (YouTube agendado, Instagram via buffer, TikTok rascunho)", () => {
  const b = montarPost({ marca, ep, id: "ep-1", midia: { video: "mv", capa: "mc" }, redes: ["youtube", "instagram", "tiktok"], quando: Q });
  assert.equal(b.id, "ep-1"); assert.equal(b.title, "Título");
  assert.deepEqual(b.media, { video: "mv", cover: "mc" });
  assert.deepEqual(b.items, [
    { network: "youtube", scheduledFor: "2026-11-06T17:30:00-03:00", mode: "scheduled" },
    { network: "instagram", scheduledFor: "2026-11-06T18:00:00-03:00", via: "buffer" },
    { network: "tiktok", scheduledFor: "2026-11-06T18:30:00-03:00", mode: "draft" },
  ]);
  assert.deepEqual(b.options, { format: "short" });
  assert.equal(b.texts.youtube.title, "Título"); assert.equal(b.texts.youtube.pinnedComment, "Fixa");
  assert.ok(b.texts.youtube.text.includes("utm_source=youtube") && b.texts.youtube.text.includes("#a"));
  assert.ok(b.texts.instagram.text.endsWith("#b")); assert.equal(b.texts.instagram.title, undefined);
  assert.ok(b.texts.tiktok.text.length > 0);
});
test("montarPost: opções do marca.json (Instagram via meta, TikTok direto, canais), longo, mídia só do Instagram", () => {
  const m = { ...marca, publicacao: { praeko: { instagram: { via: "meta" }, tiktok: { modo: "direto", quadroMs: 1500 }, canais: { tiktok: "tk2" } } } };
  const b = montarPost({ marca: m, ep: { ...ep, formato: "longo" }, id: "x", midia: { video: "mv" }, midiaRede: { instagram: { video: "mi" } }, redes: ["instagram", "tiktok"], quando: Q, fuso: "-03:00" });
  assert.deepEqual(b.items[0], { network: "instagram", scheduledFor: "2026-11-06T18:00:00-03:00", via: "meta", media: { video: "mi" } });
  assert.deepEqual(b.items[1], { network: "tiktok", scheduledFor: "2026-11-06T18:30:00-03:00", channel: "tk2", mode: "direct" });
  assert.deepEqual(b.options, { format: "long", tiktok: { privacy: "SELF_ONLY", coverFrameMs: 1500 } });
  assert.deepEqual(b.media, { video: "mv" }); // sem capa
});
test("montarPost: rede desconhecida, falta de horário e opções inválidas dão erro", () => {
  assert.throws(() => montarPost({ marca, ep, id: "x", midia: { video: "v" }, redes: ["orkut"], quando: {} }), /rede desconhecida/);
  assert.throws(() => montarPost({ marca, ep, id: "x", midia: { video: "v" }, redes: ["youtube"], quando: {} }), /sem horário/);
  assert.throws(() => configPraeko({ publicacao: { praeko: { instagram: { via: "x" } } } }), /instagram\.via/);
  assert.throws(() => configPraeko({ publicacao: { praeko: { tiktok: { modo: "x" } } } }), /tiktok\.modo/);
});
test("isoComFuso", () => {
  assert.equal(isoComFuso("2026-11-06T20:30:00.000Z"), "2026-11-06T17:30:00-03:00");
  assert.equal(isoComFuso("2026-11-06T02:00:00.000Z", "-03:00"), "2026-11-05T23:00:00-03:00");
  assert.equal(isoComFuso("2026-11-06T20:30:00.000Z", "+01:00"), "2026-11-06T21:30:00+01:00");
  assert.throws(() => isoComFuso("2026-11-06T20:30:00Z", "BRT"), /fuso inválido/);
});

test("criarPost: POST /v1/posts com o corpo e sem repetir em erro de servidor", async () => {
  const { fetchFn, chamadas } = falso(() => ({ status: 500, corpo: { error: { code: "internal_error", message: "boom" } } }));
  await assert.rejects(cliente({ chave: "arauto_K", fetchFn, espera: sem }).criarPost({ id: "x" }), /erro interno do Praeko/);
  assert.equal(chamadas.length, 1); // criar duas vezes duplicaria
  assert.equal(chamadas[0].metodo, "POST"); assert.equal(chamadas[0].caminho, "/v1/posts");
});
test("erros do servidor viram português: chave recusada, escopo, id existente, campo inválido; a chave nunca aparece", async () => {
  const e = (status, code, message) => falso(() => ({ status, corpo: { error: { code, message } } }));
  let s = e(401, "invalid_api_key", "chave inválida");
  await assert.rejects(cliente({ chave: "arauto_SEGREDO", fetchFn: s.fetchFn }).criarPost({}), (x) => { assert.ok(x instanceof ErroPraeko); assert.equal(x.status, 401); assert.equal(x.code, "invalid_api_key"); assert.match(x.message, /recusou a chave.*--via praeko --chave/); assert.ok(!x.message.includes("arauto_SEGREDO")); return true; });
  s = e(403, "forbidden", "escopo insuficiente");
  await assert.rejects(cliente({ chave: "arauto_K", fetchFn: s.fetchFn }).criarPost({}), /escopo write/);
  s = e(409, "id_exists", "já existe um post com id x");
  await assert.rejects(cliente({ chave: "arauto_K", fetchFn: s.fetchFn }).criarPost({}), (x) => x.code === "id_exists" && /já existe um post com esse id/.test(x.message));
  s = e(422, "invalid_field", "instagram: legenda longa demais");
  await assert.rejects(cliente({ chave: "arauto_K", fetchFn: s.fetchFn }).criarPost({}), /HTTP 422, invalid_field.*legenda longa demais/);
  s = e(400, "mensagem_com_chave", "veja arauto_SEGREDO aqui");
  await assert.rejects(cliente({ chave: "arauto_SEGREDO", fetchFn: s.fetchFn }).criarPost({}), (x) => !x.message.includes("arauto_SEGREDO") && /veja … aqui/.test(x.message));
});
test("resposta que não é JSON e envelope legado: mensagens úteis", async () => {
  await assert.rejects(cliente({ chave: "arauto_K", fetchFn: falso(() => ({ status: 502, corpo: "<html>Bad gateway</html>" })).fetchFn }).criarPost({}), /Praeko respondeu HTTP 502/);
  await assert.rejects(cliente({ chave: "arauto_K", fetchFn: falso(() => ({ status: 404, corpo: { erro: { codigo: "post_inexistente", mensagem: "x" } } })).fetchFn }).status("a"), /HTTP 404/);
  assert.match(mensagemDeErro(404, "post_not_found", "post a não existe"), /não conhece esse post/);
});
test("GET repete em falha de rede e 429; PUT de parte também; depois dá certo", async () => {
  let n = 0;
  const f1 = async () => { if (++n < 3) throw new Error("ECONNRESET"); return { ok: true, status: 200, text: async () => JSON.stringify({ channels: [{ network: "tiktok" }] }) }; };
  assert.equal((await cliente({ chave: "arauto_K", fetchFn: f1, espera: sem }).canais()).length, 1); assert.equal(n, 3);
  const g = falso((m, c, i, k) => k < 2 ? { status: 429, corpo: { error: { code: "rate_limited", message: "devagar" } } } : { corpo: { id: "p", items: [] } });
  assert.equal((await cliente({ chave: "arauto_K", fetchFn: g.fetchFn, espera: sem }).status("p")).id, "p"); assert.equal(g.chamadas.length, 2);
  const f2 = async () => { throw new Error("sem rede"); };
  await assert.rejects(cliente({ chave: "arauto_K", fetchFn: f2, espera: sem }).canais(), /sem conexão com o Praeko \(sem rede\)/);
});
test("status e cancelar: GET e DELETE /v1/posts/:id (id escapado)", async () => {
  const { fetchFn, chamadas } = falso((m) => ({ corpo: m === "GET" ? { id: "ep 1", items: [{ network: "youtube", state: "scheduled" }] } : { id: "ep 1", canceled: ["i1"], kept: [{ network: "tiktok", state: "sent" }] } }));
  const c = cliente({ chave: "arauto_K", fetchFn });
  assert.equal((await c.status("ep 1")).items[0].state, "scheduled");
  const r = await c.cancelar("ep 1");
  assert.deepEqual(r.canceled, ["i1"]); assert.equal(r.kept[0].state, "sent");
  assert.deepEqual(chamadas.map((x) => [x.metodo, x.caminho]), [["GET", "/v1/posts/ep%201"], ["DELETE", "/v1/posts/ep%201"]]);
});

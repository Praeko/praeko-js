import test from "node:test";
import assert from "node:assert/strict";
import * as ig from "../src/provedores/instagram.mjs";

const T0 = new Date("2026-11-06T20:00:00Z");
/** ctx simulado: `rotas` casa método+caminho e devolve JSON; registra tudo em `chamadas`. */
function criar({ token = { token: "TOK", userId: "17841", username: "dev.ocioso", tipo: "BUSINESS", expira: new Date(+T0 + 40 * 864e5).toISOString() }, rotas = {}, agora = T0 } = {}) {
  const segredos = new Map(token ? [["instagram/token", JSON.stringify(token)]] : []);
  const chamadas = [], removidos = [], hospedados = [], logs = [];
  const ctx = {
    config: {}, agora: () => agora, pausa: async () => {}, log: (m) => logs.push(m),
    segredos: { obter: (r) => segredos.get(r) ?? null, guardar: (r, v) => segredos.set(r, v) },
    hospedar: async (arq, slug) => { const chave = `${slug}/x/${arq.split("/").pop()}`; hospedados.push(chave); return { url: `https://m.exemplo.com/${chave}`, chave }; },
    removerHospedado: async (c) => { removidos.push(c); },
    converterCapa: (c) => c.replace(/\.png$/, ".jpg"),
    sondar: () => ({ codec: "h264", largura: 1080, altura: 1920, fps: 30, duracao: 40 }),
    fetchFn: async (url, init) => {
      const u = new URL(url), chave = `${init.method} ${u.pathname.replace(/^\/v[\d.]+\//, "/")}`;
      const corpo = init.body ? Object.fromEntries(new URLSearchParams(init.body)) : Object.fromEntries(u.searchParams);
      chamadas.push({ chave, corpo });
      const r = rotas[chave];
      if (r === undefined) return { ok: false, status: 404, text: async () => JSON.stringify({ error: { message: `rota não prevista ${chave}` } }) };
      const v = typeof r === "function" ? r(corpo) : r;
      return { ok: !v.error, status: v.error ? 400 : 200, text: async () => JSON.stringify(v) };
    },
  };
  return { ctx, segredos, chamadas, removidos, hospedados, logs };
}
const item = (o = {}) => ({ id: "i1", slug: "raide", rede: "instagram", quando: "2026-11-06T20:30:00.000Z", video: "/p/video.mp4", capa: "/p/capa.png", textos: { texto: "Legenda #a #b", comentarioFixo: "Comenta" }, opcoes: {}, ...o });
const feliz = (extra = {}) => ({
  "POST /17841/media": { id: "C1" },
  "GET /C1": { status_code: "FINISHED" },
  "GET /17841/content_publishing_limit": { data: [{ quota_usage: 3, config: { quota_total: 100 } }] },
  "POST /17841/media_publish": { id: "M1" },
  "GET /M1": { permalink: "https://www.instagram.com/reel/abc/" },
  ...extra,
});

test("fluxo completo: hospeda, cria contêiner REELS com cover_url, publica, remove os hospedados", async () => {
  const c = criar({ rotas: feliz() });
  const r = await ig.publicar({ item: item(), ctx: c.ctx });
  assert.deepEqual([r.id, r.url], ["M1", "https://www.instagram.com/reel/abc/"]);
  const cont = c.chamadas.find((x) => x.chave === "POST /17841/media").corpo;
  assert.equal(cont.media_type, "REELS"); assert.equal(cont.share_to_feed, "true"); assert.equal(cont.caption, "Legenda #a #b");
  assert.ok(cont.video_url.endsWith("/video.mp4")); assert.ok(cont.cover_url.endsWith("/capa.jpg"), "capa PNG vira JPEG"); assert.equal(cont.access_token, "TOK");
  assert.equal(c.chamadas.find((x) => x.chave === "POST /17841/media_publish").corpo.creation_id, "C1");
  assert.deepEqual(c.removidos.sort(), c.hospedados.sort()); assert.equal(c.removidos.length, 2);
});
test("polling: IN_PROGRESS até FINISHED", async () => {
  let n = 0;
  const c = criar({ rotas: feliz({ "GET /C1": () => ({ status_code: ++n < 3 ? "IN_PROGRESS" : "FINISHED" }) }) });
  await ig.publicar({ item: item(), ctx: c.ctx });
  assert.equal(n, 3);
});
test("contêiner em ERROR: mensagem, hospedados removidos, prep descartado (recria na próxima)", async () => {
  const c = criar({ rotas: feliz({ "GET /C1": { status_code: "ERROR", status: "formato inválido" } }) });
  const it = item();
  await assert.rejects(ig.publicar({ item: it, ctx: c.ctx }), /ERROR.*formato inválido/);
  assert.equal(it.prep, null); assert.equal(c.removidos.length, 2);
  assert.ok(!c.chamadas.some((x) => x.chave.endsWith("media_publish")));
});
test("ainda processando depois do limite: erro que preserva o prep e os hospedados (reaproveita)", async () => {
  const c = criar({ rotas: feliz({ "GET /C1": { status_code: "IN_PROGRESS" } }) });
  const it = item({ opcoes: { intervaloMs: 60e3, esperaMaxMs: 180e3 } });
  await assert.rejects(ig.publicar({ item: it, ctx: c.ctx }), /ainda está processando/);
  assert.equal(it.prep.containerId, "C1"); assert.equal(c.removidos.length, 0);
  // nova tentativa: não cria outro contêiner nem hospeda de novo
  const antes = c.chamadas.filter((x) => x.chave === "POST /17841/media").length, h = c.hospedados.length;
  c.ctx.fetchFn = ((orig) => async (u, i) => (u.includes("/C1") ? { ok: true, status: 200, text: async () => JSON.stringify({ status_code: "FINISHED" }) } : orig(u, i)))(c.ctx.fetchFn);
  const r = await ig.publicar({ item: it, ctx: c.ctx });
  assert.equal(r.id, "M1"); assert.equal(c.chamadas.filter((x) => x.chave === "POST /17841/media").length, antes); assert.equal(c.hospedados.length, h);
});
test("preparar sozinho (15 min antes) guarda o prep; publicar depois reaproveita", async () => {
  const c = criar({ rotas: feliz() }), it = item();
  const prep = await ig.preparar({ item: it, ctx: c.ctx });
  assert.equal(prep.containerId, "C1"); assert.equal(it.prep, prep);
  await ig.publicar({ item: it, ctx: c.ctx });
  assert.equal(c.chamadas.filter((x) => x.chave === "POST /17841/media").length, 1);
});
test("contêiner com mais de 23 h é descartado e recriado", async () => {
  let ids = 0;
  const c = criar({ rotas: feliz({ "POST /17841/media": () => ({ id: "C" + ++ids }), "GET /C1": { status_code: "FINISHED" }, "GET /C2": { status_code: "FINISHED" } }) });
  const it = item();
  await ig.preparar({ item: it, ctx: c.ctx });
  c.ctx.agora = () => new Date(+T0 + 24 * 3600e3);
  const p2 = await ig.preparar({ item: it, ctx: c.ctx });
  assert.equal(p2.containerId, "C2");
});
test("já publicado numa tentativa anterior: não publica de novo", async () => {
  const c = criar({ rotas: {} });
  const it = item({ prep: { containerId: "C1", publicado: "M1", resultado: { id: "M1" } } });
  assert.deepEqual(await ig.publicar({ item: it, ctx: c.ctx }), { id: "M1" });
  assert.equal(c.chamadas.length, 0);
});
test("depois de publicado, falha no link ou no comentário não vira erro", async () => {
  const c = criar({ rotas: feliz({ "GET /M1": { error: { message: "x" } }, "POST /M1/comments": { error: { message: "sem escopo" } } }) });
  const r = await ig.publicar({ item: item({ opcoes: { comentar: true } }), ctx: c.ctx });
  assert.equal(r.id, "M1"); assert.equal(r.url, undefined);
  assert.ok(c.logs.some((l) => /comentário falhou/.test(l)));
});
test("cota esgotada bloqueia antes de publicar", async () => {
  const c = criar({ rotas: feliz({ "GET /17841/content_publishing_limit": { data: [{ quota_usage: 100, config: { quota_total: 100 } }] } }) });
  await assert.rejects(ig.publicar({ item: item(), ctx: c.ctx }), /cota/);
  assert.ok(!c.chamadas.some((x) => x.chave.endsWith("media_publish")));
});
test("token perto de expirar é renovado e guardado; expirado dá erro claro", async () => {
  const t = { token: "VELHO", userId: "17841", username: "u", tipo: "BUSINESS", expira: new Date(+T0 + 5 * 864e5).toISOString() };
  const c = criar({ token: t, rotas: { "GET /refresh_access_token": { access_token: "NOVO", token_type: "bearer", expires_in: 5184000 } } });
  const r = await ig.tokenValido(c.ctx);
  assert.equal(r.token, "NOVO"); assert.equal(JSON.parse(c.segredos.get("instagram/token")).token, "NOVO");
  assert.equal(c.chamadas[0].corpo.grant_type, "ig_refresh_token");
  assert.ok(Math.round(ig.diasRestantes(JSON.parse(c.segredos.get("instagram/token")), T0)) === 60);
  const e = criar({ token: { ...t, expira: new Date(+T0 - 864e5).toISOString() } });
  await assert.rejects(ig.tokenValido(e.ctx), /expirou/);
  await assert.rejects(ig.tokenValido(criar({ token: null }).ctx), /não conectado/);
});
test("renovação que falha mantém o token atual (ainda vale)", async () => {
  const t = { token: "VELHO", userId: "1", username: "u", expira: new Date(+T0 + 5 * 864e5).toISOString() };
  const c = criar({ token: t, rotas: { "GET /refresh_access_token": { error: { message: "token novo demais" } } } });
  assert.equal((await ig.tokenValido(c.ctx)).token, "VELHO");
});
test("conectar valida /me, guarda o token e troca por longa duração com --app-secret", async () => {
  const c = criar({ token: null, rotas: { "GET /me": { user_id: "17841", username: "dev.ocioso", account_type: "BUSINESS" }, "GET /access_token": { access_token: "LONGO", expires_in: 5184000 } } });
  assert.equal(await ig.conectar({ ctx: c.ctx, args: ["--token", "CURTO", "--app-secret", "SEG"] }), 0);
  const s = JSON.parse(c.segredos.get("instagram/token"));
  assert.deepEqual([s.token, s.userId, s.username, s.tipo], ["LONGO", "17841", "dev.ocioso", "BUSINESS"]);
  assert.equal(c.chamadas[1].corpo.grant_type, "ig_exchange_token");
  const st = await ig.status({ ctx: c.ctx });
  assert.ok(st.conectado && st.detalhe.includes("@dev.ocioso") && /60 dias|59 dias/.test(st.detalhe));
  const c2 = criar({ token: null, rotas: { "GET /me": { error: { message: "Invalid OAuth access token" } } } });
  await assert.rejects(ig.conectar({ ctx: c2.ctx, args: ["--token", "RUIM"] }), /Invalid OAuth/);
});
test("status sem token e conta não profissional avisa", async () => {
  assert.equal((await ig.status({ ctx: criar({ token: null }).ctx })).conectado, false);
  const c = criar({ token: null, rotas: { "GET /me": { user_id: "1", username: "pessoal", account_type: "PERSONAL" } } });
  await ig.conectar({ ctx: c.ctx, args: ["--token", "T"] });
  assert.ok(c.logs.some((l) => /profissional/.test(l)));
});
test("legenda longa demais recusa antes de hospedar; planejar lista avisos de vídeo", async () => {
  const c = criar({ rotas: feliz() });
  await assert.rejects(ig.preparar({ item: item({ textos: { texto: "x".repeat(2300) } }), ctx: c.ctx }), /2200/);
  assert.equal(c.hospedados.length, 0);
  c.ctx.sondar = () => ({ codec: "vp9", largura: 1920, altura: 1080, fps: 120, duracao: 2 });
  const l = await ig.planejar({ item: item({ video: "/nao/existe.mp4" }), ctx: c.ctx });
  assert.ok(l.some((x) => /fora de 3 s/.test(x)) && l.some((x) => /fps/.test(x)) && l.some((x) => /codec/.test(x)));
});
test("sem capa usa thumb_offset quando configurado", async () => {
  const c = criar({ rotas: feliz() });
  await ig.preparar({ item: item({ capa: null, opcoes: { miniaturaMs: 1500 } }), ctx: c.ctx });
  const cont = c.chamadas.find((x) => x.chave === "POST /17841/media").corpo;
  assert.equal(cont.thumb_offset, "1500"); assert.equal(cont.cover_url, undefined);
});

test("comentário fixo: ligado por padrão (sem `comentar`), desligado com comentar:false", async () => {
  const a = criar({ rotas: feliz({ "POST /M1/comments": { id: "K1" } }) });
  const r = await ig.publicar({ item: item(), ctx: a.ctx });
  assert.equal(r.comentario, true); assert.ok(a.chamadas.some((x) => x.chave === "POST /M1/comments"));
  const b = criar({ rotas: feliz() });
  const r2 = await ig.publicar({ item: item({ opcoes: { comentar: false } }), ctx: b.ctx });
  assert.equal(r2.comentario, undefined); assert.ok(!b.chamadas.some((x) => x.chave.endsWith("/comments")));
});

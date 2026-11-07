import test from "node:test";
import assert from "node:assert/strict";
import { lerToken, chamar, metricasMidia, midiaDe, listarComentarios, responderComentario, REF_META } from "../src/provedores/instagram-meta.mjs";

const R = (status, corpo) => new Response(JSON.stringify(corpo), { status });
const ctxCom = (fetchFn, token = { token: "TK-TESTE-1234567890", userId: "1784", username: "dev.ocioso" }) => ({ segredos: { obter: async (ref) => (ref === REF_META ? JSON.stringify(token) : null) }, fetchFn });

test("sem token: erro 409 de não conectado; token incompleto também", async () => {
  await assert.rejects(lerToken({ segredos: { obter: async () => null } }), (e) => e.codigoLocal === "meta_nao_conectado" && e.status === 409);
  await assert.rejects(lerToken(ctxCom(null, { token: "x" })), /incompleto/);
});
test("chamar: GET leva o access_token na query, POST no corpo; a mensagem de erro da Meta sobe sem o token", async () => {
  const vistas = [];
  const ctx = ctxCom(async (u, o = {}) => { vistas.push([o.method || "GET", String(u), o.body]); return String(u).includes("erro") ? R(400, { error: { message: "Invalid parameter", code: 100, error_subcode: 33 } }) : R(200, { ok: 1 }); });
  await chamar(ctx, "1784", { fields: "username" });
  assert.match(vistas[0][1], /graph\.facebook\.com\/v23\.0\/1784\?fields=username&access_token=TK-TESTE/);
  await chamar(ctx, "C1/replies", { message: "oi" }, { metodo: "POST" });
  assert.equal(new URLSearchParams(vistas[1][2]).get("message"), "oi"); assert.equal(new URLSearchParams(vistas[1][2]).get("access_token"), "TK-TESTE-1234567890");
  await assert.rejects(chamar(ctx, "erro"), (e) => e.status === 400 && e.codigo === 100 && /Invalid parameter \(código 100\/33\)/.test(e.message) && !e.message.includes("TK-TESTE"));
});
test("métricas da mídia: tenta a lista ampliada, depois a de antes e por fim a mínima; sem 'plays' nem 'impressions'", async () => {
  const pedidas = [];
  const ctx = ctxCom(async (u) => { const m = new URL(String(u)).searchParams.get("metric"); pedidas.push(m); return m.includes("ig_reels_avg_watch_time") ? R(400, { error: { message: "metric not supported", code: 100 } }) : R(200, { data: [{ name: "reach", values: [{ value: 7 }] }, { name: "saved", values: [{ value: 1 }] }, { name: "views", values: [{ value: 9 }] }] }); });
  const x = await metricasMidia({ ctx, mediaId: "M1", tipo: "reel" });
  assert.deepEqual([x.alcance, x.salvamentos, x.views, x.tempoMedioMs], [7, 1, 9, null]);
  assert.ok(!pedidas.some((m) => /plays|impressions/.test(m)));
  assert.equal(pedidas.length, 3, "ampliada (com reels_skip_rate), a de antes e a mínima");
  assert.ok(pedidas[0].includes("reels_skip_rate") && !pedidas[1].includes("reels_skip_rate") && pedidas[2] === "reach,saved,shares,views");
  const ampla = await metricasMidia({ ctx: ctxCom(async () => R(200, { data: [{ name: "reels_skip_rate", values: [{ value: 31.5 }] }, { name: "reposts", values: [{ value: 2 }] }, { name: "ig_reels_avg_watch_time", values: [{ value: 16700 }] }] })), mediaId: "M1", tipo: "reel" });
  assert.deepEqual([ampla.taxaPulo, ampla.reposts, ampla.tempoMedioMs, ampla.alcance], [31.5, 2, 16700, null], "o que a Meta não devolve é null, não 0");
  const feed = [];
  await metricasMidia({ ctx: ctxCom(async (u) => { feed.push(new URL(String(u)).searchParams.get("metric")); return R(200, { data: [{ name: "follows", values: [{ value: 3 }] }, { name: "profile_visits", values: [{ value: 9 }] }] }); }), mediaId: "M2", tipo: "feed" });
  assert.ok(feed[0].includes("profile_visits") && feed[0].includes("follows") && !/ig_reels|skip/.test(feed[0]), "feed: seguidores e visitas ao perfil, nada de métrica de Reel");
  await assert.rejects(metricasMidia({ ctx: ctxCom(async () => R(403, { error: { message: "permissão", code: 10 } })), mediaId: "M1" }), (e) => e.status === 403, "403 não tenta de novo");
});
test("mídia e comentários: tipos, miniatura, dono e respondido", async () => {
  assert.equal(midiaDe({ id: "1", media_type: "VIDEO", media_product_type: "REELS", thumbnail_url: "t", caption: "A\nB" }).tipo, "reel");
  assert.equal(midiaDe({ id: "2", media_type: "IMAGE", media_url: "u" }).thumbnail, "u");
  const ctx = ctxCom(async (u) => { const p = new URL(String(u)).pathname; if (p.endsWith("/media")) return R(200, { data: [{ id: "M1", media_type: "VIDEO", media_product_type: "REELS", comments_count: 1, timestamp: "2026-11-01T00:00:00+0000" }] }); return R(200, { data: [{ id: "C1", username: "ana", text: "oi", timestamp: "2026-11-02T00:00:00+0000", replies: { data: [{ id: "R", username: "DEV.OCIOSO", text: "oi!", timestamp: "2026-11-02T01:00:00+0000" }] } }] }); });
  const r = await listarComentarios({ ctx });
  assert.deepEqual([r.comentarios[0].respondido, r.comentarios[0].respostas[0].doDono], [true, true]);
  assert.deepEqual((await listarComentarios({ ctx, semResposta: true })).comentarios, []);
  await assert.rejects(responderComentario({ ctx, commentId: "C1", texto: "" }), /texto inválido/);
});

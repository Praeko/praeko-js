import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as t from "../src/provedores/tiktok-api.mjs";
import { verificarProvedor } from "../src/contrato.mjs";

const R = (status, corpo) => new Response(JSON.stringify(corpo), { status });
const OK = (data) => R(200, { data, error: { code: "ok", message: "", log_id: "L" } });
const ERRO = (status, code, message = "") => R(status, { data: {}, error: { code, message, log_id: "L" } });
const AGORA = Date.parse("2026-11-05T12:00:00Z");

/** ctx com segredos em memória e um fetch que registra as chamadas. */
function ctxCom(resposta, { token, cliente = { client_key: "ck", client_secret: "cs-segredo" } } = {}) {
  const guardado = new Map();
  if (token !== null) guardado.set(t.REF_TOKEN, JSON.stringify(token || { access_token: "AT-1", refresh_token: "RT-1", expiry: AGORA + 3600e3, refreshExpiry: AGORA + 100 * 86400e3 }));
  if (cliente) guardado.set(t.REF_CLIENTE, JSON.stringify(cliente));
  const chamadas = [];
  const ctx = { segredos: { obter: async (r) => guardado.get(r) ?? null, guardar: async (r, v) => { guardado.set(r, v); } }, deps: { agora: () => AGORA },
    fetchFn: async (url, init = {}) => { const c = { url: String(url), metodo: init.method || "GET", cab: init.headers || {}, corpo: init.body }; chamadas.push(c); return resposta(c, chamadas.length); } };
  return { ctx, chamadas, guardado };
}

test("PKCE do TikTok: o desafio é o SHA-256 do verificador em HEXADECIMAL, não base64url", async () => {
  const v = t.novoVerificador();
  assert.match(v, /^[A-Za-z0-9\-._~]{43,128}$/);
  assert.equal(await t.desafioPkceHex(v), createHash("sha256").update(v).digest("hex"));
  assert.match(await t.desafioPkceHex(v), /^[0-9a-f]{64}$/);
});

test("urlAutorizacao: client_key, escopos separados por vírgula, S256 e redirect", () => {
  const u = new URL(t.urlAutorizacao({ clientKey: "ck", redirect: "https://arauto.teste/conexoes/tiktok/retorno", desafio: "abc", estado: "ST" }));
  assert.equal(u.origin + u.pathname, "https://www.tiktok.com/v2/auth/authorize/");
  assert.equal(u.searchParams.get("client_key"), "ck"); assert.equal(u.searchParams.get("response_type"), "code");
  assert.equal(u.searchParams.get("scope"), "user.info.basic,user.info.stats,video.list,video.upload,video.publish");
  assert.equal(u.searchParams.get("code_challenge"), "abc"); assert.equal(u.searchParams.get("code_challenge_method"), "S256"); assert.equal(u.searchParams.get("state"), "ST");
  assert.equal(u.searchParams.get("redirect_uri"), "https://arauto.teste/conexoes/tiktok/retorno");
});

test("trocarCodigo: form urlencoded com client_secret e code_verifier; recusa vira erro sem vazar segredo", async () => {
  const { ctx, chamadas } = ctxCom((c) => (/CODRUIM/.test(c.corpo) ? R(400, { error: "invalid_grant", error_description: "Authorization code is expired" }) : R(200, { access_token: "AT", refresh_token: "RT", expires_in: 86400, refresh_expires_in: 31536000, open_id: "OPEN1", scope: "user.info.basic,video.upload", token_type: "Bearer" })));
  const j = await t.trocarCodigo(ctx, { client_key: "ck", client_secret: "cs-segredo" }, { codigo: "COD", verificador: "VER", redirect: "https://x/retorno" });
  const p = new URLSearchParams(chamadas[0].corpo);
  assert.equal(chamadas[0].url, "https://open.tiktokapis.com/v2/oauth/token/"); assert.equal(chamadas[0].cab["content-type"], "application/x-www-form-urlencoded");
  assert.deepEqual([p.get("grant_type"), p.get("code"), p.get("code_verifier"), p.get("client_key"), p.get("redirect_uri")], ["authorization_code", "COD", "VER", "ck", "https://x/retorno"]);
  const reg = JSON.parse(t.registroToken(j, AGORA));
  assert.deepEqual([reg.access_token, reg.refresh_token, reg.openId, reg.expiry, reg.refreshExpiry], ["AT", "RT", "OPEN1", AGORA + 86400e3, AGORA + 31536000e3]);
  await assert.rejects(t.trocarCodigo(ctx, { client_key: "ck", client_secret: "cs-segredo" }, { codigo: "CODRUIM", verificador: "V", redirect: "r" }), (e) => /expired/.test(e.message) && !e.message.includes("cs-segredo"));
});

test("tokenValido: usa o token vigente; renova com 5 min de folga e guarda o refresh token que girou", async () => {
  const vigente = ctxCom(() => { throw new Error("não devia chamar"); });
  assert.equal(await t.tokenValido(vigente.ctx), "AT-1");
  const perto = ctxCom(() => R(200, { access_token: "AT-2", refresh_token: "RT-2", expires_in: 86400, refresh_expires_in: 31536000, open_id: "O" }), { token: { access_token: "AT-velho", refresh_token: "RT-1", expiry: AGORA + 4 * 60e3, refreshExpiry: AGORA + 1e9, openId: "O" } });
  assert.equal(await t.tokenValido(perto.ctx), "AT-2");
  const p = new URLSearchParams(perto.chamadas[0].corpo);
  assert.deepEqual([p.get("grant_type"), p.get("refresh_token"), p.get("client_secret")], ["refresh_token", "RT-1", "cs-segredo"]);
  const guardado = JSON.parse(perto.guardado.get(t.REF_TOKEN));
  assert.deepEqual([guardado.access_token, guardado.refresh_token, guardado.expiry], ["AT-2", "RT-2", AGORA + 86400e3]);
  // o TikTok pode devolver o MESMO refresh token (ou nenhum): vale o anterior
  const igual = ctxCom(() => R(200, { access_token: "AT-3", expires_in: 86400 }), { token: { access_token: "x", refresh_token: "RT-1", expiry: 0, refreshExpiry: AGORA + 1e9 } });
  await t.tokenValido(igual.ctx); assert.equal(JSON.parse(igual.guardado.get(t.REF_TOKEN)).refresh_token, "RT-1");
});

test("tokenValido: sem conexão, refresh vencido e refresh recusado dão mensagens claras", async () => {
  await assert.rejects(t.tokenValido(ctxCom(() => OK({}), { token: null }).ctx), (e) => e.codigo === "tiktok_nao_conectado" && e.status === 409);
  await assert.rejects(t.tokenValido(ctxCom(() => OK({}), { token: { access_token: "x", refresh_token: "r", expiry: 0, refreshExpiry: AGORA - 1 } }).ctx), /venceu/);
  await assert.rejects(t.tokenValido(ctxCom(() => R(400, { error: "invalid_grant", error_description: "refresh_token is invalid" }), { token: { access_token: "x", refresh_token: "r", expiry: 0 } }).ctx), /vencido ou já usado/);
  await assert.rejects(t.tokenValido(ctxCom(() => OK({}), { token: { access_token: "x", refresh_token: "r", expiry: 0 }, cliente: null }).ctx), (e) => e.codigo === "sem_credencial");
});

test("chamar: Bearer, JSON, `data` na saída; erro do TikTok vira mensagem traduzida (sem token) e marca o que repete", async () => {
  const { ctx, chamadas } = ctxCom((c) => (c.url.includes("auditoria") ? ERRO(403, "unaudited_client_can_only_post_to_private_accounts", "x") : c.url.includes("fora") ? ERRO(500, "internal_error") : c.url.includes("taxa") ? ERRO(429, "rate_limit_exceeded") : OK({ ola: 1 })));
  assert.deepEqual(await t.chamar(ctx, "/v2/x", { metodo: "POST", query: { fields: "a,b" }, corpo: { k: 1 } }), { ola: 1 });
  assert.equal(chamadas[0].cab.authorization, "Bearer AT-1"); assert.equal(chamadas[0].url, "https://open.tiktokapis.com/v2/x?fields=a%2Cb"); assert.equal(chamadas[0].corpo, '{"k":1}');
  await assert.rejects(t.chamar(ctx, "/v2/auditoria"), (e) => e.status === 403 && e.transitorio === false && /ainda não foi auditado/.test(e.message) && !e.message.includes("AT-1"));
  await assert.rejects(t.chamar(ctx, "/v2/fora"), (e) => t.transitorio(e));
  await assert.rejects(t.chamar(ctx, "/v2/taxa"), (e) => t.transitorio(e));
  assert.equal(t.transitorio(Object.assign(new Error("x"), { status: 400, transitorio: false })), false);
  const rede = ctxCom(() => { throw new Error("ECONNRESET"); });
  await assert.rejects(t.chamar(rede.ctx, "/v2/x"), (e) => t.transitorio(e) && /rede/.test(e.message));
  assert.match(t.mensagemErro("codigo_novo", "detalhe"), /codigo_novo \(detalhe\)/);
});

test("perfil e status: campos pedidos, números e nome; username só vem com o escopo user.info.profile", async () => {
  const { ctx, chamadas } = ctxCom(() => OK({ user: { open_id: "OPEN1", display_name: "Dev Ocioso", avatar_url: "https://p16.tiktokcdn.com/a.jpg", follower_count: 120, following_count: 3, likes_count: 900, video_count: 12 } }));
  const p = await t.perfil({ ctx });
  assert.deepEqual([p.id, p.nome, p.seguidores, p.seguindo, p.curtidas, p.videos, p.avatar], ["OPEN1", "Dev Ocioso", 120, 3, 900, 12, "https://p16.tiktokcdn.com/a.jpg"]);
  assert.equal(new URL(chamadas[0].url).searchParams.get("fields"), "open_id,avatar_url,display_name,follower_count,following_count,likes_count,video_count");
  assert.deepEqual(await t.status({ ctx }), { conectado: true, detalhe: "Dev Ocioso", canalId: "OPEN1" });
  assert.equal((await t.status({ ctx: ctxCom(() => OK({}), { token: null }).ctx })).conectado, false);
  const ruim = await t.status({ ctx: ctxCom(() => ERRO(401, "access_token_invalid")).ctx });
  assert.equal(ruim.conectado, false); assert.match(ruim.detalhe, /reconecte/);
});

test("listarVideos: POST com cursor, campos pedidos, normalização e paginação; consultarVideos em lotes de 20", async () => {
  const { ctx, chamadas } = ctxCom((c) => {
    if (c.url.includes("/video/list/")) { const corpo = JSON.parse(c.corpo); return OK(corpo.cursor ? { videos: [], has_more: false, cursor: 1 } : { videos: [{ id: "7001", title: "Primeira linha\nresto #tag", video_description: "Primeira linha\nresto #tag", create_time: 1793800000, cover_image_url: "https://p19.tiktokcdn-us.com/c.jpg", share_url: "https://www.tiktok.com/@dev/video/7001", duration: 31, view_count: 1000, like_count: 80, comment_count: 5, share_count: 7 }], has_more: true, cursor: 1793700000000 }); }
    const ids = JSON.parse(c.corpo).filters.video_ids; return OK({ videos: ids.map((id) => ({ id, view_count: 1, like_count: 2 })) });
  });
  const p1 = await t.listarVideos({ ctx, max: 50 });
  assert.equal(JSON.parse(chamadas[0].corpo).max_count, 20); assert.match(chamadas[0].url, /fields=id%2Ctitle%2Cvideo_description%2Ccreate_time%2Ccover_image_url%2Cshare_url%2Cduration%2Cview_count%2Clike_count%2Ccomment_count%2Cshare_count/);
  const v = p1.videos[0];
  assert.deepEqual([v.id, v.titulo, v.views, v.curtidas, v.comentarios, v.compartilhamentos, v.duracao, v.permalink, v.publicadoEm], ["7001", "Primeira linha", 1000, 80, 5, 7, 31, "https://www.tiktok.com/@dev/video/7001", new Date(1793800000e3).toISOString()]);
  assert.equal(p1.proxima, "1793700000000");
  const p2 = await t.listarVideos({ ctx, cursor: p1.proxima }); assert.equal(p2.proxima, null); assert.equal(JSON.parse(chamadas[1].corpo).cursor, 1793700000000);
  const m = await t.consultarVideos({ ctx, ids: Array.from({ length: 25 }, (_, i) => String(9000 + i)) });
  assert.equal(m.size, 25); assert.equal(chamadas.filter((c) => c.url.includes("/video/query/")).length, 2); assert.equal(m.get("9000").views, 1);
});

test("planoChunks: uma parte só quando cabe, partes de 5 a 64 MB e a última absorve o resto", () => {
  const MB = t.MB;
  assert.deepEqual(t.planoChunks(3 * MB), { chunk: 3 * MB, total: 1, partes: [{ a: 0, b: 3 * MB - 1, tamanho: 3 * MB }] });
  assert.equal(t.planoChunks(10 * MB).total, 1);
  const doze = t.planoChunks(12 * MB); assert.deepEqual([doze.chunk, doze.total, doze.partes.length], [12 * MB, 1, 1], "12 MB com parte de 10 MB: uma parte só, com chunk_size = video_size (o TikTok recusa o contrário)");
  const p = t.planoChunks(25 * MB, 10 * MB);
  assert.deepEqual([p.chunk, p.total, p.partes.map((x) => x.tamanho)], [10 * MB, 2, [10 * MB, 15 * MB]]);
  assert.equal(p.partes.at(-1).b, 25 * MB - 1);
  assert.equal(t.planoChunks(500 * MB, 1000 * MB).chunk, 64 * MB);
  assert.throws(() => t.planoChunks(0), /vazio/); assert.throws(() => t.planoChunks(5 * 1024 * MB), /4 GB/);
});

test("montarPostInfo: legenda até 2200, privacidade conferida na conta, flags e quadro da capa", () => {
  const info = { privacidades: ["SELF_ONLY"], comentarioDesabilitado: true, duetoDesabilitado: false, stitchDesabilitado: false };
  const item = { textos: { texto: "x".repeat(2300) }, opcoes: { modo: "direto", miniaturaMs: 1500.7, conteudoIA: true } };
  const pi = t.montarPostInfo(item, info);
  assert.equal(pi.title.length, 2200); assert.ok(pi.title.endsWith("…"));
  assert.deepEqual([pi.privacy_level, pi.disable_comment, pi.disable_duet, pi.video_cover_timestamp_ms, pi.is_aigc], ["SELF_ONLY", true, false, 1500, true]);
  assert.throws(() => t.montarPostInfo({ textos: { texto: "a" }, opcoes: { privacidade: "PUBLIC_TO_EVERYONE" } }, info), (e) => e.codigo === "privacy_level_option_mismatch" && /SELF_ONLY/.test(e.message));
  assert.throws(() => t.montarPostInfo({ textos: { texto: "a" }, opcoes: { privacidade: "TODOS" } }, info), /privacidade do TikTok inválida/);
  assert.equal("video_cover_timestamp_ms" in t.montarPostInfo({ textos: { texto: "a" }, opcoes: {} }, info), false);
  assert.throws(() => t.modoDe({ opcoes: { modo: "agora" } }), /modo do TikTok inválido/); assert.equal(t.modoDe({ opcoes: {} }), "rascunho");
});

test("infoCriador, iniciarPublicacao, enviarParte e statusPublicacao: corpos e rotas certos nos dois modos", async () => {
  const { ctx, chamadas } = ctxCom((c) => {
    if (c.url.includes("creator_info")) return OK({ privacy_level_options: ["SELF_ONLY", "FOLLOWER_OF_CREATOR"], max_video_post_duration_sec: 600, comment_disabled: false, duet_disabled: true, stitch_disabled: false, creator_username: "dev", creator_nickname: "Dev" });
    if (c.url.includes("/inbox/video/init/")) return OK({ publish_id: "v_inbox~v2.2", upload_url: "https://upload.tiktokapis.com/video/?upload_id=I" });
    if (c.url.includes("/video/init/")) return OK({ publish_id: "v_pub_url~v2.1", ...(JSON.parse(c.corpo).source_info.source === "FILE_UPLOAD" ? { upload_url: "https://upload.tiktokapis.com/video/?upload_id=U" } : {}) });
    if (c.url.includes("upload.tiktokapis.com")) return new Response(null, { status: c.cab["content-range"].endsWith("/30") ? 201 : 206 });
    return OK({ status: "PUBLISH_COMPLETE", publicaly_available_post_id: [7002], uploaded_bytes: 30 });
  });
  const info = await t.infoCriador({ ctx });
  assert.deepEqual([info.privacidades, info.duracaoMaxSeg, info.duetoDesabilitado, info.usuario], [["SELF_ONLY", "FOLLOWER_OF_CREATOR"], 600, true, "dev"]);
  const pi = t.montarPostInfo({ textos: { texto: "legenda #oi" }, opcoes: { modo: "direto" } }, info);
  const a = await t.iniciarPublicacao({ ctx, modo: "direto", postInfo: pi, fonte: { url: "https://arauto.teste/v1/m/M1/tok/v.mp4" } });
  const ca = chamadas.find((c) => c.url.endsWith("/v2/post/publish/video/init/"));
  assert.deepEqual(JSON.parse(ca.corpo), { post_info: pi, source_info: { source: "PULL_FROM_URL", video_url: "https://arauto.teste/v1/m/M1/tok/v.mp4" } });
  assert.deepEqual(a, { publishId: "v_pub_url~v2.1", uploadUrl: null });
  const b = await t.iniciarPublicacao({ ctx, modo: "direto", postInfo: pi, fonte: { tamanho: 30, chunk: 30, total: 1 } });
  assert.deepEqual(JSON.parse(chamadas.filter((c) => c.url.endsWith("/post/publish/video/init/")).at(-1).corpo).source_info, { source: "FILE_UPLOAD", video_size: 30, chunk_size: 30, total_chunk_count: 1 });
  assert.equal(b.uploadUrl, "https://upload.tiktokapis.com/video/?upload_id=U");
  const c = await t.iniciarPublicacao({ ctx, modo: "rascunho", postInfo: pi, fonte: { tamanho: 30, chunk: 30, total: 1 } });
  const ci = chamadas.find((x) => x.url.endsWith("/inbox/video/init/"));
  assert.deepEqual(JSON.parse(ci.corpo), { source_info: { source: "FILE_UPLOAD", video_size: 30, chunk_size: 30, total_chunk_count: 1 } }, "o rascunho não leva post_info (a API da caixa de entrada não recebe legenda)");
  assert.equal(c.publishId, "v_inbox~v2.2");
  assert.equal((await t.enviarParte({ ctx, uploadUrl: c.uploadUrl, bytes: new Uint8Array(30), parte: { a: 0, b: 29 }, total: 30 })).status, 201);
  const put = chamadas.find((x) => x.metodo === "PUT");
  assert.deepEqual([put.cab["content-range"], put.cab["content-type"], put.cab["content-length"]], ["bytes 0-29/30", "video/mp4", "30"]);
  const st = await t.statusPublicacao({ ctx, publishId: "v_pub_url~v2.1" });
  assert.deepEqual([st.codigo, st.videoIds, st.enviadoBytes], ["PUBLISH_COMPLETE", ["7002"], 30]);
  assert.equal(JSON.parse(chamadas.at(-1).corpo).publish_id, "v_pub_url~v2.1");
  const sem = ctxCom(() => new Response("erro", { status: 400 }));
  await assert.rejects(t.enviarParte({ ctx: sem.ctx, uploadUrl: "https://u", bytes: new Uint8Array(3), parte: { a: 0, b: 2 }, total: 3 }), (e) => e.status === 400 && e.transitorio === false);
});

test("o módulo cumpre o contrato de provedor e revogar é melhor esforço", async () => {
  assert.deepEqual(verificarProvedor(t), []);
  const ok = ctxCom(() => R(200, {})); assert.equal(await t.revogar(ok.ctx), true);
  assert.equal(new URLSearchParams(ok.chamadas[0].corpo).get("token"), "AT-1"); assert.match(ok.chamadas[0].url, /\/v2\/oauth\/revoke\/$/);
  assert.equal(await t.revogar(ctxCom(() => { throw new Error("rede"); }).ctx), false);
});

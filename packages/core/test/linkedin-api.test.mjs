// T-040: provedor do LinkedIn sem servidor (ctx falso, nenhuma rede): texto no formato little, erros tipados, token e diagnóstico, ordem das chamadas.
import test from "node:test";
import assert from "node:assert/strict";
import * as li from "../src/provedores/linkedin-api.ts";
import { REDES_VALIDAS, MODOS, validarPedido, verificarProvedor } from "../src/contrato.ts";

const R = (status, corpo, cab = {}) => new Response(corpo === null ? null : JSON.stringify(corpo), { status, headers: cab });
function ctxFalso({ token = { access_token: "AT", expiry: 9e15, sub: "S1" }, resposta, deps = {} } = {}) {
  const guardado = { v: token ? JSON.stringify(token) : null }, chamadas = [];
  const fetchFn = async (url, init = {}) => { chamadas.push({ url: String(url), m: init.method || "GET", h: init.headers || {}, body: init.body }); return resposta(String(url), init); };
  return { chamadas, guardado, ctx: { fetchFn, segredos: { obter: async (r) => (r === "linkedin/cliente" ? JSON.stringify({ client_id: "cid", client_secret: "sec" }) : guardado.v), guardar: async (_r, v) => { guardado.v = v; } }, midia: { abrir: async (id) => ({ tamanho: id === "VGRANDE" ? 700 * 1024 * 1024 : 10, mime: "image/jpeg", ler: async (i, n) => new Uint8Array(Math.min(n, 10 - i)) }) }, deps: { agora: () => 1000, ...deps } } };
}

test("o contrato conhece a rede, o provedor cumpre a interface e a versão da API é uma constante só", () => {
  assert.ok(REDES_VALIDAS.includes("linkedin")); assert.deepEqual(MODOS.linkedin, ["agora"]);
  assert.deepEqual(verificarProvedor(li), []); assert.equal(li.VERSAO_API, "202611"); assert.equal(li.LIMITE_TEXTO, 3000); assert.equal(li.LIMITE_CHAMADAS_DIA, 150);
  assert.deepEqual(validarPedido({ titulo: "t", kind: "text", midia: {}, textos: { linkedin: { texto: "x" } }, destinos: [{ rede: "linkedin" }] }), []);
  assert.ok(validarPedido({ titulo: "t", kind: "text", midia: { video: "V" }, textos: { linkedin: { texto: "x" } }, destinos: [{ rede: "linkedin" }] })[0]);
});

test("URL de autorização: sem PKCE, com os três escopos; troca do código em formulário", async () => {
  const u = new URL(li.urlAutorizacao({ clientId: "cid", redirect: "https://x/cb", estado: "ST" }));
  assert.equal(u.searchParams.get("scope"), "openid profile w_member_social"); assert.equal(u.searchParams.get("code_challenge"), null); assert.equal(u.searchParams.get("state"), "ST");
  const { ctx, chamadas } = ctxFalso({ resposta: () => R(200, { access_token: "A", expires_in: 100, refresh_token: "RT", id_token: "ID" }) });
  const j = await li.trocarCodigo(ctx, { client_id: "cid", client_secret: "sec" }, { codigo: "C", redirect: "https://x/cb" });
  assert.equal(chamadas[0].url, "https://www.linkedin.com/oauth/v2/accessToken"); assert.equal(chamadas[0].h["content-type"], "application/x-www-form-urlencoded");
  const reg = JSON.parse(li.registroToken({ ...j, sub: "S" }, 5000)); assert.equal(reg.refresh_token, "RT"); assert.equal(reg.expiry, 105000); assert.equal(reg.id_token, undefined);
  const ruim = ctxFalso({ resposta: () => R(400, { error: "invalid_request", error_description: "bad code" }) }).ctx;
  await assert.rejects(li.trocarCodigo(ruim, { client_id: "c", client_secret: "s" }, { codigo: "C", redirect: "r" }), /bad code/);
});

test("diagnóstico do token: validade, refresh e vencido", () => {
  const T = 1e12, reg = (o) => JSON.stringify({ access_token: "A", expiry: T + 5184000e3, ...o });
  assert.deepEqual(li.diagnosticoToken(reg({}), T), { tokenExpiresAt: new Date(T + 5184000e3).toISOString(), refreshAvailable: false, expired: false, expiresInDays: 60 });
  assert.equal(li.diagnosticoToken(reg({ refresh_token: "R" }), T).refreshAvailable, true);
  assert.equal(li.diagnosticoToken(reg({ expiry: T - 1 }), T).expired, true);
  assert.equal(li.diagnosticoToken(reg({ expiry: T - 1, refresh_token: "R" }), T).expired, false, "com refresh, vencer não derruba");
  assert.deepEqual(li.diagnosticoToken(null, T), { tokenExpiresAt: null, refreshAvailable: false, expired: false, expiresInDays: null });
});

test("erros HTTP viram erros tipados (nunca genéricos): 401, 403, 422, 429 com Retry-After e 5xx", () => {
  const casos = [[401, "linkedin_token_invalido", true], [403, "linkedin_proibido", true], [400, "linkedin_recusado", true], [422, "linkedin_recusado", true], [429, "linkedin_limite_excedido", undefined], [503, "linkedin_erro", undefined]];
  for (const [status, codigo, definitivo] of casos) { const e = li.falha(status, JSON.stringify({ message: "motivo" }), new Headers({ "retry-after": "30" })); assert.equal(e.codigo, codigo); assert.equal(e.status, status); assert.equal(!!e.definitivo, !!definitivo); assert.match(e.message, new RegExp(`^\\[${li.CODIGO_PUBLICO[codigo]}\\]`)); }
  assert.equal(li.falha(429, "{}", new Headers({ "retry-after": "30" })).retryAfter, 30);
  assert.ok(!li.falha(401, "token SECRETO-ABC no corpo", null).message.includes("SECRETO"), "corpo que não é JSON não vaza");
});

test("texto no formato little: reservados escapados e #tag vira template de hashtag; 3000 caracteres", () => {
  assert.equal(li.textoLittle("a (b) [c] {d} <e> *f* _g_ ~h~ @i | \\ j"), "a \\(b\\) \\[c\\] \\{d\\} \\<e\\> \\*f\\* \\_g\\_ \\~h\\~ \\@i \\| \\\\ j");
  assert.equal(li.textoLittle("oi #dev_brasil e # solto"), "oi {hashtag|\\#|dev_brasil} e \\# solto");
  assert.deepEqual(li.problemasTexto("a".repeat(3000)), []); assert.match(li.problemasTexto("a".repeat(3001))[0], /3000/); assert.ok(li.problemasTexto("  ")[0]);
  assert.equal([...("😀".repeat(3000))].length, 3000); assert.deepEqual(li.problemasTexto("😀".repeat(3000)), [], "conta caracteres, não unidades UTF-16");
});

test("publicar texto: um POST /rest/posts com cabeçalhos e corpo exatos; sem x-restli-id é erro transitório", async () => {
  const { ctx, chamadas } = ctxFalso({ resposta: () => new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:1" } }) });
  const r = await li.publicar({ item: { kind: "text", textos: { texto: "Oi" } }, ctx });
  assert.deepEqual(r, { id: "urn:li:share:1", url: "https://www.linkedin.com/feed/update/urn:li:share:1/" });
  assert.equal(chamadas.length, 1); const c = chamadas[0];
  assert.equal(c.url, "https://api.linkedin.com/rest/posts"); assert.equal(c.m, "POST");
  assert.deepEqual(c.h, { authorization: "Bearer AT", "linkedin-version": "202611", "x-restli-protocol-version": "2.0.0", "content-type": "application/json" });
  assert.deepEqual(JSON.parse(c.body), { author: "urn:li:person:S1", commentary: "Oi", visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false });
  const sem = ctxFalso({ resposta: () => new Response(null, { status: 201 }) });
  await assert.rejects(li.publicar({ item: { kind: "text", textos: { texto: "Oi" } }, ctx: sem.ctx }), (e) => e.codigo === "linkedin_erro" && e.transitorio);
});

test("sem sub no registro: descobre pelo userinfo; vencido sem refresh = linkedin_token_vencido sem chamar nada", async () => {
  const { ctx, chamadas } = ctxFalso({ token: { access_token: "AT", expiry: 9e15 }, resposta: (u) => (u.endsWith("/userinfo") ? R(200, { sub: "DOUSER" }) : new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:2" } })) });
  await li.publicar({ item: { kind: "text", textos: { texto: "Oi" } }, ctx });
  assert.equal(chamadas[0].url, "https://api.linkedin.com/v2/userinfo"); assert.equal(JSON.parse(chamadas[1].body).author, "urn:li:person:DOUSER");
  const v = ctxFalso({ token: { access_token: "AT", expiry: 500 }, resposta: () => { throw new Error("não deveria chamar"); } });
  await assert.rejects(li.publicar({ item: { kind: "text", textos: { texto: "Oi" } }, ctx: v.ctx }), (e) => e.codigo === "linkedin_token_vencido" && e.definitivo && e.status === 401);
  assert.equal(v.chamadas.length, 0);
});

test("renovação: com refresh_token renova e guarda; recusa da renovação vira vencido e zera o registro", async () => {
  const ok = ctxFalso({ token: { access_token: "VELHO", expiry: 500, refresh_token: "RT" }, resposta: () => R(200, { access_token: "NOVO", expires_in: 100 }) });
  assert.equal(await li.tokenValido(ok.ctx), "NOVO");
  const corpo = new URLSearchParams(ok.chamadas[0].body); assert.equal(corpo.get("grant_type"), "refresh_token"); assert.equal(corpo.get("refresh_token"), "RT"); assert.equal(corpo.get("client_secret"), "sec");
  assert.equal(JSON.parse(ok.guardado.v).expiry, 1000 + 100 * 1000); assert.equal(JSON.parse(ok.guardado.v).refresh_token, "RT");
  const ruim = ctxFalso({ token: { access_token: "VELHO", expiry: 500, refresh_token: "RT" }, resposta: () => R(400, { error: "invalid_grant" }) });
  await assert.rejects(li.tokenValido(ruim.ctx), (e) => e.codigo === "linkedin_token_vencido");
  assert.equal(li.diagnosticoToken(ruim.guardado.v, 1000).expired, true, "o canal passa a 'reconectar'");
});

test("imagem única, carrossel e vídeo: ordem das chamadas, cabeçalhos do PUT e o corpo do post", async () => {
  let n = 0, etapas = [];
  const resposta = (u, init) => {
    etapas.push(`${init.method || "GET"} ${u.replace("https://", "").split("?")[0]}${u.includes("action=") ? "?" + u.split("?")[1] : ""}`);
    if (u.includes("images?action")) { n++; return R(200, { value: { uploadUrl: `https://www.linkedin.com/dms-uploads/i${n}`, image: `urn:li:image:${n}` } }); }
    if (u.includes("dms-uploads/i")) return new Response(null, { status: 201 });
    if (u.includes("videos?action=initializeUpload")) return R(200, { value: { video: "urn:li:video:V", uploadToken: "", uploadInstructions: [{ firstByte: 0, lastByte: 9, uploadUrl: "https://www.linkedin.com/dms-uploads/v0" }] } });
    if (u.includes("dms-uploads/v0")) return new Response(null, { status: 200, headers: { etag: '"E0"' } });
    if (u.includes("finalizeUpload")) return R(200, {});
    return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:9" } });
  };
  let t = ctxFalso({ resposta });
  await li.publicar({ item: { kind: "image", textos: { texto: "x" }, images: [{ midia: "M1", alt: "alt 1" }] }, ctx: t.ctx });
  assert.deepEqual(etapas, ["POST api.linkedin.com/rest/images?action=initializeUpload", "PUT www.linkedin.com/dms-uploads/i1", "POST api.linkedin.com/rest/posts"]);
  assert.equal(t.chamadas[1].h["content-type"], "image/jpeg"); assert.equal(t.chamadas[1].h.authorization, "Bearer AT");
  assert.deepEqual(JSON.parse(t.chamadas[2].body).content, { media: { id: "urn:li:image:1", altText: "alt 1" } });
  etapas = []; n = 0; t = ctxFalso({ resposta });
  await li.publicar({ item: { kind: "carousel", textos: { texto: "x" }, images: [{ midia: "A" }, { midia: "B" }] }, ctx: t.ctx });
  assert.equal(etapas.length, 5); assert.deepEqual(JSON.parse(t.chamadas[4].body).content, { multiImage: { images: [{ id: "urn:li:image:1" }, { id: "urn:li:image:2" }] } });
  await assert.rejects(li.publicar({ item: { kind: "carousel", textos: { texto: "x" }, images: [{ midia: "A" }] }, ctx: ctxFalso({ resposta }).ctx }), (e) => e.codigo === "linkedin_recusado");
  etapas = []; t = ctxFalso({ resposta });
  await li.publicar({ item: { kind: "video", video: "V", titulo: "Meu vídeo", textos: { texto: "x" } }, ctx: t.ctx });
  assert.deepEqual(etapas, ["POST api.linkedin.com/rest/videos?action=initializeUpload", "PUT www.linkedin.com/dms-uploads/v0", "POST api.linkedin.com/rest/videos?action=finalizeUpload", "POST api.linkedin.com/rest/posts"]);
  assert.deepEqual(JSON.parse(t.chamadas[2].body), { finalizeUploadRequest: { video: "urn:li:video:V", uploadToken: "", uploadedPartIds: ["E0"] } });
});

test("contador no provedor: cada chamada reserva 1; a conferência prévia usa o total calculado e recusa antes de subir", async () => {
  const reservas = [], verificacoes = [];
  const t = ctxFalso({ deps: { reservarLinkedin: async (n) => { reservas.push(n); }, verificarLinkedin: async (n) => { verificacoes.push(n); } }, resposta: (u) => (u.includes("images?action") ? R(200, { value: { uploadUrl: "https://www.linkedin.com/dms-uploads/i1", image: "urn:li:image:1" } }) : u.includes("dms-uploads") ? new Response(null, { status: 201 }) : new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:1" } })) });
  await li.publicar({ item: { kind: "image", textos: { texto: "x" }, images: [{ midia: "M" }] }, ctx: t.ctx });
  assert.deepEqual(verificacoes, [3]); assert.deepEqual(reservas, [1, 1, 1]);
  assert.equal(li.chamadasNecessarias({ kind: "video" }, 700 * 1024 * 1024), 1 + 175 + 1 + 1);
  const grande = ctxFalso({ resposta: () => { throw new Error("não deveria chamar"); } });
  await assert.rejects(li.publicar({ item: { kind: "video", video: "VGRANDE", textos: { texto: "x" } }, ctx: grande.ctx }), (e) => e.codigo === "linkedin_recusado" && /500 MB/.test(e.message));
  assert.equal(grande.chamadas.length, 0);
  const folga = ctxFalso({ deps: { verificarLinkedin: async () => { throw Object.assign(new Error("429 do contador"), { status: 429 }); } }, resposta: () => { throw new Error("não deveria chamar"); } });
  await assert.rejects(li.publicar({ item: { kind: "text", textos: { texto: "x" } }, ctx: folga.ctx }), /429 do contador/);
  assert.equal(folga.chamadas.length, 0);
});

test("401 no meio: invalida o registro (canal 'reconectar') e propaga o erro tipado; apagar usa DELETE com X-RestLi-Method", async () => {
  const t = ctxFalso({ resposta: () => R(401, { message: "revoked" }) });
  await assert.rejects(li.publicar({ item: { kind: "text", textos: { texto: "x" } }, ctx: t.ctx }), (e) => e.codigo === "linkedin_token_invalido" && e.definitivo);
  assert.equal(li.diagnosticoToken(t.guardado.v, 1000).expired, true);
  const d = ctxFalso({ resposta: () => new Response(null, { status: 204 }) });
  assert.equal(await li.apagar({ ctx: d.ctx, id: "urn:li:share:7" }), true);
  assert.equal(d.chamadas[0].url, "https://api.linkedin.com/rest/posts/urn%3Ali%3Ashare%3A7"); assert.equal(d.chamadas[0].m, "DELETE"); assert.equal(d.chamadas[0].h["x-restli-method"], "DELETE"); assert.equal(d.chamadas[0].h["linkedin-version"], "202611");
});

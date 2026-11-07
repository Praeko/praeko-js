import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import * as yt from "../src/provedores/youtube.mjs";

const NOW = Date.parse("2026-11-04T20:00:00Z");
const resp = (status, corpo, cab = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (k) => cab[k.toLowerCase()] ?? null }, json: async () => (typeof corpo === "string" ? JSON.parse(corpo) : corpo), text: async () => (typeof corpo === "string" ? corpo : JSON.stringify(corpo)) });
const segredos = (ini = {}) => { const m = { ...ini }; return { m, obter: (r) => m[r] ?? null, guardar: (r, v) => { m[r] = v; } }; };
const CLIENTE = JSON.stringify({ client_id: "id", client_secret: "sec" });
const tokenOk = (extra = {}) => JSON.stringify({ access_token: "AT", refresh_token: "RT", expiry: NOW + 3600e3, ...extra });
const arquivoFalso = (tamanho) => () => ({ tamanho, ler: (i, n) => Buffer.alloc(Math.min(n, tamanho - i), 1), fechar() {} });
const mkctx = (fetchFn, seg = segredos({ "youtube/cliente": CLIENTE, "youtube/token": tokenOk() }), extra = {}) => ({ fetchFn, segredos: seg, log: () => {}, deps: { agora: () => NOW, dormir: async () => {}, abrirArquivo: arquivoFalso(1000), ...extra } });
const item = (o = {}) => ({ slug: "s", rede: "youtube", quando: "2026-11-06T20:30:00.000Z", video: "/x/v.mp4", capa: null, textos: { titulo: "Título", texto: "Descrição" }, opcoes: {}, ...o });

test("modo → privacyStatus e publishAt", () => {
  assert.equal(yt.montarMetadados(item(), NOW).status.privacyStatus, "private");
  assert.equal(yt.montarMetadados(item(), NOW).status.publishAt, undefined);
  const ag = yt.montarMetadados(item({ opcoes: { modo: "agendado" } }), NOW).status;
  assert.equal(ag.privacyStatus, "private"); assert.equal(ag.publishAt, "2026-11-06T20:30:00.000Z");
  assert.equal(yt.montarMetadados(item({ opcoes: { modo: "publico" } }), NOW).status.privacyStatus, "public");
  assert.throws(() => yt.montarMetadados(item({ opcoes: { modo: "agendado" }, quando: "2026-11-01T00:00:00Z" }), NOW), /já passou/);
  assert.throws(() => yt.montarMetadados(item({ opcoes: { modo: "x" } }), NOW), /inválido/);
});
test("metadados: título cortado em 100, categoria 28 e idioma pt, não é para crianças", () => {
  const m = yt.montarMetadados(item({ textos: { titulo: "a".repeat(150), texto: "d" } }), NOW);
  assert.ok(m.snippet.title.length <= 100); assert.equal(m.snippet.categoryId, "28"); assert.equal(m.snippet.defaultLanguage, "pt");
  assert.equal(m.status.selfDeclaredMadeForKids, false);
});
test("PKCE: desafio S256 do exemplo da RFC 7636 e URL de autorização", () => {
  assert.equal(yt.desafioPkce("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  const u = new URL(yt.urlAutorizacao({ clientId: "c", redirect: "http://127.0.0.1:1", desafio: "d", estado: "s" }));
  assert.equal(u.searchParams.get("code_challenge_method"), "S256"); assert.equal(u.searchParams.get("access_type"), "offline");
  assert.ok(u.searchParams.get("scope").includes("youtube.upload"));
});
test("token: usa o válido sem rede; renova o vencido e guarda", async () => {
  let chamadas = 0;
  const seg = segredos({ "youtube/cliente": CLIENTE, "youtube/token": tokenOk({ expiry: NOW + 3600e3 }) });
  assert.equal(await yt.tokenValido(mkctx(async () => { chamadas++; }, seg)), "AT"); assert.equal(chamadas, 0);
  const seg2 = segredos({ "youtube/cliente": CLIENTE, "youtube/token": tokenOk({ expiry: NOW - 1 }) });
  let corpo;
  const f = async (url, o) => { corpo = o.body; return resp(200, { access_token: "NOVO", expires_in: 3600 }); };
  assert.equal(await yt.tokenValido(mkctx(f, seg2)), "NOVO");
  assert.ok(corpo.includes("grant_type=refresh_token") && corpo.includes("refresh_token=RT"));
  assert.equal(JSON.parse(seg2.m["youtube/token"]).access_token, "NOVO"); assert.equal(JSON.parse(seg2.m["youtube/token"]).refresh_token, "RT");
});
test("token: invalid_grant explica o modo Testing", async () => {
  const seg = segredos({ "youtube/cliente": CLIENTE, "youtube/token": tokenOk({ expiry: NOW - 1 }) });
  await assert.rejects(yt.tokenValido(mkctx(async () => resp(400, { error: "invalid_grant" }), seg)), /7 dias/);
});
test("resumable: sessão → PUT em blocos (308 → 201) e cabeçalhos certos", async () => {
  const chamadas = [];
  const f = async (url, o = {}) => {
    chamadas.push({ url: String(url), m: o.method, h: o.headers || {}, n: o.body?.length });
    if (String(url).includes("uploadType=resumable")) return resp(200, {}, { location: "https://up/sessao" });
    if (String(url) === "https://up/sessao") {
      const cr = o.headers["content-range"];
      return cr.endsWith("/20000000") && cr.startsWith("bytes 0-") ? resp(308, {}, { range: "bytes=0-8388607" }) : cr.startsWith("bytes 8388608-") ? resp(308, {}, { range: "bytes=0-16777215" }) : resp(201, { id: "VID1" });
    }
    throw new Error("url inesperada " + url);
  };
  const ctx = mkctx(f, undefined, { abrirArquivo: arquivoFalso(20000000) });
  const v = await yt.enviarVideo({ ctx, arquivo: "/x/v.mp4", metadados: yt.montarMetadados(item(), NOW) });
  assert.equal(v.id, "VID1");
  const ini = chamadas[0]; assert.equal(ini.h["x-upload-content-length"], "20000000"); assert.ok(ini.url.includes("part=snippet%2Cstatus") || ini.url.includes("part=snippet,status")); assert.equal(ini.h.authorization, "Bearer AT");
  assert.deepEqual(chamadas.slice(1).map((c) => c.h["content-range"]), ["bytes 0-8388607/20000000", "bytes 8388608-16777215/20000000", "bytes 16777216-19999999/20000000"]);
});
test("resumable: erro 503 retoma consultando bytes */total", async () => {
  let puts = 0; const cr = [];
  const f = async (url, o = {}) => {
    if (String(url).includes("uploadType=resumable")) return resp(200, {}, { location: "https://up/s" });
    cr.push(o.headers["content-range"]); puts++;
    if (puts === 1) return resp(503, "indisponivel");
    if (o.headers["content-range"].startsWith("bytes */")) return resp(308, {}, {});
    return resp(201, { id: "V2" });
  };
  const v = await yt.enviarVideo({ ctx: mkctx(f), arquivo: "/x/v.mp4", metadados: {} });
  assert.equal(v.id, "V2"); assert.ok(cr.some((c) => c.startsWith("bytes */")));
});
test("cota esgotada vira mensagem clara", async () => {
  const f = async (url) => resp(403, { error: { message: "quota", errors: [{ reason: "quotaExceeded" }] } });
  await assert.rejects(yt.enviarVideo({ ctx: mkctx(f), arquivo: "/x/v.mp4", metadados: {} }), /cota da API do YouTube esgotada/);
  assert.match(yt.mensagemErro(403, JSON.stringify({ error: { errors: [{ reason: "uploadLimitExceeded" }] } })), /limite de uploads/);
});
function fluxoCompleto({ miniaturaFalha = false } = {}) {
  const log = [];
  const f = async (url, o = {}) => {
    const u = String(url); log.push(u);
    if (u.includes("uploadType=resumable")) return resp(200, {}, { location: "https://up/s" });
    if (u === "https://up/s") return resp(201, { id: "VID9" });
    if (u.includes("part=processingDetails")) return resp(200, { items: [{ processingDetails: { processingStatus: "succeeded" } }] });
    if (u.includes("thumbnails/set")) return miniaturaFalha ? resp(403, { error: { message: "no", errors: [{ reason: "forbidden" }] } }) : resp(200, { items: [{}] });
    throw new Error("url inesperada " + u);
  };
  return { f, log };
}
test("publicar: sobe privado, define a miniatura e devolve links", async () => {
  const { f, log } = fluxoCompleto();
  const r = await yt.publicar({ item: item({ capa: "/x/capa.png" }), ctx: mkctx(f, undefined, { abrirArquivo: (a) => arquivoFalso(a.endsWith("png") ? 500 : 1000)() }) });
  assert.equal(r.id, "VID9"); assert.equal(r.url, "https://youtu.be/VID9"); assert.equal(r.privacidade, "private"); assert.equal(r.miniatura, true);
  assert.ok(log.some((u) => u.includes("thumbnails/set?videoId=VID9")));
});
test("publicar: miniatura que falha não derruba (aviso)", async () => {
  const { f } = fluxoCompleto({ miniaturaFalha: true });
  const r = await yt.publicar({ item: item({ capa: "/x/capa.png" }), ctx: mkctx(f, undefined, { abrirArquivo: (a) => arquivoFalso(a.endsWith("png") ? 500 : 1000)() }) });
  assert.equal(r.id, "VID9"); assert.equal(r.miniatura, false); assert.ok(r.avisos.some((x) => /miniatura não definida/.test(x)));
});
test("publicar sem capa não chama thumbnails; status lê o canal", async () => {
  const { f, log } = fluxoCompleto();
  await yt.publicar({ item: item(), ctx: mkctx(f) });
  assert.ok(!log.some((u) => u.includes("thumbnails")));
  const s = await yt.status({ ctx: mkctx(async () => resp(200, { items: [{ snippet: { title: "Dev Ocioso" } }] })) });
  assert.deepEqual(s, { conectado: true, detalhe: "Dev Ocioso" });
  assert.equal((await yt.status({ ctx: mkctx(async () => {}, segredos()) })).conectado, false);
});
test("conectar: loopback + PKCE troca o código e guarda os tokens (servidor e navegador simulados)", async () => {
  const seg = segredos(); let urlAbertura, handler, porta = 4321;
  const srv = Object.assign(new EventEmitter(), { listen: (p, h, cb) => cb(), address: () => ({ port: porta }), close() {} });
  const chamadas = [];
  const f = async (url, o = {}) => {
    chamadas.push(String(url));
    if (String(url).includes("oauth2.googleapis.com/token")) { assert.ok(o.body.includes("code_verifier=") && o.body.includes("code=COD")); return resp(200, { access_token: "A", refresh_token: "R", expires_in: 3600, scope: yt.ESCOPOS.join(" ") }); }
    if (String(url).includes("channels")) return resp(200, { items: [{ snippet: { title: "Meu Canal" } }] });
    throw new Error("url " + url);
  };
  const ctx = mkctx(f, seg, {
    criarServidor: (h) => { handler = h; return srv; },
    abrirNavegador: (u) => { urlAbertura = u; const estado = new URL(u).searchParams.get("state"); setImmediate(() => handler({ url: `/?code=COD&state=${estado}` }, { writeHead() { return this; }, end() {} })); },
  });
  const cod = await yt.conectar({ ctx, args: ["--cliente-id", "ID", "--cliente-segredo", "SEG"] });
  assert.equal(cod, 0);
  assert.ok(urlAbertura.includes("code_challenge_method=S256") && urlAbertura.includes("127.0.0.1%3A4321"));
  assert.equal(JSON.parse(seg.m["youtube/token"]).refresh_token, "R"); assert.equal(JSON.parse(seg.m["youtube/cliente"]).client_id, "ID");
});
test("conectar sem credencial dá instrução", async () => {
  await assert.rejects(yt.conectar({ ctx: mkctx(async () => {}, segredos()), args: [] }), /cliente-id/);
});
test("planejar mostra modo e capa", async () => {
  const l = await yt.planejar({ item: item({ capa: "/x/c.png" }), ctx: mkctx(async () => {}) });
  assert.ok(l.join("\n").includes("privacidade private") && l.join("\n").includes("c.png"));
});

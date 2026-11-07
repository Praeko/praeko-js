import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as tt from "../src/provedores/tiktok.mjs";

const MB = 1024 * 1024;
const tmp = () => mkdtempSync(join(tmpdir(), "bardo-tt-"));
const arquivo = (dir, bytes) => { const f = join(dir, "v.mp4"); writeFileSync(f, Buffer.alloc(bytes, 7)); return f; };

/** ctx com fetch roteado por URL; `rotas[url-trecho]` é função (opts) → { status, corpo } */
function montar({ agora = new Date("2026-11-06T12:00:00Z"), rotas = {}, segredos = {} } = {}) {
  const chamadas = [], seg = { ...segredos }, logs = [];
  const fetchFn = async (url, opts = {}) => {
    chamadas.push({ url, opts });
    const chave = Object.keys(rotas).find((k) => url.includes(k));
    if (!chave) throw new Error("rota não simulada: " + url);
    const r = await rotas[chave](opts, chamadas.filter((c) => c.url.includes(chave)).length);
    return { status: r.status ?? 200, ok: (r.status ?? 200) < 400, text: async () => JSON.stringify(r.corpo ?? {}) };
  };
  const ctx = { fetchFn, agora: () => agora, dormir: async () => {}, log: (m) => logs.push(m), tiktok: { pollMs: 0, maxPolls: 5 }, duracao: () => 30,
    segredos: { obter: (r) => seg[r] ?? null, guardar: (r, v) => { seg[r] = v; } } };
  return { ctx, chamadas, seg, logs };
}
const cliente = JSON.stringify({ key: "K", segredo: "S", redirect: "https://exemplo.com/retorno" });
const tokenOk = (agora = new Date("2026-11-06T12:00:00Z")) => JSON.stringify({ access_token: "acc", refresh_token: "ref", open_id: "oid", scope: "user.info.basic,video.upload,video.publish", expira_em: +agora + 3600e3, refresh_expira_em: +agora + 100 * 86400e3 });
const ok = (data) => ({ corpo: { data, error: { code: "ok", message: "", log_id: "x" } } });

test("planoChunks: arquivo pequeno em uma parte; médio; grande com última parte absorvendo o resto", () => {
  assert.deepEqual(tt.planoChunks(3 * MB).partes, [{ a: 0, b: 3 * MB - 1, tamanho: 3 * MB }]);
  const p7 = tt.planoChunks(7 * MB); assert.equal(p7.total, 1); assert.equal(p7.chunk, 7 * MB);
  const p = tt.planoChunks(25 * MB + 123, 10 * MB);
  assert.equal(p.total, 2); assert.equal(p.chunk, 10 * MB);
  assert.equal(p.partes[0].tamanho, 10 * MB); assert.equal(p.partes[1].tamanho, 15 * MB + 123);
  assert.equal(p.partes.reduce((s, x) => s + x.tamanho, 0), 25 * MB + 123);
  assert.equal(p.partes[1].b, 25 * MB + 122);
  const grande = tt.planoChunks(300 * MB, 64 * MB);
  assert.equal(grande.total, 4); assert.ok(grande.partes.at(-1).tamanho <= 128 * MB);
  assert.throws(() => tt.planoChunks(0), /vazio/);
  assert.throws(() => tt.planoChunks(5 * 1024 * MB), /4 GB/);
});
test("truncar não corta par substituto; privacidade sem auditoria vira SELF_ONLY", () => {
  assert.equal(tt.truncar("abc", 10), "abc");
  const t = tt.truncar("a".repeat(2199) + "😀😀", 2200); assert.ok(t.length <= 2200); assert.ok(!/[\ud800-\udbff]…$/.test(t));
  assert.deepEqual(tt.privacidadeEfetiva({ pedida: "PUBLIC_TO_EVERYONE", auditado: false }), { nivel: "SELF_ONLY", aviso: "privacidade PUBLIC_TO_EVERYONE → SELF_ONLY (app sem auditoria)" });
  assert.equal(tt.privacidadeEfetiva({ pedida: "PUBLIC_TO_EVERYONE", auditado: true }).nivel, "PUBLIC_TO_EVERYONE");
  assert.throws(() => tt.privacidadeEfetiva({ pedida: "PUBLIC_TO_EVERYONE", auditado: true, opcoesCriador: ["SELF_ONLY"] }), /fora das opções/);
});
test("urlAutorizacao e extrairCodigo", () => {
  const u = new URL(tt.urlAutorizacao({ key: "K", redirect: "https://e.com/r", estado: "st" }));
  assert.equal(u.origin + u.pathname, "https://www.tiktok.com/v2/auth/authorize/");
  assert.equal(u.searchParams.get("scope"), "user.info.basic,video.upload,video.publish");
  assert.equal(u.searchParams.get("client_key"), "K");
  assert.deepEqual(tt.extrairCodigo("https://e.com/r?code=abc%2Axyz&state=st&scopes=x"), { code: "abc*xyz", estado: "st" });
  assert.equal(tt.extrairCodigo("abc%2Bdef").code, "abc+def");
  assert.throws(() => tt.extrairCodigo("https://e.com/r?error=access_denied&error_description=nao"), /access_denied/);
});
test("conectar: sem código imprime a URL; com --url troca o código e guarda o token", async () => {
  const { ctx, seg, logs } = montar({ rotas: { "/v2/oauth/token/": (o) => { assert.ok(o.body.includes("grant_type=authorization_code")); assert.ok(o.body.includes("code=abc")); assert.ok(o.body.includes("redirect_uri=https%3A%2F%2Fexemplo.com%2Fretorno")); return { corpo: { access_token: "A", refresh_token: "R", open_id: "O", scope: "user.info.basic,video.upload", expires_in: 7200, refresh_expires_in: 15552000, token_type: "Bearer" } }; } } });
  await tt.conectar({ ctx, args: ["--cliente-key", "K", "--cliente-segredo", "S", "--redirect", "https://exemplo.com/retorno"] });
  assert.ok(logs.join("\n").includes("https://www.tiktok.com/v2/auth/authorize/"));
  const estado = JSON.parse(seg["tiktok/pendente"]).estado;
  await tt.conectar({ ctx, args: ["--url", `https://exemplo.com/retorno?code=abc&state=${estado}`] });
  const tok = JSON.parse(seg["tiktok/token"]);
  assert.equal(tok.access_token, "A"); assert.equal(tok.refresh_token, "R");
  assert.equal(tok.expira_em, +new Date("2026-11-06T12:00:00Z") + 7200e3);
  assert.ok(logs.join("\n").includes("sem video.publish"));
  await assert.rejects(tt.conectar({ ctx, args: ["--url", "https://exemplo.com/retorno?code=abc&state=outro"] }), /state/);
});
test("tokenValido renova perto do vencimento e guarda o refresh token novo", async () => {
  const agora = new Date("2026-11-06T12:00:00Z");
  const velho = JSON.stringify({ access_token: "velho", refresh_token: "r1", open_id: "o", scope: "s", expira_em: +agora + 60e3, refresh_expira_em: +agora + 50 * 86400e3 });
  const { ctx, seg } = montar({ agora, segredos: { "tiktok/cliente": cliente, "tiktok/token": velho }, rotas: { "/v2/oauth/token/": (o) => { assert.ok(o.body.includes("grant_type=refresh_token") && o.body.includes("refresh_token=r1")); return { corpo: { access_token: "novo", refresh_token: "r2", expires_in: 7200, refresh_expires_in: 15552000, open_id: "o", scope: "s" } }; } } });
  assert.equal(await tt.tokenValido(ctx), "novo");
  assert.equal(JSON.parse(seg["tiktok/token"]).refresh_token, "r2");
  const { ctx: c2 } = montar({ agora, segredos: { "tiktok/cliente": cliente, "tiktok/token": tokenOk(agora) } });
  assert.equal(await tt.tokenValido(c2), "acc"); // ainda vale: não chama a rede
  const expirado = JSON.stringify({ access_token: "a", refresh_token: "r", expira_em: +agora - 1, refresh_expira_em: +agora - 1 });
  await assert.rejects(tt.tokenValido(montar({ agora, segredos: { "tiktok/cliente": cliente, "tiktok/token": expirado } }).ctx), /conectar/);
  await assert.rejects(tt.tokenValido(montar().ctx), /não conectado/);
});
test("status: conectado mostra o nome; sem token diz como conectar", async () => {
  assert.equal((await tt.status({ ctx: montar().ctx })).conectado, false);
  const { ctx } = montar({ segredos: { "tiktok/cliente": cliente, "tiktok/token": tokenOk() }, rotas: { "/v2/user/info/": () => ok({ user: { display_name: "Dev Ocioso", open_id: "oid" } }) } });
  const s = await tt.status({ ctx }); assert.equal(s.conectado, true); assert.ok(s.detalhe.includes("Dev Ocioso"));
});
test("publicar em rascunho (inbox): init só com source_info, partes com Content-Range, espera SEND_TO_USER_INBOX", async () => {
  const dir = tmp(), v = arquivo(dir, 12 * MB);
  const puts = [];
  const { ctx, chamadas, logs } = montar({ segredos: { "tiktok/cliente": cliente, "tiktok/token": tokenOk() }, rotas: {
    "/inbox/video/init/": (o) => { const b = JSON.parse(o.body); assert.equal(b.post_info, undefined); assert.equal(b.source_info.source, "FILE_UPLOAD"); assert.equal(b.source_info.video_size, 12 * MB); assert.equal(b.source_info.total_chunk_count, 1); return ok({ publish_id: "p1", upload_url: "https://up.tiktok/x" }); },
    "up.tiktok/x": (o) => { puts.push(o.headers); return { status: 201, corpo: {} }; },
    "/status/fetch/": (o, n) => ok({ status: n < 2 ? "PROCESSING_UPLOAD" : "SEND_TO_USER_INBOX" }) } });
  const item = { video: v, textos: { texto: "Legenda do vídeo" }, opcoes: {} };
  const r = await tt.publicar({ item, ctx });
  assert.equal(r.id, "p1"); assert.equal(r.modo, "rascunho"); assert.equal(r.status, "SEND_TO_USER_INBOX"); assert.equal(r.legenda, "Legenda do vídeo");
  assert.equal(puts.length, 1); assert.equal(puts[0]["content-range"], `bytes 0-${12 * MB - 1}/${12 * MB}`); assert.equal(puts[0]["content-length"], String(12 * MB));
  assert.ok(!chamadas.some((c) => c.url.includes("creator_info")), "rascunho não consulta creator info");
  assert.ok(logs.join("\n").includes("Legenda do vídeo"));
  assert.equal(item.prep.publish_id, "p1");
  rmSync(dir, { recursive: true, force: true });
});
test("publicar direto: creator info, SELF_ONLY forçado sem auditoria, várias partes, status PUBLISH_COMPLETE", async () => {
  const dir = tmp(), v = arquivo(dir, 25 * MB + 5);
  const faixas = [];
  const { ctx, logs } = montar({ segredos: { "tiktok/cliente": cliente, "tiktok/token": tokenOk() }, rotas: {
    "/creator_info/query/": () => ok({ creator_username: "devocioso", privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"], comment_disabled: false, duet_disabled: true, stitch_disabled: false, max_video_post_duration_sec: 300 }),
    "/v2/post/publish/video/init/": (o) => { const b = JSON.parse(o.body); assert.equal(b.post_info.privacy_level, "SELF_ONLY"); assert.equal(b.post_info.disable_duet, true); assert.equal(b.post_info.video_cover_timestamp_ms, 0); assert.equal(b.post_info.title, "Legenda"); assert.equal(b.source_info.chunk_size, 10 * MB); assert.equal(b.source_info.total_chunk_count, 2); return ok({ publish_id: "p2", upload_url: "https://up.tiktok/y" }); },
    "up.tiktok/y": (o) => { faixas.push(o.headers["content-range"]); return { status: faixas.length === 1 ? 206 : 201, corpo: {} }; },
    "/status/fetch/": () => ok({ status: "PUBLISH_COMPLETE", publicaly_available_post_id: [123] }) } });
  const r = await tt.publicar({ item: { video: v, textos: { texto: "Legenda" }, opcoes: { modo: "direto", privacidade: "PUBLIC_TO_EVERYONE" } }, ctx });
  assert.equal(r.modo, "direto"); assert.equal(r.status, "PUBLISH_COMPLETE"); assert.equal(r.url, "https://www.tiktok.com/@devocioso/video/123");
  assert.deepEqual(faixas, [`bytes 0-${10 * MB - 1}/${25 * MB + 5}`, `bytes ${10 * MB}-${25 * MB + 4}/${25 * MB + 5}`]);
  assert.ok(logs.join("\n").includes("SELF_ONLY"));
  rmSync(dir, { recursive: true, force: true });
});
test("publicar direto auditado usa a privacidade pedida e respeita a duração máxima", async () => {
  const dir = tmp(), v = arquivo(dir, 2 * MB);
  let priv;
  const rotas = { "/creator_info/query/": () => ok({ creator_username: "u", privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"], max_video_post_duration_sec: 20 }),
    "/v2/post/publish/video/init/": (o) => { priv = JSON.parse(o.body).post_info.privacy_level; return ok({ publish_id: "p3", upload_url: "https://up.tiktok/z" }); },
    "up.tiktok/z": () => ({ status: 201 }), "/status/fetch/": () => ok({ status: "PUBLISH_COMPLETE" }) };
  const seg = { "tiktok/cliente": cliente, "tiktok/token": tokenOk() };
  const a = montar({ segredos: seg, rotas }); a.ctx.duracao = () => 15;
  await tt.publicar({ item: { video: v, textos: { texto: "x" }, opcoes: { modo: "direto", privacidade: "PUBLIC_TO_EVERYONE", auditado: true } }, ctx: a.ctx });
  assert.equal(priv, "PUBLIC_TO_EVERYONE");
  const b = montar({ segredos: seg, rotas }); b.ctx.duracao = () => 40;
  await assert.rejects(tt.publicar({ item: { video: v, textos: { texto: "x" }, opcoes: { modo: "direto", auditado: true } }, ctx: b.ctx }), /só posta até 20 s/);
  rmSync(dir, { recursive: true, force: true });
});
test("erro de cliente não auditado vira mensagem clara", async () => {
  const dir = tmp(), v = arquivo(dir, 1 * MB);
  const { ctx } = montar({ segredos: { "tiktok/cliente": cliente, "tiktok/token": tokenOk() }, rotas: {
    "/creator_info/query/": () => ok({ privacy_level_options: ["SELF_ONLY"] }),
    "/v2/post/publish/video/init/": () => ({ status: 403, corpo: { error: { code: "unaudited_client_can_only_post_to_private_accounts", message: "x", log_id: "l" } } }) } });
  await assert.rejects(tt.publicar({ item: { video: v, textos: { texto: "x" }, opcoes: { modo: "direto" } }, ctx }), /ainda não foi auditado/);
  const c2 = montar({ segredos: { "tiktok/cliente": cliente, "tiktok/token": tokenOk() }, rotas: { "/inbox/video/init/": () => ({ status: 403, corpo: { error: { code: "spam_risk_too_many_pending_share", message: "" } } }) } });
  await assert.rejects(tt.publicar({ item: { video: v, textos: { texto: "x" }, opcoes: {} }, ctx: c2.ctx }), /5 envios pendentes/);
  rmSync(dir, { recursive: true, force: true });
});
test("retry: se a tentativa anterior já chegou à caixa de entrada, não cria outro; falha de processamento explica", async () => {
  const dir = tmp(), v = arquivo(dir, 1 * MB);
  const seg = { "tiktok/cliente": cliente, "tiktok/token": tokenOk() };
  const a = montar({ segredos: seg, rotas: { "/status/fetch/": () => ok({ status: "SEND_TO_USER_INBOX" }) } });
  const r = await tt.publicar({ item: { video: v, textos: {}, opcoes: {}, prep: { publish_id: "antigo" } }, ctx: a.ctx });
  assert.equal(r.id, "antigo"); assert.equal(r.retomado, true); assert.ok(!a.chamadas.some((c) => c.url.includes("init")));
  const b = montar({ segredos: seg, rotas: { "/inbox/video/init/": () => ok({ publish_id: "p9", upload_url: "https://up.tiktok/w" }), "up.tiktok/w": () => ({ status: 201 }), "/status/fetch/": () => ok({ status: "FAILED", fail_reason: "file_format_check_failed" }) } });
  await assert.rejects(tt.publicar({ item: { video: v, textos: {}, opcoes: {} }, ctx: b.ctx }), /file_format_check_failed/);
  rmSync(dir, { recursive: true, force: true });
});
test("upload: 5xx tenta de novo; 403 diz que o upload_url expirou", async () => {
  const dir = tmp(), v = arquivo(dir, 1 * MB);
  const base = { "tiktok/cliente": cliente, "tiktok/token": tokenOk() };
  let n = 0;
  const a = montar({ segredos: base, rotas: { "/inbox/video/init/": () => ok({ publish_id: "p", upload_url: "https://up.tiktok/r" }), "up.tiktok/r": () => ({ status: ++n < 3 ? 503 : 201 }), "/status/fetch/": () => ok({ status: "SEND_TO_USER_INBOX" }) } });
  assert.equal((await tt.publicar({ item: { video: v, textos: {}, opcoes: {} }, ctx: a.ctx })).status, "SEND_TO_USER_INBOX"); assert.equal(n, 3);
  const b = montar({ segredos: base, rotas: { "/inbox/video/init/": () => ok({ publish_id: "p", upload_url: "https://up.tiktok/e" }), "up.tiktok/e": () => ({ status: 403 }) } });
  await assert.rejects(tt.publicar({ item: { video: v, textos: {}, opcoes: {} }, ctx: b.ctx }), /expirou/);
  rmSync(dir, { recursive: true, force: true });
});
test("planejar resume modo, privacidade e partes; módulo cumpre o contrato do registro", async () => {
  const dir = tmp(), v = arquivo(dir, 30 * MB);
  const l = await tt.planejar({ item: { video: v, opcoes: { modo: "direto", privacidade: "PUBLIC_TO_EVERYONE" }, textos: {} } });
  assert.ok(l.some((x) => x.includes("SELF_ONLY") && x.includes("sem auditoria")));
  assert.ok(l.some((x) => /3 parte\(s\) de 10\.0 MB/.test(x)));
  assert.ok((await tt.planejar({ item: { video: v, opcoes: {}, textos: {} } }))[0].startsWith("modo: rascunho"));
  assert.equal(tt.nome, "tiktok"); assert.equal(tt.rede, "tiktok"); assert.equal(tt.imediato, false);
  for (const f of ["conectar", "status", "publicar", "planejar"]) assert.equal(typeof tt[f], "function");
  rmSync(dir, { recursive: true, force: true });
});

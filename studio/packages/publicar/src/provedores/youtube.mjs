// Provedor direto do YouTube (API de dados v3). Sobe o vídeo (upload resumable em blocos), define a miniatura com a capa
// e deixa o vídeo PRIVADO por padrão: o dono troca a capa/publica no Studio. Modos: privado | agendado | publico.
// Tudo que toca a rede, o navegador, o disco ou o relógio entra por `ctx` (ctx.fetchFn, ctx.deps.*), então dá para testar sem credencial.
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { closeSync, fstatSync, openSync, readSync, statSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";

export const nome = "youtube";
export const rede = "youtube";
export const imediato = true; // sobe assim que entra na fila (privado); a hora marcada só vale no modo "agendado"

export const REF_CLIENTE = "youtube/cliente";
export const REF_TOKEN = "youtube/token";
export const ESCOPOS = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube"];
const AUTH = "https://accounts.google.com/o/oauth2/v2/auth", TOKEN = "https://oauth2.googleapis.com/token", API = "https://www.googleapis.com/youtube/v3", UP = "https://www.googleapis.com/upload/youtube/v3";
export const BLOCO = 8 * 1024 * 1024; // múltiplo de 256 KiB, como o protocolo exige
export const LIMITE_MINIATURA = 2 * 1024 * 1024; // o Studio aceita até 2 MB; a API fala em 50 MB, mantemos o limite do Studio

const b64url = (b) => Buffer.from(b).toString("base64url");
const dormirPadrao = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME_IMG = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

/** Dependências com padrão real; ctx.deps sobrescreve (testes). */
function deps(ctx) {
  const d = ctx.deps || {};
  return {
    dormir: d.dormir || dormirPadrao,
    agora: d.agora || (() => Date.now()),
    abrirNavegador: d.abrirNavegador || ((url) => { try { spawn("open", [url], { stdio: "ignore", detached: true }).unref(); } catch { /* o usuário abre à mão */ } }),
    criarServidor: d.criarServidor || createServer,
    abrirArquivo: d.abrirArquivo || abrirArquivoReal,
    converterImagem: d.converterImagem || converterParaJpeg,
    aleatorio: d.aleatorio || ((n) => randomBytes(n)),
  };
}

/** Leitor de arquivo em blocos: { tamanho, ler(inicio, tamanho) → Buffer, fechar() }. */
function abrirArquivoReal(caminho) {
  const fd = openSync(caminho, "r"), tamanho = fstatSync(fd).size;
  return {
    tamanho,
    ler(inicio, n) { const buf = Buffer.alloc(Math.min(n, tamanho - inicio)); readSync(fd, buf, 0, buf.length, inicio); return buf; },
    fechar() { closeSync(fd); },
  };
}
function converterParaJpeg(entrada) {
  const saida = join(tmpdir(), `praeko-studio-miniatura-${Date.now()}.jpg`);
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", entrada, "-q:v", "3", saida], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg não conseguiu reduzir a miniatura");
  return saida;
}

// ---------- erros da API ----------
export function mensagemErro(status, corpo) {
  let j = null; try { j = JSON.parse(corpo); } catch { /* não é JSON */ }
  const e = j?.error, razao = e?.errors?.[0]?.reason || e?.status || "", msg = e?.message || String(corpo || "").slice(0, 200);
  if (/quotaExceeded|rateLimitExceeded|dailyLimitExceeded/i.test(razao) || /quota/i.test(msg)) return `cota da API do YouTube esgotada (${razao || status}): uploads custam 1 unidade e há um teto diário; tente depois da meia-noite do Pacífico`;
  if (/uploadLimitExceeded/i.test(razao)) return "o canal atingiu o limite de uploads do dia";
  if (/forbidden|insufficientPermissions/i.test(razao) || status === 403) return `YouTube negou (403 ${razao}): ${msg}. Confira os escopos (praeko studio conta youtube conectar) e se o canal está verificado para miniaturas`;
  if (status === 401) return "token recusado (401): rode `praeko studio conta youtube conectar` de novo";
  return `YouTube ${status} ${razao}: ${msg}`;
}
const falha = (status, corpo) => Object.assign(new Error(mensagemErro(status, corpo)), { status });

// ---------- OAuth ----------
function cliente(ctx, args = []) {
  const f = (k) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : undefined; };
  const id = f("cliente-id"), segredo = f("cliente-segredo");
  if (id && segredo) return { client_id: id, client_secret: segredo };
  const salvo = ctx.segredos.obter(REF_CLIENTE);
  if (salvo) { const j = JSON.parse(salvo); if (j.client_id && j.client_secret) return j; }
  throw new Error("sem credencial OAuth do Google: praeko studio conta youtube conectar --cliente-id <id> --cliente-segredo <segredo> (veja docs/postar-youtube.md)");
}

export const desafioPkce = (verificador) => createHash("sha256").update(verificador).digest("base64url");

/** Monta a URL de autorização (puro). */
export function urlAutorizacao({ clientId, redirect, desafio, estado }) {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: "code", scope: ESCOPOS.join(" "), code_challenge: desafio, code_challenge_method: "S256", state: estado, access_type: "offline", prompt: "consent" });
  return `${AUTH}?${q}`;
}

async function trocarCodigo(ctx, cl, { codigo, verificador, redirect }) {
  const r = await ctx.fetchFn(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: codigo, client_id: cl.client_id, client_secret: cl.client_secret, code_verifier: verificador, redirect_uri: redirect, grant_type: "authorization_code" }).toString() });
  const j = await r.json();
  if (!r.ok) throw new Error(`Google recusou o código: ${j.error_description || j.error}`);
  if (!j.refresh_token) throw new Error("o Google não devolveu refresh_token (revogue o acesso em myaccount.google.com/permissions e conecte de novo)");
  return j;
}

/** Autoriza uma vez: servidor loopback + PKCE. Guarda youtube/cliente e youtube/token. */
export async function conectar({ ctx, args = [] }) {
  const d = deps(ctx), cl = cliente(ctx, args);
  const verificador = b64url(d.aleatorio(48)), estado = b64url(d.aleatorio(16));
  let aguardo;
  const codigoP = new Promise((ok, no) => { aguardo = { ok, no }; });
  const srv = d.criarServidor((req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    if (u.pathname !== "/") { res.writeHead(404).end(); return; }
    const erro = u.searchParams.get("error"), codigo = u.searchParams.get("code");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<meta charset="utf-8"><body style="font-family:sans-serif"><h2>${erro || !codigo ? "Não deu certo" : "Pronto"}</h2><p>${erro || !codigo ? "Volte ao terminal." : "Pode fechar esta aba e voltar ao terminal."}</p>`);
    if (erro) aguardo.no(new Error(`autorização negada: ${erro}`));
    else if (u.searchParams.get("state") !== estado) aguardo.no(new Error("state não confere (tente de novo)"));
    else if (codigo) aguardo.ok(codigo);
  });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  const redirect = `http://127.0.0.1:${srv.address().port}`;
  const url = urlAutorizacao({ clientId: cl.client_id, redirect, desafio: desafioPkce(verificador), estado });
  ctx.log(`Abrindo o navegador para autorizar o Praeko Studio no YouTube.\nSe não abrir, copie este endereço:\n${url}`);
  d.abrirNavegador(url);
  const limite = setTimeout(() => aguardo.no(new Error("tempo esgotado (5 min) esperando a autorização")), d.limiteMs ?? 5 * 60e3);
  try {
    const codigo = await codigoP;
    const j = await trocarCodigo(ctx, cl, { codigo, verificador, redirect });
    ctx.segredos.guardar(REF_CLIENTE, JSON.stringify(cl));
    ctx.segredos.guardar(REF_TOKEN, JSON.stringify({ access_token: j.access_token, refresh_token: j.refresh_token, expiry: d.agora() + (j.expires_in || 3600) * 1000, escopos: (j.scope || ESCOPOS.join(" ")).split(" ") }));
  } finally { clearTimeout(limite); srv.close(); }
  const s = await status({ ctx });
  ctx.log(s.conectado ? `✓ YouTube conectado: ${s.detalhe}` : "⚠ autorizado, mas não consegui ler o canal");
  return s.conectado ? 0 : 1;
}

/** Access token válido (renova pelo refresh token quando faltar menos de 60 s). */
export async function tokenValido(ctx) {
  const d = deps(ctx), bruto = ctx.segredos.obter(REF_TOKEN);
  if (!bruto) throw new Error("YouTube não conectado: praeko studio conta youtube conectar");
  const t = JSON.parse(bruto);
  if (t.access_token && t.expiry - 60e3 > d.agora()) return t.access_token;
  const cl = cliente(ctx);
  const r = await ctx.fetchFn(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: cl.client_id, client_secret: cl.client_secret, refresh_token: t.refresh_token, grant_type: "refresh_token" }).toString() });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error === "invalid_grant" ? "o Google revogou o refresh token (app em modo Testing expira em 7 dias): rode `praeko studio conta youtube conectar` e publique o app como Em produção (docs/postar-youtube.md)" : `não consegui renovar o token: ${j.error_description || j.error}`);
  const novo = { ...t, access_token: j.access_token, expiry: d.agora() + (j.expires_in || 3600) * 1000, ...(j.refresh_token ? { refresh_token: j.refresh_token } : {}) };
  ctx.segredos.guardar(REF_TOKEN, JSON.stringify(novo));
  return novo.access_token;
}

async function api(ctx, url, opcoes = {}) {
  const token = await tokenValido(ctx);
  const r = await ctx.fetchFn(url, { ...opcoes, headers: { authorization: `Bearer ${token}`, ...(opcoes.headers || {}) } });
  return r;
}

export async function status({ ctx }) {
  if (!ctx.segredos.obter(REF_TOKEN)) return { conectado: false, detalhe: "rode: praeko studio conta youtube conectar --cliente-id … --cliente-segredo …" };
  try {
    const r = await api(ctx, `${API}/channels?part=snippet&mine=true`);
    const txt = await r.text();
    if (!r.ok) return { conectado: false, detalhe: mensagemErro(r.status, txt) };
    const c = JSON.parse(txt).items?.[0];
    return c ? { conectado: true, detalhe: c.snippet.title } : { conectado: false, detalhe: "a conta autorizada não tem canal do YouTube" };
  } catch (e) { return { conectado: false, detalhe: e.message }; }
}

// ---------- metadados e upload ----------
export function modoDe(item) { const m = item.opcoes?.modo || "privado"; if (!["privado", "agendado", "publico"].includes(m)) throw new Error(`modo do YouTube inválido: ${m} (use privado, agendado ou publico)`); return m; }

/** Corpo do videos.insert (puro). */
export function montarMetadados(item, agora = Date.now()) {
  const o = item.opcoes || {}, modo = modoDe(item);
  let titulo = item.textos?.titulo || item.titulo || item.slug;
  if (titulo.length > 100) titulo = titulo.slice(0, 99).trimEnd() + "…";
  const status = { privacyStatus: modo === "publico" ? "public" : "private", selfDeclaredMadeForKids: false, embeddable: true, publicStatsViewable: true };
  if (item.opcoes?.conteudoSintetico != null) status.containsSyntheticMedia = !!item.opcoes.conteudoSintetico; // declaração de conteúdo sintético (episódio.ia.sintetico)
  if (modo === "agendado") {
    const t = Date.parse(item.quando);
    if (!(t > agora + 60e3)) throw new Error(`modo agendado: ${item.quando} já passou ou é daqui a menos de 1 minuto`);
    status.publishAt = new Date(t).toISOString();
  }
  return {
    snippet: { title: titulo, description: item.textos?.texto || "", categoryId: String(o.categoriaId || "28"), defaultLanguage: "pt", defaultAudioLanguage: "pt", ...(o.tags ? { tags: o.tags } : {}) },
    status,
  };
}

async function esperar(ms, d) { await d.dormir(ms); }
const TENTATIVAS = 5;

/** Upload resumable em blocos. Devolve o recurso `video`. */
export async function enviarVideo({ ctx, arquivo, metadados, avisarInscritos = false }) {
  const d = deps(ctx), f = d.abrirArquivo(arquivo), total = f.tamanho;
  try {
    const q = new URLSearchParams({ uploadType: "resumable", part: "snippet,status", notifySubscribers: String(!!avisarInscritos) });
    const ini = await api(ctx, `${UP}/videos?${q}`, { method: "POST", headers: { "content-type": "application/json; charset=UTF-8", "x-upload-content-length": String(total), "x-upload-content-type": "video/mp4" }, body: JSON.stringify(metadados) });
    if (!ini.ok) throw falha(ini.status, await ini.text());
    const sessao = ini.headers.get("location");
    if (!sessao) throw new Error("o YouTube não devolveu o endereço da sessão de upload");
    let pos = 0, falhas = 0;
    while (pos < total) {
      const bloco = f.ler(pos, BLOCO), fim = pos + bloco.length - 1;
      let r;
      try { r = await ctx.fetchFn(sessao, { method: "PUT", headers: { "content-length": String(bloco.length), "content-range": `bytes ${pos}-${fim}/${total}`, "content-type": "video/mp4" }, body: bloco }); }
      catch (e) { r = { status: 0, erroRede: e }; }
      if (r.status === 200 || r.status === 201) { const v = await r.json(); return v; }
      if (r.status === 308) { const rg = r.headers.get("range"); pos = rg ? Number(rg.split("-")[1]) + 1 : 0; falhas = 0; continue; }
      if (r.status === 0 || [500, 502, 503, 504].includes(r.status)) {
        if (++falhas > TENTATIVAS) throw new Error(`upload interrompido depois de ${TENTATIVAS} tentativas (${r.erroRede?.message || r.status})`);
        await esperar(Math.min(30e3, 1000 * 2 ** falhas), d);
        // descobre até onde o servidor recebeu
        const c = await ctx.fetchFn(sessao, { method: "PUT", headers: { "content-length": "0", "content-range": `bytes */${total}` } }).catch(() => null);
        if (c && (c.status === 200 || c.status === 201)) return await c.json();
        if (c && c.status === 308) { const rg = c.headers.get("range"); pos = rg ? Number(rg.split("-")[1]) + 1 : 0; }
        continue;
      }
      throw falha(r.status, await r.text());
    }
    throw new Error("o upload terminou sem resposta do YouTube");
  } finally { f.fechar?.(); }
}

/** Espera o processamento antes da miniatura (a doc pede isso para Shorts). Devolve true se terminou. */
async function esperarProcessamento(ctx, id, d, tentativas = 12) {
  for (let i = 0; i < tentativas; i++) {
    const r = await api(ctx, `${API}/videos?part=processingDetails&id=${id}`);
    if (r.ok) { const s = (await r.json()).items?.[0]?.processingDetails?.processingStatus; if (s === "succeeded") return true; if (s === "failed" || s === "terminated") return false; }
    await d.dormir(10e3);
  }
  return false;
}

async function definirMiniatura(ctx, id, capa, d) {
  let arq = capa, f = d.abrirArquivo(arq);
  if (f.tamanho > LIMITE_MINIATURA) { f.fechar?.(); arq = d.converterImagem(arq); f = d.abrirArquivo(arq); }
  try {
    const corpo = f.ler(0, f.tamanho), mime = MIME_IMG[extname(arq).toLowerCase()] || "image/jpeg";
    const r = await api(ctx, `${UP}/thumbnails/set?videoId=${id}`, { method: "POST", headers: { "content-type": mime, "content-length": String(corpo.length) }, body: corpo });
    if (!r.ok) throw falha(r.status, await r.text());
    return true;
  } finally { f.fechar?.(); }
}

export async function planejar({ item }) {
  const modo = modoDe(item), m = montarMetadados(item, Date.now());
  let tam = "?";
  try { tam = (statSync(item.video).size / 1048576).toFixed(1) + " MB"; } catch { /* arquivo some em teste */ }
  return [
    `título: ${m.snippet.title}`,
    `modo: ${modo} → privacidade ${m.status.privacyStatus}${m.status.publishAt ? ` (publica sozinho em ${m.status.publishAt})` : modo === "privado" ? " (você troca a capa e publica no Studio)" : ""}`,
    `arquivo: ${tam}; capa: ${item.capa ? item.capa.split("/").pop() + " (thumbnails.set)" : "nenhuma"}`,
  ];
}

export async function publicar({ item, ctx }) {
  const d = deps(ctx), avisos = [];
  const metadados = montarMetadados(item, d.agora());
  ctx.log(`  YouTube: enviando ${item.video.split("/").pop()} (${metadados.status.privacyStatus})…`);
  const v = await enviarVideo({ ctx, arquivo: item.video, metadados, avisarInscritos: item.opcoes?.avisarInscritos });
  const id = v.id;
  let miniatura = false;
  if (item.capa) {
    try {
      const pronto = await esperarProcessamento(ctx, id, d);
      if (!pronto) avisos.push("o vídeo ainda estava processando; a miniatura pode não ter pegado");
      miniatura = await definirMiniatura(ctx, id, item.capa, d);
    } catch (e) { avisos.push(`miniatura não definida (${e.message}); troque no Studio`); }
  }
  if (item.opcoes?.comentar) avisos.push("comentário fixo não suportado pela API (não dá para fixar; comente pelo app)");
  for (const a of avisos) ctx.log(`  ⚠ ${a}`);
  return { id, url: `https://youtu.be/${id}`, studio: `https://studio.youtube.com/video/${id}/edit`, privacidade: metadados.status.privacyStatus, publishAt: metadados.status.publishAt, miniatura, avisos };
}

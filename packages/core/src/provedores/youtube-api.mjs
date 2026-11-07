// Provedor do YouTube (API de dados v3), versão SEM Node: só fetch, WebCrypto e o que entra por `ctx`.
// Roda igual no Node (youtube.mjs acrescenta o OAuth loopback, o disco e o ffmpeg) e dentro de um Worker (o servidor).
// Tudo que toca o mundo entra por `ctx`:
//   ctx.fetchFn                     fetch
//   ctx.segredos.obter/guardar      sync ou async (Chaveiro no Node, D1 cifrado no servidor)
//   ctx.midia.abrir(ref)            → { tamanho, mime?, ler(inicio, n) → bytes } (sync ou async; disco no Node, R2 no servidor)
//   ctx.deps.{agora,dormir,abrirArquivo,converterImagem}   dublês de teste / extras do Node
export const nome = "youtube";
export const rede = "youtube";
export const imediato = true; // sobe assim que entra na fila (privado); a hora marcada só vale no modo "agendado"

export const REF_CLIENTE = "youtube/cliente";
export const REF_TOKEN = "youtube/token";
export const ESCOPOS_BASE = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.force-ssl"]; // o que um token antigo (conectado antes da retenção) tem; não é mais o pedido padrão
export const ESCOPO_ANALYTICS = "https://www.googleapis.com/auth/yt-analytics.readonly"; // não sensível (Console do Google Cloud, "Escopos não confidenciais"): vai na conexão normal
export const ESCOPOS = [...ESCOPOS_BASE, ESCOPO_ANALYTICS]; // upload envia; force-ssl cobre editar, capa, estatísticas e comentários; yt-analytics.readonly, retenção/impressões/CTR (o escopo amplo "youtube" saiu). A tela de consentimento deixa desmarcar: vale o `scope` devolvido
export const AUTH = "https://accounts.google.com/o/oauth2/v2/auth", TOKEN = "https://oauth2.googleapis.com/token", REVOGAR = "https://oauth2.googleapis.com/revoke", API = "https://www.googleapis.com/youtube/v3", UP = "https://www.googleapis.com/upload/youtube/v3";
export const BLOCO = 8 * 1024 * 1024; // múltiplo de 256 KiB, como o protocolo exige
export const LIMITE_MINIATURA = 2 * 1024 * 1024; // o Studio aceita até 2 MB; a API fala em 50 MB, mantemos o limite do Studio
const TENTATIVAS = 5;

// ---------- utilidades sem Node ----------
export const b64url = (bytes) => { const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); let s = ""; for (const b of u) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
export const aleatorioPadrao = (n) => crypto.getRandomValues(new Uint8Array(n));
/** Desafio PKCE S256 (assíncrono: WebCrypto). */
export async function desafioPkceAsync(verificador) { return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verificador))); }
const dormirPadrao = (ms) => new Promise((r) => setTimeout(r, ms));
const bytesDe = (x) => (x instanceof Uint8Array ? x : new Uint8Array(x));

/** Dependências com padrão neutro; ctx.deps sobrescreve (testes, Node). */
export function deps(ctx) {
  const d = ctx.deps || {};
  return {
    ...d,
    dormir: d.dormir || dormirPadrao,
    agora: d.agora || (() => Date.now()),
    aleatorio: d.aleatorio || aleatorioPadrao,
    abrirArquivo: d.abrirArquivo || (ctx.midia ? (ref) => ctx.midia.abrir(ref) : () => { throw new Error("sem acesso a arquivo: o contexto precisa de ctx.midia.abrir (ou ctx.deps.abrirArquivo)"); }),
    converterImagem: d.converterImagem || (() => { throw new Error("a capa passa de 2 MB e não há conversão neste ambiente; envie a capa já em JPEG/PNG menor"); }),
  };
}

// ---------- erros da API ----------
export function mensagemErro(status, corpo) {
  let j = null; try { j = JSON.parse(corpo); } catch { /* não é JSON */ }
  const e = j?.error, razao = e?.errors?.[0]?.reason || e?.status || "", msg = e?.message || String(corpo || "").slice(0, 200);
  if (/quotaExceeded|rateLimitExceeded|dailyLimitExceeded/i.test(razao) || /quota/i.test(msg)) return `cota da API do YouTube esgotada (${razao || status}): uploads custam 1 unidade e há um teto diário; tente depois da meia-noite do Pacífico`;
  if (/uploadLimitExceeded/i.test(razao)) return "o canal atingiu o limite de uploads do dia";
  if (/forbidden|insufficientPermissions/i.test(razao) || status === 403) return `YouTube negou (403 ${razao}): ${msg}. Confira os escopos (praeko conta youtube conectar) e se o canal está verificado para miniaturas`;
  if (status === 401) return "token recusado (401): rode `praeko conta youtube conectar` de novo";
  return `YouTube ${status} ${razao}: ${msg}`;
}
export const falha = (status, corpo) => Object.assign(new Error(mensagemErro(status, corpo)), { status });

// ---------- OAuth (sem o fluxo interativo, que é do Node ou das rotas do servidor) ----------
/** Credencial do app OAuth: argumentos de linha de comando, ou o que estiver em ctx.segredos (`youtube/cliente`). */
export async function cliente(ctx, args = []) {
  const f = (k) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : undefined; };
  const id = f("cliente-id"), segredo = f("cliente-segredo");
  if (id && segredo) return { client_id: id, client_secret: segredo };
  const salvo = await ctx.segredos.obter(REF_CLIENTE);
  if (salvo) { const j = JSON.parse(salvo); if (j.client_id && j.client_secret) return j; }
  throw new Error("sem credencial OAuth do Google: praeko conta youtube conectar --cliente-id <id> --cliente-segredo <segredo> (veja docs/youtube.md)");
}

/** Monta a URL de autorização (puro). */
export function urlAutorizacao({ clientId, redirect, desafio, estado }) {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: "code", scope: ESCOPOS.join(" "), code_challenge: desafio, code_challenge_method: "S256", state: estado, access_type: "offline", prompt: "consent" }); // sem include_granted_scopes: ele juntaria ao pedido o que a conta já concedeu (ex.: o escopo amplo "youtube" de antes), que o Google não verificou e faz aparecer o aviso "app não verificado"
  return `${AUTH}?${q}`;
}

export async function trocarCodigo(ctx, cl, { codigo, verificador, redirect }) {
  const r = await ctx.fetchFn(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: codigo, client_id: cl.client_id, client_secret: cl.client_secret, code_verifier: verificador, redirect_uri: redirect, grant_type: "authorization_code" }).toString() });
  const j = await r.json();
  if (!r.ok) throw new Error(`Google recusou o código: ${j.error_description || j.error}`);
  if (!j.refresh_token) throw new Error("o Google não devolveu refresh_token (revogue o acesso em myaccount.google.com/permissions e conecte de novo)");
  return j;
}

/** O registro do token como o provedor o guarda (JSON em texto). */
export function registroToken(j, agora) {
  return JSON.stringify({ access_token: j.access_token, refresh_token: j.refresh_token, expiry: agora + (j.expires_in || 3600) * 1000, escopos: (j.scope || ESCOPOS_BASE.join(" ")).split(" ") });
}

/** Access token válido (renova pelo refresh token quando faltar menos de 60 s). */
export async function tokenValido(ctx) {
  const d = deps(ctx), bruto = await ctx.segredos.obter(REF_TOKEN);
  if (!bruto) throw new Error("YouTube não conectado: praeko conta youtube conectar");
  const t = JSON.parse(bruto);
  if (t.access_token && t.expiry - 60e3 > d.agora()) return t.access_token;
  const cl = await cliente(ctx);
  const r = await ctx.fetchFn(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: cl.client_id, client_secret: cl.client_secret, refresh_token: t.refresh_token, grant_type: "refresh_token" }).toString() });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error === "invalid_grant" ? "o Google revogou o refresh token (app em modo Testing expira em 7 dias): rode `praeko conta youtube conectar` e publique o app como Em produção (docs/youtube.md)" : `não consegui renovar o token: ${j.error_description || j.error}`);
  const novo = { ...t, access_token: j.access_token, expiry: d.agora() + (j.expires_in || 3600) * 1000, ...(j.refresh_token ? { refresh_token: j.refresh_token } : {}) };
  await ctx.segredos.guardar(REF_TOKEN, JSON.stringify(novo));
  return novo.access_token;
}

/** Revoga o acesso no Google (melhor esforço: nunca lança; quem chama apaga o registro de qualquer jeito). `true` só se o Google confirmou. */
export async function revogar(ctx) {
  try {
    const bruto = await ctx.segredos.obter(REF_TOKEN);
    if (!bruto) return false;
    const t = JSON.parse(bruto), token = t.refresh_token || t.access_token;
    if (!token) return false;
    const r = await ctx.fetchFn(REVOGAR, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }).toString() });
    return r.ok;
  } catch { return false; }
}

export async function api(ctx, url, opcoes = {}) {
  const token = await tokenValido(ctx);
  return ctx.fetchFn(url, { ...opcoes, headers: { authorization: `Bearer ${token}`, ...(opcoes.headers || {}) } });
}

export async function status({ ctx }) {
  if (!(await ctx.segredos.obter(REF_TOKEN))) return { conectado: false, detalhe: "rode: praeko conta youtube conectar --cliente-id … --cliente-segredo …" };
  try {
    const r = await api(ctx, `${API}/channels?part=snippet&mine=true`);
    const txt = await r.text();
    if (!r.ok) return { conectado: false, detalhe: mensagemErro(r.status, txt) };
    const c = JSON.parse(txt).items?.[0];
    return c ? { conectado: true, detalhe: c.snippet.title, ...(c.id ? { canalId: c.id } : {}) } : { conectado: false, detalhe: "a conta autorizada não tem canal do YouTube" };
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

const dormir = (ms, d) => d.dormir(ms);
const lerRange = (rg) => (rg ? Number(rg.split("-")[1]) + 1 : 0);

/** Abre a sessão de upload resumable. Devolve { sessao, total }. */
export async function iniciarUpload({ ctx, total, metadados, avisarInscritos = false }) {
  const q = new URLSearchParams({ uploadType: "resumable", part: "snippet,status", notifySubscribers: String(!!avisarInscritos) });
  const ini = await api(ctx, `${UP}/videos?${q}`, { method: "POST", headers: { "content-type": "application/json; charset=UTF-8", "x-upload-content-length": String(total), "x-upload-content-type": "video/mp4" }, body: JSON.stringify(metadados) });
  if (!ini.ok) throw falha(ini.status, await ini.text());
  const sessao = ini.headers.get("location");
  if (!sessao) throw new Error("o YouTube não devolveu o endereço da sessão de upload");
  return { sessao, total };
}

/** Pergunta ao YouTube até onde ele recebeu. { fim: true, video } | { fim: false, pos }. Idempotente. */
export async function sincronizarUpload({ ctx, sessao, total }) {
  const r = await ctx.fetchFn(sessao, { method: "PUT", headers: { "content-length": "0", "content-range": `bytes */${total}` } });
  if (r.status === 200 || r.status === 201) return { fim: true, video: await r.json() };
  if (r.status === 308) return { fim: false, pos: lerRange(r.headers.get("range")) };
  if (r.status === 404) throw Object.assign(new Error("a sessão de upload expirou (404): refaça o upload"), { sessaoExpirada: true });
  throw Object.assign(falha(r.status, await r.text()), { transitorio: r.status >= 500 });
}

/**
 * Envia UM bloco a partir de `pos` (idempotente: confere o que o YouTube já tem antes). Devolve { fim, video?, pos }.
 * `f` é o leitor da mídia ({ tamanho, ler }). Erros 5xx e de rede viram `err.transitorio = true` (o chamador tenta de novo).
 */
export async function enviarBloco({ ctx, f, sessao, total, pos, sincronizar = true }) {
  if (sincronizar) { const s = await sincronizarUpload({ ctx, sessao, total }); if (s.fim) return s; pos = s.pos; }
  if (pos >= total) return { fim: false, pos };
  const bloco = bytesDe(await f.ler(pos, BLOCO)), fim = pos + bloco.length - 1;
  let r;
  try { r = await ctx.fetchFn(sessao, { method: "PUT", headers: { "content-length": String(bloco.length), "content-range": `bytes ${pos}-${fim}/${total}`, "content-type": "video/mp4" }, body: bloco }); }
  catch (e) { throw Object.assign(new Error(`falha de rede no upload: ${e.message}`), { transitorio: true }); }
  if (r.status === 200 || r.status === 201) return { fim: true, video: await r.json() };
  if (r.status === 308) return { fim: false, pos: lerRange(r.headers.get("range")) };
  if ([500, 502, 503, 504].includes(r.status)) throw Object.assign(new Error(`YouTube ${r.status} no upload`), { transitorio: true });
  throw falha(r.status, await r.text());
}

/** Upload resumable completo em blocos, com retomada. Devolve o recurso `video`. */
export async function enviarVideo({ ctx, arquivo, metadados, avisarInscritos = false }) {
  const d = deps(ctx), f = await d.abrirArquivo(arquivo), total = f.tamanho;
  try {
    const { sessao } = await iniciarUpload({ ctx, total, metadados, avisarInscritos });
    let pos = 0, falhas = 0;
    while (pos < total) {
      try {
        const r = await enviarBloco({ ctx, f, sessao, total, pos, sincronizar: false });
        if (r.fim) return r.video;
        pos = r.pos; falhas = 0;
      } catch (e) {
        if (!e.transitorio) throw e;
        if (++falhas > TENTATIVAS) throw new Error(`upload interrompido depois de ${TENTATIVAS} tentativas (${e.message})`);
        await dormir(Math.min(30e3, 1000 * 2 ** falhas), d);
        const s = await sincronizarUpload({ ctx, sessao, total }).catch(() => null); // descobre até onde o servidor recebeu
        if (s?.fim) return s.video;
        if (s) pos = s.pos;
      }
    }
    throw new Error("o upload terminou sem resposta do YouTube");
  } finally { f.fechar?.(); }
}

/** Espera o processamento antes da miniatura (a doc pede isso para Shorts). Devolve true se terminou. */
export async function esperarProcessamento(ctx, id, d = deps(ctx), tentativas = 12) {
  for (let i = 0; i < tentativas; i++) {
    const r = await api(ctx, `${API}/videos?part=processingDetails&id=${id}`);
    if (r.ok) { const s = (await r.json()).items?.[0]?.processingDetails?.processingStatus; if (s === "succeeded") return true; if (s === "failed" || s === "terminated") return false; }
    await d.dormir(10e3);
  }
  return false;
}

const sniffMime = (b) => (b[0] === 0x89 && b[1] === 0x50 ? "image/png" : b[0] === 0xff && b[1] === 0xd8 ? "image/jpeg" : null);
const MIME_EXT = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };

export async function definirMiniatura(ctx, id, capa, d = deps(ctx)) {
  let arq = capa, f = await d.abrirArquivo(arq);
  if (f.tamanho > LIMITE_MINIATURA) { f.fechar?.(); arq = await d.converterImagem(arq); f = await d.abrirArquivo(arq); }
  try {
    const corpo = bytesDe(await f.ler(0, f.tamanho));
    const ext = /\.([a-z0-9]+)$/i.exec(String(arq))?.[1]?.toLowerCase();
    const mime = f.mime || MIME_EXT[ext] || sniffMime(corpo) || "image/jpeg";
    const r = await api(ctx, `${UP}/thumbnails/set?videoId=${id}`, { method: "POST", headers: { "content-type": mime, "content-length": String(corpo.length) }, body: corpo });
    if (!r.ok) throw falha(r.status, await r.text());
    return true;
  } finally { f.fechar?.(); }
}

/** Ações que dependem do vídeo estar público: o comentário fixo. Modo agendado: 2 min depois do publishAt; publico: 1 min depois do upload; privado: manual. */
export function acoesSeguintes(item, id, metadados, d) {
  const texto = item.textos?.comentarioFixo;
  if (!texto || item.opcoes?.comentar === false) return [];
  const base = { slug: item.slug, rede: "youtube", provedor: "youtube", acao: "comentar", videoId: id, textos: { comentarioFixo: texto }, opcoes: {}, video: item.video, pedido: item.pedido };
  const modo = modoDe(item);
  if (modo === "agendado") return [{ ...base, quando: new Date(Date.parse(metadados.status.publishAt) + 2 * 60e3).toISOString() }];
  if (modo === "publico") return [{ ...base, quando: new Date(d.agora() + 60e3).toISOString() }];
  return [{ ...base, quando: null, manual: true }];
}

/** O que acontece depois de o vídeo existir: miniatura, links e ações seguintes. Compartilhado por publicar() e pelo Workflow. */
export async function finalizarPublicacao({ item, ctx, video, metadados }) {
  const d = deps(ctx), avisos = [], id = video.id;
  let miniatura = false;
  if (item.capa) {
    try {
      const pronto = await esperarProcessamento(ctx, id, d);
      if (!pronto) avisos.push("o vídeo ainda estava processando; a miniatura pode não ter pegado");
      miniatura = await definirMiniatura(ctx, id, item.capa, d);
    } catch (e) { avisos.push(`miniatura não definida (${e.message}); troque no Studio`); }
  }
  for (const a of avisos) ctx.log?.(`  ⚠ ${a}`);
  const seguinte = acoesSeguintes(item, id, metadados, d);
  if (seguinte.length && seguinte[0].manual) ctx.log?.("  ℹ comentário fixo guardado: depois de publicar no Studio, rode `praeko fila comentar <id>` (a API não comenta em vídeo privado de forma garantida e não fixa comentário)");
  return { id, url: `https://youtu.be/${id}`, studio: `https://studio.youtube.com/video/${id}/edit`, privacidade: metadados.status.privacyStatus, publishAt: metadados.status.publishAt, miniatura, avisos, seguinte };
}

export async function publicar({ item, ctx }) {
  if (item.acao === "comentar") return comentar({ item, ctx });
  if (item.acao === "agendar") return agendarPublicacao({ item, ctx });
  const d = deps(ctx);
  const metadados = montarMetadados(item, d.agora());
  ctx.log?.(`  YouTube: enviando ${String(item.video).split("/").pop()} (${metadados.status.privacyStatus})…`);
  const video = await enviarVideo({ ctx, arquivo: item.video, metadados, avisarInscritos: item.opcoes?.avisarInscritos });
  return finalizarPublicacao({ item, ctx, video, metadados });
}

/** Comentário (não fixa: a API não permite). Escopo youtube.force-ssl; custa 50 unidades de cota. */
export async function comentar({ item, ctx }) {
  const canal = (await ctx.segredos.obter(REF_TOKEN)) && (await canalId(ctx));
  const corpo = { snippet: { channelId: canal, videoId: item.videoId, topLevelComment: { snippet: { textOriginal: item.textos.comentarioFixo } } } };
  const r = await api(ctx, `${API}/commentThreads?part=snippet`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
  const txt = await r.text();
  if (!r.ok) throw new Error(mensagemErro(r.status, txt) + " (comentário: o vídeo precisa estar publicado e o token com o escopo youtube.force-ssl; reconecte com `praeko conta youtube conectar`)");
  const id = JSON.parse(txt).id;
  return { id, comentario: true, url: `https://youtu.be/${item.videoId}?lc=${id}`, lembrete: "a API não fixa comentário: fixe pelo app" };
}
export async function canalId(ctx) {
  const r = await api(ctx, `${API}/channels?part=id&mine=true`);
  if (!r.ok) throw falha(r.status, await r.text());
  const c = (await r.json()).items?.[0];
  if (!c) throw new Error("a conta autorizada não tem canal do YouTube");
  return c.id;
}

/** Linhas de resumo (sem tocar em disco: o Node acrescenta o tamanho do arquivo). */
export async function planejar({ item }) {
  if (item.acao === "comentar") return [`comentário no vídeo ${item.videoId}`];
  const modo = modoDe(item), m = montarMetadados(item, Date.now());
  return [
    `título: ${m.snippet.title}`,
    `modo: ${modo} → privacidade ${m.status.privacyStatus}${m.status.publishAt ? ` (publica sozinho em ${m.status.publishAt})` : modo === "privado" ? " (você troca a capa e publica no Studio)" : ""}`,
    `arquivo: ${item.tamanhoTexto || "?"}; capa: ${item.capa ? String(item.capa).split("/").pop() + " (thumbnails.set)" : "nenhuma"}`,
  ];
}

/** Agenda a publicação de um vídeo que já está no YouTube (privado): `status.publishAt`. Preserva o resto do status. */
export async function agendarPublicacao({ item, ctx, agora = Date.now() }) {
  const quando = new Date(item.quando);
  if (Number.isNaN(quando.getTime())) throw new Error(`horário inválido: ${item.quando}`);
  if (quando.getTime() < agora + 5 * 60e3) throw new Error("o horário precisa ser daqui a pelo menos 5 minutos");
  const r0 = await api(ctx, `${API}/videos?part=status&id=${encodeURIComponent(item.videoId)}`);
  if (!r0.ok) throw falha(r0.status, await r0.text());
  const v = (await r0.json()).items?.[0];
  if (!v) throw new Error(`o vídeo ${item.videoId} não existe neste canal`);
  const st = v.status || {};
  const status = { privacyStatus: "private", publishAt: quando.toISOString(), embeddable: st.embeddable ?? true, license: st.license || "youtube", publicStatsViewable: st.publicStatsViewable ?? true, selfDeclaredMadeForKids: st.selfDeclaredMadeForKids ?? false };
  const r = await api(ctx, `${API}/videos?part=status`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.videoId, status }) });
  if (!r.ok) throw falha(r.status, await r.text());
  return { id: item.videoId, publishAt: status.publishAt, privacidade: "private", url: `https://youtu.be/${item.videoId}` };
}

// Provedor do Bluesky (atproto), versão SEM Node: fetch, WebCrypto e o que entra por `ctx` (mesmo molde do youtube-api.ts).
//   ctx.fetchFn                       fetch
//   ctx.segredos.obter/guardar        `bluesky/sessao` (JSON: tokens, chave DPoP, nonces, PDS, servidor) e `bluesky/cliente` ({clientId, jwk}: secret BLUESKY_CLIENT_JWK)
//   ctx.midia.abrir(ref)              { tamanho, mime, ler(inicio, n) }
//   ctx.deps.bskyTrava                { adquirir(): Promise<boolean>, liberar(): Promise<void> }  trava entre instâncias (D1) para o refresh de uso único
//   ctx.deps.bskyReconectar(motivo)   chamado quando a sessão não renova (invalid_grant): o servidor marca o canal e avisa o dono
//   ctx.deps.{agora,dormir}           dublês de teste
// Erros: todo erro vira Error com `status` (HTTP a devolver) e `codigo` estável (bluesky_*). Nunca um 500 genérico.
import { fetchDpop, renovarTokens, revogarToken, urlPermitida, type Nonces, type Servidor } from "./bluesky-oauth.ts";
export const nome = "bluesky";
export const rede = "bluesky";
export const imediato = true; // sem horário ("Agora" no compositor) publica já; com `quando` o Praeko espera a hora marcada. `createdAt` é o instante real do envio

export const REF_SESSAO = "bluesky/sessao", REF_CLIENTE = "bluesky/cliente";
export const LIMITES = { graphemes: 300, bytes: 3000, imagens: 4, bytesImagem: 2_000_000, bytesVideo: 300_000_000, idiomas: 3 } as const;
export const VIDEO = "https://video.bsky.app", VIDEO_DID_AUD_NOTA = "aud do service auth do vídeo: ver obterAuthServico (NÃO documentado na fonte oficial lida)";
const PASSOS_VIDEO = { esperaMs: 3000, tentativas: 60 };

export const falha = (status: number, codigo: string, mensagem: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(mensagem), { status, codigo, ...extra });
const dormirPadrao = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const deps = (ctx: any) => ({ ...(ctx.deps || {}), dormir: ctx.deps?.dormir || dormirPadrao, agora: ctx.deps?.agora || (() => Date.now()) });

// ---------- texto: limites e facets ----------
const enc = new TextEncoder();
export const bytesUtf8 = (s: string) => enc.encode(s).length;
export function graphemes(s: string): number {
  const Seg = (Intl as any).Segmenter;
  if (!Seg) return Array.from(s).length;
  let n = 0; for (const _ of new Seg("und", { granularity: "grapheme" }).segment(s)) n++; return n;
}
/** Problemas do texto contra os limites do lexicon app.bsky.feed.post (300 graphemes e 3000 bytes). */
export function problemasTexto(texto: string): { codigo: string; mensagem: string }[] {
  const p: { codigo: string; mensagem: string }[] = [];
  const g = graphemes(texto), b = bytesUtf8(texto);
  if (g > LIMITES.graphemes) p.push({ codigo: "bluesky_text_too_long", mensagem: `o texto do Bluesky passa de ${LIMITES.graphemes} caracteres (${g})` });
  else if (b > LIMITES.bytes) p.push({ codigo: "bluesky_text_too_long", mensagem: `o texto do Bluesky passa de ${LIMITES.bytes} bytes (${b})` });
  return p;
}
const PONTA = /[\p{P}]+$/u;
/** Facets automáticos (URLs https e hashtags), com byteStart/byteEnd em bytes UTF-8 do texto final. Menções ficam para depois. */
export function montarFacets(texto: string): any[] {
  const facets: any[] = [], pos = (i: number) => bytesUtf8(texto.slice(0, i));
  for (const m of texto.matchAll(/https?:\/\/[^\s]+/gi)) {
    let url = m[0]; url = url.replace(/[.,;:!?'"”’)\]}>]+$/, ""); // pontuação final não faz parte do link
    if (url.length < 9) continue;
    try { new URL(url); } catch { continue; }
    facets.push({ index: { byteStart: pos(m.index!), byteEnd: pos(m.index! + url.length) }, features: [{ $type: "app.bsky.richtext.facet#link", uri: url }] });
  }
  for (const m of texto.matchAll(/(^|\s)[#＃]([^\s]+)/gu)) {
    let tag = m[2]!.replace(PONTA, "");
    if (!tag || /^\d+$/.test(tag) || tag.length > 64) continue;
    const ini = m.index! + m[1]!.length;
    facets.push({ index: { byteStart: pos(ini), byteEnd: pos(ini + 1 + tag.length) }, features: [{ $type: "app.bsky.richtext.facet#tag", tag }] });
  }
  return facets.sort((a, b) => a.index.byteStart - b.index.byteStart);
}

// ---------- erros do Bluesky/PDS ----------
/** Erro HTTP do PDS/Bluesky -> erro tipado (status e código estáveis). */
export function erroDaApi(status: number, corpo: string, headers?: Headers | null) {
  let j: any = null; try { j = JSON.parse(corpo); } catch { /* não é JSON */ }
  const nome = String(j?.error || ""), msg = String(j?.message || j?.error_description || corpo || "").slice(0, 200);
  if (status === 429) { const ra = Number(headers?.get("retry-after")); return falha(429, "bluesky_rate_limited", `o Bluesky limitou o uso (429); tente de novo${ra > 0 ? ` em ${ra} s` : " mais tarde"}`, { retryAfter: ra > 0 ? ra : null }); }
  if (status === 401 || nome === "invalid_token" || nome === "ExpiredToken" || nome === "InvalidToken") return falha(401, "bluesky_reconnect_required", "o Bluesky recusou a sessão (401): reconecte a conta em Canais");
  if (status === 413) return falha(413, "bluesky_payload_too_large", `o Bluesky recusou o tamanho do envio (413): ${msg}`);
  if (status === 400 || status === 422) return falha(422, "bluesky_invalid_request", `o Bluesky recusou o pedido (${nome || status}): ${msg}`, { atproto: nome || null });
  if (status === 403) return falha(403, "bluesky_forbidden", `o Bluesky negou (403 ${nome}): ${msg}`);
  if (status === 404) return falha(404, "bluesky_not_found", `o Bluesky não achou o recurso (404 ${nome}): ${msg}`);
  return falha(502, "bluesky_error", `Bluesky ${status}${nome ? ` ${nome}` : ""}: ${msg}`, { transitorio: status >= 500 });
}

// ---------- sessão ----------
export type Sessao = { did: string; handle: string | null; pds: string; servidor: Servidor; accessToken: string; refreshToken: string; expiry: number; scope: string; dpopJwk: any; nonces: Nonces; avatar?: string | null };
export const registroSessao = (s: Sessao) => JSON.stringify(s);
async function lerSessao(ctx: any): Promise<Sessao> {
  const bruto = await ctx.segredos.obter(REF_SESSAO);
  if (!bruto) throw falha(401, "bluesky_reconnect_required", "Bluesky não conectado: conecte a conta em Canais");
  return JSON.parse(bruto);
}
async function clienteOauth(ctx: any): Promise<{ clientId: string; jwk: any }> {
  const bruto = await ctx.segredos.obter(REF_CLIENTE);
  if (!bruto) throw falha(409, "bluesky_not_configured", "defina o secret BLUESKY_CLIENT_JWK do Worker (scripts/bluesky-gerar-chave.mjs)");
  return JSON.parse(bruto);
}
const fresca = (s: Sessao, d: any) => !!s.accessToken && s.expiry - 60e3 > d.agora();
const EM_VOO = new Map<string, Promise<Sessao>>();
/** Nonce DPoP mais recente por (instância, servidor) dentro desta execução: evita repetir o `use_dpop_nonce` a cada chamada. Persistido junto da sessão quando ela é regravada (refresh). */
const NONCES = new Map<string, Nonces>();
const noncesDe = (ctx: any, s: Sessao): Nonces => { const k = `${ctx.deps?.bskyChave || ""}|${s.did}`; let n = NONCES.get(k); if (!n) NONCES.set(k, (n = { ...(s.nonces || {}) })); s.nonces = n; return n; };

/**
 * Renovação SERIALIZADA (o refresh token é de uso único). Dentro da instância, quem chega junto espera a mesma promessa; entre instâncias vale a trava do D1 (`ctx.deps.bskyTrava`).
 * Depois de obter o novo token, o registro é gravado ANTES de qualquer uso do access token novo. `recusado` = access token que o PDS acabou de recusar (força a renovação).
 */
async function renovar(ctx: any, d: any, recusado: string | null): Promise<Sessao> {
  const chave = String(ctx.deps?.bskyChave || (await lerSessao(ctx)).did);
  const emVoo = EM_VOO.get(chave);
  if (emVoo) return emVoo;
  const p = (async () => {
    const trava = ctx.deps?.bskyTrava;
    let tenho = false;
    try {
      if (trava) for (let i = 0; i < 40; i++) {
        if (await trava.adquirir()) { tenho = true; break; }
        await d.dormir(250);
        const outra = await lerSessao(ctx); if (fresca(outra, d) && outra.accessToken !== recusado) return outra; // outra instância já renovou
      }
      const atual = await lerSessao(ctx);
      if (fresca(atual, d) && atual.accessToken !== recusado) return atual; // alguém renovou entre a leitura e a trava
      const cliente = await clienteOauth(ctx);
      try {
        const t = await renovarTokens(ctx.fetchFn, { cliente, servidor: atual.servidor, dpopJwk: atual.dpopJwk, nonces: noncesDe(ctx, atual), refreshToken: atual.refreshToken, did: atual.did, agora: d.agora });
        const nova: Sessao = { ...atual, nonces: { ...atual.nonces }, accessToken: t.accessToken, refreshToken: t.refreshToken, expiry: t.expiry, scope: t.scope };
        await ctx.segredos.guardar(REF_SESSAO, registroSessao(nova)); // o refresh novo é gravado ANTES de usar o access novo
        return nova;
      } catch (e) {
        if (e?.codigo === "bluesky_invalid_grant") { try { await d.bskyReconectar?.("invalid_grant"); } catch { /* o aviso nunca atrapalha */ } throw falha(401, "bluesky_reconnect_required", "o Bluesky não renovou a sessão (invalid_grant): reconecte a conta em Canais"); }
        if (e?.codigo === "bluesky_sub_mismatch") throw falha(401, "bluesky_reconnect_required", e.message);
        throw falha(e?.status === 429 ? 429 : 502, e?.status === 429 ? "bluesky_rate_limited" : "bluesky_error", `não consegui renovar a sessão do Bluesky: ${String(e?.message || e).slice(0, 160)}`, { transitorio: true });
      }
    } finally { if (tenho) { try { await trava.liberar(); } catch { /* a trava expira sozinha */ } } }
  })().finally(() => EM_VOO.delete(chave));
  EM_VOO.set(chave, p);
  return p;
}
export async function sessaoValida(ctx: any, { recusado = null }: { recusado?: string | null } = {}): Promise<Sessao> {
  const d = deps(ctx), s = await lerSessao(ctx);
  if (!recusado && fresca(s, d)) return s;
  return renovar(ctx, d, recusado);
}

const buscarPds = (ctx: any) => async (url: string, init: RequestInit) => { // PDS: URL já validada na descoberta; sem redirecionamento
  const r = await ctx.fetchFn(url, { ...init, redirect: "manual" });
  return { status: r.status, headers: r.headers, texto: await r.text(), ok: r.ok };
};
/** Chamada autenticada ao PDS (`Authorization: DPoP` + prova DPoP com ath e nonce). 401 invalid_token: UMA renovação forçada e UMA repetição. Devolve { status, headers, texto, ok }. */
export async function chamarPds(ctx: any, caminho: string, init: RequestInit = {}, { base = null }: { base?: string | null } = {}) {
  let s = await sessaoValida(ctx);
  const url = `${base || s.pds}${caminho}`; urlPermitida(url);
  for (let tentativa = 0; ; tentativa++) {
    const nonces = noncesDe(ctx, s);
    const r = await fetchDpop(buscarPds(ctx), { url, init, jwk: s.dpopJwk, nonces, token: s.accessToken, agora: deps(ctx).agora });
    if (r.status === 401 && tentativa === 0 && !/use_dpop_nonce/i.test(r.headers.get("www-authenticate") || "")) { s = await sessaoValida(ctx, { recusado: s.accessToken }); continue; }
    return r;
  }
}
const xrpc = async (ctx: any, metodo: "GET" | "POST", nsid: string, { consulta, corpo, tipo = "application/json", bruto = false }: { consulta?: Record<string, string>; corpo?: any; tipo?: string; bruto?: boolean } = {}) => {
  const q = consulta ? `?${new URLSearchParams(consulta)}` : "";
  const r = await chamarPds(ctx, `/xrpc/${nsid}${q}`, { method: metodo, headers: { accept: "application/json", ...(corpo !== undefined ? { "content-type": tipo } : {}) }, body: corpo === undefined ? undefined : bruto ? corpo : JSON.stringify(corpo) });
  if (!r.ok) throw erroDaApi(r.status, r.texto, r.headers);
  try { return r.texto ? JSON.parse(r.texto) : {}; } catch { throw falha(502, "bluesky_error", `resposta inesperada do Bluesky em ${nsid}`); }
};

export async function revogar(ctx: any): Promise<boolean> {
  try {
    const s = await lerSessao(ctx), cliente = await clienteOauth(ctx);
    return await revogarToken(ctx.fetchFn, { cliente, servidor: s.servidor, dpopJwk: s.dpopJwk, nonces: s.nonces || {}, token: s.refreshToken, agora: deps(ctx).agora });
  } catch { return false; }
}

/** Status do canal: lê o perfil (também devolve handle, nome e avatar atuais). */
export async function status({ ctx }: any) {
  let s: Sessao;
  try { s = await lerSessao(ctx); } catch { return { conectado: false, detalhe: "não conectado" }; }
  try {
    const p = await xrpc(ctx, "GET", "app.bsky.actor.getProfile", { consulta: { actor: s.did } });
    return { conectado: true, detalhe: p.handle || s.handle || s.did, canalId: s.did, nome: p.displayName || null, avatar: p.avatar || null };
  } catch (e) { return { conectado: false, detalhe: e.codigo === "bluesky_reconnect_required" ? "reconectar" : e.message, ...(e.codigo ? { codigo: e.codigo } : {}) }; }
}

// ---------- publicar ----------
const MIMES_IMAGEM = ["image/jpeg", "image/png", "image/webp", "image/gif"];
/** largura/altura de PNG e JPEG pelo cabeçalho (sem biblioteca); null se não der. */
export function dimensoes(b: Uint8Array): { width: number; height: number } | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b.length > 24) { const v = new DataView(b.buffer, b.byteOffset); return { width: v.getUint32(16), height: v.getUint32(20) }; }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) { o++; continue; }
      const m = b[o + 1]!;
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { height: (b[o + 5]! << 8) | b[o + 6]!, width: (b[o + 7]! << 8) | b[o + 8]! };
      o += 2 + ((b[o + 2]! << 8) | b[o + 3]!);
    }
  }
  return null;
}
const lerTudo = async (f: any) => { const x = await f.ler(0, f.tamanho); return x instanceof Uint8Array ? x : new Uint8Array(x); };

/** Valida as imagens SEM baixar o arquivo (tamanho e mime já vêm da mídia). Lança 422 com código estável. */
export function validarImagens(imagens: { tamanho: number; mime: string | null }[]) {
  if (imagens.length > LIMITES.imagens) throw falha(422, "bluesky_too_many_images", `o Bluesky aceita até ${LIMITES.imagens} imagens por post (${imagens.length} enviadas)`);
  imagens.forEach((im, n) => {
    if (im.tamanho > LIMITES.bytesImagem) throw falha(422, "bluesky_image_too_large", `a imagem ${n + 1} passa de 2 MB (${im.tamanho} bytes): o Bluesky recusa e o Praeko não converte imagem; envie uma menor`);
    if (im.mime && !MIMES_IMAGEM.includes(im.mime)) throw falha(422, "bluesky_image_type", `a imagem ${n + 1} é ${im.mime}: use JPEG, PNG, WebP ou GIF`);
  });
}
export async function enviarBlob(ctx: any, bytes: Uint8Array, mime: string) {
  const j = await xrpc(ctx, "POST", "com.atproto.repo.uploadBlob", { corpo: bytes, tipo: mime, bruto: true });
  if (!j.blob) throw falha(502, "bluesky_error", "o Bluesky não devolveu o blob da imagem");
  return j.blob;
}

// ---------- vídeo (EXPERIMENTAL: a fonte oficial lida não detalha a autenticação do serviço de vídeo nem a duração máxima) ----------
/** (a) service auth no PDS do usuário: aud = did:web:{host do PDS}, lxm = com.atproto.repo.uploadBlob, vida curta. Ponto incerto: a primeira vez em produção confirma. */
export async function obterAuthServico(ctx: any, { lxm = "com.atproto.repo.uploadBlob", aud = null, minutos = 30 }: { lxm?: string; aud?: string | null; minutos?: number } = {}): Promise<string> {
  const s = await lerSessao(ctx), exp = Math.floor(deps(ctx).agora() / 1000) + minutos * 60;
  const j = await xrpc(ctx, "GET", "com.atproto.server.getServiceAuth", { consulta: { aud: aud || `did:web:${new URL(s.pds).host}`, lxm, exp: String(exp) } });
  if (!j.token) throw falha(502, "bluesky_error", "o Bluesky não devolveu o token de serviço do vídeo");
  return j.token;
}
const chamarVideo = async (ctx: any, caminho: string, token: string | null, init: RequestInit = {}) => {
  const r = await ctx.fetchFn(`${VIDEO}${caminho}`, { ...init, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), accept: "application/json", ...(init.headers || {}) } });
  const texto = await r.text();
  if (!r.ok) { const e = erroDaApi(r.status, texto, r.headers); if (e.codigo === "bluesky_reconnect_required") { e.codigo = "bluesky_video_auth"; e.message = "o serviço de vídeo do Bluesky recusou o acesso (401)"; } throw e; }
  try { return texto ? JSON.parse(texto) : {}; } catch { throw falha(502, "bluesky_error", "resposta inesperada do serviço de vídeo"); }
};
/** (b') limites: recusa se canUpload for falso ou os bytes restantes do dia não bastarem. */
export async function conferirLimitesVideo(ctx: any, _tokenDoUpload: string, tamanho: number) {
  // os limites pedem o PRÓPRIO token de serviço (aud = o serviço de vídeo, lxm = getUploadLimits); o do upload (aud = PDS, lxm = uploadBlob) dá 401
  const token = await obterAuthServico(ctx, { aud: "did:web:video.bsky.app", lxm: "app.bsky.video.getUploadLimits" });
  const l = await chamarVideo(ctx, "/xrpc/app.bsky.video.getUploadLimits", token);
  if (l.canUpload === false) throw falha(422, "bluesky_video_limit", `o Bluesky não deixa enviar vídeo agora${l.message ? `: ${String(l.message).slice(0, 120)}` : ""}`, { erroVideo: l.error || null });
  if (typeof l.remainingDailyBytes === "number" && l.remainingDailyBytes < tamanho) throw falha(422, "bluesky_video_limit", `o limite diário de vídeo do Bluesky não comporta este arquivo (restam ${l.remainingDailyBytes} bytes)`);
  if (typeof l.remainingDailyVideos === "number" && l.remainingDailyVideos < 1) throw falha(422, "bluesky_video_limit", "o limite diário de vídeos do Bluesky acabou");
  return l;
}
export async function enviarVideoBruto(ctx: any, token: string, did: string, nomeArquivo: string, bytes: Uint8Array) {
  const q = new URLSearchParams({ did, name: nomeArquivo });
  return chamarVideo(ctx, `/xrpc/app.bsky.video.uploadVideo?${q}`, token, { method: "POST", headers: { "content-type": "video/mp4" }, body: bytes as any });
}
/** (c) espera o processamento: COMPLETED devolve o blob; FAILED vira erro; limite de tentativas. */
export async function esperarVideo(ctx: any, token: string, jobId: string, { esperaMs = PASSOS_VIDEO.esperaMs, tentativas = PASSOS_VIDEO.tentativas } = {}) {
  const d = deps(ctx);
  for (let i = 0; i < tentativas; i++) {
    const j = (await chamarVideo(ctx, `/xrpc/app.bsky.video.getJobStatus?${new URLSearchParams({ jobId })}`, null)).jobStatus || {};
    if (j.state === "JOB_STATE_COMPLETED" && j.blob) return j.blob;
    if (j.state === "JOB_STATE_FAILED") { const motivo = j.failureCode || j.error || null; throw falha(422, "bluesky_video_failed", `o Bluesky não processou o vídeo${motivo ? ` (${String(motivo).slice(0, 80)})` : ""}`, { failureCode: motivo }); }
    await d.dormir(esperaMs);
  }
  throw falha(504, "bluesky_video_timeout", "o Bluesky demorou demais para processar o vídeo");
}
export async function publicarVideo(ctx: any, s: Sessao, item: any) {
  const f = await ctx.midia.abrir(item.video);
  if (f.tamanho > LIMITES.bytesVideo) throw falha(422, "bluesky_video_too_large", `o vídeo passa de 300 MB (${f.tamanho} bytes)`);
  if (f.mime && f.mime !== "video/mp4") throw falha(422, "bluesky_video_type", `o vídeo é ${f.mime}: o Bluesky aceita mp4`);
  try {
    const token = await obterAuthServico(ctx);
    await conferirLimitesVideo(ctx, token, f.tamanho);
    const job = await enviarVideoBruto(ctx, token, s.did, `${String(item.slug || "video").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "video"}.mp4`, await lerTudo(f));
    const jobId = job.jobId || job.jobStatus?.jobId;
    if (!jobId) throw falha(502, "bluesky_error", "o serviço de vídeo não devolveu o jobId");
    const blob = job.jobStatus?.state === "JOB_STATE_COMPLETED" && job.jobStatus.blob ? job.jobStatus.blob : await esperarVideo(ctx, token, jobId);
    const w = f.largura && f.altura ? { width: f.largura, height: f.altura } : null;
    return { $type: "app.bsky.embed.video", video: blob, ...(w ? { aspectRatio: w } : {}), ...(item.images?.[0]?.alt ? { alt: item.images[0].alt } : {}) };
  } finally { f.fechar?.(); }
}

export const rkeyDe = (uri: string) => uri.split("/").pop() as string;
export const linkPublico = (handleOuDid: string, uri: string) => `https://bsky.app/profile/${handleOuDid}/post/${rkeyDe(uri)}`;

/** Monta o registro app.bsky.feed.post (puro; `agora` = instante real do envio). */
export function montarRegistro({ texto, agora, embed, idiomas }: { texto: string; agora: number; embed?: any; idiomas?: string[] }) {
  const facets = montarFacets(texto);
  return { $type: "app.bsky.feed.post", text: texto, createdAt: new Date(agora).toISOString(), ...(facets.length ? { facets } : {}), ...(embed ? { embed } : {}), ...(idiomas?.length ? { langs: idiomas.slice(0, LIMITES.idiomas) } : {}) };
}
const idiomasDe = (item: any): string[] => { const l = item.opcoes?.idioma || item.idioma || item.textos?.idioma; return l ? [String(l).slice(0, 8)] : []; };

export async function publicar({ item, ctx }: any) {
  if (item.acao === "apagar") return apagar({ item, ctx });
  const texto = String(item.textos?.texto ?? "").trim();
  if (!texto && !(item.images?.length) && !item.video) throw falha(422, "bluesky_empty_post", "o post do Bluesky precisa de texto, imagem ou vídeo");
  const prob = problemasTexto(texto); if (prob[0]) throw falha(422, prob[0].codigo, prob[0].mensagem);
  const s = await sessaoValida(ctx);
  let embed: any;
  if (item.kind === "video" || (item.video && !item.images?.length)) embed = await publicarVideo(ctx, s, item); // EXPERIMENTAL
  else if (item.images?.length) {
    const abertas = [];
    for (const im of item.images) abertas.push({ f: await ctx.midia.abrir(im.midia), alt: im.alt || "" });
    try {
      validarImagens(abertas.map((x) => ({ tamanho: x.f.tamanho, mime: x.f.mime })));
      const imagens = [];
      for (const { f, alt } of abertas) {
        const bytes = await lerTudo(f), mime = f.mime || (bytes[0] === 0x89 ? "image/png" : "image/jpeg"), dim = dimensoes(bytes) || (f.largura && f.altura ? { width: f.largura, height: f.altura } : null);
        imagens.push({ image: await enviarBlob(ctx, bytes, mime), alt, ...(dim ? { aspectRatio: dim } : {}) });
      }
      embed = { $type: "app.bsky.embed.images", images: imagens };
    } finally { for (const x of abertas) x.f.fechar?.(); }
  }
  const registro = montarRegistro({ texto, agora: deps(ctx).agora(), embed, idiomas: idiomasDe(item) });
  const r = await xrpc(ctx, "POST", "com.atproto.repo.createRecord", { corpo: { repo: s.did, collection: "app.bsky.feed.post", record: registro } });
  if (!r.uri) throw falha(502, "bluesky_error", "o Bluesky não devolveu o uri do post");
  return { id: r.uri, uri: r.uri, cid: r.cid || null, url: linkPublico(s.handle || s.did, r.uri) };
}

/** Apaga um post já publicado (`com.atproto.repo.deleteRecord`). `item.uri` é o at-uri guardado no resultado. */
export async function apagar({ item, ctx }: any) {
  const s = await sessaoValida(ctx), uri = String(item.uri || item.videoId || item.idExterno || "");
  const m = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(uri);
  if (!m || m[1] !== s.did) throw falha(422, "bluesky_invalid_request", "o at-uri não é de um post desta conta");
  await xrpc(ctx, "POST", "com.atproto.repo.deleteRecord", { corpo: { repo: s.did, collection: "app.bsky.feed.post", rkey: m[2] } });
  return { apagado: true, uri };
}

export async function planejar({ item }: any) {
  const t = String(item.textos?.texto ?? "");
  return [`text: ${graphemes(t)}/${LIMITES.graphemes} characters`, `media: ${item.images?.length ? `${item.images.length} image(s)` : item.video ? "video (experimental)" : "none"}`];
}

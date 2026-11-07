// Provedor do TikTok (Content Posting API v2 + Login Kit), versão SEM Node: só fetch, WebCrypto e o que entra por `ctx`.
// Roda no Worker (o servidor). Escrito contra a documentação oficial (developers.tiktok.com); ainda sem teste ao vivo: os testes usam um fetch falso.
// Tudo que toca o mundo entra por `ctx`:
//   ctx.fetchFn                  fetch
//   ctx.segredos.obter/guardar   `tiktok/cliente` (JSON { client_key, client_secret }) e `tiktok/token` (JSON, ver registroToken)
//   ctx.deps.agora               relógio (testes)
// O TikTok não agenda pela API: quem espera a hora é o Workflow do servidor. Modos: "rascunho" (caixa de entrada do app, escopo video.upload)
// e "direto" (Direct Post, video.publish; sem auditoria do app o TikTok só aceita SELF_ONLY e contas de teste).
export const nome = "tiktok";
export const rede = "tiktok";
export const imediato = true;

export const REF_CLIENTE = "tiktok/cliente";
export const REF_TOKEN = "tiktok/token";
export const ESCOPOS = ["user.info.basic", "user.info.stats", "video.list", "video.upload", "video.publish"];
export const HOST = "https://open.tiktokapis.com";
export const AUTH = "https://www.tiktok.com/v2/auth/authorize/";
export const MB = 1024 * 1024;
export const LIMITES = { chunkMin: 5 * MB, chunkMax: 64 * MB, ultimoMax: 128 * MB, chunksMax: 1000, videoMax: 4 * 1024 * MB, titulo: 2200 };
export const PRIVACIDADES = ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"];
export const MODOS = ["rascunho", "direto"];
const MARGEM_RENOVAR_MS = 5 * 60e3;

const CAMPOS_PERFIL = ["open_id", "avatar_url", "display_name", "follower_count", "following_count", "likes_count", "video_count"];
const CAMPOS_VIDEO = "id,title,video_description,create_time,cover_image_url,share_url,duration,view_count,like_count,comment_count,share_count";

// ---------- utilidades puras ----------
export const b64url = (bytes: any) => { const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); let s = ""; for (const b of u) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
/** PKCE do TikTok: o code_challenge é o SHA-256 do verificador em HEXADECIMAL (não base64url, como nas outras redes). */
export async function desafioPkceHex(verificador: any) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verificador)));
  return [...h].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** Verificador PKCE: 43 a 128 caracteres de [A-Za-z0-9-._~]. */
export const novoVerificador = (aleatorio = (n: any) => crypto.getRandomValues(new Uint8Array(n))) => b64url(aleatorio(48));

/** Trunca em até `max` unidades UTF-16 sem cortar um par substituto. */
export function truncar(texto: any, max = LIMITES.titulo) {
  const s = String(texto ?? "");
  if (s.length <= max) return s;
  let corte = max - 1;
  const c = s.charCodeAt(corte - 1);
  if (c >= 0xd800 && c <= 0xdbff) corte--;
  return s.slice(0, corte) + "…";
}

/** Plano de partes do FILE_UPLOAD (regras da doc: 5–64 MB, última até 128 MB, <5 MB em uma parte, total = floor(tamanho/parte)). */
export function planoChunks(tamanho: any, chunkPreferido = 10 * MB) {
  if (!(tamanho > 0)) throw new Error("vídeo vazio");
  if (tamanho > LIMITES.videoMax) throw new Error(`vídeo de ${(tamanho / MB).toFixed(0)} MB passa de 4 GB`);
  let chunk = Math.min(LIMITES.chunkMax, Math.max(LIMITES.chunkMin, chunkPreferido));
  if (tamanho < LIMITES.chunkMin || tamanho <= chunk) chunk = tamanho;
  const total = Math.floor(tamanho / chunk);
  if (total === 1) chunk = tamanho; // uma parte só: o TikTok exige chunk_size igual ao video_size (10 MB para um vídeo de 12 MB dá "The chunk size is invalid")
  if (total < 1 || total > LIMITES.chunksMax) throw new Error(`plano de partes inválido (${total} partes)`);
  const partes = [];
  for (let i = 0; i < total; i++) {
    const a = i * chunk, b = i === total - 1 ? tamanho - 1 : a + chunk - 1; // a última absorve o resto
    partes.push({ a, b, tamanho: b - a + 1 });
  }
  if (partes.at(-1)!.tamanho > LIMITES.ultimoMax) throw new Error("a última parte passaria de 128 MB; aumente o tamanho da parte");
  return { chunk, total, partes };
}

// ---------- erros ----------
const ERROS: Record<string, any> = {
  unaudited_client_can_only_post_to_private_accounts: "o app do TikTok ainda não foi auditado: ele só posta em conta PRIVADA e como SELF_ONLY. Use o modo \"rascunho\" ou torne a conta privada até a auditoria (developers.tiktok.com/application/content-posting-api).",
  spam_risk_too_many_pending_share: "o TikTok aceita no máximo 5 envios pendentes na caixa de entrada por 24 h; publique ou descarte algum rascunho no app.",
  spam_risk_too_many_posts: "limite diário de posts do TikTok atingido para esta conta (cerca de 15 por dia).",
  spam_risk_user_banned_from_posting: "esta conta está impedida de postar pelo TikTok.",
  spam_risk_text: "o TikTok recusou o texto da legenda como spam.",
  spam_risk: "o TikTok bloqueou o envio por risco de spam.",
  reached_active_user_cap: "o app atingiu a cota diária de usuários ativos de publicação do TikTok.",
  url_ownership_unverified: "o domínio do vídeo não está verificado no TikTok (PULL_FROM_URL).",
  privacy_level_option_mismatch: "a privacidade pedida não está entre as opções da conta (privacy_level_options).",
  access_token_invalid: "token do TikTok inválido ou expirado: reconecte o canal (praeko conta tiktok conectar).",
  scope_not_authorized: "falta autorizar um escopo no TikTok (video.upload, video.publish, video.list…): reconecte o canal e aceite todos.",
  scope_permission_missed: "falta autorizar um escopo no TikTok: reconecte o canal e aceite todos.",
  rate_limit_exceeded: "limite de requisições do TikTok; tente de novo em um minuto.",
  file_format_check_failed: "o TikTok não aceitou o formato do arquivo (use MP4/MOV com H.264 e AAC).",
  duration_check_failed: "a duração do vídeo passa do que esta conta pode postar no TikTok.",
  frame_rate_check_failed: "a taxa de quadros do vídeo não é aceita pelo TikTok (use de 23 a 60 fps).",
  picture_size_check_failed: "a resolução do vídeo não é aceita pelo TikTok.",
  video_pull_failed: "o TikTok não conseguiu baixar o vídeo pela URL pública.",
  publish_cancelled: "a publicação foi cancelada no TikTok.",
  auth_removed: "o acesso do Praeko à conta foi removido no TikTok: reconecte o canal.",
  invalid_publish_id: "o TikTok não reconhece este envio (publish_id inválido ou vencido).",
  invalid_file_upload: "o TikTok recusou o envio do arquivo em partes.",
};
export const mensagemErro = (cod: any, msg?: any) => ERROS[cod] ? `${ERROS[cod]} [${cod}]` : `TikTok recusou: ${cod || "erro"}${msg ? ` (${String(msg).slice(0, 160)})` : ""}`;
const CODIGOS_TRANSITORIOS = ["internal_error", "rate_limit_exceeded", "service_unavailable", "timeout"];

/** Erro com `.status` (HTTP), `.codigo` (código do TikTok) e `.transitorio`. A mensagem nunca carrega token. */
export function falha(status: any, codigo: any, msg: any) {
  const e = new Error(mensagemErro(codigo, msg));
  return Object.assign(e, { status: status || 502, codigo: codigo || null, transitorio: !status || status >= 500 || status === 429 || CODIGOS_TRANSITORIOS.includes(codigo) });
}
/** Vale repetir: rede, 5xx, limite de taxa. */
export const transitorio = (e: any) => !e?.status || !!e.transitorio;

// ---------- OAuth ----------
/** Credencial do app: o que estiver em ctx.segredos (`tiktok/cliente`, vinda dos secrets do Worker). */
export async function cliente(ctx: any) {
  const salvo = await ctx.segredos.obter(REF_CLIENTE);
  if (salvo) { const j = typeof salvo === "string" ? JSON.parse(salvo) : salvo; if (j.client_key && j.client_secret) return j; }
  throw Object.assign(new Error("sem credencial do TikTok: defina os secrets TIKTOK_CLIENT_KEY e TIKTOK_CLIENT_SECRET do Worker (docs/tiktok.md)"), { status: 409, codigo: "sem_credencial" });
}

/** URL de autorização (puro). Os escopos vão separados por vírgula. */
export function urlAutorizacao({ clientKey, redirect, desafio, estado }: any) {
  const q = new URLSearchParams({ client_key: clientKey, scope: ESCOPOS.join(","), response_type: "code", redirect_uri: redirect, state: estado, code_challenge: desafio, code_challenge_method: "S256" });
  return `${AUTH}?${q}`;
}

async function pedirToken(ctx: any, corpo: any) {
  const r = await ctx.fetchFn(`${HOST}/v2/oauth/token/`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "cache-control": "no-cache" }, body: new URLSearchParams(corpo).toString() });
  const txt = await r.text(); let j: Record<string, any> = {}; try { j = txt ? JSON.parse(txt) : {}; } catch { /* não é JSON */ }
  if (!r.ok || j.error || !j.access_token) { const e = falha(r.status, j.error, j.error_description); e.message = `${j.error === "invalid_grant" ? "o TikTok recusou o código/refresh token (vencido ou já usado)" : "TikTok recusou o token"}: ${j.error_description || j.error || `HTTP ${r.status}`}`; throw e; }
  return j;
}
export async function trocarCodigo(ctx: any, cl: any, { codigo, verificador, redirect }: any) {
  return pedirToken(ctx, { client_key: cl.client_key, client_secret: cl.client_secret, code: codigo, grant_type: "authorization_code", redirect_uri: redirect, code_verifier: verificador });
}
/** O registro do token como o provedor o guarda (JSON em texto). */
export function registroToken(j: any, agora: any) {
  return JSON.stringify({ access_token: j.access_token, refresh_token: j.refresh_token, expiry: agora + (j.expires_in || 86400) * 1000, refreshExpiry: agora + (j.refresh_expires_in || 365 * 86400) * 1000, openId: j.open_id || null, escopos: String(j.scope || ESCOPOS.join(",")).split(",") });
}
/** Access token válido (~24 h). Renova antes de vencer (faltando menos de 5 min) e guarda o refresh token novo, se o TikTok girar. */
export async function tokenValido(ctx: any) {
  const agora = (ctx.deps?.agora || Date.now)(), bruto = await ctx.segredos.obter(REF_TOKEN);
  if (!bruto) throw Object.assign(new Error("TikTok não conectado: praeko conta tiktok conectar"), { status: 409, codigo: "tiktok_nao_conectado" });
  const t = typeof bruto === "string" ? JSON.parse(bruto) : bruto;
  if (t.access_token && t.expiry - MARGEM_RENOVAR_MS > agora) return t.access_token;
  if (!t.refresh_token || (t.refreshExpiry && t.refreshExpiry < agora)) throw Object.assign(new Error("o refresh token do TikTok venceu (vale ~365 dias): reconecte o canal"), { status: 409, codigo: "tiktok_nao_conectado" });
  const cl = await cliente(ctx);
  const j = await pedirToken(ctx, { client_key: cl.client_key, client_secret: cl.client_secret, grant_type: "refresh_token", refresh_token: t.refresh_token });
  const novo = JSON.parse(registroToken({ ...j, refresh_token: j.refresh_token || t.refresh_token, open_id: j.open_id || t.openId }, agora));
  await ctx.segredos.guardar(REF_TOKEN, JSON.stringify({ ...t, ...novo }));
  return novo.access_token;
}
/** Revoga o token no TikTok (melhor esforço; quem chama apaga o registro de qualquer jeito). */
export async function revogar(ctx: any) {
  try {
    const bruto = await ctx.segredos.obter(REF_TOKEN), cl = await cliente(ctx);
    if (!bruto) return false;
    const t = JSON.parse(bruto), r = await ctx.fetchFn(`${HOST}/v2/oauth/revoke/`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_key: cl.client_key, client_secret: cl.client_secret, token: t.access_token }).toString() });
    return r.ok;
  } catch { return false; }
}

// ---------- chamadas ----------
/** Chamada autenticada. Devolve `data` quando `error.code` é "ok"; senão lança com o código do TikTok. */
export async function chamar(ctx: any, caminho: any, { metodo = "GET", query, corpo }: any = {}) {
  const token = await tokenValido(ctx), q = query ? `?${new URLSearchParams(query)}` : "";
  let r;
  try { r = await ctx.fetchFn(`${HOST}${caminho}${q}`, { method: metodo, headers: { authorization: `Bearer ${token}`, ...(corpo !== undefined ? { "content-type": "application/json; charset=UTF-8" } : {}) }, ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}) }); }
  catch (e) { throw Object.assign(new Error(`falha de rede com o TikTok: ${e.message}`), { transitorio: true }); }
  const txt = await r.text(); let j: Record<string, any> = {}; try { j = txt ? JSON.parse(txt) : {}; } catch { /* não é JSON */ }
  const cod = j.error?.code;
  if (!r.ok || (cod && cod !== "ok")) throw falha(r.status, cod && cod !== "ok" ? cod : null, j.error?.message || txt.slice(0, 160));
  return j.data ?? {};
}

const num = (x: any) => (x != null && x !== "" && !Number.isNaN(+x) ? +x : null);

/** Conta: nome, avatar, seguidores, seguindo, curtidas e vídeos. `username` exige o escopo user.info.profile (que o Praeko não pede): fica de fora. */
export async function perfil({ ctx }: any) {
  const j = await chamar(ctx, "/v2/user/info/", { query: { fields: CAMPOS_PERFIL.join(",") } });
  const u = j.user || {};
  return { id: u.open_id || null, nome: u.display_name || null, usuario: u.username || null, avatar: u.avatar_url || null, seguidores: num(u.follower_count), seguindo: num(u.following_count), curtidas: num(u.likes_count), videos: num(u.video_count) };
}
export async function status({ ctx }: any) {
  if (!(await ctx.segredos.obter(REF_TOKEN))) return { conectado: false, detalhe: "rode: praeko conta tiktok conectar" };
  try { const p = await perfil({ ctx }); return { conectado: true, detalhe: p.nome || p.usuario || "TikTok", ...(p.id ? { canalId: p.id } : {}) }; }
  catch (e) { return { conectado: false, detalhe: String(e.message).slice(0, 200) }; }
}

const primeiraLinha = (t: any, max = 120) => { const l = String(t || "").split("\n").map((x) => x.trim()).find(Boolean) || ""; return l.length > max ? `${l.slice(0, max - 1)}…` : l; };
export const videoDe = (v: any) => ({
  id: String(v.id), rede: "tiktok", titulo: primeiraLinha(v.title || v.video_description), legenda: v.video_description || v.title || "",
  publicadoEm: v.create_time ? new Date(Number(v.create_time) * 1000).toISOString() : null, thumbnail: v.cover_image_url || null, permalink: v.share_url || null,
  duracao: num(v.duration), views: num(v.view_count), curtidas: num(v.like_count), comentarios: num(v.comment_count), compartilhamentos: num(v.share_count),
});

/** Vídeos da conta, do mais novo ao mais antigo (POST /v2/video/list/). Devolve { videos, proxima } (`proxima` é o cursor, ou null no fim). */
export async function listarVideos({ ctx, max = 20, cursor }: any) {
  const j = await chamar(ctx, "/v2/video/list/", { metodo: "POST", query: { fields: CAMPOS_VIDEO }, corpo: { max_count: Math.max(1, Math.min(20, Math.floor(+max) || 20)), ...(cursor != null ? { cursor: Number(cursor) } : {}) } });
  return { videos: (j.videos || []).map(videoDe), proxima: j.has_more && j.cursor != null ? String(j.cursor) : null };
}
/** Métricas atuais de até 20 vídeos por id (POST /v2/video/query/). Devolve Map id → vídeo. */
export async function consultarVideos({ ctx, ids }: any) {
  const mapa = new Map();
  for (let i = 0; i < ids.length; i += 20) {
    const j = await chamar(ctx, "/v2/video/query/", { metodo: "POST", query: { fields: CAMPOS_VIDEO }, corpo: { filters: { video_ids: ids.slice(i, i + 20) } } });
    for (const v of j.videos || []) mapa.set(String(v.id), videoDe(v));
  }
  return mapa;
}

// ---------- publicar ----------
/** O que a conta aceita: privacidades, duração máxima e se comentário/dueto/stitch estão desligados nas configurações dela. */
export async function infoCriador({ ctx }: any) {
  const j = await chamar(ctx, "/v2/post/publish/creator_info/query/", { metodo: "POST", corpo: {} });
  return { privacidades: j.privacy_level_options || [], duracaoMaxSeg: num(j.max_video_post_duration_sec), comentarioDesabilitado: !!j.comment_disabled, duetoDesabilitado: !!j.duet_disabled, stitchDesabilitado: !!j.stitch_disabled, usuario: j.creator_username || null, nome: j.creator_nickname || null };
}

export function modoDe(item: any) { const m = item.opcoes?.modo || "rascunho"; if (!MODOS.includes(m)) throw new Error(`modo do TikTok inválido: ${m} (use rascunho ou direto)`); return m; }
export function privacidadeDe(item: any) { const p = item.opcoes?.privacidade || "SELF_ONLY"; if (!PRIVACIDADES.includes(p)) throw new Error(`privacidade do TikTok inválida: ${p} (use ${PRIVACIDADES.join(", ")})`); return p; }

/** post_info do Direct Post (puro). `info`: o que infoCriador devolveu (exige a privacidade entre as opções da conta). */
export function montarPostInfo(item: any, info: any) {
  const o = item.opcoes || {}, privacy_level = privacidadeDe(item);
  if (info && !info.privacidades.includes(privacy_level)) throw Object.assign(new Error(`a privacidade ${privacy_level} não está entre as opções desta conta (${info.privacidades.join(", ") || "nenhuma"}): ${mensagemErro("privacy_level_option_mismatch")}`), { status: 422, codigo: "privacy_level_option_mismatch" });
  const titulo = truncar(item.textos?.texto || item.titulo || "");
  return {
    title: titulo, privacy_level,
    disable_duet: !!(o.desabilitarDueto || info?.duetoDesabilitado), disable_comment: !!(o.desabilitarComentarios || info?.comentarioDesabilitado), disable_stitch: !!(o.desabilitarStitch || info?.stitchDesabilitado),
    ...(Number.isFinite(+o.miniaturaMs) && o.miniaturaMs != null ? { video_cover_timestamp_ms: Math.max(0, Math.floor(+o.miniaturaMs)) } : {}),
    ...(o.conteudoIA != null ? { is_aigc: !!o.conteudoIA } : {}),
    ...postInfoComercial(o, privacy_level),
  };
}

/**
 * Conteúdo comercial (Direct Post UX): `conteudoComercial` liga a divulgação e exige "Sua marca" (`marcaPropria` → brand_organic_toggle) e/ou "Marca de terceiros"
 * (`marcaTerceiros` → brand_content_toggle). Conteúdo de marca de terceiros não pode ser privado (SELF_ONLY). Sem o interruptor, os dois campos vão `false`.
 */
export function postInfoComercial(o: any = {}, privacidade: any) {
  const ligado = o.conteudoComercial === true;
  if (ligado && !o.marcaPropria && !o.marcaTerceiros) throw Object.assign(new Error("conteúdo comercial: escolha “Sua marca” ou “Marca de terceiros” (ou desligue a divulgação)"), { status: 422, codigo: "marca_nao_escolhida" });
  if (ligado && o.marcaTerceiros && privacidade === "SELF_ONLY") throw Object.assign(new Error("o TikTok não aceita conteúdo de marca de terceiros como privado (Só eu): escolha outra visibilidade"), { status: 422, codigo: "marca_nao_pode_ser_privada" });
  return { brand_content_toggle: ligado && !!o.marcaTerceiros, brand_organic_toggle: ligado && !!o.marcaPropria };
}

/** Inicia o envio. `fonte`: { url } (PULL_FROM_URL) ou { tamanho, chunk, total } (FILE_UPLOAD). `modo` "rascunho" usa a caixa de entrada (sem post_info). Devolve { publishId, uploadUrl }. */
export async function iniciarPublicacao({ ctx, modo, postInfo, fonte }: any) {
  const source_info = fonte.url ? { source: "PULL_FROM_URL", video_url: fonte.url } : { source: "FILE_UPLOAD", video_size: fonte.tamanho, chunk_size: fonte.chunk, total_chunk_count: fonte.total };
  const corpo = modo === "direto" ? { post_info: postInfo, source_info } : { source_info };
  const j = await chamar(ctx, modo === "direto" ? "/v2/post/publish/video/init/" : "/v2/post/publish/inbox/video/init/", { metodo: "POST", corpo });
  if (!j.publish_id) throw new Error("o TikTok não devolveu o publish_id");
  return { publishId: String(j.publish_id), uploadUrl: j.upload_url || null };
}

/** Envia uma parte (PUT no upload_url com Content-Range). `bytes`: Uint8Array da parte; `parte`: { a, b }. */
export async function enviarParte({ ctx, uploadUrl, bytes, parte, total, mime = "video/mp4" }: any) {
  let r;
  try { r = await ctx.fetchFn(uploadUrl, { method: "PUT", headers: { "content-type": mime, "content-length": String(bytes.length), "content-range": `bytes ${parte.a}-${parte.b}/${total}` }, body: bytes }); }
  catch (e) { throw Object.assign(new Error(`falha de rede ao enviar a parte ao TikTok: ${e.message}`), { transitorio: true }); }
  if (r.status < 200 || r.status > 299) { const txt = await r.text().catch(() => ""); throw falha(r.status, r.status >= 500 ? null : "invalid_file_upload", txt.slice(0, 160)); }
  return { status: r.status };
}

/** Estado do envio: { codigo: PROCESSING_UPLOAD|PROCESSING_DOWNLOAD|SEND_TO_USER_INBOX|PUBLISH_COMPLETE|FAILED, motivo, videoIds }. */
export async function statusPublicacao({ ctx, publishId }: any) {
  const j = await chamar(ctx, "/v2/post/publish/status/fetch/", { metodo: "POST", corpo: { publish_id: publishId } });
  const ids = j.publicaly_available_post_id || j.publicly_available_post_id || [];
  return { codigo: String(j.status || "").toUpperCase(), motivo: j.fail_reason || null, videoIds: ids.map(String), enviadoBytes: num(j.uploaded_bytes) };
}

/** Item do contrato do provedor (o servidor usa a própria publicação em passos). */
export async function publicar() { throw new Error("o TikTok publica em passos pelo Workflow do servidor (tiktok-publicar.js)"); }

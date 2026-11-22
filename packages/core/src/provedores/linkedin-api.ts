// Provedor da LinkedIn (perfil PESSOAL; T-040, docs/linkedin.md), versão SEM Node: só fetch e o que entra por `ctx` (igual ao youtube-api.ts).
//   ctx.fetchFn                     fetch
//   ctx.segredos.obter/guardar      o registro do token (cifrado no servidor)
//   ctx.midia.abrir(ref)            → { tamanho, mime?, ler(inicio, n) → bytes }
//   ctx.deps.{agora, reservarLinkedin(n), verificarLinkedin(n)}   relógio e contador de uso por canal (o servidor injeta; sem ele não há contagem)
// NUNCA coloque token, segredo ou resposta de token em mensagem de erro ou log.
export const nome = "linkedin";
export const rede = "linkedin";
export const imediato = true; // a LinkedIn não agenda: o Praeko espera a hora e publica na hora marcada

/** UMA constante: a versão da API (cabeçalho `Linkedin-Version`, AAAAMM). Trocar aqui troca em tudo; a 202601 acaba em 15/01/2027. Revisar a cada trimestre. */
export const VERSAO_API = "202611";
export const REF_TOKEN = "linkedin/token";
export const ESCOPOS = ["openid", "profile", "w_member_social"];
export const AUTH = "https://www.linkedin.com/oauth/v2/authorization", TOKEN = "https://www.linkedin.com/oauth/v2/accessToken";
export const API = "https://api.linkedin.com/rest", USERINFO = "https://api.linkedin.com/v2/userinfo";
/** Limite do texto: a doc da Posts API NÃO fixa um número; os 3000 vêm do ugcPosts legado (a conferir no teste real). */
export const LIMITE_TEXTO = 3000;
/** 150 requisições por dia por membro (página do Share on LinkedIn); o dia é UTC. */
export const LIMITE_CHAMADAS_DIA = 150;
export const BLOCO_VIDEO = 4194304; // 4 MiB por parte (Videos API)
export const IMAGENS_MIN = 2, IMAGENS_MAX = 20;
export const VIDEO_MAX_BYTES = 500 * 1024 * 1024; // a página da Videos API diz 500 MB (o schema diz 5 GB: conflito; vale o mais estrito)
const TOLERANCIA_MS = 60e3;

const agoraDe = (ctx: any): number => (ctx.deps?.agora ? ctx.deps.agora() : Date.now());

// ---------- erros tipados ----------
export type ErroLinkedin = Error & { status?: number; codigo: string; definitivo?: boolean; transitorio?: boolean; retryAfter?: number };
/** Códigos internos (PT) de erro: o contrato os publica em inglês (packages/sdk ERROR_CODES). */
export const CODIGOS = { vencido: "linkedin_token_vencido", invalido: "linkedin_token_invalido", proibido: "linkedin_proibido", recusado: "linkedin_recusado", limite: "linkedin_limite_excedido", erro: "linkedin_erro" } as const;
const MSGS: Record<string, string> = {
  [CODIGOS.vencido]: "o acesso ao LinkedIn venceu: reconecte o canal em Canais (o LinkedIn exige reconectar a cada 60 dias)",
  [CODIGOS.invalido]: "o LinkedIn recusou o acesso (401): reconecte o canal em Canais",
  [CODIGOS.proibido]: "o LinkedIn negou a ação (403): confira se a permissão w_member_social foi aceita ao conectar",
  [CODIGOS.recusado]: "o LinkedIn recusou o pedido",
  [CODIGOS.limite]: "o limite de chamadas do LinkedIn foi atingido",
  [CODIGOS.erro]: "o LinkedIn falhou",
};
/** Código público (inglês, estável) de cada código interno: vai entre colchetes no começo do texto do erro do item. */
export const CODIGO_PUBLICO: Readonly<Record<string, string>> = { linkedin_token_vencido: "linkedin_token_expired", linkedin_token_invalido: "linkedin_token_invalid", linkedin_proibido: "linkedin_forbidden", linkedin_recusado: "linkedin_rejected", linkedin_limite_excedido: "linkedin_limit_exceeded", linkedin_erro: "linkedin_error" };
export const erroLinkedin = (codigo: string, detalhe: string | null, extra: Partial<ErroLinkedin> = {}): ErroLinkedin =>
  Object.assign(new Error(`[${CODIGO_PUBLICO[codigo] ?? codigo}] ${MSGS[codigo] ?? codigo}${detalhe ? `: ${detalhe}` : ""}`), { codigo }, extra) as ErroLinkedin;

/** Resumo SEGURO do corpo de erro da LinkedIn (message/code/status; nunca o corpo inteiro). */
function resumo(corpo: unknown): string {
  let j: any = null; try { j = JSON.parse(String(corpo)); } catch { /* não é JSON */ }
  const m = j?.message || j?.error_description || j?.error || "";
  return String(m).replace(/\s+/g, " ").slice(0, 200);
}
/** Resposta de erro HTTP → erro tipado (nunca 500 genérico). */
export function falha(status: number, corpo: unknown, cab?: { get(n: string): string | null } | null): ErroLinkedin {
  const det = resumo(corpo), s = `HTTP ${status}${det ? ` ${det}` : ""}`;
  if (status === 401) return erroLinkedin(CODIGOS.invalido, s, { status, definitivo: true });
  if (status === 403) return erroLinkedin(CODIGOS.proibido, s, { status, definitivo: true });
  if (status === 429) { const ra = Number(cab?.get("retry-after")); return erroLinkedin(CODIGOS.limite, s, { status, transitorio: true, ...(Number.isFinite(ra) && ra > 0 ? { retryAfter: ra } : {}) }); }
  if (status >= 500) return erroLinkedin(CODIGOS.erro, s, { status, transitorio: true });
  return erroLinkedin(CODIGOS.recusado, s, { status, definitivo: true }); // 400, 404, 409, 422…
}

// ---------- OAuth ----------
/** Monta a URL de autorização (puro). SEM PKCE: a LinkedIn não o documenta. */
export function urlAutorizacao({ clientId, redirect, estado }: { clientId: string; redirect: string; estado: string }) {
  return `${AUTH}?${new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirect, state: estado, scope: ESCOPOS.join(" ") })}`;
}
export async function trocarCodigo(ctx: any, cl: { client_id: string; client_secret: string }, { codigo, redirect }: { codigo: string; redirect: string }) {
  const r = await ctx.fetchFn(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code: codigo, client_id: cl.client_id, client_secret: cl.client_secret, redirect_uri: redirect }).toString() });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`LinkedIn recusou o código: ${String(j.error_description || j.error || `HTTP ${r.status}`).slice(0, 200)}`);
  return j;
}

export type RegistroToken = { access_token: string; refresh_token?: string; expiry: number; refresh_expiry?: number; escopos: string[]; sub?: string };
/** O registro do token como é guardado (JSON em texto). Sem `id_token`. `sub` = id do membro (do userinfo), para montar o autor sem outra chamada. */
export function registroToken(j: any, agora: number): string {
  const r: RegistroToken = { access_token: j.access_token, expiry: agora + (Number(j.expires_in) || 5184000) * 1000, escopos: String(j.scope || ESCOPOS.join(" ")).split(/[ ,]+/).filter(Boolean) };
  if (j.refresh_token) { r.refresh_token = j.refresh_token; if (j.refresh_token_expires_in) r.refresh_expiry = agora + Number(j.refresh_token_expires_in) * 1000; }
  if (j.sub) r.sub = String(j.sub);
  return JSON.stringify(r);
}
/** O que o painel mostra: validade do token e se há renovação automática (o diagnóstico do teste real). Puro. */
export function diagnosticoToken(bruto: string | null | undefined, agora: number): { tokenExpiresAt: string | null; refreshAvailable: boolean; expired: boolean; expiresInDays: number | null } {
  if (!bruto) return { tokenExpiresAt: null, refreshAvailable: false, expired: false, expiresInDays: null };
  let t: RegistroToken; try { t = JSON.parse(bruto); } catch { return { tokenExpiresAt: null, refreshAvailable: false, expired: true, expiresInDays: null }; }
  const refresh = !!t.refresh_token && !(t.refresh_expiry && t.refresh_expiry <= agora);
  const vencido = !Number.isFinite(t.expiry) || t.expiry <= agora;
  return { tokenExpiresAt: Number.isFinite(t.expiry) && t.expiry > 0 ? new Date(t.expiry).toISOString() : null, refreshAvailable: refresh, expired: vencido && !refresh, expiresInDays: Number.isFinite(t.expiry) ? Math.floor((t.expiry - agora) / 86400e3) : null };
}

async function lerRegistro(ctx: any): Promise<RegistroToken> {
  const bruto = await ctx.segredos.obter(REF_TOKEN);
  if (!bruto) throw erroLinkedin(CODIGOS.invalido, "LinkedIn não conectado", { status: 401, definitivo: true });
  return JSON.parse(bruto);
}
/** Access token válido: renova pelo refresh token (se houver) quando vencido; sem refresh, vencido = erro `linkedin_token_vencido` (canal "reconectar"). */
export async function tokenValido(ctx: any): Promise<string> {
  const t = await lerRegistro(ctx), agora = agoraDe(ctx);
  if (t.access_token && t.expiry - TOLERANCIA_MS > agora) return t.access_token;
  if (!t.refresh_token || (t.refresh_expiry && t.refresh_expiry <= agora)) throw erroLinkedin(CODIGOS.vencido, null, { status: 401, definitivo: true });
  const cl = await ctx.segredos.obter("linkedin/cliente"); const c = cl ? JSON.parse(cl) : null;
  if (!c?.client_id || !c?.client_secret) throw erroLinkedin(CODIGOS.erro, "sem credencial do app para renovar", { definitivo: true });
  const r = await ctx.fetchFn(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: c.client_id, client_secret: c.client_secret }).toString() });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) { await invalidar(ctx); throw erroLinkedin(CODIGOS.vencido, `a renovação foi recusada (${String(j.error || `HTTP ${r.status}`).slice(0, 80)})`, { status: 401, definitivo: true }); }
  const novo: RegistroToken = { ...t, access_token: j.access_token, expiry: agora + (Number(j.expires_in) || 5184000) * 1000, ...(j.refresh_token ? { refresh_token: j.refresh_token, ...(j.refresh_token_expires_in ? { refresh_expiry: agora + Number(j.refresh_token_expires_in) * 1000 } : {}) } : {}) };
  await ctx.segredos.guardar(REF_TOKEN, JSON.stringify(novo));
  return novo.access_token;
}
/** O LinkedIn disse 401: o registro passa a valer como vencido (o canal mostra "reconectar" e nada tenta de novo até reconectar). Nunca lança. */
export async function invalidar(ctx: any): Promise<void> {
  try { const bruto = await ctx.segredos.obter(REF_TOKEN); if (!bruto) return; const t = JSON.parse(bruto); await ctx.segredos.guardar(REF_TOKEN, JSON.stringify({ ...t, expiry: 0, refresh_token: undefined, refresh_expiry: undefined })); } catch { /* melhor esforço */ }
}

// ---------- chamadas ----------
const CAB = () => ({ "linkedin-version": VERSAO_API, "x-restli-protocol-version": "2.0.0" });
/** UMA chamada à API REST (ou ao uploadUrl): conta no limite do canal ANTES de sair e converte erro HTTP em erro tipado. 401 invalida o registro. */
async function chamar(ctx: any, token: string, url: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
  if (ctx.deps?.reservarLinkedin) await ctx.deps.reservarLinkedin(1);
  const r = await ctx.fetchFn(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    if (r.status === 401) await invalidar(ctx);
    throw falha(r.status, corpo, r.headers);
  }
  return r;
}
const json = (o: unknown) => JSON.stringify(o);

/** Quantas chamadas à LinkedIn um item exige (para recusar ANTES de começar). Texto: 1; imagem: 2 por imagem + 1; vídeo: 1 + partes + 1 + 1. */
export function chamadasNecessarias(item: any, tamanhoVideo = 0): number {
  const k = item.kind || "video";
  if (k === "image" || k === "carousel") { const n = (item.images || []).length; return n * 2 + 1; }
  if (k === "text") return 1;
  return 1 + Math.max(1, Math.ceil(tamanhoVideo / BLOCO_VIDEO)) + 1 + 1;
}

// ---------- texto ----------
/** Texto do post no formato `little` da LinkedIn: caracteres reservados com barra invertida; `#palavra` vira o template de hashtag. Menções não são suportadas (o @ é literal). */
export function textoLittle(texto: string): string {
  return String(texto).replace(/#([\p{L}\p{N}_]+)|([|{}@[\]()<>#\\*_~])/gu, (_m, tag, c) => (tag ? `{hashtag|\\#|${tag}}` : `\\${c}`));
}
export function problemasTexto(texto: unknown): string[] {
  const t = typeof texto === "string" ? texto : "";
  if (!t.trim()) return ["o texto do LinkedIn não pode ser vazio"];
  if ([...t].length > LIMITE_TEXTO) return [`o texto tem ${[...t].length} caracteres: o LinkedIn aceita até ${LIMITE_TEXTO} (limite do ugcPosts legado; a Posts API não fixa um número)`];
  return [];
}

/** Corpo do POST /rest/posts (puro). `conteudo`: { media: { id, altText?, title? } } | { multiImage: { images: [{ id, altText? }] } } | undefined. */
export function montarPost({ autor, texto, conteudo }: { autor: string; texto: string; conteudo?: Record<string, unknown> }) {
  return { author: autor, commentary: textoLittle(texto), visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false, ...(conteudo ? { content: conteudo } : {}) };
}

// ---------- mídia ----------
async function bytesInteiros(f: any): Promise<Uint8Array> { return f.ler(0, f.tamanho); }

async function subirImagem(ctx: any, token: string, owner: string, ref: string): Promise<string> {
  const f = await ctx.midia.abrir(ref), bytes = await bytesInteiros(f);
  const ini: any = await (await chamar(ctx, token, `${API}/images?action=initializeUpload`, { method: "POST", headers: { ...CAB(), "content-type": "application/json" }, body: json({ initializeUploadRequest: { owner } }) })).json();
  const v = ini?.value;
  if (!v?.uploadUrl || !v?.image) throw erroLinkedin(CODIGOS.erro, "resposta de initializeUpload de imagem sem uploadUrl", { transitorio: true });
  await chamar(ctx, token, v.uploadUrl, { method: "PUT", headers: { "content-type": f.mime || "application/octet-stream" }, body: bytes as any });
  return v.image;
}

async function subirVideo(ctx: any, token: string, owner: string, ref: string): Promise<string> {
  const f = await ctx.midia.abrir(ref);
  const ini: any = await (await chamar(ctx, token, `${API}/videos?action=initializeUpload`, { method: "POST", headers: { ...CAB(), "content-type": "application/json" }, body: json({ initializeUploadRequest: { owner, fileSizeBytes: f.tamanho, uploadCaptions: false, uploadThumbnail: false } }) })).json();
  const v = ini?.value, partes: { firstByte: number; lastByte: number; uploadUrl: string }[] = v?.uploadInstructions || [];
  if (!v?.video || !partes.length) throw erroLinkedin(CODIGOS.erro, "resposta de initializeUpload de vídeo sem partes", { transitorio: true });
  const etags: string[] = [];
  for (const p of partes) {
    const dados = await f.ler(p.firstByte, p.lastByte - p.firstByte + 1);
    const r = await chamar(ctx, token, p.uploadUrl, { method: "PUT", headers: { "content-type": "application/octet-stream" }, body: dados as any });
    const etag = r.headers.get("etag");
    if (!etag) throw erroLinkedin(CODIGOS.erro, "a parte do vídeo subiu mas a resposta veio sem ETag", { transitorio: true });
    etags.push(etag.replace(/^"|"$/g, "")); // a doc mostra o ETag sem aspas em uploadedPartIds
  }
  await chamar(ctx, token, `${API}/videos?action=finalizeUpload`, { method: "POST", headers: { ...CAB(), "content-type": "application/json" }, body: json({ finalizeUploadRequest: { video: v.video, uploadToken: v.uploadToken ?? "", uploadedPartIds: etags } }) });
  return v.video;
}

/** Publica no perfil. Devolve { id (urn), url }. Confere o texto e o limite diário ANTES de qualquer chamada. */
export async function publicar({ item, ctx }: { item: any; ctx: any }) {
  const t = item.textos?.linkedin?.texto ?? item.textos?.texto ?? item.texto;
  const prob = problemasTexto(t); if (prob[0]) throw erroLinkedin(CODIGOS.recusado, prob[0], { status: 422, definitivo: true });
  const k = item.kind || "video", imgs: { midia: string; alt?: string | null }[] = item.images || [];
  if ((k === "image" || k === "carousel") && (imgs.length < 1 || imgs.length > IMAGENS_MAX)) throw erroLinkedin(CODIGOS.recusado, `de 1 a ${IMAGENS_MAX} imagens`, { status: 422, definitivo: true });
  let tam = 0, video: any = null;
  if (k === "video") { video = await ctx.midia.abrir(item.video); tam = video.tamanho; if (tam > VIDEO_MAX_BYTES) throw erroLinkedin(CODIGOS.recusado, `o vídeo tem ${(tam / 1048576).toFixed(0)} MB: o LinkedIn aceita até ${VIDEO_MAX_BYTES / 1048576} MB`, { status: 422, definitivo: true }); }
  const necessarias = chamadasNecessarias({ ...item, kind: k }, tam);
  if (necessarias > LIMITE_CHAMADAS_DIA) throw erroLinkedin(CODIGOS.limite, `este post exige ${necessarias} chamadas e o LinkedIn permite ${LIMITE_CHAMADAS_DIA} por dia por membro`, { status: 429, definitivo: true });
  if (ctx.deps?.verificarLinkedin) await ctx.deps.verificarLinkedin(necessarias); // recusa antes de subir nada, se o canal não tem mais essa folga hoje
  const token = await tokenValido(ctx), reg = await lerRegistro(ctx);
  let sub = reg.sub;
  if (!sub) { const u: any = await (await ctx.fetchFn(USERINFO, { headers: { authorization: `Bearer ${token}` } })).json().catch(() => ({})); sub = u?.sub; }
  if (!sub) throw erroLinkedin(CODIGOS.recusado, "não consegui descobrir o id do perfil (reconecte o canal)", { definitivo: true });
  const autor = `urn:li:person:${sub}`;
  let conteudo: Record<string, unknown> | undefined;
  if (k === "image" && imgs.length === 1) { const id = await subirImagem(ctx, token, autor, imgs[0]!.midia); conteudo = { media: { id, ...(imgs[0]!.alt ? { altText: imgs[0]!.alt } : {}) } }; }
  else if (k === "image" || k === "carousel") {
    if (imgs.length < IMAGENS_MIN) throw erroLinkedin(CODIGOS.recusado, `um carrossel precisa de ${IMAGENS_MIN} a ${IMAGENS_MAX} imagens`, { status: 422, definitivo: true });
    const ids: string[] = []; for (const im of imgs) ids.push(await subirImagem(ctx, token, autor, im.midia));
    conteudo = { multiImage: { images: ids.map((id, i) => ({ id, ...(imgs[i]!.alt ? { altText: imgs[i]!.alt } : {}) })) } };
  } else if (k === "video") { const id = await subirVideo(ctx, token, autor, item.video); conteudo = { media: { id, ...(item.titulo ? { title: String(item.titulo).slice(0, 200) } : {}) } }; }
  const r = await chamar(ctx, token, `${API}/posts`, { method: "POST", headers: { ...CAB(), "content-type": "application/json" }, body: json(montarPost({ autor, texto: t, conteudo })) });
  const id = r.headers.get("x-restli-id");
  if (!id) throw erroLinkedin(CODIGOS.erro, "o post foi aceito mas a resposta veio sem x-restli-id", { transitorio: true });
  return { id, url: `https://www.linkedin.com/feed/update/${id}/` };
}

/** Apaga um post (usado pelo cancelamento quando o post já saiu). 204, idempotente. */
export async function apagar({ ctx, id }: { ctx: any; id: string }) {
  const token = await tokenValido(ctx);
  await chamar(ctx, token, `${API}/posts/${encodeURIComponent(id)}`, { method: "DELETE", headers: { ...CAB(), "x-restli-method": "DELETE" } });
  return true;
}

/** { conectado, detalhe (nome), canalId (sub) }; vencido sem refresh = não conectado ("reconectar"). Chama só o userinfo (fora do contador de /rest). */
export async function status({ ctx }: { ctx: any }) {
  const bruto = await ctx.segredos.obter(REF_TOKEN);
  if (!bruto) return { conectado: false, detalhe: "não conectado" };
  const d = diagnosticoToken(bruto, agoraDe(ctx));
  if (d.expired) return { conectado: false, detalhe: "reconectar: o acesso ao LinkedIn venceu" };
  try {
    const token = await tokenValido(ctx);
    const r = await ctx.fetchFn(USERINFO, { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) { if (r.status === 401) await invalidar(ctx); return { conectado: false, detalhe: r.status === 401 ? "reconectar: o LinkedIn recusou o acesso" : `LinkedIn respondeu ${r.status}` }; }
    const u: any = await r.json();
    const nomePerfil = u.name || [u.given_name, u.family_name].filter(Boolean).join(" ") || "LinkedIn";
    return u.sub ? { conectado: true, detalhe: nomePerfil, canalId: String(u.sub), nome: nomePerfil, avatar: typeof u.picture === "string" ? u.picture : null } : { conectado: false, detalhe: "o LinkedIn não devolveu o id do perfil (sub)" };
  } catch (e: any) { return { conectado: false, detalhe: String(e.message).slice(0, 200) }; }
}

export function planejar({ item }: { item: any }) {
  const t = item.textos?.linkedin?.texto ?? "";
  return [`LinkedIn (perfil): ${item.kind || "video"}, ${[...String(t)].length} caracteres`];
}

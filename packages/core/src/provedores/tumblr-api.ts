// Provedor do Tumblr (API v2 oficial, OAuth2; T-046, docs/tumblr.md), versão SEM Node: só fetch e o que entra por `ctx` (igual ao linkedin-api.ts).
//   ctx.fetchFn                     fetch
//   ctx.segredos.obter/guardar      o registro do token (cifrado no servidor) e `tumblr/cliente` (consumer key e secret, vêm dos secrets do Worker)
//   ctx.midia.abrir(ref)            → { tamanho, mime?, ler(inicio, n) → bytes }
//   ctx.deps.agora                  relógio
// NUNCA coloque token, segredo ou resposta de token em mensagem de erro ou log.
export const nome = "tumblr";
export const rede = "tumblr";
export const imediato = true; // o Tumblr tem `state: queue` + `publish_on`, mas a doc é contraditória (exemplo "queued") e a fila do blog é limitada a 1000: o Praeko agenda e publica na hora marcada

export const REF_TOKEN = "tumblr/token";
export const ESCOPOS = ["basic", "write", "offline_access"];
export const AUTH = "https://www.tumblr.com/oauth2/authorize", TOKEN = "https://api.tumblr.com/v2/oauth2/token";
export const API = "https://api.tumblr.com/v2";
/** Limites da doc NPF: 4096 code points por bloco de texto, até 30 blocos de imagem, 1 vídeo nativo por post. Limites por arquivo NÃO estão documentados para o NPF. */
export const LIMITE_BLOCO = 4096, IMAGENS_MAX = 30;
/** Teto de prudência nosso (não é do Tumblr): o texto inteiro, em code points. */
export const LIMITE_TEXTO = 20000;
/** Teto de prudência nosso: o vídeo sobe inteiro na memória do Worker. O legado `/post` fala em 500 MB; o NPF não documenta. Subir só depois de teste real. */
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const TAGS_MAX = 30;
const TOLERANCIA_MS = 60e3;

const agoraDe = (ctx: any): number => (ctx.deps?.agora ? ctx.deps.agora() : Date.now());

// ---------- erros tipados ----------
export type ErroTumblr = Error & { status?: number; codigo: string; definitivo?: boolean; transitorio?: boolean; retryAfter?: number };
export const CODIGOS = { vencido: "tumblr_token_vencido", invalido: "tumblr_token_invalido", proibido: "tumblr_proibido", recusado: "tumblr_recusado", limite: "tumblr_limite_excedido", erro: "tumblr_erro", video: "tumblr_video_processando" } as const;
const MSGS: Record<string, string> = {
  [CODIGOS.vencido]: "o acesso ao Tumblr venceu: reconecte o canal em Canais",
  [CODIGOS.invalido]: "o Tumblr recusou o acesso (401): reconecte o canal em Canais",
  [CODIGOS.proibido]: "o Tumblr negou a ação (403)",
  [CODIGOS.recusado]: "o Tumblr recusou o pedido",
  [CODIGOS.limite]: "o limite do Tumblr foi atingido",
  [CODIGOS.erro]: "o Tumblr falhou",
  [CODIGOS.video]: "o Tumblr ainda está processando o vídeo",
};
/** Código público (inglês, estável) de cada código interno: vai entre colchetes no começo do texto do erro do item. */
export const CODIGO_PUBLICO: Readonly<Record<string, string>> = { tumblr_token_vencido: "tumblr_token_expired", tumblr_token_invalido: "tumblr_token_invalid", tumblr_proibido: "tumblr_forbidden", tumblr_recusado: "tumblr_rejected", tumblr_limite_excedido: "tumblr_limit_exceeded", tumblr_erro: "tumblr_error", tumblr_video_processando: "tumblr_video_processing" };
export const erroTumblr = (codigo: string, detalhe: string | null, extra: Partial<ErroTumblr> = {}): ErroTumblr =>
  Object.assign(new Error(`[${CODIGO_PUBLICO[codigo] ?? codigo}] ${MSGS[codigo] ?? codigo}${detalhe ? `: ${detalhe}` : ""}`), { codigo }, extra) as ErroTumblr;

/** Resumo SEGURO do corpo de erro do Tumblr (meta.msg e errors[].code/detail; nunca o corpo inteiro). Devolve também o código "403.8011" quando houver. */
function resumo(corpo: unknown): { texto: string; codigo: string } {
  let j: any = null; try { j = JSON.parse(String(corpo)); } catch { /* não é JSON */ }
  const e = Array.isArray(j?.errors) ? j.errors[0] : null, codigo = String(e?.code ?? ""), m = e?.detail || e?.title || j?.meta?.msg || j?.error_description || j?.error || "";
  return { texto: String(m).replace(/\s+/g, " ").slice(0, 200), codigo: codigo.slice(0, 16) };
}
/** Resposta de erro HTTP → erro tipado (nunca 500 genérico). Códigos de limite diário (403.8004/8011/8022/8023) não se repetem; 403.8010 (vídeo ainda processando) se repete. */
export function falha(status: number, corpo: unknown, cab?: { get(n: string): string | null } | null): ErroTumblr {
  const r = resumo(corpo), s = `HTTP ${status}${r.codigo ? ` ${r.codigo}` : ""}${r.texto ? ` ${r.texto}` : ""}`;
  if (status === 401) return erroTumblr(CODIGOS.invalido, s, { status, definitivo: true });
  if (status === 403 && r.codigo === "403.8010") return erroTumblr(CODIGOS.video, s, { status, transitorio: true });
  if (status === 403 && ["403.8004", "403.8011", "403.8022", "403.8023"].includes(r.codigo)) return erroTumblr(CODIGOS.limite, s, { status, definitivo: true });
  if (status === 403) return erroTumblr(CODIGOS.proibido, s, { status, definitivo: true });
  if (status === 429) { const ra = Number(cab?.get("retry-after")); return erroTumblr(CODIGOS.limite, s, { status, transitorio: true, ...(Number.isFinite(ra) && ra > 0 ? { retryAfter: ra } : {}) }); }
  if (status >= 500) return erroTumblr(CODIGOS.erro, s, { status, transitorio: true }); // 503 = postagem desligada, 500.8006/8009 = erro de upload
  return erroTumblr(CODIGOS.recusado, s, { status, definitivo: true }); // 400.8001/8005 (NPF ou mídia inválida), 404…
}

// ---------- OAuth ----------
/** Monta a URL de autorização (puro). O Tumblr não documenta PKCE: o state de uso único é o que protege o retorno. */
export function urlAutorizacao({ clientId, redirect, estado }: { clientId: string; redirect: string; estado: string }) {
  return `${AUTH}?${new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirect, state: estado, scope: ESCOPOS.join(" ") })}`;
}
export async function trocarCodigo(ctx: any, cl: { client_id: string; client_secret: string }, { codigo, redirect }: { codigo: string; redirect: string }) {
  const r = await ctx.fetchFn(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code: codigo, client_id: cl.client_id, client_secret: cl.client_secret, redirect_uri: redirect }).toString() });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Tumblr recusou o código: ${String(j.error_description || j.error || j.meta?.msg || `HTTP ${r.status}`).slice(0, 200)}`);
  return j;
}

export type BlogTumblr = { name: string; title?: string; primary?: boolean; url?: string };
export type RegistroToken = { access_token: string; refresh_token?: string; expiry: number; escopos: string[]; user?: string; blogs?: BlogTumblr[]; blog?: string };
/** Os blogs de GET /user/info (aceita `response.user.blogs`, o formato real, e `response.blogs`, o que a página da doc mostra). Só name/title/primary/url. */
export function blogsDe(info: any): { user: string | null; blogs: BlogTumblr[] } {
  const u = info?.response?.user ?? info?.response ?? info?.user ?? {}, lista: any[] = Array.isArray(u.blogs) ? u.blogs : [];
  return { user: u.name ? String(u.name) : null, blogs: lista.filter((b) => b?.name).map((b) => ({ name: String(b.name), ...(b.title ? { title: String(b.title).slice(0, 120) } : {}), primary: !!b.primary, ...(b.url ? { url: String(b.url) } : {}) })) };
}
/** O blog onde se posta: o escolhido (se ainda existir na lista) ou o primário (ou o primeiro). */
export const blogAtivo = (t: Pick<RegistroToken, "blogs" | "blog">): string | null => {
  const l = t.blogs || [];
  return (t.blog && (!l.length || l.some((b) => b.name === t.blog)) ? t.blog : null) ?? l.find((b) => b.primary)?.name ?? l[0]?.name ?? null;
};
/** O registro do token como é guardado (JSON em texto). `extra`: { user, blogs, blog } lidos de /user/info (o servidor os junta na conexão). */
export function registroToken(j: any, agora: number, extra: { user?: string | null; blogs?: BlogTumblr[]; blog?: string | null } = {}): string {
  const r: RegistroToken = { access_token: j.access_token, expiry: agora + (Number(j.expires_in) || 2520) * 1000, escopos: String(j.scope || ESCOPOS.join(" ")).split(/[ ,]+/).filter(Boolean) };
  if (j.refresh_token) r.refresh_token = j.refresh_token;
  if (extra.user) r.user = extra.user;
  if (extra.blogs?.length) r.blogs = extra.blogs;
  const b = blogAtivo({ blogs: extra.blogs, blog: extra.blog ?? undefined }); if (b) r.blog = b;
  return JSON.stringify(r);
}
/** O que o painel mostra: validade do access token e se há renovação. O access dura ~42 min; com refresh o canal segue conectado. Puro. */
export function diagnosticoToken(bruto: string | null | undefined, agora: number): { tokenExpiresAt: string | null; refreshAvailable: boolean; expired: boolean } {
  if (!bruto) return { tokenExpiresAt: null, refreshAvailable: false, expired: false };
  let t: RegistroToken; try { t = JSON.parse(bruto); } catch { return { tokenExpiresAt: null, refreshAvailable: false, expired: true }; }
  const refresh = !!t.refresh_token, vencido = !Number.isFinite(t.expiry) || t.expiry <= agora;
  return { tokenExpiresAt: Number.isFinite(t.expiry) && t.expiry > 0 ? new Date(t.expiry).toISOString() : null, refreshAvailable: refresh, expired: vencido && !refresh };
}

async function lerRegistro(ctx: any): Promise<RegistroToken> {
  const bruto = await ctx.segredos.obter(REF_TOKEN);
  if (!bruto) throw erroTumblr(CODIGOS.invalido, "Tumblr não conectado", { status: 401, definitivo: true });
  return JSON.parse(bruto);
}
/** Uma renovação por vez por refresh token (dentro da instância): o Tumblr não documenta se o refresh token é de uso único, então duas renovações juntas são evitadas. */
const emRenovacao = new Map<string, Promise<string>>();
/** Access token válido: renova pelo refresh token quando vencido; sem refresh, vencido = erro `tumblr_token_vencido` (canal "reconectar"). Guarda o refresh token novo SE o Tumblr mandar um. */
export async function tokenValido(ctx: any): Promise<string> {
  const t = await lerRegistro(ctx), agora = agoraDe(ctx);
  if (t.access_token && t.expiry - TOLERANCIA_MS > agora) return t.access_token;
  if (!t.refresh_token) throw erroTumblr(CODIGOS.vencido, null, { status: 401, definitivo: true });
  const chave = t.refresh_token, em = emRenovacao.get(chave);
  if (em) return em;
  const p = (async () => {
    const cl = await ctx.segredos.obter("tumblr/cliente"); const c = cl ? JSON.parse(cl) : null;
    if (!c?.client_id || !c?.client_secret) throw erroTumblr(CODIGOS.erro, "sem credencial do app para renovar", { definitivo: true });
    const r = await ctx.fetchFn(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.refresh_token!, client_id: c.client_id, client_secret: c.client_secret }).toString() });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) { if (r.status >= 500) throw erroTumblr(CODIGOS.erro, `a renovação falhou (HTTP ${r.status})`, { status: r.status, transitorio: true }); await invalidar(ctx); throw erroTumblr(CODIGOS.vencido, `a renovação foi recusada (${String(j.error || `HTTP ${r.status}`).slice(0, 80)})`, { status: 401, definitivo: true }); }
    const novo: RegistroToken = { ...t, access_token: j.access_token, expiry: agora + (Number(j.expires_in) || 2520) * 1000, ...(j.refresh_token ? { refresh_token: j.refresh_token } : {}) };
    await ctx.segredos.guardar(REF_TOKEN, JSON.stringify(novo));
    return novo.access_token;
  })().finally(() => emRenovacao.delete(chave));
  emRenovacao.set(chave, p);
  return p;
}
/** O Tumblr disse 401 ou recusou a renovação: o registro passa a valer como vencido (o canal mostra "reconectar"). Nunca lança. */
export async function invalidar(ctx: any): Promise<void> {
  try { const bruto = await ctx.segredos.obter(REF_TOKEN); if (!bruto) return; const t = JSON.parse(bruto); await ctx.segredos.guardar(REF_TOKEN, JSON.stringify({ ...t, expiry: 0, refresh_token: undefined })); } catch { /* melhor esforço */ }
}

/** GET /user/info com um access token: { user, blogs }. Lança erro tipado se o Tumblr recusar. */
export async function lerUsuario(fetchFn: typeof fetch, token: string): Promise<{ user: string | null; blogs: BlogTumblr[] }> {
  const r = await fetchFn(`${API}/user/info`, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw falha(r.status, await r.text().catch(() => ""), r.headers);
  return blogsDe(await r.json().catch(() => ({})));
}

// ---------- chamadas ----------
async function chamar(ctx: any, token: string, url: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
  const r = await ctx.fetchFn(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    if (r.status === 401) await invalidar(ctx);
    throw falha(r.status, corpo, r.headers);
  }
  return r;
}

// ---------- texto ----------
/** `#palavra` do texto → tags do Tumblr (sem `#`, sem vírgula, sem repetir, no máximo TAGS_MAX). */
export function tagsDoTexto(texto: string): string[] {
  const vistas = new Set<string>(), saida: string[] = [];
  for (const m of String(texto).matchAll(/(^|[\s(])#([\p{L}\p{N}_]+)/gu)) { const t = m[2]!, k = t.toLowerCase(); if (!vistas.has(k)) { vistas.add(k); saida.push(t); } }
  return saida.slice(0, TAGS_MAX);
}
/** O corpo sem a(s) última(s) linha(s) que são só hashtags (elas viram tags do post; hashtag no meio da frase fica). */
export function corpoSemTags(texto: string): string {
  const linhas = String(texto).replace(/\r\n/g, "\n").split("\n");
  while (linhas.length && (!linhas[linhas.length - 1]!.trim() || /^(\s*#[\p{L}\p{N}_]+)+\s*$/u.test(linhas[linhas.length - 1]!))) linhas.pop();
  return linhas.join("\n").trim();
}
/** Parágrafos (separados por linha em branco) viram blocos de texto de até 4096 code points; um parágrafo maior é partido. */
export function blocosDeTexto(texto: string): { type: "text"; text: string }[] {
  const saida: { type: "text"; text: string }[] = [];
  for (const par of corpoSemTags(texto).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
    const cps = [...par];
    for (let i = 0; i < cps.length; i += LIMITE_BLOCO) saida.push({ type: "text", text: cps.slice(i, i + LIMITE_BLOCO).join("") });
  }
  return saida;
}
export function problemasTexto(texto: unknown, { exigir = false }: { exigir?: boolean } = {}): string[] {
  const t = typeof texto === "string" ? texto : "";
  if (exigir && !t.trim()) return ["o texto do Tumblr não pode ser vazio num post só de texto"];
  if ([...t].length > LIMITE_TEXTO) return [`o texto tem ${[...t].length} caracteres: o Praeko aceita até ${LIMITE_TEXTO} no Tumblr (o Tumblr limita cada bloco a ${LIMITE_BLOCO})`];
  return [];
}

// ---------- mídia ----------
/** Dimensões de PNG/JPEG/GIF lidas dos bytes (o NPF pede width/height; sem elas o Tumblr assume 540x405). null se não der. */
export function dimensoes(b: Uint8Array): { width: number; height: number } | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return { width: ((b[16]! << 24) | (b[17]! << 16) | (b[18]! << 8) | b[19]!) >>> 0, height: ((b[20]! << 24) | (b[21]! << 16) | (b[22]! << 8) | b[23]!) >>> 0 };
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { width: b[6]! | (b[7]! << 8), height: b[8]! | (b[9]! << 8) };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1]!;
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: (b[i + 5]! << 8) | b[i + 6]!, width: (b[i + 7]! << 8) | b[i + 8]! };
      i += 2 + ((b[i + 2]! << 8) | b[i + 3]!);
    }
  }
  return null;
}
const tipoImagem = (mime: string | undefined, b: Uint8Array) => (mime && /^image\//.test(mime) ? mime : b[0] === 0x89 ? "image/png" : b[0] === 0x47 ? "image/gif" : "image/jpeg");

/** Corpo do POST /blog/{blog}/posts (puro): { content, tags?, state }. `state` é sempre `published` (o Praeko espera a hora e publica). */
export function montarPost({ blocos, tags }: { blocos: unknown[]; tags: string[] }) {
  return { content: blocos, state: "published", ...(tags.length ? { tags: tags.join(",") } : {}) };
}
const URL_POST = (blog: string) => `${API}/blog/${encodeURIComponent(blog)}/posts`;
export const linkDoPost = (blog: string, id: string) => `https://www.tumblr.com/${blog}/${id}`;

/** Publica no blog escolhido. Devolve { id, blog, url }. Confere texto e limites ANTES de qualquer chamada. */
export async function publicar({ item, ctx }: { item: any; ctx: any }) {
  const k = item.kind || "video", t = String(item.textos?.tumblr?.texto ?? item.textos?.texto ?? item.texto ?? "");
  const prob = problemasTexto(t, { exigir: k === "text" }); if (prob[0]) throw erroTumblr(CODIGOS.recusado, prob[0], { status: 422, definitivo: true });
  const imgs: { midia: string; alt?: string | null }[] = item.images || [];
  if ((k === "image" || k === "carousel") && (imgs.length < 1 || imgs.length > IMAGENS_MAX)) throw erroTumblr(CODIGOS.recusado, `de 1 a ${IMAGENS_MAX} imagens`, { status: 422, definitivo: true });
  let video: any = null;
  if (k === "video") { video = await ctx.midia.abrir(item.video); if (video.tamanho > VIDEO_MAX_BYTES) throw erroTumblr(CODIGOS.recusado, `o vídeo tem ${(video.tamanho / 1048576).toFixed(0)} MB: o Praeko aceita até ${VIDEO_MAX_BYTES / 1048576} MB no Tumblr`, { status: 422, definitivo: true }); }
  const token = await tokenValido(ctx), reg = await lerRegistro(ctx), blog = blogAtivo(reg);
  if (!blog) throw erroTumblr(CODIGOS.recusado, "nenhum blog escolhido (reconecte o canal e escolha o blog)", { definitivo: true });
  const blocos: unknown[] = blocosDeTexto(t), partes: { id: string; bytes: Uint8Array; tipo: string }[] = [];
  if (k === "image" || k === "carousel") {
    for (const [n, im] of imgs.entries()) {
      const f = await ctx.midia.abrir(im.midia), bytes: Uint8Array = await f.ler(0, f.tamanho), tipo = tipoImagem(f.mime, bytes), d = dimensoes(bytes), id = `img${n}`;
      partes.push({ id, bytes, tipo });
      blocos.push({ type: "image", media: [{ type: tipo, identifier: id, ...(d ?? {}) }], ...(im.alt ? { alt_text: String(im.alt).slice(0, 4096) } : {}) });
    }
  } else if (k === "video") {
    const bytes: Uint8Array = await video.ler(0, video.tamanho), tipo = video.mime && /^video\//.test(video.mime) ? video.mime : "video/mp4";
    partes.push({ id: "vid0", bytes, tipo });
    blocos.push({ type: "video", media: { type: tipo, identifier: "vid0" }, provider: "tumblr" });
  }
  if (!blocos.length) throw erroTumblr(CODIGOS.recusado, "o post não tem texto nem mídia", { status: 422, definitivo: true });
  const corpo = montarPost({ blocos, tags: tagsDoTexto(t) });
  let r: Response;
  if (partes.length) { // multipart: a primeira parte é o JSON (`json`); cada arquivo vem com o nome do campo igual ao `identifier`
    const fd = new FormData(); fd.append("json", JSON.stringify(corpo));
    for (const p of partes) fd.append(p.id, new Blob([p.bytes as any], { type: p.tipo }), p.id);
    r = await chamar(ctx, token, URL_POST(blog), { method: "POST", body: fd as any });
  } else r = await chamar(ctx, token, URL_POST(blog), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
  const j: any = await r.json().catch(() => ({})), id = j?.response?.id ?? j?.response?.id_string;
  if (!id) throw erroTumblr(CODIGOS.erro, "o post foi aceito mas a resposta veio sem id", { transitorio: true });
  return { id: String(id), blog, url: linkDoPost(blog, String(id)) };
}

/** Apaga um post publicado (`POST /blog/{blog}/post/delete`, `id`). `blog` vem do resultado da publicação (o blog escolhido pode ter mudado depois). Idempotente: 404 conta como apagado. */
export async function apagar({ ctx, id, blog }: { ctx: any; id: string; blog?: string | null }) {
  const token = await tokenValido(ctx), b = blog || blogAtivo(await lerRegistro(ctx));
  if (!b) throw erroTumblr(CODIGOS.recusado, "não sei de qual blog apagar o post", { definitivo: true });
  try { await chamar(ctx, token, `${API}/blog/${encodeURIComponent(b)}/post/delete`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ id: String(id) }).toString() }); }
  catch (e: any) { if (e?.status === 404) return true; throw e; }
  return true;
}

/** { conectado, detalhe (blog escolhido), canalId (nome de usuário) }; vencido sem refresh = não conectado ("reconectar"). */
export async function status({ ctx }: { ctx: any }) {
  const bruto = await ctx.segredos.obter(REF_TOKEN);
  if (!bruto) return { conectado: false, detalhe: "não conectado" };
  if (diagnosticoToken(bruto, agoraDe(ctx)).expired) return { conectado: false, detalhe: "reconectar: o acesso ao Tumblr venceu" };
  try {
    const token = await tokenValido(ctx), reg = await lerRegistro(ctx), u = await lerUsuario(ctx.fetchFn, token);
    if (!u.user) return { conectado: false, detalhe: "o Tumblr não devolveu o nome da conta" };
    const blog = blogAtivo({ blogs: u.blogs, blog: reg.blog });
    return { conectado: true, detalhe: blog || u.user, canalId: u.user };
  } catch (e: any) { if (e?.status === 401) await invalidar(ctx); return { conectado: false, detalhe: String(e.message).slice(0, 200) }; }
}

export function planejar({ item }: { item: any }) {
  const t = String(item.textos?.tumblr?.texto ?? item.textos?.texto ?? "");
  return [`Tumblr: ${item.kind || "video"}, ${[...t].length} caracteres, ${tagsDoTexto(t).length} tag(s)`];
}

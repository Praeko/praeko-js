// Instagram pela API da Meta (login unificado: token de USUÁRIO DE SISTEMA, host graph.facebook.com, sem expiração).
// Só fetch (roda no Worker): mídias, comentários e respostas, menções por marcação, seguidores e métricas por mídia.
// Escritas (responder/ocultar comentário) só existem aqui como funções chamadas pelas rotas do servidor; publicar Reels continua no Buffer.
// Token guardado como segredo `instagram/meta` (JSON { token, userId, username, tipo, host }).
// Nomes de métricas conferidos na doc da Meta (Instagram media insights, v23): REELS aceita comments, ig_reels_avg_watch_time,
// ig_reels_video_view_total_time, likes, reach, saved, shares, total_interactions, views; `impressions` está obsoleta e `plays` não existe mais.

export const REF_META = "instagram/meta";
export const HOST_PADRAO = "https://graph.facebook.com";
export const VERSAO = "v23.0";
export const HOSTS_VALIDOS = ["https://graph.facebook.com", "https://graph.instagram.com"];

const num = (x: any) => (x != null && x !== "" && !Number.isNaN(+x) ? +x : null);
const ate = (n: any, max: any, padrao = 25) => Math.max(1, Math.min(max, Math.floor(+n) || padrao));

/** Erro com `.status` (HTTP) e `.codigo` (código da Meta) para o servidor devolver 502 com a mensagem. */
const falha = (status: any, j: any, txt: any) => Object.assign(new Error(`Instagram: ${j?.error?.message || String(txt).slice(0, 200)}${j?.error?.code ? ` (código ${j.error.code}${j.error.error_subcode ? "/" + j.error.error_subcode : ""})` : ""}`), { status: status || 502, codigo: j?.error?.code ?? null, subcodigo: j?.error?.error_subcode ?? null, mensagemMeta: j?.error?.message ?? null });

export async function lerToken(ctx: any) {
  const bruto = await ctx.segredos.obter(REF_META);
  if (!bruto) throw Object.assign(new Error("Instagram (Meta) não conectado: praeko conta instagram enviar"), { status: 409, codigoLocal: "meta_nao_conectado" });
  const t = typeof bruto === "string" ? JSON.parse(bruto) : bruto;
  if (!t?.token || !t?.userId) throw Object.assign(new Error("token do Instagram (Meta) incompleto: reenvie com praeko conta instagram enviar"), { status: 409, codigoLocal: "meta_nao_conectado" });
  return t;
}

// ---------- Conectar com a Meta (Facebook Login for Business por OAuth) ----------
// Alternativa ao token de usuário de sistema colado pela CLI: o dono autoriza no Facebook e o servidor guarda o token do usuário. Com o Login for Business
// o app usa uma CONFIGURAÇÃO (config_id: "API do Instagram (login unificado)") que define as permissões; por isso a URL NÃO leva `scope`.
// Permissões da configuração (por quê): instagram_basic (perfil e mídias), instagram_content_publish (publicar Reels), instagram_manage_comments
// (ler/responder/ocultar comentários), instagram_manage_insights (métricas e seguidores), pages_show_list + pages_read_engagement (listar as Páginas e ler
// o instagram_business_account ligado a elas). O token pode vir de curta duração (~1–2 h, vira longo por fb_exchange_token, ~60 dias, renovado no Cron)
// ou como token de acesso de negócio sem expiração (expires_in ausente: nada a renovar). O resto do sistema lê o mesmo segredo `instagram/meta`.
export const DIALOGO_OAUTH = "https://www.facebook.com/dialog/oauth";
export const LONGO_MIN_S = 30 * 86400;          // expires_in menor que isto = token curto: troca por longa duração

/** URL de login: client_id + config_id + response_type=code (override_default_response_type). Sem PKCE (o login web da Meta não o usa): vale o `state` de uso único. */
export function urlAutorizacaoOAuth({ appId, configId, escopos, redirect, estado }: any) {
  const u = new URL(DIALOGO_OAUTH);
  u.searchParams.set("client_id", appId); u.searchParams.set("display", "popup");
  // `escopos` (só no probe): login "clássico" por scope, que devolve um token de USUÁRIO (é o fluxo do guia "Instagram API with Facebook Login": instagram_basic + pages_show_list → /me/accounts)
  if (escopos) u.searchParams.set("scope", escopos); else { u.searchParams.set("config_id", configId); u.searchParams.set("override_default_response_type", "true"); }
  u.searchParams.set("redirect_uri", redirect);
  u.searchParams.set("response_type", "code"); u.searchParams.set("state", estado); u.searchParams.set("prompt", "login");
  return u.toString();
}
async function grafoOAuth(ctx: any, caminho: any, params: any) {
  const u = new URL(`${HOST_PADRAO}/${VERSAO}/${caminho}`);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v as string);
  const r = await (ctx.fetchFn || fetch)(u.toString(), { method: "GET" });
  const txt = await r.text();
  let j; try { j = txt ? JSON.parse(txt) : {}; } catch { throw falha(r.status, null, txt); }
  if (j.error || !r.ok) throw falha(r.status, j, txt);
  return j;
}
/** { token, expiraEmS } — expiraEmS null = sem expiração (a Meta não mandou expires_in). */
const tokenDe = (j: any, etapa: any) => {
  if (!j?.access_token) throw Object.assign(new Error(`Instagram: a Meta não devolveu o token (${etapa})`), { status: 502, codigo: null });
  const n = num(j.expires_in);
  return { token: String(j.access_token), expiraEmS: n && n > 0 ? n : null };
};
/** code → token (curto ou de negócio). */
export async function trocarCodigoOAuth(ctx: any, { appId, appSecret, codigo, redirect }: any) {
  return tokenDe(await grafoOAuth(ctx, "oauth/access_token", { client_id: appId, client_secret: appSecret, redirect_uri: redirect, code: codigo }), "troca do código");
}
/** token → token de longa duração (~60 dias). Serve também para a renovação (um longo vira outro longo). */
export async function estenderTokenOAuth(ctx: any, { appId, appSecret, token }: any) {
  const r = tokenDe(await grafoOAuth(ctx, "oauth/access_token", { grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: token }), "troca por longa duração");
  return { ...r, expiraEmS: r.expiraEmS ?? 60 * 86400 };
}
const CAMPOS_IG = "id,username,name,profile_picture_url,followers_count";
const contaIg = (ig: any, pagina: any) => ({ pagina, instagram: { id: String(ig.id), usuario: ig.username || null, nome: ig.name || null, avatar: ig.profile_picture_url || null, seguidores: num(ig.followers_count) } });
/** debug_token (token do app `APP_ID|APP_SECRET`): tipo, validade e escopos granulares. Com o Login for Business os ativos (Instagram, portfólio, Páginas) são
 *  escolhidos na tela de login e aparecem como `target_ids` de cada escopo. Nunca devolve nem registra o token. */
export async function inspecionarToken(ctx: any, { appId, appSecret, token }: any) {
  const j = await grafoOAuth(ctx, "debug_token", { input_token: token, access_token: `${appId}|${appSecret}` }), d = j.data || {};
  const iso = (n: any) => (n ? new Date(Number(n) * 1000).toISOString() : null);
  return { tipo: d.type || null, userId: d.user_id ? String(d.user_id) : null, valido: d.is_valid ?? null, expiraEm: d.expires_at ? iso(d.expires_at) : null, dadosExpiramEm: d.data_access_expires_at ? iso(d.data_access_expires_at) : null,
    escopos: (d.granular_scopes || []).map((g: any) => ({ escopo: String(g.scope), ids: (g.target_ids || []).map(String) })), escoposGerais: (d.scopes || []).map(String) };
}
const CAMPOS_IG_BASE = "id,username,name,profile_picture_url";
const ARESTAS_NEGOCIO = ["instagram_accounts", "owned_instagram_accounts", "client_instagram_accounts"];

/**
 * Descobre as contas profissionais do Instagram que o token alcança. Em ordem (para na primeira que achar, salvo `tudo`, usado pelo probe):
 *  (a) debug_token → target_ids: cada id é testado como conta de Instagram; se não for, como portfólio (instagram_accounts, owned_…, client_…) ou Página;
 *  (b) /me e os ativos de um usuário de sistema (/me/instagram_accounts, /me/assigned_pages);
 *  (c) /me/businesses → arestas do portfólio;  (d) /me/accounts → instagram_business_account.
 * Devolve { contas, diag, token, passos }: `passos` é o relatório sanitizado de cada tentativa (status, contagem, erro da Meta) e nunca contém o token.
 */
export async function descobrirContas(ctx: any, token: any, { appId, appSecret, tudo = false, negocios = [] }: any = {}) {
  const contas: any[] = [], vistos = new Set(), passos: any[] = [];
  const por = (c: any) => { if (!vistos.has(c.instagram.id)) { vistos.add(c.instagram.id); contas.push(c); } };
  const limpa = (x: any) => String(x ?? "").split(token).join("***");
  const tentar = async (passo: any, fn: any, resumir = (v: any) => `${(v?.data || []).length} item(ns)`) => {
    try { const v = await fn(); passos.push({ passo, ok: true, resumo: resumir(v) }); return v; }
    catch (e) { passos.push({ passo, ok: false, http: e.status ?? null, codigo: e.codigo ?? null, subcodigo: e.subcodigo ?? null, mensagem: limpa(e.mensagemMeta || e.message).slice(0, 300) }); return null; }
  };
  const parar = () => !tudo && contas.length > 0;
  const diag: Record<string, any> = { escopos: [], idsPorEscopo: {}, idsInstagram: 0, resolvidos: 0, debugToken: appId && appSecret ? "ok" : "sem_credencial", paginas: 0, portfolios: 0 };
  const doIg = (ig: any, pagina: any = null) => ig?.id && por(contaIg(ig, pagina));
  const arestas = async (negocio: any, lista = ARESTAS_NEGOCIO) => { for (const a of lista) { const j = await tentar(`/${negocio}/${a}`, () => grafoOAuth(ctx, `${negocio}/${a}`, { fields: CAMPOS_IG_BASE, limit: 100, access_token: token })); for (const ig of j?.data || []) doIg(ig); } };
  let info = null, clienteNegocio: any = null;
  // (a) debug_token
  if (appId && appSecret) {
    info = await tentar("debug_token", () => inspecionarToken(ctx, { appId, appSecret, token }), (v) => `tipo ${v.tipo || "?"}, ${v.valido ? "válido" : "inválido"}, ${v.escopos.length} escopo(s)`);
    if (!info) diag.debugToken = "falhou";
    else {
      diag.escopos = info.escopos.map((g: any) => g.escopo); for (const g of info.escopos) diag.idsPorEscopo[g.escopo] = g.ids.length;
      const dica = (e: any) => (e.startsWith("instagram_") ? "ig" : e.startsWith("pages_") ? "pagina" : e.includes("business") ? "negocio" : null);
      const alvos = new Map(); // id → dica mais forte
      for (const g of info.escopos) for (const id of g.ids.slice(0, 20)) { const d = dica(g.escopo); if (d && (!alvos.has(id) || d === "ig")) alvos.set(id, d); }
      diag.idsInstagram = [...new Set(info.escopos.filter((g: any) => g.escopo.startsWith("instagram_")).flatMap((g: any) => g.ids))].length;
      for (const [id, d] of alvos) {
        if (d !== "pagina") {
          const ig = d === "ig" ? await tentar(`/${id} (como conta de Instagram)`, () => grafoOAuth(ctx, id, { fields: CAMPOS_IG, access_token: token }), (v) => `@${v.username || "?"}`) : null;
          if (ig?.id && ig.username) { doIg(ig); diag.resolvidos++; continue; }
          await arestas(id); // não é conta de Instagram: tenta como portfólio
        } else {
          const pg = await tentar(`/${id} (como Página)`, () => grafoOAuth(ctx, id, { fields: `id,name,instagram_business_account{${CAMPOS_IG}}`, access_token: token }), (v) => (v.instagram_business_account ? "com Instagram ligado" : "sem Instagram ligado"));
          if (pg?.instagram_business_account) doIg(pg.instagram_business_account, { id: String(pg.id), nome: pg.name || null });
        }
      }
    }
  }
  // (b) token de usuário de sistema / portfólio
  if (tudo) { // probe: quem é a conta do Facebook que fez o login (só id e nome) e, se pedido, as arestas de um portfólio conhecido
    await tentar("/me?fields=id,name (quem fez o login)", () => grafoOAuth(ctx, "me", { fields: "id,name", access_token: token }), (v) => `id ${v.id ?? "(vazio)"}${v.name ? `, ${v.name}` : ""}`);
    for (const n of negocios) await arestas(n, [...ARESTAS_NEGOCIO, "owned_pages", "client_pages"]);
  }
  if (!parar()) {
    // token de portfólio (SYSTEM_USER / Business Integration System User): /me traz o client_business_id, o portfólio do cliente que fez o login
    const eu = await tentar("/me?fields=id,name,client_business_id", () => grafoOAuth(ctx, "me", { fields: "id,name,client_business_id", access_token: token }), (v) => `id ${v.id ?? "(vazio)"}${v.name ? `, ${v.name}` : ""}, client_business_id ${v.client_business_id ?? "(vazio)"}`);
    clienteNegocio = eu?.client_business_id ? String(eu.client_business_id) : null;
    const perm = await tentar("/me/permissions", () => grafoOAuth(ctx, "me/permissions", { access_token: token }), (v) => `${(v?.data || []).filter((x: any) => x.status === "granted").length} concedida(s): ${(v?.data || []).filter((x: any) => x.status === "granted").map((x: any) => x.permission).join(", ") || "nenhuma"}`);
    void perm;
    if (clienteNegocio) {
      await arestas(clienteNegocio, [...ARESTAS_NEGOCIO, "assigned_instagram_accounts"]);
      const nb = await tentar(`/${clienteNegocio}?fields=instagram_accounts{id,username}`, () => grafoOAuth(ctx, clienteNegocio, { fields: "instagram_accounts{id,username}", access_token: token }), (v) => `${(v?.instagram_accounts?.data || []).length} item(ns)`);
      for (const ig of nb?.instagram_accounts?.data || []) doIg(ig);
    }
    // Documentado pela Meta (System User → assigned_instagram_accounts): as contas do Instagram que o usuário de sistema pode usar
    const aia = await tentar("/me/assigned_instagram_accounts", () => grafoOAuth(ctx, "me/assigned_instagram_accounts", { fields: CAMPOS_IG_BASE, limit: 100, access_token: token }));
    for (const ig of aia?.data || []) doIg(ig);
    const ia = await tentar("/me/instagram_accounts", () => grafoOAuth(ctx, "me/instagram_accounts", { fields: CAMPOS_IG_BASE, limit: 100, access_token: token }));
    for (const ig of ia?.data || []) doIg(ig);
    const ap = await tentar("/me/assigned_pages", () => grafoOAuth(ctx, "me/assigned_pages", { fields: `id,name,instagram_business_account{${CAMPOS_IG}}`, limit: 100, access_token: token }));
    for (const p of ap?.data || []) if (p.instagram_business_account?.id) doIg(p.instagram_business_account, { id: String(p.id), nome: p.name || null });
  }
  // (c) portfólios
  if (!parar()) {
    const b = await tentar("/me/businesses", () => grafoOAuth(ctx, "me/businesses", { fields: `id,name,owned_instagram_accounts{${CAMPOS_IG}},instagram_accounts{${CAMPOS_IG}}`, limit: 100, access_token: token }));
    diag.portfolios = (b?.data || []).length;
    for (const n of b?.data || []) { for (const ig of [...(n.owned_instagram_accounts?.data || []), ...(n.instagram_accounts?.data || [])]) doIg(ig); if (!contas.length || tudo) await arestas(n.id); }
  }
  // (d) Páginas
  if (!parar()) {
    const j = await tentar("/me/accounts", () => grafoOAuth(ctx, "me/accounts", { fields: `id,name,instagram_business_account{${CAMPOS_IG}}`, limit: 100, access_token: token }));
    diag.paginas = (j?.data || []).length;
    for (const p of j?.data || []) if (p.instagram_business_account?.id) doIg(p.instagram_business_account, { id: String(p.id), nome: p.name || null });
  }
  return { contas, diag, token: info, passos, clienteNegocio };
}
/** Antes de guardar: o token lê a conta e a publicação foi concedida (debug_token; se ele não responder, content_publishing_limit, que só funciona com instagram_content_publish). */
export async function verificarAcesso(ctx: any, { token, igId, info }: any) {
  let usuario = null;
  try { usuario = (await grafoOAuth(ctx, igId, { fields: "id,username", access_token: token })).username || null; }
  catch (e) { return { ok: false, motivo: "leitura", detalhe: e.mensagemMeta || e.message }; }
  if (info) return info.escopos.some((g: any) => g.escopo === "instagram_content_publish") || info.escoposGerais.includes("instagram_content_publish") ? { ok: true, usuario } : { ok: false, motivo: "publicar", detalhe: "instagram_content_publish não consta nos escopos concedidos" };
  try { await grafoOAuth(ctx, `${igId}/content_publishing_limit`, { fields: "quota_usage", access_token: token }); return { ok: true, usuario }; }
  catch (e) { return { ok: false, motivo: "publicar", detalhe: e.mensagemMeta || e.message }; }
}

/** Chamada à Graph API. `t`: o token (para validar antes de guardar, passe o objeto direto). Nunca devolve nem registra o access_token. */
export async function chamar(ctx: any, caminho: any, params = {}, { metodo = "GET", t }: any = {}) {
  const tk = t || (await lerToken(ctx));
  const url = new URL(`${tk.host || HOST_PADRAO}/${VERSAO}/${caminho}`);
  const init: Record<string, any> = { method: metodo };
  if (metodo === "GET") { for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v as string); url.searchParams.set("access_token", tk.token); }
  else { init.headers = { "content-type": "application/x-www-form-urlencoded" }; init.body = new URLSearchParams([...Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]), ["access_token", tk.token]]).toString(); }
  const r = await (ctx.fetchFn || fetch)(url.toString(), init);
  const txt = await r.text();
  let j; try { j = txt ? JSON.parse(txt) : {}; } catch { throw falha(r.status, null, txt); }
  if (j.error || !r.ok) throw falha(r.status, j, txt);
  return j;
}

const CAMPOS_MIDIA = "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count";
const tipoDe = (m: any) => (m.media_product_type === "REELS" ? "reel" : m.media_type === "VIDEO" ? "video" : m.media_type === "CAROUSEL_ALBUM" ? "carrossel" : m.media_product_type === "STORY" ? "story" : "imagem");
const primeiraLinha = (t: any, max = 120) => { const l = String(t || "").split("\n").map((x) => x.trim()).find(Boolean) || ""; return l.length > max ? `${l.slice(0, max - 1)}…` : l; };

export const midiaDe = (m: any) => ({
  id: m.id, rede: "instagram", titulo: primeiraLinha(m.caption), legenda: m.caption || "", tipo: tipoDe(m),
  thumbnail: m.thumbnail_url || (m.media_type === "IMAGE" || m.media_type === "CAROUSEL_ALBUM" ? m.media_url : null) || null,
  permalink: m.permalink || null, publicadoEm: m.timestamp || null, curtidas: num(m.like_count), comentarios: num(m.comments_count),
});

/** Conta: seguidores, seguindo, mídias, usuário e foto. */
export async function perfil({ ctx, t }: any) {
  const tk = t || (await lerToken(ctx));
  const j = await chamar(ctx, tk.userId, { fields: "username,name,profile_picture_url,followers_count,follows_count,media_count" }, { t: tk });
  return { id: String(j.id || tk.userId), usuario: j.username, nome: j.name || null, avatar: j.profile_picture_url || null, seguidores: num(j.followers_count), seguindo: num(j.follows_count), midias: num(j.media_count) };
}
export async function seguidores({ ctx }: any) { return (await perfil({ ctx })).seguidores; }

/** Mídias do perfil, da mais nova para a mais antiga. Devolve { midias, proxima }. */
export async function listarMidias({ ctx, max = 25, pagina }: any) {
  const t = await lerToken(ctx);
  const j = await chamar(ctx, `${t.userId}/media`, { fields: CAMPOS_MIDIA, limit: ate(max, 50), after: pagina }, { t });
  return { midias: (j.data || []).map(midiaDe), proxima: j.paging?.cursors?.after && j.paging?.next ? j.paging.cursors.after : null };
}
export async function lerMidia({ ctx, mediaId }: any) {
  const j = await chamar(ctx, mediaId, { fields: CAMPOS_MIDIA });
  return midiaDe(j);
}

const usuarioDe = (t: any) => String(t.username || "").toLowerCase();
const comentarioDe = (c: any, midiaId: any, dono: any) => ({
  id: c.id, rede: "instagram", midiaId, autor: c.username || c.from?.username || null, texto: c.text ?? "", publicadoEm: c.timestamp || null,
  curtidas: num(c.like_count) ?? 0, doDono: !!c.username && c.username.toLowerCase() === dono, oculto: !!c.hidden,
});

/** Comentários (com as respostas que a API traz junto) de UMA mídia. Cada thread é o comentário de topo + `respostas`. */
export async function comentariosDaMidia({ ctx, mediaId, max = 50, t }: any) {
  const tk = t || (await lerToken(ctx)), dono = usuarioDe(tk);
  const j = await chamar(ctx, `${mediaId}/comments`, { fields: "id,username,text,timestamp,like_count,hidden,replies{id,username,text,timestamp,like_count,hidden}", limit: ate(max, 100) }, { t: tk });
  return (j.data || []).map((c: any) => {
    const topo = comentarioDe(c, mediaId, dono), respostas = (c.replies?.data || []).map((r: any) => comentarioDe(r, mediaId, dono));
    return { ...topo, totalRespostas: respostas.length, respondido: !topo.doDono && respostas.some((r: any) => r.doDono), respostas };
  });
}

/**
 * Comentários do perfil: de uma mídia (`mediaId`) ou das mídias recentes que têm comentários. `semResposta`: só os de terceiros que o dono
 * ainda não respondeu. Devolve { comentarios, midias, proxima }: `midias` é a grade (todas as buscadas, com miniatura e contagens).
 * Custo: 1 chamada de mídias + 1 por mídia com comentários (no máximo `maxMidias`).
 */
export async function listarComentarios({ ctx, mediaId, semResposta = false, max = 50, pagina, maxMidias = 25 }: any) {
  const t = await lerToken(ctx);
  let midias, proxima = null;
  if (mediaId) midias = [await lerMidia({ ctx, mediaId })];
  else { const r = await listarMidias({ ctx, max: maxMidias, pagina }); midias = r.midias; proxima = r.proxima; }
  const comentarios = [];
  const comComentarios = midias.filter((m: any) => m.comentarios), LOTE = 13; // chamadas à Meta em paralelo, em lotes (antes eram uma por mídia, em fila: ~5 s para 25 posts)
  for (let i = 0; i < comComentarios.length; i += LOTE) {
    const lote = await Promise.all(comComentarios.slice(i, i + LOTE).map(async (m: any) => [m, await comentariosDaMidia({ ctx, mediaId: m.id, max: 50, t })]));
    for (const [m, lista] of lote) for (const c of lista) {
      if (semResposta && (c.doDono || c.respondido)) continue;
      comentarios.push({ ...c, midia: { id: m.id, titulo: m.titulo, thumbnail: m.thumbnail, tipo: m.tipo, permalink: m.permalink, publicadoEm: m.publicadoEm } });
    }
  }
  comentarios.sort((a, b) => String(b.publicadoEm).localeCompare(String(a.publicadoEm)));
  return { comentarios: comentarios.slice(0, max), midias, proxima };
}

/** Responde a um comentário de topo (POST /{comment-id}/replies). Escopo instagram_manage_comments. Só as rotas do servidor chamam isto. */
export async function responderComentario({ ctx, commentId, texto }: any) {
  if (!commentId) throw new Error("falta o id do comentário");
  if (!texto || !texto.trim() || texto.length > 2200) throw new Error("texto inválido: de 1 a 2200 caracteres");
  const j = await chamar(ctx, `${commentId}/replies`, { message: texto }, { metodo: "POST" });
  return { id: j.id, parentId: commentId, texto };
}
/** Oculta ou mostra um comentário (POST /{comment-id}?hide=). */
export async function ocultarComentario({ ctx, commentId, ocultar = true }: any) {
  if (!commentId) throw new Error("falta o id do comentário");
  const j = await chamar(ctx, commentId, { hide: ocultar ? "true" : "false" }, { metodo: "POST" });
  return { id: commentId, oculto: !!ocultar, ok: j.success !== false };
}

/** Mídias em que o perfil foi marcado (GET /{ig}/tags). Menções em legendas/comentários só chegam por webhook (não tratado aqui). */
export async function listarMencoes({ ctx, max = 25 }: any) {
  const t = await lerToken(ctx);
  const j = await chamar(ctx, `${t.userId}/tags`, { fields: "id,caption,media_type,media_product_type,permalink,timestamp,username,thumbnail_url,media_url", limit: ate(max, 50) }, { t });
  return (j.data || []).map((m: any) => ({ id: m.id, rede: "instagram", autor: m.username || null, texto: m.caption || "", url: m.permalink || null, publicadoEm: m.timestamp || null, tipo: tipoDe(m), thumbnail: m.thumbnail_url || m.media_url || null, respondido: false }));
}

// Métricas de mídia da Graph API (conferido em 2026-11-07, https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights):
// Reels: comments, likes, saved, shares, reposts, reach, views, total_interactions, ig_reels_avg_watch_time, ig_reels_video_view_total_time, reels_skip_rate (estimada, "em desenvolvimento"), facebook_views, crossposted_views.
// Feed: comments, likes, saved, shares, reposts, reach, views, total_interactions, follows, profile_visits, profile_activity. `impressions` saiu para mídias criadas depois de 2024-07-02.
// Três tentativas, da mais completa para a mínima: uma métrica nova ou "em desenvolvimento" que a Meta recusar não derruba as que já funcionavam.
const METRICAS = {
  reelAmpliada: "reach,saved,shares,views,total_interactions,ig_reels_avg_watch_time,ig_reels_video_view_total_time,likes,comments,reels_skip_rate,reposts",
  feedAmpliada: "reach,saved,shares,views,total_interactions,likes,comments,reposts,follows,profile_visits",
  reel: "reach,saved,shares,views,total_interactions,ig_reels_avg_watch_time,ig_reels_video_view_total_time,likes,comments",
  feed: "reach,saved,shares,views,total_interactions,likes,comments",
  minimas: "reach,saved,shares,views",
};
/** Métricas de uma mídia: { alcance, salvamentos, compartilhamentos, views, interacoes, tempoMedioMs, tempoTotalMs, curtidas, comentarios, taxaPulo, reposts, novosSeguidores, visitasPerfil }. Se a Meta recusar a lista, tenta a anterior. */
export async function metricasMidia({ ctx, mediaId, tipo = "reel" }: any) {
  const listas = tipo === "reel" ? [METRICAS.reelAmpliada, METRICAS.reel, METRICAS.minimas] : [METRICAS.feedAmpliada, METRICAS.feed, METRICAS.minimas];
  let j;
  for (const [i, lista] of listas.entries()) {
    try { j = await chamar(ctx, `${mediaId}/insights`, { metric: lista }); break; }
    catch (e) { if (e.status === 401 || e.status === 403 || e.status === 409 || i === listas.length - 1) throw e; }
  }
  const v: Record<string, any> = {}; for (const d of j.data || []) v[d.name] = num(d.values?.[0]?.value ?? d.total_value?.value);
  return { alcance: v.reach ?? null, salvamentos: v.saved ?? null, compartilhamentos: v.shares ?? null, views: v.views ?? null, interacoes: v.total_interactions ?? null,
    tempoMedioMs: v.ig_reels_avg_watch_time ?? null, tempoTotalMs: v.ig_reels_video_view_total_time ?? null, curtidas: v.likes ?? null, comentarios: v.comments ?? null,
    taxaPulo: v.reels_skip_rate ?? null, reposts: v.reposts ?? null, novosSeguidores: v.follows ?? null, visitasPerfil: v.profile_visits ?? null, bruto: v };
}

// ---------- Publicação de Reels (contêiner → status → media_publish) ----------
// Fluxo da Meta: POST /{ig}/media (REELS, video_url, cover_url, caption) cria um CONTÊINER (invisível, expira em 24 h); GET /{contêiner}?fields=status_code
// diz quando o vídeo foi baixado e processado (IN_PROGRESS → FINISHED | ERROR | EXPIRED); POST /{ig}/media_publish publica (UMA vez).
// Só as rotas/Workflow do servidor chamam `publicarContainer` e `comentar`; nada aqui roda sozinho.

/** Erro que vale repetir: rede, 5xx, limite de taxa ou códigos "temporários" da Meta. */
export const transitorio = (e: any) => !e?.status || e.status >= 500 || e.status === 429 || [1, 2, 4, 17, 32, 341, 613].includes(Number(e.codigo));

/** Cria o contêiner REELS. `capaUrl` (JPEG público) vira a capa da aba Reels (`cover_url`, vale mais que `thumb_offset`). Devolve { id }. */
export async function criarContainerReel({ ctx, videoUrl, capaUrl = null, legenda, compartilharNoFeed = true, miniaturaMs = null }: any) {
  if (!/^https:\/\//.test(String(videoUrl || ""))) throw new Error("video_url precisa ser uma URL pública https");
  if (!legenda || !String(legenda).trim()) throw new Error("legenda vazia");
  const t = await lerToken(ctx);
  const j = await chamar(ctx, `${t.userId}/media`, { media_type: "REELS", video_url: videoUrl, caption: legenda, share_to_feed: compartilharNoFeed ? "true" : "false", ...(capaUrl ? { cover_url: capaUrl } : miniaturaMs != null ? { thumb_offset: miniaturaMs } : {}) }, { metodo: "POST", t });
  return { id: String(j.id) };
}
/** Estado do contêiner: { codigo: IN_PROGRESS|FINISHED|ERROR|EXPIRED|PUBLISHED, detalhe }. */
export async function statusContainer({ ctx, containerId }: any) {
  const j = await chamar(ctx, containerId, { fields: "status_code,status" });
  return { codigo: String(j.status_code || "").toUpperCase(), detalhe: j.status || null };
}
/** Publica o contêiner (media_publish). UMA vez: quem chama grava o resultado antes de qualquer repetição. Devolve { id } da mídia. */
export async function publicarContainer({ ctx, containerId }: any) {
  const t = await lerToken(ctx);
  const j = await chamar(ctx, `${t.userId}/media_publish`, { creation_id: containerId }, { metodo: "POST", t });
  return { id: String(j.id) };
}
/** Cota de publicações pela API (≈100/24 h): { uso, total } ou null se a Meta não responder no formato conhecido. */
export async function limitePublicacao({ ctx }: any) {
  const t = await lerToken(ctx);
  const j = await chamar(ctx, `${t.userId}/content_publishing_limit`, { fields: "quota_usage,config" }, { t });
  const d = j.data?.[0]; if (!d) return null;
  const uso = num(d.quota_usage), total = num(d.config?.quota_total);
  return uso == null || total == null ? null : { uso, total };
}
export async function permalinkDe({ ctx, mediaId }: any) {
  const j = await chamar(ctx, mediaId, { fields: "permalink" });
  return j.permalink || null;
}
/** Comenta numa mídia (não fixa: a API não permite). Escopo instagram_manage_comments. */
export async function comentarMidia({ ctx, mediaId, texto }: any) {
  if (!texto || !String(texto).trim() || String(texto).length > 2200) throw new Error("comentário inválido: de 1 a 2200 caracteres");
  const j = await chamar(ctx, `${mediaId}/comments`, { message: texto }, { metodo: "POST" });
  return { id: String(j.id) };
}
/** Depois de uma resposta AMBÍGUA do media_publish, procura a mídia recém-publicada (mesma legenda, depois de `apos` ms) entre as últimas. */
export async function acharMidiaPublicada({ ctx, legenda, apos }: any) {
  const { midias } = await listarMidias({ ctx, max: 5 });
  const norm = (s: any) => String(s || "").replace(/\s+/g, " ").trim();
  const m = midias.find((x: any) => norm(x.legenda) === norm(legenda) && (!apos || Date.parse(x.publicadoEm) >= apos - 60e3));
  return m ? { id: m.id, url: m.permalink || null } : null;
}

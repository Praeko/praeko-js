// Buffer (https://developers.buffer.com): API GraphQL em https://api.buffer.com, chave no cabeçalho Bearer.
// Módulo SEM dependências de Node (serve o Worker, o CLI e os testes); tudo recebe `fetchFn` por parâmetro. O Buffer não recebe
// arquivo: busca o vídeo numa URL pública, HTTPS e estável até a hora de publicar (sem link assinado que expire).
export const ENDPOINT = "https://api.buffer.com";
export const LEGENDA_MAX = 2200, HASHTAGS_MAX = 30, ANTECEDENCIA_MIN_MS = 5 * 60e3;

/** Chamada GraphQL. Lança com a mensagem do Buffer em caso de erro. */
export async function gql(consulta: any, variaveis: any, { chave, fetchFn = fetch }: any = {}) {
  if (!chave) throw new Error("sem chave do Buffer (PRAEKO_KEY_BUFFER_PRINCIPAL, Chaveiro do macOS ou `praeko agendar --chave`)");
  const r = await fetchFn(ENDPOINT, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${chave}` }, body: JSON.stringify({ query: consulta, variables: variaveis || {} }) });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { throw new Error(`Buffer respondeu ${r.status}: ${txt.slice(0, 200)}`); }
  if (!r.ok || j.errors?.length) throw new Error(`Buffer: ${(j.errors || []).map((e: any) => e.message).join("; ") || r.status}`);
  return j.data;
}

const Q_CANAIS = `query { account { organizations { id name } } }`;
const Q_CANAIS_ORG = `query($org: OrganizationId!) { channels(input: { organizationId: $org }) { id name displayName service avatar isQueuePaused } }`;
/** Todos os canais conectados: [{ id, nome, servico, avatar, org }]. */
export async function listarCanais(op: any) {
  const d = await gql(Q_CANAIS, {}, op);
  const lista = [];
  for (const o of d.account.organizations) {
    const c = await gql(Q_CANAIS_ORG, { org: o.id }, op);
    for (const x of c.channels) lista.push({ id: x.id, nome: x.displayName || x.name, servico: x.service, avatar: x.avatar || null, org: o.name, pausado: !!x.isQueuePaused });
  }
  return lista;
}

/** O único canal de um serviço (ex.: "instagram"), ou o configurado por id. Lança com a lista quando for ambíguo. */
export function canalDoServico(canais: any, servico: any, idFixo: any) {
  if (idFixo) {
    const c = canais.find((x: any) => x.id === idFixo);
    if (!c) throw new Error(`o canal ${idFixo} não existe no Buffer`);
    return c;
  }
  const ach = canais.filter((c: any) => c.servico === servico);
  if (ach.length === 1) return ach[0];
  throw new Error(ach.length ? `${ach.length} canais ${servico} no Buffer (${ach.map((c: any) => `${c.nome}=${c.id}`).join(", ")}); fixe um em BUFFER_CANAL_INSTAGRAM` : `nenhum canal ${servico} conectado no Buffer`);
}

const M_CRIAR = `mutation($input: CreatePostInput!) { createPost(input: $input) { ... on PostActionSuccess { post { id dueAt } } ... on MutationError { message } } }`;
const M_APAGAR = `mutation($id: PostId!) { deletePost(input: { id: $id }) { ... on DeletePostSuccess { __typename } ... on MutationError { message } } }`;
const M_EDITAR = `mutation($input: EditPostInput!) { editPost(input: $input) { ... on PostActionSuccess { post { id status dueAt text shareMode } } ... on MutationError { message } } }`;
/** Estado detalhado de um post (leitura): o `allowedActions` diz o que o Buffer permite fazer com ele (PostAction: updatePost, updatePostSchedule, publishPostNow, movePostToDraft, deletePost…). */
const Q_DETALHE = `query($id: PostId!) { post(input: { id: $id }) { id status dueAt text shareMode allowedActions sentAt externalLink } }`;
// `post(input: { id })` e os campos status/sentAt/externalLink/dueAt vêm da referência do Buffer (Post type); o formato exato do PostInput e os valores de PostStatus não foram verificados ao vivo.
const Q_POST = `query($id: PostId!) { post(input: { id: $id }) { id status sentAt externalLink dueAt } }`;

export async function criarPost(input: any, op: any) {
  const d = await gql(M_CRIAR, { input }, op);
  const r = d.createPost;
  if (r.message) throw new Error(`Buffer recusou o post: ${r.message}`);
  return r.post;
}
export async function apagarPost(id: any, op: any) {
  const d = await gql(M_APAGAR, { id }, op);
  if (d.deletePost?.message) throw new Error(`Buffer não apagou ${id}: ${d.deletePost.message}`);
  return true;
}
/** Estado de um post no Buffer: { id, status, sentAt, externalLink, dueAt }. */
export async function consultarPost(id: any, op: any) {
  const d = await gql(Q_POST, { id }, op);
  if (!d.post) throw new Error(`o Buffer não achou o post ${id}`);
  return d.post;
}

/** Detalhe de um post no Buffer, com `allowedActions` (só leitura). */
export async function detalharPost(id: any, op: any) {
  const d = await gql(Q_DETALHE, { id }, op);
  if (!d.post) throw new Error(`o Buffer não achou o post ${id}`);
  return d.post;
}

/**
 * `EditPostInput` para mudar um post JÁ agendado no Buffer, no lugar (nada é apagado nem recriado). Campos omitidos ficam como estão,
 * MAS o Buffer valida o post inteiro: para o Instagram é preciso reenviar `assets` (a mesma URL do vídeo) e `metadata.instagram` (type, shouldShareToFeed)
 * (verificado ao vivo: sem eles o editPost recusa com "Instagram posts require at least one image or video"). `editarNoLugar` lê isso do próprio post.
 * `texto`: nova legenda; `quando` (ISO, ≥ 5 min à frente): novo horário fixo (mode customScheduled); `agoraMesmo`: publica já (mode shareNow);
 * `rascunho` true/false: move para rascunho / tira dele (saveToDraft; verificado ao vivo nos dois sentidos).
 * Valores de ShareMode conferidos por introspecção: addToQueue, customScheduled, shareNext, shareNow.
 */
export function montarEdicaoPost({ id, texto, quando, agoraMesmo = false, rascunho, assets, metadata, agora = Date.now() }: any) {
  if (!id) throw new Error("falta o id do post no Buffer");
  const input: Record<string, any> = { id: String(id) };
  let mudou = false;
  if (texto !== undefined) {
    const erros = validarLegendaInstagram(texto);
    if (erros.length) throw new Error(erros.join("; "));
    input.text = texto; mudou = true;
  }
  if (agoraMesmo) { if (quando !== undefined) throw new Error("publicar agora não combina com horário"); input.mode = "shareNow"; mudou = true; }
  else if (quando !== undefined) {
    const t = Date.parse(quando);
    if (Number.isNaN(t)) throw new Error(`horário inválido: ${quando}`);
    if (t < agora + ANTECEDENCIA_MIN_MS) throw new Error("o horário precisa ser daqui a pelo menos 5 minutos");
    input.mode = "customScheduled"; input.dueAt = new Date(t).toISOString(); mudou = true;
  }
  if (rascunho !== undefined) { input.saveToDraft = !!rascunho; mudou = true; }
  if (!mudou) throw new Error("nada para mudar no post do Buffer");
  if (assets) input.assets = assets;
  if (metadata) input.metadata = metadata;
  return input;
}
/** Aplica a edição no Buffer. Devolve { id, status, dueAt, text }. Erro do Buffer (MutationError) vira exceção. */
export async function editarPost(input: any, op: any) {
  const d = await gql(M_EDITAR, { input }, op);
  const r = d.editPost;
  if (r?.message) throw new Error(`Buffer recusou a edição: ${r.message}`);
  if (!r?.post) throw new Error("o Buffer não devolveu o post editado");
  return r.post;
}
const Q_ATUAL = `query($id: PostId!) { post(input: { id: $id }) { id status dueAt text assets { type source } metadata { __typename ... on InstagramPostMetadata { type shouldShareToFeed } } } }`;
/** O que reenviar ao editar: os `assets` e o `metadata.instagram` atuais do post no Buffer. Lança se o post não tiver mídia. */
export async function lerPostAtual(id: any, op: any) {
  const d = await gql(Q_ATUAL, { id }, op);
  const p = d.post;
  if (!p) throw new Error(`o Buffer não achou o post ${id}`);
  const a = (p.assets || []).find((x: any) => x?.source);
  if (!a) throw new Error(`o post ${id} não tem mídia no Buffer; não dá para editar no lugar`);
  const ehVideo = /video/i.test(String(a.type || ""));
  const assets = [ehVideo ? { video: { url: a.source } } : { image: { url: a.source } }];
  const m = p.metadata || {};
  const metadata = { instagram: { type: m.type || "reel", shouldShareToFeed: m.shouldShareToFeed ?? true } };
  return { post: p, assets, metadata };
}
/**
 * Muda um post do Buffer NO LUGAR (texto, horário, publicar agora, rascunho), sem apagar nem recriar. `mud`: { id, texto?, quando?, agoraMesmo?, rascunho?, agora? }.
 * Lê a mídia atual do próprio post e a reenvia (exigência do Buffer). Nunca usa createPost/deletePost.
 */
export async function editarNoLugar(mud: any, op: any) {
  const { assets, metadata } = await lerPostAtual(mud.id, op);
  return editarPost(montarEdicaoPost({ ...mud, assets, metadata }), op);
}

/** Conta hashtags (#palavra) como o Instagram. */
export const contarHashtags = (texto: any) => (String(texto).match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length;

/** Confere a legenda do Reel. Devolve a lista de problemas (vazia = ok). */
export function validarLegendaInstagram(texto: any) {
  const e = [];
  if (!texto || !String(texto).trim()) e.push("a legenda do Instagram está vazia");
  if (String(texto).length > LEGENDA_MAX) e.push(`legenda com ${String(texto).length} caracteres (limite ${LEGENDA_MAX})`);
  const h = contarHashtags(texto);
  if (h > HASHTAGS_MAX) e.push(`${h} hashtags (limite ${HASHTAGS_MAX})`);
  return e;
}

/**
 * `CreatePostInput` de um Reel para o Instagram. `quando`: ISO UTC (mínimo 5 min à frente de `agora`);
 * `agoraMesmo`: publica já (mode shareNow, sem horário); `miniaturaMs`: quadro da capa (a capa personalizada via API só existe na API da Meta; por isso a capa vai colada nos primeiros quadros).
 */
export function montarReelInstagram({ canalId, texto, videoUrl, quando, miniaturaMs = 0, agora = Date.now(), agoraMesmo = false }: any) {
  const erros = validarLegendaInstagram(texto);
  if (erros.length) throw new Error(erros.join("; "));
  if (!canalId) throw new Error("falta o canal do Instagram no Buffer");
  if (!/^https:\/\//.test(String(videoUrl || ""))) throw new Error("o vídeo precisa de uma URL pública https para o Buffer buscar");
  const t = Date.parse(quando);
  if (!agoraMesmo) {
    if (Number.isNaN(t)) throw new Error(`horário inválido: ${quando}`);
    if (t < agora + ANTECEDENCIA_MIN_MS) throw new Error("o horário precisa ser daqui a pelo menos 5 minutos");
  }
  return {
    channelId: canalId, schedulingType: "automatic", needsApproval: false, source: "arauto",
    ...(agoraMesmo ? { mode: "shareNow" } : { mode: "customScheduled", dueAt: new Date(t).toISOString() }),
    text: texto,
    assets: [{ video: { url: videoUrl, metadata: { thumbnailOffset: miniaturaMs } } }],
    metadata: { instagram: { type: "reel", shouldShareToFeed: true } },
  };
}

// ---------- Métricas de um post (developers.buffer.com/examples/get-post-metrics: `post(input:{id}){ metrics{type name value unit} metricsUpdatedAt }`) ----------
// "Disponível só para fluxos pessoais com chave de API pessoal". Os nomes dos tipos de métrica não estão na doc: o mapeamento abaixo é por
// palavra-chave e tolera ausência (um post sem métrica devolve todos os campos null).
const Q_METRICAS = `query($id: PostId!) { post(input: { id: $id }) { id metrics { type name value unit } metricsUpdatedAt } }`;

/** { views, curtidas, comentarios, compartilhamentos, salvamentos, alcance } a partir da lista `metrics` do Buffer (valores desconhecidos = null). */
export function mapearMetricasBuffer(metrics: any) {
  const lista = (metrics || []).map((m: any) => ({ k: `${m.type || ""} ${m.name || ""}`.toLowerCase(), v: Number.isFinite(+m.value) ? +m.value : null }));
  const ach = (...res: any[]) => { for (const re of res) { const m = lista.find((x: any) => re.test(x.k) && x.v != null); if (m) return m.v; } return null; };
  return {
    views: ach(/\bviews?\b|\bplays?\b/, /impression/),
    curtidas: ach(/\blikes?\b/, /reaction/),
    comentarios: ach(/comment/),
    compartilhamentos: ach(/share|repost/),
    salvamentos: ach(/\bsaves?\b|saved|bookmark/),
    alcance: ach(/reach/),
  };
}

/** Métricas de um post do Buffer: { ...campos mapeados, atualizadoEm, bruto }. O Buffer sem métricas ainda devolve tudo null. */
export async function metricasDoPost(id: any, op: any) {
  const d = await gql(Q_METRICAS, { id }, op);
  if (!d.post) throw new Error(`o Buffer não achou o post ${id}`);
  return { ...mapearMetricasBuffer(d.post.metrics), atualizadoEm: d.post.metricsUpdatedAt ?? null, bruto: d.post.metrics ?? [] };
}

// ---------- Posts ENVIADOS do canal (histórico para o Insights) ----------
// Verificado ao vivo (leitura): `posts(first, after, input: { organizationId, sort, filter: { status: [sent], channelIds } })`, paginação Relay,
// `metrics { type name value unit }` com types reactions, comments, engagementRate, views e (Instagram) shares, saves, totalTimeWatched, averageTimeWatched, reach.
/** Taxa de engajamento (%) que o Buffer calcula por post, ou null. */
export const taxaEngajamentoBuffer = (metrics: any) => { const m = (metrics || []).find((x: any) => String(x.type) === "engagementRate"); return m && Number.isFinite(+m.value) ? +m.value : null; };

/** Id da primeira organização da conta. */
export async function organizacaoId(op: any) {
  const d = await gql(Q_CANAIS, {}, op);
  const o = d.account?.organizations?.[0];
  if (!o) throw new Error("a conta do Buffer não tem organização");
  return o.id;
}

/** Uma página de posts enviados de um canal: { posts: [...], proxima, organizacao }. Os ids vão escapados no texto da consulta. */
export async function listarEnviados({ canalId, organizacao, depois, primeiros = 50 }: any, op: any) {
  const org = organizacao || await organizacaoId(op), n = Math.max(1, Math.min(100, Math.floor(+primeiros) || 50));
  const q = `query { posts(first: ${n}${depois ? `, after: ${JSON.stringify(String(depois))}` : ""}, input: { organizationId: ${JSON.stringify(String(org))}, sort: [{ field: dueAt, direction: desc }], filter: { status: [sent], channelIds: [${JSON.stringify(String(canalId))}] } }) { pageInfo { hasNextPage endCursor } edges { node { id dueAt sentAt text externalLink channelId channelService assets { thumbnail mimeType } metrics { type name value unit } metricsUpdatedAt } } } }`;
  const d = await gql(q, {}, op);
  const p = d.posts;
  if (!p) throw new Error("o Buffer não devolveu a lista de posts enviados");
  return {
    organizacao: org,
    posts: (p.edges || []).map((e: any) => e.node).map((x: any) => ({
      id: x.id, enviadoEm: x.sentAt || x.dueAt, texto: x.text || "", url: x.externalLink || null, miniatura: x.assets?.[0]?.thumbnail || null, servico: x.channelService || null,
      ...mapearMetricasBuffer(x.metrics), engajamento: taxaEngajamentoBuffer(x.metrics), bruto: x.metrics || [], atualizadoEm: x.metricsUpdatedAt || null,
    })),
    proxima: p.pageInfo?.hasNextPage ? p.pageInfo.endCursor : null,
  };
}

// ---------- Métricas agregadas do período (o mesmo número que o painel do Buffer mostra) ----------
// `aggregatedPostMetrics(input: { organizationId, channelIds?, startDateTime, endDateTime, tags? }) { metrics { type name value unit } metricsUpdatedAt }`.
// Verificado ao vivo (leitura): Instagram em 30 dias devolve postCount, reactions, comments, engagementRate (4,08 = o do painel), views, shares, saves,
// follows ("Seguidores ganhos nos posts"), reach, totalTimeWatched (min) e averageTimeWatched (s); YouTube só postCount, reactions, comments, engagementRate, views.
// Plano gratuito: só os últimos 31 dias ("Free-plan Insights are limited to the last 31 days of history").
const Q_AGREGADO = `query($input: AggregatedPostMetricsInput!) { aggregatedPostMetrics(input: $input) { metricsUpdatedAt metrics { type name value unit } } }`;
/** Métricas agregadas de um período (e, opcionalmente, de um canal). Campos que o Buffer não entrega ficam null. Lança com a mensagem do Buffer (ex.: histórico fora do plano). */
export async function metricasAgregadas({ organizacao, canalId, de, ate }: any, op: any) {
  const org = organizacao || await organizacaoId(op);
  const input = { organizationId: org, startDateTime: new Date(de).toISOString(), endDateTime: new Date(ate).toISOString(), ...(canalId ? { channelIds: [canalId] } : {}) };
  const d = await gql(Q_AGREGADO, { input }, op);
  const lista = d.aggregatedPostMetrics?.metrics;
  if (!Array.isArray(lista)) throw new Error("o Buffer não devolveu as métricas agregadas");
  const v = (t: any) => { const m = lista.find((x) => String(x.type) === t); return m && Number.isFinite(+m.value) ? +m.value : null; };
  return {
    posts: v("postCount"), reacoes: v("reactions"), comentarios: v("comments"), engajamento: v("engagementRate"), views: v("views"),
    compartilhamentos: v("shares"), salvamentos: v("saves"), seguidoresGanhos: v("follows"), alcance: v("reach"),
    tempoAssistidoMin: v("totalTimeWatched"), tempoMedioSeg: v("averageTimeWatched"),
    atualizadoEm: d.aggregatedPostMetrics.metricsUpdatedAt ?? null, bruto: lista,
  };
}

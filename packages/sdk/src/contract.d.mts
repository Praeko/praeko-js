// GERADO por scripts/contract-types.mjs a partir de contract.mjs: NÃO edite à mão. Rode `npm run types:contract`.
// Tipos do contrato público da API (inglês) e do vocabulário legado (português). Os formatos de resposta por rota ficam em index.d.ts.

// ---------------------------------------------------------------------------------------------------------------- escopos
/** Escopo de uma chave de API no contrato. */
export type Scope = "read" | "write" | "admin";
/** Escopo no vocabulário interno (legado). */
export type LegacyScope = "leitura" | "escrita" | "admin";
export declare const SCOPES: { readonly leitura: "read"; readonly escrita: "write"; readonly admin: "admin" };
export declare function scopeToEN<S extends string>(s: S): S extends LegacyScope ? (typeof SCOPES)[S] : S;
export declare function scopeToPT(s: string): string;

// ---------------------------------------------------------------------------------------------------------------- rotas
export type HttpMethod = "GET" | "HEAD" | "DELETE" | "PUT" | "POST" | "PATCH";
/** Escopo mínimo de uma rota (ou "public"). */
export type RouteScope = Scope | "public";
/** A tabela de rotas, na ordem do contrato (77 entradas). */
export type RouteTable = readonly [
  { key: "health"; method: "GET"; path: "/health"; legacy: "/saude"; scope: "public"; summary: string },
  { key: "health.v1"; method: "GET"; path: "/v1/health"; legacy: "/v1/saude"; scope: "public"; summary: string },
  { key: "connections.callback"; method: "GET"; path: "/connections/:network/callback"; legacy: "/conexoes/:rede/retorno"; scope: "public"; raw: true; summary: string },
  { key: "media.public"; method: "GET"; path: "/v1/m/:id/:token/:name"; legacy: null; scope: "public"; raw: true; summary: string },
  { key: "media.public"; method: "HEAD"; path: "/v1/m/:id/:token/:name"; legacy: null; scope: "public"; raw: true; summary: string },
  { key: "connections.start"; method: "GET"; path: "/v1/connections/:network/start"; legacy: "/v1/conexoes/:rede/iniciar"; scope: "write"; summary: string },
  { key: "connections.disconnect"; method: "DELETE"; path: "/v1/connections/:network"; legacy: "/v1/conexoes/:rede"; scope: "write"; summary: string },
  { key: "connections.instagramToken"; method: "PUT"; path: "/v1/connections/instagram/token"; legacy: "/v1/conexoes/instagram/token"; scope: "admin"; body: "json"; summary: string },
  { key: "channels.list"; method: "GET"; path: "/v1/channels"; legacy: "/v1/canais"; scope: "read"; summary: string },
  { key: "channels.default"; method: "PUT"; path: "/v1/channels/:channel/default"; legacy: "/v1/canais/:canal/padrao"; scope: "write"; summary: string },
  { key: "channels.remove"; method: "DELETE"; path: "/v1/channels/:channel"; legacy: "/v1/canais/:canal"; scope: "write"; summary: string },
  { key: "channels.avatar"; method: "GET"; path: "/v1/channels/:network/avatar"; legacy: "/v1/canais/:rede/avatar"; scope: "read"; summary: string },
  { key: "tiktok.creator"; method: "GET"; path: "/v1/tiktok/creator"; legacy: "/v1/tiktok/criador"; scope: "read"; summary: string },
  { key: "channels.slots.get"; method: "GET"; path: "/v1/channels/:network/slots"; legacy: "/v1/canais/:rede/vagas"; scope: "read"; summary: string },
  { key: "channels.slots.put"; method: "PUT"; path: "/v1/channels/:network/slots"; legacy: "/v1/canais/:rede/vagas"; scope: "write"; body: "json"; summary: string },
  { key: "channels.followers.put"; method: "PUT"; path: "/v1/channels/:network/followers"; legacy: "/v1/canais/:rede/seguidores"; scope: "write"; body: "json"; summary: string },
  { key: "channels.followers.get"; method: "GET"; path: "/v1/channels/:network/followers"; legacy: "/v1/canais/:rede/seguidores"; scope: "read"; summary: string },
  { key: "media.create"; method: "POST"; path: "/v1/media"; legacy: "/v1/midia"; scope: "write"; body: "json"; summary: string },
  { key: "media.list"; method: "GET"; path: "/v1/media"; legacy: "/v1/midia"; scope: "read"; summary: string },
  { key: "media.get"; method: "GET"; path: "/v1/media/:id"; legacy: "/v1/midia/:id"; scope: "read"; summary: string },
  { key: "media.part"; method: "PUT"; path: "/v1/media/:id/parts/:part"; legacy: "/v1/midia/:id/partes/:n"; scope: "write"; body: "bytes"; summary: string },
  { key: "media.content.put"; method: "PUT"; path: "/v1/media/:id/content"; legacy: "/v1/midia/:id/conteudo"; scope: "write"; body: "bytes"; summary: string },
  { key: "media.content.get"; method: "GET"; path: "/v1/media/:id/content"; legacy: "/v1/midia/:id/conteudo"; scope: "read"; summary: string },
  { key: "media.content.head"; method: "HEAD"; path: "/v1/media/:id/content"; legacy: "/v1/midia/:id/conteudo"; scope: "read"; summary: string },
  { key: "media.complete"; method: "POST"; path: "/v1/media/:id/complete"; legacy: "/v1/midia/:id/completar"; scope: "write"; summary: string },
  { key: "media.delete"; method: "DELETE"; path: "/v1/media/:id"; legacy: "/v1/midia/:id"; scope: "write"; summary: string },
  { key: "posts.create"; method: "POST"; path: "/v1/posts"; legacy: "/v1/posts"; scope: "write"; body: "json"; summary: string },
  { key: "posts.adopt"; method: "POST"; path: "/v1/posts/adopt"; legacy: "/v1/posts/adotar"; scope: "write"; body: "json"; summary: string },
  { key: "posts.list"; method: "GET"; path: "/v1/posts"; legacy: "/v1/posts"; scope: "read"; summary: string },
  { key: "posts.get"; method: "GET"; path: "/v1/posts/:id"; legacy: "/v1/posts/:id"; scope: "read"; summary: string },
  { key: "posts.update"; method: "PATCH"; path: "/v1/posts/:id"; legacy: "/v1/posts/:id"; scope: "write"; body: "json"; summary: string },
  { key: "posts.cancel"; method: "DELETE"; path: "/v1/posts/:id"; legacy: "/v1/posts/:id"; scope: "write"; summary: string },
  { key: "posts.publishNow"; method: "POST"; path: "/v1/posts/:id/publish-now"; legacy: "/v1/posts/:id/publicar-agora"; scope: "write"; summary: string },
  { key: "posts.youtubeSchedule"; method: "POST"; path: "/v1/posts/:id/youtube/schedule"; legacy: "/v1/posts/:id/youtube/agendar"; scope: "write"; body: "json"; summary: string },
  { key: "posts.itemComment"; method: "POST"; path: "/v1/posts/:id/items/:item/comment"; legacy: "/v1/posts/:id/itens/:destino/comentar"; scope: "write"; summary: string },
  { key: "calendar.get"; method: "GET"; path: "/v1/calendar"; legacy: "/v1/calendario"; scope: "read"; summary: string },
  { key: "insights.get"; method: "GET"; path: "/v1/insights"; legacy: "/v1/insights"; scope: "read"; summary: string },
  { key: "insights.retention"; method: "GET"; path: "/v1/insights/retention"; legacy: "/v1/insights/retention"; scope: "read"; summary: string },
  { key: "insights.retention.item"; method: "GET"; path: "/v1/insights/:item/retention"; legacy: "/v1/insights/:item/retention"; scope: "read"; summary: string },
  { key: "insights.import"; method: "POST"; path: "/v1/insights/import"; legacy: "/v1/insights/importar"; scope: "admin"; query: { network: { all: "tudo" } }; summary: string },
  { key: "content.list"; method: "GET"; path: "/v1/content"; legacy: "/v1/conteudo"; scope: "read"; summary: string },
  { key: "youtube.videos"; method: "GET"; path: "/v1/youtube/videos"; legacy: "/v1/youtube/videos"; scope: "read"; summary: string },
  { key: "youtube.video"; method: "GET"; path: "/v1/youtube/videos/:id"; legacy: "/v1/youtube/videos/:id"; scope: "read"; summary: string },
  { key: "youtube.editVideo"; method: "PATCH"; path: "/v1/youtube/videos/:id"; legacy: "/v1/youtube/videos/:id"; scope: "write"; body: "json"; summary: string },
  { key: "youtube.comments"; method: "GET"; path: "/v1/youtube/comments"; legacy: "/v1/youtube/comentarios"; scope: "read"; summary: string },
  { key: "youtube.reply"; method: "POST"; path: "/v1/youtube/comments/:id/reply"; legacy: "/v1/youtube/comentarios/:id/responder"; scope: "write"; body: "json"; summary: string },
  { key: "youtube.resolve"; method: "POST"; path: "/v1/youtube/comments/:id/resolve"; legacy: "/v1/youtube/comentarios/:id/resolver"; scope: "write"; summary: string },
  { key: "youtube.reopen"; method: "DELETE"; path: "/v1/youtube/comments/:id/resolve"; legacy: "/v1/youtube/comentarios/:id/resolver"; scope: "write"; summary: string },
  { key: "instagram.media"; method: "GET"; path: "/v1/instagram/media"; legacy: "/v1/instagram/midias"; scope: "read"; summary: string },
  { key: "instagram.comments"; method: "GET"; path: "/v1/instagram/comments"; legacy: "/v1/instagram/comentarios"; scope: "read"; summary: string },
  { key: "instagram.reply"; method: "POST"; path: "/v1/instagram/comments/:id/reply"; legacy: "/v1/instagram/comentarios/:id/responder"; scope: "write"; body: "json"; summary: string },
  { key: "instagram.hide"; method: "POST"; path: "/v1/instagram/comments/:id/hide"; legacy: "/v1/instagram/comentarios/:id/ocultar"; scope: "write"; body: "json"; summary: string },
  { key: "instagram.resolve"; method: "POST"; path: "/v1/instagram/comments/:id/resolve"; legacy: "/v1/instagram/comentarios/:id/resolver"; scope: "write"; summary: string },
  { key: "instagram.reopen"; method: "DELETE"; path: "/v1/instagram/comments/:id/resolve"; legacy: "/v1/instagram/comentarios/:id/resolver"; scope: "write"; summary: string },
  { key: "comments.list"; method: "GET"; path: "/v1/comments"; legacy: "/v1/comentarios"; scope: "read"; query: { network: { all: "todas" } }; summary: string },
  { key: "mentions.list"; method: "GET"; path: "/v1/mentions"; legacy: "/v1/mencoes"; scope: "read"; query: { network: { all: "todas" } }; summary: string },
  { key: "apiKeys.list"; method: "GET"; path: "/v1/api-keys"; legacy: "/v1/chaves"; scope: "admin"; summary: string },
  { key: "apiKeys.create"; method: "POST"; path: "/v1/api-keys"; legacy: "/v1/chaves"; scope: "admin"; body: "json"; summary: string },
  { key: "apiKeys.revoke"; method: "DELETE"; path: "/v1/api-keys/:id"; legacy: "/v1/chaves/:id"; scope: "admin"; summary: string },
  { key: "usage.get"; method: "GET"; path: "/v1/usage"; legacy: "/v1/usage"; scope: "read"; summary: string },
  { key: "usage.log"; method: "GET"; path: "/v1/usage/log"; legacy: "/v1/usage/log"; scope: "read"; summary: string },
  { key: "preferences.get"; method: "GET"; path: "/v1/preferences"; legacy: "/v1/preferences"; scope: "read"; summary: string },
  { key: "preferences.put"; method: "PUT"; path: "/v1/preferences"; legacy: "/v1/preferences"; scope: "write"; body: "json"; summary: string },
  { key: "webhooks.list"; method: "GET"; path: "/v1/webhooks"; legacy: "/v1/webhooks"; scope: "admin"; summary: string },
  { key: "webhooks.create"; method: "POST"; path: "/v1/webhooks"; legacy: "/v1/webhooks"; scope: "admin"; body: "json"; summary: string },
  { key: "webhooks.get"; method: "GET"; path: "/v1/webhooks/:id"; legacy: "/v1/webhooks/:id"; scope: "admin"; summary: string },
  { key: "webhooks.update"; method: "PATCH"; path: "/v1/webhooks/:id"; legacy: "/v1/webhooks/:id"; scope: "admin"; body: "json"; summary: string },
  { key: "webhooks.delete"; method: "DELETE"; path: "/v1/webhooks/:id"; legacy: "/v1/webhooks/:id"; scope: "admin"; summary: string },
  { key: "webhooks.test"; method: "POST"; path: "/v1/webhooks/:id/test"; legacy: "/v1/webhooks/:id/test"; scope: "admin"; summary: string },
  { key: "webhooks.deliveries"; method: "GET"; path: "/v1/webhooks/:id/deliveries"; legacy: "/v1/webhooks/:id/deliveries"; scope: "admin"; summary: string },
  { key: "webhooks.redeliver"; method: "POST"; path: "/v1/webhooks/:id/deliveries/:delivery/retry"; legacy: "/v1/webhooks/:id/deliveries/:delivery/retry"; scope: "admin"; summary: string },
  { key: "webhooks.rotateSecret"; method: "POST"; path: "/v1/webhooks/:id/rotate-secret"; legacy: "/v1/webhooks/:id/rotate-secret"; scope: "admin"; summary: string },
  { key: "ideas.list"; method: "GET"; path: "/v1/ideas"; legacy: "/v1/ideas"; scope: "read"; summary: string },
  { key: "ideas.create"; method: "POST"; path: "/v1/ideas"; legacy: "/v1/ideas"; scope: "write"; body: "json"; summary: string },
  { key: "ideas.import"; method: "POST"; path: "/v1/ideas/import"; legacy: "/v1/ideas/import"; scope: "write"; body: "json"; summary: string },
  { key: "ideas.update"; method: "PATCH"; path: "/v1/ideas/:id"; legacy: "/v1/ideas/:id"; scope: "write"; body: "json"; summary: string },
  { key: "ideas.delete"; method: "DELETE"; path: "/v1/ideas/:id"; legacy: "/v1/ideas/:id"; scope: "write"; summary: string },
];
export declare const ROUTES: RouteTable;
export type Route = RouteTable[number];
/** Nome do handler (`key`) de cada rota. */
export type RouteKey = Route["key"];
/** Caminho novo (template com `:param`). */
export type RoutePath = Route["path"];
/** Alias legado em português (sem as rotas que não têm alias). */
export type LegacyRoutePath = Exclude<Route["legacy"], null>;
export type RouteOf<K extends RouteKey> = Extract<Route, { key: K }>;
/** Rotas de um método, por caminho: `RoutesFor<"GET">["path"]`. */
export type RoutesFor<M extends HttpMethod> = Extract<Route, { method: M }>;
/** Nomes dos parâmetros de um template: `PathParams<"/v1/posts/:id/items/:item/comment">` = "id" | "item". */
export type PathParams<P extends string> = P extends `${string}:${infer N}/${infer R}` ? N | PathParams<`/${R}`> : P extends `${string}:${infer N}` ? N : never;
export declare const MEDIA_PUBLIC_ALIAS_PREFIX: "/m";
export interface RouteMatch { route: Route; values: string[] }
export declare function paramNames(tpl: string): string[];
export declare function fillPath(tpl: string, values: ReadonlyArray<string | number | null | undefined>): string;
export declare function matchNew(method: string, pathname: string): RouteMatch | null;
export declare function matchLegacy(method: string, pathname: string): RouteMatch | null;
export declare function newPathOf(method: string, legacyPath: string): string | null;
export declare function legacyPathOf(method: string, newPath: string): string | null;

// ---------------------------------------------------------------------------------------------------------------- campos
/** Campo legado (PT) → campo do contrato (EN). Sentido: ambos, pedido, resposta (veja o comentário de cada linha). */
export interface FieldMap {
  abs: "absolute";
  acao: "action";
  acoes: "actions";
  adotado: "adopted";
  agregadoAtualizadoEm: "aggregateUpdatedAt";
  agregadoBuffer: "bufferAggregate";
  alcance: "reach";
  anterior: "previous";
  antes: "before";
  appAuditado: "appAudited";
  ate: "to";
  ativa: "active";
  atual: "current";
  atualizado_em: "updatedAt";
  atualizados: "updated";
  autor: "author";
  autorCanal: "authorChannel";
  aviso: "warning";
  avisarInscritos: "notifySubscribers";
  canais: "channels";
  canal: "channel";
  canalId: "channelId";
  cancelados: "canceled";
  cancelar: "cancel";
  capa: "cover";
  capaNoQuadro: "coverInFrame";
  cartoes: "cards";
  categoriaId: "categoryId";
  chave: "key";
  chaves: "keys";
  codigo: "code";
  coleta: "collection";
  coletando: "collecting";
  comentar: "comment"; // só pedido
  comentario: "comment"; // só resposta
  comentarioDesabilitado: "commentsDisabled";
  comentarioFixo: "pinnedComment";
  comentarios: "comments";
  compartilhamentos: "shares";
  compartilharNoFeed: "shareToFeed";
  comparar: "compare";
  conectado: "connected";
  conectadoEm: "connectedAt";
  consultadoEm: "queriedAt";
  conteudoComercial: "commercialContent";
  criado_em: "createdAt";
  curtidas: "likes";
  de: "from";
  depois: "after";
  deslocamento: "offset";
  desabilitarComentarios: "disableComments";
  desabilitarDueto: "disableDuet";
  desabilitarStitch: "disableStitch";
  desconectado: "disconnected";
  descricao: "description";
  destino_id: "itemId";
  destinos: "items"; // só pedido
  detalhe: "detail";
  detalhes: "details";
  dia: "day";
  dia_semana: "weekday";
  direcao: "direction";
  diretoDisponivel: "directAvailable";
  doDono: "fromOwner";
  duetoDesabilitado: "duetDisabled";
  duracaoMaxSeg: "maxDurationSec";
  editarHorario: "editSchedule";
  editarTexto: "editText";
  encontrados: "found";
  engajamento: "engagement";
  engajamentoGeral: "overallEngagement";
  enviar: "uploadHint";
  erro: "error";
  erros: "errors";
  escopo: "scope";
  escrito: "written";
  estado: "state";
  etiqueta: "tag";
  etiquetas: "tags";
  executarEm: "runAt";
  expiraEm: "expiresAt";
  expiraEmDias: "expiresInDays"; // só pedido
  expirada: "expired";
  diasRestantes: "daysLeft";
  externo: "external";
  fila: "queue";
  filtros: "filters";
  fonte: "source";
  fontes: "sources";
  formato: "format";
  fuso: "timezone";
  hora: "time";
  ignorado: "skipped";
  importados: "imported";
  itens: "items"; // só resposta
  jaFeita: "alreadyDone";
  legenda: "caption";
  leitura48h: "reading48h";
  leitura48hTexto: "reading48hText";
  leiturasNoBanco: "storedReadings";
  lembrete: "reminder";
  limite: "limit";
  mantidos: "kept";
  marcaPropria: "ownBrand";
  marcaTerceiros: "thirdPartyBrand";
  marcos: "milestones";
  mencoes: "mentions";
  mensagem: "message";
  midia: "media";
  midiaId: "mediaId";
  midias: "mediaItems";
  miniatura: "thumb";
  miniaturaMidia: "thumbMedia";
  miniaturaMs: "coverFrameMs";
  miniaturaTipo: "thumbType";
  modo: "mode";
  motivo: "reason";
  mover: "moveTo";
  moverRascunho: "moveToDraft";
  envio: "delivery";
  revogacaoPulada: "revocationSkipped";
  removido: "accountRemoved";
  motivoFalha: "failReason";
  verificadoEm: "checkedAt";
  mudou: "changed";
  naCaixaDeEntrada: "inInbox";
  nome: "name";
  novos: "created";
  ocultar: "hide";
  oculto: "hidden";
  opcoes: "options";
  ordem: "sort";
  origem: "origin";
  pagina: "page";
  paginas: "pages";
  parte: "part";
  parteMaxima: "maxPartSize";
  parteMinima: "minPartSize";
  padrao: "default";
  partes: "parts";
  parteSugerida: "suggestedPartSize";
  pendentes: "pending";
  pendentesPorRede: "pendingByNetwork";
  pendentesPorCanal: "pendingByChannel";
  periodo: "period";
  periodoAnterior: "previousPeriod";
  postsAnterior: "previousPosts";
  postsComMetricas: "postsWithMetrics";
  postsSemMetricas: "postsWithoutMetrics";
  prefixo: "prefix";
  privacidade: "privacy";
  privacidades: "privacyLevels";
  privacidadesPermitidas: "allowedPrivacyLevels";
  provedor: "provider";
  proxima: "next";
  publicadoEm: "publishedAt";
  publicaPelaMeta: "publishesViaMeta";
  publicarAgora: "publishNow";
  quando: "scheduledFor";
  rascunho: "draft";
  reacoes: "reactions";
  reconciliados: "reconciled";
  rede: "network";
  registros: "records";
  removida: "removed";
  reorganizados: "rescheduled";
  resolvido: "resolved";
  respondido: "answered";
  respostas: "replies";
  resultado: "result";
  resumo: "summary";
  revogada: "revoked";
  revogada_em: "revokedAt";
  revogadoNoTiktok: "revokedAtTiktok";
  revogadoNoGoogle: "revokedAtGoogle";
  novoPadrao: "newDefault";
  salvamentos: "saves";
  seguidores: "followers";
  seguidoresGanhos: "followersGained";
  seguidoresVar: "followersChange";
  semMetricas: "noMetrics";
  semResposta: "unanswered";
  servico: "service";
  simples: "simple";
  simulado: "simulated";
  simular: "dryRun";
  stitchDesabilitado: "stitchDisabled";
  substitui: "replaces";
  suportado: "supported";
  tamanho: "size";
  tempoAssistidoMin: "watchTimeMin";
  tempoMedioSeg: "avgWatchTimeSec";
  texto: "text";
  texto_base: "baseText";
  textos: "texts";
  tipo: "type";
  titulo: "title";
  total: "total";
  totalRespostas: "replyCount";
  ultima: "last";
  ultimaImportacao: "lastImport";
  ultimo_uso: "lastUsedAt";
  urlPublica: "publicUrl";
  usuario: "username";
  vagas: "slots";
  vagasLivres: "freeSlots";
  valor: "value";
  variacao: "change";
  verificar: "verify";
  versao: "version";
  visualizacoes: "viewCount";
  ignorados: "skippedCount";
  publicos: "publicCount";
  dias: "days";
  sucesso: "succeeded";
  picoPorMinuto: "peakPerMinute";
  limitePorMinuto: "limitPerMinute";
  porDia: "byDay";
  porHora: "byHour";
  porChave: "byKey";
  inicio: "start";
  ultimoEm: "lastAt";
  metodo: "method";
  rota: "route";
  duracaoMs: "durationMs";
  largura: "width";
  altura: "height";
  chaveNome: "keyName";
  eventos: "events";
  evento: "event";
  eventoId: "eventId";
  segredo: "secret";
  segredoDica: "secretHint";
  falhasSeguidas: "consecutiveFailures";
  desativadoMotivo: "disabledReason";
  recentes: "recentDeliveries";
  entregas: "deliveries";
  tentativas: "attempts";
  proximaTentativa: "nextAttemptAt";
  ultimoStatus: "lastStatus";
  ultimoErro: "lastError";
  entregueEm: "deliveredAt";
  apagado: "deleted";
  ideias: "ideas";
  nota: "note";
  grupo: "group";
  retencao: "retention";
  curva: "curve";
  impressoes: "impressions";
  posicao: "position";
  assistida: "watched";
  relativa: "relative";
  percentualMedio: "avgViewPercentage";
  taxaPulo: "skipRate";
  desde: "since";
  pontos: "points";
  coletadoEm: "collectedAt";
}
/** Campo do contrato que tem tradução (os de SAME_KEYS passam iguais e não entram aqui). */
export type ContractField = FieldMap[keyof FieldMap];
export type LegacyField = keyof FieldMap;
/** Campos iguais nos dois idiomas. */
export type SameField = "id" | "ctr" | "item" | "url" | "views" | "tags" | "meta" | "host" | "token" | "userId" | "ok" | "total" | "pct" | "manual" | "custom" | "studio" | "video" | "mime" | "etag" | "avatar" | "youtube" | "instagram" | "tiktok" | "publishAt" | "parentId" | "permalink" | "thumbnail" | "posts" | "topPosts" | "videos" | "redirect" | "chunkMB" | "via" | "videoId" | "postId" | "threadId" | "limit" | "max" | "publishId" | "status" | "p95Ms" | "cursor" | "webhooks" | "theme" | "language" | "notifications" | "email" | "panel" | "postSent" | "postFailed" | "scheduledFail" | "weeklySummary" | "newComment";
export type KeyRow = readonly [pt: string, en: string] | readonly [pt: string, en: string, only: "req" | "res"];
export declare const KEYS: ReadonlyArray<KeyRow>;
export declare const SCOPED_KEYS: { readonly reorganizados: ReadonlyArray<readonly [string, string]>; readonly leitura48h: ReadonlyArray<readonly [string, string]> };
export declare const SAME_KEYS: ReadonlySet<string>;
export declare const PT_ONLY_KEYS: ReadonlySet<string>;

// ---------------------------------------------------------------------------------------------------------------- valores
/** Valores que o servidor DEVOLVE em cada campo de vocabulário fechado, pelo nome do campo no contrato. */
export interface ContractValues {
  /** `estado` → `state` */
  state: "draft" | "scheduled" | "sent" | "error" | "canceled" | "private" | "queued" | "uploading" | "ready" | "removed" | "pending" | "reauthorize" | "unavailable" | "delivered" | "failed" | "discarded";
  /** `grupo` → `group` */
  group: "idea" | "scripting" | "ready" | "posted";
  /** `modo` → `mode` */
  mode: "private" | "scheduled" | "public" | "draft" | "direct" | "now";
  /** `mover` → `moveTo` */
  moveTo: "draft" | "queue";
  /** `tipo` → `type` */
  type: "cover" | "long" | "comment" | "schedule";
  /** `formato` → `format` */
  format: "long";
  /** `dia` → `day` */
  day: "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
  /** `escopo` → `scope` */
  scope: "read" | "write" | "admin";
  /** `origem` → `origin` */
  origin: "external" | "imported";
  /** `ordem` → `sort` */
  sort: "recent" | "comments" | "reactions" | "publishedAt" | "engagement" | "shares" | "saves" | "reach";
  /** `rede` → `network` */
  network: "all";
  /** `direcao` → `direction` */
  direction: never;
  /** `fonte` → `source` */
  source: "milestone48h" | "current" | "no-data";
  /** `detalhe` → `detail` */
  detail: "buffer-fallback" | "published" | "awaiting-time" | "publishing" | "prepared" | "preparing" | "awaiting-prep";
}
/** Valores aceitos num PEDIDO (inclui os sinônimos só de entrada, como `sunday`). */
export interface ContractRequestValues {
  state: "draft" | "scheduled" | "sent" | "error" | "canceled" | "private" | "queued" | "uploading" | "ready" | "removed" | "pending" | "reauthorize" | "unavailable" | "delivered" | "failed" | "discarded";
  group: "idea" | "scripting" | "ready" | "posted";
  mode: "private" | "scheduled" | "public" | "draft" | "direct" | "now";
  moveTo: "draft" | "queue";
  type: "cover" | "long" | "comment" | "schedule";
  format: "long";
  day: "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";
  scope: "read" | "write" | "admin";
  origin: "external" | "imported";
  sort: "recent" | "comments" | "reactions" | "publishedAt" | "engagement" | "shares" | "saves" | "reach";
  network: "all";
  direction: never;
  source: "milestone48h" | "current" | "no-data";
  detail: "buffer-fallback" | "published" | "awaiting-time" | "publishing" | "prepared" | "preparing" | "awaiting-prep";
}
/** Valores no vocabulário legado (PT), pelo nome PT do campo. */
export interface LegacyValues {
  estado: "rascunho" | "agendado" | "enviado" | "erro" | "cancelado" | "privado" | "fila" | "enviando" | "pronta" | "removida" | "pendente" | "reautorizar" | "indisponivel" | "entregue" | "falhou" | "descartada";
  grupo: "sem" | "fazer" | "andamento" | "feito";
  modo: "privado" | "agendado" | "publico" | "rascunho" | "direto" | "agora";
  mover: "rascunho" | "fila";
  tipo: "capa" | "longo" | "comentar" | "agendar";
  formato: "longo";
  dia: "dom" | "seg" | "ter" | "qua" | "qui" | "sex" | "sab";
  escopo: "leitura" | "escrita" | "admin";
  origem: "externo" | "importado";
  ordem: "recentes" | "comentarios" | "reacoes" | "publicadoEm" | "engajamento" | "compartilhamentos" | "salvamentos" | "alcance";
  rede: "todas" | "tudo";
  direcao: never;
  fonte: "marco48h" | "atual" | "sem-dados";
  detalhe: "reserva no Buffer" | "publicado" | "aguardando horário" | "publicando" | "preparado" | "preparando" | "aguardando preparo";
}
/** Vocabulários próprios dentro de um pai (`pai.campo`). */
export interface ContractScopedValues {
  "actions.state": "pending" | "running" | "done" | "error" | "canceled";
}
export type ValueRow = readonly [pt: string, en: string] | readonly [pt: string, en: string, only: "req" | "res"];
export declare const VALUES: { readonly [K in keyof LegacyValues]: ReadonlyArray<ValueRow> };
export declare const SCOPED_VALUES: { readonly acoes: { readonly estado: ReadonlyArray<ValueRow> } };

// ---------------------------------------------------------------------------------------------------------------- tradutores
export type Direction = "toEN" | "toPT";
export type MessageKind = "req" | "res";
export interface TranslateOptions { dir: Direction; kind: MessageKind; strict?: boolean; paths?: boolean }
export declare class PtKeyError extends Error { constructor(key: string, value?: string); key: string; value: string | undefined }
/** Traduz um valor JSON (objetos, listas e valores de vocabulário fechado). A forma muda de idioma, por isso a saída é `unknown` por padrão. */
export declare function translate<T = unknown>(value: unknown, o: TranslateOptions, container?: string | null, own?: string | null): T;
export declare function toEN<T = unknown>(value: unknown, kind?: MessageKind, o?: { strict?: boolean; paths?: boolean }): T;
export declare function toPT<T = unknown>(value: unknown, kind?: MessageKind, o?: { strict?: boolean; paths?: boolean }): T;
export declare function translateSlots<T>(slots: T, dir: Direction, o?: { strict?: boolean }): T;

// ---------------------------------------------------------------------------------------------------------------- erros
/** Código de erro legado (PT) → código do contrato (EN). */
export interface ErrorCodeMap {
  rota_inexistente: "route_not_found";
  metodo_nao_permitido: "method_not_allowed";
  erro_interno: "internal_error";
  nao_autenticado: "unauthorized";
  chave_invalida: "invalid_api_key";
  chave_revogada: "revoked_api_key";
  chave_expirada: "expired_api_key";
  mfa_necessario: "mfa_required";
  codigo_invalido: "invalid_code";
  mfa_ja_ativo: "mfa_already_enabled";
  mfa_nao_iniciado: "mfa_not_started";
  mfa_inativo: "mfa_not_enabled";
  sessao_atual: "current_session";
  sessao_inexistente: "session_not_found";
  confirmacao_invalida: "invalid_confirmation";
  sessao_invalida: "invalid_session";
  origem_invalida: "invalid_origin";
  sem_permissao: "forbidden";
  muitas_requisicoes: "rate_limited";
  corpo_vazio: "empty_body";
  json_invalido: "invalid_json";
  corpo_grande: "body_too_large";
  campo_invalido: "invalid_field";
  pedido_invalido: "invalid_request";
  falta_horario: "missing_schedule";
  sem_horario: "missing_time";
  horario_passado: "time_in_past";
  sem_vagas: "no_slots";
  sem_vaga_livre: "no_free_slot";
  post_inexistente: "post_not_found";
  destino_inexistente: "item_not_found";
  acao_inexistente: "action_not_found";
  canal_inexistente: "channel_not_found";
  canal_nao_conectado: "channel_not_connected";
  chave_inexistente: "api_key_not_found";
  workspace_inexistente: "workspace_not_found";
  oauth_requer_painel: "oauth_requires_panel";
  video_publicado: "video_not_private";
  canal_em_uso: "channel_in_use";
  canal_conectado: "channel_connected";
  canal_do_buffer: "channel_is_buffer";
  credenciais_invalidas: "invalid_credentials";
  senha_fraca: "weak_password";
  link_invalido: "invalid_link";
  conta_travada: "account_locked";
  passkey_invalida: "invalid_passkey";
  passkey_inexistente: "passkey_not_found";
  passkey_existente: "passkey_exists";
  desafio_invalido: "invalid_challenge";
  limite_de_passkeys: "passkey_limit";
  codigo_necessario: "code_required";
  workspace_da_plataforma: "platform_workspace";
  migracao_pendente: "migration_pending";
  chave_em_uso: "api_key_in_use";
  video_inexistente: "video_not_found";
  sem_video: "no_video";
  sem_avatar: "no_avatar";
  midia_inexistente: "media_not_found";
  midia_em_uso: "media_in_use";
  midia_nao_pronta: "media_not_ready";
  midia_tipo: "media_type_mismatch";
  midia_travada: "media_locked";
  rede_desconhecida: "unknown_network";
  rede_nao_suportada: "network_not_supported";
  estado_invalido: "invalid_state";
  id_existente: "id_exists";
  ja_adotado: "already_adopted";
  nada_a_publicar: "nothing_to_publish";
  nao_editavel: "not_editable";
  post_adotado: "post_adopted";
  post_preparado: "post_prepared";
  sem_credencial_oauth: "oauth_not_configured";
  tem_api: "followers_from_api";
  youtube_nao_conectado: "youtube_not_connected";
  instagram_meta_nao_conectado: "instagram_meta_not_connected";
  falha_download: "download_failed";
  mime_nao_suportado: "unsupported_mime";
  arquivo_grande: "file_too_large";
  parte_grande: "part_too_large";
  parte_pequena: "part_too_small";
  parte_vazia: "part_empty";
  partes_desiguais: "parts_unequal";
  partes_faltando: "parts_missing";
  sem_partes: "no_parts";
  tamanho_diferente: "size_mismatch";
  r2_recusou: "storage_rejected";
  identidade_inexistente: "identity_not_linked";
  ultima_forma_de_login: "last_login_method";
  credencial_oauth_ausente: "missing_oauth_credential";
  ja_conectado: "already_connected";
  oauth_state_invalido: "oauth_state_invalid";
  oauth_negado: "oauth_denied";
  sem_conta_instagram: "no_instagram_account";
  varias_contas_instagram: "multiple_instagram_accounts";
  troca_token_falhou: "token_exchange_failed";
  permissao_publicar_ausente: "publish_permission_missing";
  token_sem_acesso: "token_cannot_read_account";
  webhook_inexistente: "webhook_not_found";
  entrega_inexistente: "delivery_not_found";
  url_insegura: "unsafe_url";
  limite_webhooks: "webhook_limit_reached";
  ideia_inexistente: "idea_not_found";
  limite_ideias: "idea_limit_reached";
  idempotencia_reutilizada: "idempotency_key_reuse";
  idempotencia_em_andamento: "idempotency_in_progress";
  idempotencia_resposta_grande: "idempotency_response_too_large";
  buffer_erro: "buffer_error";
  instagram_erro: "instagram_error";
  tiktok_indisponivel: "tiktok_unavailable";
  youtube_erro: "youtube_error";
}
/** Código de erro do contrato (`error.code`). */
export type ErrorCode = ErrorCodeMap[keyof ErrorCodeMap];
/** Código de erro legado (`erro.codigo`). */
export type LegacyErrorCode = keyof ErrorCodeMap;
export declare const ERROR_CODES: Readonly<ErrorCodeMap>;
export declare const ERROR_CODES_REVERSE: { readonly [K in keyof ErrorCodeMap as ErrorCodeMap[K]]: K };
export declare function codeToEN<C extends string>(c: C): C extends LegacyErrorCode ? ErrorCodeMap[C] : C;
export declare function codeToPT(c: string): string;
/** Envelope de erro do contrato. Um código fora da tabela ainda pode chegar (servidor mais novo que o cliente). */
export interface ErrorEnvelope { error: { code: ErrorCode | (string & {}); message: string; details?: unknown } }
/** Envelope de erro legado (o que o front ainda confere). */
export interface LegacyErrorEnvelope { erro: { codigo: LegacyErrorCode | (string & {}); mensagem: string; detalhes?: unknown } }
export declare function errorEnvelopeToEN<T>(body: T): T extends LegacyErrorEnvelope ? ErrorEnvelope : T;
export declare function errorEnvelopeToPT<T>(body: T): T extends ErrorEnvelope ? LegacyErrorEnvelope : T;

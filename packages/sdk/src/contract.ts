// O contrato público da API do Praeko (antes: Arauto), em INGLÊS: fonte única, em código, do que está descrito em docs/api-contract.md.
// Daqui saem (1) a tabela de rotas novas e dos aliases legados em português, (2) os dicionários de campos e valores, (3) o mapa de códigos
// de erro e de escopos, e (4) os tradutores. O servidor traduz SÓ NA FRONTEIRA (entrada: EN → interno; saída: interno → EN); o banco, os
// JSONs gravados e os Workflows continuam em português. O front faz o caminho inverso (resposta EN → modelo de tela em PT). Sem dependências.
//
// Convenção: "PT" aqui é o vocabulário interno/legado (o que o servidor sempre falou); "EN" é o contrato novo.

// ---------------------------------------------------------------------------------------------------------------- escopos
export const SCOPES = { leitura: "read", escrita: "write", admin: "admin" } as const; // PT interno → EN
/** Escopo de uma chave de API no contrato. */
export type Scope = (typeof SCOPES)[keyof typeof SCOPES];
/** Escopo no vocabulário interno (legado). */
export type LegacyScope = keyof typeof SCOPES;
export const scopeToEN = <S extends string>(s: S): S extends LegacyScope ? (typeof SCOPES)[S] : S => ((SCOPES as Record<string, string>)[s] ?? s) as never;
export const scopeToPT = (s: string): string => Object.keys(SCOPES).find((k) => (SCOPES as Record<string, string>)[k] === s) ?? s;

// ---------------------------------------------------------------------------------------------------------------- rotas
// `key`: nome do handler no servidor. `path`: caminho novo; `legacy`: alias em português (null = sem alias). `scope`: escopo mínimo (EN)
// ou "public". `raw`: a resposta (HTML, mídia) e o pedido passam sem tradução. `body`: "json" (o corpo é traduzido), "bytes" (corpo binário, intocado) ou null. Os parâmetros de caminho se casam por posição.
// `query`: sobrescritas de valor de query só nesta rota (ex.: o import usa `all` ↔ `tudo`, os comentários `all` ↔ `todas`).
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";
/** Escopo mínimo de uma rota (ou "public"). */
export type RouteScope = Scope | "public";
/** A forma de uma linha da tabela de rotas (a tabela em si é `as const`: cada rota é um tipo literal). */
interface RouteDef {
  readonly key: string; readonly method: HttpMethod; readonly path: string; readonly legacy: string | null; readonly scope: RouteScope;
  readonly raw?: true; readonly body?: "json" | "bytes"; readonly query?: { readonly [campo: string]: { readonly [valor: string]: string } }; readonly summary: string;
}
export const ROUTES = [
  { key: "health", method: "GET", path: "/health", legacy: "/saude", scope: "public", summary: "Liveness probe" },
  { key: "health.v1", method: "GET", path: "/v1/health", legacy: "/v1/saude", scope: "public", summary: "Liveness probe (versioned path)" },
  { key: "connections.callback", method: "GET", path: "/connections/:network/callback", legacy: "/conexoes/:rede/retorno", scope: "public", raw: true, summary: "OAuth redirect target (HTML page; youtube, tiktok, meta); registered redirect URIs keep working" },
  { key: "media.public", method: "GET", path: "/v1/m/:id/:token/:name", legacy: null, scope: "public", raw: true, summary: "Public media by token (Range supported); also served at /m/…" },
  { key: "media.public", method: "HEAD", path: "/v1/m/:id/:token/:name", legacy: null, scope: "public", raw: true, summary: "Same as GET, headers only" },
  { key: "connections.start", method: "GET", path: "/v1/connections/:network/start", legacy: "/v1/conexoes/:rede/iniciar", scope: "write", summary: "Start OAuth for youtube|tiktok|meta (Instagram login); for youtube it always asks for `youtube.upload`, `youtube.force-ssl` and `yt-analytics.readonly` (retention, impressions, CTR; the consent screen lets the user untick a scope, and the channel then stays `reauthorize` in the retention view); the old `analytics=1` is accepted and ignored; returns the authorization URL. A different account of the same network becomes another channel; the same account is reconnected. `meta` takes `replace=true` (replace the token of an existing connection), `add=true` (connect ANOTHER Instagram account as a new channel) and `instagram=<username>`, `instagram_id=<id|current>`, `probe=true` (report only, stores nothing)" },
  { key: "connections.disconnect", method: "DELETE", path: "/v1/connections/:network", legacy: "/v1/conexoes/:rede", scope: "write", summary: "Disconnect one account of youtube|tiktok|instagram (Meta token only; the Buffer channel is never touched); `channel` picks the account, without it the default channel; other accounts, the channel and its history stay. If it was the default, another connected account takes over" },
  { key: "connections.instagramToken", method: "PUT", path: "/v1/connections/instagram/token", legacy: "/v1/conexoes/instagram/token", scope: "admin", body: "json", summary: "Store the Meta API token for Instagram (encrypted)" },
  { key: "channels.list", method: "GET", path: "/v1/channels", legacy: "/v1/canais", scope: "read", summary: "One item per connected channel (several accounts of a network = several items, `default` marks the one used without `channel`), plus a not-connected item for a network with none; status and slots count" },
  { key: "channels.default", method: "PUT", path: "/v1/channels/:channel/default", legacy: "/v1/canais/:canal/padrao", scope: "write", summary: "Make this account the default of its network (used when a network route has no `channel`); the other accounts of the same network lose the mark. 404 channel_not_found if it is not an active channel of this workspace" },
  { key: "channels.remove", method: "DELETE", path: "/v1/channels/:channel", legacy: "/v1/canais/:canal", scope: "write", summary: "Remove a DISCONNECTED account from the list (history stays; refused while connected, with pending items, or for the Buffer Instagram channel)" },
  { key: "channels.avatar", method: "GET", path: "/v1/channels/:network/avatar", legacy: "/v1/canais/:rede/avatar", scope: "read", summary: "Channel avatar image (`channel` picks the account)" },
  { key: "tiktok.creator", method: "GET", path: "/v1/tiktok/creator", legacy: "/v1/tiktok/criador", scope: "read", summary: "What the connected TikTok account accepts (creator_info); `channel` picks the account" },
  { key: "channels.slots.get", method: "GET", path: "/v1/channels/:network/slots", legacy: "/v1/canais/:rede/vagas", scope: "read", summary: "Weekly publishing slots of a channel (`channel` picks the account, else the default)" },
  { key: "channels.slots.put", method: "PUT", path: "/v1/channels/:network/slots", legacy: "/v1/canais/:rede/vagas", scope: "write", body: "json", summary: "Replace the weekly slots of one channel (`channel`; reorganizes its queued items)" },
  { key: "channels.followers.put", method: "PUT", path: "/v1/channels/:network/followers", legacy: "/v1/canais/:rede/seguidores", scope: "write", body: "json", summary: "Manual follower count (Instagram only; `channel` picks the account)" },
  { key: "channels.followers.get", method: "GET", path: "/v1/channels/:network/followers", legacy: "/v1/canais/:rede/seguidores", scope: "read", summary: "Last 60 daily follower records (`channel` picks the account)" },
  { key: "media.create", method: "POST", path: "/v1/media", legacy: "/v1/midia", scope: "write", body: "json", summary: "Start a media upload" },
  { key: "media.list", method: "GET", path: "/v1/media", legacy: "/v1/midia", scope: "read", summary: "List media (last 100); older videos get durationMs/width/height filled on first read" },
  { key: "media.get", method: "GET", path: "/v1/media/:id", legacy: "/v1/midia/:id", scope: "read", summary: "One media item (with publicUrl when ready; videos also carry durationMs, width and height when the container header says so)" },
  { key: "media.part", method: "PUT", path: "/v1/media/:id/parts/:part", legacy: "/v1/midia/:id/partes/:n", scope: "write", body: "bytes", summary: "Upload one part (raw bytes)" },
  { key: "media.content.put", method: "PUT", path: "/v1/media/:id/content", legacy: "/v1/midia/:id/conteudo", scope: "write", body: "bytes", summary: "Single-request upload (media created with simple: true)" },
  { key: "media.content.get", method: "GET", path: "/v1/media/:id/content", legacy: "/v1/midia/:id/conteudo", scope: "read", summary: "The file (Bearer, Range supported)" },
  { key: "media.content.head", method: "HEAD", path: "/v1/media/:id/content", legacy: "/v1/midia/:id/conteudo", scope: "read", summary: "Same as GET, headers only" },
  { key: "media.complete", method: "POST", path: "/v1/media/:id/complete", legacy: "/v1/midia/:id/completar", scope: "write", summary: "Join the parts" },
  { key: "media.delete", method: "DELETE", path: "/v1/media/:id", legacy: "/v1/midia/:id", scope: "write", summary: "Remove a media item (refused while used by a pending post)" },
  { key: "posts.create", method: "POST", path: "/v1/posts", legacy: "/v1/posts", scope: "write", body: "json", summary: "Create a post with one item per network (queue, fixed time or draft); an item may carry `channel` (account of that network; default channel without it)" },
  { key: "posts.adopt", method: "POST", path: "/v1/posts/adopt", legacy: "/v1/posts/adotar", scope: "write", body: "json", summary: "Register a Reel already scheduled in Buffer (does not call Buffer)" },
  { key: "posts.list", method: "GET", path: "/v1/posts", legacy: "/v1/posts", scope: "read", summary: "List posts (filters: state, channel, tag)" },
  { key: "posts.get", method: "GET", path: "/v1/posts/:id", legacy: "/v1/posts/:id", scope: "read", summary: "One post with its items and actions" },
  { key: "posts.update", method: "PATCH", path: "/v1/posts/:id", legacy: "/v1/posts/:id", scope: "write", body: "json", summary: "Edit title, texts, media, tags, items; move to draft/queue; reschedule/edit a YouTube video already uploaded and still scheduled" },
  { key: "posts.cancel", method: "DELETE", path: "/v1/posts/:id", legacy: "/v1/posts/:id", scope: "write", summary: "Cancel the pending items of a post" },
  { key: "posts.publishNow", method: "POST", path: "/v1/posts/:id/publish-now", legacy: "/v1/posts/:id/publicar-agora", scope: "write", summary: "Take pending items out of the queue and publish now (?network=)" },
  { key: "posts.youtubeSchedule", method: "POST", path: "/v1/posts/:id/youtube/schedule", legacy: "/v1/posts/:id/youtube/agendar", scope: "write", body: "json", summary: "Schedule publication of a video already uploaded to YouTube (private)" },
  { key: "posts.itemComment", method: "POST", path: "/v1/posts/:id/items/:item/comment", legacy: "/v1/posts/:id/itens/:destino/comentar", scope: "write", summary: "Release the stored pinned comment of an item" },
  { key: "calendar.get", method: "GET", path: "/v1/calendar", legacy: "/v1/calendario", scope: "read", summary: "Items in a period plus free slots" },
  { key: "insights.get", method: "GET", path: "/v1/insights", legacy: "/v1/insights", scope: "read", summary: "Cards, top posts, per-channel results (one row per account when a network has several; `channel` filters one account), summary, 48 h reading" },
  { key: "insights.retention", method: "GET", path: "/v1/insights/retention", legacy: "/v1/insights/retention", scope: "read", summary: "Retention, impressions and CTR per post of the period (`from`, `to`, `channel`, `limit` 1-200). YouTube: audience retention (YouTube Analytics API), thumbnail impressions and CTR (YouTube Reporting API); Instagram: reach, watch time and skip rate (Meta API). `channels[].state` says whether each account can deliver them: `ready`, `pending` (first report still being generated), `reauthorize` (reconnect YouTube once and keep the Analytics permission ticked), `unavailable` or `error`; a missing number is `null`, never 0" },
  { key: "insights.retention.item", method: "GET", path: "/v1/insights/:item/retention", legacy: "/v1/insights/:item/retention", scope: "read", summary: "One post (item id or imported content id) with its retention `curve`: points of `position` (0..1 of the video), `watched` (audienceWatchRatio, above 1 when viewers rewatch) and `relative` (relativeRetentionPerformance, 0.5 = median of similar-length videos)" },
  { key: "insights.import", method: "POST", path: "/v1/insights/import", legacy: "/v1/insights/importar", scope: "admin", query: { network: { all: "tudo" } }, summary: "Import history from YouTube, Buffer (Instagram) and TikTok (every connected account; `channel` with a network limits it to one)" },
  { key: "content.list", method: "GET", path: "/v1/content", legacy: "/v1/conteudo", scope: "read", summary: "Everything already published (Praeko + imported)" },
  { key: "youtube.videos", method: "GET", path: "/v1/youtube/videos", legacy: "/v1/youtube/videos", scope: "read", summary: "Channel videos (including private and scheduled); `channel` picks the account" },
  { key: "youtube.video", method: "GET", path: "/v1/youtube/videos/:id", legacy: "/v1/youtube/videos/:id", scope: "read", summary: "One video" },
  { key: "youtube.editVideo", method: "PATCH", path: "/v1/youtube/videos/:id", legacy: "/v1/youtube/videos/:id", scope: "write", body: "json", summary: "Edit title/description/tags (dryRun: true returns before/after only)" },
  { key: "youtube.comments", method: "GET", path: "/v1/youtube/comments", legacy: "/v1/youtube/comentarios", scope: "read", summary: "Comment threads (`channel` picks the account)" },
  { key: "youtube.reply", method: "POST", path: "/v1/youtube/comments/:id/reply", legacy: "/v1/youtube/comentarios/:id/responder", scope: "write", body: "json", summary: "Reply to a thread (writes to YouTube)" },
  { key: "youtube.resolve", method: "POST", path: "/v1/youtube/comments/:id/resolve", legacy: "/v1/youtube/comentarios/:id/resolver", scope: "write", summary: "Mark a thread as resolved (Praeko only)" },
  { key: "youtube.reopen", method: "DELETE", path: "/v1/youtube/comments/:id/resolve", legacy: "/v1/youtube/comentarios/:id/resolver", scope: "write", summary: "Reopen a resolved thread" },
  { key: "instagram.media", method: "GET", path: "/v1/instagram/media", legacy: "/v1/instagram/midias", scope: "read", summary: "Profile media grid (Meta API)" },
  { key: "instagram.comments", method: "GET", path: "/v1/instagram/comments", legacy: "/v1/instagram/comentarios", scope: "read", summary: "Instagram comments (Meta API)" },
  { key: "instagram.reply", method: "POST", path: "/v1/instagram/comments/:id/reply", legacy: "/v1/instagram/comentarios/:id/responder", scope: "write", body: "json", summary: "Reply to a comment (writes to Instagram)" },
  { key: "instagram.hide", method: "POST", path: "/v1/instagram/comments/:id/hide", legacy: "/v1/instagram/comentarios/:id/ocultar", scope: "write", body: "json", summary: "Hide or unhide a comment" },
  { key: "instagram.resolve", method: "POST", path: "/v1/instagram/comments/:id/resolve", legacy: "/v1/instagram/comentarios/:id/resolver", scope: "write", summary: "Mark a comment as resolved (Praeko only)" },
  { key: "instagram.reopen", method: "DELETE", path: "/v1/instagram/comments/:id/resolve", legacy: "/v1/instagram/comentarios/:id/resolver", scope: "write", summary: "Reopen a resolved comment" },
  { key: "comments.list", method: "GET", path: "/v1/comments", legacy: "/v1/comentarios", scope: "read", query: { network: { all: "todas" } }, summary: "Comments of all networks together, from EVERY active account of each network (each comment carries `channel`; `channel` filters one account; an account that fails goes to `errors`, the others still answer)" },
  { key: "mentions.list", method: "GET", path: "/v1/mentions", legacy: "/v1/mencoes", scope: "read", query: { network: { all: "todas" } }, summary: "Mentions (Instagram by tag; YouTube has none)" },
  { key: "apiKeys.list", method: "GET", path: "/v1/api-keys", legacy: "/v1/chaves", scope: "admin", summary: "List API keys (never the secret)" },
  { key: "apiKeys.create", method: "POST", path: "/v1/api-keys", legacy: "/v1/chaves", scope: "admin", body: "json", summary: "Create a key (the secret is shown once)" },
  { key: "apiKeys.revoke", method: "DELETE", path: "/v1/api-keys/:id", legacy: "/v1/chaves/:id", scope: "admin", summary: "Revoke a key" },
  // Rotas nascidas depois do contrato novo: sem caminho em português; o "legacy" é o mesmo caminho (sem o cabeçalho, a forma interna), como /v1/insights.
  { key: "usage.get", method: "GET", path: "/v1/usage", legacy: "/v1/usage", scope: "read", summary: "API usage of this workspace over the last `days` (1-30, default 7, UTC): total, succeeded (< 400), errors, p95 duration, peak requests in one minute vs the per-minute limit, `byDay`, `byHour` (only with days=1: the last 24 hours) and `byKey` (`session` = the panel)" },
  { key: "usage.log", method: "GET", path: "/v1/usage/log", legacy: "/v1/usage/log", scope: "read", summary: "Request log, newest first, kept 30 days; metadata only (method, route template without ids, status, duration, key), never bodies, headers or query. Filters: `key` (id or `session`), `status` (`2xx`|`3xx`|`4xx`|`5xx` or a code), `route` (substring), `method`, `days` (1-30); `limit` (1-200, default 50) and `cursor` (the `next` of the previous page)" },
  { key: "preferences.get", method: "GET", path: "/v1/preferences", legacy: "/v1/preferences", scope: "read", summary: "Panel preferences of the signed-in user in this workspace (an API key reads the workspace row): `theme` (light, dark, system), `language` (pt-BR, en) and `notifications` per event (`postSent`, `postFailed`, `scheduledFail`, `weeklySummary`, `newComment`) with `email` and `panel` flags. Missing values come back as the defaults (dark, pt-BR, no e-mail, panel on)" },
  { key: "preferences.put", method: "PUT", path: "/v1/preferences", legacy: "/v1/preferences", scope: "write", body: "json", summary: "Change preferences; partial (only the fields sent change) and strict (unknown field or value is 422 invalid_field). Returns the full preferences. With `email` true the server e-mails `postSent`, `postFailed`, `scheduledFail`, the `weeklySummary` (Mondays 08:00 America/Sao_Paulo) and `newComment` (batched, at most one e-mail per hour); with `panel` true it adds the event to the notification center (`GET /v1/notifications`)" },
  { key: "notifications.list", method: "GET", path: "/v1/notifications", legacy: "/v1/notifications", scope: "read", summary: "In-panel notification center of the signed-in user in this workspace (the bell), newest first: `notifications` (`id`, `event` = postSent, postFailed, scheduledFail, weeklySummary, newComment, `data` with the facts of the event, `link` to where it leads, `read`, `readAt`, `createdAt`), `unreadCount` and `next`. A notification exists only when the user's `panel` preference for that event was on when it happened. Filters: `unread` (true), `limit` (1-50, default 20) and `cursor` (the `next` of the previous page). Kept 30 days. An API key has no user and reads an empty list" },
  { key: "notifications.read", method: "POST", path: "/v1/notifications/read", legacy: "/v1/notifications/read", scope: "write", body: "json", summary: "Mark notifications as read: `ids` (up to 100) or `all: true`. Ids that are not yours or do not exist are ignored and marking again is harmless. Returns `marked` (how many changed) and the new `unreadCount`" },
  { key: "webhooks.list", method: "GET", path: "/v1/webhooks", legacy: "/v1/webhooks", scope: "admin", summary: "Outgoing webhooks of this workspace (never the secret: only `secretHint`), with the delivery success of the last 7 days (`recentDeliveries`) and the subscribable `events`" },
  { key: "webhooks.create", method: "POST", path: "/v1/webhooks", legacy: "/v1/webhooks", scope: "admin", body: "json", summary: "Create a webhook: `url` (https, public host; private IPs, localhost and cloud metadata are refused with unsafe_url), `events` (post.sent, post.failed, post.scheduled-fail; default the first two), `active`. The signing `secret` is returned ONCE. Max 10 per workspace" },
  { key: "webhooks.get", method: "GET", path: "/v1/webhooks/:id", legacy: "/v1/webhooks/:id", scope: "admin", summary: "One webhook (no secret)" },
  { key: "webhooks.update", method: "PATCH", path: "/v1/webhooks/:id", legacy: "/v1/webhooks/:id", scope: "admin", body: "json", summary: "Change `url`, `events` or `active`. Pausing discards the pending deliveries; re-activating resets the failure count" },
  { key: "webhooks.delete", method: "DELETE", path: "/v1/webhooks/:id", legacy: "/v1/webhooks/:id", scope: "admin", summary: "Delete a webhook and its delivery history" },
  { key: "webhooks.test", method: "POST", path: "/v1/webhooks/:id/test", legacy: "/v1/webhooks/:id/test", scope: "admin", summary: "Send a `ping.test` event now (even when paused) and return the `delivery` result; it does not count towards auto-disable" },
  { key: "webhooks.deliveries", method: "GET", path: "/v1/webhooks/:id/deliveries", legacy: "/v1/webhooks/:id/deliveries", scope: "admin", summary: "Recent deliveries, newest first (`limit` 1-100, default 20; kept 30 days): event, state (pending, delivered, failed, discarded), attempts, last HTTP status and error, duration" },
  { key: "webhooks.redeliver", method: "POST", path: "/v1/webhooks/:id/deliveries/:delivery/retry", legacy: "/v1/webhooks/:id/deliveries/:delivery/retry", scope: "admin", summary: "Send one delivery again now, with the same `Praeko-Delivery` id (receivers can deduplicate)" },
  { key: "webhooks.rotateSecret", method: "POST", path: "/v1/webhooks/:id/rotate-secret", legacy: "/v1/webhooks/:id/rotate-secret", scope: "admin", summary: "Replace the signing secret; the new `secret` is returned ONCE and the old one stops signing immediately" },
  { key: "ideas.list", method: "GET", path: "/v1/ideas", legacy: "/v1/ideas", scope: "read", summary: "Idea board of this workspace (the \"Create\" screen), newest first: `title`, `note`, `group` (idea, scripting, ready, posted), `tags` (the first one is the series), `createdAt`, `updatedAt`" },
  { key: "ideas.create", method: "POST", path: "/v1/ideas", legacy: "/v1/ideas", scope: "write", body: "json", summary: "Add an idea: `title` (1-200 characters, required), `note` (up to 5000), `group` (default idea), `tags` (up to 20, 40 characters each). Max 2000 per workspace" },
  { key: "ideas.import", method: "POST", path: "/v1/ideas/import", legacy: "/v1/ideas/import", scope: "write", body: "json", summary: "Bulk-add `ideas` (up to 500 per call), as the panel does with the ideas it kept in the browser. An item whose `id` was already imported is skipped (`skippedCount`), so repeating the call never duplicates. Items without a valid `title` are skipped" },
  { key: "ideas.update", method: "PATCH", path: "/v1/ideas/:id", legacy: "/v1/ideas/:id", scope: "write", body: "json", summary: "Change `title`, `note`, `group` (moving a card) or `tags`; omitted fields stay" },
  { key: "ideas.delete", method: "DELETE", path: "/v1/ideas/:id", legacy: "/v1/ideas/:id", scope: "write", summary: "Delete an idea" },
] as const satisfies readonly RouteDef[];
/** Uma rota da tabela, como tipo literal (`Route["key"]` é a união das chaves). */
export type Route = (typeof ROUTES)[number];
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

/** Rota aceita também em `/m/…` (o mesmo handler da mídia pública). */
export const MEDIA_PUBLIC_ALIAS_PREFIX = "/m";

/** Nomes dos parâmetros de caminho de um template, em ordem. */
export const paramNames = (tpl: string): string[] => [...tpl.matchAll(/:([A-Za-z_]+)/g)].map((m) => m[1] as string);
/** Preenche um template com valores (na ordem dos parâmetros). */
export const fillPath = (tpl: string, values: ReadonlyArray<string | number | null | undefined>): string => { let i = 0; return tpl.replace(/:[A-Za-z_]+/g, () => encodeURIComponent(values[i++] ?? "")); };
const toRegExp = (tpl: string) => new RegExp("^" + tpl.replace(/:[A-Za-z_]+/g, "([^/]+)").replace(/\//g, "\\/") + "$");
const NEW_RE = ROUTES.map((r) => ({ r: r as Route, re: toRegExp(r.path) })), OLD_RE = ROUTES.flatMap((r) => (r.legacy ? [{ r: r as Route, re: toRegExp(r.legacy) }] : []));
export interface RouteMatch { route: Route; values: string[] }

/** Acha a rota pelo método e caminho NOVO. `{ route, values }` ou null. */
export function matchNew(method: string, pathname: string): RouteMatch | null {
  for (const { r, re } of NEW_RE) { const m = r.method === method && re.exec(pathname); if (m) return { route: r, values: m.slice(1).map((v) => decodeURIComponent(v)) }; }
  return null;
}
/** Acha a rota pelo método e caminho LEGADO. */
export function matchLegacy(method: string, pathname: string): RouteMatch | null {
  for (const { r, re } of OLD_RE) { const m = r.method === method && re.exec(pathname); if (m) return { route: r, values: m.slice(1).map((v) => decodeURIComponent(v)) }; }
  return null;
}
/** Caminho novo equivalente a um caminho legado (para o cabeçalho Link e para os testes), ou null. */
export function newPathOf(method: string, legacyPath: string): string | null { const m = matchLegacy(method, legacyPath); return m ? fillPath(m.route.path, m.values) : null; }
/** Caminho legado equivalente a um caminho novo. */
export function legacyPathOf(method: string, newPath: string): string | null { const m = matchNew(method, newPath); return m?.route.legacy ? fillPath(m.route.legacy, m.values) : null; }

// ---------------------------------------------------------------------------------------------------------------- dicionários de chaves
// [pt, en] vale nos dois sentidos de mensagem; [pt, en, "req"] só em pedidos (corpo e query); [pt, en, "res"] só em respostas.
// Chaves iguais nos dois idiomas (id, url, views, tags, meta, host, token…) não entram: passam sem mudar (veja SAME_KEYS).
export type KeyRow = readonly [pt: string, en: string] | readonly [pt: string, en: string, only: "req" | "res"];
const KEY_ROWS = [
  ["abs", "absolute"], ["acao", "action"], ["acoes", "actions"], ["adotado", "adopted"], ["agregadoAtualizadoEm", "aggregateUpdatedAt"], ["agregadoBuffer", "bufferAggregate"],
  ["aplicado", "applied"], ["notas", "notes", "res"], ["tagsVideo", "videoTags", "req"], ["campo", "field"], ["campos", "fields"], ["naoAplicados", "notApplied"], ["resultadosItens", "itemResults"],
  ["alcance", "reach"], ["anterior", "previous"], ["antes", "before"], ["appAuditado", "appAudited"], ["ate", "to"], ["ativa", "active"], ["atual", "current"],
  ["atualizado_em", "updatedAt"], ["atualizados", "updated"], ["autor", "author"], ["autorCanal", "authorChannel"], ["aviso", "warning"], ["avisarInscritos", "notifySubscribers"],
  ["canais", "channels"], ["canal", "channel"], ["canalId", "channelId"], ["cancelados", "canceled"], ["cancelar", "cancel"], ["capa", "cover"], ["capaNoQuadro", "coverInFrame"],
  ["cartoes", "cards"], ["categoriaId", "categoryId"], ["chave", "key"], ["chaves", "keys"], ["codigo", "code"], ["coleta", "collection"], ["coletando", "collecting"],
  ["comentar", "comment", "req"], ["comentario", "comment", "res"], ["comentarioDesabilitado", "commentsDisabled"], ["comentarioFixo", "pinnedComment"], ["comentarios", "comments"],
  ["compartilhamentos", "shares"], ["compartilharNoFeed", "shareToFeed"], ["comparar", "compare"], ["conectado", "connected"], ["conectadoEm", "connectedAt"], ["consultadoEm", "queriedAt"],
  ["conteudoComercial", "commercialContent"], ["criado_em", "createdAt"], ["curtidas", "likes"], ["de", "from"], ["depois", "after"], ["deslocamento", "offset"],
  ["desabilitarComentarios", "disableComments"], ["desabilitarDueto", "disableDuet"], ["desabilitarStitch", "disableStitch"], ["desconectado", "disconnected"], ["descricao", "description"],
  ["destino_id", "itemId"], ["destinos", "items", "req"], ["detalhe", "detail"], ["detalhes", "details"], ["dia", "day"], ["dia_semana", "weekday"], ["direcao", "direction"],
  ["diretoDisponivel", "directAvailable"], ["doDono", "fromOwner"], ["duetoDesabilitado", "duetDisabled"], ["duracaoMaxSeg", "maxDurationSec"], ["editarHorario", "editSchedule"],
  ["editarTexto", "editText"], ["encontrados", "found"], ["engajamento", "engagement"], ["engajamentoGeral", "overallEngagement"], ["enviar", "uploadHint"], ["erro", "error"], ["erros", "errors"],
  ["escopo", "scope"], ["escrito", "written"], ["estado", "state"], ["etiqueta", "tag"], ["etiquetas", "tags"], ["executarEm", "runAt"], ["expiraEm", "expiresAt"], ["expiraEmDias", "expiresInDays", "req"], ["expirada", "expired"], ["diasRestantes", "daysLeft"], ["externo", "external"],
  ["fila", "queue"], ["filtros", "filters"], ["fonte", "source"], ["fontes", "sources"], ["formato", "format"], ["fuso", "timezone"], ["hora", "time"],
  ["ignorado", "skipped"], ["importados", "imported"], ["itens", "items", "res"], ["jaFeita", "alreadyDone"], ["legenda", "caption"], ["leitura48h", "reading48h"],
  ["leitura48hTexto", "reading48hText"], ["leiturasNoBanco", "storedReadings"], ["lembrete", "reminder"], ["limite", "limit"], ["mantidos", "kept"], ["marcaPropria", "ownBrand"],
  ["marcaTerceiros", "thirdPartyBrand"], ["marcos", "milestones"], ["mencoes", "mentions"], ["mensagem", "message"], ["midia", "media"], ["midiaId", "mediaId"], ["midias", "mediaItems"], ["miniatura", "thumb"],
  ["miniaturaMidia", "thumbMedia"], ["miniaturaMs", "coverFrameMs"], ["miniaturaTipo", "thumbType"], ["modo", "mode"], ["motivo", "reason"], ["mover", "moveTo"],
  ["moverRascunho", "moveToDraft"], ["envio", "delivery"], ["revogacaoPulada", "revocationSkipped"], ["removido", "accountRemoved"], ["motivoFalha", "failReason"], ["verificadoEm", "checkedAt"], ["mudou", "changed"], ["naCaixaDeEntrada", "inInbox"], ["nome", "name"], ["novos", "created"], ["ocultar", "hide"], ["oculto", "hidden"],
  ["opcoes", "options"], ["ordem", "sort"], ["origem", "origin"], ["pagina", "page"], ["paginas", "pages"], ["parte", "part"], ["parteMaxima", "maxPartSize"], ["parteMinima", "minPartSize"],
  ["padrao", "default"], ["partes", "parts"], ["parteSugerida", "suggestedPartSize"], ["pendentes", "pending"], ["pendentesPorRede", "pendingByNetwork"], ["pendentesPorCanal", "pendingByChannel"], ["periodo", "period"], ["periodoAnterior", "previousPeriod"],
  ["postsAnterior", "previousPosts"], ["postsComMetricas", "postsWithMetrics"], ["postsSemMetricas", "postsWithoutMetrics"], ["prefixo", "prefix"], ["privacidade", "privacy"],
  ["privacidades", "privacyLevels"], ["privacidadesPermitidas", "allowedPrivacyLevels"], ["provedor", "provider"], ["proxima", "next"], ["publicadoEm", "publishedAt"],
  ["publicaPelaMeta", "publishesViaMeta"], ["publicarAgora", "publishNow"], ["quando", "scheduledFor"], ["rascunho", "draft"], ["reacoes", "reactions"], ["reconciliados", "reconciled"],
  ["rede", "network"], ["registros", "records"], ["removida", "removed"], ["reorganizados", "rescheduled"], ["resolvido", "resolved"], ["respondido", "answered"], ["respostas", "replies"],
  ["resultado", "result"], ["resumo", "summary"], ["revogada", "revoked"], ["revogada_em", "revokedAt"], ["revogadoNoTiktok", "revokedAtTiktok"], ["revogadoNoGoogle", "revokedAtGoogle"], ["novoPadrao", "newDefault"], ["salvamentos", "saves"],
  ["seguidores", "followers"], ["seguidoresGanhos", "followersGained"], ["seguidoresVar", "followersChange"], ["semMetricas", "noMetrics"], ["semResposta", "unanswered"],
  ["servico", "service"], ["simples", "simple"], ["simulado", "simulated"], ["simular", "dryRun"], ["stitchDesabilitado", "stitchDisabled"], ["substitui", "replaces"], ["suportado", "supported"],
  ["tamanho", "size"], ["tempoAssistidoMin", "watchTimeMin"], ["tempoMedioSeg", "avgWatchTimeSec"], ["texto", "text"], ["texto_base", "baseText"], ["textos", "texts"], ["tipo", "type"],
  ["titulo", "title"], ["total", "total"], ["totalRespostas", "replyCount"], ["ultima", "last"], ["ultimaImportacao", "lastImport"], ["ultimo_uso", "lastUsedAt"], ["urlPublica", "publicUrl"],
  ["usuario", "username"], ["vagas", "slots"], ["vagasLivres", "freeSlots"], ["valor", "value"], ["variacao", "change"], ["verificar", "verify"], ["versao", "version"],
  ["visualizacoes", "viewCount"], ["ignorados", "skippedCount"], ["publicos", "publicCount"],
  // uso e log de requisições (/v1/usage)
  ["dias", "days"], ["sucesso", "succeeded"], ["picoPorMinuto", "peakPerMinute"], ["limitePorMinuto", "limitPerMinute"], ["porDia", "byDay"], ["porHora", "byHour"], ["porChave", "byKey"],
  ["inicio", "start"], ["ultimoEm", "lastAt"], ["metodo", "method"], ["rota", "route"], ["duracaoMs", "durationMs"], ["duracao", "duration"], ["largura", "width"], ["altura", "height"], ["chaveNome", "keyName"],
  // webhooks (/v1/webhooks)
  ["eventos", "events"], ["evento", "event"], ["eventoId", "eventId"], ["segredo", "secret"], ["segredoDica", "secretHint"], ["falhasSeguidas", "consecutiveFailures"],
  ["desativadoMotivo", "disabledReason"], ["recentes", "recentDeliveries"], ["entregas", "deliveries"], ["tentativas", "attempts"], ["proximaTentativa", "nextAttemptAt"],
  ["ultimoStatus", "lastStatus"], ["ultimoErro", "lastError"], ["entregueEm", "deliveredAt"], ["apagado", "deleted"],
  // banco de ideias (/v1/ideas)
  ["ideias", "ideas"], ["nota", "note"], ["grupo", "group"],
  // central de avisos (/v1/notifications)
  ["naoLidos", "unreadCount"], ["lido", "read"], ["lido_em", "readAt"], ["dados", "data"], ["marcados", "marked"], ["vaiTentar", "willRetry"], ["quantidade", "count"], ["enviados", "sent"], ["falhas", "failed"], ["esperando", "waiting"], ["topTitulo", "topTitle"], ["topRede", "topNetwork"],
  // retenção, impressões e CTR (/v1/insights/retention)
  ["retencao", "retention"], ["curva", "curve"], ["impressoes", "impressions"], ["posicao", "position"], ["assistida", "watched"], ["relativa", "relative"], ["percentualMedio", "avgViewPercentage"],
  ["taxaPulo", "skipRate"], ["desde", "since"], ["pontos", "points"], ["coletadoEm", "collectedAt"],
] as const satisfies readonly KeyRow[];
export const KEYS: ReadonlyArray<KeyRow> = KEY_ROWS.filter((x, i, a) => a.findIndex((y) => y[0] === x[0]) === i);
/** Campo legado (PT) → campo do contrato (EN) (a primeira linha de cada campo vale; veja o comentário de cada linha acima). */
export type FieldMap = { [R in (typeof KEY_ROWS)[number] as R[0]]: R[1] };
/** Campo do contrato que tem tradução (os de SAME_KEYS passam iguais e não entram aqui). */
export type ContractField = FieldMap[keyof FieldMap];
export type LegacyField = keyof FieldMap;
// `para` (par de `de` em reorganizados) e `de`/`ate` (período) têm contexto próprio:
export const SCOPED_KEYS = { reorganizados: [["de", "from"], ["para", "to"]], leitura48h: [["destinoId", "itemId"]] } as const satisfies Record<string, ReadonlyArray<readonly [string, string]>>;

/** Chaves que são iguais nos dois idiomas (ou nomes de rede/métrica): passam sem tradução e não disparam o aviso de "chave em português". */
const SAME_LIST = (["id", "ctr", "item", "url", "views", "tags", "meta", "host", "token", "userId", "ok", "total", "pct", "manual", "custom", "studio", "video", "mime", "etag", "avatar", "youtube", "instagram", "tiktok", "publishAt", "parentId", "permalink", "thumbnail", "posts", "topPosts", "videos", "redirect", "chunkMB", "via", "videoId", "postId", "threadId", "limit", "max", "publishId", "status", "p95Ms", "cursor", "webhooks", "theme", "language", "notifications", "email", "panel", "postSent", "postFailed", "scheduledFail", "weeklySummary", "newComment", "unread", "ids", "all", "link", "topViews"] as const);
/** Campos iguais nos dois idiomas. */
export type SameField = (typeof SAME_LIST)[number];
export const SAME_KEYS: ReadonlySet<string> = new Set<string>(SAME_LIST);

// ---------------------------------------------------------------------------------------------------------------- dicionários de valores
// Por nome interno (PT) do campo. [pt, en] nos dois sentidos; [pt, en, "req"|"res"] só de um lado.
export const VALUES = {
  estado: [["rascunho", "draft"], ["agendado", "scheduled"], ["enviado", "sent"], ["erro", "error"], ["cancelado", "canceled"], ["privado", "private"], ["fila", "queued"],
    ["enviando", "uploading"], ["pronta", "ready"], ["removida", "removed"],
    ["pendente", "pending"], ["reautorizar", "reauthorize"], ["indisponivel", "unavailable"], ["entregue", "delivered"], ["falhou", "failed"], ["descartada", "discarded"]], // os quatro últimos: entregas de webhook
  grupo: [["sem", "idea"], ["fazer", "scripting"], ["andamento", "ready"], ["feito", "posted"]], // grupos do quadro de ideias (Ideia, Roteirizando, Pronto para postar, Postado)
  modo: [["privado", "private"], ["agendado", "scheduled"], ["publico", "public"], ["rascunho", "draft"], ["direto", "direct"], ["agora", "now"]],
  mover: [["rascunho", "draft"], ["fila", "queue"]],
  tipo: [["capa", "cover"], ["longo", "long"], ["comentar", "comment"], ["agendar", "schedule"]],
  formato: [["longo", "long"]],
  dia: [["dom", "sun"], ["seg", "mon"], ["ter", "tue"], ["qua", "wed"], ["qui", "thu"], ["sex", "fri"], ["sab", "sat"],
    ["dom", "sunday", "req"], ["seg", "monday", "req"], ["ter", "tuesday", "req"], ["qua", "wednesday", "req"], ["qui", "thursday", "req"], ["sex", "friday", "req"], ["sab", "saturday", "req"]],
  escopo: [["leitura", "read"], ["escrita", "write"], ["admin", "admin"]],
  origem: [["externo", "external"], ["importado", "imported"]],
  ordem: [["recentes", "recent"], ["comentarios", "comments"], ["reacoes", "reactions"], ["publicadoEm", "publishedAt"], ["engajamento", "engagement"], ["compartilhamentos", "shares"],
    ["salvamentos", "saves"], ["alcance", "reach"]],
  rede: [["todas", "all"], ["tudo", "all"]],
  direcao: [],
  fonte: [["marco48h", "milestone48h"], ["atual", "current"], ["sem-dados", "no-data"]],
  detalhe: [["reserva no Buffer", "buffer-fallback"], ["publicado", "published"], ["aguardando horário", "awaiting-time"], ["publicando", "publishing"], ["preparado", "prepared"],
    ["preparando", "preparing"], ["aguardando preparo", "awaiting-prep"]],
} as const satisfies Record<string, ReadonlyArray<KeyRow>>;
// Valores com dicionário próprio dentro de um pai: `acoes[].estado` (estados das ações seguintes, distintos dos estados do item).
export const SCOPED_VALUES = {
  acoes: { estado: [["agendada", "pending"], ["executando", "running"], ["feita", "done"], ["erro", "error"], ["cancelada", "canceled"]] },
} as const satisfies Record<string, Record<string, ReadonlyArray<KeyRow>>>;

/** EN de um campo PT (a primeira linha de KEYS que o define), ou o próprio nome. */
type EN<P extends string> = P extends keyof FieldMap ? FieldMap[P] : P;
type ResponseEN<R> = R extends readonly [string, string, "req"] ? never : R extends readonly [string, infer E extends string, ...unknown[]] ? E : never;
type AnyEN<R> = R extends readonly [string, infer E extends string, ...unknown[]] ? E : never;
type AnyPT<R> = R extends readonly [infer V extends string, ...unknown[]] ? V : never;
/** Valores que o servidor DEVOLVE em cada campo de vocabulário fechado, pelo nome do campo no contrato. */
export type ContractValues = { [P in keyof typeof VALUES as EN<P>]: ResponseEN<(typeof VALUES)[P][number]> };
/** Valores aceitos num PEDIDO (inclui os sinônimos só de entrada, como `sunday`). */
export type ContractRequestValues = { [P in keyof typeof VALUES as EN<P>]: AnyEN<(typeof VALUES)[P][number]> };
/** Valores no vocabulário legado (PT), pelo nome PT do campo. */
export type LegacyValues = { [P in keyof typeof VALUES]: AnyPT<(typeof VALUES)[P][number]> };
/** Vocabulários próprios dentro de um pai (`pai.campo`). */
export type ContractScopedValues = { [P in keyof typeof SCOPED_VALUES & string as `${EN<P>}.${EN<keyof (typeof SCOPED_VALUES)[P] & string>}`]: { [C in keyof (typeof SCOPED_VALUES)[P]]: AnyEN<(typeof SCOPED_VALUES)[P][C][number & keyof (typeof SCOPED_VALUES)[P][C]]> }[keyof (typeof SCOPED_VALUES)[P]] };
export type ValueRow = KeyRow;

// Valores que são caminhos da própria API (reescritos só com { paths: true }).
const PATH_KEYS = new Set(["avatar", "enviar"]); // nomes PT
const PATH_PAIRS = [["/v1/canais/", "/v1/channels/"], ["?canal=", "?channel="], ["/v1/midia", "/v1/media"], ["/conteudo", "/content"], ["/partes/", "/parts/"]] as const;
const rewritePath = (s: string, dir: Direction): string => PATH_PAIRS.reduce((x: string, [pt, en]) => (dir === "toEN" ? x.split(pt).join(en) : x.split(en).join(pt)), s);

// ---------------------------------------------------------------------------------------------------------------- tradutores
export type Direction = "toEN" | "toPT";
export type MessageKind = "req" | "res";
export interface TranslateOptions { dir: Direction; kind: MessageKind; strict?: boolean; paths?: boolean }
type Dict = Map<string, string>;
const index = (rows: ReadonlyArray<KeyRow>, dir: Direction): Record<MessageKind, Dict> => { // dir: "toEN" | "toPT"; kind: "req" | "res" → Map
  const mk = (kind: MessageKind): Dict => {
    const m: Dict = new Map();
    for (const [pt, en, only] of rows as ReadonlyArray<readonly [string, string, ("req" | "res")?]>) {
      if (only && only !== kind) continue;
      if (dir === "toEN") { if (!m.has(pt)) m.set(pt, en); } else if (!m.has(en)) m.set(en, pt);
    }
    return m;
  };
  return { req: mk("req"), res: mk("res") };
};
type Idx = Record<Direction, Record<MessageKind, Dict>>;
const both = (rows: ReadonlyArray<KeyRow>): Idx => ({ toEN: index(rows, "toEN"), toPT: index(rows, "toPT") });
const KEY_IDX: Idx = both(KEYS);
const VAL_IDX: Record<string, Idx> = Object.fromEntries(Object.entries(VALUES).map(([k, rows]) => [k, both(rows)]));
const SKEY_IDX: Record<string, Idx> = Object.fromEntries(Object.entries(SCOPED_KEYS).map(([k, rows]) => [k, both(rows)]));
const SVAL_IDX: Record<string, Record<string, Idx>> = Object.fromEntries(Object.entries(SCOPED_VALUES).map(([p, fields]) => [p, Object.fromEntries(Object.entries(fields).map(([k, rows]) => [k, both(rows)]))]));
/** Chaves PT que existem só em português (não existem no contrato novo): num PEDIDO novo viram erro 422 em vez de passar calados. */
export const PT_ONLY_KEYS: ReadonlySet<string> = new Set(KEYS.filter(([pt, en]) => pt !== en).map(([pt]) => pt));
const EN_KEYS = new Set(KEYS.map(([, en]) => en));
for (const k of EN_KEYS) (PT_ONLY_KEYS as Set<string>).delete(k); // uma chave que é PT numa linha e EN em outra não é "só PT"

const EN_ALSO = new Set(Object.entries(VALUES).flatMap(([campo, rows]) => (rows as ReadonlyArray<KeyRow>).map((r) => `${campo}|${r[1]}`))); // valor PT que também é um valor EN (ex.: admin, video)
const SLOT_DAY = [["dom", "sun"], ["seg", "mon"], ["ter", "tue"], ["qua", "wed"], ["qui", "thu"], ["sex", "fri"], ["sab", "sat"], ["dom", "sunday"], ["seg", "monday"], ["ter", "tuesday"], ["qua", "wednesday"], ["qui", "thursday"], ["sex", "friday"], ["sab", "saturday"]] as const;
const slotString = (s: string, dir: Direction): string => {
  const m = /^(\s*)([^\s]+)(\s+\d{1,2}:\d{2}\s*)$/.exec(s); if (!m) return s;
  const hit = SLOT_DAY.find(([pt, en]) => (dir === "toEN" ? pt : en) === (m[2] as string).toLowerCase());
  return hit ? m[1] + (dir === "toEN" ? hit[1] : hit[0]) + m[3] : s;
};

export class PtKeyError extends Error {
  key: string; value: string | undefined;
  constructor(key: string, value?: string) { super(value === undefined ? `o campo "${key}" não existe no contrato novo` : `o valor "${value}" de "${key}" não existe no contrato novo`); this.name = "PtKeyError"; this.key = key; this.value = value; }
}

/** Valores que só existem em português (ex.: `fila`, `agendado`, `escrita`) por campo: num PEDIDO novo viram erro 422 em vez de passar calados. */
const PT_ONLY_VALUES: Record<string, Set<string>> = {};
for (const [campo, rows] of Object.entries(VALUES) as [string, ReadonlyArray<KeyRow>][]) {
  const en = new Set(rows.map((r) => r[1]));
  PT_ONLY_VALUES[campo] = new Set(rows.filter((r) => !r[2] || r[2] === "req").map((r) => r[0]).filter((pt) => !en.has(pt)));
}
for (const [pai, campos] of Object.entries(SCOPED_VALUES) as [string, Record<string, ReadonlyArray<KeyRow>>][]) for (const [campo, rows] of Object.entries(campos)) { const en = new Set(rows.map((r) => r[1])); (PT_ONLY_VALUES[`${pai}.${campo}`] ||= new Set(rows.map((r) => r[0]).filter((pt) => !en.has(pt)))); }

/**
 * Traduz um valor JSON. `dir`: "toEN" (interno → contrato) ou "toPT" (contrato → interno); `kind`: "req" (corpo/query de pedido) ou "res" (resposta).
 * `strict` (pedidos novos): uma chave que só existe em português lança PtKeyError. `paths`: reescreve caminhos da API dentro de valores.
 * Valores de texto livre (título, legenda…) nunca passam por dicionário: só campos de vocabulário fechado (estado, modo, tipo…).
 * A forma muda de idioma, por isso a saída é `unknown` por padrão: quem chama diz o tipo que espera.
 */
export function translate<T = unknown>(value: unknown, o: TranslateOptions, container: string | null = null, own: string | null = null): T {
  const { dir, kind } = o;
  if (Array.isArray(value)) return value.map((x) => translate(x, o, container, own)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}, scoped = own === null ? undefined : SKEY_IDX[own]?.[dir]?.[kind];
    for (const [k, v] of Object.entries(value)) {
      const hit = scoped?.get(k) ?? KEY_IDX[dir][kind].get(k);
      if (hit === undefined && o.strict && dir === "toPT" && PT_ONLY_KEYS.has(k) && !SAME_KEYS.has(k)) throw new PtKeyError(k);
      const outKey = hit ?? k, ptKey = dir === "toEN" ? k : outKey; // o dicionário de valores é indexado pelo nome PT
      out[outKey] = translate(v, o, own, ptKey);
    }
    return out as T;
  }
  if (typeof value === "string" && own !== null) {
    const idx = (container === null ? undefined : SVAL_IDX[container]?.[own]) ?? VAL_IDX[own], mapped = idx?.[dir]?.[kind]?.get(value);
    if (mapped !== undefined) return mapped as T;
    if (o.strict && dir === "toPT" && kind === "req" && PT_ONLY_VALUES[own]?.has(value) && !EN_ALSO.has(`${own}|${value}`)) throw new PtKeyError(own, value);
    if (o.paths && PATH_KEYS.has(own)) return rewritePath(value, dir) as T;
  }
  return value as T;
}

export const toEN = <T = unknown>(value: unknown, kind: MessageKind = "res", o: { strict?: boolean; paths?: boolean } = {}): T => translate<T>(value, { dir: "toEN", kind, ...o });
export const toPT = <T = unknown>(value: unknown, kind: MessageKind = "req", o: { strict?: boolean; paths?: boolean } = {}): T => translate<T>(value, { dir: "toPT", kind, ...o });

/** Strings dentro de `slots` ("fri 17:30") ↔ ("sex 17:30"): o dia da semana vem junto do horário. */
export function translateSlots<T>(slots: T, dir: Direction, { strict = false }: { strict?: boolean } = {}): T {
  return (Array.isArray(slots) ? slots.map((s) => {
    if (typeof s !== "string") return s;
    const t = slotString(s, dir);
    if (strict && dir === "toPT" && t === s && /^\s*[^\s\d][^\s]*\s+\d{1,2}:\d{2}\s*$/.test(s)) throw new PtKeyError("slots", s.trim().split(/\s+/)[0]);
    return t;
  }) : slots) as T;
}

// ---------------------------------------------------------------------------------------------------------------- erros
// Código legado (PT, o que o servidor lança) → código novo (EN, snake_case estável). Um para um.
export const ERROR_CODES = {
  rota_inexistente: "route_not_found", metodo_nao_permitido: "method_not_allowed", erro_interno: "internal_error",
  nao_autenticado: "unauthorized", chave_invalida: "invalid_api_key", chave_revogada: "revoked_api_key", chave_expirada: "expired_api_key", mfa_necessario: "mfa_required", codigo_invalido: "invalid_code", mfa_ja_ativo: "mfa_already_enabled", mfa_nao_iniciado: "mfa_not_started", mfa_inativo: "mfa_not_enabled", sessao_atual: "current_session", sessao_inexistente: "session_not_found", confirmacao_invalida: "invalid_confirmation", sessao_invalida: "invalid_session", origem_invalida: "invalid_origin", sem_permissao: "forbidden", muitas_requisicoes: "rate_limited",
  corpo_vazio: "empty_body", json_invalido: "invalid_json", corpo_grande: "body_too_large", campo_invalido: "invalid_field", pedido_invalido: "invalid_request",
  falta_horario: "missing_schedule", sem_horario: "missing_time", horario_passado: "time_in_past", sem_vagas: "no_slots", sem_vaga_livre: "no_free_slot",
  email_em_uso: "email_in_use", email_de_revisao: "review_account_email", usuario_sem_senha: "user_without_password", redefinicao_recente: "reset_recently_sent", email_falhou: "email_send_failed", email_nao_configurado: "email_not_configured", conta_revisao: "review_account_restricted", conta_revisao_expirada: "review_account_expired", conta_revisao_revogada: "review_account_revoked", conta_revisao_limite: "review_account_limit", conta_revisao_inexistente: "review_account_not_found",
  post_inexistente: "post_not_found", destino_inexistente: "item_not_found", acao_inexistente: "action_not_found", canal_inexistente: "channel_not_found", canal_nao_conectado: "channel_not_connected",
  chave_inexistente: "api_key_not_found", workspace_inexistente: "workspace_not_found", oauth_requer_painel: "oauth_requires_panel", video_publicado: "video_not_private", canal_em_uso: "channel_in_use", canal_conectado: "channel_connected", canal_do_buffer: "channel_is_buffer", credenciais_invalidas: "invalid_credentials", senha_fraca: "weak_password", link_invalido: "invalid_link", conta_travada: "account_locked", passkey_invalida: "invalid_passkey", passkey_inexistente: "passkey_not_found", passkey_existente: "passkey_exists", desafio_invalido: "invalid_challenge", limite_de_passkeys: "passkey_limit", codigo_necessario: "code_required", workspace_da_plataforma: "platform_workspace", migracao_pendente: "migration_pending", chave_em_uso: "api_key_in_use", token_invalido: "invalid_token", pedido_inexistente: "request_not_found", pedido_de_outro_navegador: "request_from_another_browser", conexao_inexistente: "connection_not_found", video_inexistente: "video_not_found", sem_video: "no_video", sem_avatar: "no_avatar",
  midia_inexistente: "media_not_found", midia_em_uso: "media_in_use", midia_nao_pronta: "media_not_ready", midia_tipo: "media_type_mismatch", midia_travada: "media_locked",
  rede_desconhecida: "unknown_network", rede_nao_suportada: "network_not_supported", estado_invalido: "invalid_state", id_existente: "id_exists", ja_adotado: "already_adopted",
  nada_a_publicar: "nothing_to_publish", nao_editavel: "not_editable", post_adotado: "post_adopted", post_preparado: "post_prepared", sem_credencial_oauth: "oauth_not_configured",
  tem_api: "followers_from_api", youtube_nao_conectado: "youtube_not_connected", instagram_meta_nao_conectado: "instagram_meta_not_connected",
  falha_download: "download_failed", mime_nao_suportado: "unsupported_mime", // upload_media do MCP (docs/mcp.md)
  arquivo_grande: "file_too_large", parte_grande: "part_too_large", parte_pequena: "part_too_small", parte_vazia: "part_empty", partes_desiguais: "parts_unequal",
  partes_faltando: "parts_missing", sem_partes: "no_parts", tamanho_diferente: "size_mismatch", r2_recusou: "storage_rejected",
  identidade_inexistente: "identity_not_linked", ultima_forma_de_login: "last_login_method",
  credencial_oauth_ausente: "missing_oauth_credential", ja_conectado: "already_connected", oauth_state_invalido: "oauth_state_invalid", oauth_negado: "oauth_denied",
  sem_conta_instagram: "no_instagram_account", varias_contas_instagram: "multiple_instagram_accounts", troca_token_falhou: "token_exchange_failed", permissao_publicar_ausente: "publish_permission_missing", token_sem_acesso: "token_cannot_read_account",
  webhook_inexistente: "webhook_not_found", entrega_inexistente: "delivery_not_found", url_insegura: "unsafe_url", limite_webhooks: "webhook_limit_reached",
  ideia_inexistente: "idea_not_found", limite_ideias: "idea_limit_reached",
  idempotencia_reutilizada: "idempotency_key_reuse", idempotencia_em_andamento: "idempotency_in_progress", idempotencia_resposta_grande: "idempotency_response_too_large",
  buffer_erro: "buffer_error", instagram_erro: "instagram_error", tiktok_indisponivel: "tiktok_unavailable", youtube_erro: "youtube_error",
} as const;
/** Código de erro legado (PT) → código do contrato (EN). */
export type ErrorCodeMap = typeof ERROR_CODES;
/** Código de erro do contrato (`error.code`). */
export type ErrorCode = ErrorCodeMap[keyof ErrorCodeMap];
/** Código de erro legado (`erro.codigo`). */
export type LegacyErrorCode = keyof ErrorCodeMap;
export const ERROR_CODES_REVERSE = Object.fromEntries(Object.entries(ERROR_CODES).map(([pt, en]) => [en, pt])) as { readonly [K in keyof ErrorCodeMap as ErrorCodeMap[K]]: K };
export const codeToEN = <C extends string>(c: C): C extends LegacyErrorCode ? ErrorCodeMap[C] : C => ((ERROR_CODES as Record<string, string>)[c] ?? c) as never;
export const codeToPT = (c: string): string => (ERROR_CODES_REVERSE as Record<string, string>)[c] ?? c;

/** Envelope de erro do contrato. Um código fora da tabela ainda pode chegar (servidor mais novo que o cliente). */
export interface ErrorEnvelope { error: { code: ErrorCode | (string & {}); message: string; details?: unknown } }
/** Envelope de erro legado (o que o front ainda confere). */
export interface LegacyErrorEnvelope { erro: { codigo: LegacyErrorCode | (string & {}); mensagem: string; detalhes?: unknown } }

/** Envelope de erro legado `{ erro: { codigo, mensagem, detalhes? } }` → novo `{ error: { code, message, details? } }`. */
export function errorEnvelopeToEN<T>(body: T): T extends LegacyErrorEnvelope ? ErrorEnvelope : T {
  const e = (body as Partial<LegacyErrorEnvelope> | null | undefined)?.erro; if (!e) return body as never;
  return { error: { code: codeToEN(e.codigo), message: e.mensagem, ...(e.detalhes !== undefined ? { details: toEN(e.detalhes, "res") } : {}) } } as never;
}
/** Novo → legado (usado pelo front e pelos testes que reaproveitam as asserções antigas). */
export function errorEnvelopeToPT<T>(body: T): T extends ErrorEnvelope ? LegacyErrorEnvelope : T {
  const e = (body as Partial<ErrorEnvelope> | null | undefined)?.error; if (!e) return body as never;
  return { erro: { codigo: codeToPT(e.code), mensagem: e.message, ...(e.details !== undefined ? { detalhes: toPT(e.details, "res") } : {}) } } as never;
}

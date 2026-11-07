export declare const SCOPES: {
    readonly leitura: "read";
    readonly escrita: "write";
    readonly admin: "admin";
};
/** Escopo de uma chave de API no contrato. */
export type Scope = (typeof SCOPES)[keyof typeof SCOPES];
/** Escopo no vocabulário interno (legado). */
export type LegacyScope = keyof typeof SCOPES;
export declare const scopeToEN: <S extends string>(s: S) => S extends LegacyScope ? (typeof SCOPES)[S] : S;
export declare const scopeToPT: (s: string) => string;
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";
/** Escopo mínimo de uma rota (ou "public"). */
export type RouteScope = Scope | "public";
export declare const ROUTES: readonly [{
    readonly key: "health";
    readonly method: "GET";
    readonly path: "/health";
    readonly legacy: "/saude";
    readonly scope: "public";
    readonly summary: "Liveness probe";
}, {
    readonly key: "health.v1";
    readonly method: "GET";
    readonly path: "/v1/health";
    readonly legacy: "/v1/saude";
    readonly scope: "public";
    readonly summary: "Liveness probe (versioned path)";
}, {
    readonly key: "connections.callback";
    readonly method: "GET";
    readonly path: "/connections/:network/callback";
    readonly legacy: "/conexoes/:rede/retorno";
    readonly scope: "public";
    readonly raw: true;
    readonly summary: "OAuth redirect target (HTML page; youtube, tiktok, meta); registered redirect URIs keep working";
}, {
    readonly key: "media.public";
    readonly method: "GET";
    readonly path: "/v1/m/:id/:token/:name";
    readonly legacy: null;
    readonly scope: "public";
    readonly raw: true;
    readonly summary: "Public media by token (Range supported); also served at /m/…";
}, {
    readonly key: "media.public";
    readonly method: "HEAD";
    readonly path: "/v1/m/:id/:token/:name";
    readonly legacy: null;
    readonly scope: "public";
    readonly raw: true;
    readonly summary: "Same as GET, headers only";
}, {
    readonly key: "connections.start";
    readonly method: "GET";
    readonly path: "/v1/connections/:network/start";
    readonly legacy: "/v1/conexoes/:rede/iniciar";
    readonly scope: "write";
    readonly summary: "Start OAuth for youtube|tiktok|meta (Instagram login); for youtube it always asks for `youtube.upload`, `youtube.force-ssl` and `yt-analytics.readonly` (retention, impressions, CTR; the consent screen lets the user untick a scope, and the channel then stays `reauthorize` in the retention view); the old `analytics=1` is accepted and ignored; returns the authorization URL. A different account of the same network becomes another channel; the same account is reconnected. `meta` takes `replace=true` (replace the token of an existing connection), `add=true` (connect ANOTHER Instagram account as a new channel) and `instagram=<username>`, `instagram_id=<id|current>`, `probe=true` (report only, stores nothing)";
}, {
    readonly key: "connections.disconnect";
    readonly method: "DELETE";
    readonly path: "/v1/connections/:network";
    readonly legacy: "/v1/conexoes/:rede";
    readonly scope: "write";
    readonly summary: "Disconnect one account of youtube|tiktok|instagram (Meta token only; the Buffer channel is never touched); `channel` picks the account, without it the default channel; other accounts, the channel and its history stay. If it was the default, another connected account takes over";
}, {
    readonly key: "connections.instagramToken";
    readonly method: "PUT";
    readonly path: "/v1/connections/instagram/token";
    readonly legacy: "/v1/conexoes/instagram/token";
    readonly scope: "admin";
    readonly body: "json";
    readonly summary: "Store the Meta API token for Instagram (encrypted)";
}, {
    readonly key: "channels.list";
    readonly method: "GET";
    readonly path: "/v1/channels";
    readonly legacy: "/v1/canais";
    readonly scope: "read";
    readonly summary: "One item per connected channel (several accounts of a network = several items, `default` marks the one used without `channel`), plus a not-connected item for a network with none; status and slots count";
}, {
    readonly key: "channels.default";
    readonly method: "PUT";
    readonly path: "/v1/channels/:channel/default";
    readonly legacy: "/v1/canais/:canal/padrao";
    readonly scope: "write";
    readonly summary: "Make this account the default of its network (used when a network route has no `channel`); the other accounts of the same network lose the mark. 404 channel_not_found if it is not an active channel of this workspace";
}, {
    readonly key: "channels.remove";
    readonly method: "DELETE";
    readonly path: "/v1/channels/:channel";
    readonly legacy: "/v1/canais/:canal";
    readonly scope: "write";
    readonly summary: "Remove a DISCONNECTED account from the list (history stays; refused while connected, with pending items, or for the Buffer Instagram channel)";
}, {
    readonly key: "channels.avatar";
    readonly method: "GET";
    readonly path: "/v1/channels/:network/avatar";
    readonly legacy: "/v1/canais/:rede/avatar";
    readonly scope: "read";
    readonly summary: "Channel avatar image (`channel` picks the account)";
}, {
    readonly key: "tiktok.creator";
    readonly method: "GET";
    readonly path: "/v1/tiktok/creator";
    readonly legacy: "/v1/tiktok/criador";
    readonly scope: "read";
    readonly summary: "What the connected TikTok account accepts (creator_info); `channel` picks the account";
}, {
    readonly key: "channels.slots.get";
    readonly method: "GET";
    readonly path: "/v1/channels/:network/slots";
    readonly legacy: "/v1/canais/:rede/vagas";
    readonly scope: "read";
    readonly summary: "Weekly publishing slots of a channel (`channel` picks the account, else the default)";
}, {
    readonly key: "channels.slots.put";
    readonly method: "PUT";
    readonly path: "/v1/channels/:network/slots";
    readonly legacy: "/v1/canais/:rede/vagas";
    readonly scope: "write";
    readonly body: "json";
    readonly summary: "Replace the weekly slots of one channel (`channel`; reorganizes its queued items)";
}, {
    readonly key: "channels.followers.put";
    readonly method: "PUT";
    readonly path: "/v1/channels/:network/followers";
    readonly legacy: "/v1/canais/:rede/seguidores";
    readonly scope: "write";
    readonly body: "json";
    readonly summary: "Manual follower count (Instagram only; `channel` picks the account)";
}, {
    readonly key: "channels.followers.get";
    readonly method: "GET";
    readonly path: "/v1/channels/:network/followers";
    readonly legacy: "/v1/canais/:rede/seguidores";
    readonly scope: "read";
    readonly summary: "Last 60 daily follower records (`channel` picks the account)";
}, {
    readonly key: "media.create";
    readonly method: "POST";
    readonly path: "/v1/media";
    readonly legacy: "/v1/midia";
    readonly scope: "write";
    readonly body: "json";
    readonly summary: "Start a media upload";
}, {
    readonly key: "media.list";
    readonly method: "GET";
    readonly path: "/v1/media";
    readonly legacy: "/v1/midia";
    readonly scope: "read";
    readonly summary: "List media (last 100); older videos get durationMs/width/height filled on first read";
}, {
    readonly key: "media.get";
    readonly method: "GET";
    readonly path: "/v1/media/:id";
    readonly legacy: "/v1/midia/:id";
    readonly scope: "read";
    readonly summary: "One media item (with publicUrl when ready; videos also carry durationMs, width and height when the container header says so)";
}, {
    readonly key: "media.part";
    readonly method: "PUT";
    readonly path: "/v1/media/:id/parts/:part";
    readonly legacy: "/v1/midia/:id/partes/:n";
    readonly scope: "write";
    readonly body: "bytes";
    readonly summary: "Upload one part (raw bytes)";
}, {
    readonly key: "media.content.put";
    readonly method: "PUT";
    readonly path: "/v1/media/:id/content";
    readonly legacy: "/v1/midia/:id/conteudo";
    readonly scope: "write";
    readonly body: "bytes";
    readonly summary: "Single-request upload (media created with simple: true)";
}, {
    readonly key: "media.content.get";
    readonly method: "GET";
    readonly path: "/v1/media/:id/content";
    readonly legacy: "/v1/midia/:id/conteudo";
    readonly scope: "read";
    readonly summary: "The file (Bearer, Range supported)";
}, {
    readonly key: "media.content.head";
    readonly method: "HEAD";
    readonly path: "/v1/media/:id/content";
    readonly legacy: "/v1/midia/:id/conteudo";
    readonly scope: "read";
    readonly summary: "Same as GET, headers only";
}, {
    readonly key: "media.complete";
    readonly method: "POST";
    readonly path: "/v1/media/:id/complete";
    readonly legacy: "/v1/midia/:id/completar";
    readonly scope: "write";
    readonly summary: "Join the parts";
}, {
    readonly key: "media.delete";
    readonly method: "DELETE";
    readonly path: "/v1/media/:id";
    readonly legacy: "/v1/midia/:id";
    readonly scope: "write";
    readonly summary: "Remove a media item (refused while used by a pending post)";
}, {
    readonly key: "posts.create";
    readonly method: "POST";
    readonly path: "/v1/posts";
    readonly legacy: "/v1/posts";
    readonly scope: "write";
    readonly body: "json";
    readonly summary: "Create a post with one item per network (queue, fixed time or draft); an item may carry `channel` (account of that network; default channel without it)";
}, {
    readonly key: "posts.adopt";
    readonly method: "POST";
    readonly path: "/v1/posts/adopt";
    readonly legacy: "/v1/posts/adotar";
    readonly scope: "write";
    readonly body: "json";
    readonly summary: "Register a Reel already scheduled in Buffer (does not call Buffer)";
}, {
    readonly key: "posts.list";
    readonly method: "GET";
    readonly path: "/v1/posts";
    readonly legacy: "/v1/posts";
    readonly scope: "read";
    readonly summary: "List posts (filters: state, channel, tag)";
}, {
    readonly key: "posts.get";
    readonly method: "GET";
    readonly path: "/v1/posts/:id";
    readonly legacy: "/v1/posts/:id";
    readonly scope: "read";
    readonly summary: "One post with its items and actions";
}, {
    readonly key: "posts.update";
    readonly method: "PATCH";
    readonly path: "/v1/posts/:id";
    readonly legacy: "/v1/posts/:id";
    readonly scope: "write";
    readonly body: "json";
    readonly summary: "Edit title, texts, media, tags, items; move to draft/queue; reschedule/edit a YouTube video already uploaded and still scheduled";
}, {
    readonly key: "posts.cancel";
    readonly method: "DELETE";
    readonly path: "/v1/posts/:id";
    readonly legacy: "/v1/posts/:id";
    readonly scope: "write";
    readonly summary: "Cancel the pending items of a post";
}, {
    readonly key: "posts.publishNow";
    readonly method: "POST";
    readonly path: "/v1/posts/:id/publish-now";
    readonly legacy: "/v1/posts/:id/publicar-agora";
    readonly scope: "write";
    readonly summary: "Take pending items out of the queue and publish now (?network=)";
}, {
    readonly key: "posts.youtubeSchedule";
    readonly method: "POST";
    readonly path: "/v1/posts/:id/youtube/schedule";
    readonly legacy: "/v1/posts/:id/youtube/agendar";
    readonly scope: "write";
    readonly body: "json";
    readonly summary: "Schedule publication of a video already uploaded to YouTube (private)";
}, {
    readonly key: "posts.itemComment";
    readonly method: "POST";
    readonly path: "/v1/posts/:id/items/:item/comment";
    readonly legacy: "/v1/posts/:id/itens/:destino/comentar";
    readonly scope: "write";
    readonly summary: "Release the stored pinned comment of an item";
}, {
    readonly key: "calendar.get";
    readonly method: "GET";
    readonly path: "/v1/calendar";
    readonly legacy: "/v1/calendario";
    readonly scope: "read";
    readonly summary: "Items in a period plus free slots";
}, {
    readonly key: "insights.get";
    readonly method: "GET";
    readonly path: "/v1/insights";
    readonly legacy: "/v1/insights";
    readonly scope: "read";
    readonly summary: "Cards, top posts, per-channel results (one row per account when a network has several; `channel` filters one account), summary, 48 h reading";
}, {
    readonly key: "insights.retention";
    readonly method: "GET";
    readonly path: "/v1/insights/retention";
    readonly legacy: "/v1/insights/retention";
    readonly scope: "read";
    readonly summary: "Retention, impressions and CTR per post of the period (`from`, `to`, `channel`, `limit` 1-200). YouTube: audience retention (YouTube Analytics API), thumbnail impressions and CTR (YouTube Reporting API); Instagram: reach, watch time and skip rate (Meta API). `channels[].state` says whether each account can deliver them: `ready`, `pending` (first report still being generated), `reauthorize` (reconnect YouTube once and keep the Analytics permission ticked), `unavailable` or `error`; a missing number is `null`, never 0";
}, {
    readonly key: "insights.retention.item";
    readonly method: "GET";
    readonly path: "/v1/insights/:item/retention";
    readonly legacy: "/v1/insights/:item/retention";
    readonly scope: "read";
    readonly summary: "One post (item id or imported content id) with its retention `curve`: points of `position` (0..1 of the video), `watched` (audienceWatchRatio, above 1 when viewers rewatch) and `relative` (relativeRetentionPerformance, 0.5 = median of similar-length videos)";
}, {
    readonly key: "insights.import";
    readonly method: "POST";
    readonly path: "/v1/insights/import";
    readonly legacy: "/v1/insights/importar";
    readonly scope: "admin";
    readonly query: {
        readonly network: {
            readonly all: "tudo";
        };
    };
    readonly summary: "Import history from YouTube, Buffer (Instagram) and TikTok (every connected account; `channel` with a network limits it to one)";
}, {
    readonly key: "content.list";
    readonly method: "GET";
    readonly path: "/v1/content";
    readonly legacy: "/v1/conteudo";
    readonly scope: "read";
    readonly summary: "Everything already published (Praeko + imported)";
}, {
    readonly key: "youtube.videos";
    readonly method: "GET";
    readonly path: "/v1/youtube/videos";
    readonly legacy: "/v1/youtube/videos";
    readonly scope: "read";
    readonly summary: "Channel videos (including private and scheduled); `channel` picks the account";
}, {
    readonly key: "youtube.video";
    readonly method: "GET";
    readonly path: "/v1/youtube/videos/:id";
    readonly legacy: "/v1/youtube/videos/:id";
    readonly scope: "read";
    readonly summary: "One video";
}, {
    readonly key: "youtube.editVideo";
    readonly method: "PATCH";
    readonly path: "/v1/youtube/videos/:id";
    readonly legacy: "/v1/youtube/videos/:id";
    readonly scope: "write";
    readonly body: "json";
    readonly summary: "Edit title/description/tags (dryRun: true returns before/after only)";
}, {
    readonly key: "youtube.comments";
    readonly method: "GET";
    readonly path: "/v1/youtube/comments";
    readonly legacy: "/v1/youtube/comentarios";
    readonly scope: "read";
    readonly summary: "Comment threads (`channel` picks the account)";
}, {
    readonly key: "youtube.reply";
    readonly method: "POST";
    readonly path: "/v1/youtube/comments/:id/reply";
    readonly legacy: "/v1/youtube/comentarios/:id/responder";
    readonly scope: "write";
    readonly body: "json";
    readonly summary: "Reply to a thread (writes to YouTube)";
}, {
    readonly key: "youtube.resolve";
    readonly method: "POST";
    readonly path: "/v1/youtube/comments/:id/resolve";
    readonly legacy: "/v1/youtube/comentarios/:id/resolver";
    readonly scope: "write";
    readonly summary: "Mark a thread as resolved (Praeko only)";
}, {
    readonly key: "youtube.reopen";
    readonly method: "DELETE";
    readonly path: "/v1/youtube/comments/:id/resolve";
    readonly legacy: "/v1/youtube/comentarios/:id/resolver";
    readonly scope: "write";
    readonly summary: "Reopen a resolved thread";
}, {
    readonly key: "instagram.media";
    readonly method: "GET";
    readonly path: "/v1/instagram/media";
    readonly legacy: "/v1/instagram/midias";
    readonly scope: "read";
    readonly summary: "Profile media grid (Meta API)";
}, {
    readonly key: "instagram.comments";
    readonly method: "GET";
    readonly path: "/v1/instagram/comments";
    readonly legacy: "/v1/instagram/comentarios";
    readonly scope: "read";
    readonly summary: "Instagram comments (Meta API)";
}, {
    readonly key: "instagram.reply";
    readonly method: "POST";
    readonly path: "/v1/instagram/comments/:id/reply";
    readonly legacy: "/v1/instagram/comentarios/:id/responder";
    readonly scope: "write";
    readonly body: "json";
    readonly summary: "Reply to a comment (writes to Instagram)";
}, {
    readonly key: "instagram.hide";
    readonly method: "POST";
    readonly path: "/v1/instagram/comments/:id/hide";
    readonly legacy: "/v1/instagram/comentarios/:id/ocultar";
    readonly scope: "write";
    readonly body: "json";
    readonly summary: "Hide or unhide a comment";
}, {
    readonly key: "instagram.resolve";
    readonly method: "POST";
    readonly path: "/v1/instagram/comments/:id/resolve";
    readonly legacy: "/v1/instagram/comentarios/:id/resolver";
    readonly scope: "write";
    readonly summary: "Mark a comment as resolved (Praeko only)";
}, {
    readonly key: "instagram.reopen";
    readonly method: "DELETE";
    readonly path: "/v1/instagram/comments/:id/resolve";
    readonly legacy: "/v1/instagram/comentarios/:id/resolver";
    readonly scope: "write";
    readonly summary: "Reopen a resolved comment";
}, {
    readonly key: "comments.list";
    readonly method: "GET";
    readonly path: "/v1/comments";
    readonly legacy: "/v1/comentarios";
    readonly scope: "read";
    readonly query: {
        readonly network: {
            readonly all: "todas";
        };
    };
    readonly summary: "Comments of all networks together, from EVERY active account of each network (each comment carries `channel`; `channel` filters one account; an account that fails goes to `errors`, the others still answer)";
}, {
    readonly key: "mentions.list";
    readonly method: "GET";
    readonly path: "/v1/mentions";
    readonly legacy: "/v1/mencoes";
    readonly scope: "read";
    readonly query: {
        readonly network: {
            readonly all: "todas";
        };
    };
    readonly summary: "Mentions (Instagram by tag; YouTube has none)";
}, {
    readonly key: "apiKeys.list";
    readonly method: "GET";
    readonly path: "/v1/api-keys";
    readonly legacy: "/v1/chaves";
    readonly scope: "admin";
    readonly summary: "List API keys (never the secret)";
}, {
    readonly key: "apiKeys.create";
    readonly method: "POST";
    readonly path: "/v1/api-keys";
    readonly legacy: "/v1/chaves";
    readonly scope: "admin";
    readonly body: "json";
    readonly summary: "Create a key (the secret is shown once)";
}, {
    readonly key: "apiKeys.revoke";
    readonly method: "DELETE";
    readonly path: "/v1/api-keys/:id";
    readonly legacy: "/v1/chaves/:id";
    readonly scope: "admin";
    readonly summary: "Revoke a key";
}, {
    readonly key: "usage.get";
    readonly method: "GET";
    readonly path: "/v1/usage";
    readonly legacy: "/v1/usage";
    readonly scope: "read";
    readonly summary: "API usage of this workspace over the last `days` (1-30, default 7, UTC): total, succeeded (< 400), errors, p95 duration, peak requests in one minute vs the per-minute limit, `byDay`, `byHour` (only with days=1: the last 24 hours) and `byKey` (`session` = the panel)";
}, {
    readonly key: "usage.log";
    readonly method: "GET";
    readonly path: "/v1/usage/log";
    readonly legacy: "/v1/usage/log";
    readonly scope: "read";
    readonly summary: "Request log, newest first, kept 30 days; metadata only (method, route template without ids, status, duration, key), never bodies, headers or query. Filters: `key` (id or `session`), `status` (`2xx`|`3xx`|`4xx`|`5xx` or a code), `route` (substring), `method`, `days` (1-30); `limit` (1-200, default 50) and `cursor` (the `next` of the previous page)";
}, {
    readonly key: "preferences.get";
    readonly method: "GET";
    readonly path: "/v1/preferences";
    readonly legacy: "/v1/preferences";
    readonly scope: "read";
    readonly summary: "Panel preferences of the signed-in user in this workspace (an API key reads the workspace row): `theme` (light, dark, system), `language` (pt-BR, en) and `notifications` per event (`postSent`, `postFailed`, `scheduledFail`, `weeklySummary`, `newComment`) with `email` and `panel` flags. Missing values come back as the defaults (dark, pt-BR, no e-mail, panel on)";
}, {
    readonly key: "preferences.put";
    readonly method: "PUT";
    readonly path: "/v1/preferences";
    readonly legacy: "/v1/preferences";
    readonly scope: "write";
    readonly body: "json";
    readonly summary: "Change preferences; partial (only the fields sent change) and strict (unknown field or value is 422 invalid_field). Returns the full preferences. With `email` true the server e-mails `postSent`, `postFailed`, `scheduledFail`, the `weeklySummary` (Mondays 08:00 America/Sao_Paulo) and `newComment` (batched, at most one e-mail per hour); with `panel` true it adds the event to the notification center (`GET /v1/notifications`)";
}, {
    readonly key: "notifications.list";
    readonly method: "GET";
    readonly path: "/v1/notifications";
    readonly legacy: "/v1/notifications";
    readonly scope: "read";
    readonly summary: "In-panel notification center of the signed-in user in this workspace (the bell), newest first: `notifications` (`id`, `event` = postSent, postFailed, scheduledFail, weeklySummary, newComment, `data` with the facts of the event, `link` to where it leads, `read`, `readAt`, `createdAt`), `unreadCount` and `next`. A notification exists only when the user's `panel` preference for that event was on when it happened. Filters: `unread` (true), `limit` (1-50, default 20) and `cursor` (the `next` of the previous page). Kept 30 days. An API key has no user and reads an empty list";
}, {
    readonly key: "notifications.read";
    readonly method: "POST";
    readonly path: "/v1/notifications/read";
    readonly legacy: "/v1/notifications/read";
    readonly scope: "write";
    readonly body: "json";
    readonly summary: "Mark notifications as read: `ids` (up to 100) or `all: true`. Ids that are not yours or do not exist are ignored and marking again is harmless. Returns `marked` (how many changed) and the new `unreadCount`";
}, {
    readonly key: "webhooks.list";
    readonly method: "GET";
    readonly path: "/v1/webhooks";
    readonly legacy: "/v1/webhooks";
    readonly scope: "admin";
    readonly summary: "Outgoing webhooks of this workspace (never the secret: only `secretHint`), with the delivery success of the last 7 days (`recentDeliveries`) and the subscribable `events`";
}, {
    readonly key: "webhooks.create";
    readonly method: "POST";
    readonly path: "/v1/webhooks";
    readonly legacy: "/v1/webhooks";
    readonly scope: "admin";
    readonly body: "json";
    readonly summary: "Create a webhook: `url` (https, public host; private IPs, localhost and cloud metadata are refused with unsafe_url), `events` (post.sent, post.failed, post.scheduled-fail; default the first two), `active`. The signing `secret` is returned ONCE. Max 10 per workspace";
}, {
    readonly key: "webhooks.get";
    readonly method: "GET";
    readonly path: "/v1/webhooks/:id";
    readonly legacy: "/v1/webhooks/:id";
    readonly scope: "admin";
    readonly summary: "One webhook (no secret)";
}, {
    readonly key: "webhooks.update";
    readonly method: "PATCH";
    readonly path: "/v1/webhooks/:id";
    readonly legacy: "/v1/webhooks/:id";
    readonly scope: "admin";
    readonly body: "json";
    readonly summary: "Change `url`, `events` or `active`. Pausing discards the pending deliveries; re-activating resets the failure count";
}, {
    readonly key: "webhooks.delete";
    readonly method: "DELETE";
    readonly path: "/v1/webhooks/:id";
    readonly legacy: "/v1/webhooks/:id";
    readonly scope: "admin";
    readonly summary: "Delete a webhook and its delivery history";
}, {
    readonly key: "webhooks.test";
    readonly method: "POST";
    readonly path: "/v1/webhooks/:id/test";
    readonly legacy: "/v1/webhooks/:id/test";
    readonly scope: "admin";
    readonly summary: "Send a `ping.test` event now (even when paused) and return the `delivery` result; it does not count towards auto-disable";
}, {
    readonly key: "webhooks.deliveries";
    readonly method: "GET";
    readonly path: "/v1/webhooks/:id/deliveries";
    readonly legacy: "/v1/webhooks/:id/deliveries";
    readonly scope: "admin";
    readonly summary: "Recent deliveries, newest first (`limit` 1-100, default 20; kept 30 days): event, state (pending, delivered, failed, discarded), attempts, last HTTP status and error, duration";
}, {
    readonly key: "webhooks.redeliver";
    readonly method: "POST";
    readonly path: "/v1/webhooks/:id/deliveries/:delivery/retry";
    readonly legacy: "/v1/webhooks/:id/deliveries/:delivery/retry";
    readonly scope: "admin";
    readonly summary: "Send one delivery again now, with the same `Praeko-Delivery` id (receivers can deduplicate)";
}, {
    readonly key: "webhooks.rotateSecret";
    readonly method: "POST";
    readonly path: "/v1/webhooks/:id/rotate-secret";
    readonly legacy: "/v1/webhooks/:id/rotate-secret";
    readonly scope: "admin";
    readonly summary: "Replace the signing secret; the new `secret` is returned ONCE and the old one stops signing immediately";
}, {
    readonly key: "ideas.list";
    readonly method: "GET";
    readonly path: "/v1/ideas";
    readonly legacy: "/v1/ideas";
    readonly scope: "read";
    readonly summary: "Idea board of this workspace (the \"Create\" screen), newest first: `title`, `note`, `group` (idea, scripting, ready, posted), `tags` (the first one is the series), `createdAt`, `updatedAt`";
}, {
    readonly key: "ideas.create";
    readonly method: "POST";
    readonly path: "/v1/ideas";
    readonly legacy: "/v1/ideas";
    readonly scope: "write";
    readonly body: "json";
    readonly summary: "Add an idea: `title` (1-200 characters, required), `note` (up to 5000), `group` (default idea), `tags` (up to 20, 40 characters each). Max 2000 per workspace";
}, {
    readonly key: "ideas.import";
    readonly method: "POST";
    readonly path: "/v1/ideas/import";
    readonly legacy: "/v1/ideas/import";
    readonly scope: "write";
    readonly body: "json";
    readonly summary: "Bulk-add `ideas` (up to 500 per call), as the panel does with the ideas it kept in the browser. An item whose `id` was already imported is skipped (`skippedCount`), so repeating the call never duplicates. Items without a valid `title` are skipped";
}, {
    readonly key: "ideas.update";
    readonly method: "PATCH";
    readonly path: "/v1/ideas/:id";
    readonly legacy: "/v1/ideas/:id";
    readonly scope: "write";
    readonly body: "json";
    readonly summary: "Change `title`, `note`, `group` (moving a card) or `tags`; omitted fields stay";
}, {
    readonly key: "ideas.delete";
    readonly method: "DELETE";
    readonly path: "/v1/ideas/:id";
    readonly legacy: "/v1/ideas/:id";
    readonly scope: "write";
    readonly summary: "Delete an idea";
}];
/** Uma rota da tabela, como tipo literal (`Route["key"]` é a união das chaves). */
export type Route = (typeof ROUTES)[number];
/** Nome do handler (`key`) de cada rota. */
export type RouteKey = Route["key"];
/** Caminho novo (template com `:param`). */
export type RoutePath = Route["path"];
/** Alias legado em português (sem as rotas que não têm alias). */
export type LegacyRoutePath = Exclude<Route["legacy"], null>;
export type RouteOf<K extends RouteKey> = Extract<Route, {
    key: K;
}>;
/** Rotas de um método, por caminho: `RoutesFor<"GET">["path"]`. */
export type RoutesFor<M extends HttpMethod> = Extract<Route, {
    method: M;
}>;
/** Nomes dos parâmetros de um template: `PathParams<"/v1/posts/:id/items/:item/comment">` = "id" | "item". */
export type PathParams<P extends string> = P extends `${string}:${infer N}/${infer R}` ? N | PathParams<`/${R}`> : P extends `${string}:${infer N}` ? N : never;
/** Rota aceita também em `/m/…` (o mesmo handler da mídia pública). */
export declare const MEDIA_PUBLIC_ALIAS_PREFIX = "/m";
/** Nomes dos parâmetros de caminho de um template, em ordem. */
export declare const paramNames: (tpl: string) => string[];
/** Preenche um template com valores (na ordem dos parâmetros). */
export declare const fillPath: (tpl: string, values: ReadonlyArray<string | number | null | undefined>) => string;
export interface RouteMatch {
    route: Route;
    values: string[];
}
/** Acha a rota pelo método e caminho NOVO. `{ route, values }` ou null. */
export declare function matchNew(method: string, pathname: string): RouteMatch | null;
/** Acha a rota pelo método e caminho LEGADO. */
export declare function matchLegacy(method: string, pathname: string): RouteMatch | null;
/** Caminho novo equivalente a um caminho legado (para o cabeçalho Link e para os testes), ou null. */
export declare function newPathOf(method: string, legacyPath: string): string | null;
/** Caminho legado equivalente a um caminho novo. */
export declare function legacyPathOf(method: string, newPath: string): string | null;
export type KeyRow = readonly [pt: string, en: string] | readonly [pt: string, en: string, only: "req" | "res"];
declare const KEY_ROWS: readonly [readonly ["abs", "absolute"], readonly ["acao", "action"], readonly ["acoes", "actions"], readonly ["adotado", "adopted"], readonly ["agregadoAtualizadoEm", "aggregateUpdatedAt"], readonly ["agregadoBuffer", "bufferAggregate"], readonly ["aplicado", "applied"], readonly ["notas", "notes", "res"], readonly ["tagsVideo", "videoTags", "req"], readonly ["campo", "field"], readonly ["campos", "fields"], readonly ["naoAplicados", "notApplied"], readonly ["resultadosItens", "itemResults"], readonly ["alcance", "reach"], readonly ["anterior", "previous"], readonly ["antes", "before"], readonly ["appAuditado", "appAudited"], readonly ["ate", "to"], readonly ["ativa", "active"], readonly ["atual", "current"], readonly ["atualizado_em", "updatedAt"], readonly ["atualizados", "updated"], readonly ["autor", "author"], readonly ["autorCanal", "authorChannel"], readonly ["aviso", "warning"], readonly ["avisarInscritos", "notifySubscribers"], readonly ["canais", "channels"], readonly ["canal", "channel"], readonly ["canalId", "channelId"], readonly ["cancelados", "canceled"], readonly ["cancelar", "cancel"], readonly ["capa", "cover"], readonly ["capaNoQuadro", "coverInFrame"], readonly ["cartoes", "cards"], readonly ["categoriaId", "categoryId"], readonly ["chave", "key"], readonly ["chaves", "keys"], readonly ["codigo", "code"], readonly ["coleta", "collection"], readonly ["coletando", "collecting"], readonly ["comentar", "comment", "req"], readonly ["comentario", "comment", "res"], readonly ["comentarioDesabilitado", "commentsDisabled"], readonly ["comentarioFixo", "pinnedComment"], readonly ["comentarios", "comments"], readonly ["compartilhamentos", "shares"], readonly ["compartilharNoFeed", "shareToFeed"], readonly ["comparar", "compare"], readonly ["conectado", "connected"], readonly ["conectadoEm", "connectedAt"], readonly ["consultadoEm", "queriedAt"], readonly ["conteudoComercial", "commercialContent"], readonly ["criado_em", "createdAt"], readonly ["curtidas", "likes"], readonly ["de", "from"], readonly ["depois", "after"], readonly ["deslocamento", "offset"], readonly ["desabilitarComentarios", "disableComments"], readonly ["desabilitarDueto", "disableDuet"], readonly ["desabilitarStitch", "disableStitch"], readonly ["desconectado", "disconnected"], readonly ["descricao", "description"], readonly ["destino_id", "itemId"], readonly ["destinos", "items", "req"], readonly ["detalhe", "detail"], readonly ["detalhes", "details"], readonly ["dia", "day"], readonly ["dia_semana", "weekday"], readonly ["direcao", "direction"], readonly ["diretoDisponivel", "directAvailable"], readonly ["doDono", "fromOwner"], readonly ["duetoDesabilitado", "duetDisabled"], readonly ["duracaoMaxSeg", "maxDurationSec"], readonly ["editarHorario", "editSchedule"], readonly ["editarTexto", "editText"], readonly ["encontrados", "found"], readonly ["engajamento", "engagement"], readonly ["engajamentoGeral", "overallEngagement"], readonly ["enviar", "uploadHint"], readonly ["erro", "error"], readonly ["erros", "errors"], readonly ["escopo", "scope"], readonly ["escrito", "written"], readonly ["estado", "state"], readonly ["etiqueta", "tag"], readonly ["etiquetas", "tags"], readonly ["executarEm", "runAt"], readonly ["expiraEm", "expiresAt"], readonly ["expiraEmDias", "expiresInDays", "req"], readonly ["expirada", "expired"], readonly ["diasRestantes", "daysLeft"], readonly ["externo", "external"], readonly ["fila", "queue"], readonly ["filtros", "filters"], readonly ["fonte", "source"], readonly ["fontes", "sources"], readonly ["formato", "format"], readonly ["fuso", "timezone"], readonly ["hora", "time"], readonly ["ignorado", "skipped"], readonly ["importados", "imported"], readonly ["itens", "items", "res"], readonly ["jaFeita", "alreadyDone"], readonly ["legenda", "caption"], readonly ["leitura48h", "reading48h"], readonly ["leitura48hTexto", "reading48hText"], readonly ["leiturasNoBanco", "storedReadings"], readonly ["lembrete", "reminder"], readonly ["limite", "limit"], readonly ["mantidos", "kept"], readonly ["marcaPropria", "ownBrand"], readonly ["marcaTerceiros", "thirdPartyBrand"], readonly ["marcos", "milestones"], readonly ["mencoes", "mentions"], readonly ["mensagem", "message"], readonly ["midia", "media"], readonly ["midiaId", "mediaId"], readonly ["midias", "mediaItems"], readonly ["miniatura", "thumb"], readonly ["miniaturaMidia", "thumbMedia"], readonly ["miniaturaMs", "coverFrameMs"], readonly ["miniaturaTipo", "thumbType"], readonly ["modo", "mode"], readonly ["motivo", "reason"], readonly ["mover", "moveTo"], readonly ["moverRascunho", "moveToDraft"], readonly ["envio", "delivery"], readonly ["revogacaoPulada", "revocationSkipped"], readonly ["removido", "accountRemoved"], readonly ["motivoFalha", "failReason"], readonly ["verificadoEm", "checkedAt"], readonly ["mudou", "changed"], readonly ["naCaixaDeEntrada", "inInbox"], readonly ["nome", "name"], readonly ["novos", "created"], readonly ["ocultar", "hide"], readonly ["oculto", "hidden"], readonly ["opcoes", "options"], readonly ["ordem", "sort"], readonly ["origem", "origin"], readonly ["pagina", "page"], readonly ["paginas", "pages"], readonly ["parte", "part"], readonly ["parteMaxima", "maxPartSize"], readonly ["parteMinima", "minPartSize"], readonly ["padrao", "default"], readonly ["partes", "parts"], readonly ["parteSugerida", "suggestedPartSize"], readonly ["pendentes", "pending"], readonly ["pendentesPorRede", "pendingByNetwork"], readonly ["pendentesPorCanal", "pendingByChannel"], readonly ["periodo", "period"], readonly ["periodoAnterior", "previousPeriod"], readonly ["postsAnterior", "previousPosts"], readonly ["postsComMetricas", "postsWithMetrics"], readonly ["postsSemMetricas", "postsWithoutMetrics"], readonly ["prefixo", "prefix"], readonly ["privacidade", "privacy"], readonly ["privacidades", "privacyLevels"], readonly ["privacidadesPermitidas", "allowedPrivacyLevels"], readonly ["provedor", "provider"], readonly ["proxima", "next"], readonly ["publicadoEm", "publishedAt"], readonly ["publicaPelaMeta", "publishesViaMeta"], readonly ["publicarAgora", "publishNow"], readonly ["quando", "scheduledFor"], readonly ["rascunho", "draft"], readonly ["reacoes", "reactions"], readonly ["reconciliados", "reconciled"], readonly ["rede", "network"], readonly ["registros", "records"], readonly ["removida", "removed"], readonly ["reorganizados", "rescheduled"], readonly ["resolvido", "resolved"], readonly ["respondido", "answered"], readonly ["respostas", "replies"], readonly ["resultado", "result"], readonly ["resumo", "summary"], readonly ["revogada", "revoked"], readonly ["revogada_em", "revokedAt"], readonly ["revogadoNoTiktok", "revokedAtTiktok"], readonly ["revogadoNoGoogle", "revokedAtGoogle"], readonly ["novoPadrao", "newDefault"], readonly ["salvamentos", "saves"], readonly ["seguidores", "followers"], readonly ["seguidoresGanhos", "followersGained"], readonly ["seguidoresVar", "followersChange"], readonly ["semMetricas", "noMetrics"], readonly ["semResposta", "unanswered"], readonly ["servico", "service"], readonly ["simples", "simple"], readonly ["simulado", "simulated"], readonly ["simular", "dryRun"], readonly ["stitchDesabilitado", "stitchDisabled"], readonly ["substitui", "replaces"], readonly ["suportado", "supported"], readonly ["tamanho", "size"], readonly ["tempoAssistidoMin", "watchTimeMin"], readonly ["tempoMedioSeg", "avgWatchTimeSec"], readonly ["texto", "text"], readonly ["texto_base", "baseText"], readonly ["textos", "texts"], readonly ["tipo", "type"], readonly ["titulo", "title"], readonly ["total", "total"], readonly ["totalRespostas", "replyCount"], readonly ["ultima", "last"], readonly ["ultimaImportacao", "lastImport"], readonly ["ultimo_uso", "lastUsedAt"], readonly ["urlPublica", "publicUrl"], readonly ["usuario", "username"], readonly ["vagas", "slots"], readonly ["vagasLivres", "freeSlots"], readonly ["valor", "value"], readonly ["variacao", "change"], readonly ["verificar", "verify"], readonly ["versao", "version"], readonly ["visualizacoes", "viewCount"], readonly ["ignorados", "skippedCount"], readonly ["publicos", "publicCount"], readonly ["dias", "days"], readonly ["sucesso", "succeeded"], readonly ["picoPorMinuto", "peakPerMinute"], readonly ["limitePorMinuto", "limitPerMinute"], readonly ["porDia", "byDay"], readonly ["porHora", "byHour"], readonly ["porChave", "byKey"], readonly ["inicio", "start"], readonly ["ultimoEm", "lastAt"], readonly ["metodo", "method"], readonly ["rota", "route"], readonly ["duracaoMs", "durationMs"], readonly ["duracao", "duration"], readonly ["largura", "width"], readonly ["altura", "height"], readonly ["chaveNome", "keyName"], readonly ["eventos", "events"], readonly ["evento", "event"], readonly ["eventoId", "eventId"], readonly ["segredo", "secret"], readonly ["segredoDica", "secretHint"], readonly ["falhasSeguidas", "consecutiveFailures"], readonly ["desativadoMotivo", "disabledReason"], readonly ["recentes", "recentDeliveries"], readonly ["entregas", "deliveries"], readonly ["tentativas", "attempts"], readonly ["proximaTentativa", "nextAttemptAt"], readonly ["ultimoStatus", "lastStatus"], readonly ["ultimoErro", "lastError"], readonly ["entregueEm", "deliveredAt"], readonly ["apagado", "deleted"], readonly ["ideias", "ideas"], readonly ["nota", "note"], readonly ["grupo", "group"], readonly ["naoLidos", "unreadCount"], readonly ["lido", "read"], readonly ["lido_em", "readAt"], readonly ["dados", "data"], readonly ["marcados", "marked"], readonly ["vaiTentar", "willRetry"], readonly ["quantidade", "count"], readonly ["enviados", "sent"], readonly ["falhas", "failed"], readonly ["esperando", "waiting"], readonly ["topTitulo", "topTitle"], readonly ["topRede", "topNetwork"], readonly ["retencao", "retention"], readonly ["curva", "curve"], readonly ["impressoes", "impressions"], readonly ["posicao", "position"], readonly ["assistida", "watched"], readonly ["relativa", "relative"], readonly ["percentualMedio", "avgViewPercentage"], readonly ["taxaPulo", "skipRate"], readonly ["desde", "since"], readonly ["pontos", "points"], readonly ["coletadoEm", "collectedAt"]];
export declare const KEYS: ReadonlyArray<KeyRow>;
/** Campo legado (PT) → campo do contrato (EN) (a primeira linha de cada campo vale; veja o comentário de cada linha acima). */
export type FieldMap = {
    [R in (typeof KEY_ROWS)[number] as R[0]]: R[1];
};
/** Campo do contrato que tem tradução (os de SAME_KEYS passam iguais e não entram aqui). */
export type ContractField = FieldMap[keyof FieldMap];
export type LegacyField = keyof FieldMap;
export declare const SCOPED_KEYS: {
    readonly reorganizados: readonly [readonly ["de", "from"], readonly ["para", "to"]];
    readonly leitura48h: readonly [readonly ["destinoId", "itemId"]];
};
/** Chaves que são iguais nos dois idiomas (ou nomes de rede/métrica): passam sem tradução e não disparam o aviso de "chave em português". */
declare const SAME_LIST: readonly ["id", "ctr", "item", "url", "views", "tags", "meta", "host", "token", "userId", "ok", "total", "pct", "manual", "custom", "studio", "video", "mime", "etag", "avatar", "youtube", "instagram", "tiktok", "publishAt", "parentId", "permalink", "thumbnail", "posts", "topPosts", "videos", "redirect", "chunkMB", "via", "videoId", "postId", "threadId", "limit", "max", "publishId", "status", "p95Ms", "cursor", "webhooks", "theme", "language", "notifications", "email", "panel", "postSent", "postFailed", "scheduledFail", "weeklySummary", "newComment", "unread", "ids", "all", "link", "topViews"];
/** Campos iguais nos dois idiomas. */
export type SameField = (typeof SAME_LIST)[number];
export declare const SAME_KEYS: ReadonlySet<string>;
export declare const VALUES: {
    readonly estado: readonly [readonly ["rascunho", "draft"], readonly ["agendado", "scheduled"], readonly ["enviado", "sent"], readonly ["erro", "error"], readonly ["cancelado", "canceled"], readonly ["privado", "private"], readonly ["fila", "queued"], readonly ["enviando", "uploading"], readonly ["pronta", "ready"], readonly ["removida", "removed"], readonly ["pendente", "pending"], readonly ["reautorizar", "reauthorize"], readonly ["indisponivel", "unavailable"], readonly ["entregue", "delivered"], readonly ["falhou", "failed"], readonly ["descartada", "discarded"]];
    readonly grupo: readonly [readonly ["sem", "idea"], readonly ["fazer", "scripting"], readonly ["andamento", "ready"], readonly ["feito", "posted"]];
    readonly modo: readonly [readonly ["privado", "private"], readonly ["agendado", "scheduled"], readonly ["publico", "public"], readonly ["rascunho", "draft"], readonly ["direto", "direct"], readonly ["agora", "now"]];
    readonly mover: readonly [readonly ["rascunho", "draft"], readonly ["fila", "queue"]];
    readonly tipo: readonly [readonly ["capa", "cover"], readonly ["longo", "long"], readonly ["comentar", "comment"], readonly ["agendar", "schedule"]];
    readonly formato: readonly [readonly ["longo", "long"]];
    readonly dia: readonly [readonly ["dom", "sun"], readonly ["seg", "mon"], readonly ["ter", "tue"], readonly ["qua", "wed"], readonly ["qui", "thu"], readonly ["sex", "fri"], readonly ["sab", "sat"], readonly ["dom", "sunday", "req"], readonly ["seg", "monday", "req"], readonly ["ter", "tuesday", "req"], readonly ["qua", "wednesday", "req"], readonly ["qui", "thursday", "req"], readonly ["sex", "friday", "req"], readonly ["sab", "saturday", "req"]];
    readonly escopo: readonly [readonly ["leitura", "read"], readonly ["escrita", "write"], readonly ["admin", "admin"]];
    readonly origem: readonly [readonly ["externo", "external"], readonly ["importado", "imported"]];
    readonly ordem: readonly [readonly ["recentes", "recent"], readonly ["comentarios", "comments"], readonly ["reacoes", "reactions"], readonly ["publicadoEm", "publishedAt"], readonly ["engajamento", "engagement"], readonly ["compartilhamentos", "shares"], readonly ["salvamentos", "saves"], readonly ["alcance", "reach"]];
    readonly rede: readonly [readonly ["todas", "all"], readonly ["tudo", "all"]];
    readonly direcao: readonly [];
    readonly fonte: readonly [readonly ["marco48h", "milestone48h"], readonly ["atual", "current"], readonly ["sem-dados", "no-data"]];
    readonly detalhe: readonly [readonly ["reserva no Buffer", "buffer-fallback"], readonly ["publicado", "published"], readonly ["aguardando horário", "awaiting-time"], readonly ["publicando", "publishing"], readonly ["preparado", "prepared"], readonly ["preparando", "preparing"], readonly ["aguardando preparo", "awaiting-prep"]];
};
export declare const SCOPED_VALUES: {
    readonly acoes: {
        readonly estado: readonly [readonly ["agendada", "pending"], readonly ["executando", "running"], readonly ["feita", "done"], readonly ["erro", "error"], readonly ["cancelada", "canceled"]];
    };
};
/** EN de um campo PT (a primeira linha de KEYS que o define), ou o próprio nome. */
type EN<P extends string> = P extends keyof FieldMap ? FieldMap[P] : P;
type ResponseEN<R> = R extends readonly [string, string, "req"] ? never : R extends readonly [string, infer E extends string, ...unknown[]] ? E : never;
type AnyEN<R> = R extends readonly [string, infer E extends string, ...unknown[]] ? E : never;
type AnyPT<R> = R extends readonly [infer V extends string, ...unknown[]] ? V : never;
/** Valores que o servidor DEVOLVE em cada campo de vocabulário fechado, pelo nome do campo no contrato. */
export type ContractValues = {
    [P in keyof typeof VALUES as EN<P>]: ResponseEN<(typeof VALUES)[P][number]>;
};
/** Valores aceitos num PEDIDO (inclui os sinônimos só de entrada, como `sunday`). */
export type ContractRequestValues = {
    [P in keyof typeof VALUES as EN<P>]: AnyEN<(typeof VALUES)[P][number]>;
};
/** Valores no vocabulário legado (PT), pelo nome PT do campo. */
export type LegacyValues = {
    [P in keyof typeof VALUES]: AnyPT<(typeof VALUES)[P][number]>;
};
/** Vocabulários próprios dentro de um pai (`pai.campo`). */
export type ContractScopedValues = {
    [P in keyof typeof SCOPED_VALUES & string as `${EN<P>}.${EN<keyof (typeof SCOPED_VALUES)[P] & string>}`]: {
        [C in keyof (typeof SCOPED_VALUES)[P]]: AnyEN<(typeof SCOPED_VALUES)[P][C][number & keyof (typeof SCOPED_VALUES)[P][C]]>;
    }[keyof (typeof SCOPED_VALUES)[P]];
};
export type ValueRow = KeyRow;
export type Direction = "toEN" | "toPT";
export type MessageKind = "req" | "res";
export interface TranslateOptions {
    dir: Direction;
    kind: MessageKind;
    strict?: boolean;
    paths?: boolean;
}
/** Chaves PT que existem só em português (não existem no contrato novo): num PEDIDO novo viram erro 422 em vez de passar calados. */
export declare const PT_ONLY_KEYS: ReadonlySet<string>;
export declare class PtKeyError extends Error {
    key: string;
    value: string | undefined;
    constructor(key: string, value?: string);
}
/**
 * Traduz um valor JSON. `dir`: "toEN" (interno → contrato) ou "toPT" (contrato → interno); `kind`: "req" (corpo/query de pedido) ou "res" (resposta).
 * `strict` (pedidos novos): uma chave que só existe em português lança PtKeyError. `paths`: reescreve caminhos da API dentro de valores.
 * Valores de texto livre (título, legenda…) nunca passam por dicionário: só campos de vocabulário fechado (estado, modo, tipo…).
 * A forma muda de idioma, por isso a saída é `unknown` por padrão: quem chama diz o tipo que espera.
 */
export declare function translate<T = unknown>(value: unknown, o: TranslateOptions, container?: string | null, own?: string | null): T;
export declare const toEN: <T = unknown>(value: unknown, kind?: MessageKind, o?: {
    strict?: boolean;
    paths?: boolean;
}) => T;
export declare const toPT: <T = unknown>(value: unknown, kind?: MessageKind, o?: {
    strict?: boolean;
    paths?: boolean;
}) => T;
/** Strings dentro de `slots` ("fri 17:30") ↔ ("sex 17:30"): o dia da semana vem junto do horário. */
export declare function translateSlots<T>(slots: T, dir: Direction, { strict }?: {
    strict?: boolean;
}): T;
export declare const ERROR_CODES: {
    readonly rota_inexistente: "route_not_found";
    readonly metodo_nao_permitido: "method_not_allowed";
    readonly erro_interno: "internal_error";
    readonly nao_autenticado: "unauthorized";
    readonly chave_invalida: "invalid_api_key";
    readonly chave_revogada: "revoked_api_key";
    readonly chave_expirada: "expired_api_key";
    readonly mfa_necessario: "mfa_required";
    readonly codigo_invalido: "invalid_code";
    readonly mfa_ja_ativo: "mfa_already_enabled";
    readonly mfa_nao_iniciado: "mfa_not_started";
    readonly mfa_inativo: "mfa_not_enabled";
    readonly sessao_atual: "current_session";
    readonly sessao_inexistente: "session_not_found";
    readonly confirmacao_invalida: "invalid_confirmation";
    readonly sessao_invalida: "invalid_session";
    readonly origem_invalida: "invalid_origin";
    readonly sem_permissao: "forbidden";
    readonly muitas_requisicoes: "rate_limited";
    readonly corpo_vazio: "empty_body";
    readonly json_invalido: "invalid_json";
    readonly corpo_grande: "body_too_large";
    readonly campo_invalido: "invalid_field";
    readonly pedido_invalido: "invalid_request";
    readonly falta_horario: "missing_schedule";
    readonly sem_horario: "missing_time";
    readonly horario_passado: "time_in_past";
    readonly sem_vagas: "no_slots";
    readonly sem_vaga_livre: "no_free_slot";
    readonly email_em_uso: "email_in_use";
    readonly email_de_revisao: "review_account_email";
    readonly usuario_sem_senha: "user_without_password";
    readonly redefinicao_recente: "reset_recently_sent";
    readonly email_falhou: "email_send_failed";
    readonly email_nao_configurado: "email_not_configured";
    readonly conta_revisao: "review_account_restricted";
    readonly conta_revisao_expirada: "review_account_expired";
    readonly conta_revisao_revogada: "review_account_revoked";
    readonly conta_revisao_limite: "review_account_limit";
    readonly conta_revisao_inexistente: "review_account_not_found";
    readonly post_inexistente: "post_not_found";
    readonly destino_inexistente: "item_not_found";
    readonly acao_inexistente: "action_not_found";
    readonly canal_inexistente: "channel_not_found";
    readonly canal_nao_conectado: "channel_not_connected";
    readonly chave_inexistente: "api_key_not_found";
    readonly workspace_inexistente: "workspace_not_found";
    readonly oauth_requer_painel: "oauth_requires_panel";
    readonly video_publicado: "video_not_private";
    readonly canal_em_uso: "channel_in_use";
    readonly canal_conectado: "channel_connected";
    readonly canal_do_buffer: "channel_is_buffer";
    readonly credenciais_invalidas: "invalid_credentials";
    readonly senha_fraca: "weak_password";
    readonly link_invalido: "invalid_link";
    readonly conta_travada: "account_locked";
    readonly passkey_invalida: "invalid_passkey";
    readonly passkey_inexistente: "passkey_not_found";
    readonly passkey_existente: "passkey_exists";
    readonly desafio_invalido: "invalid_challenge";
    readonly limite_de_passkeys: "passkey_limit";
    readonly codigo_necessario: "code_required";
    readonly workspace_da_plataforma: "platform_workspace";
    readonly migracao_pendente: "migration_pending";
    readonly chave_em_uso: "api_key_in_use";
    readonly token_invalido: "invalid_token";
    readonly pedido_inexistente: "request_not_found";
    readonly pedido_de_outro_navegador: "request_from_another_browser";
    readonly conexao_inexistente: "connection_not_found";
    readonly video_inexistente: "video_not_found";
    readonly sem_video: "no_video";
    readonly sem_avatar: "no_avatar";
    readonly midia_inexistente: "media_not_found";
    readonly midia_em_uso: "media_in_use";
    readonly midia_nao_pronta: "media_not_ready";
    readonly midia_tipo: "media_type_mismatch";
    readonly midia_travada: "media_locked";
    readonly rede_desconhecida: "unknown_network";
    readonly rede_nao_suportada: "network_not_supported";
    readonly estado_invalido: "invalid_state";
    readonly id_existente: "id_exists";
    readonly ja_adotado: "already_adopted";
    readonly nada_a_publicar: "nothing_to_publish";
    readonly nao_editavel: "not_editable";
    readonly post_adotado: "post_adopted";
    readonly post_preparado: "post_prepared";
    readonly sem_credencial_oauth: "oauth_not_configured";
    readonly tem_api: "followers_from_api";
    readonly youtube_nao_conectado: "youtube_not_connected";
    readonly instagram_meta_nao_conectado: "instagram_meta_not_connected";
    readonly falha_download: "download_failed";
    readonly mime_nao_suportado: "unsupported_mime";
    readonly arquivo_grande: "file_too_large";
    readonly parte_grande: "part_too_large";
    readonly parte_pequena: "part_too_small";
    readonly parte_vazia: "part_empty";
    readonly partes_desiguais: "parts_unequal";
    readonly partes_faltando: "parts_missing";
    readonly sem_partes: "no_parts";
    readonly tamanho_diferente: "size_mismatch";
    readonly r2_recusou: "storage_rejected";
    readonly identidade_inexistente: "identity_not_linked";
    readonly ultima_forma_de_login: "last_login_method";
    readonly credencial_oauth_ausente: "missing_oauth_credential";
    readonly ja_conectado: "already_connected";
    readonly oauth_state_invalido: "oauth_state_invalid";
    readonly oauth_negado: "oauth_denied";
    readonly sem_conta_instagram: "no_instagram_account";
    readonly varias_contas_instagram: "multiple_instagram_accounts";
    readonly troca_token_falhou: "token_exchange_failed";
    readonly permissao_publicar_ausente: "publish_permission_missing";
    readonly token_sem_acesso: "token_cannot_read_account";
    readonly webhook_inexistente: "webhook_not_found";
    readonly entrega_inexistente: "delivery_not_found";
    readonly url_insegura: "unsafe_url";
    readonly limite_webhooks: "webhook_limit_reached";
    readonly ideia_inexistente: "idea_not_found";
    readonly limite_ideias: "idea_limit_reached";
    readonly idempotencia_reutilizada: "idempotency_key_reuse";
    readonly idempotencia_em_andamento: "idempotency_in_progress";
    readonly idempotencia_resposta_grande: "idempotency_response_too_large";
    readonly buffer_erro: "buffer_error";
    readonly instagram_erro: "instagram_error";
    readonly tiktok_indisponivel: "tiktok_unavailable";
    readonly youtube_erro: "youtube_error";
};
/** Código de erro legado (PT) → código do contrato (EN). */
export type ErrorCodeMap = typeof ERROR_CODES;
/** Código de erro do contrato (`error.code`). */
export type ErrorCode = ErrorCodeMap[keyof ErrorCodeMap];
/** Código de erro legado (`erro.codigo`). */
export type LegacyErrorCode = keyof ErrorCodeMap;
export declare const ERROR_CODES_REVERSE: { readonly [K in keyof ErrorCodeMap as ErrorCodeMap[K]]: K; };
export declare const codeToEN: <C extends string>(c: C) => C extends LegacyErrorCode ? ErrorCodeMap[C] : C;
export declare const codeToPT: (c: string) => string;
/** Envelope de erro do contrato. Um código fora da tabela ainda pode chegar (servidor mais novo que o cliente). */
export interface ErrorEnvelope {
    error: {
        code: ErrorCode | (string & {});
        message: string;
        details?: unknown;
    };
}
/** Envelope de erro legado (o que o front ainda confere). */
export interface LegacyErrorEnvelope {
    erro: {
        codigo: LegacyErrorCode | (string & {});
        mensagem: string;
        detalhes?: unknown;
    };
}
/** Envelope de erro legado `{ erro: { codigo, mensagem, detalhes? } }` → novo `{ error: { code, message, details? } }`. */
export declare function errorEnvelopeToEN<T>(body: T): T extends LegacyErrorEnvelope ? ErrorEnvelope : T;
/** Novo → legado (usado pelo front e pelos testes que reaproveitam as asserções antigas). */
export declare function errorEnvelopeToPT<T>(body: T): T extends ErrorEnvelope ? LegacyErrorEnvelope : T;
export {};

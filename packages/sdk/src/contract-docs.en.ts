// @ts-nocheck — camada de dados de texto (inglês), deliberadamente solta; os tipos do contrato valem para o resto do SDK.
// English layer of the per-route documentation (contract-docs.mjs holds the PT-BR texts; this file only translates them).
// Every entry is keyed by route key (and by field path, query name, error code or success status inside it). COMUM_EN holds the
// sentences that repeat verbatim across many routes, keyed by the exact PT text, and is only a fallback. `faltandoEn(ROUTES)` lists
// every PT text without an English version and every English entry whose PT counterpart no longer exists; the test requires it to be empty.
// Names, types, enums, limits, `required`, ids and keys are never touched: only human text changes. No dependencies.
import { TITULOS, RESUMOS, GRUPOS, ERROS_COMUNS, docDe, achatar, paramDe } from "./contract-docs.ts";

// ---------------------------------------------------------------------------------------------------------------- groups, titles, summaries
export const GRUPOS_EN = { notifications: "Notifications", apiKeys: "API keys", posts: "Posts", media: "Media", channels: "Channels", connections: "Connections", insights: "Insights", calendar: "Calendar", content: "Content", comments: "Comments", mentions: "Comments", tags: "Tags", ideas: "Ideas", tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", health: "Health", system: "System", usage: "Usage and log", preferences: "Preferences", webhooks: "Webhooks" };
/** Group name of a route (the first segment of its key). */
export const grupoEn = (r) => GRUPOS_EN[r.key.split(".")[0]] || r.key.split(".")[0];

export const TITULOS_EN = {
  health: "Service health", "health.v1": "Service health (versioned path)", "connections.callback": "OAuth callback", "media.public": "Public media by token",
  "connections.start": "Start network connection", "connections.disconnect": "Disconnect network", "connections.instagramToken": "Instagram token",
  "channels.list": "List channels", "channels.default": "Set default channel", "channels.remove": "Remove channel", "channels.avatar": "Channel avatar", "tiktok.creator": "TikTok creator info",
  "channels.slots.get": "Channel time slots", "channels.slots.put": "Save channel time slots", "channels.followers.put": "Record followers", "channels.followers.get": "Channel followers",
  "media.create": "Create media", "media.list": "List media", "media.get": "Get media", "media.part": "Upload media part", "media.content.put": "Upload media file", "media.content.get": "Download media file", "media.content.head": "Check media file", "media.complete": "Complete media upload", "media.delete": "Delete media",
  "posts.create": "Create post", "posts.adopt": "Adopt scheduled post", "posts.list": "List posts", "posts.get": "Get post", "posts.update": "Update post", "posts.cancel": "Cancel post", "posts.publishNow": "Publish now", "posts.youtubeSchedule": "Schedule on YouTube", "posts.itemComment": "Release item comment",
  "calendar.get": "Calendar", "insights.get": "Metrics", "insights.import": "Import metrics", "insights.retention": "Retention, impressions and CTR", "insights.retention.item": "Post retention", "content.list": "Published content",
  "youtube.videos": "YouTube videos", "youtube.video": "Get YouTube video", "youtube.editVideo": "Update YouTube video", "youtube.comments": "YouTube comments", "youtube.reply": "Reply to YouTube comment", "youtube.resolve": "Resolve YouTube comment", "youtube.reopen": "Reopen YouTube comment",
  "instagram.media": "Instagram media", "instagram.comments": "Instagram comments", "instagram.reply": "Reply to Instagram comment", "instagram.hide": "Hide Instagram comment", "instagram.resolve": "Resolve Instagram comment", "instagram.reopen": "Reopen Instagram comment",
  "comments.list": "Comments from all networks", "mentions.list": "Mentions",
  "apiKeys.list": "List API keys", "apiKeys.create": "Create API key", "apiKeys.revoke": "Revoke API key", "usage.get": "Usage summary", "usage.log": "Request log",
  "notifications.list": "List notifications", "notifications.read": "Mark notifications as read",
  "preferences.get": "Get preferences", "preferences.put": "Save preferences",
  "webhooks.list": "List webhooks", "webhooks.create": "Create webhook", "webhooks.get": "Get webhook", "webhooks.update": "Update webhook", "webhooks.delete": "Delete webhook", "webhooks.test": "Test webhook", "webhooks.deliveries": "Webhook deliveries", "webhooks.redeliver": "Retry delivery", "webhooks.rotateSecret": "Rotate webhook secret",
  "ideas.list": "List ideas", "ideas.create": "Create idea", "ideas.import": "Import ideas", "ideas.update": "Update idea", "ideas.delete": "Delete idea",
};

export const RESUMOS_EN = {
  health: "Checks that the service is up. No key required.", "health.v1": "Same as `/health`, on the versioned path. No key required.",
  "connections.callback": "Where YouTube, TikTok and Meta send the browser back after login (an HTML page). Previously registered redirect URLs keep working.",
  "media.public": "Public media served through a tokenized link (supports Range). Also served at `/m/…`. This is the URL Meta and TikTok download from.",
  "media.public#HEAD": "Same as GET, but returns only the headers.",
  "connections.start": "Starts the OAuth login for youtube, tiktok or meta (Instagram) and returns the authorization URL. Another account on the same network becomes another channel; the same account is reconnected. With `meta` you can pass `replace=true` (replaces the token of an existing connection), `add=true` (connects ANOTHER Instagram account as a new channel), `instagram=<username>`, `instagram_id=<id|current>` and `probe=true` (reports only, stores nothing).",
  "connections.disconnect": "Disconnects one youtube, tiktok or instagram account (for Instagram, only the Meta token; the Buffer channel is never touched). `channel` picks the account; without it, the default channel is used. The other accounts, the channel and its history are kept. If it was the default, another connected account takes over.",
  "connections.instagramToken": "Stores the Meta API token for Instagram (encrypted). The token is verified with Meta before it is saved.",
  "channels.list": "One item per connected channel (several accounts on the same network give several items; `default` marks the one used when `channel` is omitted), plus a \"not connected\" item for each network without an account. Includes the status and the number of time slots.",
  "channels.default": "Makes this account the default for its network (used when a network route has no `channel`); the other accounts on the same network lose the mark. Returns 404 `channel_not_found` if it is not an active channel in this workspace.",
  "channels.remove": "Removes a DISCONNECTED account from the list (its history is kept). Refused while the account is connected, has pending items, or is the Buffer Instagram channel.",
  "channels.avatar": "Profile picture of the channel (`channel` picks the account).", "tiktok.creator": "What the connected TikTok account accepts (`creator_info`: privacy levels, maximum duration…). `channel` picks the account.",
  "channels.slots.get": "Weekly publishing time slots of a channel (`channel` picks the account; without it, the default one).",
  "channels.slots.put": "Replaces all weekly time slots of a channel and reorganizes what is in its queue (`channel` picks the account).",
  "channels.followers.put": "Records the follower count by hand (Instagram only; `channel` picks the account). It becomes the record for that day.",
  "channels.followers.get": "The last 60 daily follower records (`channel` picks the account).",
  "media.create": "Starts a media upload (video, cover or image: the photo of an image post, JPEG only). With `simple: true` and up to 50 MB, send the whole file at once with `PUT /v1/media/:id/content`; otherwise upload it in parts and finish with `POST /v1/media/:id/complete`.",
  "media.list": "Lists media items (the latest 100). Older videos get their duration, width and height filled in on first read.",
  "media.get": "One media item (with `publicUrl` once it is ready; videos also include `durationMs`, `width` and `height` when the file header provides them; images include `width` and `height`).",
  "media.part": "Uploads one part of the file (raw bytes in the body). Re-sending the same part is safe. Every part except the last must have the same size (at least 5 MiB).",
  "media.content.put": "Uploads the whole file at once (media created with `simple: true`, up to 50 MB). The body is the raw bytes.",
  "media.content.get": "Downloads the file (key required; supports Range).", "media.content.head": "Same as GET, but returns only the headers.",
  "media.complete": "Joins the uploaded parts. Checks the declared size and the 1..N sequence (and, for a `image` media item, that the file is a JPEG). Calling it again is harmless.",
  "media.delete": "Removes a media item (refused while a pending post uses it).",
  "posts.create": "Creates a post with one item per network (queue, fixed time or draft). Each item may carry `channel` (the account on that network; without it, the default channel). With `kind: \"image\"` it is a single-photo post and with `kind: \"carousel\"` a carousel of 2 to 20 slides, Instagram only (through Buffer or directly through Meta).",
  "posts.adopt": "Registers in Praeko a Reel that is already scheduled in Buffer (does not call Buffer).",
  "posts.list": "Lists posts, newest first (queued posts and drafts: soonest first). Filters: `state`, `channel`, `tag`.",
  "posts.get": "One post with its items and next actions.",
  "posts.update": "Edits the title, texts, media, tags and items, or moves the post to drafts or to the queue. Send only what changed; everything else stays. A YouTube item that is already uploaded and still scheduled can also change its time and metadata (checked live on YouTube).",
  "posts.cancel": "Cancels the pending items of a post.",
  "posts.publishNow": "Takes the pending items out of the queue and publishes them now (`?network=` limits it to one network).",
  "posts.youtubeSchedule": "Schedules the publication of a video already uploaded to YouTube (as private).",
  "posts.itemComment": "Releases the stored pinned comment of an item.",
  "calendar.get": "Items in a period and the free time slots.",
  "insights.get": "Cards, top posts, results per channel (one row per account when a network has several; `channel` filters one), summary and the 48 h reading.",
  "insights.retention": "Retention (% watched and average watch time), impressions and CTR from YouTube, and skip rate from Instagram, per post. Data the network does not provide comes as `null`, with the reason in `retention.message`. Requires the `yt-analytics.readonly` permission, which the YouTube connection already requests (channels connected before it was added must reauthorize once).",
  "insights.retention.item": "Retention curve of one item (`:item` is the `id` of an item from `/v1/insights`: a post item or imported content) and its reach metrics. Same state and message as the list route.",
  "insights.import": "Imports the history from YouTube, Buffer (Instagram) and TikTok (every connected account; `channel` together with `network` limits it to one).",
  "content.list": "Everything already published (by Praeko or imported).",
  "youtube.videos": "Videos of the channel (including private and scheduled ones); `channel` picks the account.", "youtube.video": "One video of the channel.",
  "youtube.editVideo": "Edits the title, description and tags of a video (with `dryRun: true` it only shows the before and after, without saving).",
  "youtube.comments": "Comment threads of the channel (`channel` picks the account).", "youtube.reply": "Replies to a thread (this really posts on YouTube).",
  "youtube.resolve": "Marks a thread as resolved (in Praeko only).", "youtube.reopen": "Reopens a resolved thread.",
  "instagram.media": "The post grid of the profile (Meta API).", "instagram.comments": "Instagram comments (Meta API).",
  "instagram.reply": "Replies to a comment (this really posts on Instagram).", "instagram.hide": "Hides or unhides a comment.",
  "instagram.resolve": "Marks a comment as resolved (in Praeko only).", "instagram.reopen": "Reopens a resolved comment.",
  "comments.list": "Comments from all networks together, from EVERY active account on each network (each comment carries `channel`; `channel` filters one account; an account that fails goes into `errors` and the others still respond).",
  "mentions.list": "Mentions (Instagram, through tags; YouTube has none).",
  "apiKeys.list": "Lists the API keys (never the secret).", "apiKeys.create": "Creates a key. The secret is shown ONCE, in the response.", "apiKeys.revoke": "Revokes a key (the key making the call cannot be revoked).",
  "usage.get": "API usage of this workspace over the last `days` (1 to 30, default 7, in UTC): total, successful (< 400), errors, p95 duration, peak requests in one minute against the per-minute limit, `byDay`, `byHour` (only with days=1: the last 24 hours) and `byKey` (`session` = the dashboard).",
  "usage.log": "Request log, newest first, kept for 30 days; metadata only (method, route without ids, status, duration, key), never bodies, headers or query strings. Filters: `key` (id or `session`), `status` (`2xx`, `3xx`, `4xx`, `5xx` or a code), `route` (substring), `method`, `days` (1 to 30); `limit` (1 to 200, default 50) and `cursor` (the `next` of the previous page).",
  "notifications.list": "The notification center (the bell) of the signed-in user in this workspace, newest first: `notifications` (`id`, `event` = postSent, postFailed, scheduledFail, weeklySummary or newComment, `data` with the facts of the event, `link` to where it leads, `read`, `readAt` and `createdAt`), `unreadCount` and `next`. A notification only exists if the `panel` preference for that event was on when it happened. Filters: `unread` (`true`), `limit` (1 to 50, default 20) and `cursor` (the `next` of the previous page). Kept for 30 days. An API key has no user and reads an empty list.",
  "notifications.read": "Marks notifications as read: `ids` (up to 100) or `all: true`. Ids that are not yours, or that do not exist, are ignored, and marking again is harmless. Returns `marked` (how many changed) and the new `unreadCount`.",
  "preferences.get": "Dashboard preferences of the signed-in user in this workspace (an API key reads the workspace row): `theme`, `language` and `notifications` per event, with the `email` and `panel` flags. Missing values come back as the defaults (dark theme, pt-BR, no email, panel on).",
  "preferences.put": "Changes the preferences. Partial (only what is sent changes) and strict (an unknown field or value returns 422 `invalid_field`). Returns the full preferences. With `email` true, the server emails `postSent`, `postFailed`, `scheduledFail`, the `weeklySummary` (Mondays at 08:00, `America/Sao_Paulo`) and `newComment` (batched, at most one email per hour); with `panel` true, the event goes to the notification center (`GET /v1/notifications`).",
  "webhooks.list": "Outgoing webhooks of this workspace (never the secret: only `secretHint`), with the delivery success of the last 7 days (`recentDeliveries`) and the `events` you can subscribe to.",
  "webhooks.create": "Creates a webhook. The `url` must be https on a public host (private IPs, localhost and cloud metadata addresses are refused with `unsafe_url`). The signing `secret` is returned ONCE. At most 10 per workspace.",
  "webhooks.get": "One webhook (without the secret).",
  "webhooks.update": "Changes `url`, `events` or `active`; send only what changed. Pausing discards the pending deliveries; reactivating resets the failure count.",
  "webhooks.delete": "Deletes a webhook and its delivery history.",
  "webhooks.test": "Sends a `ping.test` event now (even if the webhook is paused) and returns the result in `delivery`. It does not count towards automatic deactivation.",
  "webhooks.deliveries": "Recent deliveries, newest first (`limit` 1 to 100, default 20; kept for 30 days): event, state (pending, delivered, failed, discarded), attempts, last HTTP status and error, duration.",
  "webhooks.redeliver": "Resends a delivery now, with the same `Praeko-Delivery` id (so the receiver can deduplicate).",
  "webhooks.rotateSecret": "Replaces the signing secret: the new `secret` is returned ONCE and the old one stops signing immediately.",
  "ideas.list": "The idea board of this workspace (the Create screen), newest first: `title`, `note`, `group` (idea, scripting, ready, posted), `tags` (the first one is the series), `createdAt` and `updatedAt`.",
  "ideas.create": "Adds an idea. At most 2000 per workspace.",
  "ideas.import": "Adds several ideas at once (up to 500 per call), as the dashboard does with the ideas it kept in the browser. An item whose `id` was already imported is skipped (`skippedCount`), so repeating the call never creates duplicates. Items without a valid `title` are skipped.",
  "ideas.update": "Changes `title`, `note`, `group` (moves the card) or `tags`; anything not sent stays as it is.",
  "ideas.delete": "Deletes an idea.",
};
/** English title of a route. */
export const tituloEn = (r) => TITULOS_EN[r.key] || "";
/** English summary of a route (HEAD has its own text); falls back to the contract's English `summary`. */
export const resumoEn = (r) => RESUMOS_EN[`${r.key}#${r.method}`] || RESUMOS_EN[r.key] || r.summary;

// ---------------------------------------------------------------------------------------------------------------- shared sentences (keyed by the exact PT text)
const ISO_EN = "ISO 8601 date and time in UTC, for example `2026-11-14T20:30:00Z`.";
export const COMUM_EN = {
  // errors that many routes share
  "Faltou o cabeçalho `Authorization: Bearer …`.": "The `Authorization: Bearer …` header is missing.",
  "A chave não existe.": "The key does not exist.", "A chave foi revogada.": "The key has been revoked.", "A chave expirou.": "The key has expired.",
  "O escopo da chave não basta para esta rota (veja o selo de escopo).": "The key's scope is not enough for this route (see the scope badge).",
  "Passou do limite de requisições por minuto.": "The per-minute request limit was exceeded.",
  "O corpo veio vazio.": "The request body is empty.", "O corpo não é um objeto JSON.": "The request body is not a JSON object.", "O corpo passa de 1 MB.": "The request body is larger than 1 MB.",
  "A `Idempotency-Key` já foi usada com outro pedido (método, caminho, query ou corpo diferentes).": "The `Idempotency-Key` was already used with a different request (different method, path, query or body).",
  "Um pedido com a mesma `Idempotency-Key` ainda está em andamento (repita em instantes).": "A request with the same `Idempotency-Key` is still in progress (retry in a moment).",
  "A resposta original passou de 256 KB e não foi guardada; consulte o recurso por GET.": "The original response was larger than 256 KB and was not stored; fetch the resource with GET instead.",
  "O webhook não existe.": "The webhook does not exist.", "A mídia não existe.": "The media item does not exist.", "O post não existe.": "The post does not exist.", "A ideia não existe.": "The idea does not exist.",
  "O YouTube recusou.": "YouTube rejected the request.", "A Meta recusou.": "Meta rejected the request.", "A API da Meta não está conectada.": "The Meta API is not connected.",
  // query parameters that many routes share
  "Id da conta quando a rede tem várias (de `GET /v1/channels`). Sem ele, o canal padrão.": "Account id when the network has several (from `GET /v1/channels`). Without it, the default channel.",
  "Token da próxima página.": "Next page token.", "Itens por página (até 50).": "Items per page (up to 50).", "Itens por página (1 a 200).": "Items per page (1 to 200).",
  "O `next` da página anterior.": "The `next` value of the previous page.", "Quantos dias olhar (1 a 30).": "How many days to look back (1 to 30).",
  // body fields that many routes share
  "Novo título.": "New title.", "Textos do YouTube.": "YouTube texts.", "Textos do Instagram.": "Instagram texts.", "Textos do TikTok.": "TikTok texts.",
  "Comentário fixo.": "Pinned comment.", "Legenda.": "Caption.", "Descrição.": "Description.", "Sempre `buffer`.": "Always `buffer`.", "Id do post no Buffer.": "Id of the post in Buffer.",
  "Id da mídia de vídeo.": "Id of the video media item.", "Id da mídia de capa.": "Id of the cover media item.",
  "Coluna do quadro.": "Board column.", "Texto da resposta.": "Reply text.",
  "Quadro do vídeo usado como capa, em milissegundos.": "Video frame used as the cover, in milliseconds.", "O mesmo de `items[].mode`.": "Same as `items[].mode`.", "Por onde publicar.": "Which route to publish through.",
  // success statuses that several binary routes share
  "O arquivo inteiro.": "The whole file.", "Só cabeçalhos do arquivo inteiro.": "Headers only, for the whole file.", "Só cabeçalhos do pedaço pedido por `Range`.": "Headers only, for the chunk requested with `Range`.",
};

// ---------------------------------------------------------------------------------------------------------------- path parameters
const PARAMS_EN = {
  network: "Network: youtube, instagram or tiktok.", id: "Resource identifier (see the example).",
  item: "Id of the post item (the `items[].id` field of the `GET /v1/posts/:id` response).", part: "Part number, from 1 to 10000.",
  channel: "Channel id (the `id` field of `GET /v1/channels`).", delivery: "Delivery id (the `id` field of `GET /v1/webhooks/:id/deliveries`).",
  token: "Token of the public media link.", name: "File name.", "*": "Part of the path.",
};
/** `:id` per route-key prefix; `youtube:video` and `youtube:comment` mirror the two cases paramDe distinguishes. */
const ID_EN = {
  posts: "Post id.", media: "Media item id.", webhooks: "Webhook id (starts with `wh_`).", ideas: "Idea id (starts with `ide_`).",
  apiKeys: "API key id (not the key itself: the `id` field).", instagram: "Instagram comment id.",
  "youtube:video": "YouTube video id.", "youtube:comment": "YouTube comment thread id.",
};
const idKey = (route) => { const g = route.key.split(".")[0]; return g === "youtube" ? (/comments/.test(route.path) ? "youtube:comment" : "youtube:video") : g; };
/** Same as paramDe, with the description in English. */
export function paramEn(route, nome) {
  const base = paramDe(route, nome);
  const desc = nome === "id" ? ID_EN[idKey(route)] || PARAMS_EN.id : PARAMS_EN[nome] || PARAMS_EN["*"];
  return { ...base, ...(base.enum ? { enum: [...base.enum] } : {}), desc };
}

// ---------------------------------------------------------------------------------------------------------------- request body: field descriptions and notes
const SO_YT = "YouTube, only for a video already uploaded and still scheduled:";
export const CAMPOS_EN = {
  "webhooks.create": {
    url: "URL that receives the events. Must be https on a public domain (no user and password; private IPs, localhost and internal names are refused with `unsafe_url`).",
    events: "Events that trigger the webhook. At least one.", active: "Whether the webhook starts enabled.",
  },
  "webhooks.update": {
    url: "New URL (same rules as `POST /v1/webhooks`). Without it, the url does not change.",
    events: "New list of events (replaces the previous one; at least one). Without it, nothing changes.",
    active: "`false` pauses it (pending deliveries are discarded); `true` reactivates it and resets the count of consecutive failures.",
  },
  "ideas.create": { title: "Idea title.", note: "Free-form notes.", tags: "Tags (the first one is the series). Duplicates and empty ones are ignored." },
  "ideas.import": {
    ideas: "Ideas to import (up to 500 per call).",
    "ideas[].id": "Source id (up to 64 characters). An id that was already imported is skipped, which makes the call repeatable.",
    "ideas[].title": "Title (1 to 200 characters; longer text is truncated). Without a valid title the item is skipped.",
    "ideas[].note": "Notes (up to 5000 characters; longer text is truncated).",
    "ideas[].group": "Board column; an unknown value becomes `idea`.",
    "ideas[].tags": "Tags (up to 20, 40 characters each; the excess is truncated).",
    "ideas[].createdAt": "Original creation date (ISO 8601). Used only if it is valid and not in the future; otherwise, now.",
  },
  "ideas.update": { note: "New notes.", group: "Move the card to this column.", tags: "New list of tags (replaces the previous one)." },
  "apiKeys.create": { name: "A name to help you recognize the key.", scope: "Key scope (each level includes the previous one).", expiresInDays: "Validity in days. Without it, the key never expires." },
  "notifications.read": { ids: "Ids of the notifications to mark (up to 100). Can be omitted if you send `all: true`.", all: "`true` marks every unread notification of the signed-in user." },
  "preferences.put": {
    theme: "Dashboard theme.", language: "Dashboard language.", notifications: "Notifications per event. Only the events you send change.",
    ...Object.fromEntries(["postSent", "postFailed", "scheduledFail", "weeklySummary", "newComment"].flatMap((ev) => [[`notifications.${ev}`, "Where to notify this event."], [`notifications.${ev}.email`, "Notify by email."], [`notifications.${ev}.panel`, "Notify in the dashboard."]])),
  },
  "media.create": {
    type: "Media type: `video`, `cover` or `image` (the photo of an image post).", name: "File name (stored with safe characters only).",
    mime: "File type. Video: `video/mp4` or `video/quicktime`. Cover: `image/png` or `image/jpeg`. Image: `image/jpeg` only (Studio exports sRGB JPEG; the server does not convert).",
    size: "Size in bytes. Video up to 5 GiB; cover and image up to 20 MiB (Instagram takes photos up to 8 MB: that is checked when the post is created).",
    simple: "`true` sends the whole file in one `PUT /v1/media/:id/content` (only up to 50 MB). Without it, the upload is done in parts.",
    sha256: "SHA-256 hash of the file, if you want it stored.",
  },
  "channels.slots.put": {
    timezone: "IANA time zone of the channel. Without it, the current one is kept.",
    slots: "The weekly time slots (they replace ALL current ones; at most 100). Each one is a string `\"fri 17:30\"` or an object `{ \"day\": \"fri\", \"time\": \"17:30\" }`. Days: sun, mon, tue, wed, thu, fri, sat (or `weekday` from 0 to 6). Time: HH:MM from 00:00 to 23:59. Duplicates are merged.",
  },
  "channels.followers.put": { value: "Number of followers.", day: "Day of the record, `YYYY-MM-DD`, at most tomorrow. Without it, today in the channel's time zone." },
  "connections.instagramToken": {
    token: "Meta API access token (Instagram).", userId: "Numeric id of the Instagram account.", host: "Meta server.",
    username: "Username, used only if Meta does not return the name.", type: "Account type.",
  },
  "posts.create": {
    title: "Post title. Required unless `texts.youtube.title` is present.", baseText: "Base text, stored with the post.",
    kind: "`video` (default), `image` (a single photo) or `carousel` (2 to 20 slides): Instagram only. YouTube and TikTok refuse `image` and `carousel` (422 `kind_not_supported_by_network`). `image` with 2 to 20 items in `media.images` also becomes a carousel (the post comes back with `kind: carousel`).",
    media: "Media of the post (ids from `POST /v1/media`, already completed).", "media.video": "Id of the video media item. Required when `kind` is `video`.", "media.cover": "Id of the cover media item (PNG or JPEG). Video posts only.",
    "media.images": "Only with `kind: image` or `carousel`: the images of the post IN SLIDE ORDER (the list order is the carousel order). One image = a single photo; 2 to 20 = a carousel (fewer than 2 with `carousel`: 422 `carousel_too_few_images`; more than 20: 422 `carousel_too_many_images`). The same media id may repeat.",
    "media.images[].media": "Id of a completed `type: image` media item.",
    "media.images[].alt": "Alternative text (up to 1000 characters). Sent to Instagram (on every carousel slide too) when the item publishes through Meta (`via: meta`); through Buffer it is ignored and the item comes back with the `alt_ignored` warning.",
    texts: "Texts per network. Each network in `items` needs its own `text`.",
    "texts.youtube.title": "Video title (up to 100 characters; longer text is truncated).",
    "texts.youtube.pinnedComment": "Pinned comment, posted after the video becomes public.",
    "texts.instagram.text": "Caption: up to 2200 characters and 30 hashtags.", "texts.tiktok.text": "Caption: up to 2200 characters.",
    items: "One item per network (a network cannot repeat).", "items[].network": "Network of the item.",
    "items[].channel": "Id of the account on that network (from `GET /v1/channels`). Without it, the default channel.",
    "items[].mode": "How to publish. YouTube: `private`, `scheduled` or `public`. TikTok: `draft` or `direct`. Instagram: `now`.",
    "items[].scheduledFor": `Fixed publishing time. ${ISO_EN} At least 30 s ahead (Instagram: 5 min through Buffer, 25 min through Meta; YouTube \`scheduled\`: 5 min).`,
    "items[].queue": "`true` uses the channel's next free time slot (see `PUT /v1/channels/:network/slots`).",
    "items[].via": "Instagram only: which route to publish through.",
    "items[].replaces": "Instagram with `via: meta` only: deletes this post from Buffer when publishing.",
    "items[].media": "Media for this item only (replace the post's media). Only `video` and `cover`: images per item arrive in a later phase.",
    queue: "Applies to every item that has neither `queue` nor `scheduledFor`.", draft: "`true` creates everything as a draft (no time required).",
    options: "Per-network and general options.", "options.format": "`long` marks the post as a long-form video (without it, it is a Short).",
    "options.youtube": "YouTube options.", "options.youtube.categoryId": "Video category.", "options.youtube.tags": "Video tags.",
    "options.youtube.notifySubscribers": "Notify subscribers.", "options.youtube.comment": "`false` skips posting the pinned comment.",
    "options.tiktok": "TikTok options.", "options.tiktok.privacy": "Who can view it.",
    "options.tiktok.disableComments": "Turn off comments.", "options.tiktok.disableDuet": "Turn off Duet.", "options.tiktok.disableStitch": "Turn off Stitch.",
    "options.tiktok.commercialContent": "Commercial content (requires `ownBrand` and/or `thirdPartyBrand`).",
    "options.tiktok.ownBrand": "Promotes your own brand.", "options.tiktok.thirdPartyBrand": "Promotes a third-party brand (cannot be `SELF_ONLY` in `direct` mode).",
    "options.instagram": "Instagram options.", "options.instagram.shareToFeed": "Also show it in the feed.",
    tags: "Post tags (up to 40 characters each).",
    id: "An id you choose (3 to 64 characters among letters, digits, `-` and `_`). Without it, the server generates one. A repeated id returns 409 `id_exists`.",
    origin: "Who created the post (free text; default `api`).",
  },
  "posts.adopt": {
    title: "Post title.", network: "Network of the post. Currently only `instagram`.",
    scheduledFor: `Time the Reel goes out. ${ISO_EN} If it is in the past, the post is recorded as already sent.`,
    external: "Where the post is scheduled outside Praeko.", texts: "Texts.", "texts.instagram": "Reel caption.",
    text: "Caption, if you do not use `texts.instagram.text`.", media: "Media used only for display in the dashboard.",
    "media.cover": "Id of the cover media item (provides the thumbnail).", tags: "Tags (up to 40 characters each).",
    id: "Post id in Praeko (3 to 64 characters among letters, digits, `-` and `_`).",
  },
  "posts.update": {
    texts: "Per-network texts that change. The fields you send replace the current ones; the others stay. A `text` cannot be empty or contain a placeholder such as `[LINK_DO_LONGO]`.",
    "texts.youtube.title": "Title.", media: "Media replacement.", "media.cover": "Id of the new cover (or `null` to remove it).",
    "media.video": "Id of the new video (only for an adopted post or one still in draft; otherwise 409 `media_locked`).",
    tags: "Tags (replace the current ones).", items: "Items to edit, selected by `id` or by `network`. Only items that are still pending can be edited.",
    "items[].id": "Item id.", "items[].network": "Network of the item (alternative to `id`).",
    "items[].mode": "New mode (YouTube: private, scheduled, public; TikTok: draft, direct).",
    "items[].scheduledFor": `New fixed time. ${ISO_EN}`, "items[].queue": "Goes back to the channel's next free time slot.", "items[].draft": "Turns it into a draft.",
    "items[].privacy": "TikTok: who can view it.", "items[].coverFrameMs": "TikTok: cover frame in milliseconds.",
    "items[].videoTags": `${SO_YT} video tags (replace the current ones).`, "items[].categoryId": `${SO_YT} category number (e.g. \`28\`).`,
    moveTo: "Moves ALL editable items to drafts or to the queue.",
  },
  "posts.youtubeSchedule": { scheduledFor: `When the video becomes public. ${ISO_EN}` },
  "youtube.editVideo": {
    title: "New title (1 to 100 characters, without `<` or `>`).", description: "New description (up to 5000 characters; `\"\"` clears it).",
    tags: "New tags (up to 500 characters in total).", dryRun: "`true` only returns the before and after, without writing to YouTube.",
  },
  "instagram.hide": { hide: "`true` hides it; `false` shows it again." },
};
export const NOTAS_EN = {
  "webhooks.update": "Send only the fields you want to change; an empty `{}` body changes nothing.",
  "ideas.update": "Send only what changes; omitted fields stay as they are.",
  "notifications.read": "Send `ids` or `all: true`; a body with neither returns 422 `invalid_field`.",
  "preferences.put": "Strict: an unknown field or value returns 422 `invalid_field`. Partial: only what you send changes.",
  "channels.followers.put": "Only valid for `instagram` (on TikTok and YouTube followers already come from the API; the wrong network returns 409 `followers_from_api`).",
  "connections.instagramToken": "The token in the example is only a placeholder: use your own. The server verifies the token with Meta before storing it.",
  "posts.create": "The server returns 422 `invalid_request` with the full list of problems in `details.errors`. The media must be `ready` (completed). **Image post (`kind: image`):** a single photo on Instagram, through Buffer or directly through Meta. The photo is a `type: image` media item (JPEG); Instagram takes JPEG up to 8 MB with an aspect ratio from 4:5 to 1.91:1 (use 1080x1350). The item may come back with `warnings` (stable `code`): `alt_ignored` (Buffer has no alt text), `image_small`, `image_will_be_resized`, `image_dimensions_unknown`. The post comes back with `kind` and `media.images`. **Carousel (`kind: carousel`):** 2 to 20 slides, each a `type: image` media item with the same rules as the photo (warning messages start with `slide N:`); the list order is the slide order and the same media may repeat. Instagram crops every slide to the aspect ratio of the FIRST one: when another slide has a different ratio the item comes back with the `carousel_aspect_ratio_mismatch` warning (it does not refuse). Through Meta Praeko creates one container per slide, then the carousel, and publishes once (every slide and the carousel count against the ~400 containers per 24 h quota); a failure on slide N resumes without recreating the slides already created. Through Buffer the slides go as an ordered list of images, but that path was NOT tested live (Buffer documents no carousel example in its API): the item comes back with the `buffer_carousel_unverified` warning. Editing the caption of a scheduled carousel works; the images cannot be replaced by PATCH.",
  "posts.update": "Send only what changes. A post adopted from Buffer only accepts text, time and draft changes (anything else returns 409 `post_adopted`). **YouTube, already uploaded:** a YouTube item in the `scheduled` state (Praeko has already uploaded the video as private, with `publishAt` in the future) or `private` can change `scheduledFor` (it becomes `videos.update` with `status.publishAt`; the rest of the status is preserved), title, description (`texts.youtube`), `videoTags`, `categoryId` and the `pinnedComment` that has not been posted yet. Before acting, the server checks LIVE on YouTube (`videos.list`, 1 quota unit; each write costs 50). If the video was already published, the scheduled time has passed, the video was deleted or it was not uploaded by Praeko, nothing is written and the response is 409 with the reason and the Studio link (`https://studio.youtube.com/video/<id>/edit`). The new time must be at least 5 minutes from now (otherwise 422 `time_in_past`). Asking for the same time again does not call YouTube. A PATCH with several items applies each one independently and returns `itemResults` (one per already uploaded YouTube item: `applied`, `changed`, `fields`, `notApplied`, `reason`, `message`, `publishAt`, `studio`); if NONE of the requested items could change, the response is the 409 of the first one. Pending Instagram and TikTok items follow the usual rules.",
  "posts.youtubeSchedule": "Without `scheduledFor` the server returns 422 `missing_time`. The post must have a video already uploaded to YouTube (otherwise 404 `no_video`).",
  "youtube.editVideo": "At least one of `title`, `description` and `tags`. Start with `dryRun: true`.",
  "instagram.hide": "The body is optional: without it, the comment is hidden.",
};
/** Human-text defaults (not values) that need translating; every other `default` is kept as is. */
export const DEFAULTS_EN = { "posts.create": { "items[].mode": "private on YouTube, draft on TikTok, now on Instagram" } };

// ---------------------------------------------------------------------------------------------------------------- query string
export const CONSULTA_EN = {
  "connections.start": { replace: "`meta` only: `true` replaces the token of an existing connection.", add: "`meta` only: `true` connects ANOTHER account as a new channel.", probe: "`meta` only: `true` only reports, stores nothing." },
  "media.list": { type: "Filter by type." },
  "posts.list": { state: "Filter by state.", channel: "Channel id or network name.", tag: "Name of a tag.", offset: "How many to skip." },
  "posts.publishNow": { network: "Publish only the items of this network." },
  "calendar.get": { from: "Start of the period (ISO 8601).", to: "End of the period (ISO 8601)." },
  "insights.import": { network: "Limit to one network (`all` imports every network)." },
  "youtube.videos": { page: "Next page token (the `next` value of the previous response)." },
  "youtube.comments": { video: "Only the threads of this video.", unanswered: "`true` shows only what still needs a reply.", sort: "Sort order.", max: "Items per page (up to 100)." },
  "comments.list": { network: "Limit to one network (`all` combines every network)." },
  "notifications.list": { unread: "`true` returns only unread notifications.", limit: "Items per page (1 to 50)." },
  "usage.log": { key: "Id of a key or `session` (the dashboard).", status: "`2xx`, `3xx`, `4xx`, `5xx` or a code.", route: "Part of the route.", method: "HTTP method." },
  "webhooks.deliveries": { limit: "How many deliveries (1 to 100)." },
};

// ---------------------------------------------------------------------------------------------------------------- request headers
export const CABECALHOS_EN = {
  "Idempotency-Key": "Idempotency key (1 to 255 visible characters, for example a UUID). Repeating the SAME request with the same key within 24 h returns the stored response (with `Idempotent-Replayed: true`) without running it again; a different request with the same key returns 422 `idempotency_key_reuse`; a request still in progress returns 409 `idempotency_in_progress`. 5xx errors are not stored. The key is scoped per workspace and per route. See docs/idempotencia.md.",
};

// ---------------------------------------------------------------------------------------------------------------- responses: notes and success statuses
export const RESPOSTA_NOTAS_EN = {
  "media.create": "With `simple: true` the response is just `id`, `state` and `uploadHint`. Without it (upload in parts) it also includes `minPartSize` (5242880), `maxPartSize` (99614720) and `suggestedPartSize` (16777216), in bytes, and `uploadHint` points to `PUT /v1/media/:id/parts/<n>`.",
  "connections.callback": "A short HTML page (\"Done\", \"Authorization denied\", \"Link expired\"…) for the browser of whoever authorized. It is not JSON: the result also shows up in `GET /v1/channels`.",
  "connections.start": "The shape of the response changes by network and option (`meta` with `probe=true` only reports, without storing anything); `url` is what you open in the browser.",
  "channels.list": "One item per connected account (several accounts on a network = several items) and a \"not connected\" item for each network without an account.",
  "channels.avatar": "The avatar image (`image/png` or `image/jpeg`), with `Cache-Control: private, max-age=21600`. 404 `no_avatar` when the channel has no picture.",
  "tiktok.creator": "Until the app passes TikTok's audit, `allowedPrivacyLevels` only contains `SELF_ONLY`. The response is cached for 60 s.",
  "channels.followers.get": "Up to 60 daily records, oldest first.",
  "media.list": "The latest 100, newest first.",
  "media.get": "While `state` is `uploading`, the response includes `parts` (`[{ n, size }]`, the parts received so far). Once it is `ready`, `publicUrl` is included; videos also include `durationMs`, `width` and `height` when the container provides them.",
  "media.part": "Send the same part again to replace it.",
  "media.content.put": "Upload in a single request, for media created with `simple: true`. Returns the media item already `ready`.",
  "media.content.get": "The bytes of the file, with `Content-Type`, `Content-Length` and `Accept-Ranges: bytes`. A `Range` outside the file returns 416.",
  "media.content.head": "The same headers as GET (`Content-Type`, `Content-Length`, `Accept-Ranges`), without a body.",
  "media.public": "The bytes of the file with `Cache-Control: public, max-age=3600` and `X-Robots-Tag: noindex, nofollow`. Wrong token or nonexistent media: plain-text 404; `Range` outside the file: 416.",
  "media.public#HEAD": "The same headers as GET, without a body.",
  "media.complete": "Joins the parts in order. The media item comes back `ready`.",
  "posts.list": "Each post comes without `actions` (they only appear in `GET /v1/posts/:id`). Filters: `state`, `channel`, `tag`.",
  "posts.adopt": "Returns the adopted post, in the same format as `GET /v1/posts/:id`. The item is marked with `adopted: true`.",
  "posts.cancel": "`canceled` lists the ids of the canceled items; `kept` lists the items that could not be canceled (already sent or in progress), in the same format as the post's items.",
  "posts.publishNow": "Returns the post with the item already out of the queue (`runAt` is now); publishing happens right after. Use `?network=` to release just one item.",
  "posts.itemComment": "If the comment had already been posted, the response is `{ alreadyDone: true, result: … }` with the stored result.",
  "calendar.get": "`freeSlots` are each channel's weekly time slots that are still free in the period.",
  "insights.get": "`null` numbers mean \"the network does not report it\" (never zero). Filters: `from`, `to`, `channel`, `network`, `type`, `tag`, `sort`, `page`, `limit`.",
  "insights.retention": "A number the network has not delivered yet comes as `null`, never 0. `retention.state`: `ready`, `pending`, `reauthorize`, `unavailable` or `error`.",
  "insights.retention.item": "`curve` has up to 100 points: `position` from 0 to 1 along the video, `watched` (above 1 when viewers rewatch) and `relative` (0.5 = median of videos of similar length).",
  "insights.import": "One item per imported network. With `dryRun` (the response says `simulated: true`) nothing is stored.",
  "content.list": "Everything already published, newest first: what Praeko published (`origin: \"praeko\"`) and what was imported (`external`).",
  "youtube.videos": "`next` is the next page token (send it in `page`); `null` on the last page. `duration` is the duration in ISO 8601 (`PT58S`).",
  "comments.list": "Gathers the comments of every account on each network. `errors` tells, per network, which account did not respond (the others come back normally).",
  "apiKeys.list": "Never includes the key's secret: only the `prefix`.",
  "usage.get": "Days in UTC; `byDay` has one item per day of the period, including days without requests.",
  "usage.log": "Metadata only (method, route without ids, status, duration, key); never body, headers or IP. Kept for 30 days. Pass `next` as `cursor` to get the next page; `null` on the last page.",
  "webhooks.test": "Even if the URL refuses it, the response is 200 and `delivery.state` tells the result (`delivered`, `pending` with `nextAttemptAt`, `failed`).",
  "webhooks.redeliver": "Resends with the same `Praeko-Delivery`, so the receiver can recognize the repetition.",
};
/** English-only facts appended to a response note: free text the server writes in Portuguese (the example shows it translated). */
const emPt = (campos) => `${campos} ${campos.includes(",") || campos.includes(" and ") ? "are" : "is"} free text the server writes in Portuguese; the example shows it in English.`;
export const RESPOSTA_EXTRA_EN = {
  "webhooks.create": emPt("`warning`"), "webhooks.rotateSecret": emPt("`warning`"), "apiKeys.create": emPt("`warning`"), "connections.start": emPt("`warning`"),
  "channels.list": emPt("`detail`"), "posts.itemComment": emPt("`result.reminder`"), "mentions.list": emPt("`reason`"),
  "insights.get": emPt("`summary` and `reading48hText`"), "insights.retention": emPt("`channels[].message`"), "insights.retention.item": emPt("`channels[].message`"),
  "notifications.list": emPt("`data.error`"),
};
export const SUCESSOS_EN = {
  "media.content.get": { 206: "A chunk, when the request has `Range: bytes=…` (the response includes `Content-Range`)." },
  "media.public": { 206: "A chunk, when the request has `Range: bytes=…`." },
};

// ---------------------------------------------------------------------------------------------------------------- errors per route
export const ERROS_EN = {
  "webhooks.create": { invalid_field: "`url` missing or `events` empty/unknown.", unsafe_url: "The url is not https, or points to a private network or localhost.", webhook_limit_reached: "This workspace already has 10 webhooks." },
  "webhooks.update": { webhook_not_found: "The webhook does not exist in this workspace.", invalid_field: "`events` empty or with an unknown event.", unsafe_url: "The new url is not accepted." },
  "ideas.create": { invalid_field: "`title` missing or too long, unknown `group`, or `tags` over the limit.", idea_limit_reached: "This workspace already has 2000 ideas." },
  "ideas.import": { invalid_field: "`ideas` is not a list or has more than 500 items.", idea_limit_reached: "It would exceed 2000 ideas in this workspace." },
  "ideas.update": { invalid_field: "A field is over its limit." },
  "apiKeys.create": { invalid_field: "`name` missing, unknown `scope`, or `expiresInDays` outside 1 to 365." },
  "notifications.list": { invalid_field: "`limit` outside 1 to 50, `unread` that is not true/false, or an invalid `cursor`." },
  "notifications.read": { invalid_field: "Neither `ids` nor `all: true`, `ids` with more than 100 items, or an unknown field." },
  "preferences.put": { invalid_field: "Unknown field, event, channel or value." },
  "media.create": { invalid_field: "Invalid `type`, `mime`, `name` or `size`.", file_too_large: "`simple: true` with more than 50 MB.", invalid_image: "An `image` media item whose file is not a JPEG (checked on upload; for uploads in parts, on complete)." },
  "channels.slots.put": { invalid_field: "Invalid time or day, more than 100 time slots, or unknown time zone.", channel_not_found: "The network is not connected.", unknown_network: "Unknown network." },
  "channels.followers.put": { followers_from_api: "The network already provides followers through its API (only `instagram` accepts a manual value).", invalid_field: "Invalid `value` or `day`.", channel_not_found: "Channel not connected." },
  "connections.instagramToken": { invalid_field: "Invalid token, `userId` or `host`.", instagram_error: "Meta rejected the token." },
  "posts.create": {
    invalid_request: "Something is missing; the full list comes in `details.errors`.", invalid_field: "Invalid id, channel, mode or tag.",
    time_in_past: "The time has already passed or is too close.", missing_schedule: "Missing `scheduledFor`, `queue` or `draft`.",
    channel_not_connected: "The network is not connected.", no_slots: "`queue` on a channel without time slots.", id_exists: "A post with this `id` already exists.",
    media_not_ready: "The media upload has not been completed yet.", media_not_found: "The media item does not exist.",
    media_type_mismatch: "The media item has the wrong type (`kind: image` needs `type: image`).", kind_not_supported_by_network: "`kind: image` or `carousel` on a YouTube or TikTok item.", carousel_too_many_images: "More than 20 items in `media.images`.", carousel_too_few_images: "`kind: carousel` with fewer than 2 items in `media.images` (use `kind: image` for one photo).",
    invalid_image: "The image is not a JPEG (Instagram only takes JPEG).", image_too_large: "The image is over 8 MB (Instagram limit).", image_aspect_ratio: "The image aspect ratio is outside 4:5 to 1.91:1 (Instagram would refuse it; use 1080x1350).",
  },
  "posts.adopt": { invalid_field: "Invalid `external`, `scheduledFor` or `id`.", already_adopted: "This Buffer post is already in Praeko.", id_exists: "A post with this `id` already exists.", channel_not_connected: "Instagram is not connected." },
  "posts.update": {
    item_not_found: "The item does not exist in this post.",
    not_editable: "The item has already gone out or is in progress (YouTube, already uploaded: it can only change while the video is still private and scheduled; once the scheduled time has passed, it can no longer change).",
    post_adopted: "Post adopted from Buffer: only text, time and draft can change.", media_locked: "The video can only be replaced in an adopted post or in a draft; the image of an image post cannot be replaced by PATCH.",
    video_not_private: "YouTube, already uploaded: the video is already public on YouTube, so its time and metadata can only change in Studio (`details.studio` has the link).",
    video_not_found: "YouTube, already uploaded: the video was deleted on YouTube.", time_in_past: "The new time must be at least 5 minutes from now.",
    youtube_error: "YouTube did not respond or rejected the check/write; nothing was changed (or `itemResults` says what was).", invalid_field: "A field is invalid.",
  },
  "posts.youtubeSchedule": { missing_time: "Missing `scheduledFor`.", no_video: "The post has no video on YouTube yet." },
  "youtube.editVideo": { invalid_field: "Title, description or tags over the limit.", youtube_not_connected: "YouTube is not connected." },
  "youtube.reply": { invalid_field: "`text` missing or longer than 10000 characters." },
  "instagram.reply": { invalid_field: "`text` missing or longer than 2200 characters." },
  "webhooks.deliveries": { invalid_field: "`limit` outside 1 to 100." },
  "webhooks.redeliver": { delivery_not_found: "The delivery does not exist." },
  "apiKeys.revoke": { api_key_not_found: "The key does not exist.", api_key_in_use: "It is the key making this call." },
  "media.delete": { media_in_use: "A pending post uses this media item." },
  "media.complete": { parts_missing: "A part of the sequence is missing.", size_mismatch: "The total uploaded does not match the declared `size`.", part_too_small: "A part (other than the last) is smaller than 5 MiB." },
};
/** Errors any authenticated route can return, in English. */
export const ERROS_COMUNS_EN = ERROS_COMUNS.map(([s, c, t]) => [s, c, COMUM_EN[t] ?? t]);

// ---------------------------------------------------------------------------------------------------------------- examples
/** Portuguese sample strings in the examples -> English (exact match, applied to every string value, never to keys). */
export const EXEMPLOS_EN = {
  "O teste que só falhava na segunda": "The test that only failed on Mondays",
  "O teste que só falhava na segunda (versão final)": "The test that only failed on Mondays (final cut)",
  "O teste que só falhava na segunda. #programação": "The test that only failed on Mondays. #programming",
  "O teste que só falhava na segunda me lembrou do meu último deploy.": "The test that only failed on Mondays reminded me of my last deploy.",
  "Um teste que passava de terça a domingo. O que ele escondia.\n\n#programação #testes": "A test that passed from Tuesday to Sunday. What it was hiding.\n\n#programming #testing",
  "Um teste que passava de terça a domingo.": "A test that passed from Tuesday to Sunday.",
  "O teste que falhava": "The failing test", "Reel de segunda: o teste que falhava": "Monday Reel: the failing test",
  "dia-06-o-teste-que-falhava.mp4": "day-06-the-failing-test.mp4", "capa.png": "cover.png",
  "programação": "programming", testes: "testing", bastidores: "behind-the-scenes", "serie-bugs": "bug-series", painel: "dashboard",
  "O bug que só aparecia na segunda-feira": "The bug that only showed up on Mondays",
  "Gravar o passo a passo do teste que falhava de segunda.": "Record a walkthrough of the test that failed on Mondays.",
  "Como o painel guarda as ideias": "How the dashboard stores ideas", "Roteiro: 364 mil requisições para 42 heróis": "Script: 364 thousand requests for 42 heroes",
  "Mostrar o gráfico do log.": "Show the log chart.", "automação do roteiro": "script automation",
  "Valeu por assistir! O código do teste está na descrição.": "Thanks for watching! The test code is in the description.",
  "Obrigado! Foi uma segunda-feira difícil mesmo.": "Thanks! It really was a rough Monday.",
  "Zika demais, qual banco você usa?": "This is awesome, which database do you use?", "Valeu! É o D1 da Cloudflare.": "Thanks! It's Cloudflare D1.",
  "Muito bom, qual editor você usa?": "Great video, which editor do you use?", "olha o @dev.ocioso": "check out @dev.ocioso", fulano: "jane.doe",
  "Canal do Marcone": "Marcone's Channel", "via API da Meta": "via the Meta API",
  "não conectado (faltam os secrets TIKTOK_CLIENT_KEY e TIKTOK_CLIENT_SECRET)": "not connected (the TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET secrets are missing)",
  "abra a url no navegador, autorize e volte; o retorno cai neste serviço": "open the url in a browser, authorize and come back; the callback lands on this service",
  "guarde este segredo agora: ele não aparece de novo": "store this secret now: it will not be shown again",
  "guarde esta chave agora: ela não aparece de novo": "store this key now: it will not be shown again",
  "a API não fixa comentário: fixe pelo app": "the API cannot pin comments: pin it in the app",
  "o YouTube recusou o vídeo (quota diária excedida)": "YouTube rejected the video (daily quota exceeded)",
  "Retenção por vídeo, impressões e CTR, pela API do YouTube Analytics.": "Per-video retention, impressions and CTR, through the YouTube Analytics API.",
  "Os Shorts técnicos lideram": "Technical Shorts are in the lead", "Os posts com bastidores de código tiveram o dobro das visualizações dos outros.": "Behind-the-code posts got twice as many views as the others.",
  "| Data | Rede | Post | Views | Curtidas | Comentários | Seguidores | Fonte |\n|---|---|---|---|---|---|---|---|": "| Date | Network | Post | Views | Likes | Comments | Followers | Source |\n|---|---|---|---|---|---|---|---|",
  "YouTube: a API de dados (v3) não tem endpoint de menções. Instagram: esta lista mostra as publicações em que o seu perfil foi marcado.": "YouTube: the Data API (v3) has no mentions endpoint. Instagram: this list shows the posts your profile was tagged in.",
};
/** Substrings replaced inside any example string (domains). */
const TROCAS_EN = [["exemplo.com.br", "example.com"], ["cdn.exemplo.com", "cdn.example.com"]];
/** Raw API values that look Portuguese but are returned as is by the server (never translated). */
const VALORES_CRUS = new Set(["imagem", "carrossel", "pt-BR"]);
const traduzTexto = (s) => { let t = Object.hasOwn(EXEMPLOS_EN, s) ? EXEMPLOS_EN[s] : s; for (const [de, para] of TROCAS_EN) t = t.split(de).join(para); return t; };
/** Deep copy of an example with its Portuguese sample strings in English (keys, ids and `{{em3dias}}` untouched). */
export function exemploEn(v) {
  if (Array.isArray(v)) return v.map(exemploEn);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, exemploEn(x)]));
  return typeof v === "string" ? traduzTexto(v) : v;
}

// ---------------------------------------------------------------------------------------------------------------- assembling docEn
const copia = (v) => (v === undefined ? v : structuredClone(v));
const de = (mapa, k, sub, pt) => mapa[k]?.[sub] ?? COMUM_EN[pt];
/** Key under which contract-docs stores the response of a route (`key#METHOD` when that method has its own entry, like HEAD). */
function chaveResposta(r) {
  const propria = docDe(r).resposta, base = docDe({ ...r, method: "__base__" }).resposta;
  return propria && propria !== base ? `${r.key}#${r.method}` : r.key;
}
function camposEn(key, fields, prefixo = "") {
  return fields.map((c) => {
    const caminho = prefixo + c.name, out = copia(c);
    out.desc = de(CAMPOS_EN, key, caminho, c.desc) ?? c.desc;
    if (DEFAULTS_EN[key]?.[caminho] !== undefined) out.default = DEFAULTS_EN[key][caminho];
    if (c.fields) out.fields = camposEn(key, c.fields, caminho + (c.type === "array" ? "[]." : "."));
    return out;
  });
}
const juntar = (...partes) => partes.filter(Boolean).join(" ") || undefined;
/** Same as docDe(r), with every human text in English and the examples translated (deep copies; the PT data is never mutated). */
export function docEn(r) {
  const d = docDe(r), k = r.key;
  const corpo = d.corpo && (() => {
    const out = copia(d.corpo);
    out.fields = camposEn(k, d.corpo.fields);
    if (d.corpo.example !== undefined) out.example = exemploEn(d.corpo.example);
    if (d.corpo.nota !== undefined) out.nota = NOTAS_EN[k] ?? d.corpo.nota;
    return out;
  })();
  const consulta = d.consulta.map((c) => ({ ...copia(c), desc: de(CONSULTA_EN, k, c.name, c.desc) ?? c.desc }));
  const cabecalhos = d.cabecalhos.map((c) => ({ ...copia(c), desc: CABECALHOS_EN[c.name] ?? c.desc }));
  const resposta = d.resposta && (() => {
    const rk = chaveResposta(r), out = copia(d.resposta);
    if (out.exemplo !== undefined) out.exemplo = exemploEn(d.resposta.exemplo);
    const nota = juntar(d.resposta.nota !== undefined ? RESPOSTA_NOTAS_EN[rk] ?? d.resposta.nota : undefined, RESPOSTA_EXTRA_EN[rk]);
    if (nota !== undefined) out.nota = nota;
    if (out.sucessos) out.sucessos = d.resposta.sucessos.map(([s, t]) => [s, de(SUCESSOS_EN, rk, s, t) ?? t]);
    return out;
  })();
  const erros = d.erros.map(([s, c, t]) => [s, c, de(ERROS_EN, k, c, t) ?? t]);
  return { corpo, consulta, cabecalhos, resposta, erros };
}
/** Success statuses of a route, `[[status, when]]`, main one first (like statusDe). */
export function statusDeEn(r) {
  const { resposta } = docEn(r);
  if (!resposta) return [];
  const lista = resposta.sucessos || [[resposta.status, "Success."]];
  return [...lista].sort((a, b) => (a[0] === resposta.status ? -1 : b[0] === resposta.status ? 1 : a[0] - b[0]));
}
/** Limits and values of a body field, as short English phrases (mirrors restricoesDe). */
export function restricoesEn(c) {
  const l = [];
  if (c.enum) l.push(`values: ${c.enum.join(", ")}`);
  if (c.default !== undefined) l.push(`default: ${Array.isArray(c.default) ? c.default.join(", ") : String(c.default)}`);
  if (c.minLength !== undefined || c.maxLength !== undefined) l.push(c.minLength !== undefined && c.maxLength !== undefined ? `${c.minLength} to ${c.maxLength} characters` : c.maxLength !== undefined ? `up to ${c.maxLength} characters` : `at least ${c.minLength} character${c.minLength === 1 ? "" : "s"}`);
  if (c.min !== undefined || c.max !== undefined) l.push(c.min !== undefined && c.max !== undefined ? `${c.min} to ${c.max}` : c.min !== undefined ? `minimum ${c.min}` : `maximum ${c.max}`);
  if (c.maxItems !== undefined) l.push(`up to ${c.maxItems} items`);
  if (c.maxItemLength !== undefined) l.push(`each up to ${c.maxItemLength} characters`);
  return l;
}
const TIPOS_EN = { string: "string", integer: "integer", number: "number", boolean: "boolean", object: "object" };
/** The type of a field in English ("string", "integer", "string[]", "object[]", "(string | object)[]"…). */
export function tipoTextoEn(c) {
  if (c.type === "array") { const it = c.items || "string"; return it.includes("|") ? `(${it.split("|").join(" | ")})[]` : `${TIPOS_EN[it] || it}[]`; }
  return TIPOS_EN[c.type] || c.type;
}

// ---------------------------------------------------------------------------------------------------------------- completeness check
const PT_PALAVRAS = /\b(o|os|de|que|não|para|com|uma|um|em|é|da|dos|das|na|ao|ou|já|só|até|também|está|são)\b/iu;
const PT_LETRAS = /[ãõçáéíóúâêôà]/iu;
/** Does a sample string look Portuguese? (used on the examples after translation) */
const pareceTextoPt = (s) => !VALORES_CRUS.has(s) && !/^https?:\/\//.test(s) && (PT_LETRAS.test(s) || (/\s/.test(s) && PT_PALAVRAS.test(s)));
const folhas = (v, out = []) => { if (Array.isArray(v)) v.forEach((x) => folhas(x, out)); else if (v && typeof v === "object") Object.values(v).forEach((x) => folhas(x, out)); else if (typeof v === "string") out.push(v); return out; };

/**
 * Every PT text without an English version (`route: what`) and every English entry with no PT counterpart (`orphan: …`).
 * Empty means the English layer is complete and in sync with contract-docs.mjs.
 */
export function faltandoEn(routes) {
  const falta = [], usados = { comum: new Set(), exemplos: new Set() }, vistos = {};
  const marca = (mapa, k, sub) => ((vistos[mapa] ||= new Set()).add(sub === undefined ? k : `${k}\u0000${sub}`));
  const precisa = (onde, mapa, nomeMapa, k, sub, pt) => {
    if (mapa[k]?.[sub] !== undefined) return marca(nomeMapa, k, sub);
    if (COMUM_EN[pt] !== undefined) return usados.comum.add(pt);
    falta.push(`${k}: ${onde}`);
  };
  const exemplosPt = new Set();
  for (const r of routes) {
    const k = r.key, d = docDe(r);
    if (TITULOS[k] !== undefined && TITULOS_EN[k] === undefined) falta.push(`${k}: title`);
    const kr = RESUMOS[`${k}#${r.method}`] !== undefined ? `${k}#${r.method}` : RESUMOS[k] !== undefined ? k : null;
    if (kr && RESUMOS_EN[kr] === undefined) falta.push(`${kr}: summary`);
    const g = k.split(".")[0];
    if (GRUPOS[g] !== undefined && GRUPOS_EN[g] === undefined) falta.push(`${k}: group ${g}`);
    for (const m of r.path.matchAll(/:([A-Za-z_]+)/g)) {
      const nome = m[1];
      if (nome === "id" ? !ID_EN[idKey(r)] : !PARAMS_EN[nome]) falta.push(`${k}: path param ${nome}`);
      if (nome === "id") marca("ID_EN", idKey(r)); else marca("PARAMS_EN", nome);
    }
    if (d.corpo) {
      for (const c of achatar(d.corpo.fields)) {
        precisa(`body field ${c.caminho}`, CAMPOS_EN, "CAMPOS_EN", k, c.caminho, c.desc);
        if (typeof c.default === "string" && /\s/.test(c.default) && !(c.enum || []).includes(c.default)) {
          if (DEFAULTS_EN[k]?.[c.caminho] === undefined) falta.push(`${k}: default of ${c.caminho}`); else marca("DEFAULTS_EN", k, c.caminho);
        }
      }
      if (d.corpo.nota !== undefined) { if (NOTAS_EN[k] === undefined) falta.push(`${k}: body note`); else marca("NOTAS_EN", k); }
      folhas(d.corpo.example).forEach((s) => exemplosPt.add(s));
      for (const s of folhas(exemploEn(d.corpo.example))) if (pareceTextoPt(s)) falta.push(`${k}: body example string ${JSON.stringify(s)}`);
    }
    for (const c of d.consulta) precisa(`query ${c.name}`, CONSULTA_EN, "CONSULTA_EN", k, c.name, c.desc);
    for (const c of d.cabecalhos) { if (CABECALHOS_EN[c.name] === undefined) falta.push(`${k}: header ${c.name}`); else marca("CABECALHOS_EN", c.name); }
    if (d.resposta) {
      const rk = chaveResposta(r);
      if (d.resposta.nota !== undefined) { if (RESPOSTA_NOTAS_EN[rk] === undefined) falta.push(`${rk}: response note`); else marca("RESPOSTA_NOTAS_EN", rk); }
      if (RESPOSTA_EXTRA_EN[rk] !== undefined) marca("RESPOSTA_EXTRA_EN", rk);
      for (const [s, t] of d.resposta.sucessos || []) precisa(`success ${s}`, SUCESSOS_EN, "SUCESSOS_EN", rk, s, t);
      folhas(d.resposta.exemplo).forEach((s) => exemplosPt.add(s));
      for (const s of folhas(exemploEn(d.resposta.exemplo))) if (pareceTextoPt(s)) falta.push(`${rk}: response example string ${JSON.stringify(s)}`);
    }
    for (const [, c, t] of d.erros) precisa(`error ${c}`, ERROS_EN, "ERROS_EN", k, c, t);
  }
  for (const [, , t] of ERROS_COMUNS) { if (COMUM_EN[t] === undefined) falta.push(`common error: ${t}`); else usados.comum.add(t); }
  // orphans: English entries whose PT counterpart is gone
  const orfao = (nome, chaves) => { for (const ch of chaves) if (!vistos[nome]?.has(ch)) falta.push(`orphan: ${nome} ${ch.replace("\u0000", " ")}`); };
  const porRota = (mapa) => Object.entries(mapa).flatMap(([k, v]) => Object.keys(v).map((s) => `${k}\u0000${s}`));
  orfao("CAMPOS_EN", porRota(CAMPOS_EN)); orfao("CONSULTA_EN", porRota(CONSULTA_EN)); orfao("SUCESSOS_EN", porRota(SUCESSOS_EN)); orfao("ERROS_EN", porRota(ERROS_EN)); orfao("DEFAULTS_EN", porRota(DEFAULTS_EN));
  orfao("NOTAS_EN", Object.keys(NOTAS_EN)); orfao("RESPOSTA_NOTAS_EN", Object.keys(RESPOSTA_NOTAS_EN)); orfao("RESPOSTA_EXTRA_EN", Object.keys(RESPOSTA_EXTRA_EN));
  orfao("CABECALHOS_EN", Object.keys(CABECALHOS_EN)); orfao("PARAMS_EN", Object.keys(PARAMS_EN).filter((n) => n !== "*" && n !== "id")); orfao("ID_EN", Object.keys(ID_EN));
  for (const k of Object.keys(TITULOS_EN)) if (TITULOS[k] === undefined) falta.push(`orphan: TITULOS_EN ${k}`);
  for (const k of Object.keys(RESUMOS_EN)) if (RESUMOS[k] === undefined) falta.push(`orphan: RESUMOS_EN ${k}`);
  for (const g of Object.keys(GRUPOS_EN)) if (GRUPOS[g] === undefined) falta.push(`orphan: GRUPOS_EN ${g}`);
  for (const t of Object.keys(COMUM_EN)) if (!usados.comum.has(t)) falta.push(`orphan: COMUM_EN ${JSON.stringify(t)}`);
  for (const s of Object.keys(EXEMPLOS_EN)) if (!exemplosPt.has(s)) falta.push(`orphan: EXEMPLOS_EN ${JSON.stringify(s)}`);
  return falta;
}

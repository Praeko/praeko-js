// @praeko/sdk: client for the Praeko service (until 2026-11 it was called Arauto: `Arauto`/`ArautoError`/`ErroArauto` remain as deprecated aliases). The public contract is in ENGLISH (docs/api-contract.md); the old Portuguese methods and
// fields stay available as deprecated aliases (see legacy.mjs), served by the legacy routes of the server.
//   const praeko = new Praeko({ url: "https://praeko.example.com", key: "praeko_…" });
//   const video = await praeko.media.upload(source, { type: "video", name: "v.mp4", mime: "video/mp4" });   // source: Uint8Array | Blob | { size, read(start, n) }
//   const post = await praeko.posts.create({ title, media: { video: video.id }, texts, items: [{ network: "youtube", queue: true }] });
// Errors become PraekoError (status, code, message, details). GET and part uploads retry on network failure, 429 and 5xx. A mutating call (POST/PATCH/DELETE) retries too, but ONLY when it carries an `idempotencyKey`
// (the server then replays the first response instead of repeating the work; docs/idempotencia.md); without one it never retries.
import { addLegacy } from "./legacy.mjs";

export class PraekoError extends Error {
  constructor(status, code, message, details) { super(message); this.name = "PraekoError"; this.status = status; this.code = code; this.details = details; }
  /** @deprecated use `code` */ get codigo() { return this.code; }
  /** @deprecated use `details` */ get detalhes() { return this.details; }
  /** @deprecated use `message` */ get mensagem() { return this.message; }
}
/** @deprecated use PraekoError */
export const ErroArauto = PraekoError;
/** @deprecated use PraekoError */
export const ArautoError = PraekoError;

export const SIMPLE_MAX = 32 * 1024 * 1024; // up to here, one PUT; above, parts
export const DEFAULT_PART = 16 * 1024 * 1024;
/** @deprecated */ export const ATALHO_MAX = SIMPLE_MAX;
/** @deprecated */ export const PARTE_PADRAO = DEFAULT_PART;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Turns a Uint8Array, ArrayBuffer or Blob into a source { size, read(start, n) }. Sources in the old shape ({ tamanho, ler }) still work. */
export function asSource(x) {
  if (x && typeof x.read === "function" && typeof x.size === "number") return x;
  if (x && typeof x.ler === "function" && typeof x.tamanho === "number") return { size: x.tamanho, read: (i, n) => x.ler(i, n) };
  if (typeof Blob !== "undefined" && x instanceof Blob) return { size: x.size, read: async (i, n) => new Uint8Array(await x.slice(i, i + n).arrayBuffer()) };
  const u8 = x instanceof Uint8Array ? x : x instanceof ArrayBuffer ? new Uint8Array(x) : null;
  if (!u8) throw new TypeError("invalid source: use Uint8Array, ArrayBuffer, Blob or { size, read(start, n) }");
  return { size: u8.length, read: async (i, n) => u8.subarray(i, i + n) };
}
/** @deprecated use asSource */
export function comoFonte(x) { const s = asSource(x); return { ...s, tamanho: s.size, ler: s.read }; }

const ref = (id) => encodeURIComponent(id);
/** Per-call option `{ idempotencyKey }` -> `_req` options. A string is sent as the `Idempotency-Key` header; `true` makes the SDK generate a UUID once per call (the same key is reused by every retry of that call). */
const idem = (o) => (o && o.idempotencyKey ? { idempotencyKey: o.idempotencyKey } : {});
const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);

export class Praeko {
  // `cookies: true` (browser, same origin): no key; the panel session cookie authenticates.
  /** @param {{ url: string, key?: string, cookies?: boolean, chave?: string, fetch?: typeof fetch, retries?: number, wait?: (ms:number)=>Promise<void> }} o  (`chave`, `tentativas`, `espera`: deprecated names) */
  constructor(o = {}) {
    const { url, key = o.chave, cookies = false, fetch: f = globalThis.fetch, retries = o.tentativas ?? 3, wait = o.espera ?? sleep } = o;
    if (!url) throw new Error("Praeko: missing service url (falta a url do serviço)");
    if (!key && !cookies) throw new Error("Praeko: missing API key praeko_… (falta a chave)");
    this.url = String(url).replace(/\/+$/, ""); this._key = key; this._cookies = !key && cookies; this._fetch = f; this._retries = retries; this._wait = wait;
    const a = this;
    this.media = {
      create: (meta, o) => a._req("POST", "/v1/media", { body: meta, ...idem(o) }),
      uploadPart: (id, n, bytes) => a._req("PUT", `/v1/media/${ref(id)}/parts/${n}`, { bytes, retry: true }),
      uploadContent: (id, bytes) => a._req("PUT", `/v1/media/${ref(id)}/content`, { bytes, retry: true }),
      complete: (id, o) => a._req("POST", `/v1/media/${ref(id)}/complete`, idem(o)),
      get: (id) => a._req("GET", `/v1/media/${ref(id)}`),
      list: (type) => a._req("GET", "/v1/media", { query: { type } }),
      remove: (id) => a._req("DELETE", `/v1/media/${ref(id)}`),
      /** Uploads a whole file (one PUT or parts, depending on size). Returns the ready media { id, … }. */
      upload: async (source, { type, name, mime, part = DEFAULT_PART, onProgress } = {}) => {
        const f2 = asSource(source);
        if (!type || !name || !mime) throw new Error("media.upload: provide type, name and mime");
        if (f2.size <= SIMPLE_MAX) {
          const m = await a.media.create({ type, name, mime, size: f2.size, simple: true });
          const r = await a.media.uploadContent(m.id, await f2.read(0, f2.size)); onProgress?.(f2.size, f2.size); return r;
        }
        const m = await a.media.create({ type, name, mime, size: f2.size });
        const size = Math.max(m.minPartSize || 0, Math.min(part, m.maxPartSize || part));
        for (let n = 1, pos = 0; pos < f2.size; n++, pos += size) {
          await a.media.uploadPart(m.id, n, await f2.read(pos, size));
          onProgress?.(Math.min(pos + size, f2.size), f2.size);
        }
        return a.media.complete(m.id);
      },
    };
    this.posts = {
      /** `o.idempotencyKey`: a string (or `true` for a fresh UUID) makes the call safe to retry: the server replays the first response instead of creating a second post (see docs/idempotencia.md). */
      create: (request, o) => a._req("POST", "/v1/posts", { body: request, ...idem(o) }),
      list: (filters = {}) => a._req("GET", "/v1/posts", { query: filters }),
      get: (id) => a._req("GET", `/v1/posts/${ref(id)}`),
      /** Registers a Reel already scheduled in Buffer ({ id, title, network: "instagram", scheduledFor, external: { provider: "buffer", id } }); does not call Buffer. */
      adopt: (body, o) => a._req("POST", "/v1/posts/adopt", { body, ...idem(o) }),
      scheduleYoutube: (id, scheduledFor, o) => a._req("POST", `/v1/posts/${ref(id)}/youtube/schedule`, { body: { scheduledFor }, ...idem(o) }),
      update: (id, changes, o) => a._req("PATCH", `/v1/posts/${ref(id)}`, { body: changes, ...idem(o) }),
      publishNow: (id, { network, idempotencyKey } = {}) => a._req("POST", `/v1/posts/${ref(id)}/publish-now`, { query: { network }, ...idem({ idempotencyKey }) }),
      cancel: (id, o) => a._req("DELETE", `/v1/posts/${ref(id)}`, idem(o)),
      comment: (id, itemId) => a._req("POST", `/v1/posts/${ref(id)}/items/${ref(itemId)}/comment`),
    };
    this.channels = {
      list: ({ verify } = {}) => a._req("GET", "/v1/channels", { query: { verify: verify ? 1 : undefined } }),
      /** `channel`: id of one account when the network has several (GET /v1/channels lists them); without it the default channel. */
      slots: (network, { channel } = {}) => a._req("GET", `/v1/channels/${network}/slots`, { query: { channel } }),
      setSlots: (network, slots, { timezone, channel } = {}) => a._req("PUT", `/v1/channels/${network}/slots`, { query: { channel }, body: { slots, ...(timezone ? { timezone } : {}) } }),
      /** Manual follower count (Instagram only; TikTok comes from the API): PUT { value, day? }; the latest records: GET. */
      setFollowers: (network, value, { day, channel } = {}) => a._req("PUT", `/v1/channels/${network}/followers`, { query: { channel }, body: { value, ...(day ? { day } : {}) } }),
      followers: (network, { channel } = {}) => a._req("GET", `/v1/channels/${network}/followers`, { query: { channel } }),
      /** `network`: youtube | tiktok | meta (Instagram login). For `meta`, `replace: true` is REQUIRED to replace an existing connection; `instagram` picks the account by username when the login reaches several. */
      connect: (network, { replace, add, instagram, instagramId, probe } = {}) => a._req("GET", `/v1/connections/${network}/start`, { query: { replace: replace ? "true" : undefined, add: add ? "true" : undefined, instagram, instagram_id: instagramId, probe: probe ? "true" : undefined } }),
      /** Makes one account the default of its network (the one used when a network route has no `channel`). */
      setDefault: (channel) => a._req("PUT", `/v1/channels/${encodeURIComponent(channel)}/default`),
      /** Removes a DISCONNECTED account from the list (history stays). */
      remove: (channel) => a._req("DELETE", `/v1/channels/${encodeURIComponent(channel)}`),
      /** Disconnects ONE account of youtube | tiktok | instagram (Meta token only): revokes the token (best effort) and deletes what the server stored. The channel and its history stay; if it was the default, another connected account takes over. */
      disconnect: (network, { channel } = {}) => a._req("DELETE", `/v1/connections/${network}`, { query: { channel } }),
      /** (admin) Sends the Meta API token for Instagram: { token, userId, username?, type?, host? }. The server validates it with Meta and stores it encrypted. */
      sendInstagramToken: (body) => a._req("PUT", "/v1/connections/instagram/token", { body }),
    };
    this.tiktok = { creator: ({ channel } = {}) => a._req("GET", "/v1/tiktok/creator", { query: { channel } }) };
    /** Instagram through the Meta API: media grid, comments (with replies) and Praeko's "resolved" flag. Replying/hiding writes to Instagram for real. */
    this.instagram = {
      media: ({ max, page } = {}) => a._req("GET", "/v1/instagram/media", { query: { max, page } }),
      /** `sort`: recent | comments | views. Returns { comments, mediaItems, pending, next }. */
      comments: ({ media, unanswered, sort, max } = {}) => a._req("GET", "/v1/instagram/comments", { query: { media, unanswered: unanswered ? 1 : undefined, sort, max } }),
      reply: (commentId, text, o) => a._req("POST", `/v1/instagram/comments/${ref(commentId)}/reply`, { body: { text }, ...idem(o) }),
      hide: (commentId, hide = true) => a._req("POST", `/v1/instagram/comments/${ref(commentId)}/hide`, { body: { hide } }),
      resolve: (commentId) => a._req("POST", `/v1/instagram/comments/${ref(commentId)}/resolve`),
      reopen: (commentId) => a._req("DELETE", `/v1/instagram/comments/${ref(commentId)}/resolve`),
    };
    /** Comments of all networks together: network = all | youtube | instagram. */
    this.community = { comments: ({ network, unanswered, sort, max } = {}) => a._req("GET", "/v1/comments", { query: { network, unanswered: unanswered ? 1 : undefined, sort, max } }) };
    this.youtube = {
      listVideos: ({ max, page } = {}) => a._req("GET", "/v1/youtube/videos", { query: { max, page } }),
      getVideo: (id) => a._req("GET", `/v1/youtube/videos/${ref(id)}`),
      /** `dryRun: true` returns { before, after } without writing. */
      editVideo: (id, { title, description, tags, dryRun } = {}) => a._req("PATCH", `/v1/youtube/videos/${ref(id)}`, { body: { title, description, tags, dryRun } }),
      /** `sort`: recent | comments | views. Returns { comments, next, pending } with `resolved` on each thread. */
      comments: ({ video, unanswered, sort, max, page } = {}) => a._req("GET", "/v1/youtube/comments", { query: { video, unanswered: unanswered ? 1 : undefined, sort, max, page } }),
      resolve: (threadId) => a._req("POST", `/v1/youtube/comments/${ref(threadId)}/resolve`),
      reopen: (threadId) => a._req("DELETE", `/v1/youtube/comments/${ref(threadId)}/resolve`),
      reply: (threadId, text, o) => a._req("POST", `/v1/youtube/comments/${ref(threadId)}/reply`, { body: { text }, ...idem(o) }),
    };
    this.insights = {
      /** Cards, top 5, channels, summary and the 48 h reading of the period (ISO). Server default: the last 30 days. */
      get: ({ from, to, channel, tag, type, compare, sort, direction, page, limit } = {}) => a._req("GET", "/v1/insights", { query: { from, to, channel, tag, type, compare: compare ? 1 : undefined, sort, direction, page, limit } }),
      /** (admin) Imports the history of YouTube, Instagram (via Buffer) and TikTok. `network`: all | youtube | instagram | tiktok; `dryRun` only counts. */
      import: ({ network = "all", dryRun } = {}) => a._req("POST", "/v1/insights/import", { query: { network, dryRun: dryRun ? 1 : undefined } }),
    };
    /** Everything already published (Praeko + imported), newest first: { total, items }. */
    this.content = { list: ({ network, type, from, to, sort, limit, offset } = {}) => a._req("GET", "/v1/content", { query: { network, type, from, to, sort, limit, offset } }) };
    this.apiKeys = {
      list: () => a._req("GET", "/v1/api-keys"),
      create: (name, scope = "write", expiresInDays, o) => a._req("POST", "/v1/api-keys", { body: { name, scope, ...(expiresInDays ? { expiresInDays } : {}) }, ...idem(o) }),
      revoke: (id) => a._req("DELETE", `/v1/api-keys/${ref(id)}`),
    };
    /** API usage of this workspace and the request log (30 days, metadata only). */
    this.usage = {
      /** Totals of the last `days` (1-30, default 7): { total, succeeded, errors, p95Ms, peakPerMinute, limitPerMinute, byDay, byHour (days=1), byKey }. */
      get: ({ days } = {}) => a._req("GET", "/v1/usage", { query: { days } }),
      /** Newest first: { records, next }. `status`: 2xx|3xx|4xx|5xx or a code; `key`: key id or "session"; `route`: substring; pass `next` as `cursor`. */
      log: ({ key, status, route, method, days, limit, cursor } = {}) => a._req("GET", "/v1/usage/log", { query: { key, status, route, method, days, limit, cursor } }),
    };
    /** Panel preferences (theme, language, notifications per event). `put` is partial and strict; it returns the full preferences. */
    this.preferences = {
      get: () => a._req("GET", "/v1/preferences"),
      put: ({ theme, language, notifications } = {}) => a._req("PUT", "/v1/preferences", { body: { theme, language, notifications } }),
    };
    /** (admin) Outgoing webhooks. The `secret` comes back only from create and rotateSecret. Events: post.sent, post.failed, post.scheduled-fail. */
    this.webhooks = {
      list: () => a._req("GET", "/v1/webhooks"),
      create: ({ url, events, active, idempotencyKey } = {}) => a._req("POST", "/v1/webhooks", { body: { url, events, active }, ...idem({ idempotencyKey }) }),
      get: (id) => a._req("GET", `/v1/webhooks/${ref(id)}`),
      update: (id, { url, events, active } = {}) => a._req("PATCH", `/v1/webhooks/${ref(id)}`, { body: { url, events, active } }),
      remove: (id) => a._req("DELETE", `/v1/webhooks/${ref(id)}`),
      /** Sends a ping.test now and returns { delivery }. */
      test: (id) => a._req("POST", `/v1/webhooks/${ref(id)}/test`),
      deliveries: (id, { limit } = {}) => a._req("GET", `/v1/webhooks/${ref(id)}/deliveries`, { query: { limit } }),
      redeliver: (id, deliveryId, o) => a._req("POST", `/v1/webhooks/${ref(id)}/deliveries/${ref(deliveryId)}/retry`, idem(o)),
      rotateSecret: (id, o) => a._req("POST", `/v1/webhooks/${ref(id)}/rotate-secret`, idem(o)),
    };
    /** Idea board ("Create" screen). `group`: idea, scripting, ready, posted. `import` skips ideas whose `id` was already imported. */
    this.ideas = {
      list: () => a._req("GET", "/v1/ideas"),
      create: ({ title, note, group, tags, idempotencyKey } = {}) => a._req("POST", "/v1/ideas", { body: { title, note, group, tags }, ...idem({ idempotencyKey }) }),
      update: (id, { title, note, group, tags } = {}) => a._req("PATCH", `/v1/ideas/${ref(id)}`, { body: { title, note, group, tags } }),
      remove: (id) => a._req("DELETE", `/v1/ideas/${ref(id)}`),
      import: (ideas, o) => a._req("POST", "/v1/ideas/import", { body: { ideas }, ...idem(o) }),
    };
    addLegacy(this);
  }
  calendar({ from, to, channel, tag } = {}) { return this._req("GET", "/v1/calendar", { query: { from, to, channel, tag } }); }
  mentions({ network } = {}) { return this._req("GET", "/v1/mentions", { query: { network } }); }
  health() { return this._req("GET", "/health", { noKey: true }); }

  /**
   * One HTTP call. `legacy: true` (only for the deprecated Portuguese aliases) skips the `X-Praeko-Contract: en` header, so the shared paths
   * (/v1/posts, /v1/insights, /v1/youtube/videos) answer in the old shape.
   */
  async _req(method, path, { body, bytes, query, retry = method === "GET", noKey = false, legacy = false, idempotencyKey } = {}) {
    if (idempotencyKey) { retry = true; idempotencyKey = idempotencyKey === true ? uuid() : String(idempotencyKey); }
    const q = query ? Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&") : "";
    const url = `${this.url}${path}${q ? "?" + q : ""}`;
    const init = { method, headers: { ...(noKey || this._cookies ? {} : { authorization: `Bearer ${this._key}` }), ...(legacy ? {} : { "x-praeko-contract": "en" }) } };
    if (idempotencyKey) init.headers["idempotency-key"] = idempotencyKey; // one key for the call, reused by every retry below
    if (bytes !== undefined) { init.body = bytes; init.headers["content-type"] = "application/octet-stream"; }
    else if (body !== undefined) { init.body = JSON.stringify(body); init.headers["content-type"] = "application/json"; }
    let last;
    for (let i = 0; i < (retry ? this._retries : 1); i++) {
      if (i) await this._wait(Math.min(8000, 500 * 2 ** i));
      let r;
      try { r = await this._fetch(url, init); } catch (e) { last = new PraekoError(0, "network", `network failure: ${e.message}`); continue; }
      const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch { /* not JSON */ }
      if (r.ok) return j;
      const e = j?.error ?? (j?.erro && { code: j.erro.codigo, message: j.erro.mensagem, details: j.erro.detalhes }); // new envelope, or the legacy one
      last = new PraekoError(r.status, e?.code || "http_error", e?.message || `HTTP ${r.status}`, e?.details);
      if (!(r.status === 429 || r.status >= 500)) throw last;
    }
    throw last;
  }
}

/** @deprecated use Praeko (the class was called Arauto before the rename). */
export { Praeko as Arauto };

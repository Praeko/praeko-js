// Praeko provider: schedules/posts DIRECTLY on the Praeko service (Cloudflare Worker, https://praeko.app), without Buffer and without R2 hosting.
// Plain HTTP client (injectable fetch, no dependencies). It speaks Praeko's English contract (header `X-Arauto-Contract: en`):
// /v1/media, /v1/posts, /v1/channels; fields title, media, texts, items, scheduledFor, mode, via.
// Key: `praeko_…` format (or `arauto_…`) with the write scope, in the keychain (service praeko, account praeko/main) or in PRAEKO_STUDIO_KEY_PRAEKO_MAIN.
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { basename, extname } from "node:path";
import { textsByNetwork } from "../buffer.ts";
import type { Brand, NetworkOptions, PraekoSettings, Publication } from "../types.ts";

export const DEFAULT_URL = "https://praeko.app";
export const KEY_REF = "praeko/main";
export const SIMPLE_MAX = 32 * 1024 * 1024; // up to here a single PUT (the server accepts 50 MB; this stays below for margin); above it, in parts
export const DEFAULT_PART = 16 * 1024 * 1024;
export const PRAEKO_NETWORKS = ["youtube", "instagram", "tiktok"];

export class PraekoError extends Error {
  status: number; code: string; details: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) { super(message); this.name = "PraekoError"; this.status = status; this.code = code; this.details = details; }
}

/** Server error code → clear sentence (the server's own `message` comes along). */
const HINTS: Record<string, string> = {
  unauthorized: "Praeko did not receive a valid key. Save the key: echo $KEY | praeko studio schedule --via praeko --key",
  invalid_api_key: "Praeko refused the key (invalid). Create another in the dashboard and save it: echo $KEY | praeko studio schedule --via praeko --key",
  revoked_api_key: "the Praeko key was revoked. Create another in the dashboard and save it: echo $KEY | praeko studio schedule --via praeko --key",
  expired_api_key: "the Praeko key expired. Create another in the dashboard and save it: echo $KEY | praeko studio schedule --via praeko --key",
  forbidden: "the Praeko key is not allowed to do that (it needs the write scope)",
  rate_limited: "too many requests to Praeko (limit of 300 per minute); wait a moment and retry",
  invalid_origin: "Praeko refused the request origin",
  id_exists: "a post with that id already exists on Praeko",
  time_in_past: "the time is in the past or too close",
  missing_schedule: "one of the items has no time",
  no_slots: "the channel has no weekly slots configured",
  post_not_found: "Praeko does not know that post (it was deleted or belongs to another account)",
  media_not_found: "the media does not exist on Praeko",
  media_in_use: "the media is in use by a pending post",
  media_not_ready: "the media has not finished uploading",
  media_type_mismatch: "the media type does not match (video and cover are different media)",
  file_too_large: "the file is too large for this kind of upload",
  part_too_small: "an upload part is smaller than the server's minimum",
  channel_not_connected: "the network is not connected on Praeko (connect it under Channels in the dashboard)",
  channel_not_found: "the given channel does not exist on Praeko (see: praeko studio schedule --channels --via praeko)",
  network_not_supported: "Praeko does not support that network yet",
  buffer_error: "Buffer (which Praeko uses for Instagram) refused",
  instagram_error: "Meta refused the Instagram request",
  tiktok_unavailable: "TikTok refused or is unavailable",
  youtube_error: "YouTube refused the request",
  instagram_meta_not_connected: "Instagram is not connected to the Meta API on Praeko (use instagram.via = \"buffer\" or connect Meta)",
  internal_error: "internal Praeko error; try again shortly",
};

/** Builds the error message. Never includes the key (if it shows up in any server text, it is erased). */
export function errorMessageFor(status: number, code: string | undefined, message: string | undefined, key?: string | null): string {
  const clean = (s?: string) => (key && s ? String(s).split(key).join("…") : s);
  const hint = code ? HINTS[code] : undefined;
  const msg = clean(message);
  if (hint) return `Praeko: ${hint}${msg && !hint.includes(msg) ? ` (${msg})` : ""} [${code}]`;
  if (code && code !== "http_error") return `Praeko refused (HTTP ${status}, ${code}): ${msg || "no details"}`;
  return `Praeko answered HTTP ${status}${msg ? `: ${msg}` : ""}`;
}

/** https only (the key travels in a header); http only for localhost. */
export function normalizeUrl(url: string = DEFAULT_URL): string {
  const u = String(url).trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(u) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(u)) throw new Error(`invalid Praeko url: "${url}" (it must be https://…; brand.json → publishing.praeko.url)`);
  return u;
}

const MIME: Record<string, string> = { ".mp4": "video/mp4", ".mov": "video/quicktime", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };
export type FileSource = { size: number; name: string; mime: string; close: () => void; read: (start: number, n: number) => Promise<Buffer> };
/** A file on disk as a source { size, name, mime, read(start, n), close() }: reads in ranges, never the whole video at once (when it goes in parts). */
export function fileSource(path: string): FileSource {
  const mime = MIME[extname(path).toLowerCase()];
  if (!mime) throw new Error(`I do not know the type of ${basename(path)} (use .mp4, .mov, .png or .jpg)`);
  const fd = openSync(path, "r"), size = fstatSync(fd).size;
  return { size, name: basename(path), mime, close: () => closeSync(fd), read: async (start, n) => { const b = Buffer.alloc(Math.min(n, size - start)); readSync(fd, b, 0, b.length, start); return b; } };
}

type ReqOptions = { body?: unknown; bytes?: Buffer; query?: Record<string, unknown>; retry?: boolean };
export type PraekoClient = {
  req: (method: string, path: string, o?: ReqOptions) => Promise<any>;
  channels: () => Promise<any[]>;
  removeMedia: (id: string) => Promise<any>;
  uploadMedia: (source: FileSource, o?: { type?: string; name?: string; mime?: string; onProgress?: (done: number, total: number) => void }) => Promise<any>;
  createPost: (body: unknown) => Promise<any>;
  status: (id: string) => Promise<any>;
  cancel: (id: string) => Promise<any>;
};

/**
 * Praeko client. `key` is required on calls; `fetchFn`/`wait` are injectable (tests). GET and part uploads retry on network failure, 429 and 5xx.
 * Methods: channels, uploadMedia, removeMedia, createPost, status, cancel.
 */
export function client({ url = DEFAULT_URL, key, fetchFn = fetch, attempts = 3, wait = (ms: number) => new Promise((r) => setTimeout(r, ms)), simpleMax = SIMPLE_MAX, part = DEFAULT_PART }: {
  url?: string; key?: string | null; fetchFn?: typeof fetch; attempts?: number; wait?: (ms: number) => Promise<unknown>; simpleMax?: number; part?: number;
} = {}): PraekoClient {
  const base = normalizeUrl(url);
  const q = (o?: Record<string, unknown>) => { const s = Object.entries(o || {}).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&"); return s ? "?" + s : ""; };
  const ref = encodeURIComponent;
  async function req(method: string, path: string, { body, bytes, query, retry = method === "GET" }: ReqOptions = {}): Promise<any> {
    if (!key) throw new PraekoError(0, "no_key", "no Praeko key: echo $KEY | praeko studio schedule --via praeko --key (or the variable PRAEKO_STUDIO_KEY_PRAEKO_MAIN)");
    const headers: Record<string, string> = { authorization: `Bearer ${key}`, "x-arauto-contract": "en" };
    const init: RequestInit = { method, headers };
    if (bytes !== undefined) { init.body = new Uint8Array(bytes); headers["content-type"] = "application/octet-stream"; }
    else if (body !== undefined) { init.body = JSON.stringify(body); headers["content-type"] = "application/json"; }
    let last: PraekoError | undefined;
    for (let i = 0; i < (retry ? attempts : 1); i++) {
      if (i) await wait(Math.min(8000, 500 * 2 ** i));
      let r: Response;
      try { r = await fetchFn(`${base}${path}${q(query)}`, init); }
      catch (e: any) { last = new PraekoError(0, "network", `no connection to Praeko (${String(e.message).split(key).join("…")})`); continue; }
      const txt = await r.text(); let j: any = null; try { j = txt ? JSON.parse(txt) : null; } catch { /* the answer is not JSON */ }
      if (r.ok) return j;
      const e = j?.error;
      last = new PraekoError(r.status, e?.code || "http_error", errorMessageFor(r.status, e?.code, e?.message, key), e?.details);
      if (!(r.status === 429 || r.status >= 500)) throw last;
    }
    throw last;
  }
  return {
    req,
    /** GET /v1/channels → [{ network, id, connected, detail, name?, default?, meta?, publishesViaMeta? }]. Read only. */
    channels: async () => (await req("GET", "/v1/channels")).channels || [],
    removeMedia: (id) => req("DELETE", `/v1/media/${ref(id)}`),
    /** Uploads a file (one PUT up to simpleMax, otherwise parts + complete). `type`: "video" | "cover". Returns the ready media { id, … }. */
    async uploadMedia(source, { type, name = source.name, mime = source.mime, onProgress } = {}) {
      if (!type || !name || !mime) throw new Error("uploadMedia: give type, name and mime");
      if (source.size <= simpleMax) {
        const m = await req("POST", "/v1/media", { body: { type, name, mime, size: source.size, simple: true } });
        const r = await req("PUT", `/v1/media/${ref(m.id)}/content`, { bytes: await source.read(0, source.size), retry: true });
        onProgress?.(source.size, source.size);
        return { ...m, ...(r || {}), id: m.id };
      }
      const m = await req("POST", "/v1/media", { body: { type, name, mime, size: source.size } });
      const size = Math.max(m.minPartSize || 0, Math.min(part, m.maxPartSize || part));
      for (let n = 1, pos = 0; pos < source.size; n++, pos += size) {
        await req("PUT", `/v1/media/${ref(m.id)}/parts/${n}`, { bytes: await source.read(pos, size), retry: true });
        onProgress?.(Math.min(pos + size, source.size), source.size);
      }
      const r = await req("POST", `/v1/media/${ref(m.id)}/complete`);
      return { ...m, ...(r || {}), id: m.id };
    },
    /** POST /v1/posts → { id, items: [{ id, network, state, scheduledFor, … }] }. Does not retry (creating twice would duplicate). */
    createPost: (body) => req("POST", "/v1/posts", { body }),
    /** GET /v1/posts/:id → the post with its items. */
    status: (id) => req("GET", `/v1/posts/${ref(id)}`),
    /** DELETE /v1/posts/:id → { id, canceled: [ids], kept: [items] }; only cancels what is still pending. */
    cancel: (id) => req("DELETE", `/v1/posts/${ref(id)}`),
  };
}

/** ISO UTC → ISO with the given offset ("-03:00"): 2026-11-06T20:30:00.000Z → 2026-11-06T17:30:00-03:00. */
export function isoWithOffset(iso: string, offset = "-03:00"): string {
  const m = String(offset).match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!m) throw new Error(`invalid offset: "${offset}" (use "-03:00")`);
  const min = (m[1] === "-" ? -1 : 1) * (+m[2]! * 60 + +m[3]!);
  return new Date(new Date(iso).getTime() + min * 60e3).toISOString().slice(0, 19) + `${m[1]}${m[2]}:${m[3]}`;
}

export type ResolvedPraeko = PraekoSettings & { url: string; instagram: NetworkOptions & { via: string }; tiktok: NetworkOptions & { mode: string } };
/** `brand.json → publishing.praeko`, with the options validated. */
export function praekoConfig(brand?: Brand): ResolvedPraeko {
  const c: PraekoSettings = brand?.publishing?.praeko || {};
  const via = c.instagram?.via ?? "buffer", mode = c.tiktok?.mode ?? "draft";
  if (!["buffer", "meta"].includes(via)) throw new Error(`publishing.praeko.instagram.via is invalid: "${via}" (use "buffer" or "meta")`);
  if (!["draft", "direct"].includes(mode)) throw new Error(`publishing.praeko.tiktok.mode is invalid: "${mode}" (use "draft" or "direct")`);
  return { ...c, url: c.url || DEFAULT_URL, instagram: { ...(c.instagram || {}), via }, tiktok: { ...(c.tiktok || {}), mode } };
}

/** Smallest lead time the server accepts for a network's item (minutes): Instagram through Meta 25, the others 5. */
export const leadMin = (network: string, cfg: ResolvedPraeko): number => (network === "instagram" && cfg.instagram.via === "meta" ? 25 : 5);

/**
 * Body of `POST /v1/posts` (English contract). `media`: { video, cover } ids of media already uploaded; `networkMedia`: { instagram: { video } } (a copy for that item only).
 * `when`: { youtube, instagram, tiktok } in ISO UTC (become ISO with `offset`). Deterministic `id` (the episode slug).
 */
export function buildPost({ brand, publication, id, media, networkMedia = {}, networks, when, offset = "-03:00" }: {
  brand: Brand; publication: Publication; id: string; media: { video: string; cover?: string | null }; networkMedia?: Record<string, unknown>; networks: string[]; when: Record<string, string | undefined>; offset?: string;
}): Record<string, any> {
  const cfg = praekoConfig(brand), t = textsByNetwork({ brand, publication }) as Record<string, { title?: string; text: string; pinnedComment?: string }>;
  const texts: Record<string, any> = {};
  for (const r of networks) {
    const tx = t[r];
    if (!PRAEKO_NETWORKS.includes(r) || !tx) throw new Error(`unknown network: ${r}`);
    texts[r] = { ...(tx.title ? { title: tx.title } : {}), text: tx.text, ...(tx.pinnedComment ? { pinnedComment: tx.pinnedComment } : {}) };
  }
  const items = networks.map((r) => {
    const at = when[r];
    if (!at) throw new Error(`no time set for ${r}`);
    const item: Record<string, any> = { network: r, scheduledFor: isoWithOffset(at, offset) };
    const channel = (cfg.channels as Record<string, string> | undefined)?.[r];
    if (channel) item.channel = channel;
    if (r === "youtube") item.mode = "scheduled"; // Praeko uploads private and schedules on YouTube
    if (r === "instagram") item.via = cfg.instagram.via;
    if (r === "tiktok") item.mode = cfg.tiktok.mode === "direct" ? "direct" : "draft";
    if (networkMedia[r]) item.media = networkMedia[r];
    return item;
  });
  const tt = networks.includes("tiktok") && cfg.tiktok.mode === "direct" ? { privacy: cfg.tiktok.privacy || "SELF_ONLY", ...(cfg.tiktok.frameMs != null ? { coverFrameMs: cfg.tiktok.frameMs } : {}) } : null;
  return {
    id, title: publication.title,
    media: { video: media.video, ...(media.cover ? { cover: media.cover } : {}) },
    texts, items,
    options: { format: publication.format === "long" ? "long" : "short", ...(tt ? { tiktok: tt } : {}) },
  };
}

/** Labels for the states of a Praeko item/post. */
export const STATE_LABEL: Record<string, string> = { draft: "draft", scheduled: "scheduled", sent: "sent", private: "sent as private (waiting for you)", error: "ERROR", canceled: "cancelled", queued: "queued" };
/** States in which the item has not gone out yet (cancelling still works). */
export const PENDING = new Set(["scheduled", "draft", "queued"]);

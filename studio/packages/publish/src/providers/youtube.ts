// Direct YouTube provider (Data API v3). Uploads the video (resumable, in chunks), sets the thumbnail from the cover
// and leaves the video PRIVATE by default: the owner swaps the cover/publishes in YouTube Studio. Modes: private | scheduled | public.
// Everything that touches the network, the browser, the disk or the clock comes in through `ctx` (ctx.fetchFn, ctx.deps.*), so it can be tested without credentials.
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { closeSync, fstatSync, openSync, readSync, statSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import type { Ctx, QueueItem } from "../types.ts";

export const name = "youtube";
export const network = "youtube";
export const immediate = true; // uploads as soon as it enters the queue (private); the set time only matters in "scheduled" mode

export const CLIENT_REF = "youtube/client";
export const REF_TOKEN = "youtube/token";
export const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube"];
const AUTH = "https://accounts.google.com/o/oauth2/v2/auth", TOKEN = "https://oauth2.googleapis.com/token", API = "https://www.googleapis.com/youtube/v3", UP = "https://www.googleapis.com/upload/youtube/v3";
export const CHUNK_SIZE = 8 * 1024 * 1024; // multiple of 256 KiB, as the protocol requires
export const THUMBNAIL_LIMIT = 2 * 1024 * 1024; // YouTube Studio accepts up to 2 MB; the API says 50 MB, we keep Studio's limit

const b64url = (b: Uint8Array | string) => Buffer.from(b).toString("base64url");
const defaultSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MIME_IMG: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

/** Dependencies with real defaults; ctx.deps overrides them (tests). */
function deps(ctx: Ctx) {
  const d: Record<string, any> = ctx.deps || {};
  return {
    sleep: d.sleep || defaultSleep,
    now: d.now || (() => Date.now()),
    openBrowser: (d.openBrowser || ((url: string) => { try { spawn("open", [url], { stdio: "ignore", detached: true }).unref(); } catch { /* the user opens it by hand */ } })) as (url: string) => void,
    createServer: d.createServer || createServer,
    openFile: d.openFile || openRealFile,
    convertImage: d.convertImage || convertToJpeg,
    random: (d.random || ((n: number) => randomBytes(n))) as (n: number) => Uint8Array,
    limitMs: d.limitMs as number | undefined,
  };
}

/** Chunked file reader: { size, read(start, size) → Buffer, close() }. */
function openRealFile(path: string) {
  const fd = openSync(path, "r"), size = fstatSync(fd).size;
  return {
    size,
    read(start: number, n: number): Buffer { const buf = Buffer.alloc(Math.min(n, size - start)); readSync(fd, buf, 0, buf.length, start); return buf; },
    close() { closeSync(fd); },
  };
}
function convertToJpeg(input: string): string {
  const output = join(tmpdir(), `praeko-studio-thumbnail-${Date.now()}.jpg`);
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", input, "-q:v", "3", output], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg could not shrink the thumbnail");
  return output;
}

// ---------- API errors ----------
export function errorMessage(status: number, body: string): string {
  let j: any = null; try { j = JSON.parse(body); } catch { /* not JSON */ }
  const e = j?.error, reason = e?.errors?.[0]?.reason || e?.status || "", msg = e?.message || String(body || "").slice(0, 200);
  if (/quotaExceeded|rateLimitExceeded|dailyLimitExceeded/i.test(reason) || /quota/i.test(msg)) return `YouTube API quota exhausted (${reason || status}): uploads cost 1 unit and there is a daily cap; try again after midnight Pacific time`;
  if (/uploadLimitExceeded/i.test(reason)) return "the channel reached its daily upload limit";
  if (/forbidden|insufficientPermissions/i.test(reason) || status === 403) return `YouTube denied it (403 ${reason}): ${msg}. Check the scopes (praeko studio account youtube connect) and that the channel is verified for thumbnails`;
  if (status === 401) return "token refused (401): run `praeko studio account youtube connect` again";
  return `YouTube ${status} ${reason}: ${msg}`;
}
const failure = (status: number, body: string) => Object.assign(new Error(errorMessage(status, body)), { status });

// ---------- OAuth ----------
function client(ctx: Ctx, args: string[] = []): { client_id: string; client_secret: string } {
  const f = (k: string) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : undefined; };
  const id = f("client-id"), secret = f("client-secret");
  if (id && secret) return { client_id: id, client_secret: secret };
  const saved = ctx.secrets.get(CLIENT_REF);
  if (saved) { const j = JSON.parse(saved); if (j.client_id && j.client_secret) return j; }
  throw new Error("no Google OAuth credential: praeko studio account youtube connect --client-id <id> --client-secret <secret> (see docs/post-youtube.md)");
}

export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/** Builds the authorization URL (pure). */
export function authorizationUrl({ clientId, redirect, challenge, state }: { clientId: string; redirect: string; challenge: string; state: string }): string {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: "code", scope: SCOPES.join(" "), code_challenge: challenge, code_challenge_method: "S256", state: state, access_type: "offline", prompt: "consent" });
  return `${AUTH}?${q}`;
}

async function exchangeCode(ctx: Ctx, cl: { client_id: string; client_secret: string }, { code, verifier, redirect }: { code: string; verifier: string; redirect: string }): Promise<any> {
  const r = await ctx.fetchFn(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: code, client_id: cl.client_id, client_secret: cl.client_secret, code_verifier: verifier, redirect_uri: redirect, grant_type: "authorization_code" }).toString() });
  const j = await r.json();
  if (!r.ok) throw new Error(`Google refused the code: ${j.error_description || j.error}`);
  if (!j.refresh_token) throw new Error("Google did not return a refresh_token (revoke access at myaccount.google.com/permissions and connect again)");
  return j;
}

/** Authorizes once: loopback server + PKCE. Stores youtube/client and youtube/token. */
export async function connect({ ctx, args = [] }: { ctx: Ctx; args?: string[] }): Promise<number> {
  const d = deps(ctx), cl = client(ctx, args);
  const verifier = b64url(d.random(48)), state = b64url(d.random(16));
  let waiter!: { ok: (c: string) => void; no: (e: Error) => void };
  const codePromise = new Promise<string>((ok, no) => { waiter = { ok, no }; });
  const srv = d.createServer((req: any, res: any) => {
    const u = new URL(req.url, "http://127.0.0.1");
    if (u.pathname !== "/") { res.writeHead(404).end(); return; }
    const error = u.searchParams.get("error"), code = u.searchParams.get("code");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<meta charset="utf-8"><body style="font-family:sans-serif"><h2>${error || !code ? "That did not work" : "Done"}</h2><p>${error || !code ? "Go back to the terminal." : "You can close this tab and go back to the terminal."}</p>`);
    if (error) waiter.no(new Error(`authorization denied: ${error}`));
    else if (u.searchParams.get("state") !== state) waiter.no(new Error("state does not match (try again)"));
    else if (code) waiter.ok(code);
  });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  const redirect = `http://127.0.0.1:${srv.address().port}`;
  const url = authorizationUrl({ clientId: cl.client_id, redirect, challenge: pkceChallenge(verifier), state });
  ctx.log(`Opening the browser to authorize Praeko Studio on YouTube.\nIf it does not open, copy this address:\n${url}`);
  d.openBrowser(url);
  const limit = setTimeout(() => waiter.no(new Error("timed out (5 min) waiting for authorization")), d.limitMs ?? 5 * 60e3);
  try {
    const code = await codePromise;
    const j = await exchangeCode(ctx, cl, { code, verifier, redirect });
    ctx.secrets.set(CLIENT_REF, JSON.stringify(cl));
    ctx.secrets.set(REF_TOKEN, JSON.stringify({ access_token: j.access_token, refresh_token: j.refresh_token, expiry: d.now() + (j.expires_in || 3600) * 1000, scopes: (j.scope || SCOPES.join(" ")).split(" ") }));
  } finally { clearTimeout(limit); srv.close(); }
  const s = await status({ ctx });
  ctx.log(s.connected ? `✓ YouTube connected: ${s.detail}` : "⚠ authorized, but I could not read the channel");
  return s.connected ? 0 : 1;
}

/** Valid access token (renewed with the refresh token when less than 60 s remain). */
export async function validToken(ctx: Ctx): Promise<string> {
  const d = deps(ctx), raw = ctx.secrets.get(REF_TOKEN);
  if (!raw) throw new Error("YouTube not connected: praeko studio account youtube connect");
  const t = JSON.parse(raw);
  if (t.access_token && t.expiry - 60e3 > d.now()) return t.access_token;
  const cl = client(ctx);
  const r = await ctx.fetchFn(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: cl.client_id, client_secret: cl.client_secret, refresh_token: t.refresh_token, grant_type: "refresh_token" }).toString() });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error === "invalid_grant" ? "Google revoked the refresh token (an app in Testing mode expires in 7 days): run `praeko studio account youtube connect` and publish the app as In production (docs/post-youtube.md)" : `could not renew the token: ${j.error_description || j.error}`);
  const fresh = { ...t, access_token: j.access_token, expiry: d.now() + (j.expires_in || 3600) * 1000, ...(j.refresh_token ? { refresh_token: j.refresh_token } : {}) };
  ctx.secrets.set(REF_TOKEN, JSON.stringify(fresh));
  return fresh.access_token;
}

async function api(ctx: Ctx, url: string, options: RequestInit = {}): Promise<Response> {
  const token = await validToken(ctx);
  const r = await ctx.fetchFn(url, { ...options, headers: { authorization: `Bearer ${token}`, ...((options.headers as Record<string, string>) || {}) } });
  return r;
}

export async function status({ ctx }: { ctx: Ctx }): Promise<{ connected: boolean; detail: string }> {
  if (!ctx.secrets.get(REF_TOKEN)) return { connected: false, detail: "run: praeko studio account youtube connect --client-id … --client-secret …" };
  try {
    const r = await api(ctx, `${API}/channels?part=snippet&mine=true`);
    const txt = await r.text();
    if (!r.ok) return { connected: false, detail: errorMessage(r.status, txt) };
    const c = JSON.parse(txt).items?.[0];
    return c ? { connected: true, detail: c.snippet.title } : { connected: false, detail: "the authorized account has no YouTube channel" };
  } catch (e) { return { connected: false, detail: e.message }; }
}

// ---------- metadata and upload ----------
/** "private" | "scheduled" | "public". */
export function modeOf(item: Pick<QueueItem, "options">): "private" | "scheduled" | "public" {
  const m = item.options?.mode || "private";
  if (m !== "private" && m !== "scheduled" && m !== "public") throw new Error(`invalid YouTube mode: ${m} (use private, scheduled or public)`);
  return m;
}

/** videos.insert body (pure). */
export function buildMetadata(item: QueueItem, now = Date.now()) {
  const o = item.options || {}, mode = modeOf(item);
  let title: string = item.texts?.title || item.title || item.slug;
  if (title.length > 100) title = title.slice(0, 99).trimEnd() + "…";
  const status: Record<string, any> = { privacyStatus: mode === "public" ? "public" : "private", selfDeclaredMadeForKids: false, embeddable: true, publicStatsViewable: true };
  if (item.options?.syntheticContent != null) status.containsSyntheticMedia = !!item.options.syntheticContent; // synthetic content disclosure (publication.ai.synthetic)
  if (mode === "scheduled") {
    const t = Date.parse(item.when);
    if (!(t > now + 60e3)) throw new Error(`scheduled mode: ${item.when} is in the past or less than 1 minute away`);
    status.publishAt = new Date(t).toISOString();
  }
  return {
    snippet: { title: title, description: item.texts?.text || "", categoryId: String(o.categoryId || "28"), defaultLanguage: o.language || "en", defaultAudioLanguage: o.language || "en", ...(o.tags ? { tags: o.tags } : {}) },
    status,
  };
}

async function waitFor(ms: number, d: ReturnType<typeof deps>) { await d.sleep(ms); }
const ATTEMPTS = 5;

/** Resumable upload in chunks. Returns the `video` resource. */
export async function uploadVideo({ ctx, file, metadata, notifySubscribers = false }: { ctx: Ctx; file: string; metadata: unknown; notifySubscribers?: boolean }): Promise<any> {
  const d = deps(ctx), f = d.openFile(file), total = f.size;
  try {
    const q = new URLSearchParams({ uploadType: "resumable", part: "snippet,status", notifySubscribers: String(!!notifySubscribers) });
    const start = await api(ctx, `${UP}/videos?${q}`, { method: "POST", headers: { "content-type": "application/json; charset=UTF-8", "x-upload-content-length": String(total), "x-upload-content-type": "video/mp4" }, body: JSON.stringify(metadata) });
    if (!start.ok) throw failure(start.status, await start.text());
    const session = start.headers.get("location");
    if (!session) throw new Error("YouTube did not return the upload session address");
    let pos = 0, failures = 0;
    while (pos < total) {
      const chunk = f.read(pos, CHUNK_SIZE), end = pos + chunk.length - 1;
      let r: any;
      try { r = await ctx.fetchFn(session, { method: "PUT", headers: { "content-length": String(chunk.length), "content-range": `bytes ${pos}-${end}/${total}`, "content-type": "video/mp4" }, body: new Uint8Array(chunk) }); }
      catch (e) { r = { status: 0, networkError: e }; }
      if (r.status === 200 || r.status === 201) { const v = await r.json(); return v; }
      if (r.status === 308) { const rg = r.headers.get("range"); pos = rg ? Number(rg.split("-")[1]) + 1 : 0; failures = 0; continue; }
      if (r.status === 0 || [500, 502, 503, 504].includes(r.status)) {
        if (++failures > ATTEMPTS) throw new Error(`upload interrupted after ${ATTEMPTS} attempts (${r.networkError?.message || r.status})`);
        await waitFor(Math.min(30e3, 1000 * 2 ** failures), d);
        // finds out how far the server got
        const c = await ctx.fetchFn(session, { method: "PUT", headers: { "content-length": "0", "content-range": `bytes */${total}` } }).catch(() => null);
        if (c && (c.status === 200 || c.status === 201)) return await c.json();
        if (c && c.status === 308) { const rg = c.headers.get("range"); pos = rg ? Number(rg.split("-")[1]) + 1 : 0; }
        continue;
      }
      throw failure(r.status, await r.text());
    }
    throw new Error("the upload ended without an answer from YouTube");
  } finally { f.close?.(); }
}

/** Waits for processing before the thumbnail (the docs ask for this with Shorts). Returns true if it finished. */
async function waitForProcessing(ctx: Ctx, id: string, d: ReturnType<typeof deps>, attempts = 12): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    const r = await api(ctx, `${API}/videos?part=processingDetails&id=${id}`);
    if (r.ok) { const s = (await r.json()).items?.[0]?.processingDetails?.processingStatus; if (s === "succeeded") return true; if (s === "failed" || s === "terminated") return false; }
    await d.sleep(10e3);
  }
  return false;
}

async function setThumbnail(ctx: Ctx, id: string, cover: string, d: ReturnType<typeof deps>): Promise<boolean> {
  let file = cover, f = d.openFile(file);
  if (f.size > THUMBNAIL_LIMIT) { f.close?.(); file = d.convertImage(file); f = d.openFile(file); }
  try {
    const body = f.read(0, f.size), mime = MIME_IMG[extname(file).toLowerCase()] || "image/jpeg";
    const r = await api(ctx, `${UP}/thumbnails/set?videoId=${id}`, { method: "POST", headers: { "content-type": mime, "content-length": String(body.length) }, body: body });
    if (!r.ok) throw failure(r.status, await r.text());
    return true;
  } finally { f.close?.(); }
}

export async function plan({ item }: { item: QueueItem; ctx?: Ctx }): Promise<string[]> {
  const mode = modeOf(item), m = buildMetadata(item, Date.now());
  let size = "?";
  try { size = (statSync(item.video).size / 1048576).toFixed(1) + " MB"; } catch { /* the file is gone in tests */ }
  return [
    `title: ${m.snippet.title}`,
    `mode: ${mode} → privacy ${m.status.privacyStatus}${m.status.publishAt ? ` (publishes by itself at ${m.status.publishAt})` : mode === "private" ? " (you swap the cover and publish in YouTube Studio)" : ""}`,
    `file: ${size}; cover: ${item.cover ? item.cover.split("/").pop() + " (thumbnails.set)" : "none"}`,
  ];
}

export async function publish({ item, ctx }: { item: QueueItem; ctx: Ctx }) {
  const d = deps(ctx), warnings: string[] = [];
  const metadata = buildMetadata(item, d.now());
  ctx.log(`  YouTube: uploading ${item.video.split("/").pop()} (${metadata.status.privacyStatus})…`);
  const v = await uploadVideo({ ctx, file: item.video, metadata, notifySubscribers: item.options?.notifySubscribers });
  const id = v.id;
  let thumbnail = false;
  if (item.cover) {
    try {
      const ready = await waitForProcessing(ctx, id, d);
      if (!ready) warnings.push("the video was still processing; the thumbnail may not have taken");
      thumbnail = await setThumbnail(ctx, id, item.cover, d);
    } catch (e) { warnings.push(`thumbnail not set (${e.message}); swap it in YouTube Studio`); }
  }
  if (item.options?.comment) warnings.push("pinned comment is not supported by the API (it cannot be pinned; comment in the app)");
  for (const a of warnings) ctx.log(`  ⚠ ${a}`);
  return { id, url: `https://youtu.be/${id}`, studio: `https://studio.youtube.com/video/${id}/edit`, privacy: metadata.status.privacyStatus, publishAt: metadata.status.publishAt, thumbnail, warnings };
}

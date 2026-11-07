// Direct Instagram provider (Reels) through the "Instagram API with Instagram Login" (graph.instagram.com).
// A Reel's flow: host video and cover (R2) → POST /{ig}/media (REELS, video_url, cover_url) → wait for status_code FINISHED
// → POST /{ig}/media_publish. The API has no draft or scheduling: the queue runner calls `prepare` 15 min before
// and `publish` at the set time. Everything takes `ctx` (fetchFn, secrets, host, removeHosted, log, now, pause), so it tests without network.
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { createInterface } from "node:readline";
import type { Ctx, QueueItem } from "../types.ts";

type Token = { token: string; userId: string; username: string; type?: string; expiresAt: string; connectedAt?: string };
type Prep = { containerId: string; createdAt: string; hostedKeys: string[]; videoUrl?: string; coverUrl?: string | null; published?: string; result?: Result };
type Result = { id: string; containerId: string; url?: string; commented?: boolean };

export const name = "instagram";
export const network = "instagram";
export const leadMs = 15 * 60e3;

const HOST = "https://graph.instagram.com";
const REF = "instagram/token";
const DAY = 864e5;
export const LIMITS = { caption: 2200, hashtags: 30, durationMin: 3, durationMax: 900, bytes: 300 * 1048576, fpsMin: 23, fpsMax: 60 };
const DEFAULT_VERSION = "v23.0"; // the "get started" docs use v27.0 in one example; change it in brand.publishing.instagram.version if Meta retires this one

const version = (ctx: Ctx) => ctx.brand?.publishing?.instagram?.version || DEFAULT_VERSION;
const now = (ctx: Ctx): Date => (ctx.now ? ctx.now() : new Date());
const pause = (ctx: Ctx, ms: number): Promise<unknown> => (ctx.pause ? ctx.pause(ms) : new Promise((r) => setTimeout(r, ms)));

/** API call; throws with Meta's message. The body goes as a form (POST). */
async function api(ctx: Ctx, method: string, path: string, params: Record<string, unknown> = {}, { withoutVersion = false }: { withoutVersion?: boolean } = {}): Promise<any> {
  const url = new URL(`${HOST}/${withoutVersion ? "" : version(ctx) + "/"}${path}`);
  const init: RequestInit = { method };
  if (method === "GET") for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  else { init.headers = { "content-type": "application/x-www-form-urlencoded" }; init.body = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString(); }
  const r = await (ctx.fetchFn || fetch)(url.toString(), init);
  const txt = await r.text();
  let j: any; try { j = JSON.parse(txt); } catch { throw new Error(`Instagram answered ${r.status}: ${txt.slice(0, 200)}`); }
  if (j.error) throw new Error(`Instagram: ${j.error.message}${j.error.code ? ` (code ${j.error.code}${j.error.error_subcode ? "/" + j.error.error_subcode : ""})` : ""}`);
  if (!r.ok) throw new Error(`Instagram answered ${r.status}: ${txt.slice(0, 200)}`);
  return j;
}

export function readToken(ctx: Ctx): Token | null {
  const raw = ctx.secrets.get(REF);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
const saveToken = (ctx: Ctx, t: Token) => ctx.secrets.set(REF, JSON.stringify(t));
export const daysLeft = (t: Token, d = new Date()): number => (Date.parse(t.expiresAt) - +d) / DAY;

/** Token in use; renews itself when fewer than 15 days remain (renewal needs a token at least 24 h old and still valid). */
export async function validToken(ctx: Ctx): Promise<Token> {
  const t = readToken(ctx);
  if (!t?.token) throw new Error("Instagram not connected: praeko studio account instagram connect --token …");
  const days = daysLeft(t, now(ctx));
  if (days <= 0) throw new Error("the Instagram token expired: generate another in the Meta dashboard and run praeko studio account instagram connect --token …");
  if (days < 15) {
    try {
      const r = await api(ctx, "GET", "refresh_access_token", { grant_type: "ig_refresh_token", access_token: t.token }, { withoutVersion: true });
      const fresh = { ...t, token: r.access_token, expiresAt: new Date(+now(ctx) + r.expires_in * 1000).toISOString() };
      saveToken(ctx, fresh);
      ctx.log?.(`✓ Instagram token renewed (valid for ${Math.round(r.expires_in / 86400)} more days)`);
      return fresh;
    } catch (e) { ctx.log?.(`⚠ could not renew the Instagram token (${e.message}); ${Math.floor(days)} days left`); }
  }
  return t;
}

async function readInput(args: string[]): Promise<string> {
  const i = args.indexOf("--token");
  if (i >= 0 && args[i + 1]) return args[i + 1]!.trim();
  if (!process.stdin.isTTY) { const ch: Buffer[] = []; for await (const c of process.stdin) ch.push(Buffer.from(c)); const s = Buffer.concat(ch).toString().trim(); if (s) return s; }
  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const s = await new Promise<string>((ok) => rl.question("Paste the Instagram access token (Meta dashboard → Instagram → API setup → Generate token): ", ok));
    rl.close();
    return s.trim();
  }
  return "";
}

export async function connect({ ctx, args = [] }: { ctx: Ctx; args?: string[] }): Promise<number> {
  const token = await readInput(args);
  if (!token) throw new Error("no token: praeko studio account instagram connect --token <token> (or through stdin)");
  const j = args.indexOf("--app-secret"), segredoApp = j >= 0 ? args[j + 1] : null;
  const eu = await api(ctx, "GET", "me", { fields: "user_id,username,account_type", access_token: token });
  let final = token, expiraEm = 60 * 86400; // the dashboard token is already long-lived (60 days); the short one (1 h) needs an exchange
  if (segredoApp) {
    try { const r = await api(ctx, "GET", "access_token", { grant_type: "ig_exchange_token", client_secret: segredoApp, access_token: token }, { withoutVersion: true }); final = r.access_token; expiraEm = r.expires_in; ctx.log?.("✓ token exchanged for a long-lived one"); }
    catch (e) { ctx.log?.(`⚠ did not exchange the token (${e.message}); kept the original`); }
  }
  const saved = { token: final, userId: String(eu.user_id || eu.id), username: eu.username, type: eu.account_type, expiresAt: new Date(+now(ctx) + expiraEm * 1000).toISOString(), connectedAt: now(ctx).toISOString() };
  saveToken(ctx, saved);
  ctx.log?.(`✓ Instagram connected: @${saved.username} (${saved.type || "unknown type"}); token valid until ${saved.expiresAt.slice(0, 10)}`);
  if (saved.type && !/BUSINESS|CREATOR|MEDIA_CREATOR/i.test(saved.type)) ctx.log?.("⚠ the account does not look professional (Business/Creator): the API only publishes to a professional account");
  return 0;
}

export async function status({ ctx }: { ctx: Ctx }): Promise<{ connected: boolean; detail: string }> {
  const t = readToken(ctx);
  if (!t?.token) return { connected: false, detail: "run: praeko studio account instagram connect --token …" };
  const days = daysLeft(t, now(ctx));
  return { connected: days > 0, detail: `@${t.username}, ${t.type || "type ?"}, ${days > 0 ? `token valid for ${Math.floor(days)} more days${days < 15 ? " (renews itself)" : ""}` : "token EXPIRED"}` };
}

// ---------- video checks (ffprobe, if present) ----------
function probe(file: string, ctx: Ctx): { codec: string; width: number; height: number; fps: number; duration: number } | null {
  if (ctx.probe) return ctx.probe(file);
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,r_frame_rate", "-show_entries", "format=duration", "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) return null;
  const j = JSON.parse(r.stdout), s = j.streams[0], [a = 0, b] = String(s.r_frame_rate).split("/").map(Number);
  return { codec: s.codec_name, width: s.width, height: s.height, fps: b ? a / b : a, duration: +j.format.duration };
}
export function videoWarnings(file: string, ctx: Partial<Ctx> = {}): string[] {
  const av: string[] = [];
  try {
    try { const bytes = statSync(file).size; if (bytes > LIMITS.bytes) av.push(`video is ${(bytes / 1048576).toFixed(0)} MB (Reel limit: 300 MB)`); } catch { /* missing file: ffprobe will say */ }
    const s = probe(file, ctx as Ctx);
    if (!s) return av;
    if (s.duration < LIMITS.durationMin || s.duration > LIMITS.durationMax) av.push(`duration ${s.duration.toFixed(1)} s is outside 3 s to 15 min`);
    if (s.fps < LIMITS.fpsMin || s.fps > LIMITS.fpsMax) av.push(`${s.fps.toFixed(1)} fps is outside 23 to 60`);
    if (!/^(h264|hevc)$/.test(s.codec)) av.push(`codec ${s.codec} (use H.264 or HEVC)`);
    const prop = s.width / s.height;
    if (prop < 0.5 || prop > 0.6) av.push(`aspect ratio ${s.width}x${s.height}: 9:16 avoids cropping and bars`);
  } catch (e: any) { av.push(`could not check the video (${e.message})`); }
  return av;
}
export function textWarnings(text: string): string[] {
  const av: string[] = [];
  if (text.length > LIMITS.caption) av.push(`caption has ${text.length} characters (limit ${LIMITS.caption})`);
  const n = (text.match(/#[\p{L}\p{N}_]+/gu) || []).length;
  if (n > LIMITS.hashtags) av.push(`${n} hashtags (limit ${LIMITS.hashtags})`);
  return av;
}

export async function plan({ item, ctx }: { item: QueueItem; ctx: Ctx }): Promise<string[]> {
  const l = [`Reel at the set time; preparation ${leadMs / 60e3} min before (video and cover go to the public hosting)`];
  l.push(item.cover ? `cover: ${basename(item.cover)} (becomes cover_url; PNG is converted to JPEG)` : "no cover: thumbnail = frame 0 of the video");
  const t = readToken(ctx);
  l.push(t ? `account @${t.username}; token valid for ${Math.floor(daysLeft(t, now(ctx)))} more days` : "⚠ account not connected (praeko studio account instagram connect)");
  for (const a of [...textWarnings(item.texts?.text || ""), ...(item.video ? videoWarnings(item.video, ctx) : [])]) l.push(`⚠ ${a}`);
  return l;
}

// ---------- cover as JPEG ----------
function coverJpeg(cover: string, ctx: Ctx): string {
  if (/\.jpe?g$/i.test(cover)) return cover;
  if (ctx.convertCover) return ctx.convertCover(cover);
  const output = join(tmpdir(), `praeko-studio-cover-${basename(cover, extname(cover))}-${Date.now()}.jpg`);
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", cover, "-q:v", "2", output], { stdio: "ignore" });
  return r.status === 0 && existsSync(output) ? output : cover;
}

async function clean(ctx: Ctx, prep?: { hostedKeys?: string[] } | null): Promise<void> {
  for (const key of prep?.hostedKeys || []) { try { await ctx.removeHosted!(key); } catch (e) { ctx.log?.(`⚠ did not remove ${key} from the hosting (${e.message})`); } }
}

/** Creates the Reel container. The result is also stored in `item.prep` right away, so a retry can reuse it. */
export async function prepare({ item, ctx }: { item: QueueItem; ctx: Ctx }): Promise<Prep> {
  if (item.prep?.containerId && !item.prep.published && (+now(ctx) - Date.parse(item.prep.createdAt)) < 23 * 3600e3) return item.prep; // a container lasts 24 h
  if (item.prep?.containerId && !item.prep.published) { await clean(ctx, item.prep); item.prep = null; } // too old: recreate
  const t = await validToken(ctx), text = item.texts?.text || "";
  const errors = textWarnings(text).filter((x) => /characters|hashtags/.test(x));
  if (errors.length) throw new Error(errors.join("; "));
  const keys = [];
  try {
    const v = await ctx.host!(item.video, item.slug); keys.push(v.key);
    const params: Record<string, any> = { media_type: "REELS", video_url: v.url, caption: text, share_to_feed: "true", access_token: t.token };
    if (item.cover) { const c = await ctx.host!(coverJpeg(item.cover, ctx), item.slug); keys.push(c.key); params.cover_url = c.url; }
    else if (item.options?.thumbnailMs != null) params.thumb_offset = item.options.thumbnailMs;
    const r = await api(ctx, "POST", `${t.userId}/media`, params);
    item.prep = { containerId: r.id, createdAt: now(ctx).toISOString(), hostedKeys: keys, videoUrl: v.url, coverUrl: params.cover_url || null };
    ctx.log?.(`✓ Instagram: container ${r.id} created`);
    return item.prep;
  } catch (e) { await clean(ctx, { hostedKeys: keys }); throw e; } // failed before a container existed: leave no junk on the hosting
}

/** Waits for the container to become FINISHED (Meta recommends 1 query per minute, for up to 5 min; here up to `maxMs`). */
export async function waitForContainer({ ctx, token, containerId, intervalMs, maxMs }: { ctx: Ctx; token: string; containerId: string; intervalMs: number; maxMs: number }): Promise<string> {
  const attempts = Math.max(1, Math.ceil(maxMs / intervalMs));
  for (let i = 0; i < attempts; i++) {
    const r = await api(ctx, "GET", containerId, { fields: "status_code,status", access_token: token });
    if (r.status_code === "FINISHED" || r.status_code === "PUBLISHED") return r.status_code;
    if (r.status_code === "ERROR" || r.status_code === "EXPIRED") { throw Object.assign(new Error(`Instagram: container ${r.status_code}${r.status ? ` (${r.status})` : ""}`), { code: r.status_code }); }
    if (i < attempts - 1) await pause(ctx, intervalMs);
  }
  throw new Error(`Instagram: the video is still processing after ${Math.round(maxMs / 60e3)} min; the next attempt continues`);
}

export async function publish({ item, ctx }: { item: QueueItem; ctx: Ctx }): Promise<Result> {
  if (item.prep?.published) return item.prep.result; // already published in an earlier attempt (no duplicate)
  const prep = await prepare({ item, ctx }); // reuses the container in `item.prep` if still valid
  const t = await validToken(ctx), op = item.options || {};
  try { await waitForContainer({ ctx, token: t.token, containerId: prep.containerId, intervalMs: op.intervalMs ?? 30e3, maxMs: op.maxWaitMs ?? 10 * 60e3 }); }
  catch (e: any) { if (e.code) { await clean(ctx, prep); item.prep = null; } throw e; } // ERROR/EXPIRED: the container died, the next attempt recreates it
  try { // quota: ~100 posts per API in 24 h; the query is read-only and does not block if it fails
    const q = await api(ctx, "GET", `${t.userId}/content_publishing_limit`, { fields: "quota_usage,config", access_token: t.token });
    const uso = q.data?.[0]?.quota_usage, total = q.data?.[0]?.config?.quota_total;
    if (uso != null && total != null && uso >= total) throw Object.assign(new Error(`Instagram publishing quota exhausted (${uso}/${total} in 24 h)`), { quota: true });
  } catch (e) { if (e.quota) throw e; }
  const pub = await api(ctx, "POST", `${t.userId}/media_publish`, { creation_id: prep.containerId, access_token: t.token });
  const result: Result = { id: pub.id, containerId: prep.containerId };
  prep.published = pub.id; prep.result = result; // stored right now: after this nothing can cause a republish
  try { const m = await api(ctx, "GET", pub.id, { fields: "permalink", access_token: t.token }); result.url = m.permalink; } catch (e) { ctx.log?.(`⚠ published, but without the link (${e.message})`); }
  if (op.comment && item.texts?.pinnedComment) {
    try { await api(ctx, "POST", `${pub.id}/comments`, { message: item.texts.pinnedComment, access_token: t.token }); result.commented = true; }
    catch (e) { ctx.log?.(`⚠ published, but the comment failed (${e.message}); it needs the instagram_business_manage_comments scope`); }
  }
  await clean(ctx, prep);
  ctx.log?.(`✓ Instagram published${result.url ? ": " + result.url : ""}`);
  return result;
}

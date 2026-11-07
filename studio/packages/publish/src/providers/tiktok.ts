// Direct TikTok provider (Content Posting API). Written against the official docs (developers.tiktok.com), still WITHOUT a live test.
//   mode "draft" (default): sends the video to the app's inbox (/inbox/video/init/, scope video.upload); the owner picks the cover,
//                           pastes the caption and publishes in the app. The inbox API takes neither caption nor cover.
//   mode "direct":          Direct Post (/video/init/, scope video.publish). Without the app audit TikTok forces SELF_ONLY (private).
// The video goes up by FILE_UPLOAD (chunked PUT to upload_url); PULL_FROM_URL would need a verified domain and is not used.
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import type { Ctx, QueueItem } from "../types.ts";

type ApiResult = { status: number; ok: boolean; j: any };
type Pkce = { verifier: string; challenge: string };
type Plan = { chunk: number; total: number; parts: { a: number; b: number; size: number }[] };
type TikTokClient = { key?: string; secret?: string; redirect?: string };
type TikTokToken = { access_token: string; refresh_token?: string; open_id?: string; scope?: string; expiresAt: number; refreshExpiresAt: number };

export const name = "tiktok";
export const network = "tiktok";
export const immediate = false; // goes out at the set time (in draft mode, the set time becomes the reminder in the app)

export const API = "https://open.tiktokapis.com";
export const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
export const SCOPES = ["user.info.basic", "video.upload", "video.publish"];
const MB = 1024 * 1024;
export const LIMITS = { chunkMin: 5 * MB, chunkMax: 64 * MB, lastMax: 128 * MB, chunksMax: 1000, videoMax: 4 * 1024 * MB, title: 2200 };
const CLIENT_REF = "tiktok/client", REF_TOKEN = "tiktok/token";

const ERRORS: Record<string, string> = {
  unaudited_client_can_only_post_to_private_accounts: "the TikTok app has not been audited yet: it can only post to a PRIVATE account and as SELF_ONLY. Use \"draft\" mode (default) or make the account private until the audit (developers.tiktok.com/application/content-posting-api).",
  spam_risk_too_many_pending_share: "TikTok accepts at most 5 pending uploads in the inbox per 24 h; publish or discard a draft in the app.",
  spam_risk_too_many_posts: "TikTok's daily post limit was reached for this account (about 15 per day).",
  spam_risk_user_banned_from_posting: "this account is blocked from posting by TikTok.",
  reached_active_user_cap: "the app reached its daily quota of active publishing users.",
  url_ownership_unverified: "TikTok requires a verified domain for PULL_FROM_URL (Praeko Studio uses FILE_UPLOAD; this should not happen).",
  privacy_level_option_mismatch: "the requested privacy is not among the account's options (privacy_level_options).",
  access_token_invalid: "TikTok token invalid or expired: run `praeko studio account tiktok connect` again.",
  scope_not_authorized: "the needed scope was not authorized (video.upload for draft, video.publish for direct): run `praeko studio account tiktok connect` and accept them all.",
  rate_limit_exceeded: "TikTok rate limit; try again in a minute.",
};
export const errorMessage = (code: string, msg?: string): string => ERRORS[code] ? `${ERRORS[code]} [${code}]` : `TikTok refused: ${code}${msg ? ` (${msg})` : ""}`;

// ---------- pure utilities ----------
/** FILE_UPLOAD chunk plan (docs rules: 5–64 MB, last one up to 128 MB, <5 MB in one chunk, total = floor(size/chunk)). */
export function chunkPlan(size: number, preferredChunk = 10 * MB): Plan {
  if (!(size > 0)) throw new Error("empty video");
  if (size > LIMITS.videoMax) throw new Error(`a ${(size / MB).toFixed(0)} MB video is over 4 GB`);
  let chunk = Math.min(LIMITS.chunkMax, Math.max(LIMITS.chunkMin, preferredChunk));
  if (size < LIMITS.chunkMin || size <= chunk) chunk = size; // a single chunk
  const total = Math.floor(size / chunk);
  if (total < 1 || total > LIMITS.chunksMax) throw new Error(`invalid chunk plan (${total} chunks)`);
  const parts: Plan["parts"] = [];
  for (let i = 0; i < total; i++) {
    const a = i * chunk, b = i === total - 1 ? size - 1 : a + chunk - 1; // the last one absorbs the remainder
    parts.push({ a, b, size: b - a + 1 });
  }
  if (parts.at(-1)!.size > LIMITS.lastMax) throw new Error("the last chunk would exceed 128 MB; raise the chunk size");
  return { chunk, total, parts };
}
/** Truncates to `max` UTF-16 units without cutting a surrogate pair. */
export function truncate(text: unknown, max = LIMITS.title): string {
  const s = String(text ?? "");
  if (s.length <= max) return s;
  let cut = max - 1;
  const c = s.charCodeAt(cut - 1);
  if (c >= 0xd800 && c <= 0xdbff) cut--;
  return s.slice(0, cut) + "…";
}
/** Effective privacy: without `audited` TikTok only accepts SELF_ONLY. Returns { level, warning? }. */
export function effectivePrivacy({ requested, audited, creatorOptions }: { requested?: string; audited?: boolean; creatorOptions?: string[] }): { level: string; warning: string | null } {
  const wants = requested || "SELF_ONLY";
  const level = audited ? wants : "SELF_ONLY";
  const warning = level !== wants ? `privacy ${wants} → SELF_ONLY (app not audited)` : null;
  if (creatorOptions && !creatorOptions.includes(level)) throw new Error(`privacy ${level} is outside the account's options (${creatorOptions.join(", ")})`);
  return { level, warning };
}
export const pkceCode = () => { const verifier = randomBytes(48).toString("base64url"); return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") }; };
export function authorizationUrl({ key, redirect, scopes = SCOPES, state, pkce }: { key: string; redirect: string; scopes?: string[]; state: string; pkce?: Pkce | null }): string {
  const q = new URLSearchParams({ client_key: key, scope: scopes.join(","), response_type: "code", redirect_uri: redirect, state: state });
  if (pkce) { q.set("code_challenge", pkce.challenge); q.set("code_challenge_method", "S256"); }
  return `${AUTHORIZE_URL}?${q}`;
}
/** Accepts the bare `code` or the whole return URL (?code=…&state=…). The code comes back URL-encoded: decodes once. */
export function extractCode(text: string): { code: string; state: string | null } {
  const t = String(text).trim();
  if (/^https?:\/\//.test(t) || t.includes("code=")) {
    const q = new URL(t.startsWith("http") ? t : "http://x/?" + t.replace(/^\?/, "")).searchParams;
    if (q.get("error")) throw new Error(`TikTok returned an error: ${q.get("error")} ${q.get("error_description") || ""}`);
    if (!q.get("code")) throw new Error("could not find `code=` in the return URL");
    return { code: q.get("code")!, state: q.get("state") };
  }
  return { code: decodeURIComponent(t), state: null };
}

// ---------- HTTP ----------
const defaultSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function json(ctx: Ctx, url: string, opts: RequestInit): Promise<ApiResult> {
  const r = await ctx.fetchFn(url, opts);
  const txt = await r.text();
  let j: any; try { j = JSON.parse(txt); } catch { throw new Error(`TikTok answered ${r.status}: ${txt.slice(0, 200)}`); }
  return { status: r.status, ok: r.ok, j };
}
function throwOnError(res: ApiResult): any {
  const e = res.j?.error;
  if (e && e.code && e.code !== "ok") throw new Error(errorMessage(e.code, e.message));
  if (res.j?.error && typeof res.j.error === "string") throw new Error(`TikTok: ${res.j.error}${res.j.error_description ? ` (${res.j.error_description})` : ""}`);
  if (!res.ok) throw new Error(`TikTok answered ${res.status}`);
  return res.j;
}

// ---------- secrets and tokens ----------
const readJson = (ctx: Ctx, ref: string): any => { const v = ctx.secrets.get(ref); if (!v) return null; try { return JSON.parse(v); } catch { return null; } };
const now = (ctx: Ctx): Date => (ctx.now ? ctx.now() : new Date());
function saveToken(ctx: Ctx, r: any, previous: Partial<TikTokToken> = {}): TikTokToken {
  const t = now(ctx).getTime();
  const tok: TikTokToken = { access_token: r.access_token, refresh_token: r.refresh_token || previous.refresh_token, open_id: r.open_id || previous.open_id, scope: r.scope || previous.scope, expiresAt: t + (r.expires_in || 7200) * 1000, refreshExpiresAt: t + (r.refresh_expires_in || 180 * 86400) * 1000 };
  ctx.secrets.set(REF_TOKEN, JSON.stringify(tok));
  return tok;
}
async function requestToken(ctx: Ctx, client: TikTokClient, body: Record<string, string>): Promise<any> {
  const res = await json(ctx, `${API}/v2/oauth/token/`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "cache-control": "no-cache" }, body: new URLSearchParams({ client_key: client.key!, client_secret: client.secret!, ...body }).toString() });
  if (res.j.error && typeof res.j.error === "string") throw new Error(`TikTok: ${res.j.error}${res.j.error_description ? ` (${res.j.error_description})` : ""}`);
  if (!res.j.access_token) throw new Error(`TikTok did not return a token (${res.status})`);
  return res.j;
}
/** Valid access token (renewed 5 min before expiry; the refresh token changes on each renewal and is stored again). */
export async function validToken(ctx: Ctx): Promise<string> {
  const client = readJson(ctx, CLIENT_REF), tok = readJson(ctx, REF_TOKEN);
  if (!client || !tok) throw new Error("TikTok not connected: run `praeko studio account tiktok connect`");
  if (tok.expiresAt - 5 * 60e3 > now(ctx).getTime()) return tok.access_token;
  if (tok.refreshExpiresAt <= now(ctx).getTime()) throw new Error("the TikTok authorization expired (180-day refresh token): run `praeko studio account tiktok connect` again");
  const fresh = await requestToken(ctx, client, { grant_type: "refresh_token", refresh_token: tok.refresh_token });
  return saveToken(ctx, fresh, tok).access_token;
}
const auth = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8" });

// ---------- connect / status ----------
/** args: --client-key K --client-secret S --redirect https://… ; then --url <return> or --code C. `--pkce` for a desktop-type app. (The 0.1.0 --client-key / --client-secret still work.) */
export async function connect({ ctx, args = [] }: { ctx: Ctx; args?: string[] }): Promise<number> {
  const f = (k: string) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : undefined; };
  let client: TikTokClient | null = readJson(ctx, CLIENT_REF);
  const ck = f("client-key"), cs = f("client-secret");
  if (ck || cs || f("redirect")) {
    client = { ...(client || {}), ...(ck ? { key: ck } : {}), ...(cs ? { secret: cs } : {}), ...(f("redirect") ? { redirect: f("redirect") } : {}) };
    ctx.secrets.set(CLIENT_REF, JSON.stringify(client));
  }
  if (!client?.key || !client?.secret || !client?.redirect) throw new Error("usage: praeko studio account tiktok connect --client-key K --client-secret S --redirect https://your-page/return   (see docs/post-tiktok.md)");
  const log = ctx.log || console.log;
  const raw = f("url") || f("code");
  if (!raw) {
    const state = randomBytes(8).toString("hex"), pkce = args.includes("--pkce") ? pkceCode() : null;
    ctx.secrets.set("tiktok/pending", JSON.stringify({ state, verifier: pkce?.verifier || null }));
    log("1) Open this in the browser (logged in to the channel's account) and authorize:\n");
    log(authorizationUrl({ key: client.key!, redirect: client.redirect!, state, pkce }));
    log(`\n2) TikTok will redirect to ${client.redirect}?code=…  (the page may show a 404, that does not matter).\n   Copy the whole URL from the address bar and run:\n   praeko studio account tiktok connect --url "<copied URL>"`);
    return 0;
  }
  const { code, state } = extractCode(raw);
  const pend = readJson(ctx, "tiktok/pending");
  if (state && pend?.state && state !== pend.state) throw new Error("the `state` in the URL does not match the request (possibly a link from another attempt); run connect again without --url");
  const r = await requestToken(ctx, client, { grant_type: "authorization_code", code, redirect_uri: client.redirect, ...(pend?.verifier ? { code_verifier: pend.verifier } : {}) });
  const tok = saveToken(ctx, r);
  log(`✓ TikTok connected (open_id ${tok.open_id}); scopes: ${tok.scope}`);
  if (!String(tok.scope).includes("video.upload")) log("⚠ missing the video.upload scope: draft mode will not work");
  if (!String(tok.scope).includes("video.publish")) log("⚠ missing video.publish (it only comes after the app is approved for Direct Post): direct mode will not work");
  return 0;
}
export async function status({ ctx }: { ctx: Ctx }): Promise<{ connected: boolean; detail: string }> {
  const tok = readJson(ctx, REF_TOKEN);
  if (!tok || !readJson(ctx, CLIENT_REF)) return { connected: false, detail: "run `praeko studio account tiktok connect`" };
  try {
    const t = await validToken(ctx);
    const res = await json(ctx, `${API}/v2/user/info/?fields=open_id,display_name`, { method: "GET", headers: { authorization: `Bearer ${t}` } });
    const j = throwOnError(res);
    const days = Math.floor((readJson(ctx, REF_TOKEN).refreshExpiresAt - now(ctx).getTime()) / 86400e3);
    return { connected: true, detail: `${j.data?.user?.display_name || tok.open_id}; scopes ${tok.scope}; authorization valid for ${days} more days` };
  } catch (e) { return { connected: false, detail: e.message }; }
}

// ---------- publishing ----------
/** "draft" (default) | "direct". */
export const modeOf = (item: Pick<QueueItem, "options">): "draft" | "direct" => (item.options?.mode === "direct" ? "direct" : "draft");
function durationOf(ctx: Ctx, file: string): number | null {
  if (ctx.duration) return ctx.duration(file);
  try { const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }); const d = parseFloat(r.stdout); return Number.isFinite(d) ? d : null; } catch { return null; }
}

export async function plan({ item }: { item: QueueItem; ctx?: Ctx }): Promise<string[]> {
  const mode = modeOf(item), o = item.options || {};
  let size; try { size = statSync(item.video).size; } catch { size = null; }
  const linhas = [`mode: ${mode}${mode === "draft" ? " (goes to the app inbox; you set the cover and caption in the app)" : ""}`];
  if (mode === "direct") { const p = effectivePrivacy({ requested: o.privacy, audited: o.audited }); linhas.push(`privacy: ${p.level}${p.warning ? ` (${p.warning})` : ""}`); linhas.push(`cover: frame at ${o.coverMs ?? 0} ms`); }
  else linhas.push("the caption does not go through the draft API: paste it in the app (it is in the result under .praeko-studio/)");
  if (size) { const pl = chunkPlan(size, (o.chunkMB || 10) * MB); linhas.push(`video ${(size / MB).toFixed(1)} MB in ${pl.total} chunk(s) of ${(pl.chunk / MB).toFixed(1)} MB`); }
  return linhas;
}

async function sendParts(ctx: Ctx, uploadUrl: string, file: string, plan: Plan, size: number): Promise<void> {
  const fd = openSync(file, "r");
  try {
    for (const [i, p] of plan.parts.entries()) {
      const buf = Buffer.alloc(p.size);
      readSync(fd, buf, 0, p.size, p.a);
      let last: number | null = null;
      for (let t = 1; t <= 3; t++) {
        const r = await ctx.fetchFn(uploadUrl, { method: "PUT", headers: { "content-type": "video/mp4", "content-length": String(p.size), "content-range": `bytes ${p.a}-${p.b}/${size}` }, body: buf });
        if (r.status >= 500) { last = r.status; await (ctx.sleep || defaultSleep)(1000 * t); continue; }
        const lastPart = i === plan.parts.length - 1;
        if ((lastPart && r.status === 201) || (!lastPart && r.status === 206) || r.status === 200) { last = null; break; }
        if (r.status === 403) throw new Error("the upload_url expired (valid for 1 h); the item will be redone on the next attempt");
        throw new Error(`upload of chunk ${i + 1}/${plan.total} refused (${r.status})`);
      }
      if (last) throw new Error(`upload of chunk ${i + 1}/${plan.total} failed (${last}) after 3 attempts`);
    }
  } finally { closeSync(fd); }
}

async function waitUntil(ctx: Ctx, token: string, publishId: string, targets: string[]): Promise<any> {
  const pollMs = ctx.tiktok?.pollMs ?? 5000, max = ctx.tiktok?.maxPolls ?? 72, sleep = ctx.sleep || defaultSleep;
  let last: any;
  for (let i = 0; i < max; i++) {
    const j = throwOnError(await json(ctx, `${API}/v2/post/publish/status/fetch/`, { method: "POST", headers: auth(token), body: JSON.stringify({ publish_id: publishId }) }));
    last = j.data || {};
    if (last.status === "FAILED") throw new Error(`TikTok failed to process it: ${last.fail_reason || "no reason given"}`);
    if (targets.includes(last.status)) return last;
    await sleep(pollMs);
  }
  throw new Error(`TikTok has not finished yet (last status ${last?.status}); check the app and the queue`);
}

export async function publish({ item, ctx }: { item: QueueItem; ctx: Ctx }): Promise<Record<string, any>> {
  const o = item.options || {}, mode = modeOf(item), log = ctx.log || console.log;
  const size = statSync(item.video).size, plan = chunkPlan(size, (o.chunkMB || 10) * MB);
  const token = await validToken(ctx);
  // an earlier attempt already created the post? avoid duplicating
  if (item.prep?.publish_id) {
    try {
      const j = throwOnError(await json(ctx, `${API}/v2/post/publish/status/fetch/`, { method: "POST", headers: auth(token), body: JSON.stringify({ publish_id: item.prep.publish_id }) }));
      if (["SEND_TO_USER_INBOX", "PUBLISH_COMPLETE"].includes(j.data?.status)) return { id: item.prep.publish_id, mode, status: j.data.status, resumed: true };
    } catch { /* carry on and create it again */ }
  }
  let body: unknown, path: string, creator: any = null;
  if (mode === "direct") {
    const ci = throwOnError(await json(ctx, `${API}/v2/post/publish/creator_info/query/`, { method: "POST", headers: auth(token), body: "{}" })).data || {};
    creator = ci;
    const dur = durationOf(ctx, item.video);
    if (dur != null && ci.max_video_post_duration_sec && dur > ci.max_video_post_duration_sec) throw new Error(`the video is ${dur.toFixed(0)} s and this account can only post up to ${ci.max_video_post_duration_sec} s on TikTok`);
    const pv = effectivePrivacy({ requested: o.privacy, audited: o.audited, creatorOptions: ci.privacy_level_options });
    if (pv.warning) log(`⚠ TikTok: ${pv.warning}`);
    path = "/v2/post/publish/video/init/";
    body = { post_info: { title: truncate(item.texts?.text), privacy_level: pv.level, disable_duet: !!(o.disableDuet || ci.duet_disabled), disable_stitch: !!(o.disableStitch || ci.stitch_disabled), disable_comment: !!(o.disableComments || ci.comment_disabled), video_cover_timestamp_ms: o.coverMs ?? 0, brand_content_toggle: false, brand_organic_toggle: false, is_aigc: o.ai === true }, source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: plan.chunk, total_chunk_count: plan.total } };
  } else {
    path = "/v2/post/publish/inbox/video/init/";
    body = { source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: plan.chunk, total_chunk_count: plan.total } };
  }
  const init = throwOnError(await json(ctx, API + path, { method: "POST", headers: auth(token), body: JSON.stringify(body) })).data || {};
  if (!init.publish_id || !init.upload_url) throw new Error("TikTok did not return publish_id/upload_url");
  item.prep = { publish_id: init.publish_id, mode }; // stored by the queue: a new attempt checks before creating another
  await sendParts(ctx, init.upload_url, item.video, plan, size);
  const end = await waitUntil(ctx, token, init.publish_id, mode === "direct" ? ["PUBLISH_COMPLETE"] : ["SEND_TO_USER_INBOX", "PUBLISH_COMPLETE"]);
  const postId = end.publicaly_available_post_id?.[0];
  const res: Record<string, any> = { id: init.publish_id, mode, status: end.status, ...(postId && creator?.creator_username ? { url: `https://www.tiktok.com/@${creator.creator_username}/video/${postId}` } : {}) };
  if (mode === "draft") res.caption = item.texts?.text; // to paste in the app
  if (mode === "draft") log(`✓ TikTok: video is in the app inbox. Open the app, pick the cover, paste the caption and publish.\n--- caption ---\n${item.texts?.text || ""}\n---------------`);
  return res;
}

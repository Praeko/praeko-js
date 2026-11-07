// Scheduling through Buffer (https://developers.buffer.com): GraphQL API at https://api.buffer.com, key in the Bearer header.
// Buffer does not take a file: it fetches the video from a stable public URL (see hosting.ts) at publishing time.
// Everything here is pure or takes `fetchFn` as a parameter, so it tests without network.
import { formatChapters, labels, link, linkLine } from "./index.ts";
import type { Brand, NetworkName, Publication, Texts } from "./types.ts";

export const ENDPOINT = "https://api.buffer.com";
/** Short names accepted in --networks. */
export const NETWORKS: Record<string, NetworkName> = { yt: "youtube", youtube: "youtube", ig: "instagram", instagram: "instagram", tt: "tiktok", tiktok: "tiktok" };
const tags = (l?: string[]) => (l || []).join(" ");

/** "06/11 17:30" | "06/11/2026 17:30" | "2026-11-06T17:30" | ISO with offset → ISO UTC. `offset` defaults to "-03:00" (Brazil has had no daylight saving time since 2019). */
export function parseWhen(text: string, { offset = "-03:00", now = new Date() }: { offset?: string; now?: Date } = {}): string {
  const s = String(text).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?[ T]+(\d{1,2}):(\d{2})$/);
  let iso: string;
  if (m) {
    const year = m[3] ? +m[3] : now.getFullYear();
    const mk = (y: number) => `${y}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}T${String(m[4]).padStart(2, "0")}:${m[5]}:00${offset}`;
    iso = mk(year);
    if (!m[3] && new Date(iso) < now) iso = mk(year + 1); // no year and already past: next year
  } else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(s)) iso = s.replace(" ", "T") + (s.length === 16 ? ":00" : "") + offset;
  else if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/.test(s)) iso = s;
  else throw new Error(`invalid date: "${text}" (use "06/11 17:30", "06/11/2026 17:30" or "2026-11-06T17:30")`);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid date: "${text}"`);
  return d.toISOString();
}

/** Texts for each network (the same ones `texts.md` shows), ready for the queue and Buffer. */
export function textsByNetwork({ brand, publication }: { brand: Brand; publication: Publication }): Texts {
  const p = publication, R = labels(brand);
  const lk = (platform: NetworkName) => link(brand, { platform, campaign: p.campaign, format: p.format || "short" });
  const long = p.format === "long";
  const yt = [p.yt?.description || ""];
  if (p.chapters?.length) yt.push("", `⏱ ${R.chapters}`, formatChapters(p.chapters));
  if (!long && p.article) yt.push("", `📖 ${R.article}: ${p.article}`);
  if (!long && p.fullVideo) yt.push(`▶️ ${R.fullVideo}: ${p.fullVideo}`);
  yt.push("", ...linkLine(brand, () => lk("youtube")), "", tags(p.hashtags?.youtube));
  return {
    youtube: { title: p.title, text: yt.join("\n").trim(), pinnedComment: p.yt?.pinnedComment },
    instagram: { text: `${p.ig?.caption || ""}${p.hashtags?.instagram ? " " + tags(p.hashtags.instagram) : ""}`.trim(), pinnedComment: p.ig?.pinnedComment },
    tiktok: { text: `${p.tiktok?.caption || p.ig?.caption || ""}${p.hashtags?.tiktok ? " " + tags(p.hashtags.tiktok) : ""}`.trim() },
  };
}

export type BufferPost = { network: NetworkName; input: Record<string, any> };
/**
 * Builds Buffer's `CreatePostInput` (one per network). `channels`: { youtube: id, instagram: id, tiktok: id };
 * `when`: { youtube, instagram, tiktok } in ISO UTC (`all` is the fallback); `reminder`: true uses schedulingType "notification" (you publish in the app).
 */
export function buildPosts({ brand, publication, channels, videoUrl, when, networks = ["youtube", "instagram", "tiktok"], reminder = false, thumbnailMs }: {
  brand: Brand; publication: Publication; channels: Record<string, string>; videoUrl: string; when: Record<string, string | undefined>;
  networks?: string[]; reminder?: boolean; thumbnailMs?: number;
}): BufferPost[] {
  const t = textsByNetwork({ brand, publication }) as Record<string, Texts[NetworkName]>;
  const cfg = brand.publishing?.buffer || {};
  const thumbnail = thumbnailMs ?? cfg.thumbnailMs ?? 1000;
  const base = (network: string): Record<string, any> => ({
    channelId: channels[network],
    schedulingType: reminder ? "notification" : "automatic",
    mode: "customScheduled",
    dueAt: when[network] || when.all,
    needsApproval: false,
    source: "praeko-studio",
    assets: [{ video: { url: videoUrl, metadata: network === "youtube" ? undefined : { thumbnailOffset: thumbnail } } }],
  });
  const out: BufferPost[] = [];
  for (const network of networks) {
    const text = t[network];
    if (!text) throw new Error(`unknown network: ${network}`);
    const p: Record<string, any> = { ...base(network), text: text.text };
    if (network === "youtube") {
      p.metadata = { youtube: { title: t.youtube!.title, madeForKids: false, notifySubscribers: cfg.youtube?.notifySubscribers ?? true, categoryId: String(cfg.youtube?.categoryId ?? "28"), ...(cfg.youtube?.privacy ? { privacy: cfg.youtube.privacy } : {}) } };
    } else if (network === "instagram") {
      p.metadata = { instagram: { type: "reel", shouldShareToFeed: true, ...(cfg.firstComment && t.instagram!.pinnedComment ? { firstComment: t.instagram!.pinnedComment } : {}) } };
    } else p.metadata = { tiktok: {} };
    if (!p.dueAt) throw new Error(`no time set for ${network}`);
    out.push({ network: network as NetworkName, input: JSON.parse(JSON.stringify(p)) });
  }
  return out;
}

type GqlOptions = { key?: string | null; fetchFn?: typeof fetch };
/** GraphQL call. Throws with Buffer's message on error. */
export async function gql(query: string, variables: Record<string, unknown> | undefined, { key, fetchFn = fetch }: GqlOptions = {}): Promise<any> {
  if (!key) throw new Error("no Buffer key (PRAEKO_STUDIO_KEY_BUFFER_MAIN, the macOS keychain or `praeko studio schedule --key`)");
  const r = await fetchFn(ENDPOINT, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify({ query, variables: variables || {} }) });
  const txt = await r.text();
  let j: any; try { j = JSON.parse(txt); } catch { throw new Error(`Buffer answered ${r.status}: ${txt.slice(0, 200)}`); }
  if (!r.ok || j.errors?.length) throw new Error(`Buffer: ${(j.errors || []).map((e: any) => e.message).join("; ") || r.status}`);
  return j.data;
}

const Q_ORGS = `query { account { organizations { id name } } }`;
const Q_CHANNELS = `query($org: OrganizationId!) { channels(input: { organizationId: $org }) { id name displayName service isQueuePaused } }`;
export type BufferChannel = { id: string; name: string; service: string; org: string; paused: boolean };
/** All connected channels. */
export async function listChannels(op: GqlOptions): Promise<BufferChannel[]> {
  const d = await gql(Q_ORGS, {}, op);
  const list: BufferChannel[] = [];
  for (const o of d.account.organizations) {
    const c = await gql(Q_CHANNELS, { org: o.id }, op);
    for (const x of c.channels) list.push({ id: x.id, name: x.displayName || x.name, service: x.service, org: o.name, paused: !!x.isQueuePaused });
  }
  return list;
}

/** Finds each network's channel: the one set in brand.publishing.buffer.channels or the only one of the service. */
export function pickChannels({ brand, channels, networks }: { brand: Brand; channels: BufferChannel[]; networks: string[] }): { channels: Record<string, string>; missing: string[] } {
  const cfg = brand.publishing?.buffer?.channels || {};
  const output: Record<string, string> = {}, missing: string[] = [];
  for (const r of networks) {
    if (cfg[r]) { output[r] = cfg[r]; continue; }
    const found = channels.filter((c) => c.service === r);
    if (found.length === 1) output[r] = found[0]!.id;
    else missing.push(found.length ? `${r}: ${found.length} channels (${found.map((c) => `${c.name}=${c.id}`).join(", ")}); pin one in brand.publishing.buffer.channels.${r}` : `${r}: no channel connected in Buffer`);
  }
  return { channels: output, missing };
}

const M_CREATE = `mutation($input: CreatePostInput!) { createPost(input: $input) { ... on PostActionSuccess { post { id dueAt } } ... on MutationError { message } } }`;
const M_DELETE = `mutation($id: PostId!) { deletePost(input: { id: $id }) { ... on DeletePostSuccess { __typename } ... on MutationError { message } } }`;

export async function createPost(input: Record<string, any>, op: GqlOptions): Promise<{ id: string; dueAt: string }> {
  const d = await gql(M_CREATE, { input }, op);
  const r = d.createPost;
  if (r.message) throw new Error(`Buffer refused the post: ${r.message}`);
  return r.post;
}
export async function deletePost(id: string, op: GqlOptions): Promise<true> {
  const d = await gql(M_DELETE, { id }, op);
  if (d.deletePost?.message) throw new Error(`Buffer did not delete ${id}: ${d.deletePost.message}`);
  return true;
}

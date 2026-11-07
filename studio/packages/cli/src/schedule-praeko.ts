// `praeko studio schedule --via praeko`: schedules DIRECTLY on Praeko (https://praeko.app). The file is uploaded to Praeko (no R2), which creates one post with an item per network.
// Called by schedule.ts; works the same way: it only simulates without `--send`, the same schedule.json (with provider: "praeko" and postId), the same flags.
// Nothing here prints the key. `env` only exists for tests: { fetchFn, getKey, wait, clientOptions }.
import { existsSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { getKey } from "@praeko/studio-voice";
import { NETWORKS, coverFrame, praeko, textsByNetwork, parseWhen, validate } from "@praeko/studio-publish";
import type { Brand } from "@praeko/studio-publish";
import { NAME, findInFolder, findVideo, flag, has, localTime, readPublication } from "./schedule.ts";
import type { ScheduleEnv } from "./schedule.ts";
import type { Episode, Project } from "./project.ts";

const NO_KEY = "no Praeko key: echo $KEY | praeko studio schedule --via praeko --key   (praeko_… (or arauto_…) key with write scope, created in the dashboard; or the variable PRAEKO_STUDIO_KEY_PRAEKO_MAIN)";
const BUFFER_ONLY = "--reminder does not exist on Praeko: it really schedules the post (the \"only notifies\" mode is Buffer's). On TikTok the equivalent is draft mode (publishing.praeko.tiktok.mode = \"draft\", the default). For --reminder use --via buffer.";

const clientOf = (p: Project, env: ScheduleEnv, key: string) => praeko.client({ url: praeko.praekoConfig(p.brand as Brand).url, key, fetchFn: env.fetchFn || fetch, ...(env.wait ? { wait: env.wait } : {}), ...(env.clientOptions || {}) } as any);
const keyOf = (env: ScheduleEnv): string | null => (env.getKey || getKey)(praeko.KEY_REF);
const requireKey = (env: ScheduleEnv): string => keyOf(env) || (() => { throw new Error(NO_KEY); })();
const postIds = (s: any): string[] => [...new Set((s.posts || []).map((x: any) => x.postId || s.postId).filter(Boolean))] as string[];
const label = (i: any): string => praeko.STATE_LABEL[i.state] || i.state;

/** `praeko studio schedule --channels --via praeko`: the channels connected on Praeko (read only). */
export async function praekoChannels(_a: string[], { p, env = {} }: { p: Project; env?: ScheduleEnv }): Promise<number> {
  const cs = await clientOf(p, env, requireKey(env)).channels();
  if (!cs.length) { console.log("no channel on Praeko"); return 1; }
  for (const c of cs) console.log(`${String(c.network).padEnd(10)} ${String(c.id || "-").padEnd(20)} ${c.name || "-"}${c.default ? "  (default)" : ""}${c.connected ? "" : "  (not connected)"}${c.detail ? `  [${c.detail}]` : ""}`);
  console.log('\nWithout a choice, Praeko uses each network\'s default channel. To pin an account: brand.json → publishing.praeko.channels = { "youtube": "<id>", "instagram": "<id>", "tiktok": "<id>" }');
  return 0;
}

export async function schedulePraeko(a: string[], { p, ep, slug, sched, scheduleFile, env = {} }: { p: Project; ep: Episode; slug: string; sched: any; scheduleFile: string; env?: ScheduleEnv }): Promise<number> {
  const cfg: any = praeko.praekoConfig(p.brand as Brand);
  if (has(a, "reminder")) throw new Error(BUFFER_ONLY);
  if (has(a, "url")) throw new Error("--url is Buffer's (it fetches the video from a public URL). On Praeko the file is uploaded directly, no URL needed.");

  // ----- status
  if (has(a, "status")) {
    if (!sched) { console.log("nothing scheduled for this episode"); return 0; }
    const c = clientOf(p, env, requireKey(env));
    for (const id of postIds(sched)) {
      const post = await c.status(id);
      console.log(`Praeko  post ${post.id}${post.title ? `  "${post.title}"` : ""}`);
      for (const i of post.items || []) console.log(`  ${(NAME[i.network] || i.network).padEnd(10)} ${label(i).padEnd(10)} ${i.scheduledFor ? localTime(i.scheduledFor) : ""}${i.url ? `  ${i.url}` : ""}${i.warning ? `  ⚠ ${i.warning}` : ""}`);
    }
    return 0;
  }

  // ----- cancel: Praeko only cancels what is still pending (what already went out stays)
  if (has(a, "cancel")) {
    if (!sched) { console.log("nothing scheduled for this episode"); return 0; }
    const only = flag(a, "networks") ? flag(a, "networks")!.split(",").map((x) => NETWORKS[x.trim()]).filter(Boolean) : null;
    const entries = (sched.posts || []).map((x: any) => ({ ...x, postId: x.postId || sched.postId }));
    let target = postIds(sched);
    if (only) { // Praeko cancels the whole post: only networks that fill whole posts can be chosen
      target = target.filter((id) => entries.filter((x: any) => x.postId === id).every((x: any) => only.includes(x.network)));
      const outside = entries.filter((x: any) => only.includes(x.network) && !target.includes(x.postId));
      if (outside.length) throw new Error(`Praeko cancels the whole post (all of its networks): ${[...new Set(outside.map((x: any) => NAME[x.network]))].join(", ")} is together with other networks. Cancel without --networks or in the Praeko dashboard.`);
    }
    const c = clientOf(p, env, requireKey(env));
    for (const id of target) {
      const r = await c.cancel(id);
      console.log(`✓ cancelled on Praeko: ${id} (${(r.canceled || []).length} pending item(s))`);
      for (const k of r.kept || []) console.log(`  ↳ ${NAME[k.network] || k.network} stayed (${label(k)}): it already went out or is in progress, cancelling only takes what is still pending`);
    }
    if (only) { sched.posts = (sched.posts || []).filter((x: any) => !target.includes(x.postId || sched.postId)); writeFileSync(scheduleFile, JSON.stringify(sched, null, 2) + "\n"); console.log("(the other networks stayed)"); return 0; }
    renameSync(scheduleFile, scheduleFile.replace(/\.json$/, ".cancelled.json"));
    return 0;
  }

  // ----- clear: on Praeko there is no hosting to clear; it only archives the schedule, and only if nothing is pending
  if (has(a, "clear")) {
    if (!sched) { console.log("nothing scheduled for this episode"); return 0; }
    const c = clientOf(p, env, requireKey(env));
    for (const id of postIds(sched)) {
      const pending = ((await c.status(id)).items || []).filter((i: any) => praeko.PENDING.has(i.state));
      if (pending.length) throw new Error(`there are still pending item(s) in post ${id} (${pending.map((i: any) => `${NAME[i.network] || i.network}: ${label(i)}`).join(", ")}). --clear only archives after publishing; to give up use --cancel`);
    }
    console.log("On Praeko there is no hosted video to clear (the file stays with Praeko). Schedule archived.");
    renameSync(scheduleFile, scheduleFile.replace(/\.json$/, ".done.json"));
    return 0;
  }

  // ----- plan
  const publication = readPublication(ep);
  const v = validate({ brand: p.brand, publication });
  if (v.errors.length) { v.errors.forEach((e) => console.log("  ✗", e)); console.log("Fix publication.json (praeko studio package) before scheduling."); return 1; }
  const defaults = cfg.networks || (publication.format === "long" ? ["youtube", "instagram"] : ["youtube", "instagram", "tiktok"]);
  const networks: string[] = flag(a, "networks") ? flag(a, "networks")!.split(",").map((x) => NETWORKS[x.trim()] || (() => { throw new Error(`unknown network: ${x}`); })()) : defaults;
  const offset = p.brand.publishing?.timezoneOffset || "-03:00";
  const general = flag(a, "when"), when: Record<string, string> = {};
  for (const r of networks) {
    const q = flag(a, ({ youtube: "yt", instagram: "ig", tiktok: "tt" } as Record<string, string>)[r]!) || general;
    if (!q) throw new Error(`missing the time for ${NAME[r]}: use --when "06/11 17:30" (or --yt/--ig/--tt)`);
    when[r] = parseWhen(q, { offset });
    const min = praeko.leadMin(r, cfg);
    if (new Date(when[r]!) < new Date(Date.now() + min * 60e3)) throw new Error(`${NAME[r]}: ${localTime(when[r]!)} is less than ${min} minutes from now or already past`);
  }
  const video = findVideo(p, ep, publication, a);
  const mb = (statSync(video).size / 1048576).toFixed(1);
  const coverPath = flag(a, "cover") ? resolve(flag(a, "cover")!) : (findInFolder(p, publication.files?.cover) || (existsSync(ep.png) ? ep.png : null));
  const cover = coverPath && existsSync(coverPath) ? coverPath : null;
  // Instagram through Buffer: Buffer does not take a separate cover, so the Instagram item carries a copy with the cover pasted into the first 2 frames (as with --via buffer)
  let coverInFrame: string | null = null; const notes: string[] = [];
  if (networks.includes("instagram") && cfg.instagram.via === "buffer" && !has(a, "no-cover-frame")) {
    if (!cover) notes.push("no cover: the Instagram thumbnail will be a frame of the video");
    else if (publication.format === "long") notes.push("Instagram: cover not pasted into the long video (the 16:9 cover is no use as a Reel thumbnail)");
    else try { const vi = coverFrame.probe(video), ci = coverFrame.imageSize(cover); if (coverFrame.sameAspect(ci, vi)) coverInFrame = cover; else notes.push(`cover ${ci.width}x${ci.height} does not have the video's aspect ratio ${vi.width}x${vi.height}: I did not paste it into the Instagram video`); } catch (e: any) { notes.push(`could not read the cover or the video (${e.message})`); }
  } else if (!cover) notes.push("cover not found: the post goes up with the video only");
  const send = has(a, "send");
  if (sched && send && !has(a, "redo")) throw new Error("a schedule already exists (schedule.json). Check it with --status, cancel it with --cancel or use --redo");
  const repeated = networks.filter((r) => (sched?.posts || []).some((x: any) => x.network === r));
  if (repeated.length && send) throw new Error(`${repeated.map((r) => NAME[r]).join(", ")} already scheduled: cancel with --cancel before redoing (otherwise it duplicates)`);

  // channels (read only; it is a query, it publishes nothing)
  const key = keyOf(env), problems: string[] = [];
  if (!key) { if (send) throw new Error(NO_KEY); }
  else {
    try {
      const cs = await clientOf(p, env, key).channels();
      for (const r of networks) {
        const mine = cs.filter((c: any) => c.network === r), chosen = cfg.channels?.[r] ? mine.find((c: any) => c.id === cfg.channels[r]) : (mine.find((c: any) => c.default) || mine[0]);
        if (!chosen || !chosen.connected) problems.push(`${NAME[r]}: ${cfg.channels?.[r] && !chosen ? `channel ${cfg.channels[r]} not found on Praeko (praeko studio schedule --channels --via praeko)` : "is not connected on Praeko (Channels in the dashboard)"}`);
        else if (r === "instagram" && cfg.instagram.via === "meta" && !chosen.meta?.connected) problems.push('Instagram: via "meta", but the Meta API is not connected on Praeko (use publishing.praeko.instagram.via = "buffer")');
      }
    } catch (e: any) { if (send) throw e; console.log(`⚠ I could not read the Praeko channels (${e.message})`); }
  }
  if (problems.length && send) throw new Error(problems.join("\n"));

  const texts = textsByNetwork({ brand: p.brand, publication }) as Record<string, { title?: string; text: string; pinnedComment?: string }>;
  console.log(`${send ? "SCHEDULING ON PRAEKO" : "SIMULATION ON PRAEKO (nothing will be sent; use --send)"}: ${publication.title}`);
  console.log(`video: ${relative(process.cwd(), video)} (${mb} MB)${cover ? `  cover: ${basename(cover)}` : ""}`);
  const how: Record<string, string> = { youtube: "scheduled (Praeko uploads it private and schedules it)", instagram: `via ${cfg.instagram.via}`, tiktok: cfg.tiktok.mode === "direct" ? `direct (${cfg.tiktok.privacy || "SELF_ONLY"})` : "draft (lands in the app inbox)" };
  for (const r of networks) console.log(`  ${NAME[r]!.padEnd(10)} ${localTime(when[r]!)}  ${how[r]}  text ${texts[r]!.text.length} chars`);
  const placeholders = [...new Set(networks.map((r) => texts[r]!).flatMap((t) => `${t.title || ""}\n${t.text}\n${t.pinnedComment || ""}`.match(/\[[A-Z][A-Z_]{3,}\]/g) || []))];
  if (placeholders.length) { console.log(`  ✗ text with an unfilled placeholder: ${placeholders.join(", ")}`); if (send) throw new Error("fill in the placeholders in publication.json before scheduling"); }
  if (coverInFrame) console.log(`  Instagram: cover in the first 2 frames (${basename(coverInFrame)}); the copy is made on --send`);
  if (networks.includes("tiktok") && cfg.tiktok.mode === "draft") console.log("  TikTok: the draft carries no caption or cover; at the set time the video reaches the app and you paste the caption and pick the cover.");
  if (networks.includes("tiktok") && cfg.tiktok.mode === "direct") console.log("  ⚠ TikTok direct: without the app audit TikTok only accepts private (SELF_ONLY); use a private/test account.");
  [...notes, ...problems, ...v.warnings].forEach((x) => console.log("  ⚠", x));
  (publication.beforePublishing || []).forEach((x) => console.log("  ☐", x));
  if (!send) { console.log(`\nThe file goes straight to ${cfg.url} (no R2 hosting).`); return 0; }

  // ----- send
  const c = clientOf(p, env, key!), uploaded: string[] = [];
  const upload = async (file: string, type: string, name: string): Promise<string> => {
    const f = praeko.fileSource(file);
    try {
      console.log(`  uploading ${name} (${(f.size / 1048576).toFixed(1)} MB)…`);
      const m = await c.uploadMedia(f, { type, onProgress: (x: number, t: number) => { if (x < t) console.log(`    ${Math.round((100 * x) / t)}%`); } });
      uploaded.push(m.id); return m.id;
    } finally { f.close(); }
  };
  let r: any, id = slug;
  try {
    const media: { video: string; cover?: string } = { video: await upload(video, "video", "the video") };
    if (cover) media.cover = await upload(cover, "cover", "the cover");
    const networkMedia: Record<string, unknown> = {};
    if (coverInFrame) {
      const output = join(p.root, "out", `${slug}.cover.mp4`);
      coverFrame.embedCover({ video, cover: coverInFrame, output });
      console.log(`✓ cover pasted into the first 2 frames: ${relative(process.cwd(), output)}`);
      networkMedia.instagram = { video: await upload(output, "video", "the Instagram video (with the cover in the frames)") };
    }
    for (let n = 1; ; ) { // deterministic id (the slug); if a cancelled/other-network post already exists, use slug-2, slug-3…
      try { r = await c.createPost(praeko.buildPost({ brand: p.brand, publication, id, media, networkMedia, networks, when, offset })); break; }
      catch (e: any) {
        if (e.code !== "id_exists") throw e;
        const alive = ((await c.status(id)).items || []).filter((i: any) => networks.includes(i.network) && i.state !== "canceled");
        if (alive.length) throw new Error(`post "${id}" already exists on Praeko with ${alive.map((i: any) => `${NAME[i.network]} (${label(i)})`).join(", ")}. See: praeko studio schedule ${slug} --status`);
        if (++n > 9) throw e;
        id = `${slug}-${n}`;
      }
    }
  } catch (e) {
    for (const m of uploaded) { try { await c.removeMedia(m); } catch { /* in use or already gone: fine */ } } // leaves no orphan media on Praeko
    throw e;
  }
  const done = [...(sched?.posts || [])];
  for (const i of r.items || []) done.push({ network: i.network, id: i.id, dueAt: i.scheduledFor || when[i.network], ...(i.channel ? { channelId: i.channel } : {}), postId: r.id });
  writeFileSync(scheduleFile, JSON.stringify({ provider: "praeko", slug, title: publication.title, postId: r.id, videoUrl: null, createdAt: new Date().toISOString(), posts: done }, null, 2) + "\n");
  let failed = false;
  for (const i of r.items || []) {
    if (i.state === "error") failed = true;
    console.log(`${i.state === "error" ? "✗" : "✓"} ${NAME[i.network] || i.network} ${label(i)}${i.scheduledFor ? ` for ${localTime(i.scheduledFor)}` : ""} (${i.id})${i.warning ? `  ⚠ ${i.warning}` : ""}`);
  }
  console.log(`\nPost ${r.id} on Praeko. Check it: praeko studio schedule ${slug} --status · undo what is still pending: praeko studio schedule ${slug} --cancel`);
  return failed ? 1 : 0;
}

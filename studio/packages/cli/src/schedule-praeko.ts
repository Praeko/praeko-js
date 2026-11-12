// `praeko studio schedule --via praeko`: schedules DIRECTLY on Praeko (https://praeko.app). The file is uploaded to Praeko (no R2), which creates one post with an item per network.
// Called by schedule.ts; works the same way: it only simulates without `--send`, the same schedule.json (with provider: "praeko" and postId), the same flags.
// Nothing here prints the key. `env` only exists for tests: { fetchFn, getKey, wait, clientOptions }.
import { existsSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { getKey, resolvePraekoKey } from "@praeko/studio-voice";
import { NETWORKS, coverFrame, isImage, praeko, textsByNetwork, parseWhen, validate } from "@praeko/studio-publish";
import type { Brand } from "@praeko/studio-publish";
import { NAME, findInFolder, findVideo, flag, has, localTime, readPublication } from "./schedule.ts";
import type { ScheduleEnv } from "./schedule.ts";
import type { Episode, Project } from "./project.ts";
import { checkJpeg } from "./image.ts";

const NO_KEY = "no Praeko key: echo $KEY | praeko studio schedule --via praeko --key   (praeko_… (or arauto_…) key with write scope, created in the dashboard; or the variable PRAEKO_STUDIO_KEY_PRAEKO_MAIN)";
const BUFFER_ONLY = "--reminder does not exist on Praeko: it really schedules the post (the \"only notifies\" mode is Buffer's). On TikTok the equivalent is draft mode (publishing.praeko.tiktok.mode = \"draft\", the default). For --reminder use --via buffer.";

const clientOf = (p: Project, env: ScheduleEnv, key: string) => praeko.client({ url: praeko.praekoConfig(p.brand as Brand).url, key, fetchFn: env.fetchFn || fetch, ...(env.wait ? { wait: env.wait } : {}), ...(env.clientOptions || {}) } as any);
/** The Praeko key: PRAEKO_KEY > the project's profile (.praeko/config.json) > the global key. */
const keyOf = (env: ScheduleEnv, root?: string): string | null => resolvePraekoKey({ projectDir: root, get: env.getKey || getKey, ...(env.getKey ? { env: {} } : {}) }).key; // an injected getKey (tests) already answers for the environment
const requireKey = (env: ScheduleEnv, root?: string): string => keyOf(env, root) || (() => { throw new Error(NO_KEY); })();
const postIds = (s: any): string[] => [...new Set((s.posts || []).map((x: any) => x.postId || s.postId).filter(Boolean))] as string[];
const label = (i: any): string => praeko.STATE_LABEL[i.state] || i.state;

/** `praeko studio schedule --channels --via praeko`: the channels connected on Praeko (read only). */
export async function praekoChannels(_a: string[], { p, env = {} }: { p: Project; env?: ScheduleEnv }): Promise<number> {
  const cs = await clientOf(p, env, requireKey(env, p.root)).channels();
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
    const c = clientOf(p, env, requireKey(env, p.root));
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
    const c = clientOf(p, env, requireKey(env, p.root));
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
    const c = clientOf(p, env, requireKey(env, p.root));
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
  if (isImage(publication)) return scheduleImage(a, { p, ep, slug, sched, scheduleFile, env, cfg, publication, warnings: v.warnings });
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
  const key = keyOf(env, p.root), problems: string[] = [];
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

/** `schedule --via praeko` for an IMAGE piece or a CAROUSEL: one photo (`kind: "image"`) or 2 to 20 slides (`kind: "carousel"`) on Instagram (through Buffer or Meta), each file uploaded as `type: image` IN ORDER. */
async function scheduleImage(a: string[], { p, ep, slug, sched, scheduleFile, env, cfg, publication, warnings }: { p: Project; ep: Episode; slug: string; sched: any; scheduleFile: string; env: ScheduleEnv; cfg: any; publication: any; warnings: string[] }): Promise<number> {
  const networks: string[] = flag(a, "networks") ? flag(a, "networks")!.split(",").map((x) => NETWORKS[x.trim()] || (() => { throw new Error(`unknown network: ${x}`); })()) : ["instagram"];
  const other = networks.filter((r) => r !== "instagram");
  if (other.length) throw new Error(`${other.map((r) => NAME[r]).join(", ")}: image and carousel posts go only to Instagram for now (YouTube has no image posts; TikTok photo mode arrives in a later phase)`);
  const q = flag(a, "ig") || flag(a, "when");
  if (!q) throw new Error('missing the time for Instagram: use --when "06/11 17:30" (or --ig)');
  const offset = p.brand.publishing?.timezoneOffset || "-03:00", at = parseWhen(q, { offset }), min = praeko.leadMin("instagram", cfg);
  if (new Date(at) < new Date(Date.now() + min * 60e3)) throw new Error(`Instagram: ${localTime(at)} is less than ${min} minutes from now or already past`);
  const images: { file: string; alt?: string }[] = publication.images || [];
  const carousel = publication.kind === "carousel" || publication.format === "carousel";
  if (!images.length) throw new Error(`no image in publication.json: run \`praeko studio slides ${slug}\` and \`praeko studio package ${slug}\``);
  if (carousel ? images.length < 2 || images.length > 20 : images.length !== 1) throw new Error(carousel ? `${images.length} slide(s): a carousel takes 2 to 20` : `${images.length} images: an image post takes exactly one (use format: carousel for 2 to 20)`);
  const files = images.map((im) => resolve(p.root, im.file)), jpegs = files.map((f) => checkJpeg(f));
  const bad = jpegs.flatMap((j, i) => j.errors.map((e) => `${carousel ? `slide ${i + 1}: ` : ""}${e}`));
  if (bad.length) { bad.forEach((e) => console.log("  ✗", e)); throw new Error(`fix the ${carousel ? "slides" : "image"} first (\`praeko studio slides ${slug}\`)`); }
  const file = files[0]!, jpeg = jpegs[0]!, totalKB = jpegs.reduce((t, j) => t + j.bytes, 0) / 1024;
  const send = has(a, "send");
  if (sched && send && !has(a, "redo")) throw new Error("a schedule already exists (schedule.json). Check it with --status, cancel it with --cancel or use --redo");
  const texts = textsByNetwork({ brand: p.brand, publication }) as Record<string, { text: string }>;
  console.log(`${send ? "SCHEDULING ON PRAEKO" : "SIMULATION ON PRAEKO (nothing will be sent; use --send)"}: ${publication.title} (${carousel ? `carousel, ${images.length} slides` : "image post"})`);
  if (carousel) files.forEach((f, i) => console.log(`slide ${i + 1}: ${relative(process.cwd(), f)} (${jpegs[i]!.width}x${jpegs[i]!.height}, ${(jpegs[i]!.bytes / 1024).toFixed(0)} KB)`));
  else console.log(`image: ${relative(process.cwd(), file)} (${jpeg.width}x${jpeg.height}, ${(jpeg.bytes / 1024).toFixed(0)} KB)`);
  console.log(`  ${"Instagram".padEnd(10)} ${localTime(at)}  via ${cfg.instagram.via}  caption ${texts.instagram!.text.length} chars`);
  const notes = [...warnings];
  if (images.some((im) => im.alt) && cfg.instagram.via !== "meta") notes.push('the alt text is ignored when Instagram goes through Buffer (Praeko warns alt_ignored); set publishing.praeko.instagram.via = "meta" to send it');
  if (carousel && cfg.instagram.via !== "meta") notes.push("a carousel through Buffer was NOT tested live (Buffer has no official API example for it): check the first one in Buffer; Praeko warns buffer_carousel_unverified");
  notes.forEach((x) => console.log("  ⚠", x));
  (publication.beforePublishing || []).forEach((x: string) => console.log("  ☐", x));
  if (!send) { console.log(`\nThe ${carousel ? `${images.length} slides go` : "image goes"} straight to ${cfg.url} (media type image${carousel ? ` ×${images.length}, ${totalKB.toFixed(0)} KB in total` : ""}, then a post with kind ${carousel ? "carousel" : "image"}).`); return 0; }
  const key = keyOf(env, p.root); if (!key) throw new Error(NO_KEY);
  const c = clientOf(p, env, key), uploaded: string[] = [];
  let r: any, id = slug;
  try {
    const mediaIds: string[] = [];
    for (const [i, path] of files.entries()) { // one by one, in the order of the slides: the ids go to the post in that same order
      const f = praeko.fileSource(path);
      try { console.log(`  uploading ${carousel ? `slide ${i + 1} of ${files.length}` : "the image"} (${(f.size / 1024).toFixed(0)} KB)…`); const m = await c.uploadMedia(f, { type: "image" }); mediaIds.push(m.id); uploaded.push(m.id); } finally { f.close(); }
    }
    for (let n = 1; ; ) {
      try { r = await c.createPost(praeko.buildImagePost({ brand: p.brand, publication, id, images: mediaIds.map((m, i) => ({ media: m, alt: images[i]!.alt })), networks, when: { instagram: at }, offset })); break; }
      catch (e: any) {
        if (e.code !== "id_exists") throw e;
        const alive = ((await c.status(id)).items || []).filter((i: any) => i.state !== "canceled");
        if (alive.length) throw new Error(`post "${id}" already exists on Praeko (${alive.map((i: any) => label(i)).join(", ")}). See: praeko studio schedule ${slug} --status`);
        if (++n > 9) throw e;
        id = `${slug}-${n}`;
      }
    }
  } catch (e) { for (const m of uploaded) { try { await c.removeMedia(m); } catch { /* in use or gone */ } } throw e; }
  writeFileSync(scheduleFile, JSON.stringify({ provider: "praeko", slug, title: publication.title, postId: r.id, videoUrl: null, kind: carousel ? "carousel" : "image", createdAt: new Date().toISOString(), posts: (r.items || []).map((i: any) => ({ network: i.network, id: i.id, dueAt: i.scheduledFor || at, ...(i.channel ? { channelId: i.channel } : {}), postId: r.id })) }, null, 2) + "\n");
  let failed = false;
  for (const i of r.items || []) {
    if (i.state === "error") failed = true;
    console.log(`${i.state === "error" ? "✗" : "✓"} ${NAME[i.network] || i.network} ${label(i)}${i.scheduledFor ? ` for ${localTime(i.scheduledFor)}` : ""} (${i.id})${i.warning ? `  ⚠ ${i.warning}` : ""}`);
    for (const w of i.warnings || []) console.log(`  ⚠ ${w.code}: ${w.message}`);
  }
  console.log(`\nPost ${r.id} on Praeko. Check it: praeko studio schedule ${slug} --status · undo what is still pending: praeko studio schedule ${slug} --cancel`);
  return failed ? 1 : 0;
}

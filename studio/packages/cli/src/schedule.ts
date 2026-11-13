// `praeko studio schedule`: schedules the video on Buffer (YouTube, Instagram, TikTok) from the episode's publication.json.
// By default it ONLY SIMULATES (shows what would be sent). Nothing is uploaded or scheduled without `--send`.
import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { getKey, storeKey } from "@praeko/studio-voice";
import { NETWORKS, buildPosts, coverFrame, createPost, deletePost, hosting, listChannels, parseWhen, pickChannels, praeko as praekoProvider, textsByNetwork, validate } from "@praeko/studio-publish";
import type { Brand, Publication } from "@praeko/studio-publish";
import { episodeOf, findProject } from "./project.ts";
import type { Episode, Project } from "./project.ts";
import { isImagePiece } from "./compile.ts";
import { STUDIO_NPX } from "./version.ts";

const KEY_REF = "buffer/principal";
export const flag = (a: string[], k: string): string | undefined => { const i = a.indexOf("--" + k); return i >= 0 && a[i + 1] && !a[i + 1]!.startsWith("--") ? a[i + 1] : undefined; };
export const has = (a: string[], k: string): boolean => a.includes("--" + k);
export const NAME: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok" };

export function findInFolder(p: Project, name?: string | null): string | null {
  const folder = p.brand.publishing?.folder && resolve(p.root, p.brand.publishing.folder);
  if (!name || !folder || !existsSync(folder)) return null;
  const search = (d: string, n = 0): string | null => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isFile() && e.name === name) return join(d, e.name);
      if (e.isDirectory() && n < 3 && !e.name.startsWith(".")) { const r = search(join(d, e.name), n + 1); if (r) return r; }
    }
    return null;
  };
  return search(folder);
}
export function findVideo(p: Project, ep: Episode, publication: Publication, a: string[]): string {
  const f = flag(a, "video");
  if (f) return resolve(f);
  const r = findInFolder(p, publication.files?.video);
  if (r) return r;
  if (existsSync(ep.mp4)) return ep.mp4;
  throw new Error(`I did not find the video (${publication.files?.video || ep.mp4}). Use --video <file> or set publishing.folder in brand.json`);
}

export function readPublication(ep: Episode): Publication {
  const publication = JSON.parse(readFileSync(join(ep.folder, "publication.json"), "utf8"));
  const specFile = join(ep.folder, "episode.spec.json");
  if (publication.format === "long" && !publication.chapters && existsSync(specFile)) {
    const spec = JSON.parse(readFileSync(specFile, "utf8"));
    publication.chapters = spec.scenes.map((c: any) => ({ t: c.start, title: c.title.charAt(0) + c.title.slice(1).toLowerCase() }));
  }
  return publication;
}

export const localTime = (iso: string, zone = "America/Sao_Paulo"): string => new Date(iso).toLocaleString("en-GB", { timeZone: zone, dateStyle: "short", timeStyle: "short" });

/** Scheduling provider: --via, else brand.json → publishing.provider, else "buffer" (the old default; the owner switches it). */
export const PROVIDERS = ["buffer", "praeko"];
export function resolveVia(a: string[], brand?: Brand | null): { via: string; explicit: boolean } {
  if (has(a, "via") && !flag(a, "via")) throw new Error("--via needs a value: buffer or praeko");
  const explicit = flag(a, "via"), via = explicit ?? brand?.publishing?.provider ?? "buffer";
  if (!PROVIDERS.includes(via)) throw new Error(`provider "${via}" is unknown (${explicit ? "--via" : "brand.json → publishing.provider"}): use ${PROVIDERS.join(" or ")}`);
  return { via, explicit: !!explicit };
}

export type ScheduleEnv = { fetchFn?: typeof fetch; storeKey?: (ref: string, key: string) => unknown; getKey?: (ref: string) => string | null; wait?: (ms: number) => Promise<unknown>; clientOptions?: Record<string, unknown> };

// `env` only exists for tests: { fetchFn, storeKey, getKey }.
export async function schedule(a: string[], env: ScheduleEnv = {}): Promise<number> {
  const store = env.storeKey || storeKey, get = env.getKey || getKey;
  // ----- key
  if (has(a, "key")) {
    let brand: Brand | null = null; try { brand = findProject().brand; } catch { /* outside a project: only --via counts */ }
    const { via } = resolveVia(a, brand), isPraeko = via === "praeko";
    let k = flag(a, "key");
    if (!k) { const ch: Buffer[] = []; for await (const c of process.stdin) ch.push(c as Buffer); k = Buffer.concat(ch).toString().trim(); }
    if (!k) throw new Error(isPraeko ? `usage: echo $KEY | ${STUDIO_NPX} schedule --via praeko --key   (the praeko_… key comes from the Praeko dashboard, in API keys, with write scope)` : `usage: echo $KEY | ${STUDIO_NPX} schedule --key   (the key comes from publish.buffer.com/settings/api)`);
    if (isPraeko && !/^(praeko|arauto)_/.test(k)) throw new Error("that does not look like a Praeko key (they start with praeko_; the old arauto_ ones also work). Nothing was stored.");
    if (isPraeko) { store(praekoProvider.KEY_REF, k); console.log(`Praeko key stored (system keychain on macOS; secrets file elsewhere; account ${praekoProvider.KEY_REF})`); return 0; }
    store(KEY_REF, k);
    console.log("Buffer key stored (system keychain on macOS; secrets file elsewhere; account buffer/principal)");
    return 0;
  }
  const p = findProject();
  const { via: askedVia, explicit } = resolveVia(a, p.brand);
  if (askedVia === "praeko" && has(a, "channels")) return (await import("./schedule-praeko.ts")).praekoChannels(a, { p, env });
  const key = get(KEY_REF);

  // ----- channels
  if (has(a, "channels")) {
    const cs = await listChannels({ key: key ?? undefined } as any);
    if (!cs.length) { console.log("no channel connected on Buffer"); return 1; }
    for (const c of cs) console.log(`${c.service.padEnd(10)} ${c.id}  ${c.name}${c.paused ? "  (queue paused)" : ""}  [${c.org}]`);
    console.log('\nTo pin a channel: brand.json → publishing.buffer.channels = { "youtube": "<id>", "instagram": "<id>", "tiktok": "<id>" }');
    return 0;
  }

  const WITH_VALUE = new Set(["when", "networks", "yt", "ig", "tt", "video", "url", "key", "cover", "via"]);
  const slug = (() => { for (let i = 0; i < a.length; i++) { if (a[i]!.startsWith("--")) { if (WITH_VALUE.has(a[i]!.slice(2))) i++; continue; } return a[i]; } })();
  if (!slug) throw new Error(`usage: ${STUDIO_NPX} schedule <slug> --when "06/11 17:30" [--networks yt,ig,tt] [--send]\n       ${STUDIO_NPX} schedule --channels | --key | <slug> --status | --cancel | --clear   (--via praeko|buffer)`);
  const ep = episodeOf(p, slug), scheduleFile = join(ep.folder, "schedule.json");
  const sched: any = existsSync(scheduleFile) ? JSON.parse(readFileSync(scheduleFile, "utf8")) : null;
  const h = () => hosting.hostingConfig(p.brand);

  // ----- Praeko: another provider, another command file. An episode scheduled by one provider is only touched by it.
  const schedProvider = sched ? (sched.provider || "buffer") : null; // old (Buffer) schedules have no `provider`
  const operation = ["status", "cancel", "clear"].find((o) => has(a, o));
  let via = askedVia;
  if (sched && operation) {
    if (explicit && askedVia !== schedProvider) throw new Error(`this episode was scheduled by ${schedProvider === "praeko" ? "Praeko" : "Buffer"}: ${operation === "status" ? "check it" : "do that"} with --via ${schedProvider} (a provider does not touch the other's schedule)`);
    via = schedProvider; // without an explicit --via, follow the provider that created the schedule
  } else if (sched && has(a, "send") && schedProvider !== askedVia) throw new Error(`this episode was already scheduled by ${schedProvider === "praeko" ? "Praeko" : "Buffer"}: cancel it there first (${STUDIO_NPX} schedule ${slug} --cancel --via ${schedProvider}) and only then schedule with ${askedVia}`);
  if (via === "praeko") return (await import("./schedule-praeko.ts")).schedulePraeko(a, { p, ep, slug, sched, scheduleFile, env });

  if (isImagePiece(ep.folder)) throw new Error("image posts are scheduled through Praeko only: use --via praeko (Buffer's own API path here is for videos)");

  // ----- status / cancel / clear
  if (has(a, "status")) {
    if (!sched) { console.log("nothing scheduled for this episode"); return 0; }
    console.log(`video: ${sched.videoUrl}`);
    for (const x of sched.posts) console.log(`${NAME[x.network]!.padEnd(10)} ${x.id}  ${localTime(x.dueAt)}`);
    return 0;
  }
  if (has(a, "cancel") || has(a, "clear")) {
    if (!sched) { console.log("nothing scheduled for this episode"); return 0; }
    const only = flag(a, "networks") ? flag(a, "networks")!.split(",").map((x) => NETWORKS[x.trim()]).filter(Boolean) : null; // --cancel --networks yt: only some networks
    if (has(a, "cancel")) {
      for (const x of sched.posts) if (!only || only.includes(x.network)) { await deletePost(x.id, { key } as any); console.log(`✓ cancelled ${NAME[x.network]} (${x.id})`); }
      if (only) { sched.posts = sched.posts.filter((x: any) => !only.includes(x.network)); writeFileSync(scheduleFile, JSON.stringify(sched, null, 2) + "\n"); console.log("(the hosted video and the other networks stayed)"); return 0; }
    }
    if (!has(a, "keep") && sched.objectKey) { console.log(hosting.remove({ h: h(), key: sched.objectKey, cwd: p.root }) ? "✓ video removed from hosting" : "⚠ I could not remove the video from hosting"); }
    renameSync(scheduleFile, scheduleFile.replace(/\.json$/, `.${has(a, "cancel") ? "cancelled" : "done"}.json`));
    return 0;
  }

  // ----- plan
  const publication = readPublication(ep);
  const v = validate({ brand: p.brand, publication });
  if (v.errors.length) { v.errors.forEach((e) => console.log("  ✗", e)); console.log(`Fix publication.json (${STUDIO_NPX} package) before scheduling.`); return 1; }
  const defaults = (p.brand.publishing?.buffer as any)?.networks || (publication.format === "long" ? ["youtube", "instagram"] : ["youtube", "instagram", "tiktok"]);
  const networks: string[] = flag(a, "networks") ? flag(a, "networks")!.split(",").map((x) => NETWORKS[x.trim()] || (() => { throw new Error(`unknown network: ${x}`); })()) : defaults;
  const offset = p.brand.publishing?.timezoneOffset || "-03:00";
  const general = flag(a, "when");
  const when: Record<string, string> = {};
  for (const r of networks) {
    const q = flag(a, ({ youtube: "yt", instagram: "ig", tiktok: "tt" } as Record<string, string>)[r]!) || general;
    if (!q) throw new Error(`missing the time for ${NAME[r]}: use --when "06/11 17:30" (or --yt/--ig/--tt)`);
    when[r] = parseWhen(q, { offset });
    if (new Date(when[r]!) < new Date(Date.now() + 5 * 60e3)) throw new Error(`${NAME[r]}: ${localTime(when[r]!)} is less than 5 minutes from now or already past`);
  }
  const video = findVideo(p, ep, publication, a);
  const mb = (statSync(video).size / 1048576).toFixed(1);
  // cover in the first frames (the networks do not take a separate cover): only for a video and cover with the same aspect ratio
  const coverFile = has(a, "no-cover-frame") ? null : (flag(a, "cover") ? resolve(flag(a, "cover")!) : findInFolder(p, publication.files?.cover));
  let coverUsed: string | null = null, coverNote: string | null = null;
  if (coverFile && existsSync(coverFile)) {
    try { const vi = coverFrame.probe(video), ci = coverFrame.imageSize(coverFile); if (coverFrame.sameAspect(ci, vi)) coverUsed = coverFile; else coverNote = `cover ${ci.width}x${ci.height} does not have the video's aspect ratio ${vi.width}x${vi.height}: I did not paste it into the video`; } catch (e: any) { coverNote = `could not read the cover or the video (${e.message})`; }
  } else if (!has(a, "no-cover-frame")) coverNote = "cover not found: the thumbnail will be a frame of the video";
  const send = has(a, "send");
  if (sched && send && !has(a, "redo")) throw new Error("a schedule already exists (schedule.json). Check it with --status, cancel it with --cancel or use --redo");
  const repeated = networks.filter((r) => (sched?.posts || []).some((x: any) => x.network === r));
  if (repeated.length && send) throw new Error(`${repeated.map((r) => NAME[r]).join(", ")} already scheduled: cancel with --cancel before redoing (otherwise it duplicates)`);

  // channels (API read only with a key; it is a query, it publishes nothing)
  let channels: Record<string, string> = {}, missing: string[] = [];
  if (key) { try { ({ channels, missing } = pickChannels({ brand: p.brand, channels: await listChannels({ key } as any), networks })); } catch (e: any) { if (send) throw e; console.log(`⚠ I could not read the Buffer channels (${e.message})`); } }
  else if (send) throw new Error(`no Buffer key: \`echo $KEY | ${STUDIO_NPX} schedule --key\` (publish.buffer.com/settings/api)`);
  if (send && missing.length) throw new Error(missing.join("\n"));
  for (const r of networks) channels[r] ||= `<channel ${r}>`;

  const texts = textsByNetwork({ brand: p.brand, publication }) as Record<string, { title?: string; text: string; pinnedComment?: string }>;
  console.log(`${send ? "SCHEDULING" : "SIMULATION (nothing will be sent; use --send)"}: ${publication.title}`);
  console.log(`video: ${relative(process.cwd(), video)} (${mb} MB)`);
  for (const r of networks) console.log(`  ${NAME[r]!.padEnd(10)} ${localTime(when[r]!)}  channel ${channels[r]}  text ${texts[r]!.text.length} chars`);
  const placeholders = [...new Set(networks.map((r) => texts[r]!).flatMap((t) => `${t.title || ""}\n${t.text}\n${t.pinnedComment || ""}`.match(/\[[A-Z][A-Z_]{3,}\]/g) || []))];
  if (placeholders.length) { console.log(`  ✗ text with an unfilled placeholder: ${placeholders.join(", ")}`); if (send) throw new Error("fill in the placeholders in publication.json before scheduling"); }
  if (coverUsed) console.log(`  cover in the first 2 frames: ${basename(coverUsed)} (Instagram/TikTok thumbnail = frame 0)`);
  if (coverNote) console.log(`  ⚠ ${coverNote}`);
  v.warnings.forEach((x) => console.log("  ⚠", x));
  (publication.beforePublishing || []).forEach((x) => console.log("  ☐", x));
  if (has(a, "reminder")) console.log("reminder mode: Buffer only notifies you at the time, you publish in the app");
  if (!send) { console.log(`\nvideo URL: ${flag(a, "url") || "(will be hosted at " + (p.brand.publishing?.hosting?.baseUrl || "?") + ")"}`); return 0; }

  // ----- send
  let videoUrl = flag(a, "url"), objectKey: string | undefined;
  if (!videoUrl && sched?.videoUrl) { videoUrl = sched.videoUrl; objectKey = sched.objectKey; console.log(`↻ reusing the video already hosted: ${videoUrl}`); }
  let uploadFile = video;
  if (!videoUrl && coverUsed) { uploadFile = join(p.root, "out", `${slug}.cover.mp4`); coverFrame.embedCover({ video, cover: coverUsed, output: uploadFile }); console.log(`✓ cover pasted into the first 2 frames: ${relative(process.cwd(), uploadFile)}`); }
  if (!videoUrl) { const s = hosting.upload({ h: h(), slug, file: uploadFile, cwd: p.root }); videoUrl = s.url; objectKey = s.key; console.log(`✓ video hosted: ${videoUrl}`); }
  const posts = buildPosts({ brand: p.brand, publication, channels, videoUrl: videoUrl!, when, networks, reminder: has(a, "reminder"), ...(coverUsed ? { thumbnailMs: 0 } : {}) });
  const done: any[] = [...(sched?.posts || [])];
  const save = () => writeFileSync(scheduleFile, JSON.stringify({ slug, title: publication.title, videoUrl, objectKey, createdAt: new Date().toISOString(), posts: done }, null, 2) + "\n");
  for (const x of posts) {
    try {
      const r = await createPost(x.input, { key } as any);
      done.push({ network: x.network, id: r.id, dueAt: x.input.dueAt, channelId: x.input.channelId }); save();
      console.log(`✓ ${NAME[x.network]} scheduled for ${localTime(x.input.dueAt)} (${r.id})`);
    } catch (e: any) { save(); console.log(`✗ ${NAME[x.network]}: ${e.message}`); console.log(`Already created: ${done.map((f) => NAME[f.network]).join(", ") || "nothing"}. See --status; --cancel undoes it.`); return 1; }
  }
  console.log(`\nThe video stays at ${videoUrl} until it is published. After publishing: ${STUDIO_NPX} schedule ${slug} --clear`);
  return 0;
}

// `praeko studio post` / `praeko studio queue` / `praeko studio account`: direct publishing to the networks (YouTube, Instagram, TikTok), without Buffer.
// `post` puts the video in the queue (and runs right away what is "immediate", like uploading to YouTube as private); `queue run`
// runs what is due (schedule it on launchd with `queue install`); `account <network> connect` does the authorization once.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { getKey, storeKey } from "@praeko/studio-voice";
import { NETWORKS, cancelItem, enqueue, hosting, launchdPlist, parseWhen, providers, readQueue, run, textsByNetwork, validate } from "@praeko/studio-publish";
import type { Ctx, NetworkName } from "@praeko/studio-publish";
import { episodeOf, findProject } from "./project.ts";
import type { Project } from "./project.ts";
import { NAME, findInFolder, findVideo, flag, has, localTime, readPublication } from "./schedule.ts";

const STUDIO_BIN = process.argv[1]!; // the Studio executable itself (bin/praeko-studio.ts or dist/praeko-studio.mjs)
const macOnly = (): void => { if (process.platform !== "darwin") throw new Error("`queue install/remove` uses macOS launchd. On Linux/Windows schedule `praeko studio queue run` in cron/Task Scheduler, or prefer `praeko studio schedule --via praeko` (Praeko schedules on the server)."); };

/** Context handed to the providers. */
export function context(p: Project, { log = console.log }: { log?: (...a: any[]) => void } = {}): Ctx {
  const h = () => hosting.hostingConfig(p.brand);
  return {
    brand: p.brand, root: p.root, fetchFn: fetch, log, now: () => new Date(),
    secrets: { get: (ref) => getKey(ref), set: (ref, v) => storeKey(ref, v) },
    /** Uploads a file to the temporary public hosting (R2). { url, key } */
    host: async (file, slug = "media") => hosting.upload({ h: h(), slug, file, cwd: p.root }),
    removeHosted: async (key) => hosting.remove({ h: h(), key, cwd: p.root }),
  };
}

const networksOf = (a: string[], fallback: string[]): string[] => (flag(a, "networks") ? flag(a, "networks")!.split(",").map((x) => NETWORKS[x.trim()] || (() => { throw new Error(`unknown network: ${x}`); })()) : fallback);

export async function post(a: string[]): Promise<number> {
  const WITH_VALUE = new Set(["when", "networks", "yt", "ig", "tt", "video", "cover"]);
  const slug = (() => { for (let i = 0; i < a.length; i++) { if (a[i]!.startsWith("--")) { if (WITH_VALUE.has(a[i]!.slice(2))) i++; continue; } return a[i]; } })();
  if (!slug) throw new Error('usage: praeko studio post <slug> --when "06/11 17:30" [--networks yt,ig,tt] [--yt|--ig|--tt "time"] [--send]');
  const p = findProject(), ep = episodeOf(p, slug), publication = readPublication(ep);
  const v = validate({ brand: p.brand, publication });
  if (v.errors.length) { v.errors.forEach((e) => console.log("  ✗", e)); return 1; }
  const networks = networksOf(a, publication.format === "long" ? ["youtube", "instagram"] : ["youtube", "instagram", "tiktok"]);
  const all = await providers.loadAll();
  const missing = networks.filter((r) => !all[r]);
  if (missing.length) throw new Error(`provider not written yet: ${missing.join(", ")}`);
  const offset = p.brand.publishing?.timezoneOffset || "-03:00";
  const video = findVideo(p, ep, publication, a);
  const cover = flag(a, "cover") ? resolve(flag(a, "cover")!) : findInFolder(p, publication.files?.cover);
  const texts = textsByNetwork({ brand: p.brand, publication });
  const send = has(a, "send"), ctx = context(p);
  const items: any[] = [];
  for (const r of networks) {
    const prov = all[r]!;
    const q = flag(a, ({ youtube: "yt", instagram: "ig", tiktok: "tt" } as Record<string, string>)[r]!) || flag(a, "when");
    if (!q && !prov.immediate) throw new Error(`missing the time for ${NAME[r]}: --when "06/11 17:30"`);
    const when = q ? parseWhen(q, { offset }) : new Date().toISOString();
    const brandOptions = (p.brand.publishing as any)?.[r] || {};
    items.push({ slug, network: r as NetworkName, provider: r, when, video, cover: cover && existsSync(cover) ? cover : null, texts: texts[r as NetworkName], options: { ...brandOptions, ...(publication.ai?.synthetic != null && r === "youtube" ? { syntheticContent: !!publication.ai.synthetic } : {}), ...(publication.ai?.synthetic != null && r === "tiktok" ? { aiContent: !!publication.ai.synthetic } : {}) } });
  }
  console.log(`${send ? "QUEUEING" : "SIMULATION (use --send)"}: ${publication.title}`);
  console.log(`video: ${relative(process.cwd(), video)}${cover ? `  cover: ${basename(cover)}` : "  (no cover)"}`);
  for (const it of items) {
    const prov = all[it.network]!;
    console.log(`  ${NAME[it.network]!.padEnd(10)} ${prov.immediate ? "now (goes up as private, you publish)" : localTime(it.when)}  text ${it.texts.text.length} chars`);
    for (const l of (await prov.plan?.({ item: it, ctx })) || []) console.log("     " + l);
  }
  (publication.beforePublishing || []).forEach((x) => console.log("  ☐", x));
  if (!send) return 0;
  const created = items.map((it) => enqueue(p.root, it));
  await run({ root: p.root, providers: all, ctx, onlyIds: created.map((n) => n.id) });
  console.log(`\nQueue: praeko studio queue list. What is not immediate goes out at the set time if the runner is active (praeko studio queue install).`);
  return readQueue(p.root).items.some((x) => created.some((n) => n.id === x.id && x.state === "error")) ? 1 : 0;
}

export async function queue(a: string[]): Promise<number> {
  const p = findProject(), sub = a[0] && !a[0].startsWith("--") ? a[0] : "list";
  if (sub === "list") {
    const q = readQueue(p.root);
    if (!q.items.length) { console.log("queue is empty"); return 0; }
    for (const it of q.items) console.log(`${it.id}  ${it.state.padEnd(10)} ${NAME[it.network]!.padEnd(9)} ${localTime(it.when)}  ${it.slug}${it.error ? `  ✗ ${it.error.slice(0, 80)}` : ""}${it.result?.url ? "  " + it.result.url : ""}`);
    return 0;
  }
  if (sub === "run") {
    const all = await providers.loadAll();
    const r = await run({ root: p.root, providers: all, ctx: context(p), dryRun: has(a, "dry-run") });
    if (!r.done.length && !has(a, "dry-run")) console.log("nothing to do right now");
    return 0;
  }
  if (sub === "cancel") { const it = cancelItem(p.root, a[1]!); console.log(`✓ cancelled ${it.id} (${NAME[it.network]}, ${it.slug})`); return 0; }
  if (sub === "install") {
    macOnly();
    const plist = join(homedir(), "Library", "LaunchAgents", "app.praeko.studio.queue.plist");
    mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
    const minutes = +flag(a, "minutes")! || 5;
    writeFileSync(plist, launchdPlist({ node: process.execPath, bin: STUDIO_BIN, cwd: p.root, minutes, log: join(p.root, ".praeko-studio", "queue.log") }));
    try { execFileSync("launchctl", ["bootout", `gui/${process.getuid!()}`, plist], { stdio: "ignore" }); } catch { /* was not loaded */ }
    execFileSync("launchctl", ["bootstrap", `gui/${process.getuid!()}`, plist]);
    console.log(`✓ runner installed (${plist}); runs every ${minutes} min while the Mac is on. Log: .praeko-studio/queue.log`);
    return 0;
  }
  if (sub === "remove") {
    macOnly();
    const plist = join(homedir(), "Library", "LaunchAgents", "app.praeko.studio.queue.plist");
    try { execFileSync("launchctl", ["bootout", `gui/${process.getuid!()}`, plist], { stdio: "ignore" }); } catch { /* already stopped */ }
    console.log("✓ runner removed"); return 0;
  }
  throw new Error("usage: praeko studio queue [list|run [--dry-run]|cancel <id>|install [--minutes N]|remove]");
}

export async function account(a: string[]): Promise<number> {
  const network = NETWORKS[a[0]!], action = a[1] || "status";
  if (!network) throw new Error("usage: praeko studio account <youtube|instagram|tiktok> [connect|status]");
  const p = findProject(), ctx = context(p);
  const prov = await providers.load(network);
  if (action === "connect") return (await prov.connect({ ctx, args: a.slice(2) })) ?? 0;
  const s = await prov.status({ ctx });
  console.log(`${NAME[network]}: ${s.connected ? "connected" : "NOT connected"}${s.detail ? ` (${s.detail})` : ""}`);
  return s.connected ? 0 : 1;
}

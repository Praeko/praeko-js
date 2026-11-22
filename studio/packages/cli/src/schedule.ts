// `praeko studio schedule`: schedules the piece on Praeko (YouTube, Instagram, TikTok) from the episode's publication.json.
// By default it ONLY SIMULATES (shows what would be sent). Nothing is uploaded or scheduled without `--send`.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { storeKey } from "@praeko/studio-voice";
import { praeko as praekoProvider } from "@praeko/studio-publish";
import type { Brand, Publication } from "@praeko/studio-publish";
import { episodeOf, findProject } from "./project.ts";
import type { Episode, Project } from "./project.ts";
import { STUDIO_NPX } from "./version.ts";

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

/** Scheduling provider: Praeko is the only one. `--via praeko` (or brand.json → publishing.provider "praeko") is accepted; anything else is an error. */
export const PROVIDERS = ["praeko"];
export function resolveVia(a: string[], brand?: Brand | null): { via: string; explicit: boolean } {
  if (has(a, "via") && !flag(a, "via")) throw new Error("--via needs a value: praeko (the only provider)");
  const explicit = flag(a, "via"), via = explicit ?? brand?.publishing?.provider ?? "praeko";
  const where = explicit ? "--via" : "brand.json → publishing.provider";
  if (via === "buffer") throw new Error(`the Buffer provider was removed (${where}): Praeko is the only one now. Remove the option or use praeko`);
  if (!PROVIDERS.includes(via)) throw new Error(`provider "${via}" is unknown (${where}): use ${PROVIDERS.join(" or ")}`);
  return { via, explicit: !!explicit };
}

export type ScheduleEnv = { fetchFn?: typeof fetch; storeKey?: (ref: string, key: string) => unknown; getKey?: (ref: string) => string | null; wait?: (ms: number) => Promise<unknown>; clientOptions?: Record<string, unknown> };

// `env` only exists for tests: { fetchFn, storeKey, getKey, wait, clientOptions }.
export async function schedule(a: string[], env: ScheduleEnv = {}): Promise<number> {
  const store = env.storeKey || storeKey;
  if (has(a, "reminder")) throw new Error("--reminder no longer exists: it was the \"only notifies\" mode of Buffer, which was removed. Praeko really schedules the post. On TikTok the equivalent is draft mode (publishing.praeko.tiktok.mode = \"draft\", the default).");
  if (has(a, "url")) throw new Error("--url no longer exists: it was Buffer's (it fetched the video from a public URL). On Praeko the file is uploaded directly, no URL needed.");
  // ----- key
  if (has(a, "key")) {
    let brand: Brand | null = null; try { brand = findProject().brand; } catch { /* outside a project: only --via counts */ }
    resolveVia(a, brand);
    let k = flag(a, "key");
    if (!k) { const ch: Buffer[] = []; for await (const c of process.stdin) ch.push(c as Buffer); k = Buffer.concat(ch).toString().trim(); }
    if (!k) throw new Error(`usage: echo $KEY | ${STUDIO_NPX} schedule --via praeko --key   (the praeko_… key comes from the Praeko dashboard, in API keys, with write scope)`);
    if (!/^(praeko|arauto)_/.test(k)) throw new Error("that does not look like a Praeko key (they start with praeko_; the old arauto_ ones also work). Nothing was stored.");
    store(praekoProvider.KEY_REF, k);
    console.log(`Praeko key stored (system keychain on macOS; secrets file elsewhere; account ${praekoProvider.KEY_REF})`);
    return 0;
  }
  const p = findProject();
  resolveVia(a, p.brand);
  if (has(a, "channels")) return (await import("./schedule-praeko.ts")).praekoChannels(a, { p, env });

  const WITH_VALUE = new Set(["when", "networks", "yt", "ig", "tt", "video", "key", "cover", "via"]);
  const slug = (() => { for (let i = 0; i < a.length; i++) { if (a[i]!.startsWith("--")) { if (WITH_VALUE.has(a[i]!.slice(2))) i++; continue; } return a[i]; } })();
  if (!slug) throw new Error(`usage: ${STUDIO_NPX} schedule <slug> --when "06/11 17:30" [--networks yt,ig,tt] [--send]\n       ${STUDIO_NPX} schedule --channels | --key | <slug> --status | --cancel | --clear`);
  const ep = episodeOf(p, slug), scheduleFile = join(ep.folder, "schedule.json");
  const sched: any = existsSync(scheduleFile) ? JSON.parse(readFileSync(scheduleFile, "utf8")) : null;
  if (sched && sched.provider !== "praeko") throw new Error(`this episode has a schedule from the removed Buffer provider (${scheduleFile}). Cancel those posts in the Buffer app, then delete that file to schedule again on Praeko`);
  return (await import("./schedule-praeko.ts")).schedulePraeko(a, { p, ep, slug, sched, scheduleFile, env });
}

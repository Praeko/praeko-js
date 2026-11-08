// `praeko studio doctor [--json] [--offline]`: checks the environment of whoever is going to make videos. Never prints a key. Exits 1 if something required is missing (Node, ffmpeg).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { balances, getKey, loadConfig, resolveVoice, sameBalanceGroups } from "@praeko/studio-voice";
import type { AccountBalance } from "@praeko/studio-voice";
import { praeko } from "@praeko/studio-publish";
import { findProjectRoot, isLegacyLayout } from "./project.ts";
import { noticeText, readAcceptance } from "./licenses.ts";

export type Level = "ok" | "warning" | "error" | "info";
export type DoctorItem = { id: string; level: Level; msg: string; fix?: string };

const runVersion = (cmd: string, args = ["-version"]): string | null => { try { const r = spawnSync(cmd, args, { encoding: "utf8", shell: false, timeout: 15000 }); return r.status === 0 ? (r.stdout || r.stderr).split("\n")[0]!.trim() : null; } catch { return null; } };

/** Chrome that Remotion can use: the Chrome Headless Shell it downloaded in the project, or an installed Chrome/Chromium (browserExecutable). */
export function findChromium(root?: string): { where: string; path: string } | null {
  const env = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (env && existsSync(env)) return { where: "environment variable", path: env };
  if (root && existsSync(join(root, "node_modules", ".remotion"))) return { where: "downloaded by Remotion in this project", path: join(root, "node_modules", ".remotion") };
  const candidates = platform() === "darwin" ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"]
    : platform() === "win32" ? [join(process.env.PROGRAMFILES || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe")]
    : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium"];
  const c = candidates.find((x) => existsSync(x));
  return c ? { where: "installed on the system", path: c } : null;
}

const unquote = (s: string): string => s.replace(/['"]/g, "").trim();
/** First non-generic family of a CSS font list. */
export const primaryFamily = (css = ""): string | null => css.split(",").map(unquote).find((f) => f && !/^(system-ui|sans-serif|serif|monospace|ui-\w+)$/i.test(f)) || null;
export function hasFont(family: string | null): boolean {
  if (!family) return true;
  if (platform() !== "win32") { try { const r = spawnSync("fc-list", [":", "family"], { encoding: "utf8", shell: false, timeout: 15000 }); if (r.status === 0) return r.stdout.toLowerCase().includes(family.toLowerCase()); } catch { /* no fontconfig */ } }
  const dirs = platform() === "darwin" ? ["/System/Library/Fonts", "/System/Library/Fonts/Supplemental", "/Library/Fonts", join(homedir(), "Library", "Fonts")] : platform() === "win32" ? [join(process.env.WINDIR || "C:\\Windows", "Fonts")] : ["/usr/share/fonts", join(homedir(), ".fonts")];
  const target = family.toLowerCase().replace(/\s+/g, "");
  const look = (d: string, n = 0): boolean => { try { return readdirSync(d, { withFileTypes: true }).some((e) => (e.isDirectory() ? n < 2 && look(join(d, e.name), n + 1) : e.name.toLowerCase().replace(/[\s_-]+/g, "").includes(target))); } catch { return false; } };
  return dirs.some((d) => look(d));
}

/** Whether anything in the project renders with Remotion: an episode's `engine:` beats the brand's, and Remotion is the default. */
export function remotionNeeded(root: string | null, brand: any): boolean {
  const brandEngine = brand?.engine ?? "remotion";
  if (!root) return true;
  const eps = join(root, "episodes");
  const engines: string[] = [];
  if (existsSync(eps)) for (const e of readdirSync(eps, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const y = join(eps, e.name, "episode.yaml");
    if (existsSync(y)) engines.push(readFileSync(y, "utf8").match(/^engine:\s*["']?(\w+)/m)?.[1] ?? brandEngine);
  }
  return engines.length ? engines.includes("remotion") : brandEngine === "remotion";
}

const fmtN = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
type BalanceOpts = Parameters<typeof balances>[0];
/** Voice section: ElevenLabs accounts (name, balance when the key reads it, never the key), the final voice and which accounts have its id. Warnings, never errors. */
export async function voiceItems({ offline, create }: { offline: boolean; create?: NonNullable<BalanceOpts>["create"] }): Promise<DoctorItem[]> {
  const items: DoctorItem[] = [], add = (id: string, level: Level, msg: string, fix?: string) => items.push({ id, level, msg, ...(fix ? { fix } : {}) });
  let config;
  try { config = loadConfig(); } catch (e: any) { add("voice-config", "warning", `voices.json unreadable: ${e.message}`, "fix the JSON or remove the file"); return items; }
  const el = config.accounts?.elevenlabs, names = Array.isArray(el) ? el : [];
  const withKey = names.filter((n) => !!getKey(`elevenlabs/${n}`));
  let list: AccountBalance[] = [];
  if (!offline && withKey.length) list = await balances({ config, ...(create ? { create } : {}) });
  for (const n of names) {
    const c = list.find((x) => x.account === n);
    if (!withKey.includes(n)) add(`voice-account-${n}`, "info", `ElevenLabs account "${n}": no key`, `praeko studio voice account add ${n}`);
    else if (offline || !c) add(`voice-account-${n}`, "info", `ElevenLabs account "${n}": key present (balance not checked${offline ? ": --offline" : ""})`);
    else if ("error" in c) add(`voice-account-${n}`, "warning", `ElevenLabs account "${n}": balance unavailable (${c.error})`, "enable the User (read) permission on the key to see the credits");
    else add(`voice-account-${n}`, "ok", `ElevenLabs account "${n}": ${fmtN(c.remaining)} left of ${fmtN(c.limit)} (${c.plan}), resets ${c.resets ? c.resets.toISOString().slice(0, 10) : "unknown"}`);
  }
  if (!names.length) add("voice-accounts", "info", "no ElevenLabs account configured (the silent draft is free)", "praeko studio voice account add <name>");
  for (const g of sameBalanceGroups(list)) add("voice-same-balance", "warning", `${g.join(" and ")} show the SAME balance: they are probably the same workspace/plan (credits are shared)`, "failover between them does not help; use a key from another workspace");
  const alias = config.quality?.final;
  if (!alias) { add("voice-final", "info", "no final voice set (quality.final)"); return items; }
  let v;
  try { v = resolveVoice(alias, config); } catch (e: any) { add("voice-final", "warning", `final voice "${alias}": ${e.message}`); return items; }
  if (v.provider !== "elevenlabs") { add("voice-final", "info", `final voice "${alias}" (${v.provider})`); return items; }
  const ids = (v.ids || {}) as Record<string, string>;
  const haveId = names.filter((n) => ids[n]);
  add("voice-final", haveId.length ? "ok" : "info", `final voice "${alias}": id on ${haveId.length ? haveId.map((n) => `"${n}"`).join(", ") : "no account"}`);
  if (!haveId.some((n) => withKey.includes(n))) add("voice-final-id", "warning", `final voice "${alias}" has no voice id on any account that has a key: --quality final will fail`, `praeko studio voice account add <name> --voice ${alias}`);
  return items;
}

/**
 * Praeko key scope. There is no "who am I" route, so it uses the one route that REQUIRES the admin scope and only returns metadata (GET /v1/api-keys):
 * 200 = the key is admin (warning: Studio only uploads and posts, a write key is enough), 403 = a lower scope (fine), 401 = the key is not accepted.
 * Anything else (no network, odd answer) is left unsaid. Skipped with --offline. The key goes only to the Praeko URL of the project (https, or localhost).
 */
export async function praekoScopeItems({ key, brand, fetchFn = fetch }: { key: string; brand?: any; fetchFn?: typeof fetch }): Promise<DoctorItem[]> {
  let url: string;
  try { url = praeko.normalizeUrl(praeko.praekoConfig(brand).url); } catch { return []; }
  try {
    const r = await fetchFn(`${url}/v1/api-keys`, { method: "GET", headers: { authorization: `Bearer ${key}`, "x-praeko-contract": "en" }, signal: AbortSignal.timeout(6000) });
    await (r as Response).body?.cancel?.().catch(() => {});
    if (r.status === 200) return [{ id: "key-praeko-scope", level: "warning", msg: "Praeko key has the admin scope (Studio only needs to upload and create posts)", fix: "create a key with the write scope in the Praeko dashboard (API keys) and save it: echo $KEY | praeko studio schedule --via praeko --key" }];
    if (r.status === 403) return [{ id: "key-praeko-scope", level: "ok", msg: "Praeko key scope: write or read (not admin)" }];
    if (r.status === 401) return [{ id: "key-praeko-scope", level: "warning", msg: "Praeko did not accept the key (invalid, revoked or expired)", fix: "create another key in the dashboard and save it: echo $KEY | praeko studio schedule --via praeko --key" }];
  } catch { /* no network: the network line below says so */ }
  return [];
}

export async function diagnose({ offline = false, cwd = process.cwd(), fetchFn = fetch, voiceCreate }: { offline?: boolean; cwd?: string; fetchFn?: typeof fetch; voiceCreate?: NonNullable<BalanceOpts>["create"] } = {}): Promise<DoctorItem[]> {
  const items: DoctorItem[] = [], add = (id: string, level: Level, msg: string, fix?: string) => items.push({ id, level, msg, ...(fix ? { fix } : {}) });
  const major = +process.versions.node!.split(".")[0]!;
  add("node", major >= 22 ? "ok" : "error", `Node ${process.versions.node}`, major >= 22 ? undefined : "install Node 22 or newer (nodejs.org)");
  for (const b of ["ffmpeg", "ffprobe"]) { const v = runVersion(b); add(b, v ? "ok" : "error", v || `${b} not found on PATH`, v ? undefined : platform() === "darwin" ? "brew install ffmpeg" : platform() === "win32" ? "winget install ffmpeg (Windows is best effort, untested)" : "sudo apt install ffmpeg (or your distribution's package manager)"); }
  const root = findProjectRoot(cwd);
  let brand: any = null;
  if (root && !isLegacyLayout(root)) { try { brand = JSON.parse(readFileSync(join(root, "brand.json"), "utf8")); } catch { /* unreadable brand.json */ } }
  add("project", root ? (isLegacyLayout(root) ? "warning" : "ok") : "info", root ? (isLegacyLayout(root) ? `project in ${root} uses the old Portuguese layout` : `project in ${root}`) : "outside a project (no brand.json): fine for doctor; use `praeko studio init <folder>`", root && isLegacyLayout(root) ? "run `praeko studio migrate --dry-run`, then `praeko studio migrate`" : undefined);
  const needsRemotion = remotionNeeded(root, brand);
  if (!needsRemotion) add("engine", "info", "engine: hyperframes (Remotion not needed)");
  const ch = findChromium(root ?? undefined);
  if (needsRemotion) add("chromium", ch ? "ok" : "warning", ch ? `Chrome/Chromium: ${ch.where}` : "no Chrome/Chromium found", ch ? undefined : "Remotion downloads Chrome Headless Shell by itself on the first render (needs internet at that moment); or install Chrome/Chromium and set CHROME_PATH");
  else add("chromium", ch ? "ok" : "info", ch ? `Chrome/Chromium: ${ch.where}` : "no system Chrome/Chromium found", ch ? undefined : "HyperFrames manages its own browser for videos and covers (`npx hyperframes browser`)");
  if (brand) {
    for (const [k, css] of Object.entries<string>(brand.fonts || {})) { const f = primaryFamily(css); if (f && !hasFont(f)) add(`font-${k}`, "warning", `font "${f}" (brand.fonts.${k}) is not installed: the text will fall back to another font and wrap differently`, "install the font or change `fonts` in brand.json to one that exists on both systems (open fonts: Inter, Montserrat, JetBrains Mono)"); else if (f) add(`font-${k}`, "ok", `font "${f}" installed`); }
  } else add("fonts", "info", "fonts are checked inside a project (brand.json)");
  for (const [ref, name, hint] of [["elevenlabs/principal", "ElevenLabs (final voice)", "only needed for --quality final; the silent draft is free"], ["praeko/main", "Praeko key (publishing)", "create it in the dashboard (write scope, not admin); only needed to publish and upload"]] as const) {
    const has = !!getKey(ref); add(`key-${ref.split("/")[0]}`, has ? "ok" : "info", `${name}: ${has ? "present" : "absent"}`, has ? undefined : hint);
  }
  const pk = getKey("praeko/main");
  if (pk && !offline) items.push(...(await praekoScopeItems({ key: pk, brand, fetchFn })));
  items.push(...(await voiceItems({ offline, create: voiceCreate })));
  if (offline) add("network", "info", "network not checked (--offline)");
  else { try { const r = await fetchFn("https://praeko.app/", { method: "HEAD", signal: AbortSignal.timeout(6000) }); add("network", r.status < 500 ? "ok" : "warning", `praeko.app answered ${r.status}`); } catch (e: any) { add("network", "warning", `no access to praeko.app (${e.cause?.code || e.message})`, "only affects publishing; rendering and building the package work without network (after the first Chrome download)"); } }
  const ac = readAcceptance();
  add("licenses", ac ? "ok" : needsRemotion ? "warning" : "info", ac ? `license notice recorded on ${ac.acceptedAt.slice(0, 10)}` : "license notice not recorded yet", ac || !needsRemotion ? undefined : "run `praeko studio licenses --accept` after reading it (Remotion is not MIT)");
  add("system", platform() === "win32" ? "warning" : "info", `${platform()} ${process.arch}${platform() === "win32" ? ": Windows is best effort and untested" : ""}`);
  return items;
}

const ICON: Record<Level, string> = { ok: "✓", warning: "⚠", error: "✗", info: "·" };
export async function doctorCommand(a: string[], env: { cwd?: string; fetchFn?: typeof fetch } = {}): Promise<number> {
  const items = await diagnose({ offline: a.includes("--offline"), ...env });
  const failed = items.some((i) => i.level === "error");
  if (a.includes("--json")) { console.log(JSON.stringify({ ok: !failed, items }, null, 2)); return failed ? 1 : 0; }
  for (const i of items) console.log(`${ICON[i.level]} ${i.msg}${i.fix ? `\n    → ${i.fix}` : ""}`);
  const errors = items.filter((i) => i.level === "error").length, warnings = items.filter((i) => i.level === "warning").length;
  console.log(`\n${errors} error(s), ${warnings} warning(s)\n\n${noticeText()}`);
  return errors ? 1 : 0;
}

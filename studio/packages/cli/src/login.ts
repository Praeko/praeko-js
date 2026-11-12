// `praeko studio login [--profile <name>] [--no-browser] [--json] [--server <url>]`: gets the Praeko write key by sign-in with a code (device authorization,
// RFC 8628; docs/device-login.md), like `gh auth login`. The CLI asks Praeko for a short code, prints it with the address (https://praeko.app/device), tries to
// open the browser, and waits while the person, signed in to the dashboard, checks the code and the computer name and approves. Praeko then hands the key over
// ONCE; it goes straight to the profile's store (macOS Keychain, elsewhere ~/.config/praeko/secrets.json with mode 600) through `storePraekoKey`.
// The key is never printed, logged, put in --json, in an error message or in a file inside the project. Works without a TTY (an agent running setup): the agent
// only sees the code and the address, the person approves in the browser. `setup` calls `runLogin` when no key resolves for the project's profile.
import { spawn } from "node:child_process";
import { hostname as osHostname } from "node:os";
import { resolve, sep } from "node:path";
import { startDeviceLogin, waitForDeviceLogin } from "@praeko/sdk";
import type { DeviceCode, DeviceToken } from "@praeko/sdk";
import { DEFAULT_PROFILE, keychainActive, praekoKeyRef, readProjectProfile, resolvePraekoKey, secretsFile, storeKey as realStoreKey, getKey as realGetKey, storePraekoKey, validProfile } from "@praeko/studio-voice";
import { findProjectRoot } from "./project.ts";
import { VERSION } from "./version.ts";

export const DEFAULT_SERVER = "https://praeko.app";
/** The command the person (or their agent) runs to sign in again, pinned to this version. */
export const LOGIN_COMMAND = `npx @praeko/studio@${VERSION} login`;
export const loginCommandFor = (profile: string): string => (profile === DEFAULT_PROFILE ? LOGIN_COMMAND : `${LOGIN_COMMAND} --profile ${profile}`);
export const LOGIN_USAGE = "usage: praeko studio login [--profile <name>] [--no-browser] [--json] [--yes] [--server <url>]\n       (when the profile already has a key: in a terminal it asks before replacing it; with --yes, --json or no terminal it replaces it and says so)\n       (shows a code; you approve it at praeko.app/device; the key goes to your Keychain or secrets file, never to the screen)";

export type LoginEnv = {
  /** A terminal of the person's own (asks before replacing a profile's key). Default: stdin and stdout are TTYs. */
  isTTY?: boolean; ask?: (question: string) => Promise<string>;
  env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform; cwd?: string;
  fetchFn?: typeof fetch;
  storeKey?: (ref: string, key: string) => "keychain" | "file";
  getKey?: (ref: string) => string | null;
  secretsPath?: string; usesKeychain?: boolean;
  hostname?: () => string;
  /** Opens the address in the browser; resolves false when it could not. */
  openBrowser?: (url: string) => Promise<boolean>;
  /** Sleeps (tests replace it with a virtual clock). Must reject when the signal aborts. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
  /** Cancels the wait (Ctrl+C). Default: a controller tied to SIGINT while waiting. */
  signal?: AbortSignal;
  out?: (s: string) => void; err?: (s: string) => void;
};
export type LoginStatus = "authorized" | "expired" | "denied" | "cancelled" | "error";
/** What a login returns to the caller (setup): never the key. */
export type LoginOutcome = { status: LoginStatus; profile: string; keyName?: string; prefix?: string; workspace?: string; storage?: "keychain" | "file"; replaced?: boolean; message?: string };

/** https only (a key comes back in the answer); http only for localhost. */
export function normalizeServer(url: string): string {
  const u = String(url).trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^\s/]+/i.test(u) && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(u)) throw new Error("invalid Praeko URL: it must be https://… (http only for localhost)");
  return u;
}
/** The computer name sent to Praeko (it becomes the key name "Studio · <name>"): no domain suffix, only safe characters, at most 40. */
export function computerName(raw: string): string {
  const s = String(raw || "").replace(/\.(local|lan|home|localdomain)$/i, "").replace(/[^A-Za-z0-9 ._-]+/g, "-").replace(/\s+/g, " ").replace(/^[-. ]+|[-. ]+$/g, "").slice(0, 40).trim();
  return s || "computer";
}
export const osName = (p: NodeJS.Platform): string => (p === "darwin" ? "macOS" : p === "win32" ? "Windows" : p === "linux" ? "Linux" : String(p));

/** The browser command of each system (no shell, the URL is one argument). */
export function browserCommand(platform: NodeJS.Platform, url: string): [string, string[]] {
  if (platform === "darwin") return ["open", [url]];
  if (platform === "win32") return ["cmd", ["/c", "start", '""', url.replace(/&/g, "^&")]];
  return ["xdg-open", [url]];
}
function defaultOpenBrowser(platform: NodeJS.Platform): (url: string) => Promise<boolean> {
  return (url) => new Promise((ok) => {
    let done = false; const end = (v: boolean) => { if (!done) { done = true; ok(v); } };
    try {
      const [cmd, args] = browserCommand(platform, url);
      const p = spawn(cmd, args, { stdio: "ignore", detached: true, shell: false, windowsVerbatimArguments: platform === "win32" });
      p.on("error", () => end(false));
      p.on("exit", (code) => end(code === 0));
      p.unref();
      setTimeout(() => end(true), 3000).unref(); // still running (some xdg-open handlers wait): assume it opened
    } catch { end(false); }
  });
}
const defaultSleep = (ms: number, signal: AbortSignal): Promise<void> => new Promise((ok, fail) => {
  if (signal.aborted) return fail(new Error("cancelled"));
  const t = setTimeout(() => { signal.removeEventListener("abort", stop); ok(); }, ms);
  const stop = () => { clearTimeout(t); fail(new Error("cancelled")); };
  signal.addEventListener("abort", stop, { once: true });
});

type Ctx = Required<Omit<LoginEnv, "signal" | "isTTY" | "ask">> & { signal?: AbortSignal };
function context(e: LoginEnv): Ctx {
  const platform = e.platform ?? process.platform;
  return {
    env: e.env ?? process.env, platform, cwd: resolve(e.cwd ?? process.cwd()), fetchFn: e.fetchFn ?? fetch,
    storeKey: e.storeKey ?? realStoreKey, getKey: e.getKey ?? realGetKey, secretsPath: e.secretsPath ?? secretsFile(), usesKeychain: e.usesKeychain ?? keychainActive(),
    hostname: e.hostname ?? osHostname, openBrowser: e.openBrowser ?? defaultOpenBrowser(platform), sleep: e.sleep ?? defaultSleep, now: e.now ?? Date.now,
    signal: e.signal, out: e.out ?? ((s) => console.log(s)), err: e.err ?? ((s) => console.error(s)),
  };
}

/**
 * The sign-in itself, shared by `login` and `setup`. `json`: one JSON line per state on `jsonOut` (first `waiting_for_approval`, then the end); human lines on `say`.
 * Never prints, returns or logs the key.
 */
export async function runLogin(e: LoginEnv, o: { profile: string; json?: boolean; noBrowser?: boolean; server?: string; jsonOut?: (s: string) => void; say?: (s: string) => void; replacing?: boolean }): Promise<LoginOutcome> {
  const c = context(e), profile = o.profile;
  const say = o.say ?? (o.json ? c.err : c.out), jsonOut = o.jsonOut ?? c.out;
  let key = "";
  const clean = (s: string): string => (key ? s.split(key).join("[key]") : s);
  const emit = (x: Record<string, unknown>) => { if (o.json) jsonOut(clean(JSON.stringify(x))); };
  const finish = (r: LoginOutcome): LoginOutcome => {
    if (r.status !== "authorized") emit({ status: r.status, profile, message: r.message });
    return r;
  };
  if (!validProfile(profile)) return finish({ status: "error", profile, message: `invalid profile name "${profile}" (lowercase letters, digits and hyphens)` });
  // the store must not be inside the project: refuse BEFORE a key is created on Praeko
  const store = c.usesKeychain ? null : resolve(c.secretsPath), roots = [c.cwd, findProjectRoot(c.cwd)].filter(Boolean) as string[];
  if (store && roots.some((r) => store === resolve(r) || store.startsWith(resolve(r) + sep))) {
    const m = `the secrets file (${store}) is inside this project folder: a key never goes into a project. Unset PRAEKO_SECRETS or run from another folder. Nothing was requested.`;
    say(`✗ ${m}`); return finish({ status: "error", profile, message: m });
  }
  let server: string;
  try { server = normalizeServer(o.server ?? c.env.PRAEKO_URL ?? DEFAULT_SERVER); } catch (x: any) { say(`✗ ${x.message}`); return finish({ status: "error", profile, message: x.message }); }

  // network trouble while polling: count failures to back off (the SDK just retries at the same pace); a failure never prints its details
  let failures = 0, warned = false;
  const fetchFn: typeof fetch = async (u, i) => {
    try {
      const r = await c.fetchFn(u, i);
      if (r.status >= 500 || r.status === 429) failures++;
      else { if (warned) say("· connected to Praeko again"); failures = 0; warned = false; }
      return r;
    } catch (x) { failures++; throw x; }
  };

  let code: DeviceCode;
  try { code = await startDeviceLogin({ url: server, fetch: c.fetchFn, computerName: computerName(c.hostname()), os: osName(c.platform) }); }
  catch (x: any) {
    const m = x?.status === 0 ? `could not reach Praeko at ${server} (no network?). Nothing was stored; run it again when you are online.`
      : x?.status === 429 ? "Praeko is limiting sign-in requests from this network: wait a minute and run it again. Nothing was stored."
      : `Praeko refused the sign-in request (${x?.code || "error"}${x?.status ? `, HTTP ${x.status}` : ""}). Nothing was stored.`;
    say(`✗ ${m}`); return finish({ status: "error", profile, message: m });
  }
  const verificationUrl = String(code.verificationUrl || `${server}/device`);
  const complete = `${verificationUrl}?code=${encodeURIComponent(code.userCode)}`;
  const expiresIn = Math.max(1, Number(code.expiresIn) || 600), started = c.now(), deadline = started + expiresIn * 1000;
  const expiresAt = code.expiresAt || new Date(deadline).toISOString();
  emit({ status: "waiting_for_approval", verificationUrl, verificationUrlComplete: complete, userCode: code.userCode, expiresAt, profile });
  say(`Open ${verificationUrl} and type the code: ${code.userCode}`);
  say(`  (or open ${complete}; the code expires in ${Math.round(expiresIn / 60)} minutes. Approve only if you ran this command just now.)`);
  if (!o.noBrowser && /^https?:\/\//i.test(complete)) {
    const opened = await c.openBrowser(complete).catch(() => false);
    say(opened ? "· opened the browser" : "· could not open the browser: open the address above yourself");
  }
  say("Waiting for your approval in the browser… (Ctrl+C cancels; nothing is stored until you approve)");

  // Ctrl+C: abort the wait; nothing is stored
  const ac = new AbortController(), outer = c.signal;
  const onAbort = () => ac.abort(new Error("cancelled"));
  if (outer) { if (outer.aborted) onAbort(); else outer.addEventListener("abort", onAbort, { once: true }); }
  const ownSigint = !outer;
  if (ownSigint) process.once("SIGINT", onAbort);
  const wait = async (ms: number) => {
    const delay = failures ? Math.min(60_000, ms * 2 ** Math.min(failures, 4)) : ms;
    if (failures && !warned) { warned = true; say("· no answer from Praeko (network?): trying again more slowly"); }
    const left = deadline - c.now();
    if (left <= 0) throw Object.assign(new Error("expired"), { code: "expired_token" });
    await c.sleep(Math.min(delay, left), ac.signal);
    if (c.now() >= deadline) throw Object.assign(new Error("expired"), { code: "expired_token" });
  };
  let token: DeviceToken;
  try {
    token = await waitForDeviceLogin({ url: server, fetch: fetchFn, deviceCode: code.deviceCode, interval: code.interval, expiresIn, signal: ac.signal, wait });
  } catch (x: any) {
    if (ac.signal.aborted) { say("✗ cancelled: nothing was stored."); return finish({ status: "cancelled", profile, message: "cancelled: nothing was stored" }); }
    if (x?.code === "expired_token") { const m = `the code expired before it was approved. Nothing was stored. Run it again: ${loginCommandFor(profile)}`; say(`✗ ${m}`); return finish({ status: "expired", profile, message: m }); }
    if (x?.code === "access_denied") { const m = "you denied it, or the code was blocked (too many attempts). Nothing was stored."; say(`✗ ${m}`); return finish({ status: "denied", profile, message: m }); }
    if (x?.code === "invalid_grant") { const m = `this code is no longer valid (already used or unknown). Nothing was stored. Run it again: ${loginCommandFor(profile)}`; say(`✗ ${m}`); return finish({ status: "error", profile, message: m }); }
    const m = `the sign-in stopped (${x?.code || "error"}${x?.status ? `, HTTP ${x.status}` : ""}). Nothing was stored.`;
    say(`✗ ${m}`); return finish({ status: "error", profile, message: m });
  } finally { if (ownSigint) process.removeListener("SIGINT", onAbort); outer?.removeEventListener("abort", onAbort); }

  key = String(token.key || "");
  const keyName = String(token.name || "Studio"), prefix = token.prefix ? String(token.prefix) : undefined, workspace = token.workspace?.name;
  try {
    if (!key) { const m = "Praeko approved but sent no key. Nothing was stored; run it again."; say(`✗ ${m}`); return finish({ status: "error", profile, message: m }); }
    if (ac.signal.aborted) { const m = `cancelled after the approval: nothing was stored. Revoke the key "${keyName}" in the dashboard (Developers > API keys).`; say(`✗ ${m}`); return finish({ status: "cancelled", profile, keyName, message: m }); }
    let storage: "keychain" | "file";
    try { storage = storePraekoKey(profile, key, c.storeKey); }
    catch { const m = `could not store the key (the system keychain or the secrets file refused). Nothing was printed. Revoke "${keyName}" in the dashboard (Developers > API keys) and run it again.`; say(`✗ ${m}`); return finish({ status: "error", profile, keyName, message: m }); }
    const account = praekoKeyRef(profile) === "praeko/main" ? "praeko/chave" : praekoKeyRef(profile);
    const where = storage === "keychain" ? `the macOS Keychain (service praeko, account ${account})` : `${c.secretsPath} (permission 600)`;
    say(clean(`✓ approved${workspace ? ` in workspace "${workspace}"` : ""}: key "${keyName}"${prefix ? ` (${prefix}…)` : ""} stored in ${where}, profile "${profile}"${profile === DEFAULT_PROFILE ? " (the global key)" : ""}. It is never shown; revoke it any time in the dashboard (Developers > API keys).`));
    if (o.replacing) say(`⚠ profile "${profile}" already had a key: it was replaced by "${keyName}". The old key still works on Praeko until you revoke it in the dashboard (Developers > API keys).`);
    const envKey = resolvePraekoKey({ profile, get: () => null, env: c.env }).source === "env";
    if (envKey) say("⚠ PRAEKO_KEY is set in this environment and wins over the stored key: unset it to use the new one.");
    const rep = o.replacing ? { replaced: true } : {};
    emit({ status: "authorized", profile, keyName, ...(prefix ? { prefix } : {}), ...(workspace ? { workspace } : {}), storage, ...rep });
    return { status: "authorized", profile, keyName, ...(prefix ? { prefix } : {}), ...(workspace ? { workspace } : {}), storage, ...rep };
  } finally { key = ""; (token as any).key = ""; }
}

function defaultAsk(q: string): Promise<string> {
  return new Promise((ok) => { process.stderr.write(q + " "); let s = ""; const on = (d: Buffer) => { s += String(d); const i = s.indexOf("\n"); if (i >= 0) { process.stdin.removeListener("data", on); process.stdin.pause(); ok(s.slice(0, i).replace(/\r$/, "")); } }; process.stdin.resume(); process.stdin.on("data", on); });
}
const flagValue = (a: string[], k: string): string | undefined => { const i = a.indexOf("--" + k); return i >= 0 && a[i + 1] !== undefined && !a[i + 1]!.startsWith("--") ? a[i + 1] : undefined; };

/** `praeko studio login`. Exit 0 authorized, 1 expired/denied/error, 130 cancelled. */
export async function loginCommand(a: string[], e: LoginEnv = {}): Promise<number> {
  const out = e.out ?? ((s: string) => console.log(s));
  const known = new Set(["profile", "no-browser", "json", "yes", "server", "help", "lang"]);
  for (const x of a) if (x.startsWith("--") && !known.has(x.slice(2).split("=")[0]!)) {
    if (x.startsWith("--logout")) throw new Error("--logout does not exist yet: revoke the key in the dashboard (Developers > API keys) and remove it from your keychain or secrets file");
    throw new Error(`unknown option ${x}\n${LOGIN_USAGE}`);
  }
  if (a.includes("--help")) { out(LOGIN_USAGE); return 0; }
  const positional = a.filter((x, i) => !x.startsWith("--") && !["--profile", "--server", "--lang"].includes(a[i - 1]!));
  if (positional.length) throw new Error(`login takes no argument (the key is never an argument)\n${LOGIN_USAGE}`);
  const p = flagValue(a, "profile");
  if (a.includes("--profile") && (!p || !validProfile(p))) throw new Error("--profile takes a name: lowercase letters, digits and hyphens (for example my-channel)");
  const server = flagValue(a, "server");
  if (a.includes("--server") && !server) throw new Error("--server takes a URL (https://…; http only for localhost)");
  const cwd = resolve(e.cwd ?? process.cwd());
  const profile = p ?? readProjectProfile(findProjectRoot(cwd)) ?? DEFAULT_PROFILE;
  const json = a.includes("--json"), assumeYes = a.includes("--yes");
  // the profile already has a stored key (PRAEKO_KEY does not count: it is not stored): ask before replacing it in a terminal; otherwise replace and say so
  const get = e.getKey ?? realGetKey, usesKeychain = e.usesKeychain ?? keychainActive();
  let had = false;
  try { const k = resolvePraekoKey({ profile, get, env: {} }); had = !!k.key && k.source === (profile === DEFAULT_PROFILE ? "global" : "profile"); } catch { had = false; }
  if (had) {
    const where = usesKeychain ? "the macOS Keychain" : "the secrets file";
    const isTTY = e.isTTY ?? (!!process.stdin.isTTY && !!process.stdout.isTTY);
    if (isTTY && !json && !assumeYes) {
      const answer = await (e.ask ?? defaultAsk)(`Profile "${profile}" already has a Praeko key (in ${where}; not shown). Replace it with a new one from a sign-in by code? [y/N]`);
      if (!/^(y|yes|s|sim)$/i.test(answer.trim())) { out(`Kept the current key of profile "${profile}". Nothing was requested from Praeko.`); return 0; }
    } else (json ? (e.err ?? ((s: string) => console.error(s))) : out)(`· profile "${profile}" already has a Praeko key (in ${where}; not shown): it will be replaced after the approval`);
  }
  const r = await runLogin(e, { profile, json, noBrowser: a.includes("--no-browser"), server, replacing: had });
  return r.status === "authorized" ? 0 : r.status === "cancelled" ? 130 : 1;
}

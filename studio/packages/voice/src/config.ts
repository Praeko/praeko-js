// Central Praeko Studio config: voices (layered voices.json) and keys (environment, macOS keychain, secrets file).
// voices.json layers, strongest first: project (next to brand.json) > user (~/.config/praeko/studio/voices.json) > package default (no ids).
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { DEFAULT_VOICES } from "./defaults.ts";

export type VoiceDef = {
  provider: "elevenlabs" | "voicestudio" | "estimated" | string;
  model?: string;
  ids?: Record<string, string>;
  id?: string;
  aligner?: string;
  language?: string;
  settings?: Record<string, any>;
  wordsPerMin?: number;
};
export type VoicesConfig = {
  accounts?: { elevenlabs?: string[] | Record<string, unknown>; disabled?: Record<string, string> };
  voices: Record<string, VoiceDef>;
  strategy?: Record<string, string>;
  quality?: Record<string, string>;
  voicestudio?: { base?: string };
};
/** A voice resolved from a name (or from the old `{ provider, idEnv, model }` shape). */
export type ResolvedVoice = VoiceDef & { alias: string; legacyShape?: boolean };
/** The brand fields the voice package reads. */
export type VoiceBrand = { voice?: string | { provider?: string; idEnv?: string; model?: string }; pronunciation?: Record<string, string>; captionFixes?: Record<string, string> };

/** User config folder (PRAEKO_STUDIO_CONFIG overrides it; handy in CI and tests). */
export const userConfigDir = (): string => process.env.PRAEKO_STUDIO_CONFIG || join(homedir(), ".config", "praeko", "studio");
export const userVoicesFile = (): string => join(userConfigDir(), "voices.json");
/** Secrets file: PRAEKO_SECRETS or ~/.config/praeko/secrets.json (shared with the `praeko` CLI). */
export const secretsFile = (): string => process.env.PRAEKO_SECRETS || join(homedir(), ".config", "praeko", "secrets.json");
export const KEYCHAIN_SERVICE = "praeko";
/** The macOS keychain (`security`) only exists on darwin; PRAEKO_NO_KEYCHAIN=1 turns it off (tests, CI). */
export const keychainActive = (): boolean => process.platform === "darwin" && !process.env.PRAEKO_NO_KEYCHAIN;

/** Walks up from `from` until it finds brand.json: the project root. Returns null outside a project. */
export function projectRoot(from: string = process.cwd()): string | null {
  let d = resolve(from);
  for (;;) { if (existsSync(join(d, "brand.json"))) return d; const p = dirname(d); if (p === d) return null; d = p; }
}
export const projectVoicesFile = (from?: string): string | null => { const r = projectRoot(from); return r ? join(r, "voices.json") : null; };
/** Where `voice account add` writes: the project file when inside one, else the user file. */
export const writableVoicesFile = (from?: string): string => projectVoicesFile(from) || userVoicesFile();

const readJson = (file: string): any => { try { return JSON.parse(readFileSync(file, "utf8")); } catch (e) { throw new Error(`${file}: invalid JSON (${e.message})`); } };
const merge = (base: any, extra: any): VoicesConfig => ({
  ...base, ...extra,
  accounts: { ...base.accounts, ...extra.accounts }, voices: { ...base.voices, ...extra.voices }, strategy: { ...base.strategy, ...extra.strategy },
  quality: { ...base.quality, ...extra.quality }, voicestudio: { ...base.voicestudio, ...extra.voicestudio },
});

/** With `file`, reads only that file (tests and advanced use). With no argument, merges default < user < project (`from`: where to look for the project, default the current folder). */
export function loadConfig(file?: string, from?: string): VoicesConfig {
  if (file) return merge({ accounts: {}, voices: {}, strategy: {} }, readJson(file));
  let c: VoicesConfig = structuredClone(DEFAULT_VOICES);
  for (const f of [userVoicesFile(), projectVoicesFile(from)]) if (f && existsSync(f)) c = merge(c, readJson(f));
  return c;
}

/** A voice name ("my-voice") or, in the oldest shape, `{ provider, idEnv, model }`. With no ids in the file, ELEVENLABS_VOICE_ID covers the main account. */
export function resolveVoice(voice: unknown, config: VoicesConfig = loadConfig()): ResolvedVoice {
  if (typeof voice === "string") {
    const v = config.voices[voice];
    if (!v) throw new Error(`voice "${voice}" does not exist in voices.json (available: ${Object.keys(config.voices).join(", ")})`);
    if (v.provider === "elevenlabs" && !Object.keys(v.ids || {}).length && process.env.ELEVENLABS_VOICE_ID) return { alias: voice, ...v, ids: { principal: process.env.ELEVENLABS_VOICE_ID } };
    return { alias: voice, ...v };
  }
  const o = voice as { idEnv?: string; provider?: string; model?: string } | null;
  if (o && o.idEnv) {
    const id = process.env[o.idEnv];
    if (!id) throw new Error(`variable ${o.idEnv} (voice id) is not set`);
    return { alias: o.idEnv, provider: o.provider || "elevenlabs", model: o.model, ids: { principal: id }, settings: o as Record<string, any>, legacyShape: true };
  }
  throw new Error("invalid brand voice: use a voice name (string) or { provider, idEnv, model }");
}

/** Environment variables that override a key: PRAEKO_STUDIO_KEY_<REF> (REF uppercased, "/" becomes "_") and, for the main account, ELEVENLABS_API_KEY or PRAEKO_KEY. */
export const keyEnvNames = (ref: string): string[] => [`PRAEKO_STUDIO_KEY_${ref.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`, ...(ref === "elevenlabs/principal" ? ["ELEVENLABS_API_KEY"] : []), ...(ref === "praeko/main" ? ["PRAEKO_KEY"] : [])];
/** The Praeko key is the SAME one as the `praeko` CLI's (account `praeko/chave` (stored data), variable PRAEKO_KEY): Studio reads and writes it there. */
const canonical = (ref: string): string => (ref === "praeko/main" ? "praeko/chave" : ref);

const readSecrets = (): Record<string, string> => { try { return existsSync(secretsFile()) ? JSON.parse(readFileSync(secretsFile(), "utf8")) : {}; } catch { return {}; } };

/** API key of an account (`ref`: "elevenlabs/principal"). Order: environment, macOS keychain (darwin only), secrets file. Returns null if none. */
export function getKey(ref: string): string | null {
  for (const n of keyEnvNames(ref)) if (process.env[n]) return process.env[n] as string;
  const refs = [...new Set([canonical(ref), ref])];
  if (keychainActive()) for (const r of refs) {
    try {
      const k = execFileSync("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", r, "-w"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
      if (k) return k;
    } catch { /* not in the keychain */ }
  }
  const secrets = readSecrets();
  for (const r of refs) if (secrets[r]) return secrets[r] as string;
  return null;
}

/** Known accounts (`ref` names): those in the voices config and Studio's fixed ones. */
export const knownRefs = (config: VoicesConfig = loadConfig()): string[] => {
  const el = config.accounts?.elevenlabs;
  return [...new Set([...(Array.isArray(el) ? el : Object.keys(el || {})).map((n) => `elevenlabs/${n}`), ...Object.keys(config.accounts?.disabled || {}).map((n) => `elevenlabs/${n}`), "elevenlabs/principal", "buffer/principal", "praeko/main"])];
};

/** Stores a key: macOS keychain on darwin; elsewhere the secrets file (mode 600 where the OS honors it; on Windows use an environment variable). Returns where it went. */
export function storeKey(ref: string, key: string): "keychain" | "file" {
  ref = canonical(ref);
  if (keychainActive()) {
    execFileSync("security", ["add-generic-password", "-U", "-s", KEYCHAIN_SERVICE, "-a", ref, "-w", key], { stdio: ["ignore", "ignore", "pipe"] });
    return "keychain";
  }
  const f = secretsFile();
  mkdirSync(dirname(f), { recursive: true });
  const s = readSecrets(); s[ref] = key;
  writeFileSync(f, JSON.stringify(s, null, 2) + "\n", { mode: 0o600 });
  if (process.platform !== "win32") chmodSync(f, 0o600);
  return "file";
}

/** Masks a key for logs. */
export const maskKey = (k: string | null | undefined): string => (k ? `${k.slice(0, 3)}…${k.slice(-2)}` : "(no key)");

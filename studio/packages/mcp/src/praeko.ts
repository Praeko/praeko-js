// The bridge to Praeko (https://praeko.app): finds the person's key the way the Studio does (environment, macOS Keychain, secrets file), builds an `@praeko/sdk` client
// and uploads files. The key lives only inside this process: it is never returned, logged or put in an error (every message is scrubbed with it).
//
// The service URL is NOT read from brand.json: an agent can write that file (studio_brief_write), and a URL it chose would receive the key. Only the server's own
// options and the PRAEKO_URL environment variable (set by whoever installs the server) can change it.
import { getKey } from "@praeko/studio-voice";
import { Praeko, PraekoError } from "@praeko/sdk";
import { uploadFile } from "@praeko/sdk/node";
import type { Media } from "@praeko/sdk";
import { maskSecrets } from "./mask.ts";
import { UserError } from "./paths.ts";

export const DEFAULT_URL = "https://praeko.app";
export const KEY_REF = "praeko/main";

export type PraekoOptions = {
  /** Test hooks. Defaults: the Studio's key lookup, global fetch, PRAEKO_URL or https://praeko.app. */
  getKey?: (ref: string) => string | null; fetchFn?: typeof fetch; url?: string; wait?: (ms: number) => Promise<void>;
};

/** https only (the key travels in a header); http only for localhost. */
export function normalizeUrl(url: string): string {
  const u = String(url).trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^\s/]+/i.test(u) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(u)) throw new UserError("invalid Praeko URL: it must be https://… (http only for localhost)");
  return u;
}
export const serviceUrl = (o: PraekoOptions = {}): string => normalizeUrl(o.url ?? process.env.PRAEKO_URL ?? DEFAULT_URL);

export const NO_KEY = "no Praeko key found. The person must save one (a key with the write scope, created in the Praeko dashboard): set PRAEKO_KEY in the server's environment, or run `praeko studio schedule --via praeko --key` in a terminal. Never ask for the key in the chat.";

/** The key, or null. */
export const findKey = (o: PraekoOptions = {}): string | null => (o.getKey ?? getKey)(KEY_REF) || null;

export function makeClient(key: string, o: PraekoOptions = {}): Praeko {
  return new Praeko({ url: serviceUrl(o), key, ...(o.fetchFn ? { fetch: o.fetchFn } : {}), retries: 3, ...(o.wait ? { wait: o.wait } : {}) } as any);
}

/** One-line, scrubbed description of a failure from the SDK (never contains the key). */
export function describeError(e: unknown, key: string): string {
  const msg = e instanceof PraekoError ? `Praeko answered ${e.status} ${e.code}: ${e.message}` : String((e as Error)?.message ?? e);
  return maskSecrets(msg, [key]);
}

export type KeyScope = "admin" | "limited" | "invalid" | "unknown";
/**
 * Whether the key has the admin scope. There is no "who am I" route, so it asks for the API keys list (GET /v1/api-keys), the one route that REQUIRES admin and
 * only returns metadata (never a secret): 200 means admin, 403 means a lower scope (write or read), 401 means the key itself is not accepted.
 */
export async function keyScope(key: string, o: PraekoOptions = {}): Promise<{ scope: KeyScope; detail?: string }> {
  try {
    const f = o.fetchFn ?? fetch;
    const r = await f(`${serviceUrl(o)}/v1/api-keys`, { method: "GET", headers: { authorization: `Bearer ${key}`, "x-praeko-contract": "en" }, signal: AbortSignal.timeout(8000) });
    await r.body?.cancel().catch(() => {});
    if (r.status === 200) return { scope: "admin" };
    if (r.status === 403) return { scope: "limited" };
    if (r.status === 401) return { scope: "invalid", detail: "Praeko did not accept the key (invalid, revoked or expired)" };
    return { scope: "unknown", detail: `Praeko answered HTTP ${r.status}` };
  } catch (e: any) { return { scope: "unknown", detail: maskSecrets(`could not reach Praeko (${e?.cause?.code || e?.message || e})`, [key]) }; }
}

export const ADMIN_WARNING = "The Praeko key found has the admin scope. Studio only needs to upload files: create a key with the write scope in the Praeko dashboard (API keys) and use it instead, so a leak or a mistake cannot manage keys.";

export type Uploaded = { slide?: number; role: "video" | "cover" | "image"; mediaId: string; type: string; bytes: number; state: string };
/** Uploads one file with the SDK (`type` is chosen by the caller, never by the agent). Returns only what the agent may know. */
export async function upload(client: Praeko, path: string, role: "video" | "cover" | "image"): Promise<Uploaded> {
  const m: Media = await uploadFile(client, path, { type: role });
  return { role, mediaId: m.id, type: m.type, bytes: m.size, state: m.state };
}

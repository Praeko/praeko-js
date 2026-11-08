// Two-step confirmation (same pattern as the remote Praeko MCP): the first call of a tool that spends something returns a PREVIEW and a short code; only a second call with
// `confirm: "<code>"` and exactly the same arguments runs. A code is random, bound to ONE tool + the hash of its arguments (plus anything the caller binds in, such as a file
// fingerprint), expires, works once and dies after a few wrong tries. State lives only in the memory of this process: a restart forgets every pending code.
import { createHash, randomInt } from "node:crypto";

export const CONFIRM_TTL_MS = 10 * 60_000;
const MAX_PENDING = 32;
const MAX_WRONG = 5;
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // no 0/O/1/I/L: the code passes through a model and a person

/** Canonical JSON (sorted keys, undefined dropped): the same arguments always hash the same. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().filter((k) => (v as any)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical((v as any)[k])}`).join(",")}}`;
  return JSON.stringify(v) ?? "null";
}
const digest = (text: string): string => createHash("sha256").update(text).digest("hex");
const normalize = (code: string): string => String(code).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
const newCode = (): string => { const s = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(""); return `${s.slice(0, 4)}-${s.slice(4)}`; };

export type Verdict = { ok: true } | { ok: false; reason: "unknown_code" | "expired" | "tool_changed" | "arguments_changed" | "too_many_tries"; message: string };
type Entry = { tool: string; bind: string; expiresAt: number; wrong: number };

export class Confirmations {
  private pending = new Map<string, Entry>(); // key: sha256(normalized code), so the code itself is not kept
  private now: () => number; readonly ttlMs: number;
  constructor(now: () => number = Date.now, ttlMs: number = CONFIRM_TTL_MS) { this.now = now; this.ttlMs = ttlMs; }

  /** `args` are the arguments WITHOUT `confirm`; `extra` is anything else the confirmation must stay true to (file sizes, a script hash). */
  issue(tool: string, args: unknown, extra: unknown = null): { code: string; expiresAt: Date; expiresInSeconds: number } {
    const t = this.now();
    for (const [k, e] of this.pending) if (e.expiresAt <= t) this.pending.delete(k);
    while (this.pending.size >= MAX_PENDING) this.pending.delete(this.pending.keys().next().value!);
    const code = newCode();
    this.pending.set(digest(normalize(code)), { tool, bind: digest(canonical({ args, extra })), expiresAt: t + this.ttlMs, wrong: 0 });
    return { code, expiresAt: new Date(t + this.ttlMs), expiresInSeconds: Math.round(this.ttlMs / 1000) };
  }

  /** Checks a code WITHOUT using it (so a run that cannot even start leaves the code valid). Call `burn` once the work really started. */
  verify(tool: string, args: unknown, extra: unknown, code: string): Verdict {
    const k = digest(normalize(code)), e = this.pending.get(k);
    if (!e) return { ok: false, reason: "unknown_code", message: "confirmation code not found (wrong, already used, or the server was restarted). Call the tool again without `confirm` to get a new preview." };
    if (e.expiresAt <= this.now()) { this.pending.delete(k); return { ok: false, reason: "expired", message: "this confirmation code expired. Request a new preview and show it to the person again." }; }
    if (e.tool !== tool) return { ok: false, reason: "tool_changed", message: `this code belongs to ${e.tool}, not ${tool}.` };
    if (e.bind !== digest(canonical({ args, extra }))) {
      if (++e.wrong >= MAX_WRONG) { this.pending.delete(k); return { ok: false, reason: "too_many_tries", message: "the arguments (or the files) differ from the ones that were previewed too many times: the code is void. Request a new preview." }; }
      return { ok: false, reason: "arguments_changed", message: "the arguments (or the files they point to) differ from the ones that were previewed. Any change voids the code: request a new preview with the final arguments and show it to the person." };
    }
    return { ok: true };
  }
  burn(code: string): void { this.pending.delete(digest(normalize(code))); }
  get size(): number { return this.pending.size; }
}

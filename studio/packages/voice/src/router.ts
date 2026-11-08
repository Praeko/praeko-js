// Voice router: picks the account, checks the balance and switches account when the quota runs out or the key fails.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getKey, loadConfig, resolveVoice } from "./config.ts";
import type { ResolvedVoice, VoicesConfig } from "./config.ts";
import { classifyError, createElevenLabs } from "./providers/elevenlabs.ts";
import type { Balance, VoiceProvider } from "./providers/elevenlabs.ts";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type Attempt = { account: string; reason: string };
type Factory = (account: string, key: string) => VoiceProvider;

/**
 * Generates the narration trying accounts in order. Returns `{ buffer, account, attempts }`.
 * - balance: skips the account if `remaining` < the text's characters;
 * - quota (402 / quota_exceeded) and auth (401/403): next account;
 * - rate limit (429): waits and retries (up to `retries`), then next account;
 * - server/network: retries once, then next account;
 * - text (400/422): stops and shows the error.
 * `create(account, key)` and `wait(ms)` are injectable in tests.
 */
export async function generateWithFailover({ text, voice, config = loadConfig(), create, wait = sleep, retries = 2, log = () => {}, noFailover = false }: {
  text: string; voice: unknown; config?: VoicesConfig; create?: Factory; wait?: (ms: number) => Promise<void>; retries?: number; log?: (m: string) => void; noFailover?: boolean;
}): Promise<{ buffer: Buffer; account: string; attempts: Attempt[] }> {
  const v: ResolvedVoice = typeof voice === "object" && voice && (voice as any).provider && ((voice as any).ids || (voice as any).id) && !(voice as any).idEnv ? (voice as ResolvedVoice) : resolveVoice(voice, config);
  if (v.provider !== "elevenlabs") throw new Error(`router: provider "${v.provider}" is not supported here yet`);
  const factory: Factory = create || ((_account, key) => createElevenLabs({ key }));
  const el = config.accounts?.elevenlabs;
  const accounts = ((Array.isArray(el) ? el : undefined) || Object.keys(v.ids || {})).filter((c) => v.ids?.[c]);
  const candidates = noFailover ? accounts.slice(0, 1) : accounts;
  const attempts: Attempt[] = [];
  if (!candidates.length) throw new Error(`voice "${v.alias}": no account has a voice id (voices.json → ids)`);
  for (const account of candidates) {
    const key = getKey(`elevenlabs/${account}`);
    if (!key) { attempts.push({ account, reason: "no key" }); log(`[voice] ${account}: no key, skipping`); continue; }
    const provider = factory(account, key);
    try {
      const s = await provider.balance();
      if (s.remaining < text.length) { attempts.push({ account, reason: `insufficient balance (${s.remaining} < ${text.length})` }); log(`[voice] ${account}: balance ${s.remaining} < ${text.length}, skipping`); continue; }
      log(`[voice] ${account}: balance ${s.remaining} of ${s.limit}`);
    } catch (e) {
      log(`[voice] ${account}: balance unavailable (${e.message}); trying anyway`);
    }
    let done = 0;
    for (;;) {
      try {
        const buffer = await provider.generate({ text, id: (v.ids as Record<string, string>)[account] as string, model: v.model, settings: v.settings });
        attempts.push({ account, reason: "ok" });
        return { buffer, account, attempts };
      } catch (e) {
        const kind = classifyError(e);
        log(`[voice] ${account}: error ${kind} (${e.statusCode ?? e.message})`);
        if (kind === "text") throw new Error(`text rejected by the provider: ${e.message}`);
        if ((kind === "rate" && done < retries) || ((kind === "server" || kind === "network") && done < 1)) { done++; await wait(kind === "rate" ? 5000 * done : 2000); continue; }
        attempts.push({ account, reason: kind });
        break; // next account
      }
    }
  }
  const summary = attempts.map((t) => `${t.account}: ${t.reason}`).join("; ");
  throw new Error(`no account could generate the voice (${summary})`);
}

export function saveBuffer(buffer: Buffer, file: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buffer);
}

export type AccountBalance = ({ account: string } & Balance) | { account: string; error: string };
/** Balance of every configured account. */
export async function balances({ config = loadConfig(), create }: { config?: VoicesConfig; create?: Factory } = {}): Promise<AccountBalance[]> {
  const factory: Factory = create || ((_a, key) => createElevenLabs({ key }));
  const out: AccountBalance[] = [];
  const el = config.accounts?.elevenlabs;
  for (const account of Array.isArray(el) ? el : []) {
    const key = getKey(`elevenlabs/${account}`);
    if (!key) { out.push({ account, error: "no key" }); continue; }
    try { out.push({ account, ...(await factory(account, key).balance()) }); } catch (e) { out.push({ account, error: e.message }); }
  }
  return out;
}

/** Groups of accounts that show the SAME balance (same used, limit and renewal date): they are probably one workspace, so credits are shared and failover would not help. */
export function sameBalanceGroups(list: AccountBalance[]): string[][] {
  const seen = new Map<string, string[]>();
  for (const c of list) { if ("error" in c) continue; const k = `${c.used}|${c.limit}|${c.resets?.getTime()}`; seen.set(k, [...(seen.get(k) || []), c.account]); }
  return [...seen.values()].filter((l) => l.length > 1);
}

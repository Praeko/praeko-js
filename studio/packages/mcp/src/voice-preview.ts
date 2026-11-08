// Preview of a FINAL voice (it spends the person's ElevenLabs characters): how many characters the script has, which account the Studio would use and its balance.
// Uses the Studio's own voice package (same config layers, same account order and balance rule as the router), so the preview matches what the job will do.
// Never returns a key; the only thing read from a key is the balance, from the account's own API.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { applyPronunciation, balances, getKey, loadConfig, readBlocks, resolveVoice } from "@praeko/studio-voice";
import { UserError } from "./paths.ts";

type BalanceOpts = NonNullable<Parameters<typeof balances>[0]>;
export type VoiceHooks = { create?: BalanceOpts["create"] };

export type AccountView = { account: string; hasKey: boolean; remaining?: number; limit?: number; plan?: string; resetsOn?: string | null; balanceError?: string };
export type FinalVoicePreview = {
  episode: string; voice: string; provider: string; format: "short" | "long"; scriptCharacters: number; free: boolean;
  accounts: AccountView[]; willUse: AccountView | null; sufficient: boolean; warnings: string[]; notes: string[];
};

/** Reads what the final voice depends on, with no network: the script, the voice and the character count. `bind` goes into the confirmation code. */
export function finalVoiceContext(root: string, folder: string, slug: string) {
  const scriptFile = join(folder, "script.txt");
  if (!existsSync(scriptFile)) throw new UserError(`episodes/${slug}/script.txt does not exist: write the script first (studio_write_script)`);
  if (existsSync(join(folder, "cut.json"))) throw new UserError(`"${slug}" is a cut derived from a long video: its voice comes from there (make the long video's voice, then re-cut)`);
  const script = readFileSync(scriptFile, "utf8");
  let brand: any = {};
  try { brand = JSON.parse(readFileSync(join(root, "brand.json"), "utf8")); } catch { /* validated when the project was opened */ }
  let config, v;
  try { config = loadConfig(undefined, root); } catch (e: any) { throw new UserError(`voices.json is unreadable: ${e.message}`); }
  const alias = config.quality?.["final"] || brand.voice;
  if (!alias) throw new UserError('no final voice is set: add `quality.final` to voices.json (or `voice` to brand.json)');
  try { v = resolveVoice(alias, config); } catch (e: any) { throw new UserError(`final voice: ${e.message}`); }

  const blocks = readBlocks(script);
  const spoken = (t: string): number => applyPronunciation(t.trim(), brand.pronunciation).length;
  const scriptCharacters = blocks.length ? blocks.reduce((n, b) => n + spoken(b.text), 0) : spoken(script);
  if (!scriptCharacters) throw new UserError(`episodes/${slug}/script.txt is empty`);
  const bind = { script: createHash("sha1").update(script).digest("hex"), voice: String(v.alias), characters: scriptCharacters };
  return { config, v, blocks: blocks.length, scriptCharacters, slug, bind };
}
export type FinalVoiceContext = ReturnType<typeof finalVoiceContext>;

/** Adds the part that needs the network: the balance of each account (ElevenLabs' own API, with the person's key, which is never returned). */
export async function previewFinalVoice(ctx: FinalVoiceContext, hooks: VoiceHooks = {}): Promise<FinalVoicePreview> {
  const { config, v, scriptCharacters, slug } = ctx, blocks = { length: ctx.blocks };
  const warnings: string[] = [], notes: string[] = [];
  const base = { episode: slug, voice: String(v.alias), provider: v.provider, format: (blocks.length ? "long" : "short") as "short" | "long", scriptCharacters };

  if (v.provider !== "elevenlabs") {
    notes.push(`the voice "${v.alias}" runs with the "${v.provider}" provider: no ElevenLabs characters are spent`);
    return { ...base, free: true, accounts: [], willUse: null, sufficient: true, warnings, notes };
  }

  const el = config.accounts?.elevenlabs, ids = (v.ids || {}) as Record<string, string>;
  const candidates = ((Array.isArray(el) ? el : undefined) || Object.keys(ids)).filter((c: string) => ids[c]);
  if (!candidates.length) throw new UserError(`voice "${v.alias}": no ElevenLabs account has a voice id (voices.json)`);
  const list = await balances({ config, ...(hooks.create ? { create: hooks.create } : {}) });
  const accounts: AccountView[] = candidates.map((account: string) => {
    const hasKey = !!getKey(`elevenlabs/${account}`), b = list.find((x) => x.account === account);
    if (!hasKey) return { account, hasKey };
    if (!b) return { account, hasKey, balanceError: "balance not read" };
    if ("error" in b) return { account, hasKey, balanceError: b.error };
    return { account, hasKey, remaining: b.remaining, limit: b.limit, plan: b.plan, resetsOn: b.resets ? b.resets.toISOString().slice(0, 10) : null };
  });
  // the router's rule: the first account with a key whose balance covers the text (or whose balance cannot be read: it tries anyway)
  const willUse = accounts.find((a) => a.hasKey && (a.remaining === undefined || a.remaining >= scriptCharacters)) ?? null;
  if (!accounts.some((a) => a.hasKey)) warnings.push("no account that has a voice id has a key: the final voice would fail (add one with `praeko studio voice account add <name>`)");
  else if (!willUse) warnings.push(`INSUFFICIENT BALANCE: the script has ${scriptCharacters} characters and no account with a key has that many left. The job would fail (or the person must add credit or another account first).`);
  else if (willUse.remaining === undefined) warnings.push(`the balance of "${willUse.account}" could not be read (${willUse.balanceError}): the Studio tries it anyway`);
  if (blocks.length) notes.push("long video: blocks already voiced and unchanged are reused from the cache, so the real spend can be lower than the total");
  notes.push("the word timings come from ElevenLabs Scribe (also billed by the provider) unless the voice uses a free aligner");
  return { ...base, free: false, accounts, willUse, sufficient: !!willUse, warnings, notes };
}

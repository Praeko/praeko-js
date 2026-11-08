#!/usr/bin/env node
// Registers an ElevenLabs account or workspace in Praeko Studio: checks the key, finds your voice clone, stores the key in the system keychain (macOS)
// or the secrets file and writes the id to voices.json. Usage:
//   node account.ts list
//   node account.ts add <name> [--from-env VAR | (asks for the key in an interactive terminal) | (standard input)] [--voice my-voice] [--voice-id ID] [--dry-run]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { balances, loadConfig, maskKey, sameBalanceGroups, storeKey, writableVoicesFile } from "../src/index.ts";

const a = process.argv.slice(2), cmd = a[0], name = a[1];
const opt = (k: string): string | undefined => { const i = a.indexOf("--" + k); return i >= 0 ? a[i + 1] : undefined; };
const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

async function readKey(): Promise<string | undefined> {
  const fromEnv = opt("from-env");
  if (fromEnv) return process.env[fromEnv];
  if (!process.stdin.isTTY) return await new Promise<string>((ok) => { let s = ""; process.stdin.on("data", (d) => (s += d)); process.stdin.on("end", () => ok(s)); });
  return await new Promise<string>((ok) => {
    const rl: any = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s: string) => { if (s.includes("\n") || s.startsWith("Key")) process.stdout.write(s); };
    rl.question(`Key for elevenlabs/${name}: `, (k: string) => { rl.close(); console.log(); ok(k); });
  });
}
async function api(path: string, key: string): Promise<any> {
  const r = await fetch(`https://api.elevenlabs.io${path}`, { headers: { "xi-api-key": key }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) {
    let msg = "";
    try { const d: any = await r.json(); msg = d?.detail?.message || d?.detail?.status || JSON.stringify(d).slice(0, 160); } catch { /* no body */ }
    const e: any = new Error(`${path}: HTTP ${r.status}${msg ? ` — ${msg}` : ""}`);
    e.status = r.status; throw e;
  }
  return r.json();
}

if (cmd === "list") {
  const cfg = loadConfig();
  const s = await balances({ config: cfg });
  for (const c of s) console.log(`${c.account.padEnd(12)} ${"error" in c ? c.error : `${fmt(c.remaining)} left of ${fmt(c.limit)} (${c.plan}), resets ${c.resets?.toLocaleDateString("en-US")}`}`);
  for (const l of sameBalanceGroups(s)) console.log(`WARNING: ${l.join(" and ")} show the SAME balance: they are probably the same workspace/plan (credits are shared).`);
} else if (cmd === "add" && name) {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name)) { console.error("name: use letters, numbers, - or _"); process.exit(2); }
  const key = ((await readKey()) || "").trim();
  if (!key) { console.error("empty key"); process.exit(1); }
  const cfg = loadConfig();
  let alias = opt("voice") || "my-voice";
  if (!cfg.voices[alias]) { console.error(`voice "${alias}" does not exist in voices.json`); process.exit(1); }
  let sub: any = null, voices: any[] | null = null, subError: Error | null = null, voiceError: Error | null = null;
  try { sub = await api("/v1/user/subscription", key); } catch (e) { subError = e; }
  try { voices = (await api("/v1/voices", key)).voices || []; } catch (e) { voiceError = e; }
  if (subError && voiceError) {
    console.error(`ElevenLabs rejected the key (${maskKey(key)}):\n  ${subError.message}\n  ${voiceError.message}\nCheck: (1) the key was copied whole, without spaces; (2) it was created in the right workspace; (3) if restricted, it has the permissions Voices (read), User (read), Text to Speech and Speech to Text.`);
    process.exit(1);
  }
  if (sub) {
    console.log(`account ${name}: plan ${sub.tier}, ${fmt(sub.character_limit - sub.character_count)} left of ${fmt(sub.character_limit)}, resets ${new Date(sub.next_character_count_reset_unix * 1000).toLocaleDateString("en-US")} (key ${maskKey(key)})`);
    for (const c of await balances({ config: cfg })) if (!("error" in c) && c.used === sub.character_count && c.limit === sub.character_limit) console.log(`WARNING: the balance is identical to account "${c.account}": it may be the SAME workspace (shared credits), and failover would not help.`);
  } else {
    console.log(`NOTE: the key cannot read the balance (${subError?.message}). It works for generating voice, but balance failover will not work for this account: enable the "User" (read) permission on the key so Praeko Studio can see the credits.`);
  }
  voices = voices || [];
  const clones = voices.filter((v) => ["cloned", "professional"].includes(v.category));
  console.log(`${voices.length} voices on this key; clones: ${clones.length ? clones.map((v) => `${v.name} (${v.voice_id})`).join(", ") : "none"}${voiceError ? ` (voice list unavailable: ${voiceError.message})` : ""}`);
  let id = opt("voice-id");
  if (!id && !opt("voice")) {
    // no --voice: if exactly one of the project's ElevenLabs voices matches a clone on this key by name, use that voice (the default "my-voice" is only a placeholder)
    const byName = Object.entries(cfg.voices).filter(([k, v]: [string, any]) => v.provider === "elevenlabs" && k !== "my-voice" && clones.some((c) => c.name.toLowerCase() === k.toLowerCase()));
    const only = byName[0];
    if (byName.length === 1 && only) { alias = only[0]; console.log(`using voice "${alias}" (matches a clone on this key)`); }
  }
  if (!id) {
    const candidates = clones.filter((v) => new RegExp(alias, "i").test(v.name));
    if (candidates.length === 1) id = candidates[0].voice_id;
    else {
      console.error(candidates.length ? `several clones look like "${alias}": repeat with --voice-id <id>` : `no clone named "${alias}" on this key: create the clone in that workspace/account or repeat with --voice-id <id>`);
      if (!a.includes("--dry-run")) {
        // the key is valid: keep it, so it is not lost; only the voice id is missing
        const where = storeKey(`elevenlabs/${name}`, key);
        console.error(`the key WAS stored (${where}, elevenlabs/${name}); only the voice id is missing.`);
        const one = clones.length === 1 ? clones[0] : null;
        console.error(one ? `finish with: praeko studio voice account add ${name} --voice ${alias} --voice-id ${one.voice_id}   (it will ask for the key again)` : `finish with: praeko studio voice account add ${name} --voice ${alias} --voice-id <id>`);
      }
      process.exit(1);
    }
  }
  console.log(`voice "${alias}" on this account: ${id}`);
  if (a.includes("--dry-run")) { console.log("(dry run: nothing was stored)"); process.exit(0); }
  const where = storeKey(`elevenlabs/${name}`, key);
  const target = writableVoicesFile();
  mkdirSync(dirname(target), { recursive: true });
  const raw: any = existsSync(target) ? JSON.parse(readFileSync(target, "utf8")) : {};
  raw.accounts ||= {}; raw.accounts.elevenlabs ||= [];
  if (!raw.accounts.elevenlabs.includes(name)) raw.accounts.elevenlabs.push(name);
  raw.voices ||= {}; raw.voices[alias] = { ...(cfg.voices[alias]), ...(raw.voices[alias] || {}) };
  raw.voices[alias].ids = { ...(raw.voices[alias].ids || {}), [name]: id };
  writeFileSync(target, JSON.stringify(raw, null, 2) + "\n");
  console.log(`done: key stored (${where}, elevenlabs/${name}) and id in ${target}. Failover order: ${raw.accounts.elevenlabs.join(" → ")}`);
} else { console.error("usage: account.ts list | account.ts add <name> [--from-env VAR] [--voice my-voice] [--voice-id ID] [--dry-run]"); process.exit(2); }

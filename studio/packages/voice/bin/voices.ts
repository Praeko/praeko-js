#!/usr/bin/env node
// Lists the voices in voices.json and checks what it can: ElevenLabs account balances and VoiceStudio profiles.
import { balances, createVoiceStudio, loadConfig } from "../src/index.ts";

const cfg = loadConfig();
const vs = createVoiceStudio({ base: cfg.voicestudio?.base });
const st = await vs.available();
const profiles = st.ok ? await vs.profiles() : [];
console.log(`VoiceStudio: ${st.ok ? `up (${st.version}, ${st.device})` : st.reason}`);
for (const [name, v] of Object.entries(cfg.voices)) {
  let note = "";
  if (v.provider === "voicestudio") note = !st.ok ? "unavailable" : profiles.find((p) => p.id === v.id) ? `profile "${(profiles.find((p) => p.id === v.id) as { name: string }).name}" ok` : "PROFILE NOT FOUND";
  else note = `accounts: ${Object.keys(v.ids || {}).join(", ")}`;
  console.log(`  ${name.padEnd(14)} ${v.provider.padEnd(12)} ${v.model || ""} · aligner ${v.aligner || "scribe"} · ${note}`);
}
console.log("Balances (ElevenLabs):");
for (const s of await balances({ config: cfg })) console.log(`  ${s.account.padEnd(10)} ${"error" in s ? s.error : `${s.remaining} left of ${s.limit}`}`);

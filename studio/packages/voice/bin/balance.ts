#!/usr/bin/env node
// Balance (characters) of each ElevenLabs account configured in voices.json.
import { balances } from "../src/index.ts";

const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
for (const s of await balances()) {
  if ("error" in s) console.log(`${s.account.padEnd(10)} ${s.error}`);
  else console.log(`${s.account.padEnd(10)} ${fmt(s.remaining)} left of ${fmt(s.limit)} (${s.plan})${s.resets ? ", resets on " + s.resets.toLocaleDateString("en-US") : ""}`);
}

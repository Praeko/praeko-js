#!/usr/bin/env node
// Usage (inside a project, with ELEVENLABS_API_KEY and the voice id variable set):
//   narrate.ts episodes/<slug> [--brand brand.json] [--constant WORDS_X]
//        [--voice name] [--quality draft|final] [--aligner scribe|voicestudio] [--no-failover]
// Reads <folder>/script.txt and writes voice.mp3, words.json and words.ts.
import { readFileSync } from "node:fs";
import { narrate } from "../src/index.ts";

const a = process.argv.slice(2), folder = a[0];
const opt = (k: string, d?: string): string | undefined => { const i = a.indexOf("--" + k); return i >= 0 ? a[i + 1] : d; };
if (!folder) { console.error("usage: narrate.ts <episode-folder> [--brand brand.json] [--constant NAME]"); process.exit(2); }
const brand = JSON.parse(readFileSync(opt("brand", "brand.json") as string, "utf8"));
const r = await narrate({ folder, brand, constantName: opt("constant", "WORDS"), log: (m) => console.error(m), noFailover: a.includes("--no-failover"), voice: opt("voice"), quality: opt("quality"), aligner: opt("aligner") });
if (r.corrected.length) console.log("caption fixed from the script:", r.corrected.map(([x, y]) => `${x}→${y}`).join(", "));
console.log(`voice ${r.voice} (${r.provider}, ${r.account}) · voice.mp3 ${r.duration.toFixed(1)} s · ${r.words} words${r.events.length ? " · events: " + r.events.map((e) => e.t).join(", ") : ""}`);

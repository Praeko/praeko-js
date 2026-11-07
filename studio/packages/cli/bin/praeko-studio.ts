#!/usr/bin/env node
// Praeko Studio: short and long videos from a script, for you to run with your own agent (voice, captions, scenes, cover, texts and publishing).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as C from "../src/commands.ts";
import { schedule } from "../src/schedule.ts";
import { account, post, queue } from "../src/post.ts";
import { doctorCommand } from "../src/doctor.ts";
import { skillCommand } from "../src/skill.ts";
import { licensesCommand } from "../src/licenses.ts";
import { migrateCommand } from "../src/migrate/index.ts";
import { PACKAGE_ROOT, VERSION } from "../src/version.ts";
import { help } from "../src/help.ts";
import { installTranslation, setLang, translate } from "../src/i18n.ts";

function docs(a: string[]): number {
  const dir = join(PACKAGE_ROOT, "docs"), lic = join(PACKAGE_ROOT, "LICENSES.md");
  const topics = [...(existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)) : []), ...(existsSync(lic) ? ["licenses"] : [])].sort();
  if (!a[0]) { console.log("topics: " + topics.join(", ") + "\n\npraeko studio docs <topic>"); return 0; }
  const t = a[0].replace(/\.md$/, "");
  if (!topics.includes(t)) throw new Error(`topic "${a[0]}" does not exist (there are: ${topics.join(", ")})`);
  console.log(readFileSync(t === "licenses" ? lic : join(dir, t + ".md"), "utf8"));
  return 0;
}

const argv = process.argv.slice(2);
const li = argv.indexOf("--lang");
if (li >= 0 && (argv[li + 1] === "pt" || argv[li + 1] === "en")) setLang(argv[li + 1]);
installTranslation();
const [cmd, ...a] = argv;
if (cmd === "--version" || cmd === "-v" || cmd === "version") { console.log(VERSION); process.exit(0); }
const table: Record<string, (a: string[]) => number | Promise<number>> = {
  init: C.init, new: C.newEpisode, voice: C.voice, compile: C.compile, cut: C.cut, preview: C.preview, render: C.render, cover: C.cover, "contact-sheet": C.contactSheetCommand,
  check: C.check, package: C.packageCommand, schedule, post, queue, account, doctor: doctorCommand, skill: skillCommand, licenses: licensesCommand, docs, migrate: migrateCommand,
};
if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h" || !table[cmd]) { console.log(help(VERSION)); process.exit(cmd && !["help", "--help", "-h"].includes(cmd) ? 2 : 0); }
try { const r = await table[cmd]!(a); process.exit(typeof r === "number" ? r : 0); } catch (e: any) { console.error("error: " + translate(e.message)); process.exit(1); }

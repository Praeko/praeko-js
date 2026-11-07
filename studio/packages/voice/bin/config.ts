#!/usr/bin/env node
// Stores a key: macOS keychain (on macOS) or a secrets file with mode 600 (Linux). Never goes into the project or git.
//   node config.ts key elevenlabs/principal                       asks for the key without echo (needs an interactive terminal)
//   node config.ts key elevenlabs/principal --from-env VAR_NAME   reads it from an environment variable (the key never shows on screen)
//   echo "$KEY" | node config.ts key elevenlabs/principal         reads it from standard input
import { createInterface } from "node:readline";
import { maskKey, storeKey } from "../src/index.ts";

const a = process.argv.slice(2), [cmd, ref] = a;
const opt = (k: string): string | undefined => { const i = a.indexOf("--" + k); return i >= 0 ? a[i + 1] : undefined; };
if (cmd !== "key" || !ref) { console.error("usage: config.ts key <elevenlabs/name> [--from-env VAR]"); process.exit(2); }

const save = (k: string | undefined) => {
  const key = (k || "").trim();
  if (!key) { console.error("empty key: nothing was stored"); process.exit(1); }
  const where = storeKey(ref, key);
  console.log(`stored (${where}, ${ref}): ${maskKey(key)}`);
};

const fromEnv = opt("from-env");
if (fromEnv) save(process.env[fromEnv]);
else if (!process.stdin.isTTY) { let s = ""; process.stdin.on("data", (d) => (s += d)); process.stdin.on("end", () => save(s)); }
else {
  const rl: any = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s: string) => { if (s.includes("\n") || s.startsWith("Key")) process.stdout.write(s); };
  rl.question(`Key for ${ref}: `, (k: string) => { rl.close(); console.log(); save(k); });
}

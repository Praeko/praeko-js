#!/usr/bin/env node
// `praeko <comando>`: o serviço (posts, fila, canais, chaves…). `praeko studio <comando>` chama o Praeko Studio (antes: Bardo), que vive no repositório privado do Praeko.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { executarCli } from "../src/cli.mjs";

const args = process.argv.slice(2);
if (args[0] === "studio") {
  let bin;
  try { bin = join(dirname(createRequire(import.meta.url).resolve("@praeko/studio-cli/package.json")), "bin", "bardo.mjs"); }
  catch { console.error("praeko studio: o Praeko Studio ainda não é distribuído pelo npm (só no repositório do Praeko). Os demais comandos funcionam normalmente."); process.exit(1); }
  const r = spawnSync(process.execPath, [bin, ...args.slice(1)], { stdio: "inherit", env: { ...process.env, PRAEKO_STUDIO: "1" } });
  process.exit(r.status ?? 1);
}
process.exit(await executarCli(args));

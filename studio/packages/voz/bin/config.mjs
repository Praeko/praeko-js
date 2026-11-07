#!/usr/bin/env node
// Guarda uma chave: cofre do macOS (no macOS) ou arquivo de segredos com permissão 600 (Linux). Nunca vai para o projeto nem para o git.
//   node config.mjs chave elevenlabs/principal                      pede a chave sem eco (precisa de um terminal interativo)
//   node config.mjs chave elevenlabs/principal --de-env NOME_DA_VAR  lê da variável de ambiente (a chave não aparece na tela)
//   echo "$CHAVE" | node config.mjs chave elevenlabs/principal       lê da entrada padrão
import { guardarChave, mascarar } from "../src/index.mjs";
import { createInterface } from "node:readline";

const a = process.argv.slice(2), [cmd, ref] = a;
const opt = (k) => { const i = a.indexOf("--" + k); return i >= 0 ? a[i + 1] : undefined; };
if (cmd !== "chave" || !ref) { console.error("uso: config.mjs chave <elevenlabs/nome> [--de-env VAR]"); process.exit(2); }

const salvar = (k) => {
  const chave = (k || "").trim();
  if (!chave) { console.error("chave vazia: nada foi guardado"); process.exit(1); }
  const onde = guardarChave(ref, chave);
  console.log(`guardada (${onde}, ${ref}): ${mascarar(chave)}`);
};

if (opt("de-env")) salvar(process.env[opt("de-env")]);
else if (!process.stdin.isTTY) { let s = ""; process.stdin.on("data", (d) => (s += d)); process.stdin.on("end", () => salvar(s)); }
else {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => { if (s.includes("\n") || s.startsWith("Chave")) process.stdout.write(s); };
  rl.question(`Chave de ${ref}: `, (k) => { rl.close(); console.log(); salvar(k); });
}

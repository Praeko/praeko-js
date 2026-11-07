#!/usr/bin/env node
// Uso (dentro de um projeto): praeko studio pacote episodios/<slug> [--marca marca.json] [--saida arquivo.md]
// Lê <pasta>/publicacao.json e escreve o textos.md (ou --saida). Sai com código 1 se houver ERRO na conferência.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pacote, validar } from "../src/index.mjs";

const a = process.argv.slice(2), pasta = a[0];
const opt = (k, d) => { const i = a.indexOf("--" + k); return i >= 0 ? a[i + 1] : d; };
if (!pasta) { console.error("uso: pacote.mjs <pasta-do-episodio> [--marca marca.json] [--saida arquivo]"); process.exit(2); }
const marca = JSON.parse(readFileSync(opt("marca", "marca.json"), "utf8"));
const ep = JSON.parse(readFileSync(join(pasta, "publicacao.json"), "utf8"));
const saida = opt("saida", join(pasta, "textos.md"));
writeFileSync(saida, pacote({ marca, ep }));
const v = validar({ marca, ep });
console.log(`escrito ${saida}; ${v.erros.length} erro(s), ${v.avisos.length} aviso(s)`);
v.erros.forEach((e) => console.log("  ERRO:", e));
v.avisos.forEach((e) => console.log("  aviso:", e));
process.exit(v.erros.length ? 1 : 0);

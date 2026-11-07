#!/usr/bin/env node
// Uso (dentro de um projeto, com ELEVENLABS_API_KEY e a variável do id da voz definidas):
//   praeko studio narrar episodios/<slug> [--marca marca.json] [--constante PALAVRAS_X]
//        [--voz apelido] [--qualidade rascunho|final] [--alinhador scribe|voicestudio] [--sem-failover]
// Lê <pasta>/roteiro.txt e escreve voz.mp3, palavras.json e palavras.ts.
import { readFileSync } from "node:fs";
import { narrar } from "../src/index.mjs";

const a = process.argv.slice(2), pasta = a[0];
const opt = (k, d) => { const i = a.indexOf("--" + k); return i >= 0 ? a[i + 1] : d; };
if (!pasta) { console.error("uso: narrar.mjs <pasta-do-episodio> [--marca marca.json] [--constante NOME]"); process.exit(2); }
const marca = JSON.parse(readFileSync(opt("marca", "marca.json"), "utf8"));
const r = await narrar({ pasta, marca, nomeConstante: opt("constante", "PALAVRAS"), log: (m) => console.error(m), semFailover: a.includes("--sem-failover"), voz: opt("voz"), qualidade: opt("qualidade"), alinhador: opt("alinhador") });
if (r.corrigidas?.length) console.log("legenda corrigida pelo roteiro:", r.corrigidas.map(([x, y]) => `${x}→${y}`).join(", "));
console.log(`voz ${r.voz} (${r.provedor}, ${r.conta}) · voz.mp3 ${r.duracao.toFixed(1)} s · ${r.palavras} palavras${r.eventos.length ? " · eventos: " + r.eventos.map((e) => e.t).join(", ") : ""}`);

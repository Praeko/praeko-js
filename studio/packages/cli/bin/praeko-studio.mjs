#!/usr/bin/env node
// Praeko Studio: vídeos curtos e longos a partir de um roteiro, para você operar com o seu próprio agente (voz, legenda, cenas, capa, textos e publicação).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as C from "../src/comandos.mjs";
import { agendar } from "../src/agendar.mjs";
import { postar, fila, conta } from "../src/postar.mjs";
import { doctorCmd } from "../src/doctor.mjs";
import { skillCmd } from "../src/skill.mjs";
import { licencasCmd } from "../src/licencas.mjs";
import { RAIZ_PACOTE, VERSAO } from "../src/versao.mjs";
import { ajuda } from "../src/ajuda.mjs";


function docs(a) {
  const dir = join(RAIZ_PACOTE, "docs"), lic = join(RAIZ_PACOTE, "LICENSES.md");
  const temas = [...(existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)) : []), ...(existsSync(lic) ? ["licencas"] : [])].sort();
  if (!a[0]) { console.log("temas: " + temas.join(", ") + "\n\npraeko studio docs <tema>"); return 0; }
  const t = a[0].replace(/\.md$/, "");
  if (!temas.includes(t)) throw new Error(`tema "${a[0]}" não existe (há: ${temas.join(", ")})`);
  console.log(readFileSync(t === "licencas" ? lic : join(dir, t + ".md"), "utf8"));
  return 0;
}

const [cmd, ...a] = process.argv.slice(2);
if (cmd === "--version" || cmd === "-v" || cmd === "version") { console.log(VERSAO); process.exit(0); }
const tabela = { init: C.init, novo: C.novo, voz: C.voz, compilar: C.compilar, corte: C.corte, prever: C.prever, render: C.render, capa: C.capa, folha: C.folhaCmd, checar: C.checar, pacote: C.pacoteCmd, agendar, postar, fila, conta, doctor: doctorCmd, skill: skillCmd, licencas: licencasCmd, docs };
if (!cmd || cmd === "ajuda" || cmd === "--help" || cmd === "-h" || !tabela[cmd]) { console.log(ajuda(VERSAO)); process.exit(cmd && !["ajuda", "--help", "-h"].includes(cmd) ? 2 : 0); }
try { const r = await tabela[cmd](a); process.exit(typeof r === "number" ? r : 0); } catch (e) { console.error("erro: " + e.message); process.exit(1); }

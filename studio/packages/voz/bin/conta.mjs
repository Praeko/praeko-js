#!/usr/bin/env node
// Cadastra uma conta ou workspace do ElevenLabs no Praeko Studio: confere a chave, acha o clone da sua voz, guarda a chave no cofre do sistema (macOS) ou no arquivo de segredos
// e escreve o id em vozes.json. Uso:
//   node conta.mjs listar
//   node conta.mjs adicionar <nome> [--de-env VAR | (pede a chave em terminal interativo) | (entrada padrão)] [--voz minha-voz] [--voz-id ID] [--simular]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { arquivoVozesEscrita, carregarConfig, guardarChave, mascarar, obterChave, saldos } from "../src/index.mjs";

const a = process.argv.slice(2), cmd = a[0], nome = a[1];
const opt = (k) => { const i = a.indexOf("--" + k); return i >= 0 ? a[i + 1] : undefined; };
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

async function lerChave() {
  if (opt("de-env")) return process.env[opt("de-env")];
  if (!process.stdin.isTTY) return await new Promise((ok) => { let s = ""; process.stdin.on("data", (d) => (s += d)); process.stdin.on("end", () => ok(s)); });
  return await new Promise((ok) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes("\n") || s.startsWith("Chave")) process.stdout.write(s); };
    rl.question(`Chave de elevenlabs/${nome}: `, (k) => { rl.close(); console.log(); ok(k); });
  });
}
async function api(caminho, chave) {
  const r = await fetch(`https://api.elevenlabs.io${caminho}`, { headers: { "xi-api-key": chave }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) {
    let msg = "";
    try { const d = await r.json(); msg = d?.detail?.message || d?.detail?.status || JSON.stringify(d).slice(0, 160); } catch { /* sem corpo */ }
    const e = new Error(`${caminho}: HTTP ${r.status}${msg ? ` — ${msg}` : ""}`);
    e.status = r.status; throw e;
  }
  return r.json();
}

if (cmd === "listar") {
  const cfg = carregarConfig();
  const s = await saldos({ config: cfg });
  for (const c of s) console.log(`${c.conta.padEnd(12)} ${c.erro || `${fmt(c.restantes)} restantes de ${fmt(c.limite)} (${c.plano}), reinicia ${c.reinicia?.toLocaleDateString("pt-BR")}`}`);
  const usados = new Map();
  for (const c of s.filter((x) => !x.erro)) { const k = `${c.usados}|${c.limite}|${c.reinicia?.getTime()}`; usados.set(k, [...(usados.get(k) || []), c.conta]); }
  for (const [, l] of usados) if (l.length > 1) console.log(`ATENÇÃO: ${l.join(" e ")} mostram o MESMO saldo: provavelmente são o mesmo workspace/plano (os créditos são compartilhados).`);
} else if (cmd === "adicionar" && nome) {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(nome)) { console.error("nome: use letras, números, - ou _"); process.exit(2); }
  const chave = ((await lerChave()) || "").trim();
  if (!chave) { console.error("chave vazia"); process.exit(1); }
  const apelido = opt("voz") || "minha-voz";
  const cfg = carregarConfig();
  if (!cfg.vozes[apelido]) { console.error(`voz "${apelido}" não existe em vozes.json`); process.exit(1); }
  let sub = null, vozes = null, erroSub = null, erroVoz = null;
  try { sub = await api("/v1/user/subscription", chave); } catch (e) { erroSub = e; }
  try { vozes = (await api("/v1/voices", chave)).voices || []; } catch (e) { erroVoz = e; }
  if (erroSub && erroVoz) {
    console.error(`A ElevenLabs recusou a chave (${mascarar(chave)}):\n  ${erroSub.message}\n  ${erroVoz.message}\nConfira: (1) a chave foi copiada inteira, sem espaços; (2) foi criada no workspace certo; (3) se for restrita, tem as permissões Voices (leitura), User (leitura), Text to Speech e Speech to Text.`);
    process.exit(1);
  }
  if (sub) {
    console.log(`conta ${nome}: plano ${sub.tier}, ${fmt(sub.character_limit - sub.character_count)} restantes de ${fmt(sub.character_limit)}, reinicia ${new Date(sub.next_character_count_reset_unix * 1000).toLocaleDateString("pt-BR")} (chave ${mascarar(chave)})`);
    for (const c of await saldos({ config: cfg })) if (!c.erro && c.usados === sub.character_count && c.limite === sub.character_limit) console.log(`ATENÇÃO: o saldo é idêntico ao da conta "${c.conta}": pode ser o MESMO workspace (créditos compartilhados), e o failover não ajudaria.`);
  } else {
    console.log(`AVISO: a chave não consegue ler o saldo (${erroSub.message}). Ela vale para gerar voz, mas o failover por saldo não funciona nessa conta: ative a permissão "User" (leitura) na chave para o Praeko Studio ver os créditos.`);
  }
  vozes = vozes || [];
  const clones = vozes.filter((v) => ["cloned", "professional"].includes(v.category));
  console.log(`${vozes.length} vozes nessa chave; clones: ${clones.length ? clones.map((v) => `${v.name} (${v.voice_id})`).join(", ") : "nenhum"}${erroVoz ? ` (lista de vozes indisponível: ${erroVoz.message})` : ""}`);
  let id = opt("voz-id");
  if (!id) {
    const cand = clones.filter((v) => new RegExp(apelido, "i").test(v.name));
    if (cand.length === 1) id = cand[0].voice_id;
    else { console.error(cand.length ? `vários clones parecem "${apelido}": repita com --voz-id <id>` : `nenhum clone chamado "${apelido}" nessa chave: crie o clone nesse workspace/conta ou repita com --voz-id <id>`); process.exit(1); }
  }
  console.log(`voz "${apelido}" nessa conta: ${id}`);
  if (opt("simular") !== undefined || a.includes("--simular")) { console.log("(simulação: nada foi guardado)"); process.exit(0); }
  const onde = guardarChave(`elevenlabs/${nome}`, chave);
  const destino = arquivoVozesEscrita();
  mkdirSync(dirname(destino), { recursive: true });
  const raw = existsSync(destino) ? JSON.parse(readFileSync(destino, "utf8")) : {};
  raw.contas ||= {}; raw.contas.elevenlabs ||= [];
  if (!raw.contas.elevenlabs.includes(nome)) raw.contas.elevenlabs.push(nome);
  raw.vozes ||= {}; raw.vozes[apelido] = { ...(cfg.vozes[apelido]), ...(raw.vozes[apelido] || {}) };
  raw.vozes[apelido].ids = { ...(raw.vozes[apelido].ids || {}), [nome]: id };
  writeFileSync(destino, JSON.stringify(raw, null, 2) + "\n");
  console.log(`pronto: chave guardada (${onde}, elevenlabs/${nome}) e id em ${destino}. Ordem de failover: ${raw.contas.elevenlabs.join(" → ")}`);
} else { console.error("uso: conta.mjs listar | conta.mjs adicionar <nome> [--de-env VAR] [--voz minha-voz] [--voz-id ID] [--simular]"); process.exit(2); }

#!/usr/bin/env node
// Saldo (caracteres) de cada conta do ElevenLabs configurada em vozes.json.
import { saldos } from "../src/index.mjs";

const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
for (const s of await saldos()) {
  if (s.erro) console.log(`${s.conta.padEnd(10)} ${s.erro}`);
  else console.log(`${s.conta.padEnd(10)} ${fmt(s.restantes)} restantes de ${fmt(s.limite)} (${s.plano})${s.reinicia ? ", reinicia em " + s.reinicia.toLocaleDateString("pt-BR") : ""}`);
}

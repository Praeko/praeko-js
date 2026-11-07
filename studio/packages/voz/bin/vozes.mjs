#!/usr/bin/env node
// Lista as vozes de vozes.json e confere o que dá: saldo das contas do ElevenLabs e perfis do VoiceStudio.
import { carregarConfig, criarVoiceStudio, saldos } from "../src/index.mjs";

const cfg = carregarConfig();
const vs = criarVoiceStudio({ base: cfg.voicestudio?.base });
const st = await vs.disponivel();
const perfis = st.ok ? await vs.perfis() : [];
console.log(`VoiceStudio: ${st.ok ? `no ar (${st.versao}, ${st.device})` : st.motivo}`);
for (const [nome, v] of Object.entries(cfg.vozes)) {
  let nota = "";
  if (v.provedor === "voicestudio") nota = !st.ok ? "indisponível" : perfis.find((p) => p.id === v.id) ? `perfil "${perfis.find((p) => p.id === v.id).name}" ok` : "PERFIL NÃO ENCONTRADO";
  else nota = `contas: ${Object.keys(v.ids || {}).join(", ")}`;
  console.log(`  ${nome.padEnd(14)} ${v.provedor.padEnd(12)} ${v.modelo || ""} · alinhador ${v.alinhador || "scribe"} · ${nota}`);
}
console.log("Saldos (ElevenLabs):");
for (const s of await saldos({ config: cfg })) console.log(`  ${s.conta.padEnd(10)} ${s.erro || `${s.restantes} restantes de ${s.limite}`}`);

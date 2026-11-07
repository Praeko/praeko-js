// Roteador de voz: escolhe a conta, confere o saldo e troca de conta quando a cota acaba ou a chave falha.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { carregarConfig, obterChave, resolverVoz } from "./config.mjs";
import { classificarErro, criarElevenLabs } from "./provedores/elevenlabs.mjs";

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Gera a narração tentando as contas em ordem. Devolve `{ buffer, conta, tentativas }`.
 * - saldo: pula a conta se `restantes` < caracteres do texto;
 * - cota (402 / quota_exceeded) e auth (401/403): próxima conta;
 * - limite (429): espera e repete (até `repeticoes`), depois próxima conta;
 * - servidor/rede: repete uma vez, depois próxima conta;
 * - texto (400/422): para e mostra o erro.
 * `criar(conta, chave)` e `esperar(ms)` são injetáveis nos testes.
 */
export async function gerarComFailover({ texto, voz, config = carregarConfig(), criar, esperar = dormir, repeticoes = 2, log = () => {}, semFailover = false }) {
  const v = typeof voz === "object" && voz.provedor && (voz.ids || voz.id) && !voz.idEnv ? voz : resolverVoz(voz, config);
  if (v.provedor !== "elevenlabs") throw new Error(`roteador: provedor "${v.provedor}" ainda não suportado aqui`);
  const fabrica = criar || ((conta, chave) => criarElevenLabs({ chave }));
  const contas = (config.contas?.elevenlabs || Object.keys(v.ids || {})).filter((c) => v.ids?.[c]);
  const candidatas = semFailover ? contas.slice(0, 1) : contas;
  const tentativas = [];
  if (!candidatas.length) throw new Error(`voz "${v.apelido}": nenhuma conta com id de voz (vozes.json → ids)`);
  for (const conta of candidatas) {
    const ref = `elevenlabs/${conta}`;
    const chave = obterChave(ref);
    if (!chave) { tentativas.push({ conta, motivo: "sem chave" }); log(`[voz] ${conta}: sem chave, pulando`); continue; }
    const prov = fabrica(conta, chave);
    try {
      const s = await prov.saldo();
      if (s.restantes < texto.length) { tentativas.push({ conta, motivo: `saldo insuficiente (${s.restantes} < ${texto.length})` }); log(`[voz] ${conta}: saldo ${s.restantes} < ${texto.length}, pulando`); continue; }
      log(`[voz] ${conta}: saldo ${s.restantes} de ${s.limite}`);
    } catch (e) {
      log(`[voz] ${conta}: saldo indisponível (${e.message}); tentando mesmo assim`);
    }
    let feitas = 0;
    for (;;) {
      try {
        const buffer = await prov.gerar({ texto, id: v.ids[conta], modelo: v.modelo, ajustes: v.ajustes });
        tentativas.push({ conta, motivo: "ok" });
        return { buffer, conta, tentativas };
      } catch (e) {
        const tipo = classificarErro(e);
        log(`[voz] ${conta}: erro ${tipo} (${e.statusCode ?? e.message})`);
        if (tipo === "texto") throw new Error(`texto recusado pelo provedor: ${e.message}`);
        if ((tipo === "limite" && feitas < repeticoes) || ((tipo === "servidor" || tipo === "rede") && feitas < 1)) { feitas++; await esperar(tipo === "limite" ? 5000 * feitas : 2000); continue; }
        tentativas.push({ conta, motivo: tipo });
        break; // próxima conta
      }
    }
  }
  const resumo = tentativas.map((t) => `${t.conta}: ${t.motivo}`).join("; ");
  throw new Error(`nenhuma conta conseguiu gerar a voz (${resumo})`);
}

export function salvarBuffer(buffer, arquivo) {
  mkdirSync(dirname(arquivo), { recursive: true });
  writeFileSync(arquivo, buffer);
}

/** Saldo de todas as contas configuradas: `[{ conta, restantes, limite, plano, reinicia } | { conta, erro }]`. */
export async function saldos({ config = carregarConfig(), criar } = {}) {
  const fabrica = criar || ((conta, chave) => criarElevenLabs({ chave }));
  const out = [];
  for (const conta of config.contas?.elevenlabs || []) {
    const chave = obterChave(`elevenlabs/${conta}`);
    if (!chave) { out.push({ conta, erro: "sem chave" }); continue; }
    try { out.push({ conta, ...(await fabrica(conta, chave).saldo()) }); } catch (e) { out.push({ conta, erro: e.message }); }
  }
  return out;
}

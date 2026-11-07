// Configuração do Praeko: `praeko.json` (plano; o nome antigo `arauto.json` continua valendo) ou, como reserva, a seção `publicacao` de um `marca.json` (Bardo).
// Depois de normalizada, a configuração é sempre PLANA:
//   { nome, links, fusoOffset, pasta, utm, limites, hashtags:{permitidas,proibidas}, hospedagem, buffer, provedor, provedores,
//     youtube:{modo,categoriaId,…}, instagram:{versao,comentar,…}, tiktok:{modo,privacidade,auditado,…} }
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const NOME_PROJETO = "Praeko";
/** Em cada pasta, nesta ordem: o nome novo, o antigo e o marca.json do Bardo. */
export const ARQUIVOS_CONFIG = ["praeko.json", "arauto.json", "marca.json"];

export function normalizarConfig(bruto = {}) {
  if (bruto.publicacao && typeof bruto.publicacao === "object") { // formato do marca.json do Bardo
    const { publicacao, links, nome, handle } = bruto;
    return { nome, handle, links, ...publicacao };
  }
  return { ...bruto };
}

/** Sobe pastas a partir de `de` até achar praeko.json (ou arauto.json, ou marca.json). Devolve { raiz, config, arquivo } ou null. */
export function acharConfig(de = process.cwd()) {
  let d = resolve(de);
  for (;;) {
    for (const nome of ARQUIVOS_CONFIG) {
      const f = join(d, nome);
      if (existsSync(f)) return { raiz: d, arquivo: f, config: normalizarConfig(JSON.parse(readFileSync(f, "utf8"))) };
    }
    const p = dirname(d);
    if (p === d) return null;
    d = p;
  }
}

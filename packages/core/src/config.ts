// Praeko configuration: `praeko.json` (flat). After normalizing, the configuration is always FLAT:
//   { nome, links, fusoOffset, pasta, utm, limites, hashtags:{permitidas,proibidas}, hospedagem, buffer, provedor, provedores,
//     youtube:{modo,categoriaId,…}, instagram:{versao,comentar,…}, tiktok:{modo,privacidade,auditado,…} }
// The public CLI reads the English `praeko.json` and translates it to this internal shape (packages/cli/src/package-folder.ts).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const NOME_PROJETO = "Praeko";
/** In each folder, the config file name. */
export const ARQUIVOS_CONFIG = ["praeko.json"];

export function normalizarConfig(bruto: any = {}) {
  return { ...bruto };
}

/** Climbs folders from `de` until it finds praeko.json. Returns { raiz, config, arquivo } or null. */
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

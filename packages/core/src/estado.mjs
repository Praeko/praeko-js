// Estado local do projeto (fila, buffer.json, vídeos gerados, log do executor): pasta `.praeko/`. Antes da renomeação era `.arauto/`.
// LEITURA: `.praeko/<arquivo>` e, se não existir, `.arauto/<arquivo>`. ESCRITA: sempre `.praeko/`. O que está em `.arauto/` não é apagado nem movido.
import { existsSync } from "node:fs";
import { join } from "node:path";

export const PASTA_ESTADO = ".praeko", PASTA_ESTADO_ANTIGA = ".arauto";
/** Pasta onde se ESCREVE. */
export const pastaEstado = (raiz) => join(raiz, PASTA_ESTADO);
/** Caminho para ESCREVER (dentro de `.praeko/`). */
export const caminhoEstado = (raiz, ...nome) => join(raiz, PASTA_ESTADO, ...nome);
/** Caminho para LER: o novo se existir; senão o antigo se existir; senão o novo (arquivo que ainda não existe). */
export function caminhoLeitura(raiz, ...nome) {
  const novo = caminhoEstado(raiz, ...nome);
  if (existsSync(novo)) return novo;
  const velho = join(raiz, PASTA_ESTADO_ANTIGA, ...nome);
  return existsSync(velho) ? velho : novo;
}

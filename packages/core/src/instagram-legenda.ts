// Regras da legenda do Instagram (Reel, foto e carrossel): vale para a publicação pela Meta (servidor) e para o adaptador local.
export const LEGENDA_MAX = 2200, HASHTAGS_MAX = 30;
export const contarHashtags = (texto: any) => (String(texto).match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length;

/** Confere a legenda do Instagram. Devolve a lista de problemas (vazia = ok). */
export function validarLegendaInstagram(texto: any) {
  const e = [];
  if (!texto || !String(texto).trim()) e.push("a legenda do Instagram está vazia");
  if (String(texto).length > LEGENDA_MAX) e.push(`legenda com ${String(texto).length} caracteres (limite ${LEGENDA_MAX})`);
  const h = contarHashtags(texto);
  if (h > HASHTAGS_MAX) e.push(`${h} hashtags (limite ${HASHTAGS_MAX})`);
  return e;
}

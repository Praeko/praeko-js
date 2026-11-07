// O contrato do Praeko sem dependências de Node: nomes de rede, modos e a validação do pedido. É o que o servidor (Worker),
// o SDK e o CLI compartilham. Veja publicador.mjs para a descrição do formato do pedido e da resposta.
export const REDES = { yt: "youtube", youtube: "youtube", ig: "instagram", instagram: "instagram", tt: "tiktok", tiktok: "tiktok" };

export const REDES_VALIDAS = ["youtube", "instagram", "tiktok"];
export const MODOS = { youtube: ["privado", "agendado", "publico"], tiktok: ["rascunho", "direto"], instagram: ["agora"] };
export const PROVEDORES = ["buffer", "local", "remoto"];

/** Confere o pedido. Devolve a lista de erros (vazia = ok). */
export function validarPedido(p) {
  const e = [];
  if (!p || typeof p !== "object") return ["pedido vazio"];
  if (!p.midia?.video) e.push("midia.video é obrigatório");
  if (!p.titulo && !p.textos?.youtube?.titulo) e.push("falta o título");
  if (!Array.isArray(p.destinos) || !p.destinos.length) e.push("destinos vazio");
  for (const d of p.destinos || []) {
    if (!REDES_VALIDAS.includes(d.rede)) { e.push(`rede desconhecida: ${d.rede}`); continue; }
    if (!p.textos?.[d.rede]?.texto) e.push(`falta textos.${d.rede}.texto`);
    if (d.quando != null && Number.isNaN(Date.parse(d.quando))) e.push(`${d.rede}: quando inválido (${d.quando})`);
    if (d.midia != null && (typeof d.midia !== "object" || Array.isArray(d.midia) || ["video", "capa"].some((k) => d.midia[k] != null && typeof d.midia[k] !== "string"))) e.push(`${d.rede}: midia do destino precisa ser { video?: <id>, capa?: <id> }`);
    if (d.modo && !MODOS[d.rede].includes(d.modo)) e.push(`${d.rede}: modo "${d.modo}" inválido (use ${MODOS[d.rede].join(", ")})`);
  }
  const todos = JSON.stringify(p.textos || {});
  const marc = [...new Set(todos.match(/\[[A-Z][A-Z_]{3,}\]/g) || [])];
  if (marc.length) e.push(`texto com marcador não preenchido: ${marc.join(", ")}`);
  return e;
}


/**
 * Confere se um módulo cumpre o contrato de provedor (usado nos testes de contrato; vale para o Node e para o servidor).
 * Obrigatório: nome, rede, status(), publicar(). Opcional: conectar, planejar, preparar (funções), imediato (boolean), antecedenciaMs (número).
 */
export function verificarProvedor(mod) {
  const e = [];
  if (typeof mod?.nome !== "string" || !mod.nome) e.push("falta `nome` (texto)");
  if (!REDES_VALIDAS.includes(mod?.rede)) e.push(`\`rede\` precisa ser uma de ${REDES_VALIDAS.join(", ")}`);
  for (const f of ["status", "publicar"]) if (typeof mod?.[f] !== "function") e.push(`falta a função ${f}()`);
  for (const f of ["conectar", "planejar", "preparar", "publicarEmPassos"]) if (mod?.[f] !== undefined && typeof mod[f] !== "function") e.push(`${f} precisa ser função`);
  if (mod?.imediato !== undefined && typeof mod.imediato !== "boolean") e.push("`imediato` precisa ser true/false");
  if (mod?.antecedenciaMs !== undefined && !(Number.isFinite(mod.antecedenciaMs) && mod.antecedenciaMs >= 0)) e.push("`antecedenciaMs` precisa ser um número ≥ 0");
  if (mod?.preparar && !(mod.antecedenciaMs > 0)) e.push("quem tem preparar() precisa de antecedenciaMs > 0");
  return e;
}

// O contrato do Praeko sem dependências de Node: nomes de rede, modos e a validação do pedido. É o que o servidor (Worker),
// o SDK e o CLI compartilham. Veja publicador.ts para a descrição do formato do pedido e da resposta.
export type Rede = "youtube" | "instagram" | "tiktok";
export type EstadoItem = "agendado" | "enviado" | "rascunho" | "privado" | "erro" | "cancelado";
/** Um destino do pedido: rede, horário ISO (ou null) e modo (youtube: privado|agendado|publico; tiktok: rascunho|direto; instagram: agora). */
export interface Destino { rede: Rede; quando?: string | null; modo?: string; fila?: boolean; midia?: { video?: string; capa?: string }; [k: string]: unknown }
/** O pedido que todo Publicador aceita (detalhes em publicador.ts). */
export interface Pedido {
  id?: string; titulo?: string; etiquetas?: string[]; midia: { video: string; capa?: string | null };
  textos: { youtube?: { titulo?: string; texto: string; comentarioFixo?: string }; instagram?: { texto: string; comentarioFixo?: string }; tiktok?: { texto: string }; [rede: string]: any };
  destinos: Destino[]; opcoes?: { formato?: "short" | "longo"; [k: string]: unknown };
}
export interface ItemResposta { rede: Rede; id: string; estado: EstadoItem; quando: string | null; url?: string; aviso?: string; studio?: string; [k: string]: any }
export interface RespostaPublicacao { id: string; itens: ItemResposta[] }
/** O contrato do Publicador: o mesmo para o Buffer, a fila local e o serviço remoto. */
export interface Publicador {
  publicar(pedido: Pedido, opcoes?: any): Promise<RespostaPublicacao>;
  status(id: string): Promise<RespostaPublicacao>;
  cancelar(id: string, opcoes?: any): Promise<{ cancelados: string[]; mantidos: unknown[] }>;
  canais(): Promise<{ rede: Rede; conectado: boolean; detalhe?: string; id?: string }[]>;
  [k: string]: any;
}
export const REDES: Record<string, Rede> = { yt: "youtube", youtube: "youtube", ig: "instagram", instagram: "instagram", tt: "tiktok", tiktok: "tiktok" };

export const REDES_VALIDAS: readonly Rede[] = ["youtube", "instagram", "tiktok"];
export const MODOS: Record<string, any> = { youtube: ["privado", "agendado", "publico"], tiktok: ["rascunho", "direto"], instagram: ["agora"] };
export const PROVEDORES = ["buffer", "local", "remoto"];

/** Confere o pedido. Devolve a lista de erros (vazia = ok). */
export function validarPedido(p: any): string[] {
  const e: string[] = [];
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
  if (marc.length) e.push(`text with an unfilled marker: ${marc.join(", ")}`);
  return e;
}


/**
 * Confere se um módulo cumpre o contrato de provedor (usado nos testes de contrato; vale para o Node e para o servidor).
 * Obrigatório: nome, rede, status(), publicar(). Opcional: conectar, planejar, preparar (funções), imediato (boolean), antecedenciaMs (número).
 */
export function verificarProvedor(mod: any): string[] {
  const e: string[] = [];
  if (typeof mod?.nome !== "string" || !mod.nome) e.push("falta `nome` (texto)");
  if (!REDES_VALIDAS.includes(mod?.rede)) e.push(`\`rede\` precisa ser uma de ${REDES_VALIDAS.join(", ")}`);
  for (const f of ["status", "publicar"]) if (typeof mod?.[f] !== "function") e.push(`falta a função ${f}()`);
  for (const f of ["conectar", "planejar", "preparar", "publicarEmPassos"]) if (mod?.[f] !== undefined && typeof mod[f] !== "function") e.push(`${f} must be a function`);
  if (mod?.imediato !== undefined && typeof mod.imediato !== "boolean") e.push("`imediato` precisa ser true/false");
  if (mod?.antecedenciaMs !== undefined && !(Number.isFinite(mod.antecedenciaMs) && mod.antecedenciaMs >= 0)) e.push("`antecedenciaMs` precisa ser um número ≥ 0");
  if (mod?.preparar && !(mod.antecedenciaMs > 0)) e.push("quem tem preparar() precisa de antecedenciaMs > 0");
  return e;
}

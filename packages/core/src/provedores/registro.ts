// Carrega os provedores diretos pelo nome da rede. Cada módulo exporta:
//   nome, rede, imediato?, antecedenciaMs?,
//   conectar({ ctx, args })            fluxo de autorização; guarda tokens em ctx.segredos
//   status({ ctx })                    { conectado, detalhe } (sem chamar nada que publique)
//   preparar({ item, ctx })            opcional: roda `antecedenciaMs` antes da hora; devolve estado parcial (guardado em item.prep)
//   publicar({ item, ctx })            devolve { id, url?, ... }
//   planejar({ item, ctx })            opcional: linhas de texto para a simulação
export const NOMES = ["youtube", "instagram", "tiktok"];
export async function carregar(nome: any) {
  if (!NOMES.includes(nome)) throw new Error(`provedor desconhecido: ${nome}`);
  try { return await import(`./${nome}.ts`); }
  catch (e) { if (e.code === "ERR_MODULE_NOT_FOUND" && String(e.message).includes(`${nome}.ts`)) throw new Error(`provedor "${nome}" ainda não foi escrito`); throw e; }
}
export async function carregarTodos() {
  const o: Record<string, any> = {};
  for (const n of NOMES) { try { o[n] = await carregar(n); } catch (e) { if (!/ainda não foi escrito/.test(e.message)) throw e; } }
  return o;
}

// O contrato do Praeko: qualquer projeto (o Bardo, um script, um agente) fala com um `Publicador` e não sabe
// se por trás está o Buffer, a fila local com os provedores diretos, ou o serviço remoto.
//
//   publicador.publicar(pedido)  → { id, itens: [{ rede, id, estado, quando, url?, aviso? }] }
//   publicador.status(id)        → o mesmo formato, com os estados atuais
//   publicador.cancelar(id)      → { cancelados: [...], mantidos: [...] }
//   publicador.canais()          → [{ rede, conectado, detalhe, id? }]
//
// pedido = {
//   id?,                                   // identifica o pedido (padrão: gerado)
//   titulo,                                // só para exibição e para o título do YouTube se faltar
//   midia: { video, capa? },               // caminhos locais (o adaptador hospeda/envia como precisar)
//   textos: { youtube:{titulo,texto,comentarioFixo?}, instagram:{texto,comentarioFixo?}, tiktok:{texto} },
//   destinos: [{ rede: "youtube"|"instagram"|"tiktok", quando: ISO|null, modo? }],
//   opcoes?: { youtube?:{…}, instagram?:{…}, tiktok?:{…}, formato?: "short"|"longo" },
// }
// modo: youtube "privado" (padrão) | "agendado" | "publico"; tiktok "rascunho" (padrão) | "direto"; instagram só "na hora".
// estado: "agendado" | "enviado" | "rascunho" | "privado" | "erro" | "cancelado".
import { REDES, REDES_VALIDAS, MODOS, PROVEDORES, validarPedido, verificarProvedor } from "./contrato.ts";
import type { Publicador } from "./contrato.ts";

/** Fábrica: criarPublicador({ config, provedor, ctx }). `provedor` padrão: config.provedor ou "buffer". */
export async function criarPublicador({ config, provedor, ctx }: any = {}): Promise<Publicador> {
  const nome = provedor || config?.provedor || "buffer";
  if (!PROVEDORES.includes(nome)) throw new Error(`provedor "${nome}" desconhecido (use ${PROVEDORES.join(", ")})`);
  const mod = await import(`./adaptadores/${nome}.ts`);
  return mod.criar({ config, ctx });
}
export { REDES, REDES_VALIDAS, MODOS, PROVEDORES, validarPedido, verificarProvedor };

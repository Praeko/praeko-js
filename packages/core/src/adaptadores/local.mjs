// Adaptador "local": fila em .praeko/fila.json (antes: .praeko/) + provedores diretos (YouTube, Instagram, TikTok) + executor.
// O que é "imediato" (YouTube) roda na hora do `publicar`; o resto sai na hora marcada, quando o executor
// (`praeko fila executar`, no launchd, ou o futuro servidor) passa. O Mac precisa estar ligado nessa hora.
import { cancelarItem, enfileirar, executar, lerFila } from "../fila.mjs";
import { carregarTodos } from "../provedores/registro.mjs";
import { validarPedido } from "../publicador.mjs";
import { randomBytes } from "node:crypto";

export const MODO_PADRAO = { youtube: "privado", tiktok: "rascunho", instagram: "agora" };

/** Estado de um item da fila na linguagem do contrato. */
export function estadoDe(it) {
  if (it.estado === "cancelado") return "cancelado";
  if (it.estado === "erro") return "erro";
  if (it.estado === "enviado") {
    if (it.acao) return "enviado";
    if (it.rede === "youtube" && it.resultado?.privacidade === "private" && !it.resultado?.publishAt) return "privado";
    if (it.rede === "tiktok" && it.resultado?.modo === "rascunho") return "rascunho";
    return it.rede === "youtube" && it.resultado?.publishAt ? "agendado" : "enviado";
  }
  return "agendado"; // pendente | preparado (inclui o item manual do comentário: espera o dono)
}
const itemDoContrato = (it) => ({ rede: it.rede, id: it.id, estado: estadoDe(it), quando: it.quando, ...(it.acao ? { acao: it.acao } : {}), ...(it.manual ? { manual: true } : {}), ...(it.resultado?.url ? { url: it.resultado.url } : {}), ...(it.resultado?.studio ? { studio: it.resultado.studio } : {}), ...(it.erro ? { aviso: it.erro } : {}) });

export function criar({ config, ctx, provedores }) {
  const todos = async () => provedores || carregarTodos();
  const agora = () => (ctx.agora ? ctx.agora() : new Date());
  const doPedido = (id) => lerFila(ctx.raiz).itens.filter((x) => x.pedido === id);
  return {
    nome: "local",
    async publicar(pedido) {
      const erros = validarPedido(pedido);
      if (erros.length) throw new Error(`pedido inválido: ${erros.join("; ")}`);
      const id = pedido.id || `p${randomBytes(3).toString("hex")}`, provs = await todos();
      const faltam = pedido.destinos.filter((d) => !provs[d.rede]).map((d) => d.rede);
      if (faltam.length) throw new Error(`provedor não instalado: ${faltam.join(", ")}`);
      const novos = pedido.destinos.map((d) => {
        const op = { ...(config[d.rede] || {}), ...(pedido.opcoes?.[d.rede] || {}) };
        op.modo = d.modo || op.modo || MODO_PADRAO[d.rede];
        return enfileirar(ctx.raiz, { pedido: id, slug: id, rede: d.rede, provedor: d.rede, quando: d.quando || agora().toISOString(), video: pedido.midia.video, capa: pedido.midia.capa || null, textos: pedido.textos[d.rede], opcoes: op, formato: pedido.opcoes?.formato || "short", titulo: pedido.titulo });
      });
      await executar({ raiz: ctx.raiz, provedores: provs, ctx, agora: agora(), soIds: novos.map((n) => n.id), log: ctx.log });
      return { id, itens: doPedido(id).map(itemDoContrato) };
    },
    async status(id) { const it = doPedido(id); if (!it.length) throw new Error(`pedido ${id} não existe na fila`); return { id, itens: it.map(itemDoContrato) }; },
    async cancelar(id) {
      const cancelados = [], mantidos = [];
      for (const it of doPedido(id)) { if (["enviado", "cancelado"].includes(it.estado)) { if (it.estado === "enviado") mantidos.push(itemDoContrato(it)); } else { cancelarItem(ctx.raiz, it.id); cancelados.push(it.id); } }
      return { cancelados, mantidos };
    },
    async canais() {
      const provs = await todos(), out = [];
      for (const [rede, p] of Object.entries(provs)) { const s = await p.status({ ctx }); out.push({ rede, conectado: s.conectado, detalhe: s.detalhe }); }
      return out;
    },
  };
}

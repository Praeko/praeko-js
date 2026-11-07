// Adaptador "remoto": o contrato do Publicador em cima do SDK do serviço Praeko (Cloudflare). Sobe o vídeo e a capa
// em partes, cria o post com os destinos e devolve o mesmo formato dos outros adaptadores.
//   publicar(pedido)  → { id, itens }       pedido.midia = caminhos locais (o adaptador envia) ou ids de mídia já enviada ({ videoId, capaId })
//   status(id)        → { id, itens }
//   cancelar(id)      → { cancelados, mantidos }
//   canais()          → [{ rede, conectado, detalhe }]
// Fala o contrato em INGLÊS (docs/api-contract.md): o pedido (chaves em português, interno do Publicador) vira inglês com toEN() e a resposta volta com toPT().
// Um cliente injetado no estilo antigo (`.midia`, sem `.media`) ainda funciona (alias deprecado).
// Configuração: `remoto: { url }` no praeko.json (ou arauto.json); chave em PRAEKO_KEY (ou ARAUTO_CHAVE) ou nos segredos ("praeko/chave"; cai em "arauto/chave").
import { Praeko } from "@praeko/sdk";
import { uploadFile } from "@praeko/sdk/node";
import { toEN, toPT } from "@praeko/sdk/contract";
import { validarPedido } from "../contrato.ts";
import { segredos as segredosPadrao } from "../segredos.ts";

export const REF_CHAVE = "praeko/chave"; // `segredos.obter` cai no antigo "arauto/chave" se o novo não existir

/** Item do servidor → item do contrato. */
export const itemDoContrato = (i: any) => ({ rede: i.rede, id: i.id, estado: i.estado, quando: i.quando, ...(i.url ? { url: i.url } : {}), ...(i.studio ? { studio: i.studio } : {}), ...(i.aviso ? { aviso: i.aviso } : {}), ...(i.custom ? { custom: true } : {}) });

// `praeko` (ou `ctx.praeko`) injeta um cliente já pronto; `arauto` (nome antigo, ainda usado por quem chama de fora) vale como reserva.
export function criar({ config, ctx, praeko, arauto }: any = {}) {
  const injetado = ctx?.praeko ?? praeko ?? ctx?.arauto ?? arauto, seg = ctx?.segredos || segredosPadrao, log = ctx?.log || (() => {});
  const cliente = () => {
    if (injetado) return injetado;
    const url = config?.remoto?.url, chave = process.env.PRAEKO_KEY || process.env.ARAUTO_CHAVE || seg.obter(REF_CHAVE);
    if (!url) throw new Error('falta a url do serviço: "remoto": { "url": "https://…" } no praeko.json (ou --server)');
    if (!chave) throw new Error("falta a chave do serviço: defina PRAEKO_KEY (ou ARAUTO_CHAVE) ou rode `echo $KEY | praeko key store`");
    return new Praeko({ url, key: chave });
  };
  const novo = (a: any) => !!a.media;
  const subir = (a: any, caminho: any, tipo: any, onProgress?: any) => uploadFile(a, caminho, { type: tipo, onProgress }); // uploadFile fala com o cliente novo e com o antigo
  return {
    nome: "remoto",
    async publicar(pedido: any, { aoProgredir }: any = {}) {
      const erros = validarPedido(pedido.midia?.videoId ? { ...pedido, midia: { video: pedido.midia.videoId } } : pedido);
      if (erros.length) throw new Error(`pedido inválido: ${erros.join("; ")}`);
      const a = cliente();
      let videoId = pedido.midia.videoId, capaId = pedido.midia.capaId;
      if (!videoId) { log(`  enviando o vídeo ao serviço (${pedido.midia.video})…`); videoId = (await subir(a, pedido.midia.video, "video", aoProgredir)).id; }
      if (!capaId && pedido.midia.capa) { log("  enviando a capa…"); capaId = (await subir(a, pedido.midia.capa, "cover")).id; }
      // mídia só deste destino (ex.: o Instagram recebe a cópia com a capa nos primeiros quadros): caminho local → sobe uma vez; ou ids já enviados
      const extras = new Map(), doDestino = async (d: any) => {
        if (!d.midia) return undefined;
        const m: Record<string, any> = {};
        for (const [campo, tipo] of [["video", "video"], ["capa", "capa"]] as const) {
          const x = d.midia[campo], idJa = d.midia[`${campo}Id`];
          if (idJa) m[campo] = idJa;
          else if (x) { if (!extras.has(x)) { log(`  enviando ${tipo} do destino ${d.rede} (${x})…`); extras.set(x, (await subir(a, x, tipo === "capa" ? "cover" : tipo)).id); } m[campo] = extras.get(x); }
        }
        return Object.keys(m).length ? m : undefined;
      };
      const destinosCorpo = [];
      for (const d of pedido.destinos) { const m = await doDestino(d); destinosCorpo.push({ ...d, ...(m ? { midia: m } : {}) }); }
      const corpo = { ...(pedido.id ? { id: pedido.id } : {}), titulo: pedido.titulo, midia: { video: videoId, ...(capaId ? { capa: capaId } : {}) }, textos: pedido.textos, destinos: destinosCorpo.map((d) => ({ rede: d.rede, ...(d.midia ? { midia: d.midia } : {}), ...(d.quando ? { quando: d.quando } : {}), ...(d.modo ? { modo: d.modo } : {}), ...(d.fila ? { fila: true } : {}), ...(d.rascunho ? { rascunho: true } : {}) })), ...(pedido.etiquetas ? { etiquetas: pedido.etiquetas } : {}), ...(pedido.opcoes ? { opcoes: pedido.opcoes } : {}), ...(pedido.fila ? { fila: true } : {}), ...(pedido.rascunho ? { rascunho: true } : {}), origem: "arauto-cli" };
      const r = novo(a) ? toPT(await a.posts.create(toEN(corpo, "req")), "res") : await a.posts.criar(corpo);
      return { id: r.id, itens: r.itens.map(itemDoContrato) };
    },
    async status(id: any) { const c = cliente(), p = novo(c) ? toPT(await c.posts.get(id), "res") : await c.posts.obter(id); return { id: p.id, itens: p.itens.map(itemDoContrato) }; },
    async cancelar(id: any) { const c = cliente(), r = novo(c) ? toPT(await c.posts.cancel(id), "res") : await c.posts.cancelar(id); return { cancelados: r.cancelados, mantidos: r.mantidos.map(itemDoContrato) }; },
    async canais() { const c0 = cliente(), r0 = novo(c0) ? toPT(await c0.channels.list({ verify: true }), "res") : await c0.canais.listar({ verificar: true }); return r0.canais.map((c: any) => ({ rede: c.rede, conectado: c.conectado, detalhe: c.detalhe, ...(c.id ? { id: c.id } : {}) })); },
  };
}

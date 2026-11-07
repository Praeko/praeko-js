// Adaptador "buffer": agenda pelo Buffer (https://developers.buffer.com). O Buffer só busca vídeo por URL pública,
// então o vídeo sobe antes para a hospedagem (R2). Não aceita capa à parte: a capa é colada nos 2 primeiros quadros
// (e o quadro 0 vira a miniatura no Instagram/TikTok). YouTube: modo "privado" vira privacy private.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { caminhoEstado, caminhoLeitura, pastaEstado } from "../estado.mjs";
import { apagarPost, criarPost, escolherCanais, listarCanais, montarPosts } from "../buffer.mjs";
import * as capaQuadroPadrao from "../capa-quadro.mjs";
import { validarPedido } from "../publicador.mjs";
import { randomBytes } from "node:crypto";

export const REF_CHAVE = "buffer/principal";

export function criar({ config, ctx }) {
  const arq = caminhoEstado(ctx.raiz, "buffer.json"), arqLeitura = () => caminhoLeitura(ctx.raiz, "buffer.json"); // grava em .praeko/, lê também do antigo .praeko/
  const ler = () => (existsSync(arqLeitura()) ? JSON.parse(readFileSync(arqLeitura(), "utf8")) : { pedidos: {} });
  const gravar = (r) => { mkdirSync(pastaEstado(ctx.raiz), { recursive: true }); writeFileSync(arq, JSON.stringify(r, null, 2) + "\n"); };
  const op = () => { const chave = ctx.segredos.obter(REF_CHAVE); if (!chave) throw new Error("sem chave do Buffer: `echo $CHAVE | praeko agendar --chave` (publish.buffer.com/settings/api)"); return { chave, fetchFn: ctx.fetchFn }; };
  const cq = ctx.deps?.capaQuadro || capaQuadroPadrao;

  return {
    nome: "buffer",
    async publicar(pedido) {
      const erros = validarPedido(pedido);
      if (erros.length) throw new Error(`pedido inválido: ${erros.join("; ")}`);
      const sem = pedido.destinos.filter((d) => !d.quando).map((d) => d.rede);
      if (sem.length) throw new Error(`o Buffer precisa de horário (falta em ${sem.join(", ")})`);
      const id = pedido.id || `p${randomBytes(3).toString("hex")}`, reg = ler();
      const redes = pedido.destinos.map((d) => d.rede), quando = Object.fromEntries(pedido.destinos.map((d) => [d.rede, d.quando]));
      const modos = Object.fromEntries(pedido.destinos.filter((d) => d.modo).map((d) => [d.rede, d.modo]));
      const o = op();
      const { canais, faltam } = escolherCanais({ config, canais: await listarCanais(o), redes });
      if (faltam.length) throw new Error(faltam.join("\n"));
      let videoUrl = pedido.opcoes?.videoUrl, chaveObjeto, arquivo = pedido.midia.video, capaEmbutida = false;
      const previo = reg.pedidos[id];
      if (!videoUrl && previo?.videoUrl) { videoUrl = previo.videoUrl; chaveObjeto = previo.chaveObjeto; }
      if (!videoUrl) {
        const capa = pedido.midia.capa;
        if (capa && pedido.opcoes?.capaNoQuadro !== false && pedido.opcoes?.formato !== "longo") {
          const v = cq.sondar(arquivo), c = cq.dimensoesImagem(capa);
          if (cq.mesmaProporcao(c, v)) { const saida = caminhoEstado(ctx.raiz, `${id}.capa.mp4`); mkdirSync(pastaEstado(ctx.raiz), { recursive: true }); cq.embutirCapa({ video: arquivo, capa, saida }); arquivo = saida; capaEmbutida = true; }
        }
        const s = await ctx.hospedar(arquivo, id); videoUrl = s.url; chaveObjeto = s.chave;
      }
      const posts = montarPosts({ config, textos: pedido.textos, modos, canais, videoUrl, quando, redes, lembrete: !!pedido.opcoes?.lembrete, ...(capaEmbutida ? { miniaturaMs: 0 } : {}) });
      const r = reg.pedidos[id] = { id, titulo: pedido.titulo, videoUrl, chaveObjeto, criadoEm: new Date().toISOString(), posts: previo?.posts || [] };
      for (const x of posts) {
        try { const p = await criarPost(x.input, o); r.posts.push({ rede: x.rede, id: p.id, dueAt: x.input.dueAt, canalId: x.input.channelId }); gravar(reg); }
        catch (e) { gravar(reg); throw new Error(`${x.rede}: ${e.message} (já criado: ${r.posts.map((q) => q.rede).join(", ") || "nada"})`); }
      }
      return { id, itens: r.posts.map((p) => ({ rede: p.rede, id: p.id, estado: "agendado", quando: p.dueAt })) };
    },
    async status(id) {
      const p = ler().pedidos[id]; if (!p) throw new Error(`pedido ${id} não existe`);
      return { id, itens: p.posts.map((x) => ({ rede: x.rede, id: x.id, estado: "agendado", quando: x.dueAt })) };
    },
    async cancelar(id, { redes } = {}) {
      const reg = ler(), p = reg.pedidos[id]; if (!p) throw new Error(`pedido ${id} não existe`);
      const o = op(), cancelados = [], mantidos = [];
      for (const x of p.posts) { if (!redes || redes.includes(x.rede)) { await apagarPost(x.id, o); cancelados.push(x.id); } else mantidos.push(x.id); }
      p.posts = p.posts.filter((x) => !cancelados.includes(x.id));
      if (!p.posts.length) { if (p.chaveObjeto && ctx.removerHospedado) await ctx.removerHospedado(p.chaveObjeto); delete reg.pedidos[id]; }
      gravar(reg);
      return { cancelados, mantidos };
    },
    async canais() { return (await listarCanais(op())).map((c) => ({ rede: c.servico, id: c.id, conectado: true, detalhe: `${c.nome} [${c.org}]${c.pausado ? " (fila pausada)" : ""}` })); },
  };
}

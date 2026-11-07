// Contexto entregue a provedores e adaptadores: tudo que toca o mundo (rede, segredos, hospedagem, relógio) entra por aqui,
// então dá para testar com dublês e, depois, rodar o mesmo código dentro de um Worker.
import { segredos as segredosPadrao } from "./segredos.mjs";
import * as hospedagem from "./hospedagem.mjs";

export function criarContexto({ config, raiz = process.cwd(), log = console.log, fetchFn = globalThis.fetch, segredos = segredosPadrao, agora = () => new Date() } = {}) {
  const h = () => hospedagem.configHospedagem(config);
  return {
    config, raiz, log, fetchFn, segredos, agora,
    /** Sobe um arquivo para a hospedagem pública temporária (R2). Devolve { url, chave }. */
    hospedar: async (arquivo, slug = "midia") => hospedagem.subir({ h: h(), slug, arquivo, cwd: raiz }),
    removerHospedado: async (chave) => hospedagem.apagar({ h: h(), chave, cwd: raiz }),
  };
}

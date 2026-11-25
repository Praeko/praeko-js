// Estado de uma CONVERSA de comentários (thread de topo + respostas), igual para YouTube e Instagram (docs/arquitetura-leitura.md, "Comentários: última fala").
// Regra (24/11/2026): a conversa só está "respondida" quando o ÚLTIMO a falar (entre as respostas visíveis) é o dono. Se o autor (ou outra pessoa) responde depois do dono,
// ela volta a ficar pendente. Casos de borda:
//  - resposta OCULTA (Instagram) não conta como última fala (o dono a escondeu; só o autor e o dono a veem), mas conta para a atividade;
//  - lista INCOMPLETA (a rede trouxe menos respostas do que `total`): não dá para saber quem falou por último → pendente ("na dúvida, pendente");
//  - comentário de topo do próprio dono: nunca "respondido" (já não entra na pendência por `doDono`).
// `ultimaAtividadeEm` = a data mais recente entre o comentário e TODAS as respostas conhecidas (ocultas incluídas), em ISO UTC (toISOString), para comparar como texto.

type Fala = { publicadoEm?: string | null; doDono?: boolean; oculto?: boolean };

/** Data da rede (YouTube "…Z", Instagram "…+0000") → ISO UTC com milissegundos; inválida ou ausente → null. */
export const isoUtc = (s: unknown): string | null => {
  if (s == null || s === "") return null;
  const t = Date.parse(String(s));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/** Respostas em ordem de data (a mais antiga primeiro; empate mantém a ordem da rede). Sem data ficam no começo. */
export function emOrdem<T extends Fala>(respostas: T[]): T[] {
  return respostas.map((r, i) => ({ r, i, t: isoUtc(r.publicadoEm) ?? "" })).sort((a, b) => a.t.localeCompare(b.t) || a.i - b.i).map((x) => x.r);
}

/**
 * O estado da conversa. `topo` = o comentário de topo; `respostas` = as respostas conhecidas; `total` = quantas a rede diz que existem (padrão: as conhecidas).
 * Devolve `respondido` (última fala visível é do dono, lista completa e o topo não é do dono), `ultimaFalaDoDono` (a última resposta visível conhecida é do dono)
 * e `ultimaAtividadeEm`.
 */
export function estadoDaConversa(topo: Fala, respostas: Fala[], total: number = respostas.length): { respondido: boolean; ultimaFalaDoDono: boolean; ultimaAtividadeEm: string | null } {
  const ordem = emOrdem(respostas), visiveis = ordem.filter((r) => !r.oculto), ultima = visiveis[visiveis.length - 1];
  const completa = respostas.length >= (Number(total) || 0);
  let atividade = isoUtc(topo.publicadoEm);
  for (const r of ordem) { const t = isoUtc(r.publicadoEm); if (t && (!atividade || t > atividade)) atividade = t; }
  const ultimaFalaDoDono = !!ultima?.doDono;
  return { respondido: !topo.doDono && completa && ultimaFalaDoDono, ultimaFalaDoDono, ultimaAtividadeEm: atividade };
}

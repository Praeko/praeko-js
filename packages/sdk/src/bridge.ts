// Ponte contrato novo ↔ vocabulário legado (português), do lado do CLIENTE: recebe uma chamada no estilo antigo (método, caminho legado, query,
// corpo) e a transforma na chamada do contrato novo; converte a resposta nova de volta para o formato antigo. Quem usa:
//  - o front web do Praeko: a interface continua com os nomes em português, a conversa com o servidor é no contrato novo;
//  - os testes do servidor (PRAEKO_API=novo): rodam todas as asserções antigas contra as rotas novas, o que prova que a tradução é fiel.
import { ERROR_CODES_REVERSE, errorEnvelopeToPT, matchLegacy, matchNew, toEN, toPT, translateSlots, fillPath } from "./contract.ts";
import type { Route } from "./contract.ts";

/** Cabeçalho que pede o contrato novo nos caminhos que existem nos dois (ex.: /v1/posts). */
export const CONTRACT_HEADER = { "x-praeko-contract": "en" } as const;

/**
 * `caminho`: "/v1/canais/youtube/vagas?x=1" (legado) → { path, query: URLSearchParams, body, def } do contrato novo. Se o caminho já for novo, só traduz o corpo.
 */
export function bridgeRequest(method: string, caminho: string, body?: unknown): { path: string; query: URLSearchParams; body: unknown; def: Route | null } {
  const u = new URL(caminho, "http://x");
  const achado = matchLegacy(method, u.pathname) || matchNew(method, u.pathname);
  if (!achado) return { path: u.pathname, query: u.searchParams, body, def: null };
  const def = achado.route, query = new URLSearchParams();
  for (const [k, v] of u.searchParams) { const [nk, nv] = Object.entries(toEN<Record<string, string>>({ [k]: v }, "req"))[0] as [string, string]; query.append(nk, nv); }
  let corpo: unknown = body;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const c = toEN<Record<string, unknown>>(body, "req");
    if (def.key === "channels.slots.put" && Array.isArray(c.slots)) c.slots = translateSlots(c.slots, "toEN");
    corpo = c;
  }
  return { path: fillPath(def.path, achado.values), query, body: corpo, def };
}

/** Resposta nova → formato legado. `status`: HTTP; `corpo`: JSON já interpretado. `paths`: devolve também os caminhos de API (avatar…) no estilo antigo. */
export function bridgeResponse<T = unknown>(status: number, corpo: unknown, { paths = false }: { paths?: boolean } = {}): T {
  if (corpo && typeof corpo === "object" && (corpo as { error?: unknown }).error) return errorEnvelopeToPT(corpo) as T;
  return toPT<T>(corpo, "res", { paths });
}

export { ERROR_CODES_REVERSE };

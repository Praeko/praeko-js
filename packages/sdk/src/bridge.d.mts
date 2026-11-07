// Tipos de bridge.mjs (escritos à mão; o vocabulário vem de contract.d.mts, que é gerado).
import type { Route } from "./contract.mjs";
export { ERROR_CODES_REVERSE } from "./contract.mjs";
/** Cabeçalho que pede o contrato novo nos caminhos que existem nos dois (ex.: /v1/posts). */
export declare const CONTRACT_HEADER: { readonly "x-praeko-contract": "en" };
/** Chamada no estilo antigo → chamada do contrato novo. `def` é null quando o caminho não é de nenhuma rota conhecida. */
export declare function bridgeRequest(method: string, caminho: string, body?: unknown): { path: string; query: URLSearchParams; body: unknown; def: Route | null };
/** Resposta nova → formato legado (português). A forma muda de idioma: quem chama diz o tipo que espera. */
export declare function bridgeResponse<T = unknown>(status: number, corpo: unknown, o?: { paths?: boolean }): T;

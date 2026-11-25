import { ERROR_CODES_REVERSE } from "./contract.js";
import type { Route } from "./contract.js";
/** Cabeçalho que pede o contrato novo nos caminhos que existem nos dois (ex.: /v1/posts). */
export declare const CONTRACT_HEADER: {
    readonly "x-praeko-contract": "en";
};
/**
 * `caminho`: "/v1/canais/youtube/vagas?x=1" (legado) → { path, query: URLSearchParams, body, def } do contrato novo. Se o caminho já for novo, só traduz o corpo.
 */
export declare function bridgeRequest(method: string, caminho: string, body?: unknown): {
    path: string;
    query: URLSearchParams;
    body: unknown;
    def: Route | null;
};
/** Resposta nova → formato legado. `status`: HTTP; `corpo`: JSON já interpretado. `paths`: devolve também os caminhos de API (avatar…) no estilo antigo. */
export declare function bridgeResponse<T = unknown>(status: number, corpo: unknown, { paths }?: {
    paths?: boolean;
}): T;
export { ERROR_CODES_REVERSE };

import type { DocRoute } from "./contract-docs.js";
/** Documento OpenAPI 3.1 de toda a API pública. `agora` fixa a data dos exemplos que dependem do relógio (padrão: agora). */
/** Opções dos geradores: `routes` (padrão: a tabela do contrato), `agora` (data dos exemplos que dependem do relógio) e `base` (URL do servidor). */
export interface GeradorOpcoes {
    routes?: readonly DocRoute[];
    agora?: number;
    base?: string;
}
export declare function gerarOpenApi({ routes, agora, base }?: GeradorOpcoes): Record<string, any>;
/** Coleção do Postman (v2.1): variáveis `baseUrl` e `praekoKey`, uma pasta por grupo, corpo de exemplo preenchido. */
export declare function gerarPostman({ routes, agora, base }?: GeradorOpcoes): Record<string, any>;

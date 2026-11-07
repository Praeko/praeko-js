// Tipos de openapi.mjs (escritos à mão): gera OpenAPI 3 e coleção Postman a partir da tabela de rotas do contrato.
export declare function gerarOpenApi(opts?: { routes?: readonly unknown[]; agora?: number; base?: string }): Record<string, any>;
export declare function gerarPostman(opts?: { routes?: readonly unknown[]; agora?: number; base?: string }): Record<string, any>;

/** Uma rota como a documentação a lê (a tabela ROUTES de contract.ts tem estas chaves e mais algumas). */
export interface DocRoute {
    readonly key: string;
    readonly method: string;
    readonly path: string;
    readonly scope: string;
    readonly body?: string;
    readonly raw?: boolean;
    readonly summary: string;
}
/** Um campo do corpo (ou de um objeto aninhado). */
export interface DocField {
    name: string;
    type: string;
    desc: string;
    required?: boolean;
    enum?: readonly string[];
    items?: string;
    fields?: DocField[];
    default?: unknown;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    maxItems?: number;
    maxItemLength?: number;
}
/** Um parâmetro de consulta (query string). */
export interface DocQuery {
    name: string;
    desc: string;
    type?: string;
    enum?: readonly string[];
    default?: string;
}
/** Um cabeçalho de pedido documentado. */
export interface DocHeader {
    name: string;
    type: string;
    minLength: number;
    maxLength: number;
    desc: string;
    example: string;
}
/** Um parâmetro de caminho. */
export interface DocParam {
    desc: string;
    exemplo: string;
    enum?: readonly string[];
    fixo?: boolean;
}
export interface DocCorpo {
    fields: DocField[];
    example: any;
    nota?: string;
    fechado?: boolean;
}
export interface DocResposta {
    status: number;
    exemplo?: any;
    lido?: boolean;
    tipo?: string;
    nota?: string;
    opcionais?: string[];
    mapas?: string[];
    sucessos?: [number, string][];
}
/** `[status, código, quando]` */
export type DocErro = [number, string, string];
export interface DocRota {
    corpo: DocCorpo | null;
    consulta: DocQuery[];
    cabecalhos: DocHeader[];
    resposta: DocResposta | null;
    erros: DocErro[];
}
export declare const IDS_EXEMPLO: {
    midiaVideo: string;
    midiaCapa: string;
    post: string;
    item: string;
    webhook: string;
    entrega: string;
    ideia: string;
    chave: string;
    video: string;
    comentario: string;
};
/** Texto de um valor que depende do relógio: o servidor recusa horário no passado, então o exemplo traz "{{em3dias}}" e `materializar` troca pela data de verdade. */
export declare const DATA_FUTURA = "{{em3dias}}";
/** Cópia profunda de `valor` com o "{{em3dias}}" trocado por uma data ISO daqui a 3 dias (20:30 UTC) e, opcionalmente, ids de exemplo trocados (`trocas`: { de: para }). */
export declare function materializar(valor: any, agora?: number, trocas?: Record<string, string>): any;
/** Parâmetros de caminho: descrição, valores fixos e exemplo (aparece na URL do código gerado enquanto o campo do Testar está vazio). `fixo`: valor sempre seguro, já vem preenchido no Testar. */
export declare const PARAMS: Record<string, DocParam>;
/** Descrição e exemplo de um parâmetro de caminho de uma rota. */
export declare function paramDe(route: DocRoute, nome: string): DocParam;
export declare const GRUPOS: Record<string, string>;
/** Nome do grupo de uma rota (o primeiro pedaço da chave). */
export declare const grupoDe: (r: DocRoute) => string;
export declare const TITULOS: Record<string, string>;
/** Descrição em português de cada rota (o `summary` do contrato continua em inglês e é o que sai em docs/api-contract.md). */
export declare const RESUMOS: Record<string, string>;
/** Título e descrição em português de uma rota (HEAD tem texto próprio). */
export declare const tituloDe: (r: DocRoute) => string;
export declare const resumoDe: (r: DocRoute) => string;
/** O cabeçalho `Idempotency-Key`. Só as rotas autenticadas de POST, PATCH e DELETE o aceitam (veja `aceitaIdempotencia`); sem ele, nada muda. */
export declare const CABECALHO_IDEMPOTENCIA: DocHeader;
/** A rota aceita `Idempotency-Key`? Autenticada, método que muda estado (POST, PATCH, DELETE) e corpo que não é binário (partes e upload simples da mídia ficam de fora: são bytes crus e já são repetíveis). */
export declare const aceitaIdempotencia: (r: DocRoute) => boolean;
/** Cabeçalhos de pedido documentados de uma rota (hoje só o `Idempotency-Key`). */
export declare const cabecalhosDe: (r: DocRoute) => DocHeader[];
/** Parâmetros de consulta documentados de uma rota. */
export declare const consultaDe: (r: DocRoute) => DocQuery[];
/** Erros que qualquer rota autenticada pode dar. */
export declare const ERROS_COMUNS: DocErro[];
/** Erros específicos de uma rota (os do corpo JSON entram junto quando há corpo). */
export declare const ERROS_IDEMPOTENCIA: DocErro[];
export declare const errosDe: (r: DocRoute) => DocErro[];
/** Tudo o que a documentação sabe de uma rota: `{ corpo, consulta, cabecalhos, resposta, erros }` (campos ausentes ficam null ou vazios). */
export declare function docDe(r: DocRoute): DocRota;
/** Os status de sucesso de uma rota, `[[status, quando]]`, o principal primeiro (o da resposta de exemplo). Sem aviso próprio, é só `[[status, "Sucesso."]]`. */
export declare function statusDe(r: DocRoute): [number, string][];
/**
 * Esquema JSON (o suficiente para o OpenAPI e para um gerador de cliente) derivado de um exemplo de resposta: tipos, listas (união dos elementos),
 * datas ISO como `date-time` e `required` com todas as chaves vistas, menos as de `opcionais` (nomes de chave que nem sempre vêm).
 * `null` no exemplo vira "qualquer tipo, pode ser null".
 */
export declare function esquemaDeExemplo(v: any, opcionais?: readonly string[]): any;
/** Rotas com corpo JSON que ainda não têm esquema (a lista de pendências; o teste exige que esteja vazia). */
export declare const semEsquema: (routes: readonly DocRoute[]) => string[];
export declare const ROTAS_COM_ESQUEMA: string[];
/** Nomes dos campos aninhados em ordem, achatados (`items[].network`), com o nível, para a tabela "Corpo". */
export declare function achatar(fields: DocField[], prefixo?: string, nivel?: number): (DocField & {
    caminho: string;
    nivel: number;
})[];
/** Limites e valores de um campo do corpo, em frases curtas (a tela #/docs e as docs públicas mostram a mesma coisa). */
export declare function restricoesDe(c: DocField): string[];
/** O tipo de um campo em português ("texto", "inteiro", "texto[]"…). */
export declare const tipoTextoDe: (c: DocField) => string;
/**
 * Confere `valor` contra a lista de campos (tipo, obrigatório, valores aceitos, limites). Devolve a lista de problemas (vazia = ok).
 * `fechado`: campo que não está no esquema é problema. Um texto igual a DATA_FUTURA vale como data.
 */
export declare function validar(fields: DocField[], valor: any, { fechado, caminho }?: {
    fechado?: boolean;
    caminho?: string;
}): string[];

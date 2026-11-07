// Gera packages/sdk/src/contract.d.mts (os tipos TypeScript do contrato) a partir de packages/sdk/src/contract.mjs, a fonte única em código.
// `npm run types:contract` reescreve o arquivo; com --check só confere (o teste packages/sdk/test/contract-types.test.mjs falha se estiver desatualizado).
// Determinístico: a saída depende só do contrato (ordem das tabelas preservada, sem data nem caminho absoluto).
// O que vira tipo: rotas (chave, método, caminho, alias, escopo), campos PT ↔ EN, valores de vocabulário fechado, códigos de erro, escopos e o
// envelope de erro. O contrato NÃO descreve o corpo das respostas de cada rota: esses formatos continuam escritos à mão em src/index.d.ts.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ERROR_CODES, KEYS, MEDIA_PUBLIC_ALIAS_PREFIX, ROUTES, SAME_KEYS, SCOPED_KEYS, SCOPED_VALUES, SCOPES, VALUES } from "../packages/sdk/src/contract.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
export const ARQUIVO = join(RAIZ, "packages", "sdk", "src", "contract.d.mts");

const q = (s) => JSON.stringify(s);
const uniao = (xs) => { const u = [...new Set(xs)]; return u.length ? u.map(q).join(" | ") : "never"; };
const linhas = (xs, recuo = "  ") => xs.map((x) => recuo + x).join("\n");
const ptDe = (pt) => (/^[A-Za-z_$][\w$]*$/.test(pt) ? pt : q(pt));

function rota(r) {
  const campos = [`key: ${q(r.key)}`, `method: ${q(r.method)}`, `path: ${q(r.path)}`, `legacy: ${r.legacy === null ? "null" : q(r.legacy)}`, `scope: ${q(r.scope)}`];
  if (r.raw) campos.push("raw: true");
  if (r.body) campos.push(`body: ${q(r.body)}`);
  if (r.query) campos.push(`query: { ${Object.entries(r.query).map(([k, m]) => `${ptDe(k)}: { ${Object.entries(m).map(([a, b]) => `${ptDe(a)}: ${q(b)}`).join("; ")} }`).join("; ")} }`);
  campos.push("summary: string");
  return `{ ${campos.join("; ")} }`;
}

/** EN de um campo PT (para nomear os vocabulários de valores pelo nome do contrato). */
const enDoCampo = (pt) => KEYS.find((k) => k[0] === pt)?.[1] ?? pt;

export function gerar() {
  const metodos = [...new Set(ROUTES.map((r) => r.method))];
  const sentidos = (so) => (so === "req" ? "pedido" : so === "res" ? "resposta" : "ambos");
  const valoresEN = Object.entries(VALUES).map(([pt, rows]) => `/** \`${pt}\` → \`${enDoCampo(pt)}\` */\n  ${ptDe(enDoCampo(pt))}: ${uniao(rows.filter((r) => r[2] !== "req").map((r) => r[1]))};`);
  const valoresPedido = Object.entries(VALUES).map(([pt, rows]) => `${ptDe(enDoCampo(pt))}: ${uniao(rows.map((r) => r[1]))};`);
  const valoresPT = Object.entries(VALUES).map(([pt, rows]) => `${ptDe(pt)}: ${uniao(rows.map((r) => r[0]))};`);
  const escopados = Object.entries(SCOPED_VALUES).flatMap(([pai, campos]) => Object.entries(campos).map(([campo, rows]) => `${ptDe(`${enDoCampo(pai)}.${enDoCampo(campo)}`)}: ${uniao(rows.map((r) => r[1]))};`));
  return `// GERADO por scripts/contract-types.mjs a partir de contract.mjs: NÃO edite à mão. Rode \`npm run types:contract\`.
// Tipos do contrato público da API (inglês) e do vocabulário legado (português). Os formatos de resposta por rota ficam em index.d.ts.

// ---------------------------------------------------------------------------------------------------------------- escopos
/** Escopo de uma chave de API no contrato. */
export type Scope = ${uniao(Object.values(SCOPES))};
/** Escopo no vocabulário interno (legado). */
export type LegacyScope = ${uniao(Object.keys(SCOPES))};
export declare const SCOPES: { ${Object.entries(SCOPES).map(([pt, en]) => `readonly ${ptDe(pt)}: ${q(en)}`).join("; ")} };
export declare function scopeToEN<S extends string>(s: S): S extends LegacyScope ? (typeof SCOPES)[S] : S;
export declare function scopeToPT(s: string): string;

// ---------------------------------------------------------------------------------------------------------------- rotas
export type HttpMethod = ${uniao(metodos)};
/** Escopo mínimo de uma rota (ou "public"). */
export type RouteScope = Scope | "public";
/** A tabela de rotas, na ordem do contrato (${ROUTES.length} entradas). */
export type RouteTable = readonly [
${linhas(ROUTES.map((r) => rota(r) + ","))}
];
export declare const ROUTES: RouteTable;
export type Route = RouteTable[number];
/** Nome do handler (\`key\`) de cada rota. */
export type RouteKey = Route["key"];
/** Caminho novo (template com \`:param\`). */
export type RoutePath = Route["path"];
/** Alias legado em português (sem as rotas que não têm alias). */
export type LegacyRoutePath = Exclude<Route["legacy"], null>;
export type RouteOf<K extends RouteKey> = Extract<Route, { key: K }>;
/** Rotas de um método, por caminho: \`RoutesFor<"GET">["path"]\`. */
export type RoutesFor<M extends HttpMethod> = Extract<Route, { method: M }>;
/** Nomes dos parâmetros de um template: \`PathParams<"/v1/posts/:id/items/:item/comment">\` = "id" | "item". */
export type PathParams<P extends string> = P extends \`\${string}:\${infer N}/\${infer R}\` ? N | PathParams<\`/\${R}\`> : P extends \`\${string}:\${infer N}\` ? N : never;
export declare const MEDIA_PUBLIC_ALIAS_PREFIX: ${q(MEDIA_PUBLIC_ALIAS_PREFIX)};
export interface RouteMatch { route: Route; values: string[] }
export declare function paramNames(tpl: string): string[];
export declare function fillPath(tpl: string, values: ReadonlyArray<string | number | null | undefined>): string;
export declare function matchNew(method: string, pathname: string): RouteMatch | null;
export declare function matchLegacy(method: string, pathname: string): RouteMatch | null;
export declare function newPathOf(method: string, legacyPath: string): string | null;
export declare function legacyPathOf(method: string, newPath: string): string | null;

// ---------------------------------------------------------------------------------------------------------------- campos
/** Campo legado (PT) → campo do contrato (EN). Sentido: ${[...new Set(KEYS.map((k) => sentidos(k[2])))].join(", ")} (veja o comentário de cada linha). */
export interface FieldMap {
${linhas(KEYS.map(([pt, en, so]) => `${ptDe(pt)}: ${q(en)};${so ? ` // só ${sentidos(so)}` : ""}`))}
}
/** Campo do contrato que tem tradução (os de SAME_KEYS passam iguais e não entram aqui). */
export type ContractField = FieldMap[keyof FieldMap];
export type LegacyField = keyof FieldMap;
/** Campos iguais nos dois idiomas. */
export type SameField = ${uniao([...SAME_KEYS])};
export type KeyRow = readonly [pt: string, en: string] | readonly [pt: string, en: string, only: "req" | "res"];
export declare const KEYS: ReadonlyArray<KeyRow>;
export declare const SCOPED_KEYS: { ${Object.entries(SCOPED_KEYS).map(([pai, rows]) => `readonly ${ptDe(pai)}: ReadonlyArray<readonly [string, string]>`).join("; ")} };
export declare const SAME_KEYS: ReadonlySet<string>;
export declare const PT_ONLY_KEYS: ReadonlySet<string>;

// ---------------------------------------------------------------------------------------------------------------- valores
/** Valores que o servidor DEVOLVE em cada campo de vocabulário fechado, pelo nome do campo no contrato. */
export interface ContractValues {
  ${valoresEN.join("\n  ")}
}
/** Valores aceitos num PEDIDO (inclui os sinônimos só de entrada, como \`sunday\`). */
export interface ContractRequestValues {
${linhas(valoresPedido)}
}
/** Valores no vocabulário legado (PT), pelo nome PT do campo. */
export interface LegacyValues {
${linhas(valoresPT)}
}
/** Vocabulários próprios dentro de um pai (\`pai.campo\`). */
export interface ContractScopedValues {
${linhas(escopados)}
}
export type ValueRow = readonly [pt: string, en: string] | readonly [pt: string, en: string, only: "req" | "res"];
export declare const VALUES: { readonly [K in keyof LegacyValues]: ReadonlyArray<ValueRow> };
export declare const SCOPED_VALUES: { ${Object.entries(SCOPED_VALUES).map(([pai, campos]) => `readonly ${ptDe(pai)}: { ${Object.keys(campos).map((c) => `readonly ${ptDe(c)}: ReadonlyArray<ValueRow>`).join("; ")} }`).join("; ")} };

// ---------------------------------------------------------------------------------------------------------------- tradutores
export type Direction = "toEN" | "toPT";
export type MessageKind = "req" | "res";
export interface TranslateOptions { dir: Direction; kind: MessageKind; strict?: boolean; paths?: boolean }
export declare class PtKeyError extends Error { constructor(key: string, value?: string); key: string; value: string | undefined }
/** Traduz um valor JSON (objetos, listas e valores de vocabulário fechado). A forma muda de idioma, por isso a saída é \`unknown\` por padrão. */
export declare function translate<T = unknown>(value: unknown, o: TranslateOptions, container?: string | null, own?: string | null): T;
export declare function toEN<T = unknown>(value: unknown, kind?: MessageKind, o?: { strict?: boolean; paths?: boolean }): T;
export declare function toPT<T = unknown>(value: unknown, kind?: MessageKind, o?: { strict?: boolean; paths?: boolean }): T;
export declare function translateSlots<T>(slots: T, dir: Direction, o?: { strict?: boolean }): T;

// ---------------------------------------------------------------------------------------------------------------- erros
/** Código de erro legado (PT) → código do contrato (EN). */
export interface ErrorCodeMap {
${linhas(Object.entries(ERROR_CODES).map(([pt, en]) => `${ptDe(pt)}: ${q(en)};`))}
}
/** Código de erro do contrato (\`error.code\`). */
export type ErrorCode = ErrorCodeMap[keyof ErrorCodeMap];
/** Código de erro legado (\`erro.codigo\`). */
export type LegacyErrorCode = keyof ErrorCodeMap;
export declare const ERROR_CODES: Readonly<ErrorCodeMap>;
export declare const ERROR_CODES_REVERSE: { readonly [K in keyof ErrorCodeMap as ErrorCodeMap[K]]: K };
export declare function codeToEN<C extends string>(c: C): C extends LegacyErrorCode ? ErrorCodeMap[C] : C;
export declare function codeToPT(c: string): string;
/** Envelope de erro do contrato. Um código fora da tabela ainda pode chegar (servidor mais novo que o cliente). */
export interface ErrorEnvelope { error: { code: ErrorCode | (string & {}); message: string; details?: unknown } }
/** Envelope de erro legado (o que o front ainda confere). */
export interface LegacyErrorEnvelope { erro: { codigo: LegacyErrorCode | (string & {}); mensagem: string; detalhes?: unknown } }
export declare function errorEnvelopeToEN<T>(body: T): T extends LegacyErrorEnvelope ? ErrorEnvelope : T;
export declare function errorEnvelopeToPT<T>(body: T): T extends ErrorEnvelope ? LegacyErrorEnvelope : T;
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const novo = gerar();
  if (process.argv.includes("--check")) {
    let atual = ""; try { atual = readFileSync(ARQUIVO, "utf8"); } catch { /* ainda não existe */ }
    if (atual !== novo) { console.error("packages/sdk/src/contract.d.mts está desatualizado: rode npm run types:contract"); process.exit(1); }
  } else { writeFileSync(ARQUIVO, novo); console.log("packages/sdk/src/contract.d.mts atualizado"); }
}

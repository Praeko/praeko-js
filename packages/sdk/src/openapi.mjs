// Gera, a partir da tabela de rotas (contract.mjs) e da documentação por rota (contract-docs.mjs), um documento OpenAPI 3.1 e uma coleção do Postman (v2.1).
// Mesma fonte da página #/docs: nada é escrito à mão aqui. Sem dependências (roda no navegador, no Node e no build do Vite).
import { ROUTES } from "./contract.mjs";
import { ERROS_COMUNS, docDe, grupoDe, materializar, paramDe, resumoDe, tituloDe } from "./contract-docs.mjs";

const BASE = "https://praeko.app";
const aberto = (path) => path.replace(/:([A-Za-z_]+)/g, "{$1}");

/** Esquema JSON de um campo da documentação. */
function esquemaDe(c) {
  const e = {};
  const tipo = (t) => (t === "string|object" ? { oneOf: [{ type: "string" }, { type: "object" }] } : { type: t });
  if (c.type === "array") {
    e.type = "array";
    e.items = c.fields ? objeto(c.fields) : c.items === "string|object" ? tipo(c.items) : { type: c.items || "string", ...(c.enum ? { enum: c.enum } : {}) };
    if (c.maxItems !== undefined) e.maxItems = c.maxItems;
  } else if (c.type === "object" && c.fields) Object.assign(e, objeto(c.fields));
  else Object.assign(e, tipo(c.type), c.enum ? { enum: c.enum } : {});
  e.description = c.desc;
  if (c.default !== undefined && (typeof c.default !== "string" || !c.default.includes(" "))) e.default = c.default; // "private no YouTube, …" é texto explicativo, não valor
  for (const [de, para] of [["min", "minimum"], ["max", "maximum"], ["minLength", "minLength"], ["maxLength", "maxLength"], ["pattern", "pattern"]]) if (c[de] !== undefined) e[para] = c[de];
  return e;
}
function objeto(fields) {
  const o = { type: "object", properties: Object.fromEntries(fields.map((c) => [c.name, esquemaDe(c)])) };
  const obrig = fields.filter((c) => c.required).map((c) => c.name);
  if (obrig.length) o.required = obrig;
  return o;
}

/** Documento OpenAPI 3.1 de toda a API pública. `agora` fixa a data dos exemplos que dependem do relógio (padrão: agora). */
export function gerarOpenApi({ routes = ROUTES, agora = Date.now(), base = BASE } = {}) {
  const paths = {}, grupos = new Set();
  for (const r of routes) {
    const d = docDe(r), grupo = grupoDe(r), url = aberto(r.path), metodo = r.method.toLowerCase();
    grupos.add(grupo);
    const params = [...r.path.matchAll(/:([A-Za-z_]+)/g)].map((m) => { const p = paramDe(r, m[1]); return { name: m[1], in: "path", required: true, description: p.desc, schema: { type: "string", ...(p.enum ? { enum: p.enum } : {}) }, example: p.exemplo }; });
    for (const q of d.consulta) params.push({ name: q.name, in: "query", required: false, description: q.desc, schema: { type: q.type || "string", ...(q.enum ? { enum: q.enum } : {}) } });
    const publica = r.scope === "public";
    for (const h of d.cabecalhos) params.push({ name: h.name, in: "header", required: false, description: h.desc, schema: { type: "string", minLength: h.minLength, maxLength: h.maxLength }, example: h.example });
    if (!publica) params.push({ name: "X-Praeko-Contract", in: "header", required: false, description: "Envie `en` para receber o contrato em inglês nos caminhos que existem nos dois contratos (por exemplo `/v1/posts`). Sempre envie.", schema: { type: "string", enum: ["en"], default: "en" } });
    const op = { operationId: r.method === "HEAD" ? `${r.key}.head` : r.key, tags: [grupo], summary: tituloDe(r) || `${r.method} ${r.path}`, description: resumoDe(r), "x-praeko-scope": r.scope, parameters: params, security: publica ? [] : [{ bearer: [] }] };
    if (d.corpo) {
      const ex = materializar(d.corpo.example, agora);
      op.requestBody = { required: !/opcional/i.test(d.corpo.nota || ""), description: d.corpo.nota, content: { "application/json": { schema: { ...objeto(d.corpo.fields), ...(d.corpo.fechado ? { additionalProperties: false } : {}) }, example: ex } } };
    } else if (r.body === "bytes") op.requestBody = { required: true, description: "Os bytes crus do arquivo.", content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } };
    const ok = d.resposta ? String(d.resposta.status) : "200";
    op.responses = { [ok]: d.resposta ? { description: "Sucesso.", content: { "application/json": { schema: { type: "object" }, example: materializar(d.resposta.exemplo, agora) } } } : { description: "Sucesso." } };
    const erros = [...d.erros, ...(publica ? [] : ERROS_COMUNS)], porStatus = new Map();
    for (const [st, code, desc] of erros) porStatus.set(String(st), [...(porStatus.get(String(st)) || []), `\`${code}\`: ${desc}`]);
    for (const [st, linhas] of porStatus) op.responses[st] = { description: linhas.join("\n"), content: { "application/json": { schema: { $ref: "#/components/schemas/Erro" } } } };
    (paths[url] ||= {})[metodo] = op;
  }
  return JSON.parse(JSON.stringify({ // JSON puro: some o que ficou `undefined`
    openapi: "3.1.0",
    info: { title: "API do Praeko", version: "1", description: "API pública do Praeko (publicador de vídeos curtos para YouTube, Instagram e TikTok). Gerada da tabela de rotas do contrato; identificadores em inglês, textos em português. Mande sempre `Authorization: Bearer praeko_…` e `X-Praeko-Contract: en`." },
    servers: [{ url: base }],
    tags: [...grupos].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "Chave de API do painel (Chaves). O escopo mínimo de cada rota está em `x-praeko-scope`." } },
      schemas: { Erro: { type: "object", properties: { error: { type: "object", required: ["code", "message"], properties: { code: { type: "string", description: "Código estável em snake_case." }, message: { type: "string" }, details: { type: "object" } } } } } },
    },
  }));
}

/** Coleção do Postman (v2.1): variáveis `baseUrl` e `praekoKey`, uma pasta por grupo, corpo de exemplo preenchido. */
export function gerarPostman({ routes = ROUTES, agora = Date.now(), base = BASE } = {}) {
  const pastas = new Map();
  for (const r of routes) {
    if (r.scope === "public") continue;
    const d = docDe(r), caminho = r.path.replace(/^\//, "").split("/").map((s) => (s.startsWith(":") ? `:${s.slice(1)}` : s));
    const header = [{ key: "X-Praeko-Contract", value: "en" }, ...d.cabecalhos.map((h) => ({ key: h.name, value: h.example, description: h.desc, disabled: true })), ...(d.corpo ? [{ key: "Content-Type", value: "application/json" }] : [])];
    const item = { name: `${tituloDe(r)} (${r.method} ${r.path})`, request: { method: r.method, header, description: resumoDe(r), url: { raw: `{{baseUrl}}/${caminho.join("/")}`, host: ["{{baseUrl}}"], path: caminho, variable: [...r.path.matchAll(/:([A-Za-z_]+)/g)].map((m) => ({ key: m[1], value: paramDe(r, m[1]).exemplo })), query: d.consulta.map((q) => ({ key: q.name, value: "", description: q.desc, disabled: true })) } } };
    if (d.corpo) item.request.body = { mode: "raw", raw: JSON.stringify(materializar(d.corpo.example, agora), null, 2), options: { raw: { language: "json" } } };
    const g = grupoDe(r); pastas.set(g, [...(pastas.get(g) || []), item]);
  }
  return {
    info: { name: "API do Praeko", description: "Gerada do contrato. Preencha a variável `praekoKey` com uma chave de API.", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
    auth: { type: "bearer", bearer: [{ key: "token", value: "{{praekoKey}}", type: "string" }] },
    variable: [{ key: "baseUrl", value: base }, { key: "praekoKey", value: "praeko_COLE_SUA_CHAVE_AQUI" }],
    item: [...pastas].map(([name, item]) => ({ name, item })),
  };
}

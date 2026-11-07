// Camada em inglês das docs por rota (src/contract-docs.en.mjs): completa, sem órfãos, mesma forma do português, exemplos válidos e nenhum texto em português.
import test from "node:test";
import assert from "node:assert/strict";
import { ROUTES } from "../src/contract.mjs";
import { TITULOS, RESUMOS, GRUPOS, ERROS_COMUNS, docDe, achatar, validar, materializar, paramDe, statusDe } from "../src/contract-docs.mjs";
import {
  GRUPOS_EN, TITULOS_EN, RESUMOS_EN, CAMPOS_EN, CONSULTA_EN, ERROS_EN, EXEMPLOS_EN, ERROS_COMUNS_EN, DEFAULTS_EN,
  grupoEn, tituloEn, resumoEn, paramEn, docEn, statusDeEn, restricoesEn, tipoTextoEn, faltandoEn,
} from "../src/contract-docs.en.mjs";

test("faltandoEn: nenhum texto sem inglês e nenhuma entrada órfã", () => {
  assert.deepEqual(faltandoEn(ROUTES), []);
  assert.deepEqual(Object.keys(TITULOS_EN).sort(), Object.keys(TITULOS).sort());
  assert.deepEqual(Object.keys(RESUMOS_EN).sort(), Object.keys(RESUMOS).sort());
  assert.deepEqual(Object.keys(GRUPOS_EN).sort(), Object.keys(GRUPOS).sort());
});

test("faltandoEn acusa o que falta e o que sobra (a mudança no português quebra o teste)", () => {
  const campo = CAMPOS_EN["posts.create"]["items[].network"], erro = ERROS_EN["posts.create"].time_in_past, q = CONSULTA_EN["posts.list"].state, ex = EXEMPLOS_EN["via API da Meta"];
  try {
    delete CAMPOS_EN["posts.create"]["items[].network"]; delete ERROS_EN["posts.create"].time_in_past; delete CONSULTA_EN["posts.list"].state; delete EXEMPLOS_EN["via API da Meta"];
    CAMPOS_EN["posts.create"]["items[].sumiu"] = "Gone."; ERROS_EN["posts.create"].codigo_que_nao_existe = "Gone.";
    const f = faltandoEn(ROUTES);
    for (const esperado of ["posts.create: body field items[].network", "posts.create: error time_in_past", "posts.list: query state", "orphan: CAMPOS_EN posts.create items[].sumiu", "orphan: ERROS_EN posts.create codigo_que_nao_existe"]) assert.ok(f.includes(esperado), `faltou acusar: ${esperado}\n${f.join("\n")}`);
    assert.ok(f.some((x) => x.includes('"via API da Meta"')), "exemplo com texto em português");
  } finally {
    CAMPOS_EN["posts.create"]["items[].network"] = campo; ERROS_EN["posts.create"].time_in_past = erro; CONSULTA_EN["posts.list"].state = q; EXEMPLOS_EN["via API da Meta"] = ex;
    delete CAMPOS_EN["posts.create"]["items[].sumiu"]; delete ERROS_EN["posts.create"].codigo_que_nao_existe;
  }
  assert.deepEqual(faltandoEn(ROUTES), []);
});

// Tira os textos humanos: o que sobra (nomes, tipos, limites, ids, chaves, códigos) precisa ser idêntico ao português.
const TEXTOS = new Set(["desc", "nota"]);
function esqueleto(v, chave) {
  if (Array.isArray(v)) return v.map((x) => esqueleto(x));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) => !TEXTOS.has(k)).map(([k, x]) => [k, k === "example" || k === "exemplo" ? formaDe(x) : esqueleto(x, k)]));
  return typeof v === "string" && chave === undefined ? "<texto>" : v;
}
/** Forma de um exemplo: as mesmas chaves e os mesmos valores que não são texto. */
const formaDe = (v) => (Array.isArray(v) ? v.map(formaDe) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, formaDe(x)])) : typeof v === "string" ? "<texto>" : v);

/** Cópia com os padrões que são frase (não valor, veja DEFAULTS_EN) trocados por um marcador: esses são traduzidos de propósito. */
function marcaPadroes(key, d) {
  const c = structuredClone(d);
  const anda = (fields, prefixo = "") => fields.forEach((f) => { const caminho = prefixo + f.name; if (DEFAULTS_EN[key]?.[caminho] !== undefined) f.default = "<frase>"; if (f.fields) anda(f.fields, caminho + (f.type === "array" ? "[]." : ".")); });
  if (c.corpo) anda(c.corpo.fields);
  return c;
}

test("docEn tem a forma de docDe: só os textos mudam", () => {
  for (const r of ROUTES) {
    const pt = docDe(r), en = docEn(r);
    const a = esqueleto(marcaPadroes(r.key, pt)), b = esqueleto(marcaPadroes(r.key, en));
    assert.deepEqual(b, a, r.key);
    assert.equal(en.erros.length, pt.erros.length);
    en.erros.forEach(([s, c, t], i) => { assert.equal(s, pt.erros[i][0]); assert.equal(c, pt.erros[i][1]); assert.notEqual(t, pt.erros[i][2], `${r.key} ${c}: sem tradução`); });
    if (pt.resposta?.nota) assert.notEqual(en.resposta.nota, pt.resposta.nota, `${r.key}: nota da resposta`);
    if (pt.corpo?.nota) assert.notEqual(en.corpo.nota, pt.corpo.nota, `${r.key}: nota do corpo`);
    if (pt.corpo) achatar(en.corpo.fields).forEach((c, i) => assert.notEqual(c.desc, achatar(pt.corpo.fields)[i].desc, `${r.key} ${c.caminho}`));
    en.consulta.forEach((c, i) => assert.notEqual(c.desc, pt.consulta[i].desc, `${r.key} ?${c.name}`));
    en.cabecalhos.forEach((c, i) => assert.notEqual(c.desc, pt.cabecalhos[i].desc));
  }
  assert.equal(docEn(ROUTES.find((r) => r.key === "posts.create")).corpo.fields.find((c) => c.name === "items").fields.find((c) => c.name === "mode").default, "private on YouTube, draft on TikTok, now on Instagram");
});

test("docEn não mexe no português (cópias profundas)", () => {
  const antes = JSON.stringify(ROUTES.map(docDe));
  for (const r of ROUTES) {
    const en = docEn(r);
    if (en.corpo) { en.corpo.fields[0].desc = "x"; en.corpo.fields[0].enum?.push("x"); if (en.corpo.example) en.corpo.example.zzz = 1; }
    if (en.resposta?.exemplo) en.resposta.exemplo.zzz = 1;
    en.consulta.forEach((c) => (c.desc = "x")); en.erros.forEach((e) => (e[2] = "x"));
  }
  assert.equal(JSON.stringify(ROUTES.map(docDe)), antes);
});

test("os exemplos de corpo em inglês continuam válidos e mantêm ids e {{em3dias}}", () => {
  const T0 = Date.parse("2026-11-07T12:00:00Z");
  let n = 0;
  for (const r of ROUTES) {
    const { corpo } = docEn(r);
    if (!corpo?.example) continue;
    n++;
    assert.deepEqual(validar(corpo.fields, materializar(corpo.example, T0), { fechado: !!corpo.fechado }), [], r.key);
    assert.equal(JSON.stringify(corpo.example).includes("{{em3dias}}"), JSON.stringify(docDe(r).corpo.example).includes("{{em3dias}}"), r.key);
  }
  assert.ok(n >= 20, `só ${n} exemplos`);
  const post = docEn(ROUTES.find((r) => r.key === "posts.create")).corpo.example;
  assert.equal(post.title, "The test that only failed on Mondays"); assert.equal(post.media.video, docDe(ROUTES.find((r) => r.key === "posts.create")).corpo.example.media.video);
  assert.equal(docEn(ROUTES.find((r) => r.key === "webhooks.create")).corpo.example.url, "https://example.com/hooks/praeko");
  const ig = JSON.stringify(docEn(ROUTES.find((r) => r.key === "instagram.media")).resposta.exemplo);
  assert.ok(ig.includes("https://cdn.example.com/reel.jpg") && !ig.includes("exemplo"));
});

// ---- nenhum texto em português
// "a", "as" e "do" ficam de fora da lista: são palavras do inglês. O que está entre crases (identificadores, JSON) não conta.
const PT = /(^|[^\p{L}])(o|os|de|que|não|para|com|uma|em|é|da|dos|das|ao|ou|pelo|pela|já|só|até|também|então|sem|seu|sua)(?=$|[^\p{L}])/u;
const ACENTOS_PT = /[ãõçâêôà]/u;
const PERMITIDOS = []; // frases em inglês que o detector confunde (nenhuma hoje)
const foraDeCrases = (s) => s.replace(/`[^`]*`/g, "``").replace(/https?:\/\/\S+/g, "<url>");
function textosEn() {
  const t = [];
  const add = (onde, s) => t.push([onde, s]);
  Object.entries(GRUPOS_EN).forEach(([k, s]) => add(`group ${k}`, s));
  for (const r of ROUTES) {
    const k = `${r.key} ${r.method}`, d = docEn(r);
    add(`${k} title`, tituloEn(r)); add(`${k} summary`, resumoEn(r)); add(`${k} group`, grupoEn(r));
    for (const m of r.path.matchAll(/:([A-Za-z_]+)/g)) add(`${k} :${m[1]}`, paramEn(r, m[1]).desc);
    if (d.corpo) { for (const c of achatar(d.corpo.fields)) { add(`${k} ${c.caminho}`, c.desc); restricoesEn(c).forEach((x) => add(`${k} ${c.caminho} limits`, x)); add(`${k} ${c.caminho} type`, tipoTextoEn(c)); } if (d.corpo.nota) add(`${k} body note`, d.corpo.nota); }
    d.consulta.forEach((c) => add(`${k} ?${c.name}`, c.desc)); d.cabecalhos.forEach((c) => add(`${k} ${c.name}`, c.desc));
    if (d.resposta?.nota) add(`${k} response note`, d.resposta.nota);
    statusDeEn(r).forEach(([s, x]) => add(`${k} ${s}`, x));
    d.erros.forEach(([, c, x]) => add(`${k} ${c}`, x));
  }
  ERROS_COMUNS_EN.forEach(([, c, x]) => add(`common ${c}`, x));
  return t;
}

test("nenhum texto em inglês tem palavra ou acento do português (fora das crases)", () => {
  const ruins = textosEn().filter(([, s]) => !PERMITIDOS.includes(s) && (PT.test(foraDeCrases(s)) || ACENTOS_PT.test(foraDeCrases(s)))).map(([o, s]) => `${o}: ${s}`);
  assert.deepEqual(ruins, []);
  assert.ok(PT.test("O post não existe.") && PT.test("Id da mídia de vídeo.") && !PT.test("Same as `items[].mode`."), "o detector pega português");
});

// Os trechos entre crases do português (identificadores, rotas, valores) precisam continuar no inglês; só os que eram texto em português mudam.
const CRASES_TROCADAS = { "AAAA-MM-DD": "YYYY-MM-DD", "instagram=<usuário>": "instagram=<username>" };
const CRASES_SUMIDAS = { "usage.log response note": ["before"] }; // o servidor usa `cursor`, não `before` (corrigido só no inglês)
const crases = (s) => [...s.matchAll(/`([^`]*)`/g)].map((m) => m[1]);
test("os trechos entre crases do português continuam no inglês", () => {
  const pares = [];
  for (const r of ROUTES) {
    const pt = docDe(r), en = docEn(r), k = r.key;
    pares.push([`${k} summary`, RESUMOS[`${k}#${r.method}`] || RESUMOS[k] || "", resumoEn(r)]);
    if (pt.corpo) { const a = achatar(pt.corpo.fields), b = achatar(en.corpo.fields); a.forEach((c, i) => pares.push([`${k} ${c.caminho}`, c.desc, b[i].desc])); if (pt.corpo.nota) pares.push([`${k} body note`, pt.corpo.nota, en.corpo.nota]); }
    pt.consulta.forEach((c, i) => pares.push([`${k} ?${c.name}`, c.desc, en.consulta[i].desc]));
    pt.cabecalhos.forEach((c, i) => pares.push([`${k} ${c.name}`, c.desc, en.cabecalhos[i].desc]));
    if (pt.resposta?.nota) pares.push([`${k} response note`, pt.resposta.nota, en.resposta.nota]);
    statusDe(r).forEach(([, t], i) => pares.push([`${k} success`, t, statusDeEn(r)[i][1]]));
    pt.erros.forEach(([, c, t], i) => pares.push([`${k} ${c}`, t, en.erros[i][2]]));
    for (const m of r.path.matchAll(/:([A-Za-z_]+)/g)) pares.push([`${k} :${m[1]}`, paramDe(r, m[1]).desc, paramEn(r, m[1]).desc]);
  }
  ERROS_COMUNS.forEach(([, c, t], i) => pares.push([`common ${c}`, t, ERROS_COMUNS_EN[i][2]]));
  const ruins = [];
  for (const [onde, pt, en] of pares) {
    const tem = crases(en);
    for (const c of crases(pt)) {
      if ((CRASES_SUMIDAS[onde] || []).includes(c)) { if (tem.includes(c)) ruins.push(`${onde}: \`${c}\` devia ter saído`); continue; }
      if (!tem.includes(CRASES_TROCADAS[c] ?? c)) ruins.push(`${onde}: faltou \`${CRASES_TROCADAS[c] ?? c}\``);
    }
  }
  assert.deepEqual(ruins, []);
});

test("ajudantes: resumoEn cai no summary, paramEn, statusDeEn, restricoesEn e tipoTextoEn", () => {
  const falsa = { key: "nova.rota", method: "GET", path: "/v1/nova", summary: "Brand new route" };
  assert.equal(resumoEn(falsa), "Brand new route"); assert.equal(tituloEn(falsa), ""); assert.equal(grupoEn(falsa), "nova");
  const head = ROUTES.find((r) => r.key === "media.public" && r.method === "HEAD");
  assert.equal(resumoEn(head), RESUMOS_EN["media.public#HEAD"]);
  assert.equal(docEn(head).resposta.nota, "The same headers as GET, without a body.");
  const video = ROUTES.find((r) => r.key === "youtube.video"), reply = ROUTES.find((r) => r.key === "youtube.reply");
  assert.deepEqual(paramEn(video, "id"), { ...paramDe(video, "id"), desc: "YouTube video id." });
  assert.equal(paramEn(reply, "id").desc, "YouTube comment thread id."); assert.equal(paramEn(reply, "id").exemplo, paramDe(reply, "id").exemplo);
  const net = paramEn(ROUTES.find((r) => r.key === "channels.slots.get"), "network");
  assert.deepEqual([net.enum, net.fixo, net.exemplo], [["youtube", "instagram", "tiktok"], true, "youtube"]);
  assert.deepEqual(statusDeEn(ROUTES.find((r) => r.key === "posts.create")), [[201, "Success."]]);
  assert.deepEqual(statusDeEn(ROUTES.find((r) => r.key === "media.content.get")).map(([s]) => s), statusDe(ROUTES.find((r) => r.key === "media.content.get")).map(([s]) => s));
  assert.deepEqual(restricoesEn({ enum: ["a", "b"], default: "a", minLength: 1, maxLength: 200 }), ["values: a, b", "default: a", "1 to 200 characters"]);
  assert.deepEqual(restricoesEn({ maxLength: 64, min: 1, max: 365, maxItems: 20, maxItemLength: 40 }), ["up to 64 characters", "1 to 365", "up to 20 items", "each up to 40 characters"]);
  assert.deepEqual(restricoesEn({ minLength: 1, min: 0, default: ["x", "y"] }), ["default: x, y", "at least 1 character", "minimum 0"]);
  assert.deepEqual(restricoesEn({ minLength: 20, max: 9 }), ["at least 20 characters", "maximum 9"]);
  assert.deepEqual([{ type: "string" }, { type: "integer" }, { type: "boolean" }, { type: "object" }, { type: "array", items: "string" }, { type: "array", items: "object" }, { type: "array" }, { type: "array", items: "string|object" }].map(tipoTextoEn), ["string", "integer", "boolean", "object", "string[]", "object[]", "string[]", "(string | object)[]"]);
});

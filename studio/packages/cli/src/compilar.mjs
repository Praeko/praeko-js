// `praeko studio compilar`: episodio.yaml → episodio.spec.json (o que o EpisodioDecl lê), com validação e detecção de sobreposição.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

export const TIPOS = ["texto", "big", "caixa", "linha", "balao", "codigo", "janela", "celular", "barra", "barras", "pilha", "fila", "cartao"];
const CORES = ["destaque", "texto", "suave", "ok", "erro", "info", "extra", "caixa"];
const CHAVES = new Set(["tipo", "quando", "deslocar", "em", "pos", "cor", "tamanho", "texto", "mono", "fonte", "alinhar", "altura", "peso", "pop", "semQuebra", "semFade", "apagada", "tracejada", "autor", "titulo", "linhas", "partes", "src", "duracaoClipe", "de", "reg", "tag", "gradiente", "gradienteAngulo", "raio", "fundo", "borda", "preenche", "brilhoAoFim", "max", "larguraMax", "larguraRotulo", "passo", "gap", "itens", "centrar", "espalhar"]);
const POS = { esquerda: "left", direita: "right", topo: "top", base: "bottom", largura: "w", altura: "h", left: "left", right: "right", top: "top", bottom: "bottom", w: "w", h: "h" };
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

// Área útil do PainelD do kit: 1080 − 2×70 (margens) − 2×48 (padding) = 844 de largura; 1000 − 2×40 = 920 de altura.
export const AREA = { w: 844, h: 920, gap: 22 };

/** Instante (s absoluto) em que a frase começa; -1 se não existe. */
export function achar(palavras, frase, nth = 0, from = 0) {
  const f = String(frase).split(/\s+/).map(norm).filter(Boolean), W = palavras.map((p) => norm(p.t));
  let c = 0;
  for (let k = 0; k <= W.length - f.length; k++) if (palavras[k].a >= from && f.every((w, j) => W[k + j] === w)) { if (c === nth) return palavras[k].a; c++; }
  return -1;
}
const tamanho = (it, p = 40) => it.tamanho ?? p;
/** Estimativa grosseira (px) de largura/altura de um item no fluxo do painel. Serve para avisar, não para provar. */
export function medir(it, larg = AREA.w) {
  const linhas = (t) => String(t ?? "").split("\n");
  switch (it.tipo) {
    case "texto": { const s = tamanho(it), L = linhas(it.texto); const w = Math.max(...L.map((l) => l.length)) * s * (it.fonte === "mono" ? 0.6 : 0.52); return { w, h: L.length * s * (it.altura ?? 1.3) * (it.semQuebra ? 1 : Math.max(1, Math.ceil(w / larg))) / (w > larg && !it.semQuebra ? Math.ceil(w / larg) : 1), quebra: w > larg && !it.semQuebra && L.length === 1 }; }
    case "big": { const s = tamanho(it, 120); return { w: String(it.texto).length * s * 0.6, h: s * 1.15 }; }
    case "caixa": { const s = tamanho(it); const w = String(it.texto).length * s * (it.mono ? 0.6 : 0.52) + 64; return { w, h: s * 1.3 + 36, quebra: w > larg }; }
    case "linha": { const s = tamanho(it); const n = (it.partes ?? []).reduce((a, p) => a + String(p.texto).length, 0); return { w: n * s * 0.52, h: s * 1.4, quebra: n * s * 0.52 > larg }; }
    case "balao": return { w: larg, h: 100 + Math.ceil(String(it.texto).length * 34 * 0.52 / (larg - 100)) * 44 };
    case "codigo": return { w: larg, h: 110 + (it.linhas?.length ?? 0) * 56 };
    case "cartao": return { w: larg, h: (it.linhas?.length ?? 0) * (it.tamanho ?? 40) * 1.45 + 40 };
    case "barra": return { w: larg, h: it.altura ?? 40 };
    case "barras": return { w: larg, h: (it.linhas?.length ?? 0) * (34 + (it.gap ?? 16)) };
    case "pilha": { const f = (it.itens ?? []).map((x) => medir(x, larg)); return { w: Math.max(0, ...f.map((x) => x.w)), h: f.reduce((a, x) => a + x.h, 0) + Math.max(0, f.length - 1) * (it.gap ?? 20) }; }
    case "fila": { const f = (it.itens ?? []).map((x) => medir(x, larg)); const w = f.reduce((a, x) => a + x.w, 0) + Math.max(0, f.length - 1) * (it.gap ?? 20); return { w, h: Math.max(0, ...f.map((x) => x.h)), estoura: w > larg }; }
    default: return { w: 0, h: 0 };
  }
}
const retangulo = (it) => { const p = it.pos; if (!p || p.left === undefined || p.top === undefined || p.w === undefined) return null; return { x: p.left, y: p.top, w: p.w, h: p.h ?? medir(it).h }; };
const cruza = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function normalizaItem(it, onde, erros) {
  if (!it || typeof it !== "object") { erros.push(`${onde}: item inválido`); return it; }
  if (!TIPOS.includes(it.tipo)) erros.push(`${onde}: tipo "${it.tipo}" desconhecido (use ${TIPOS.join(", ")})`);
  const o = { ...it };
  for (const k of Object.keys(it)) if (!CHAVES.has(k)) erros.push(`${onde}: chave "${k}" desconhecida${/\s/.test(k) || it[k] === null ? ". Dentro de { … } uma vírgula no texto separa os campos: ponha o texto entre aspas" : ""}`);
  if (it.pos) { o.pos = {}; for (const [k, v] of Object.entries(it.pos)) { if (!POS[k]) erros.push(`${onde}: pos.${k} desconhecido`); else o.pos[POS[k]] = v; } }
  for (const k of ["cor", "gradiente"]) for (const c0 of [].concat(it[k] ?? [])) for (const c of [typeof c0 === "string" ? c0.split(" ")[0] : c0]) if (typeof c === "string" && !c.startsWith("#") && !CORES.includes(c)) erros.push(`${onde}: cor "${c}" não existe no tema (use ${CORES.join(", ")} ou #hex)`);
  if (it.itens) o.itens = it.itens.map((f, i) => normalizaItem(f, `${onde} › ${f?.tipo ?? i}`, erros));
  return o;
}
function todos(it, f) { f(it); (it.itens ?? []).forEach((x) => todos(x, f)); }

/**
 * Tempo em segundos a partir de: número · "frase" · { quando, nth, depois, mais } · { voz: N } (N s depois do fim da voz, N pode ser negativo).
 * Devolve o próprio valor se não for um desses (ex.: { bloco: N }, resolvido à parte). Registra erro se a frase não existe.
 */
export function resolverTempo(x, palavras, onde, erros) {
  if (typeof x === "number" || x === undefined || x === null) return x;
  if (typeof x === "object" && x.bloco !== undefined) return x;
  const o = typeof x === "string" ? { quando: x } : x;
  if (typeof o.voz === "number") {
    if (!palavras.length) { erros.push(`${onde}: \`{ voz: ${o.voz} }\` precisa de palavras.json (rode \`praeko studio voz\`)`); return 0; }
    return +(palavras[palavras.length - 1].b + o.voz).toFixed(2);
  }
  if (typeof o.quando !== "string") { erros.push(`${onde}: tempo inválido (use número, "frase", { quando, nth, depois, mais } ou { voz: N })`); return 0; }
  if (!palavras.length) { erros.push(`${onde}: "${o.quando}" precisa de palavras.json (rode \`praeko studio voz\`)`); return 0; }
  const t = achar(palavras, o.quando, o.nth ?? 0, o.depois ?? 0);
  if (t < 0) { erros.push(`${onde}: frase "${o.quando}" não aparece na voz (palavras.json)`); return 0; }
  return +(t + (o.mais ?? 0)).toFixed(2);
}

/** Compila a pasta de um episódio. Devolve { spec, erros, avisos }; só grava o JSON quando não há erros. */
export function compilarEpisodio(pasta, { gravar = true } = {}) {
  const erros = [], avisos = [], arq = join(pasta, "episodio.yaml");
  if (!existsSync(arq)) return { spec: null, erros: [`sem episodio.yaml em ${pasta}`], avisos };
  let y;
  try { y = YAML.parse(readFileSync(arq, "utf8")); } catch (e) { return { spec: null, erros: [`episodio.yaml inválido: ${e.message}`], avisos }; }
  const info = existsSync(join(pasta, "episodio.json")) ? JSON.parse(readFileSync(join(pasta, "episodio.json"), "utf8")) : {};
  const palavras = existsSync(join(pasta, "palavras.json")) ? JSON.parse(readFileSync(join(pasta, "palavras.json"), "utf8")) : [];
  if (!palavras.length) avisos.push("palavras.json vazio ou ausente: âncoras `quando` não foram conferidas (rode `praeko studio voz`)");
  // tempos por frase: duracao, inicio/fim das cenas, fechamento.inicio e golpes viram segundos antes de validar
  if (y.duracao !== undefined) y.duracao = resolverTempo(y.duracao, palavras, "duracao", erros);
  if (y.fechamento && typeof y.fechamento === "object") if (y.fechamento.inicio !== undefined) y.fechamento.inicio = resolverTempo(y.fechamento.inicio, palavras, "fechamento.inicio", erros);
  if (y.formato === "longo" && y.fecho && typeof y.fecho === "object" && y.fecho.inicio !== undefined) y.fecho.inicio = resolverTempo(y.fecho.inicio, palavras, "fecho.inicio", erros);
  for (const [i, c] of (Array.isArray(y.cenas) ? y.cenas : []).entries()) { if (!c || typeof c !== "object") continue; if (c.inicio !== undefined) c.inicio = resolverTempo(c.inicio, palavras, `cena ${i + 1} › inicio`, erros); if (c.fim !== undefined) c.fim = resolverTempo(c.fim, palavras, `cena ${i + 1} › fim`, erros); }
  for (const [i, g] of (y.golpes ?? []).entries()) if (g && g.em !== undefined) g.em = resolverTempo(g.em, palavras, `golpe ${i + 1}`, erros);
  if (y.formato === "longo") return compilarLongo({ y, info, palavras, pasta, erros, avisos, gravar });
  for (const k of ["duracao", "voz", "fechamento", "cenas"]) if (y[k] === undefined) erros.push(`falta "${k}"`);
  if (erros.length) return { spec: null, erros, avisos };
  const id = y.id ?? info.id;
  if (!id) erros.push('falta "id" (no yaml ou em episodio.json)');
  if (y.motor !== undefined && !["remotion", "hyperframes"].includes(y.motor)) erros.push(`motor "${y.motor}" não existe (use remotion ou hyperframes)`);
  const cenasY = y.cenas;
  if (!Array.isArray(cenasY) || !cenasY.length) erros.push('"cenas" precisa ser uma lista');
  const fecha = y.fechamento?.inicio;
  if (typeof fecha !== "number") erros.push('fechamento.inicio (s) é obrigatório');
  if (typeof y.duracao === "number" && typeof fecha === "number" && fecha >= y.duracao) erros.push(`fechamento.inicio (${fecha}) deve vir antes da duração (${y.duracao})`);
  if (erros.length) return { spec: null, erros, avisos };

  if (palavras.length) {
    const fimVoz = palavras[palavras.length - 1].b;
    if (fimVoz + 1 > y.duracao) avisos.push(`duracao (${y.duracao} s) deixa menos de 1 s depois do fim da voz (${fimVoz.toFixed(2)} s)`);
  }
  const cenas = cenasY.map((c, i) => {
    const nome = `cena ${i + 1}${c.titulo ? ` (${c.titulo})` : ""}`;
    for (const k of Object.keys(c)) if (!["inicio", "fim", "titulo", "rotulo", "sons", "layout", "itens", "componente"].includes(k)) erros.push(`${nome}: chave "${k}" desconhecida${/\s/.test(k) || c[k] === null ? ". Dentro de { … } uma vírgula no texto separa os campos: ponha o texto entre aspas" : ""}`);
    if (typeof c.inicio !== "number") erros.push(`${nome}: falta "inicio" (s)`);
    if (i > 0 && c.inicio <= cenasY[i - 1].inicio) erros.push(`${nome}: inicio ${c.inicio} não vem depois da cena anterior`);
    const fim = c.fim ?? (i + 1 < cenasY.length ? cenasY[i + 1].inicio : fecha);
    if (fim > fecha + 1e-9 && i === cenasY.length - 1) avisos.push(`${nome}: termina (${fim}) depois do fechamento (${fecha})`);
    if (c.componente && c.itens) erros.push(`${nome}: use "componente" ou "itens", não os dois`);
    if (!c.componente && !c.itens?.length) erros.push(`${nome}: sem itens`);
    const itens = c.itens?.map((it, k) => normalizaItem(it, `${nome} › item ${k + 1}`, erros));
    // âncoras
    for (const it of itens ?? []) todos(it, (x) => {
      if (x.quando === undefined) return;
      const [f, n] = Array.isArray(x.quando) ? x.quando : [x.quando, 0];
      if (!palavras.length) return;
      const t = achar(palavras, f, n);
      if (t < 0) erros.push(`${nome}: frase "${f}"${n ? ` (#${n})` : ""} não aparece na voz (palavras.json). O alinhador às vezes escreve número em dígitos`);
      else if (t < c.inicio - 0.05 || t > fim + 0.05) avisos.push(`${nome}: "${f}" fala em ${t.toFixed(2)} s, fora da cena (${c.inicio}–${fim.toFixed ? fim.toFixed(2) : fim}): o item aparece cedo ou nunca`);
    });
    // sobreposição / estouro (estimativa)
    if (itens && (c.layout ?? "painel") === "painel") {
      const med = itens.map((it) => ({ it, m: medir(it) })).filter((x) => !x.it.pos);
      const alt = med.reduce((a, x) => a + x.m.h, 0) + Math.max(0, med.length - 1) * AREA.gap;
      if (alt > AREA.h) avisos.push(`${nome}: itens somam ~${Math.round(alt)} px de altura e o painel tem ${AREA.h} (estimativa): vai estourar ou se sobrepor`);
      for (const { it, m } of med) {
        if (m.estoura) avisos.push(`${nome}: a fila "${it.tipo}" tem ~${Math.round(m.w)} px de largura e o painel ${AREA.w}: estoura as bordas`);
        else if (m.quebra) avisos.push(`${nome}: "${String(it.texto ?? "").slice(0, 28)}…" tem ~${Math.round(m.w)} px de largura (painel ${AREA.w}): deve quebrar em 2 linhas; confira ou quebre com \\n`);
      }
    }
    const abs = (itens ?? []).map((it) => ({ it, r: retangulo(it) })).filter((x) => x.r);
    for (let a = 0; a < abs.length; a++) for (let b = a + 1; b < abs.length; b++) if (cruza(abs[a].r, abs[b].r)) avisos.push(`${nome}: "${abs[a].it.tipo}" e "${abs[b].it.tipo}" se sobrepõem na tela (posições absolutas)`);
    return { inicio: c.inicio, ...(c.fim !== undefined ? { fim: c.fim } : {}), rotulo: c.rotulo, sons: c.sons, layout: c.layout, titulo: c.titulo, itens, componente: c.componente };
  });
  const spec = {
    id, durS: y.duracao, legendaPx: y.legenda, voz: y.voz, fundoLinhas: y.fundo,
    ...(y.motor ? { motor: y.motor } : {}),
    golpes: y.golpes?.map((g) => ({ at: g.em, tipo: g.tipo })),
    fechamento: { a: fecha, cta: y.fechamento.cta },
    cenas,
    capa: y.capa ? { id: y.capa.id ?? info.capa, componente: y.capa.componente, titulo: y.capa.titulo, cor: y.capa.cor, glow: y.capa.glow, tam: y.capa.tam, itens: y.capa.itens?.map((it, k) => normalizaItem(it, `capa › item ${k + 1}`, erros)) } : undefined,
  };
  if (!erros.length && gravar) writeFileSync(join(pasta, "episodio.spec.json"), JSON.stringify(spec, (k, v) => (v === undefined ? undefined : v), 2) + "\n");
  return { spec: erros.length ? null : spec, erros, avisos };
}

// ---------- longo (16:9) ----------
export const TIPOS_LONGO = ["codigo", "cartao", "texto", "chip", "txt", "video", "celular", "barra", "contador", "fluxo"];
const CHAVES_LONGO = new Set(["tipo", "quando", "pos", "cor", "tamanho", "texto", "partes", "titulo", "linhas", "itens", "alinhar", "mono", "espacar", "src", "de", "duracaoClipe", "reg", "tag", "dur", "valor", "rotulo", "duracao", "ate", "prefixo", "sufixo", "casas", "nos", "altura"]);
/** Estimativa (px) do retângulo de um item de longo de posição absoluta. */
function retanguloLongo(it) {
  const p = it.pos; if (!p || p.left === undefined || p.top === undefined) return null;
  const txt = (it.partes ? it.partes.map((x) => x.texto).join("") : String(it.texto ?? ""));
  if (it.tipo === "video") return { x: p.left, y: p.top, w: p.w ?? 900, h: (p.w ?? 900) * ((it.reg ?? [0, 0, 1920, 1080])[3] / (it.reg ?? [0, 0, 1920, 1080])[2]) };
  if (it.tipo === "celular") return { x: p.left, y: p.top, w: p.w ?? 400, h: (p.w ?? 400) * 16 / 9 };
  if (it.tipo === "barra") return { x: p.left, y: p.top, w: p.w ?? 800, h: (it.altura ?? 46) + (it.rotulo ? 44 : 0) };
  if (it.tipo === "contador") return { x: p.left, y: p.top, w: p.w ?? 700, h: (it.tamanho ?? 96) * 1.15 };
  if (it.tipo === "fluxo") return { x: p.left, y: p.top, w: p.w ?? 1000, h: (it.tamanho ?? 34) * 2.4 };
  if (it.tipo === "codigo") return { x: p.left, y: p.top, w: p.w ?? 940, h: 56 + (it.linhas?.length ?? 0) * (it.tamanho ?? 32) * 1.5 + 36 };
  if (it.tipo === "cartao") return { x: p.left, y: p.top, w: p.w ?? 700, h: p.h ?? 200 };
  if (it.tipo === "chip") return { x: p.left, y: p.top, w: txt.length * (it.tamanho ?? 34) * 0.55 + 52, h: (it.tamanho ?? 34) + 22 };
  if (it.tipo === "txt") { const s = it.tamanho ?? 44, w = p.w ?? txt.length * s * 0.55; return { x: p.left, y: p.top, w, h: s * 1.2 * Math.max(1, Math.ceil(txt.length * s * 0.55 / w)) }; }
  return null;
}
function compilarLongo({ y, info, palavras, pasta, erros, avisos, gravar }) {
  for (const k of ["duracao", "voz", "cenas"]) if (y[k] === undefined) erros.push(`falta "${k}"`);
  const id = y.id ?? info.id; if (!id) erros.push('falta "id"');
  if (erros.length) return { spec: null, erros, avisos };
  const tempo = (x, onde) => {
    if (typeof x === "number") return;
    const o = typeof x === "string" ? { quando: x } : x;
    if (!o || typeof o.quando !== "string") { erros.push(`${onde}: tempo inválido (use número, "frase" ou { quando, nth, depois, mais })`); return; }
    if (palavras.length && achar(palavras, o.quando, o.nth ?? 0, o.depois ?? 0) < 0) erros.push(`${onde}: frase "${o.quando}"${o.nth ? ` (#${o.nth})` : ""}${o.depois ? ` depois de ${o.depois}s` : ""} não aparece na voz (palavras.json)`);
  };
  const norm1 = (it, onde) => {
    if (!it || typeof it !== "object") { erros.push(`${onde}: item inválido`); return it; }
    if (!TIPOS_LONGO.includes(it.tipo)) erros.push(`${onde}: tipo "${it.tipo}" desconhecido (use ${TIPOS_LONGO.join(", ")})`);
    for (const k of Object.keys(it)) if (!CHAVES_LONGO.has(k)) erros.push(`${onde}: chave "${k}" desconhecida${/\s/.test(k) || it[k] === null ? ". Dentro de { … } uma vírgula no texto separa os campos: ponha o texto entre aspas" : ""}`);
    const o = { ...it };
    if (it.pos) { o.pos = {}; for (const [k, v] of Object.entries(it.pos)) { if (!POS[k]) erros.push(`${onde}: pos.${k} desconhecido`); else o.pos[POS[k]] = v; } }
    if (typeof it.cor === "string" && !it.cor.startsWith("#") && !CORES.includes(it.cor)) erros.push(`${onde}: cor "${it.cor}" não existe no tema (use ${CORES.join(", ")} ou #hex)`);
    for (const x of it.partes ?? []) if (typeof x.cor === "string" && !x.cor.startsWith("#") && !CORES.includes(x.cor)) erros.push(`${onde}: cor "${x.cor}" não existe no tema`);
    if (["codigo", "cartao", "chip", "txt", "video", "celular", "barra", "contador", "fluxo"].includes(it.tipo)) { if (it.quando === undefined) erros.push(`${onde}: falta "quando" (a frase da voz que faz o item entrar)`); if (!it.pos) erros.push(`${onde}: falta "pos"`); }
    if (it.quando !== undefined) tempo(it.quando, onde);
    for (const n of it.nos ?? []) { if (n.quando === undefined) erros.push(`${onde}: cada nó de "fluxo" precisa de "quando"`); else tempo(n.quando, `${onde} › nó`); }
    if (it.linhas && it.tipo === "codigo") for (const l of it.linhas) if (l.hl) { tempo(l.hl[0], `${onde} › hl`); tempo(l.hl[1], `${onde} › hl`); }
    if (it.itens) o.itens = it.itens.map((f, i) => norm1(f, `${onde} › ${f?.tipo ?? i}`));
    return o;
  };
  const blocosArq = join(pasta, "blocos.json");
  const blocos = existsSync(blocosArq) ? JSON.parse(readFileSync(blocosArq, "utf8")) : [];
  y.cenas.forEach((c) => {
    if (c.inicio && typeof c.inicio === "object" && c.inicio.bloco !== undefined) {
      const b = blocos[c.inicio.bloco - 1];
      if (!b) erros.push(`cena "${c.titulo}": bloco ${c.inicio.bloco} não existe em blocos.json (rode \`praeko studio voz\` com o roteiro em blocos \`## título\`)`);
      else c.inicio = +(b.a + (c.inicio.mais ?? 0)).toFixed(2);
    }
  });
  const cenas = y.cenas.map((c, i) => {
    const nome = `cena ${c.n ?? i + 1} (${c.titulo ?? "?"})`;
    for (const k of Object.keys(c)) if (!["n", "titulo", "inicio", "itens", "componente"].includes(k)) erros.push(`${nome}: chave "${k}" desconhecida${/\s/.test(k) || c[k] === null ? ". Dentro de { … } uma vírgula no texto separa os campos: ponha o texto entre aspas" : ""}`);
    if (typeof c.inicio !== "number") erros.push(`${nome}: falta "inicio" (s)`);
    if (i > 0 && c.inicio <= y.cenas[i - 1].inicio) erros.push(`${nome}: inicio ${c.inicio} não vem depois da cena anterior`);
    if (c.inicio >= y.duracao) erros.push(`${nome}: inicio depois do fim do vídeo`);
    if (c.componente && c.itens) erros.push(`${nome}: use "componente" ou "itens", não os dois`);
    if (!c.componente && !c.itens?.length) erros.push(`${nome}: sem itens`);
    const itens = c.itens?.map((it, k) => norm1(it, `${nome} › item ${k + 1}`));
    const fim = i + 1 < y.cenas.length ? y.cenas[i + 1].inicio : y.duracao;
    const abs = (itens ?? []).map((it) => ({ it, r: retanguloLongo(it) })).filter((x) => x.r);
    for (const x of abs) { if (x.r.x + x.r.w > 1920 + 1) avisos.push(`${nome}: "${x.it.tipo}" passa da borda direita (≈${Math.round(x.r.x + x.r.w)} px de 1920)`); if (x.r.y + x.r.h > 960) avisos.push(`${nome}: "${x.it.tipo}" desce até ≈${Math.round(x.r.y + x.r.h)} px e invade a legenda (a partir de ~980 de 1080)`); }
    for (let a = 0; a < abs.length; a++) for (let b = a + 1; b < abs.length; b++) if (cruza(abs[a].r, abs[b].r)) avisos.push(`${nome}: "${abs[a].it.tipo}" e "${abs[b].it.tipo}" se sobrepõem se aparecerem juntos (estimativa)`);
    if (palavras.length) for (const it of itens ?? []) { const q = it.quando === undefined ? null : (typeof it.quando === "number" ? it.quando : achar(palavras, typeof it.quando === "string" ? it.quando : it.quando.quando, it.quando.nth ?? 0, it.quando.depois ?? 0) + (it.quando.mais ?? 0)); if (q !== null && q >= 0 && (q < c.inicio - 0.05 || q > fim + 0.05)) avisos.push(`${nome}: "${it.tipo}" entra em ${q.toFixed(1)} s, fora da cena (${c.inicio}–${fim}): aparece cedo ou nunca`); }
    return { n: c.n, titulo: c.titulo, inicio: c.inicio, itens, componente: c.componente };
  });
  if (palavras.length) { const fimVoz = palavras[palavras.length - 1].b; if (fimVoz + 1 > y.duracao) avisos.push(`duracao (${y.duracao} s) deixa menos de 1 s depois do fim da voz (${fimVoz.toFixed(2)} s)`); }
  let capa;
  if (y.capa) {
    const c = y.capa, onde = "capa";
    for (const k of Object.keys(c)) if (!["id", "titulo", "gato", "codigo", "chips", "cor", "glow"].includes(k)) erros.push(`${onde}: chave "${k}" desconhecida${/\s/.test(k) || c[k] === null ? ". Dentro de { … } uma vírgula no texto separa os campos: ponha o texto entre aspas" : ""}`);
    if (!Array.isArray(c.titulo) || c.titulo.length !== 2) erros.push(`${onde}: "titulo" precisa de 2 linhas (a segunda sai em destaque): titulo: ["DOIS CLIQUES", "UM ITEM"]`);
    else for (const l of c.titulo) if (String(l).length > 16) avisos.push(`${onde}: linha "${l}" tem ${String(l).length} letras; na capa 16:9 passa de ~16 e estoura`);
    for (const x of [c.cor, ...(c.chips ?? []).map((k) => k.cor)]) if (typeof x === "string" && !x.startsWith("#") && !CORES.includes(x)) erros.push(`${onde}: cor "${x}" não existe no tema`);
    if (c.codigo && !(c.codigo.linhas ?? []).length) erros.push(`${onde}: codigo sem linhas`);
    if ((c.codigo?.linhas ?? []).length > 3) avisos.push(`${onde}: mais de 3 linhas de código não cabem no cartão da capa 16:9`);
    capa = { id: c.id ?? `Capa${id}`, titulo: c.titulo, gato: c.gato, codigo: c.codigo, chips: c.chips, cor: c.cor, glow: c.glow };
  }
  let fecho;
  if (y.fecho) {
    const f = y.fecho;
    for (const k of Object.keys(f)) if (!["inicio", "texto", "link", "imagem"].includes(k)) erros.push(`fecho: chave "${k}" desconhecida (use inicio, texto, link, imagem)`);
    if (typeof f.inicio !== "number") erros.push('fecho: falta "inicio" (s, "frase" ou { voz: N })');
    else if (f.inicio >= y.duracao) erros.push(`fecho.inicio (${f.inicio}) deve vir antes da duração (${y.duracao})`);
    else if (y.duracao - f.inicio < 3) avisos.push(`fecho: só ${(y.duracao - f.inicio).toFixed(1)} s de tela final (use pelo menos 3 s)`);
    fecho = { inicio: f.inicio, ...(f.texto ? { texto: String(f.texto) } : {}), ...(f.link ? { link: String(f.link) } : {}), ...(f.imagem ? { imagem: String(f.imagem) } : {}) };
  }
  // mascote (só no motor HyperFrames): [{ quando, gato, mais }] → gatos/gato-<gato>.png aparece no canto nesse instante
  const mascote = (y.mascote ?? []).map((m, i) => { tempo(m?.quando, `mascote ${i + 1}`); if (!m?.gato) erros.push(`mascote ${i + 1}: falta "gato" (nome do arquivo gatos/gato-<nome>.png)`); return { quando: m?.quando, gato: String(m?.gato ?? ""), ...(m?.mais !== undefined ? { mais: m.mais } : {}) }; });
  if (y.motor !== undefined && !["remotion", "hyperframes"].includes(y.motor)) erros.push(`motor "${y.motor}" não existe (use remotion ou hyperframes)`);
  const spec = { id, durS: y.duracao, voz: y.voz, ...(y.motor ? { motor: y.motor } : {}), cenas, ...(capa ? { capa } : {}), ...(fecho ? { fecho } : {}), ...(mascote.length ? { mascote } : {}) };
  if (!erros.length && gravar) writeFileSync(join(pasta, "episodio.spec.json"), JSON.stringify(spec, null, 2) + "\n");
  return { spec: erros.length ? null : spec, erros, avisos };
}

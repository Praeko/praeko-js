// Portuguese (0.1.0) → English keys. This is the ONLY place in the Studio that knows the old Portuguese names; `praeko studio migrate` uses it
// to rewrite an existing project. Nothing here mutates its input. `renamed` collects the old keys found.

type Obj = Record<string, any>;
export type Result = { value: any; renamed: string[] };

const COLORS: Record<string, string> = { destaque: "accent", texto: "text", suave: "muted", erro: "error", caixa: "box", fundo: "background", fundoCapa: "coverBackground", codigo: "code", caixaLongo: "longBox" };
export const colorName = (c: unknown): unknown => (typeof c === "string" ? (COLORS[c] ?? c) : c);
/** "destaque 60%" → "accent 60%" (gradient stops carry a position). */
const colorStop = (c: unknown): unknown => { if (typeof c !== "string" || c.startsWith("#")) return c; const [n, ...r] = c.split(" "); return [colorName(n), ...r].join(" "); };

const POS: Record<string, string> = { esquerda: "left", direita: "right", topo: "top", base: "bottom", largura: "width", altura: "height" };
const TYPES_SHORT: Record<string, string> = { texto: "text", caixa: "box", linha: "line", balao: "bubble", codigo: "code", janela: "window", celular: "phone", barra: "bar", barras: "bars", pilha: "stack", fila: "row", cartao: "card" };
const TYPES_LONG: Record<string, string> = { codigo: "code", cartao: "card", texto: "text", txt: "freetext", celular: "phone", barra: "bar", contador: "counter", fluxo: "flow" };
const ALIGN: Record<string, string> = { esquerda: "left", centro: "center", inicio: "start", fim: "end", esticar: "stretch" };
const ITEM_KEYS: Record<string, string> = {
  tipo: "type", quando: "when", deslocar: "offset", em: "at", cor: "color", tamanho: "size", texto: "text", fonte: "font", alinhar: "align", peso: "weight", semQuebra: "noWrap", semFade: "noFade",
  apagada: "dim", tracejada: "dashed", autor: "author", titulo: "title", linhas: "lines", partes: "parts", duracaoClipe: "clipDuration", de: "from", gradiente: "gradient", gradienteAngulo: "gradientAngle",
  raio: "radius", fundo: "background", borda: "border", preenche: "fill", brilhoAoFim: "glowAtEnd", larguraMax: "maxWidth", larguraRotulo: "labelWidth", passo: "step", itens: "items", centrar: "center", espalhar: "spread",
  espacar: "spacing", dur: "motionDuration", valor: "value", rotulo: "label", duracao: "duration", ate: "to", prefixo: "prefix", sufixo: "suffix", casas: "decimals", nos: "nodes",
};
const TIME_KEYS: Record<string, string> = { quando: "when", depois: "after", mais: "plus", voz: "voice", bloco: "block" };

function rename(o: Obj, map: Record<string, string>, renamed: Set<string>, extra: Record<string, string> = {}): Obj {
  const r: Obj = {};
  for (const [k, v] of Object.entries(o)) {
    const en = extra[k] ?? map[k];
    if (en && en !== k) { renamed.add(k); if (!(en in o)) r[en] = v; } else r[k] = v;
  }
  return r;
}
const isObj = (x: unknown): x is Obj => !!x && typeof x === "object" && !Array.isArray(x);

/** number | "phrase" | { quando, nth, depois, mais } | { voz: N } | { bloco: N }. */
export function translateTime(x: unknown, renamed = new Set<string>()): unknown {
  return isObj(x) ? rename(x, TIME_KEYS, renamed) : x;
}
function partOf(p: Obj, renamed: Set<string>): Obj {
  const o = rename(p, { texto: "text", cor: "color", peso: "weight" }, renamed);
  if (o.color !== undefined) o.color = colorName(o.color);
  return o;
}
function translateLines(lines: unknown, renamed: Set<string>): unknown {
  if (!Array.isArray(lines)) return lines;
  return lines.map((l) => {
    if (Array.isArray(l)) return l.map((p) => (isObj(p) ? partOf(p, renamed) : p)); // card: [[{texto,cor,peso}]]
    if (!isObj(l)) return l;
    const o = rename(l, { cor: "color", marca: "mark", vermelho: "red", rotulo: "label", valor: "value", texto: "text", peso: "weight" }, renamed);
    if (o.color !== undefined) o.color = colorName(o.color);
    if (Array.isArray(o.hl)) o.hl = o.hl.map((t: unknown) => translateTime(t, renamed));
    return o;
  });
}

export function translateItem(it: unknown, renamed = new Set<string>(), long = false): unknown {
  if (!isObj(it)) return it;
  const typeOld = it.tipo ?? it.type;
  const heightKey = typeOld === "texto" || typeOld === "text" ? "lineHeight" : "height";
  const o = rename(it, ITEM_KEYS, renamed, { altura: heightKey });
  const types = long ? TYPES_LONG : TYPES_SHORT;
  if (typeof o.type === "string" && types[o.type]) o.type = types[o.type];
  if (isObj(o.pos)) o.pos = rename(o.pos, POS, renamed);
  if (typeof o.align === "string" && ALIGN[o.align]) o.align = ALIGN[o.align];
  if (o.font === "padrao") o.font = "default";
  if (o.color !== undefined) o.color = Array.isArray(o.color) ? o.color.map(colorStop) : colorStop(o.color);
  if (Array.isArray(o.gradient)) o.gradient = o.gradient.map(colorStop);
  if (o.when !== undefined && !Array.isArray(o.when)) o.when = translateTime(o.when, renamed);
  if (o.lines) o.lines = translateLines(o.lines, renamed);
  if (Array.isArray(o.parts)) o.parts = o.parts.map((p: unknown) => (isObj(p) ? partOf(p, renamed) : p));
  if (isObj(o.fill)) o.fill = rename(o.fill, { de: "from", ate: "to", inicio: "start", duracao: "duration" }, renamed);
  if (Array.isArray(o.nodes)) o.nodes = o.nodes.map((n: unknown) => { if (!isObj(n)) return n; const r = rename(n, { texto: "text", cor: "color", quando: "when" }, renamed); if (r.color !== undefined) r.color = colorName(r.color); if (r.when !== undefined && !Array.isArray(r.when)) r.when = translateTime(r.when, renamed); return r; });
  if (Array.isArray(o.items)) o.items = o.items.map((c: unknown) => translateItem(c, renamed, long));
  return o;
}

function translateScene(c: unknown, renamed: Set<string>, long: boolean): unknown {
  if (!isObj(c)) return c;
  const o = rename(c, { inicio: "start", fim: "end", titulo: "title", rotulo: "label", sons: "sounds", itens: "items", componente: "component" }, renamed);
  if (o.start !== undefined) o.start = translateTime(o.start, renamed);
  if (o.end !== undefined) o.end = translateTime(o.end, renamed);
  if (o.layout === "painel") o.layout = "panel"; else if (o.layout === "livre") o.layout = "free";
  if (Array.isArray(o.sounds)) o.sounds = o.sounds.map((s: unknown) => (isObj(s) ? rename(s, { f: "sound" }, renamed) : s));
  if (Array.isArray(o.items)) o.items = o.items.map((i: unknown) => translateItem(i, renamed, long));
  return o;
}

const wrap = (value: unknown, renamed: Set<string>): Result => ({ value, renamed: [...renamed] });

/** Whole episode.yaml document (already parsed). */
export function translateEpisode(y: unknown): Result {
  if (!isObj(y)) return { value: y, renamed: [] };
  const renamed = new Set<string>();
  const long = y.formato === "longo" || y.format === "long";
  const o = rename(y, { duracao: "duration", legenda: "caption", voz: "voice", fundo: "background", golpes: "hits", fechamento: "outro", capa: "cover", cenas: "scenes", formato: "format", motor: "engine", fecho: "endcard", mascote: "mascot" }, renamed);
  if (o.format === "longo") o.format = "long";
  if (o.duration !== undefined) o.duration = translateTime(o.duration, renamed);
  if (Array.isArray(o.hits)) o.hits = o.hits.map((g: unknown) => { if (!isObj(g)) return g; const r = rename(g, { em: "at", tipo: "type" }, renamed); if (r.at !== undefined) r.at = translateTime(r.at, renamed); if (r.type === "tudo") r.type = "all"; return r; });
  if (isObj(o.outro)) { o.outro = rename(o.outro, { inicio: "start" }, renamed); if (o.outro.start !== undefined) o.outro.start = translateTime(o.outro.start, renamed); }
  if (isObj(o.endcard)) { o.endcard = rename(o.endcard, { inicio: "start", texto: "text", imagem: "image" }, renamed); if (o.endcard.start !== undefined) o.endcard.start = translateTime(o.endcard.start, renamed); }
  if (Array.isArray(o.mascot)) o.mascot = o.mascot.map((m: unknown) => { if (!isObj(m)) return m; const r = rename(m, { quando: "when", gato: "name", mais: "plus" }, renamed); if (r.when !== undefined && !Array.isArray(r.when)) r.when = translateTime(r.when, renamed); return r; });
  if (isObj(o.cover)) {
    const c = rename(o.cover, { componente: "component", titulo: "title", cor: "color", tam: "size", itens: "items", gato: "mascot", codigo: "code" }, renamed);
    if (c.color !== undefined) c.color = colorName(c.color);
    if (isObj(c.code)) { c.code = rename(c.code, { titulo: "title", linhas: "lines" }, renamed); c.code.lines = translateLines(c.code.lines, renamed); }
    if (Array.isArray(c.chips)) c.chips = c.chips.map((k: unknown) => (isObj(k) ? partOf(k, renamed) : k));
    if (Array.isArray(c.items)) c.items = c.items.map((i: unknown) => translateItem(i, renamed, false));
    o.cover = c;
  }
  if (Array.isArray(o.scenes)) o.scenes = o.scenes.map((c: unknown) => translateScene(c, renamed, long));
  return wrap(o, renamed);
}

/** episode.json: { id, capa, titulo }. */
export const translateEpisodeInfo = (j: Obj): Result => { const r = new Set<string>(); return wrap(rename(j, { capa: "cover", titulo: "title" }, r), r); };
/** cut.json: { longo, de, ate, abertura: { texto, qualidade } }. */
export function translateCut(j: Obj): Result {
  const r = new Set<string>(), o = rename(j, { longo: "long", de: "from", ate: "to", abertura: "hook" }, r);
  if (isObj(o.hook)) { o.hook = rename(o.hook, { texto: "text", qualidade: "quality" }, r); if (o.hook.quality === "rascunho") o.hook.quality = "draft"; }
  return wrap(o, r);
}
/** blocks.json: [{ n, titulo, a, b }]. */
export const translateBlocks = (arr: unknown): Result => { const r = new Set<string>(); return wrap(Array.isArray(arr) ? arr.map((b) => (isObj(b) ? rename(b, { titulo: "title" }, r) : b)) : arr, r); };
/** voice-hook cache json: { duracao, palavras, estimada }. */
export const translateHookCache = (j: Obj): Result => { const r = new Set<string>(); return wrap(rename(j, { duracao: "duration", palavras: "words", estimada: "estimated" }, r), r); };

// ---------- brand.json ----------
const BRAND_COLORS = { fundo: "background", fundoCapa: "coverBackground", destaque: "accent", texto: "text", suave: "muted", erro: "error", caixa: "box", caixaLongo: "longBox", codigo: "code" };
const NETWORK_KEYS = { privacidade: "privacy", categoriaId: "categoryId", avisarInscritos: "notifySubscribers", modo: "mode", quadroMs: "frameMs", miniaturaMs: "thumbnailMs", primeiroComentario: "firstComment" };
export function translateBrand(b: Obj): Result {
  const r = new Set<string>();
  const o = rename(b, { nome: "name", cores: "colors", fontes: "fonts", assinatura: "signature", linkRotulo: "linkLabel", voz: "voice", pronuncia: "pronunciation", legendaCorrige: "captionFixes", nomesProibidos: "bannedNames", publico: "publicDir", motor: "engine", publicacao: "publishing" }, r);
  if (isObj(o.colors)) o.colors = rename(o.colors, BRAND_COLORS, r);
  if (isObj(o.fonts)) o.fonts = rename(o.fonts, { titulo: "title" }, r);
  if (isObj(o.links) && "principal" in o.links && !("main" in o.links)) { const l = { ...o.links }; l.main = l.principal; delete l.principal; r.add("principal"); o.links = l; }
  if (isObj(o.voice)) o.voice = rename(o.voice, { provedor: "provider", modelo: "model" }, r);
  if (typeof o.voice === "string") o.voice = legacyVoiceAlias(o.voice);
  if (isObj(o.hyperframes)) o.hyperframes = rename(o.hyperframes, { fontesLocais: "localFonts" }, r);
  if (isObj(o.publishing)) {
    const p = rename(o.publishing, { provedor: "provider", limites: "limits", tiquesDeIA: "aiTics", fusoOffset: "timezoneOffset", pasta: "folder", hospedagem: "hosting" }, r);
    if (isObj(p.hashtags)) p.hashtags = rename(p.hashtags, { permitidas: "allowed", proibidas: "banned" }, r);
    if (isObj(p.limits)) p.limits = rename(p.limits, { youtubeTitulo: "youtubeTitle", youtubeDescricao: "youtubeDescription" }, r);
    if (isObj(p.hosting)) p.hosting = rename(p.hosting, { tipo: "type", urlBase: "baseUrl" }, r);
    for (const k of ["buffer", "praeko"]) if (isObj(p[k])) {
      const x = rename(p[k], { canais: "channels", redes: "networks" }, r);
      for (const n of ["youtube", "instagram", "tiktok"]) if (isObj(x[n])) x[n] = rename(x[n], NETWORK_KEYS, r);
      p[k] = x;
    }
    o.publishing = p;
  }
  return wrap(o, r);
}

// ---------- voices.json ----------
const ALIAS: Record<string, string> = { "rascunho-mudo": "draft-silent", "minha-voz": "my-voice", "voz-local": "local-voice" };
export const legacyVoiceAlias = (a: unknown): unknown => (typeof a === "string" ? (ALIAS[a] ?? a) : a);
export function translateVoices(v: Obj): Result {
  const r = new Set<string>();
  const o = rename(v, { contas: "accounts", vozes: "voices", estrategia: "strategy", qualidade: "quality" }, r);
  if (isObj(o.accounts)) o.accounts = rename(o.accounts, { desativadas: "disabled" }, r);
  if (isObj(o.voices)) {
    const out: Obj = {};
    for (const [k, x] of Object.entries<unknown>(o.voices)) {
      if (ALIAS[k]) r.add(k);
      const e = isObj(x) ? rename(x, { provedor: "provider", modelo: "model", alinhador: "aligner", idioma: "language", ajustes: "settings", palavrasPorMin: "wordsPerMin" }, r) : x;
      if (isObj(e) && e.provider === "estimado") e.provider = "estimated";
      out[legacyVoiceAlias(k) as string] = e;
    }
    o.voices = out;
  }
  if (isObj(o.strategy)) { o.strategy = { ...o.strategy }; for (const [k, x] of Object.entries(o.strategy)) if (x === "failover-saldo") o.strategy[k] = "failover-balance"; }
  if (isObj(o.quality)) { const q: Obj = {}; for (const [k, x] of Object.entries<unknown>(o.quality)) { if (k === "rascunho") r.add(k); q[k === "rascunho" ? "draft" : k] = legacyVoiceAlias(x); } o.quality = q; }
  return wrap(o, r);
}

// ---------- publication.json ----------
export function translatePublication(p: Obj): Result {
  const r = new Set<string>();
  const o = rename(p, { nome: "name", data: "date", titulo: "title", alternativas: "alternatives", formato: "format", arquivos: "files", antesDePublicar: "beforePublishing", ia: "ai", fatos: "facts", capitulos: "chapters", videoCompleto: "fullVideo", artigo: "article", respostaComentario: "commentReply", campanha: "campaign", publicarEm: "publishOn" }, r);
  if (o.format === "longo") o.format = "long";
  if (isObj(o.files)) o.files = rename(o.files, { capa: "cover", capaVertical: "verticalCover" }, r);
  if (isObj(o.ai)) o.ai = rename(o.ai, { sintetico: "synthetic" }, r);
  if (isObj(o.yt)) o.yt = rename(o.yt, { descricao: "description", comentarioFixo: "pinnedComment" }, r);
  if (isObj(o.ig)) o.ig = rename(o.ig, { legenda: "caption", comentarioFixo: "pinnedComment" }, r);
  if (isObj(o.tiktok)) o.tiktok = rename(o.tiktok, { legenda: "caption" }, r);
  if (Array.isArray(o.chapters)) o.chapters = o.chapters.map((c: unknown) => (isObj(c) ? rename(c, { titulo: "title" }, r) : c));
  return wrap(o, r);
}

// ---------- schedule.json ----------
export function translateSchedule(s: Obj): Result {
  const r = new Set<string>();
  const o = rename(s, { provedor: "provider", titulo: "title", chaveObjeto: "objectKey", criadoEm: "createdAt" }, r);
  if (Array.isArray(o.posts)) o.posts = o.posts.map((x: unknown) => (isObj(x) ? rename(x, { rede: "network", canalId: "channelId" }, r) : x));
  return wrap(o, r);
}

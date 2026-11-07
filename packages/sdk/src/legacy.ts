// DEPRECATED: the Portuguese SDK surface (methods, arguments and response fields), kept so installed scripts keep working during the transition.
// Every method here calls the LEGACY routes of the server (no `X-Praeko-Contract` header), so responses keep the old Portuguese shape.
// New code uses the English API in index.mjs. Removing the legacy contract = deleting this file and the call to addLegacy().
import type { Praeko } from "./index.ts";
import type { LegacyMidiaApi, LegacyInstagram, LegacyPosts, LegacyYoutube, Source, SourceReader } from "./types.ts";

const enc = (x: string): string => encodeURIComponent(x);
/** Same as asSource() in index.mjs (copied: this file must not import it back). */
function fonte(x: Source): SourceReader {
  const a = x as Partial<Record<"read" | "size" | "ler" | "tamanho", any>> | null;
  if (a && typeof a.read === "function" && typeof a.size === "number") return a as SourceReader;
  if (a && typeof a.ler === "function" && typeof a.tamanho === "number") return { size: a.tamanho, read: (i: number, n: number) => a.ler(i, n) };
  if (typeof Blob !== "undefined" && x instanceof Blob) return { size: x.size, read: async (i: number, n: number) => new Uint8Array(await x.slice(i, i + n).arrayBuffer()) };
  const u8 = x instanceof Uint8Array ? x : x instanceof ArrayBuffer ? new Uint8Array(x) : null;
  if (!u8) throw new TypeError("fonte inválida: use Uint8Array, ArrayBuffer, Blob ou { tamanho, ler(inicio, n) }");
  return { size: u8.length, read: async (i: number, n: number) => u8.subarray(i, i + n) };
}

export function addLegacy(a: Praeko): void {
  const L = (method: string, path: string, { corpo, bytes, consulta, repetir, semChave }: { corpo?: unknown; bytes?: Uint8Array; consulta?: Record<string, unknown>; repetir?: boolean; semChave?: boolean } = {}) => a._req(method, path, { body: corpo, bytes, query: consulta, retry: repetir ?? method === "GET", noKey: semChave, legacy: true });
  a.midia = {
    iniciar: (meta) => L("POST", "/v1/midia", { corpo: meta }),
    enviarParte: (id, n, bytes) => L("PUT", `/v1/midia/${id}/partes/${n}`, { bytes, repetir: true }),
    enviarConteudo: (id, bytes) => L("PUT", `/v1/midia/${id}/conteudo`, { bytes, repetir: true }),
    completar: (id) => L("POST", `/v1/midia/${id}/completar`),
    obter: (id) => L("GET", `/v1/midia/${id}`),
    listar: (tipo) => L("GET", "/v1/midia", { consulta: { tipo } }),
    remover: (id) => L("DELETE", `/v1/midia/${id}`),
    /** Uploads a whole media (legacy shapes: { id, … } with Portuguese fields). Prefer media.upload. */
    enviar: async (origem, { tipo, nome, mime, parte = 16 * 1024 * 1024, aoProgredir }: Partial<Parameters<LegacyMidiaApi["enviar"]>[1]> = {}) => {
      const s = fonte(origem);
      if (!tipo || !nome || !mime) throw new Error("midia.enviar: informe tipo, nome e mime");
      if (s.size <= 32 * 1024 * 1024) {
        const m = await a.midia.iniciar({ tipo, nome, mime, tamanho: s.size, simples: true });
        const r = await a.midia.enviarConteudo(m.id, await s.read(0, s.size)); aoProgredir?.(s.size, s.size); return r;
      }
      const m = await a.midia.iniciar({ tipo, nome, mime, tamanho: s.size });
      const tam = Math.max(m.parteMinima || 0, Math.min(parte, m.parteMaxima || parte));
      for (let n = 1, pos = 0; pos < s.size; n++, pos += tam) { await a.midia.enviarParte(m.id, n, await s.read(pos, tam)); aoProgredir?.(Math.min(pos + tam, s.size), s.size); }
      return a.midia.completar(m.id);
    },
  };
  Object.assign(a.posts, {
    criar: (pedido) => L("POST", "/v1/posts", { corpo: pedido }),
    listar: (filtros = {}) => L("GET", "/v1/posts", { consulta: filtros }),
    obter: (id) => L("GET", `/v1/posts/${enc(id)}`),
    adotar: (corpo) => L("POST", "/v1/posts/adotar", { corpo }),
    agendarYoutube: (id, quando) => L("POST", `/v1/posts/${enc(id)}/youtube/agendar`, { corpo: { quando } }),
    editar: (id, mudancas) => L("PATCH", `/v1/posts/${enc(id)}`, { corpo: mudancas }),
    publicarAgora: (id, { rede } = {}) => L("POST", `/v1/posts/${enc(id)}/publicar-agora`, { consulta: { rede } }),
    cancelar: (id) => L("DELETE", `/v1/posts/${enc(id)}`),
    comentar: (id, itemId) => L("POST", `/v1/posts/${enc(id)}/itens/${itemId}/comentar`),
  } satisfies LegacyPosts);
  a.canais = {
    listar: ({ verificar } = {}) => L("GET", "/v1/canais", { consulta: { verificar: verificar ? 1 : undefined } }),
    vagas: (rede) => L("GET", `/v1/canais/${rede}/vagas`),
    informarSeguidores: (rede, valor, { dia } = {}) => L("PUT", `/v1/canais/${rede}/seguidores`, { corpo: { valor, ...(dia ? { dia } : {}) } }),
    seguidores: (rede) => L("GET", `/v1/canais/${rede}/seguidores`),
    definirVagas: (rede, vagas, { fuso } = {}) => L("PUT", `/v1/canais/${rede}/vagas`, { corpo: { vagas, ...(fuso ? { fuso } : {}) } }),
    conectar: (rede) => L("GET", `/v1/conexoes/${rede}/iniciar`),
    desconectar: (rede) => L("DELETE", `/v1/conexoes/${rede}`),
    enviarTokenInstagram: (corpo) => L("PUT", "/v1/conexoes/instagram/token", { corpo }),
  };
  Object.assign(a.instagram, {
    midias: ({ max, pagina } = {}) => L("GET", "/v1/instagram/midias", { consulta: { max, pagina } }),
    comentarios: ({ midia, semResposta, ordem, max } = {}) => L("GET", "/v1/instagram/comentarios", { consulta: { midia, semResposta: semResposta ? 1 : undefined, ordem, max } }),
    responder: (comentarioId, texto) => L("POST", `/v1/instagram/comentarios/${enc(comentarioId)}/responder`, { corpo: { texto } }),
    ocultar: (comentarioId, ocultar = true) => L("POST", `/v1/instagram/comentarios/${enc(comentarioId)}/ocultar`, { corpo: { ocultar } }),
    resolver: (comentarioId) => L("POST", `/v1/instagram/comentarios/${enc(comentarioId)}/resolver`),
    reabrir: (comentarioId) => L("DELETE", `/v1/instagram/comentarios/${enc(comentarioId)}/resolver`),
  } satisfies LegacyInstagram);
  a.comunidade = { comentarios: ({ rede, semResposta, ordem, max } = {}) => L("GET", "/v1/comentarios", { consulta: { rede, semResposta: semResposta ? 1 : undefined, ordem, max } }) };
  Object.assign(a.youtube, {
    lerVideo: (id) => L("GET", `/v1/youtube/videos/${enc(id)}`),
    editarVideo: (id, { titulo, descricao, tags, simular } = {}) => L("PATCH", `/v1/youtube/videos/${enc(id)}`, { corpo: { titulo, descricao, tags, simular } }),
    comentarios: ({ video, semResposta, ordem, max, pagina } = {}) => L("GET", "/v1/youtube/comentarios", { consulta: { video, semResposta: semResposta ? 1 : undefined, ordem, max, pagina } }),
    resolver: (threadId) => L("POST", `/v1/youtube/comentarios/${enc(threadId)}/resolver`),
    reabrir: (threadId) => L("DELETE", `/v1/youtube/comentarios/${enc(threadId)}/resolver`),
    responder: (threadId, texto) => L("POST", `/v1/youtube/comentarios/${enc(threadId)}/responder`, { corpo: { texto } }),
  } satisfies Omit<LegacyYoutube, "videos">);
  a.youtube.videos = ({ max, pagina } = {}) => L("GET", "/v1/youtube/videos", { consulta: { max, pagina } }); // same name as the old SDK; the English one is youtube.listVideos
  a.insights.obter = ({ de, ate, canal, etiqueta, tipo, comparar, ordem, direcao, pagina, limite } = {}) => L("GET", "/v1/insights", { consulta: { de, ate, canal, etiqueta, tipo, comparar: comparar ? 1 : undefined, ordem, direcao, pagina, limite } });
  a.insights.importar = ({ rede = "tudo", simular } = {}) => L("POST", "/v1/insights/importar", { consulta: { rede, simular: simular ? 1 : undefined } });
  a.conteudo = { listar: ({ rede, tipo, de, ate, ordem, limite, deslocamento } = {}) => L("GET", "/v1/conteudo", { consulta: { rede, tipo, de, ate, ordem, limite, deslocamento } }) };
  a.mencoes = ({ rede } = {}) => L("GET", "/v1/mencoes", { consulta: { rede } });
  a.chaves = {
    listar: () => L("GET", "/v1/chaves"),
    criar: (nome, escopo = "escrita") => L("POST", "/v1/chaves", { corpo: { nome, escopo } }),
    revogar: (id) => L("DELETE", `/v1/chaves/${id}`),
  };
  a.calendario = ({ de, ate, canal, etiqueta } = {}) => L("GET", "/v1/calendario", { consulta: { de, ate, canal, etiqueta } });
  a.saude = () => L("GET", "/saude", { semChave: true });
}

// Provedor Praeko: agenda/posta DIRETO no serviço Praeko (Cloudflare Worker, https://praeko.app), sem Buffer e sem hospedagem em R2.
// Cliente HTTP puro (fetch injetável, sem dependências). Fala o contrato em INGLÊS do Praeko (cabeçalho `X-Arauto-Contract: en`):
// /v1/media, /v1/posts, /v1/channels; campos title, media, texts, items, scheduledFor, mode, via. As mensagens para o usuário saem em português.
// Chave: formato `praeko_…` (ou `arauto_…`) com escopo write, no Chaveiro (serviço praeko, conta praeko/principal) ou em PRAEKO_STUDIO_KEY_PRAEKO_PRINCIPAL.
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { basename, extname } from "node:path";
import { textosPorRede } from "../buffer.mjs";

export const URL_PADRAO = "https://praeko.app";
export const REF_CHAVE = "praeko/principal";
export const SIMPLE_MAX = 32 * 1024 * 1024; // até aqui um PUT só (o servidor aceita 50 MB; fica abaixo por folga); acima, partes
export const PARTE_PADRAO = 16 * 1024 * 1024;
export const REDES_PRAEKO = ["youtube", "instagram", "tiktok"];

export class ErroPraeko extends Error {
  constructor(status, code, message, details) { super(message); this.name = "ErroPraeko"; this.status = status; this.code = code; this.details = details; }
}

/** Código de erro do servidor → frase clara em português (a `message` do servidor, que já é em português, vem junto). */
const DICA = {
  unauthorized: "o Praeko não recebeu uma chave válida. Guarde a chave: echo $CHAVE | praeko studio agendar --via praeko --chave",
  invalid_api_key: "o Praeko recusou a chave (inválida). Crie outra no painel e guarde: echo $CHAVE | praeko studio agendar --via praeko --chave",
  revoked_api_key: "a chave do Praeko foi revogada. Crie outra no painel e guarde: echo $CHAVE | praeko studio agendar --via praeko --chave",
  expired_api_key: "a chave do Praeko expirou. Crie outra no painel e guarde: echo $CHAVE | praeko studio agendar --via praeko --chave",
  forbidden: "a chave do Praeko não tem permissão para isso (precisa do escopo write)",
  rate_limited: "muitas requisições ao Praeko (limite de 300 por minuto); espere um pouco e repita",
  invalid_origin: "o Praeko recusou a origem da requisição",
  id_exists: "já existe um post com esse id no Praeko",
  time_in_past: "o horário já passou ou está perto demais",
  missing_schedule: "falta o horário de um dos itens",
  no_slots: "o canal não tem vagas semanais configuradas",
  post_not_found: "o Praeko não conhece esse post (foi apagado ou é de outra conta)",
  media_not_found: "a mídia não existe no Praeko",
  media_in_use: "a mídia está em uso por um post pendente",
  media_not_ready: "a mídia ainda não terminou de subir",
  media_type_mismatch: "o tipo da mídia não bate (vídeo e capa são mídias diferentes)",
  file_too_large: "o arquivo é grande demais para esse tipo de envio",
  part_too_small: "uma parte do envio ficou menor que o mínimo do servidor",
  channel_not_connected: "a rede não está conectada no Praeko (conecte em Canais no painel)",
  channel_not_found: "o canal informado não existe no Praeko (veja: praeko studio agendar --canais --via praeko)",
  network_not_supported: "o Praeko ainda não suporta essa rede",
  buffer_error: "o Buffer (que o Praeko aciona para o Instagram) recusou",
  instagram_error: "a Meta recusou o pedido do Instagram",
  tiktok_unavailable: "o TikTok recusou ou está indisponível",
  youtube_error: "o YouTube recusou o pedido",
  instagram_meta_not_connected: "o Instagram não está conectado à API da Meta no Praeko (use instagram.via = \"buffer\" ou conecte a Meta)",
  internal_error: "erro interno do Praeko; tente de novo em instantes",
};

/** Monta a mensagem do erro. Nunca inclui a chave (se ela aparecer em algum texto do servidor, é apagada). */
export function mensagemDeErro(status, code, message, chave) {
  const limpa = (s) => (chave && s ? String(s).split(chave).join("…") : s);
  const dica = DICA[code];
  const msg = limpa(message);
  if (dica) return `Praeko: ${dica}${msg && !dica.includes(msg) ? ` (${msg})` : ""} [${code}]`;
  if (code && code !== "http_error") return `Praeko recusou (HTTP ${status}, ${code}): ${msg || "sem detalhes"}`;
  return `Praeko respondeu HTTP ${status}${msg ? `: ${msg}` : ""}`;
}

/** Só https (a chave viaja no cabeçalho); http apenas para localhost. */
export function normalizarUrl(url = URL_PADRAO) {
  const u = String(url).trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(u) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(u)) throw new Error(`url do Praeko inválida: "${url}" (precisa ser https://…; marca.json → publicacao.praeko.url)`);
  return u;
}

const MIME = { ".mp4": "video/mp4", ".mov": "video/quicktime", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };
/** Arquivo em disco como fonte { size, name, mime, read(início, n), close() }: lê em faixas, nunca o vídeo inteiro de uma vez (quando vai em partes). */
export function fonteDeArquivo(caminho) {
  const mime = MIME[extname(caminho).toLowerCase()];
  if (!mime) throw new Error(`não sei o tipo de ${basename(caminho)} (use .mp4, .mov, .png ou .jpg)`);
  const fd = openSync(caminho, "r"), size = fstatSync(fd).size;
  return { size, name: basename(caminho), mime, close: () => closeSync(fd), read: async (ini, n) => { const b = Buffer.alloc(Math.min(n, size - ini)); readSync(fd, b, 0, b.length, ini); return b; } };
}

/**
 * Cliente do Praeko. `chave` obrigatória nas chamadas; `fetchFn`/`espera` injetáveis (testes). GET e envio de partes repetem em falha de rede, 429 e 5xx.
 * Métodos: canais, subirMidia, removerMidia, criarPost, status, cancelar.
 */
export function cliente({ url = URL_PADRAO, chave, fetchFn = fetch, tentativas = 3, espera = (ms) => new Promise((r) => setTimeout(r, ms)), simpleMax = SIMPLE_MAX, parte = PARTE_PADRAO } = {}) {
  const base = normalizarUrl(url);
  const q = (o) => { const s = Object.entries(o || {}).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&"); return s ? "?" + s : ""; };
  const ref = encodeURIComponent;
  async function req(metodo, caminho, { corpo, bytes, query, repetir = metodo === "GET" } = {}) {
    if (!chave) throw new ErroPraeko(0, "sem_chave", "sem chave do Praeko: echo $CHAVE | praeko studio agendar --via praeko --chave (ou a variável PRAEKO_STUDIO_KEY_PRAEKO_PRINCIPAL)");
    const init = { method: metodo, headers: { authorization: `Bearer ${chave}`, "x-arauto-contract": "en" } };
    if (bytes !== undefined) { init.body = bytes; init.headers["content-type"] = "application/octet-stream"; }
    else if (corpo !== undefined) { init.body = JSON.stringify(corpo); init.headers["content-type"] = "application/json"; }
    let ultimo;
    for (let i = 0; i < (repetir ? tentativas : 1); i++) {
      if (i) await espera(Math.min(8000, 500 * 2 ** i));
      let r;
      try { r = await fetchFn(`${base}${caminho}${q(query)}`, init); }
      catch (e) { ultimo = new ErroPraeko(0, "rede", `sem conexão com o Praeko (${String(e.message).split(chave).join("…")})`); continue; }
      const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch { /* resposta que não é JSON */ }
      if (r.ok) return j;
      const e = j?.error ?? (j?.erro && { code: j.erro.codigo, message: j.erro.mensagem, details: j.erro.detalhes }); // envelope novo ou o legado
      ultimo = new ErroPraeko(r.status, e?.code || "http_error", mensagemDeErro(r.status, e?.code, e?.message, chave), e?.details);
      if (!(r.status === 429 || r.status >= 500)) throw ultimo;
    }
    throw ultimo;
  }
  const api = {
    req,
    /** GET /v1/channels → [{ network, id, connected, detail, name?, default?, meta?, publishesViaMeta? }]. Só leitura. */
    canais: async () => (await req("GET", "/v1/channels")).channels || [],
    removerMidia: (id) => req("DELETE", `/v1/media/${ref(id)}`),
    /** Sobe um arquivo (um PUT até simpleMax, senão partes + complete). `tipo`: "video" | "cover". Devolve a mídia pronta { id, … }. */
    async subirMidia(fonte, { tipo, nome = fonte.name, mime = fonte.mime, aoProgredir } = {}) {
      if (!tipo || !nome || !mime) throw new Error("subirMidia: informe tipo, nome e mime");
      if (fonte.size <= simpleMax) {
        const m = await req("POST", "/v1/media", { corpo: { type: tipo, name: nome, mime, size: fonte.size, simple: true } });
        const r = await req("PUT", `/v1/media/${ref(m.id)}/content`, { bytes: await fonte.read(0, fonte.size), repetir: true });
        aoProgredir?.(fonte.size, fonte.size);
        return { ...m, ...(r || {}), id: m.id };
      }
      const m = await req("POST", "/v1/media", { corpo: { type: tipo, name: nome, mime, size: fonte.size } });
      const tam = Math.max(m.minPartSize || 0, Math.min(parte, m.maxPartSize || parte));
      for (let n = 1, pos = 0; pos < fonte.size; n++, pos += tam) {
        await req("PUT", `/v1/media/${ref(m.id)}/parts/${n}`, { bytes: await fonte.read(pos, tam), repetir: true });
        aoProgredir?.(Math.min(pos + tam, fonte.size), fonte.size);
      }
      const r = await req("POST", `/v1/media/${ref(m.id)}/complete`);
      return { ...m, ...(r || {}), id: m.id };
    },
    /** POST /v1/posts → { id, items: [{ id, network, state, scheduledFor, … }] }. Não repete (criar duas vezes duplicaria). */
    criarPost: (corpo) => req("POST", "/v1/posts", { corpo }),
    /** GET /v1/posts/:id → post com os itens. */
    status: (id) => req("GET", `/v1/posts/${ref(id)}`),
    /** DELETE /v1/posts/:id → { id, canceled: [ids], kept: [itens]}; só cancela o que ainda está pendente. */
    cancelar: (id) => req("DELETE", `/v1/posts/${ref(id)}`),
  };
  return api;
}

/** ISO UTC → ISO com o fuso informado ("-03:00"): 2026-11-06T20:30:00.000Z → 2026-11-06T17:30:00-03:00. */
export function isoComFuso(iso, fuso = "-03:00") {
  const m = String(fuso).match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!m) throw new Error(`fuso inválido: "${fuso}" (use "-03:00")`);
  const min = (m[1] === "-" ? -1 : 1) * (+m[2] * 60 + +m[3]);
  return new Date(new Date(iso).getTime() + min * 60e3).toISOString().slice(0, 19) + `${m[1]}${m[2]}:${m[3]}`;
}

/** `marca.json → publicacao.praeko` com validação das opções. */
export function configPraeko(marca) {
  const c = marca?.publicacao?.praeko || {};
  const via = c.instagram?.via ?? "buffer", modo = c.tiktok?.modo ?? "rascunho";
  if (!["buffer", "meta"].includes(via)) throw new Error(`publicacao.praeko.instagram.via inválido: "${via}" (use "buffer" ou "meta")`);
  if (!["rascunho", "direto"].includes(modo)) throw new Error(`publicacao.praeko.tiktok.modo inválido: "${modo}" (use "rascunho" ou "direto")`);
  return { ...c, url: c.url || URL_PADRAO, instagram: { ...(c.instagram || {}), via }, tiktok: { ...(c.tiktok || {}), modo } };
}

/** Menor antecedência aceita pelo servidor para o item de uma rede (minutos): Instagram pela Meta 25, os demais 5. */
export const antecedenciaMin = (rede, cfg) => (rede === "instagram" && cfg.instagram.via === "meta" ? 25 : 5);

/**
 * Corpo do `POST /v1/posts` (contrato em inglês). `midia`: { video, capa } ids de mídia já enviada; `midiaRede`: { instagram: { video } } (cópia só desse item).
 * `quando`: { youtube, instagram, tiktok } em ISO UTC (viram ISO com o fuso `fuso`). `id` determinístico (o slug do episódio).
 */
export function montarPost({ marca, ep, id, midia, midiaRede = {}, redes, quando, fuso = "-03:00" }) {
  const cfg = configPraeko(marca), t = textosPorRede({ marca, ep });
  const texts = {};
  for (const r of redes) {
    if (!REDES_PRAEKO.includes(r)) throw new Error(`rede desconhecida: ${r}`);
    texts[r] = { ...(t[r].titulo ? { title: t[r].titulo } : {}), text: t[r].texto, ...(t[r].comentarioFixo ? { pinnedComment: t[r].comentarioFixo } : {}) };
  }
  const items = redes.map((r) => {
    if (!quando[r]) throw new Error(`sem horário para ${r}`);
    const item = { network: r, scheduledFor: isoComFuso(quando[r], fuso) };
    if (cfg.canais?.[r]) item.channel = cfg.canais[r];
    if (r === "youtube") item.mode = "scheduled"; // o Praeko sobe privado e agenda no YouTube
    if (r === "instagram") item.via = cfg.instagram.via;
    if (r === "tiktok") item.mode = cfg.tiktok.modo === "direto" ? "direct" : "draft";
    if (midiaRede[r]) item.media = midiaRede[r];
    return item;
  });
  const tt = redes.includes("tiktok") && cfg.tiktok.modo === "direto" ? { privacy: cfg.tiktok.privacidade || "SELF_ONLY", ...(cfg.tiktok.quadroMs != null ? { coverFrameMs: cfg.tiktok.quadroMs } : {}) } : null;
  return {
    id, title: ep.titulo,
    media: { video: midia.video, ...(midia.capa ? { cover: midia.capa } : {}) },
    texts, items,
    options: { format: ep.formato === "longo" ? "long" : "short", ...(tt ? { tiktok: tt } : {}) },
  };
}

/** Rótulos em português dos estados de um item/post do Praeko. */
export const ESTADO = { draft: "rascunho", scheduled: "agendado", sent: "enviado", private: "enviado privado (aguardando você)", error: "ERRO", canceled: "cancelado", queued: "na fila" };
/** Estados em que o item ainda não saiu (o cancelamento ainda pega). */
export const PENDENTE = new Set(["scheduled", "draft", "queued"]);

// Provedor do Mastodon (docs/mastodon.md), versão SEM Node: fetch e o que entra por `ctx` (mesmo molde do bluesky-api.ts).
//   ctx.fetchFn                    fetch
//   ctx.segredos.obter             `mastodon/sessao` (JSON: domínio da instância, access token, conta)
//   ctx.midia.abrir(ref)           { tamanho, mime, ler(inicio, n) }
//   ctx.deps.{agora,dormir}        dublês de teste
// O Praeko agenda (NÃO usa `scheduled_at` da instância): publica na hora marcada. Fase 1 a 3 e apagar: texto, imagens com alt e `DELETE`. Vídeo NÃO entra (fase 4).
// Erros: todo erro vira Error com `status` (HTTP a devolver) e `codigo` estável (mastodon_*). Nunca um 500 genérico. O token nunca vai para log nem mensagem.
import { falha, lerInstancia, normalizarDominio, urlDaInstancia, urlPublicaOuNula, type Limites } from "./mastodon-oauth.ts";
export { falha };
export const nome = "mastodon";
export const rede = "mastodon";
export const imediato = true; // sem horário ("Agora" no compositor) publica já; com `quando` o Praeko espera a hora marcada e publica

export const REF_SESSAO = "mastodon/sessao";
export const VISIBILIDADES = ["public", "unlisted", "private", "direct"] as const;
export type Visibilidade = (typeof VISIBILIDADES)[number];
const PASSOS_MIDIA = { esperaMs: 1500, tentativas: 20 };
const dormirPadrao = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const deps = (ctx: any) => ({ ...(ctx.deps || {}), dormir: ctx.deps?.dormir || dormirPadrao, agora: ctx.deps?.agora || (() => Date.now()) });

export type Sessao = { dominio: string; accessToken: string; scope: string; accountId: string; username: string; acct: string; url: string | null; avatar?: string | null };
export const registroSessao = (s: Sessao) => JSON.stringify(s);
async function lerSessao(ctx: any): Promise<Sessao> {
  const bruto = await ctx.segredos.obter(REF_SESSAO);
  if (!bruto) throw falha(401, "mastodon_reconnect_required", "Mastodon não conectado: conecte a conta em Canais");
  const s = JSON.parse(bruto) as Sessao;
  s.dominio = normalizarDominio(s.dominio); // o domínio vem do D1, mas passa pela mesma regra de sempre (SSRF)
  return s;
}

// ---------- texto ----------
const URL_RE = /https?:\/\/[^\s]+/gi;
/** Tamanho do texto como o Mastodon conta: caracteres Unicode (code points), cada link vale `caracteresPorUrl` (23 por padrão) e `@usuario@dominio` vale só `@usuario`. */
export function contarCaracteres(texto: string, caracteresPorUrl = 23): number {
  let t = texto.replace(URL_RE, (m) => { const final = /[.,;:!?'"”’)\]}>]+$/.exec(m)?.[0] ?? ""; return "x".repeat(caracteresPorUrl) + final; });
  t = t.replace(/(^|[^\w/])(@[\w.-]+)@[\w.-]+\.[a-z]{2,}/gi, "$1$2"); // menção remota: só o nome conta
  return Array.from(t).length;
}
export function problemasTexto(texto: string, lim: Pick<Limites, "maxCaracteres" | "caracteresPorUrl">): { codigo: string; mensagem: string }[] {
  const n = contarCaracteres(texto, lim.caracteresPorUrl);
  return n > lim.maxCaracteres ? [{ codigo: "mastodon_text_too_long", mensagem: `o texto passa do limite da instância: ${n} de ${lim.maxCaracteres} caracteres (cada link conta ${lim.caracteresPorUrl})` }] : [];
}
/** Opções do destino (aceita os nomes em inglês e em português): visibilidade (padrão `public`), aviso de conteúdo (`spoiler_text`), sensível e idioma ISO 639-1. 422 com código estável se inválida. */
export function opcoesMastodon(o: any): { visibility: Visibilidade; spoilerText: string | null; sensitive: boolean; language: string | null } {
  const op = o || {}, vis = String(op.visibility ?? op.visibilidade ?? "public").toLowerCase();
  if (!(VISIBILIDADES as readonly string[]).includes(vis)) throw falha(422, "mastodon_invalid_option", `visibilidade "${vis.slice(0, 20)}" inválida (use ${VISIBILIDADES.join(", ")})`);
  const sp = op.spoilerText ?? op.spoiler_text ?? op.aviso ?? null;
  if (sp != null && (typeof sp !== "string" || sp.length > 500)) throw falha(422, "mastodon_invalid_option", "o aviso de conteúdo (spoilerText) precisa ser um texto de até 500 caracteres");
  const sens = op.sensitive ?? op.sensivel ?? false;
  if (typeof sens !== "boolean") throw falha(422, "mastodon_invalid_option", "sensitive precisa ser true ou false");
  const idioma = op.language ?? op.idioma ?? null;
  if (idioma != null && (typeof idioma !== "string" || !/^[A-Za-z]{2}(?:[-_][A-Za-z0-9]{2,8})?$/.test(idioma))) throw falha(422, "mastodon_invalid_option", "language precisa ser um código ISO 639-1 (ex.: pt, en)");
  return { visibility: vis as Visibilidade, spoilerText: sp ? String(sp).trim() || null : null, sensitive: !!sens, language: idioma ? String(idioma).slice(0, 2).toLowerCase() : null };
}

// ---------- erros da instância ----------
/** Erro HTTP da instância -> erro tipado. A mensagem da instância é cortada e nunca leva o token. */
export function erroDaApi(status: number, corpo: string, headers?: Headers | null) {
  let j: any = null; try { j = JSON.parse(corpo); } catch { /* não é JSON */ }
  const msg = String(j?.error || corpo || "").slice(0, 200);
  if (status === 429) {
    const ra = Number(headers?.get("retry-after")), reset = Date.parse(headers?.get("x-ratelimit-reset") || ""), seg = ra > 0 ? ra : Number.isFinite(reset) ? Math.max(1, Math.ceil((reset - Date.now()) / 1000)) : null;
    return falha(429, "mastodon_rate_limited", `a instância limitou o uso (429); tente de novo${seg ? ` em ${seg} s` : " mais tarde"}`, { retryAfter: seg });
  }
  if (status === 401) return falha(401, "mastodon_reconnect_required", "a instância recusou o token (401): o acesso foi revogado ou venceu; reconecte a conta em Canais");
  if (status === 403) return falha(403, "mastodon_forbidden", `a instância negou (403): ${msg}`);
  if (status === 404 || status === 410) return falha(404, "mastodon_not_found", `a instância não achou o recurso (${status}): ${msg}`);
  if (status === 413) return falha(413, "mastodon_payload_too_large", `a instância recusou o tamanho do envio (413): ${msg}`);
  if (status === 422 || status === 400) return falha(422, "mastodon_invalid_request", `a instância recusou o pedido (${status}): ${msg}`);
  return falha(502, "mastodon_error", `Mastodon ${status}: ${msg}`, { transitorio: status >= 500 });
}

/** Chamada autenticada à instância (sem seguir redirecionamento: o token não vai para outro host). Devolve { status, headers, texto, ok }. */
async function chamar(ctx: any, s: Sessao, caminho: string, init: RequestInit = {}, { tempoMs = 20000 }: { tempoMs?: number } = {}) {
  const url = urlDaInstancia(s.dominio, caminho).href, ac = new AbortController(), t = setTimeout(() => ac.abort(), tempoMs);
  try {
    const r = await ctx.fetchFn(url, { ...init, redirect: "manual", signal: ac.signal, headers: { accept: "application/json", authorization: `Bearer ${s.accessToken}`, ...(init.headers || {}) } });
    if (r.status >= 300 && r.status < 400) throw falha(502, "mastodon_error", `a instância ${s.dominio} respondeu com redirecionamento (${r.status}): não sigo redirecionamentos com o token`);
    return { status: r.status as number, headers: r.headers as Headers, texto: (await r.text()) as string, ok: r.ok as boolean };
  } catch (e) {
    if (e?.codigo) throw e;
    throw falha(502, "mastodon_error", e?.name === "AbortError" ? `tempo esgotado falando com ${s.dominio}` : `não consegui falar com ${s.dominio}`, { transitorio: true });
  } finally { clearTimeout(t); }
}
const corpoJson = (r: { texto: string }, o: string): any => { try { return r.texto ? JSON.parse(r.texto) : {}; } catch { throw falha(502, "mastodon_error", `resposta inesperada da instância em ${o}`); } };

/** Status do canal: lê a conta (verify_credentials). Também devolve nome e avatar atuais. */
export async function status({ ctx }: any) {
  let s: Sessao;
  try { s = await lerSessao(ctx); } catch { return { conectado: false, detalhe: "não conectado" }; }
  try {
    const r = await chamar(ctx, s, "/api/v1/accounts/verify_credentials");
    if (!r.ok) throw erroDaApi(r.status, r.texto, r.headers);
    const j = corpoJson(r, "verify_credentials");
    return { conectado: true, detalhe: `@${j.username || s.username}@${s.dominio}`, canalId: `${j.id || s.accountId}@${s.dominio}`, nome: j.display_name || null, avatar: urlPublicaOuNula(j.avatar) };
  } catch (e) { return { conectado: false, detalhe: e.codigo === "mastodon_reconnect_required" ? "reconectar" : e.message, ...(e.codigo ? { codigo: e.codigo } : {}) }; }
}

// ---------- mídia ----------
const lerTudo = async (f: any) => { const x = await f.ler(0, f.tamanho); return x instanceof Uint8Array ? x : new Uint8Array(x); };
/** Valida as imagens SEM baixar o arquivo (tamanho e mime já vêm da mídia) contra os limites DA INSTÂNCIA. 422 com código estável. */
export function validarImagens(imagens: { tamanho: number; mime: string | null; alt?: string | null }[], lim: Limites) {
  if (imagens.length > lim.maxMidias) throw falha(422, "mastodon_too_many_images", `esta instância aceita até ${lim.maxMidias} imagens por post (${imagens.length} enviadas)`);
  imagens.forEach((im, n) => {
    if (im.tamanho > lim.imagemBytes) throw falha(422, "mastodon_image_too_large", `a imagem ${n + 1} passa do limite da instância (${im.tamanho} de ${lim.imagemBytes} bytes): o Praeko não converte imagem; envie uma menor`);
    if (im.mime && !lim.mimesImagem.includes(im.mime)) throw falha(422, "mastodon_image_type", `a imagem ${n + 1} é ${im.mime}: a instância aceita ${lim.mimesImagem.map((m) => m.replace("image/", "")).join(", ")}`);
    if (im.alt && im.alt.length > lim.descricaoMax) throw falha(422, "mastodon_alt_too_long", `o texto alternativo da imagem ${n + 1} passa de ${lim.descricaoMax} caracteres (limite da instância)`);
  });
}
/** POST /api/v2/media (multipart: file + description). 200 = pronta; 202 = processando (url nula): espera em GET /api/v1/media/:id (206 = ainda não). Devolve o id da mídia. */
export async function enviarMidia(ctx: any, s: Sessao, bytes: Uint8Array, mime: string, alt: string, nomeArquivo: string): Promise<string> {
  const d = deps(ctx), form = new FormData();
  form.append("file", new Blob([bytes as any], { type: mime }), nomeArquivo);
  if (alt) form.append("description", alt);
  const r = await chamar(ctx, s, "/api/v2/media", { method: "POST", body: form }, { tempoMs: 90000 });
  if (!r.ok) throw erroDaApi(r.status, r.texto, r.headers);
  const j = corpoJson(r, "media");
  if (!j.id) throw falha(502, "mastodon_error", "a instância não devolveu o id da mídia");
  if (r.status === 202 || !j.url) {
    for (let i = 0; i < PASSOS_MIDIA.tentativas; i++) {
      await d.dormir(PASSOS_MIDIA.esperaMs);
      const p = await chamar(ctx, s, `/api/v1/media/${encodeURIComponent(String(j.id))}`);
      if (p.status === 200) return String(j.id);
      if (p.status !== 206) throw erroDaApi(p.status, p.texto, p.headers);
    }
    throw falha(504, "mastodon_media_timeout", "a instância demorou demais para processar a imagem");
  }
  return String(j.id);
}

// ---------- publicar ----------
/** Chave de idempotência: uma por destino (a instância a guarda por até 1 hora; retentativas do Workflow não duplicam). */
const chaveIdem = (item: any) => (item.destinoId ? `praeko-${String(item.destinoId).slice(0, 80)}` : null);
export async function publicar({ item, ctx }: any) {
  if (item.acao === "apagar") return apagar({ item, ctx });
  if (item.kind === "video" || (item.video && !item.images?.length)) throw falha(422, "rede_nao_suporta_kind", "mastodon: vídeo ainda não é suportado (só texto e imagens)");
  const texto = String(item.textos?.texto ?? "").trim();
  if (!texto && !item.images?.length) throw falha(422, "mastodon_empty_post", "o post do Mastodon precisa de texto ou imagem");
  const op = opcoesMastodon(item.opcoes), s = await lerSessao(ctx), inst = await lerInstancia(ctx.fetchFn, s.dominio, deps(ctx).agora()), lim = inst.limites; // limites vigentes AGORA (a instância pode mudar)
  const prob = problemasTexto(texto, lim); if (prob[0]) throw falha(422, prob[0].codigo, prob[0].mensagem);
  const mediaIds: string[] = [];
  if (item.images?.length) {
    const abertas = [];
    for (const im of item.images) abertas.push({ f: await ctx.midia.abrir(im.midia), alt: String(im.alt || "") });
    try {
      validarImagens(abertas.map((x) => ({ tamanho: x.f.tamanho, mime: x.f.mime, alt: x.alt })), lim);
      for (const [n, { f, alt }] of abertas.entries()) {
        const bytes = await lerTudo(f), mime = f.mime || (bytes[0] === 0x89 ? "image/png" : "image/jpeg");
        mediaIds.push(await enviarMidia(ctx, s, bytes, mime, alt, `imagem-${n + 1}.${mime.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "jpg"}`));
      }
    } finally { for (const x of abertas) x.f.fechar?.(); }
  }
  const corpo: Record<string, unknown> = { status: texto, visibility: op.visibility, ...(mediaIds.length ? { media_ids: mediaIds } : {}), ...(op.spoilerText ? { spoiler_text: op.spoilerText } : {}), ...((op.sensitive || (op.spoilerText && mediaIds.length)) ? { sensitive: true } : {}), ...(op.language ? { language: op.language } : {}) };
  const chave = chaveIdem(item);
  const r = await chamar(ctx, s, "/api/v1/statuses", { method: "POST", headers: { "content-type": "application/json", ...(chave ? { "idempotency-key": chave } : {}) }, body: JSON.stringify(corpo) });
  if (!r.ok) throw erroDaApi(r.status, r.texto, r.headers);
  const j = corpoJson(r, "statuses");
  if (!j.id) throw falha(502, "mastodon_error", "a instância não devolveu o id do status");
  return { id: String(j.id), url: typeof j.url === "string" ? j.url : null, uri: j.uri || null, visibility: j.visibility || op.visibility, instance: s.dominio };
}

/** Apaga um status JÁ PUBLICADO (`DELETE /api/v1/statuses/:id`, só da própria conta). `item.id`/`item.idExterno`/`item.uri` = id do status. Já ausente (404/410) conta como apagado. */
export async function apagar({ item, ctx }: any) {
  const s = await lerSessao(ctx), id = String(item.id || item.idExterno || item.uri || "");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw falha(422, "mastodon_invalid_request", "o id do status é inválido");
  const r = await chamar(ctx, s, `/api/v1/statuses/${id}`, { method: "DELETE" });
  if (r.status === 404 || r.status === 410) return { apagado: true, id, jaAusente: true };
  if (!r.ok) throw erroDaApi(r.status, r.texto, r.headers);
  return { apagado: true, id };
}

export async function planejar({ item }: any) {
  const t = String(item.textos?.texto ?? ""), op = (() => { try { return opcoesMastodon(item.opcoes); } catch { return null; } })();
  return [`text: ${contarCaracteres(t)} characters (limit read from the instance when posting)`, `media: ${item.images?.length ? `${item.images.length} image(s)` : "none"}`, `visibility: ${op?.visibility ?? "invalid"}`];
}
export { normalizarDominio };

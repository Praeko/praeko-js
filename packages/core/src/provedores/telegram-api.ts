// Provedor do Telegram (docs/telegram.md): canais e grupos onde o BOT do dono é administrador, pela Bot API oficial (https://core.telegram.org/bots/api).
// Sem OAuth: o dono cria o bot no @BotFather e cola o token. Versão SEM Node: fetch e o que entra por `ctx` (mesmo molde do mastodon-api.ts).
//   ctx.fetchFn                    fetch
//   ctx.segredos.obter             `telegram/sessao` (JSON cifrado: token do bot, chat, bot)
//   ctx.midia.abrir(ref)           { tamanho, mime, ler(inicio, n) }
// O Praeko agenda (o Telegram NÃO agenda por bot): publica na hora marcada. Texto puro (sem parse_mode: nada para escapar).
// Erros: todo erro vira Error com `status` e `codigo` estável (telegram_*), mensagem em inglês. O TOKEN NUNCA vai para log, erro nem resposta: o token está na URL
// (`/bot<token>/método`, exigência da API), então nenhuma mensagem leva a URL e tudo passa por `mascarar`.
export const nome = "telegram";
export const rede = "telegram";
export const imediato = true; // sem horário ("Agora" no compositor) publica já; com `quando` o Praeko espera a hora marcada e publica
export const REF_SESSAO = "telegram/sessao";
const BASE = "https://api.telegram.org";

/** Limites da Bot API (docs/telegram.md, validado em https://core.telegram.org/bots/api em 22/11/2026). */
export const LIMITES = {
  texto: 4096, // sendMessage: 1-4096 caracteres
  legenda: 1024, // sendPhoto/sendVideo/InputMedia*: 0-1024 caracteres
  bytesFoto: 10 * 1024 * 1024, // upload multipart: 10 MB para foto
  bytesVideo: 50 * 1024 * 1024, // upload multipart: 50 MB para os outros arquivos (bot na nuvem)
  albumMin: 2, albumMax: 10, // sendMediaGroup
  janelaApagarMs: 48 * 3600e3, // deleteMessage: só mensagens com menos de 48 h
} as const;

export type Sessao = { token: string; chatId: string; tipo: string; titulo: string; username: string | null; botId: number; botUsername: string | null };
export const registroSessao = (s: Sessao) => JSON.stringify(s);

export const falha = (status: number, codigo: string, mensagem: string, extra: Record<string, unknown> = {}): Error & { status: number; codigo: string; [k: string]: any } =>
  Object.assign(new Error(mascarar(mensagem)), { status, codigo, ...extra });

// ---------- token e chat ----------
const TOKEN_RE = /\b\d{5,}:[A-Za-z0-9_-]{30,}\b/g;
/** Troca qualquer coisa com cara de token de bot por `***`: última barreira antes de uma mensagem sair. */
export const mascarar = (s: unknown): string => String(s ?? "").replace(TOKEN_RE, "***").replace(/\/bot[^/\s"']+\//g, "/bot***/");
/** `123456:ABC...` -> `123456:***` (para mostrar ao dono sem expor). */
export const tokenMascarado = (t: string): string => `${String(t).split(":")[0]}:***`;
/** O token do BotFather: número, dois-pontos e 30+ caracteres de [A-Za-z0-9_-]. Devolve o token limpo ou lança (422, sem repetir o valor na mensagem). */
export function normalizarToken(bruto: unknown): string {
  const t = typeof bruto === "string" ? bruto.trim() : "";
  if (!/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(t) || t.length > 120) throw falha(422, "telegram_invalid_token", "the bot token has the wrong format (it looks like 123456789:AA...; copy it from @BotFather)");
  return t;
}
/** O canal: `@canal`, `canal`, `t.me/canal`, `https://t.me/canal` ou o id numérico (`-1001234567890`). Link de convite (t.me/+...) e links `t.me/c/...` não servem. Devolve o `chat_id` da API. */
export function normalizarChat(bruto: unknown): string {
  let c = typeof bruto === "string" ? bruto.trim() : typeof bruto === "number" ? String(bruto) : "";
  if (!c || c.length > 200) throw falha(422, "telegram_invalid_chat", "enter the channel @username (or its numeric id)");
  const link = /^(?:https?:\/\/)?(?:www\.)?(?:t|telegram)\.me\/([^/?#\s]+)\/?$/i.exec(c);
  if (link) c = link[1]!;
  if (/^-?\d{5,20}$/.test(c)) return c;
  c = c.replace(/^@+/, "");
  if (c.startsWith("+") || /^joinchat$/i.test(c) || !/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(c)) throw falha(422, "telegram_invalid_chat", "invalid channel: use the public @username or the numeric id (invite links do not work)");
  return `@${c}`;
}

// ---------- erros da API ----------
/** Erro da Bot API -> erro tipado (mensagem em inglês, sem token). `corpo` = o JSON da resposta (`ok:false`, `error_code`, `description`, `parameters.retry_after`). */
export function erroDaApi(status: number, corpo: string) {
  let j: any = null; try { j = JSON.parse(corpo); } catch { /* não é JSON */ }
  const cod = Number(j?.error_code) || status, desc = mascarar(String(j?.description ?? corpo ?? "")).slice(0, 200), baixa = desc.toLowerCase();
  if (cod === 429) { const seg = Number(j?.parameters?.retry_after) || null; return falha(429, "telegram_rate_limited", `Telegram limited the bot (429); try again${seg ? ` in ${seg} s` : " later"}`, { retryAfter: seg }); }
  if (cod === 401) return falha(401, "telegram_reconnect_required", "Telegram refused the bot token (401): the token was revoked or changed; reconnect the channel");
  if (cod === 403) return falha(403, "telegram_forbidden", `Telegram denied the action (403): ${desc}. The bot was probably removed from the channel or lost the permission to post; reconnect after fixing it`);
  if (/chat not found/.test(baixa)) return falha(404, "telegram_chat_not_found", "Telegram could not find the chat: check the @username and that the bot was added as an administrator");
  if (/message to delete not found|message can't be deleted for everyone|message to delete/.test(baixa)) return falha(cod === 400 ? 404 : cod, "telegram_message_not_found", `Telegram could not delete the message: ${desc}`);
  if (/too long/.test(baixa)) return falha(422, /caption/.test(baixa) ? "telegram_caption_too_long" : "telegram_text_too_long", `Telegram refused the text length: ${desc}`);
  if (cod === 413 || /too big|too large|file is too/.test(baixa)) return falha(413, "telegram_payload_too_large", `Telegram refused the file size: ${desc}`);
  if (cod === 400) return falha(422, "telegram_invalid_request", `Telegram refused the request (400): ${desc}`);
  return falha(502, "telegram_error", `Telegram ${cod}: ${desc}`, { transitorio: cod >= 500 });
}

/** Chamada à Bot API (sem seguir redirecionamento). `corpo`: objeto (vira JSON) ou FormData (upload). Devolve o `result`; erro da API vira exceção. A URL (que leva o token) nunca entra em mensagem. */
async function chamar(fetchFn: typeof fetch, token: string, metodo: string, corpo?: Record<string, unknown> | FormData, { tempoMs = 25000 }: { tempoMs?: number } = {}): Promise<any> {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), tempoMs);
  try {
    const init: RequestInit = { method: "POST", redirect: "manual", signal: ac.signal, headers: { accept: "application/json" } };
    if (corpo instanceof FormData) init.body = corpo; else if (corpo) { init.body = JSON.stringify(corpo); (init.headers as Record<string, string>)["content-type"] = "application/json"; }
    const r = await fetchFn(`${BASE}/bot${token}/${metodo}`, init), texto = await r.text();
    if (r.status >= 300 && r.status < 400) throw falha(502, "telegram_error", `Telegram answered with a redirect (${r.status}); not followed`);
    let j: any = null; try { j = JSON.parse(texto); } catch { /* resposta fora do formato */ }
    if (!r.ok || !j?.ok) throw erroDaApi(r.status, texto);
    return j.result;
  } catch (e: any) {
    if (e?.codigo) throw e;
    throw falha(502, "telegram_error", e?.name === "AbortError" ? "timed out talking to Telegram" : "could not reach Telegram", { transitorio: true, incerto: true });
  } finally { clearTimeout(t); }
}

// ---------- conexão ----------
export type Verificado = { sessao: Sessao; nomeBot: string | null; temFoto: boolean };
/** Valida o token e o canal: getMe (é bot) + getChat (canal/supergrupo/grupo) + getChatMember (o bot é admin e, em canal, pode postar). Devolve a sessão a guardar. */
export async function conectar(fetchFn: typeof fetch, { token: t, chat: c }: { token: unknown; chat: unknown }): Promise<Verificado> {
  const token = normalizarToken(t), alvo = normalizarChat(c);
  const bot = await chamar(fetchFn, token, "getMe");
  if (!bot?.is_bot || !bot.id) throw falha(422, "telegram_invalid_token", "this token does not belong to a bot");
  const chat = await chamar(fetchFn, token, "getChat", { chat_id: alvo });
  if (!chat?.id || !["channel", "supergroup", "group"].includes(chat.type)) throw falha(422, "telegram_unsupported_chat", "only channels and groups are supported (not private chats)");
  const m = await chamar(fetchFn, token, "getChatMember", { chat_id: chat.id, user_id: bot.id });
  if (m?.status !== "administrator" && m?.status !== "creator") throw falha(422, "telegram_bot_not_admin", "the bot is not an administrator of this chat: add it as an administrator first");
  if (chat.type === "channel" && m.status === "administrator" && m.can_post_messages !== true) throw falha(422, "telegram_cannot_post", "the bot is an administrator but is missing the permission to post messages in this channel");
  const username = chat.username ? String(chat.username) : null;
  return { sessao: { token, chatId: String(chat.id), tipo: String(chat.type), titulo: String(chat.title || username || chat.id).slice(0, 120), username, botId: Number(bot.id), botUsername: bot.username ? String(bot.username) : null }, nomeBot: bot.first_name ? String(bot.first_name) : null, temFoto: !!chat.photo?.small_file_id };
}

async function lerSessao(ctx: any): Promise<Sessao> {
  const bruto = await ctx.segredos.obter(REF_SESSAO);
  if (!bruto) throw falha(401, "telegram_reconnect_required", "Telegram is not connected: connect the channel in Channels");
  return JSON.parse(bruto) as Sessao;
}
/** O nome mostrado: título do chat. */
export const nomeDoCanal = (s: Pick<Sessao, "titulo" | "username">): string => s.titulo || (s.username ? `@${s.username}` : "Telegram");

/** Status do canal (nada que publique): confere que o bot ainda é admin e pode postar. */
export async function status({ ctx }: any) {
  let s: Sessao;
  try { s = await lerSessao(ctx); } catch { return { conectado: false, detalhe: "não conectado" }; }
  try {
    const m = await chamar(ctx.fetchFn, s.token, "getChatMember", { chat_id: s.chatId, user_id: s.botId });
    if (m?.status !== "administrator" && m?.status !== "creator") return { conectado: false, detalhe: "reconectar", codigo: "telegram_bot_not_admin" };
    if (s.tipo === "channel" && m.status === "administrator" && m.can_post_messages !== true) return { conectado: false, detalhe: "reconectar", codigo: "telegram_cannot_post" };
    return { conectado: true, detalhe: s.username ? `@${s.username}` : s.titulo, canalId: s.chatId, nome: nomeDoCanal(s) };
  } catch (e: any) { return { conectado: false, detalhe: ["telegram_reconnect_required", "telegram_forbidden", "telegram_chat_not_found"].includes(e.codigo) ? "reconectar" : mascarar(e.message), ...(e.codigo ? { codigo: e.codigo } : {}) }; }
}

/** Foto do chat (160x160) para o avatar: getChat -> getFile -> download. O link do arquivo leva o token, então a imagem é baixada AQUI e nunca exposta. `null` se não tem foto. */
export async function fotoDoChat({ ctx }: any): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const s = await lerSessao(ctx), chat = await chamar(ctx.fetchFn, s.token, "getChat", { chat_id: s.chatId }), id = chat?.photo?.small_file_id;
  if (!id) return null;
  const arq = await chamar(ctx.fetchFn, s.token, "getFile", { file_id: id });
  if (!arq?.file_path || !/^[A-Za-z0-9_./-]{1,200}$/.test(String(arq.file_path)) || String(arq.file_path).includes("..")) return null;
  const r = await ctx.fetchFn(`${BASE}/file/bot${s.token}/${arq.file_path}`, { redirect: "manual" });
  if (!r.ok) return null;
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) return null;
  return { bytes, mime: (r.headers.get("content-type") || "image/jpeg").split(";")[0]!.trim() };
}

// ---------- validação (sem baixar nada: tamanho e mime já vêm da mídia) ----------
/** Tamanho do texto contado em unidades UTF-16 (conservador: a API não diz como conta; o painel e o servidor usam a mesma regra). */
export const contarCaracteres = (texto: string): number => texto.length;
/** O limite que vale: 4096 sem mídia, 1024 (legenda) com foto ou vídeo. */
export const limiteDoTexto = (comMidia: boolean): number => (comMidia ? LIMITES.legenda : LIMITES.texto);
export function problemasTexto(texto: string, comMidia: boolean): { codigo: string; mensagem: string }[] {
  const n = contarCaracteres(texto), max = limiteDoTexto(comMidia);
  if (n <= max) return [];
  return [comMidia
    ? { codigo: "telegram_caption_too_long", mensagem: `the caption is over the Telegram limit: ${n} of ${max} characters (text posts allow ${LIMITES.texto})` }
    : { codigo: "telegram_text_too_long", mensagem: `the text is over the Telegram limit: ${n} of ${max} characters` }];
}
export function validarImagens(imagens: { tamanho: number; mime: string | null }[]) {
  if (imagens.length > LIMITES.albumMax) throw falha(422, "telegram_too_many_images", `Telegram albums take up to ${LIMITES.albumMax} items (${imagens.length} sent)`);
  imagens.forEach((im, n) => {
    if (im.tamanho > LIMITES.bytesFoto) throw falha(422, "telegram_image_too_large", `image ${n + 1} is over the 10 MB limit for bot photo uploads (${im.tamanho} bytes); Praeko does not convert images`);
    if (im.mime && !im.mime.startsWith("image/")) throw falha(422, "telegram_image_type", `image ${n + 1} is ${im.mime}, not an image`);
  });
}
export function validarVideo(v: { tamanho: number | null; mime: string | null }) {
  if (v.tamanho && v.tamanho > LIMITES.bytesVideo) throw falha(422, "telegram_video_too_large", `the video is over the 50 MB limit for bots (${v.tamanho} bytes): Telegram bots cannot upload larger files. Use a smaller video or another network`);
  if (v.mime && v.mime !== "video/mp4") throw falha(422, "telegram_video_type", `the video is ${v.mime}; Telegram clients support MPEG4 (mp4) videos`);
}

// ---------- mídia ----------
/** Lê o arquivo em fatias de 8 MiB e monta o Blob SEM juntar tudo num buffer só (menos memória no Worker). */
async function blobDe(f: any, mime: string): Promise<Blob> {
  const partes: Uint8Array[] = [];
  for (let pos = 0; pos < f.tamanho; pos += 8 * 1024 * 1024) { const x = await f.ler(pos, Math.min(8 * 1024 * 1024, f.tamanho - pos)); partes.push(x instanceof Uint8Array ? x : new Uint8Array(x)); }
  return new Blob(partes as any[], { type: mime });
}
const extDe = (mime: string, padrao: string) => mime.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || padrao;

// ---------- publicar ----------
const ids = (r: any): string[] => (Array.isArray(r) ? r : [r]).map((m) => String(m?.message_id ?? "")).filter(Boolean);
/** Link da mensagem: canal com @username -> t.me/username/id; sem username (id -100...) -> t.me/c/<id>/<msg> (abre para quem é membro). */
export function urlDaMensagem(s: Pick<Sessao, "username" | "chatId">, messageId: string): string | null {
  if (s.username) return `https://t.me/${s.username}/${messageId}`;
  const m = /^-100(\d+)$/.exec(s.chatId);
  return m ? `https://t.me/c/${m[1]}/${messageId}` : null;
}
/**
 * Publica texto, foto, álbum (2 a 10 fotos) ou vídeo. O `id` devolvido é o message_id (álbum: os ids separados por vírgula, na ordem). O Telegram NÃO tem chave de idempotência:
 * por isso falha de rede/5xx depois do envio vem com `incerto: true` e o executor não repete (repetir poderia duplicar a mensagem); só o 429 (não enviou) pode esperar e repetir.
 */
export async function publicar({ item, ctx }: any) {
  if (item.acao === "apagar") return apagar({ item, ctx });
  const texto = String(item.textos?.texto ?? "").trim(), imagens: { midia: string }[] = item.images || [], temVideo = item.kind === "video" || (!!item.video && !imagens.length), temMidia = temVideo || imagens.length > 0;
  if (!texto && !temMidia) throw falha(422, "telegram_empty_post", "the Telegram post needs text, an image or a video");
  const prob = problemasTexto(texto, temMidia); if (prob[0]) throw falha(422, prob[0].codigo, prob[0].mensagem);
  const s = await lerSessao(ctx), f = ctx.fetchFn as typeof fetch, base = { chat_id: s.chatId };
  let resultado: any;
  if (!temMidia) resultado = await chamar(f, s.token, "sendMessage", { ...base, text: texto });
  else if (temVideo) {
    const v = await ctx.midia.abrir(item.video);
    try {
      validarVideo({ tamanho: v.tamanho, mime: v.mime });
      const form = new FormData(); form.append("chat_id", s.chatId); form.append("supports_streaming", "true"); if (texto) form.append("caption", texto);
      form.append("video", await blobDe(v, "video/mp4"), `${String(item.slug || "video").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "video"}.mp4`);
      resultado = await chamar(f, s.token, "sendVideo", form, { tempoMs: 120000 });
    } finally { v.fechar?.(); }
  } else {
    const abertas: any[] = [];
    try {
      for (const im of imagens) abertas.push(await ctx.midia.abrir(im.midia));
      validarImagens(abertas.map((x) => ({ tamanho: x.tamanho, mime: x.mime })));
      if (abertas.length === 1) {
        const a = abertas[0], mime = a.mime || "image/jpeg", form = new FormData(); form.append("chat_id", s.chatId); if (texto) form.append("caption", texto);
        form.append("photo", await blobDe(a, mime), `imagem-1.${extDe(mime, "jpg")}`);
        resultado = await chamar(f, s.token, "sendPhoto", form, { tempoMs: 60000 });
      } else {
        const form = new FormData(), midias: any[] = []; form.append("chat_id", s.chatId);
        for (const [n, a] of abertas.entries()) {
          const mime = a.mime || "image/jpeg";
          midias.push({ type: "photo", media: `attach://f${n}`, ...(n === 0 && texto ? { caption: texto } : {}) }); // a legenda vai na primeira foto (é a que o Telegram mostra para o álbum)
          form.append(`f${n}`, await blobDe(a, mime), `imagem-${n + 1}.${extDe(mime, "jpg")}`);
        }
        form.append("media", JSON.stringify(midias));
        resultado = await chamar(f, s.token, "sendMediaGroup", form, { tempoMs: 120000 });
      }
    } finally { for (const x of abertas) x.fechar?.(); }
  }
  const m = ids(resultado);
  if (!m.length) throw falha(502, "telegram_error", "Telegram did not return the message id");
  return { id: m.join(","), url: urlDaMensagem(s, m[0]!), chat: s.chatId };
}

/** Apaga a(s) mensagem(ns) JÁ PUBLICADA(S) (`deleteMessage`, uma por id). Só vale em até 48 h do envio (regra da API). Já ausente conta como apagado; recusa vira `telegram_cannot_delete` com o motivo. */
export async function apagar({ item, ctx }: any) {
  const s = await lerSessao(ctx), lista = String(item.id || item.idExterno || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!lista.length || lista.some((x) => !/^\d{1,15}$/.test(x))) throw falha(422, "telegram_invalid_request", "the message id is invalid");
  let ausentes = 0;
  for (const id of lista) {
    try { await chamar(ctx.fetchFn, s.token, "deleteMessage", { chat_id: s.chatId, message_id: Number(id) }); }
    catch (e: any) {
      if (e.codigo === "telegram_message_not_found" && /not found/i.test(e.message)) { ausentes++; continue; }
      if (e.codigo === "telegram_message_not_found" || e.codigo === "telegram_invalid_request") throw falha(422, "telegram_cannot_delete", `Telegram would not delete message ${id}: it was probably sent more than 48 hours ago (the Bot API only deletes messages younger than 48 h). Delete it in the Telegram app. (${e.message})`);
      throw e;
    }
  }
  return { apagado: true, id: lista.join(","), ...(ausentes === lista.length ? { jaAusente: true } : {}) };
}

export async function planejar({ item }: any) {
  const t = String(item.textos?.texto ?? ""), midia = item.kind === "video" || item.video ? "1 video" : item.images?.length ? `${item.images.length} image(s)` : "none";
  return [`text: ${contarCaracteres(t)} characters (limit ${limiteDoTexto(midia !== "none")})`, `media: ${midia}`];
}

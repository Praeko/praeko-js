// Provedor direto do TikTok (Content Posting API). Escrito contra a documentação oficial (developers.tiktok.com), ainda SEM teste ao vivo.
//   modo "rascunho" (padrão): envia o vídeo para a caixa de entrada do app (/inbox/video/init/, escopo video.upload); o dono escolhe a capa,
//                             cola a legenda e publica no app. A API da caixa de entrada não recebe legenda nem capa.
//   modo "direto":            Direct Post (/video/init/, escopo video.publish). Sem auditoria do app o TikTok força SELF_ONLY (privado).
// O vídeo sobe por FILE_UPLOAD (PUT em partes no upload_url); PULL_FROM_URL exigiria domínio verificado e não é usado.
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

export const nome = "tiktok";
export const rede = "tiktok";
export const imediato = false; // sai na hora marcada (no rascunho, a hora marcada vira o aviso no app)

export const API = "https://open.tiktokapis.com";
export const AUTORIZAR = "https://www.tiktok.com/v2/auth/authorize/";
export const ESCOPOS = ["user.info.basic", "video.upload", "video.publish"];
const MB = 1024 * 1024;
export const LIMITES = { chunkMin: 5 * MB, chunkMax: 64 * MB, ultimoMax: 128 * MB, chunksMax: 1000, videoMax: 4 * 1024 * MB, titulo: 2200 };
const REF_CLIENTE = "tiktok/cliente", REF_TOKEN = "tiktok/token";

const ERROS: Record<string, any> = {
  unaudited_client_can_only_post_to_private_accounts: "o app do TikTok ainda não foi auditado: ele só pode postar em conta PRIVADA e como SELF_ONLY. Use o modo \"rascunho\" (padrão) ou torne a conta privada até a auditoria (developers.tiktok.com/application/content-posting-api).",
  spam_risk_too_many_pending_share: "o TikTok aceita no máximo 5 envios pendentes na caixa de entrada por 24 h; publique ou descarte algum rascunho no app.",
  spam_risk_too_many_posts: "limite diário de posts do TikTok atingido para esta conta (cerca de 15 por dia).",
  spam_risk_user_banned_from_posting: "esta conta está impedida de postar pelo TikTok.",
  reached_active_user_cap: "o app atingiu a cota diária de usuários ativos de publicação.",
  url_ownership_unverified: "o TikTok exige domínio verificado para PULL_FROM_URL (o Praeko usa FILE_UPLOAD; isto não deveria ocorrer).",
  privacy_level_option_mismatch: "a privacidade pedida não está entre as opções da conta (privacy_level_options).",
  access_token_invalid: "token do TikTok inválido ou expirado: rode `praeko conta tiktok conectar` de novo.",
  scope_not_authorized: "falta autorizar o escopo necessário (video.upload para rascunho, video.publish para direto): rode `praeko conta tiktok conectar` e aceite todos.",
  rate_limit_exceeded: "limite de requisições do TikTok; tente de novo em um minuto.",
};
export const mensagemErro = (cod: any, msg: any) => ERROS[cod] ? `${ERROS[cod]} [${cod}]` : `TikTok recusou: ${cod}${msg ? ` (${msg})` : ""}`;

// ---------- utilidades puras ----------
/** Plano de partes do FILE_UPLOAD (regras da doc: 5–64 MB, última até 128 MB, <5 MB em uma parte, total = floor(tamanho/parte)). */
export function planoChunks(tamanho: any, chunkPreferido = 10 * MB) {
  if (!(tamanho > 0)) throw new Error("vídeo vazio");
  if (tamanho > LIMITES.videoMax) throw new Error(`vídeo de ${(tamanho / MB).toFixed(0)} MB passa de 4 GB`);
  let chunk = Math.min(LIMITES.chunkMax, Math.max(LIMITES.chunkMin, chunkPreferido));
  if (tamanho < LIMITES.chunkMin || tamanho <= chunk) chunk = tamanho; // uma parte só
  const total = Math.floor(tamanho / chunk);
  if (total < 1 || total > LIMITES.chunksMax) throw new Error(`plano de partes inválido (${total} partes)`);
  const partes = [];
  for (let i = 0; i < total; i++) {
    const a = i * chunk, b = i === total - 1 ? tamanho - 1 : a + chunk - 1; // a última absorve o resto
    partes.push({ a, b, tamanho: b - a + 1 });
  }
  if (partes.at(-1)!.tamanho > LIMITES.ultimoMax) throw new Error("a última parte passaria de 128 MB; aumente o tamanho da parte");
  return { chunk, total, partes };
}
/** Trunca em até `max` unidades UTF-16 sem cortar um par substituto. */
export function truncar(texto: any, max = LIMITES.titulo) {
  const s = String(texto ?? "");
  if (s.length <= max) return s;
  let corte = max - 1;
  const c = s.charCodeAt(corte - 1);
  if (c >= 0xd800 && c <= 0xdbff) corte--;
  return s.slice(0, corte) + "…";
}
/** Privacidade efetiva: sem `auditado` o TikTok só aceita SELF_ONLY. Devolve { nivel, aviso? }. */
export function privacidadeEfetiva({ pedida, auditado, opcoesCriador }: any) {
  const quer = pedida || "SELF_ONLY";
  const nivel = auditado ? quer : "SELF_ONLY";
  const aviso = nivel !== quer ? `privacidade ${quer} → SELF_ONLY (app sem auditoria)` : null;
  if (opcoesCriador && !opcoesCriador.includes(nivel)) throw new Error(`privacidade ${nivel} fora das opções da conta (${opcoesCriador.join(", ")})`);
  return { nivel, aviso };
}
export const codigoPkce = () => { const verificador = randomBytes(48).toString("base64url"); return { verificador, desafio: createHash("sha256").update(verificador).digest("base64url") }; };
export function urlAutorizacao({ key, redirect, escopos = ESCOPOS, estado, pkce }: any) {
  const q = new URLSearchParams({ client_key: key, scope: escopos.join(","), response_type: "code", redirect_uri: redirect, state: estado });
  if (pkce) { q.set("code_challenge", pkce.desafio); q.set("code_challenge_method", "S256"); }
  return `${AUTORIZAR}?${q}`;
}
/** Aceita o `code` solto ou a URL de retorno inteira (?code=…&state=…). O código volta URL-encoded: decodifica uma vez. */
export function extrairCodigo(texto: any) {
  const t = String(texto).trim();
  if (/^https?:\/\//.test(t) || t.includes("code=")) {
    const q = new URL(t.startsWith("http") ? t : "http://x/?" + t.replace(/^\?/, "")).searchParams;
    if (q.get("error")) throw new Error(`o TikTok devolveu erro: ${q.get("error")} ${q.get("error_description") || ""}`);
    if (!q.get("code")) throw new Error("não achei `code=` na URL de retorno");
    return { code: q.get("code"), estado: q.get("state") };
  }
  return { code: decodeURIComponent(t), estado: null };
}

// ---------- HTTP ----------
const dormirPadrao = (ms: any) => new Promise((r) => setTimeout(r, ms));
async function json(ctx: any, url: any, opts: any) {
  const r = await ctx.fetchFn(url, opts);
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { throw new Error(`TikTok respondeu ${r.status}: ${txt.slice(0, 200)}`); }
  return { status: r.status, ok: r.ok, j };
}
function lancarSeErro(res: any) {
  const e = res.j?.error;
  if (e && e.code && e.code !== "ok") throw new Error(mensagemErro(e.code, e.message));
  if (res.j?.error && typeof res.j.error === "string") throw new Error(`TikTok: ${res.j.error}${res.j.error_description ? ` (${res.j.error_description})` : ""}`);
  if (!res.ok) throw new Error(`TikTok respondeu ${res.status}`);
  return res.j;
}

// ---------- segredos e tokens ----------
const lerJson = (ctx: any, ref: any) => { const v = ctx.segredos.obter(ref); if (!v) return null; try { return JSON.parse(v); } catch { return null; } };
const agora = (ctx: any) => (ctx.agora ? ctx.agora() : new Date());
function guardarToken(ctx: any, r: any, anterior: any = {}) {
  const t = agora(ctx).getTime();
  const tok = { access_token: r.access_token, refresh_token: r.refresh_token || anterior.refresh_token, open_id: r.open_id || anterior.open_id, scope: r.scope || anterior.scope, expira_em: t + (r.expires_in || 7200) * 1000, refresh_expira_em: t + (r.refresh_expires_in || 180 * 86400) * 1000 };
  ctx.segredos.guardar(REF_TOKEN, JSON.stringify(tok));
  return tok;
}
async function pedirToken(ctx: any, cliente: any, corpo: any) {
  const res = await json(ctx, `${API}/v2/oauth/token/`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "cache-control": "no-cache" }, body: new URLSearchParams({ client_key: cliente.key, client_secret: cliente.segredo, ...corpo }).toString() });
  if (res.j.error && typeof res.j.error === "string") throw new Error(`TikTok: ${res.j.error}${res.j.error_description ? ` (${res.j.error_description})` : ""}`);
  if (!res.j.access_token) throw new Error(`TikTok não devolveu token (${res.status})`);
  return res.j;
}
/** Access token válido (renova 5 min antes de vencer; o refresh token troca a cada renovação e é guardado de novo). */
export async function tokenValido(ctx: any) {
  const cliente = lerJson(ctx, REF_CLIENTE), tok = lerJson(ctx, REF_TOKEN);
  if (!cliente || !tok) throw new Error("TikTok não conectado: rode `praeko conta tiktok conectar`");
  if (tok.expira_em - 5 * 60e3 > agora(ctx).getTime()) return tok.access_token;
  if (tok.refresh_expira_em <= agora(ctx).getTime()) throw new Error("a autorização do TikTok venceu (refresh token de 180 dias): rode `praeko conta tiktok conectar` de novo");
  const novo = await pedirToken(ctx, cliente, { grant_type: "refresh_token", refresh_token: tok.refresh_token });
  return guardarToken(ctx, novo, tok).access_token;
}
const auth = (token: any) => ({ authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8" });

// ---------- conectar / status ----------
/** args: --cliente-key K --cliente-segredo S --redirect https://… ; depois --url <retorno> ou --code C. `--pkce` para app tipo desktop. */
export async function conectar({ ctx, args = [] }: any) {
  const f = (k: any) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : undefined; };
  let cliente = lerJson(ctx, REF_CLIENTE);
  if (f("cliente-key") || f("cliente-segredo") || f("redirect")) {
    cliente = { ...(cliente || {}), ...(f("cliente-key") ? { key: f("cliente-key") } : {}), ...(f("cliente-segredo") ? { segredo: f("cliente-segredo") } : {}), ...(f("redirect") ? { redirect: f("redirect") } : {}) };
    ctx.segredos.guardar(REF_CLIENTE, JSON.stringify(cliente));
  }
  if (!cliente?.key || !cliente?.segredo || !cliente?.redirect) throw new Error("uso: praeko conta tiktok conectar --cliente-key K --cliente-segredo S --redirect https://sua-pagina/retorno   (veja docs/tiktok.md)");
  const log = ctx.log || console.log;
  const codigo = f("url") || f("code");
  if (!codigo) {
    const estado = randomBytes(8).toString("hex"), pkce = args.includes("--pkce") ? codigoPkce() : null;
    ctx.segredos.guardar("tiktok/pendente", JSON.stringify({ estado, verificador: pkce?.verificador || null }));
    log("1) Abra no navegador (logado na conta do canal) e autorize:\n");
    log(urlAutorizacao({ key: cliente.key, redirect: cliente.redirect, estado, pkce }));
    log(`\n2) O TikTok vai redirecionar para ${cliente.redirect}?code=…  (a página pode dar 404, não importa).\n   Copie a URL inteira da barra de endereço e rode:\n   praeko conta tiktok conectar --url "<URL copiada>"`);
    return 0;
  }
  const { code, estado } = extrairCodigo(codigo);
  const pend = lerJson(ctx, "tiktok/pendente");
  if (estado && pend?.estado && estado !== pend.estado) throw new Error("o `state` da URL não confere com o do pedido (possível link de outra tentativa); rode conectar de novo sem --url");
  const r = await pedirToken(ctx, cliente, { grant_type: "authorization_code", code, redirect_uri: cliente.redirect, ...(pend?.verificador ? { code_verifier: pend.verificador } : {}) });
  const tok = guardarToken(ctx, r);
  log(`✓ TikTok conectado (open_id ${tok.open_id}); escopos: ${tok.scope}`);
  if (!String(tok.scope).includes("video.upload")) log("⚠ sem o escopo video.upload: o modo rascunho não vai funcionar");
  if (!String(tok.scope).includes("video.publish")) log("⚠ sem video.publish (só vem depois de o app ser aprovado para Direct Post): o modo direto não vai funcionar");
  return 0;
}
export async function status({ ctx }: any) {
  const tok = lerJson(ctx, REF_TOKEN);
  if (!tok || !lerJson(ctx, REF_CLIENTE)) return { conectado: false, detalhe: "rode `praeko conta tiktok conectar`" };
  try {
    const t = await tokenValido(ctx);
    const res = await json(ctx, `${API}/v2/user/info/?fields=open_id,display_name`, { method: "GET", headers: { authorization: `Bearer ${t}` } });
    const j = lancarSeErro(res);
    const dias = Math.floor((lerJson(ctx, REF_TOKEN).refresh_expira_em - agora(ctx).getTime()) / 86400e3);
    return { conectado: true, detalhe: `${j.data?.user?.display_name || tok.open_id}; escopos ${tok.scope}; autorização vale mais ${dias} dias` };
  } catch (e) { return { conectado: false, detalhe: e.message }; }
}

// ---------- publicação ----------
export const modoDe = (item: any) => (item.opcoes?.modo === "direto" ? "direto" : "rascunho");
function duracaoDe(ctx: any, arquivo: any) {
  if (ctx.duracao) return ctx.duracao(arquivo);
  try { const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", arquivo], { encoding: "utf8" }); const d = parseFloat(r.stdout); return Number.isFinite(d) ? d : null; } catch { return null; }
}

export async function planejar({ item }: any) {
  const modo = modoDe(item), o = item.opcoes || {};
  let tam; try { tam = statSync(item.video).size; } catch { tam = null; }
  const linhas = [`modo: ${modo}${modo === "rascunho" ? " (vai para a caixa de entrada do app; capa e legenda você põe no app)" : ""}`];
  if (modo === "direto") { const p = privacidadeEfetiva({ pedida: o.privacidade, auditado: o.auditado }); linhas.push(`privacidade: ${p.nivel}${p.aviso ? ` (${p.aviso})` : ""}`); linhas.push(`capa: quadro de ${o.capaMs ?? 0} ms`); }
  else linhas.push("legenda não vai pela API do rascunho: cole no app (fica em .praeko/ no resultado)");
  if (tam) { const pl = planoChunks(tam, (o.chunkMB || 10) * MB); linhas.push(`vídeo ${(tam / MB).toFixed(1)} MB em ${pl.total} parte(s) de ${(pl.chunk / MB).toFixed(1)} MB`); }
  return linhas;
}

async function enviarPartes(ctx: any, uploadUrl: any, arquivo: any, plano: any, tamanho: any) {
  const fd = openSync(arquivo, "r");
  try {
    for (const [i, p] of plano.partes.entries()) {
      const buf = Buffer.alloc(p.tamanho);
      readSync(fd, buf, 0, p.tamanho, p.a);
      let ultimo;
      for (let t = 1; t <= 3; t++) {
        const r = await ctx.fetchFn(uploadUrl, { method: "PUT", headers: { "content-type": "video/mp4", "content-length": String(p.tamanho), "content-range": `bytes ${p.a}-${p.b}/${tamanho}` }, body: buf });
        if (r.status >= 500) { ultimo = r.status; await (ctx.dormir || dormirPadrao)(1000 * t); continue; }
        const ultimaParte = i === plano.partes.length - 1;
        if ((ultimaParte && r.status === 201) || (!ultimaParte && r.status === 206) || r.status === 200) { ultimo = null; break; }
        if (r.status === 403) throw new Error("o upload_url expirou (vale 1 h); o item será refeito na próxima tentativa");
        throw new Error(`upload da parte ${i + 1}/${plano.total} recusado (${r.status})`);
      }
      if (ultimo) throw new Error(`upload da parte ${i + 1}/${plano.total} falhou (${ultimo}) depois de 3 tentativas`);
    }
  } finally { closeSync(fd); }
}

async function aguardar(ctx: any, token: any, publicId: any, alvo: any) {
  const pollMs = ctx.tiktok?.pollMs ?? 5000, max = ctx.tiktok?.maxPolls ?? 72, dormir = ctx.dormir || dormirPadrao;
  let ultimo;
  for (let i = 0; i < max; i++) {
    const j = lancarSeErro(await json(ctx, `${API}/v2/post/publish/status/fetch/`, { method: "POST", headers: auth(token), body: JSON.stringify({ publish_id: publicId }) }));
    ultimo = j.data || {};
    if (ultimo.status === "FAILED") throw new Error(`o TikTok falhou ao processar: ${ultimo.fail_reason || "motivo não informado"}`);
    if (alvo.includes(ultimo.status)) return ultimo;
    await dormir(pollMs);
  }
  throw new Error(`o TikTok ainda não terminou (último status ${ultimo?.status}); confira o app e a fila`);
}

export async function publicar({ item, ctx }: any) {
  const o = item.opcoes || {}, modo = modoDe(item), log = ctx.log || console.log;
  const tamanho = statSync(item.video).size, plano = planoChunks(tamanho, (o.chunkMB || 10) * MB);
  const token = await tokenValido(ctx);
  // tentativa anterior que já criou o post? evita duplicar
  if (item.prep?.publish_id) {
    try {
      const j = lancarSeErro(await json(ctx, `${API}/v2/post/publish/status/fetch/`, { method: "POST", headers: auth(token), body: JSON.stringify({ publish_id: item.prep.publish_id }) }));
      if (["SEND_TO_USER_INBOX", "PUBLISH_COMPLETE"].includes(j.data?.status)) return { id: item.prep.publish_id, modo, status: j.data.status, retomado: true };
    } catch { /* segue e cria de novo */ }
  }
  let corpo, caminho, creator = null;
  if (modo === "direto") {
    const ci = lancarSeErro(await json(ctx, `${API}/v2/post/publish/creator_info/query/`, { method: "POST", headers: auth(token), body: "{}" })).data || {};
    creator = ci;
    const dur = duracaoDe(ctx, item.video);
    if (dur != null && ci.max_video_post_duration_sec && dur > ci.max_video_post_duration_sec) throw new Error(`o vídeo tem ${dur.toFixed(0)} s e esta conta só posta até ${ci.max_video_post_duration_sec} s no TikTok`);
    const pv = privacidadeEfetiva({ pedida: o.privacidade, auditado: o.auditado, opcoesCriador: ci.privacy_level_options });
    if (pv.aviso) log(`⚠ TikTok: ${pv.aviso}`);
    caminho = "/v2/post/publish/video/init/";
    corpo = { post_info: { title: truncar(item.textos?.texto), privacy_level: pv.nivel, disable_duet: !!(o.desabilitarDueto || ci.duet_disabled), disable_stitch: !!(o.desabilitarStitch || ci.stitch_disabled), disable_comment: !!(o.desabilitarComentarios || ci.comment_disabled), video_cover_timestamp_ms: o.capaMs ?? 0, brand_content_toggle: false, brand_organic_toggle: false, is_aigc: o.ia === true }, source_info: { source: "FILE_UPLOAD", video_size: tamanho, chunk_size: plano.chunk, total_chunk_count: plano.total } };
  } else {
    caminho = "/v2/post/publish/inbox/video/init/";
    corpo = { source_info: { source: "FILE_UPLOAD", video_size: tamanho, chunk_size: plano.chunk, total_chunk_count: plano.total } };
  }
  const init = lancarSeErro(await json(ctx, API + caminho, { method: "POST", headers: auth(token), body: JSON.stringify(corpo) })).data || {};
  if (!init.publish_id || !init.upload_url) throw new Error("o TikTok não devolveu publish_id/upload_url");
  item.prep = { publish_id: init.publish_id, modo }; // guardado pela fila: uma nova tentativa confere antes de criar outro
  await enviarPartes(ctx, init.upload_url, item.video, plano, tamanho);
  const fim = await aguardar(ctx, token, init.publish_id, modo === "direto" ? ["PUBLISH_COMPLETE"] : ["SEND_TO_USER_INBOX", "PUBLISH_COMPLETE"]);
  const postId = fim.publicaly_available_post_id?.[0];
  const res: Record<string, any> = { id: init.publish_id, modo, status: fim.status, ...(postId && creator?.creator_username ? { url: `https://www.tiktok.com/@${creator.creator_username}/video/${postId}` } : {}) };
  if (modo === "rascunho") res.legenda = item.textos?.texto; // para colar no app
  if (modo === "rascunho") log(`✓ TikTok: vídeo na caixa de entrada do app. Abra o app, escolha a capa, cole a legenda e publique.\n--- legenda ---\n${item.textos?.texto || ""}\n---------------`);
  return res;
}

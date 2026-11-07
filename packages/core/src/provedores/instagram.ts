// Provedor direto do Instagram (Reels) pela "Instagram API with Instagram Login" (graph.instagram.com).
// Fluxo de um Reel: hospeda vídeo e capa (R2) → POST /{ig}/media (REELS, video_url, cover_url) → espera status_code FINISHED
// → POST /{ig}/media_publish. A API não tem rascunho nem agendamento: o executor da fila chama `preparar` 15 min antes
// e `publicar` na hora marcada. Tudo recebe `ctx` (fetchFn, segredos, hospedar, removerHospedado, log, agora, pausa), então testa sem rede.
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { createInterface } from "node:readline";

export const nome = "instagram";
export const rede = "instagram";
export const antecedenciaMs = 15 * 60e3;

const HOST = "https://graph.instagram.com";
const REF = "instagram/token";
const DIA = 864e5;
export const LIMITES = { legenda: 2200, hashtags: 30, duracaoMin: 3, duracaoMax: 900, bytes: 300 * 1048576, fpsMin: 23, fpsMax: 60 };
const VERSAO_PADRAO = "v23.0"; // a doc de "get started" usa v27.0 num exemplo; mude em instagram.versao (praeko.json) se a Meta aposentar esta

const versao = (ctx: any) => ctx.config?.instagram?.versao || VERSAO_PADRAO;
const agora = (ctx: any) => (ctx.agora ? ctx.agora() : new Date());
const pausa = (ctx: any, ms: any) => (ctx.pausa ? ctx.pausa(ms) : new Promise((r) => setTimeout(r, ms)));

/** Chamada à API; lança com a mensagem da Meta. `corpo` vai como formulário (POST). */
async function api(ctx: any, metodo: any, caminho: any, params = {}, { semVersao = false, host }: any = {}) {
  const base = host || lerToken(ctx)?.host || HOST; // token de usuário de sistema (login unificado) usa graph.facebook.com
  const url = new URL(`${base}/${semVersao ? "" : versao(ctx) + "/"}${caminho}`);
  let init: Record<string, any> = { method: metodo };
  if (metodo === "GET") for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v as string);
  else { init.headers = { "content-type": "application/x-www-form-urlencoded" }; init.body = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString(); }
  const r = await (ctx.fetchFn || fetch)(url.toString(), init);
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { throw new Error(`Instagram respondeu ${r.status}: ${txt.slice(0, 200)}`); }
  if (j.error) throw new Error(`Instagram: ${j.error.message}${j.error.code ? ` (código ${j.error.code}${j.error.error_subcode ? "/" + j.error.error_subcode : ""})` : ""}`);
  if (!r.ok) throw new Error(`Instagram respondeu ${r.status}: ${txt.slice(0, 200)}`);
  return j;
}

export function lerToken(ctx: any) {
  const bruto = ctx.segredos.obter(REF);
  if (!bruto) return null;
  try { return JSON.parse(bruto); } catch { return null; }
}
const guardarToken = (ctx: any, t: any) => ctx.segredos.guardar(REF, JSON.stringify(t));
export const diasRestantes = (t: any, d = new Date()) => (t.expira ? (Date.parse(t.expira) - +d) / DIA : Infinity); // usuário de sistema: nunca expira

/** Token em uso; renova sozinho quando faltam menos de 15 dias (a renovação exige token com 24 h e ainda válido). */
export async function tokenValido(ctx: any) {
  const t = lerToken(ctx);
  if (!t?.token) throw new Error("Instagram não conectado: praeko conta instagram conectar --token …");
  const dias = diasRestantes(t, agora(ctx));
  if (dias <= 0) throw new Error("o token do Instagram expirou: gere outro no painel da Meta e rode praeko conta instagram conectar --token …");
  if (t.expira && dias < 15) {
    try {
      const r = await api(ctx, "GET", "refresh_access_token", { grant_type: "ig_refresh_token", access_token: t.token }, { semVersao: true });
      const novo = { ...t, token: r.access_token, expira: new Date(+agora(ctx) + r.expires_in * 1000).toISOString() };
      guardarToken(ctx, novo);
      ctx.log?.(`✓ token do Instagram renovado (vale mais ${Math.round(r.expires_in / 86400)} dias)`);
      return novo;
    } catch (e) { ctx.log?.(`⚠ não consegui renovar o token do Instagram (${e.message}); faltam ${Math.floor(dias)} dias`); }
  }
  return t;
}

async function lerEntrada(args: any, ctx: any) {
  const i = args.indexOf("--token");
  if (i >= 0 && args[i + 1]) return args[i + 1].trim();
  if (!process.stdin.isTTY) { const ch = []; for await (const c of process.stdin) ch.push(c); const s = Buffer.concat(ch).toString().trim(); if (s) return s; }
  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const s = await new Promise<string>((ok) => rl.question("Cole o token de acesso do Instagram (painel da Meta → Instagram → API setup → Generate token): ", ok));
    rl.close();
    return s.trim();
  }
  return "";
}

export async function conectar({ ctx, args = [] }: any) {
  const token = await lerEntrada(args, ctx);
  if (!token) throw new Error("sem token: praeko conta instagram conectar --token <token> (ou por stdin)");
  const j = args.indexOf("--app-secret"), segredoApp = j >= 0 ? args[j + 1] : null;
  const flag = (k: any) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const userIdArg = flag("--user-id"), hostArg = flag("--host");
  let eu, host = null;
  if (hostArg || !userIdArg) {
    try { eu = await api(ctx, "GET", "me", { fields: "user_id,username,account_type", access_token: token }, { host: hostArg ? `https://${hostArg.replace(/^https?:\/\//, "")}` : HOST }); host = hostArg ? `https://${hostArg.replace(/^https?:\/\//, "")}` : null; }
    catch (e) { if (!userIdArg) throw e; }
  }
  if (!eu) { // token de usuário de sistema (login unificado): graph.facebook.com + id da conta do Instagram
    if (!userIdArg) throw new Error("para token de usuário de sistema informe --user-id <id da conta do Instagram>");
    host = "https://graph.facebook.com";
    const r = await api(ctx, "GET", userIdArg, { fields: "id,username", access_token: token }, { host });
    eu = { user_id: r.id, id: r.id, username: r.username, account_type: "BUSINESS" };
  }
  let final = token, expiraEm = 60 * 86400; // token do painel já é de longa duração (60 dias); o curto (1 h) precisa de troca
  if (segredoApp) {
    try { const r = await api(ctx, "GET", "access_token", { grant_type: "ig_exchange_token", client_secret: segredoApp, access_token: token }, { semVersao: true }); final = r.access_token; expiraEm = r.expires_in; ctx.log?.("✓ token trocado por um de longa duração"); }
    catch (e) { ctx.log?.(`⚠ não troquei o token (${e.message}); mantive o original`); }
  }
  const salvo = { token: final, userId: String(eu.user_id || eu.id), username: eu.username, tipo: eu.account_type, ...(host && /facebook/.test(host) ? { host, expira: null } : { expira: new Date(+agora(ctx) + expiraEm * 1000).toISOString() }), conectadoEm: agora(ctx).toISOString() };
  guardarToken(ctx, salvo);
  ctx.log?.(`✓ Instagram conectado: @${salvo.username} (${salvo.tipo || "tipo desconhecido"}); ${salvo.expira ? "token vale até " + salvo.expira.slice(0, 10) : "token de usuário de sistema, sem expiração"}`);
  if (salvo.tipo && !/BUSINESS|CREATOR|MEDIA_CREATOR/i.test(salvo.tipo)) ctx.log?.("⚠ a conta não parece profissional (Business/Creator): a API só publica em conta profissional");
  return 0;
}

export async function status({ ctx }: any) {
  const t = lerToken(ctx);
  if (!t?.token) return { conectado: false, detalhe: "rode: praeko conta instagram conectar --token …" };
  const dias = diasRestantes(t, agora(ctx));
  return { conectado: dias > 0, detalhe: `@${t.username}, ${t.tipo || "tipo ?"}, ${!t.expira ? "token sem expiração (usuário de sistema)" : dias > 0 ? `token vale mais ${Math.floor(dias)} dias${dias < 15 ? " (renova sozinho)" : ""}` : "token EXPIRADO"}` };
}

// ---------- checagens do vídeo (ffprobe, se existir) ----------
function sondar(arq: any, ctx: any) {
  if (ctx.sondar) return ctx.sondar(arq);
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,r_frame_rate", "-show_entries", "format=duration", "-of", "json", arq], { encoding: "utf8" });
  if (r.status !== 0) return null;
  const j = JSON.parse(r.stdout), s = j.streams[0], [a, b] = String(s.r_frame_rate).split("/").map(Number);
  return { codec: s.codec_name, largura: s.width, altura: s.height, fps: b ? (a as number) / b : a, duracao: +j.format.duration };
}
export function avisosVideo(arq: any, ctx = {}) {
  const av = [];
  try {
    try { const bytes = statSync(arq).size; if (bytes > LIMITES.bytes) av.push(`vídeo com ${(bytes / 1048576).toFixed(0)} MB (limite do Reel: 300 MB)`); } catch { /* arquivo ausente: o ffprobe diz */ }
    const s = sondar(arq, ctx);
    if (!s) return av;
    if (s.duracao < LIMITES.duracaoMin || s.duracao > LIMITES.duracaoMax) av.push(`duração ${s.duracao.toFixed(1)} s fora de 3 s a 15 min`);
    if (s.fps < LIMITES.fpsMin || s.fps > LIMITES.fpsMax) av.push(`${s.fps.toFixed(1)} fps fora de 23 a 60`);
    if (!/^(h264|hevc)$/.test(s.codec)) av.push(`codec ${s.codec} (use H.264 ou HEVC)`);
    const prop = s.largura / s.altura;
    if (prop < 0.5 || prop > 0.6) av.push(`proporção ${s.largura}x${s.altura}: 9:16 evita cortes e faixas`);
  } catch (e) { av.push(`não consegui conferir o vídeo (${e.message})`); }
  return av;
}
export function avisosTexto(texto: any) {
  const av = [];
  if (texto.length > LIMITES.legenda) av.push(`legenda com ${texto.length} caracteres (limite ${LIMITES.legenda})`);
  const n = (texto.match(/#[\p{L}\p{N}_]+/gu) || []).length;
  if (n > LIMITES.hashtags) av.push(`${n} hashtags (limite ${LIMITES.hashtags})`);
  return av;
}

export async function planejar({ item, ctx }: any) {
  const l = [`Reel na hora marcada; preparo ${antecedenciaMs / 60e3} min antes (vídeo e capa vão para a hospedagem pública)`];
  l.push(item.capa ? `capa: ${basename(item.capa)} (vira cover_url; PNG é convertido para JPEG)` : "sem capa: miniatura = quadro 0 do vídeo");
  const t = lerToken(ctx);
  l.push(t ? `conta @${t.username}; token vale mais ${Math.floor(diasRestantes(t, agora(ctx)))} dias` : "⚠ conta não conectada (praeko conta instagram conectar)");
  for (const a of [...avisosTexto(item.textos?.texto || ""), ...(item.video ? avisosVideo(item.video, ctx) : [])]) l.push(`⚠ ${a}`);
  return l;
}

// ---------- capa em JPEG ----------
function capaJpeg(capa: any, ctx: any) {
  if (/\.jpe?g$/i.test(capa)) return capa;
  if (ctx.converterCapa) return ctx.converterCapa(capa);
  const saida = join(tmpdir(), `praeko-capa-${basename(capa, extname(capa))}-${Date.now()}.jpg`);
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", capa, "-q:v", "2", saida], { stdio: "ignore" });
  return r.status === 0 && existsSync(saida) ? saida : capa;
}

async function limpar(ctx: any, prep: any) {
  for (const chave of prep?.chavesHospedadas || []) { try { await ctx.removerHospedado(chave); } catch (e) { ctx.log?.(`⚠ não removi ${chave} da hospedagem (${e.message})`); } }
}

/** Cria o contêiner do Reel. O resultado também é gravado em `item.prep` na hora, para uma nova tentativa reaproveitar. */
export async function preparar({ item, ctx }: any) {
  if (item.prep?.containerId && !item.prep.publicado && (+agora(ctx) - Date.parse(item.prep.criadoEm)) < 23 * 3600e3) return item.prep; // contêiner dura 24 h
  if (item.prep?.containerId && !item.prep.publicado) { await limpar(ctx, item.prep); item.prep = null; } // velho demais: recria
  const t = await tokenValido(ctx), texto = item.textos?.texto || "";
  const erros = avisosTexto(texto).filter((x) => /caracteres|hashtags/.test(x));
  if (erros.length) throw new Error(erros.join("; "));
  const chaves = [];
  try {
    const v = await ctx.hospedar(item.video, item.slug); chaves.push(v.chave);
    const params: Record<string, any> = { media_type: "REELS", video_url: v.url, caption: texto, share_to_feed: "true", access_token: t.token };
    if (item.capa) { const c = await ctx.hospedar(capaJpeg(item.capa, ctx), item.slug); chaves.push(c.chave); params.cover_url = c.url; }
    else if (item.opcoes?.miniaturaMs != null) params.thumb_offset = item.opcoes.miniaturaMs;
    const r = await api(ctx, "POST", `${t.userId}/media`, params);
    item.prep = { containerId: r.id, criadoEm: agora(ctx).toISOString(), chavesHospedadas: chaves, videoUrl: v.url, capaUrl: params.cover_url || null };
    ctx.log?.(`✓ Instagram: contêiner ${r.id} criado`);
    return item.prep;
  } catch (e) { await limpar(ctx, { chavesHospedadas: chaves }); throw e; } // falhou antes de existir contêiner: não deixa lixo na hospedagem
}

/** Espera o contêiner ficar FINISHED (a Meta recomenda 1 consulta por minuto, por até 5 min; aqui até `esperaMaxMs`). */
export async function esperarContainer({ ctx, token, containerId, intervaloMs, maxMs }: any) {
  const tentativas = Math.max(1, Math.ceil(maxMs / intervaloMs));
  for (let i = 0; i < tentativas; i++) {
    const r = await api(ctx, "GET", containerId, { fields: "status_code,status", access_token: token });
    if (r.status_code === "FINISHED" || r.status_code === "PUBLISHED") return r.status_code;
    if (r.status_code === "ERROR" || r.status_code === "EXPIRED") { const e: any = new Error(`Instagram: contêiner ${r.status_code}${r.status ? ` (${r.status})` : ""}`); e.codigo = r.status_code; throw e; }
    if (i < tentativas - 1) await pausa(ctx, intervaloMs);
  }
  throw new Error(`Instagram: o vídeo ainda está processando depois de ${Math.round(maxMs / 60e3)} min; a próxima tentativa continua`);
}

export async function publicar({ item, ctx }: any) {
  if (item.prep?.publicado) return item.prep.resultado; // já publicado numa tentativa anterior (não duplica)
  const prep = await preparar({ item, ctx }); // reaproveita o contêiner de `item.prep` se ainda valer
  const t = await tokenValido(ctx), op = item.opcoes || {};
  try { await esperarContainer({ ctx, token: t.token, containerId: prep.containerId, intervaloMs: op.intervaloMs ?? 30e3, maxMs: op.esperaMaxMs ?? 10 * 60e3 }); }
  catch (e) { if (e.codigo) { await limpar(ctx, prep); item.prep = null; } throw e; } // ERROR/EXPIRED: o contêiner morreu, a próxima tentativa recria
  try { // cota: ~100 posts por API em 24 h; consulta é só leitura e não bloqueia se falhar
    const q = await api(ctx, "GET", `${t.userId}/content_publishing_limit`, { fields: "quota_usage,config", access_token: t.token });
    const uso = q.data?.[0]?.quota_usage, total = q.data?.[0]?.config?.quota_total;
    if (uso != null && total != null && uso >= total) throw Object.assign(new Error(`cota de publicação do Instagram esgotada (${uso}/${total} em 24 h)`), { cota: true });
  } catch (e) { if (e.cota) throw e; }
  const pub = await api(ctx, "POST", `${t.userId}/media_publish`, { creation_id: prep.containerId, access_token: t.token });
  const resultado: Record<string, any> = { id: pub.id, containerId: prep.containerId };
  prep.publicado = pub.id; prep.resultado = resultado; // gravado já: depois daqui nada pode causar republicação
  try { const m = await api(ctx, "GET", pub.id, { fields: "permalink", access_token: t.token }); resultado.url = m.permalink; } catch (e) { ctx.log?.(`⚠ publicado, mas sem o link (${e.message})`); }
  if (op.comentar !== false && item.textos?.comentarioFixo) { // ligado por padrão; `comentar: false` desliga
    try { await api(ctx, "POST", `${pub.id}/comments`, { message: item.textos.comentarioFixo, access_token: t.token }); resultado.comentario = true; }
    catch (e) { ctx.log?.(`⚠ publicado, mas o comentário falhou (${e.message}); precisa do escopo instagram_business_manage_comments no token (o post saiu normal); comente pelo app`); }
  }
  await limpar(ctx, prep);
  ctx.log?.(`✓ Instagram publicado${resultado.url ? ": " + resultado.url : ""}`);
  return resultado;
}

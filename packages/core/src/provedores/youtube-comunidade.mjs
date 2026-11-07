// YouTube: o canal por dentro (vídeos, edição e comentários). Mesma regra do youtube-api.mjs: só fetch, nada de Node.
// Cotas da Data API v3: videos.list e commentThreads.list e playlistItems.list custam 1; videos.update e comments.insert, 50.
import { API, api, canalId, falha } from "./youtube-api.mjs";

const lerJson = async (r) => { const t = await r.text(); if (!r.ok) throw falha(r.status, t); return t ? JSON.parse(t) : {}; };
const ate = (n, max) => Math.max(1, Math.min(max, Math.floor(+n) || 20));

const resumoVideo = (v) => ({
  id: v.id,
  titulo: v.snippet?.title,
  descricao: v.snippet?.description,
  publicadoEm: v.snippet?.publishedAt,
  privacidade: v.status?.privacyStatus,
  publishAt: v.status?.publishAt || null,
  duracao: v.contentDetails?.duration,
  tags: v.snippet?.tags || [],
  visualizacoes: v.statistics?.viewCount != null ? +v.statistics.viewCount : null,
  curtidas: v.statistics?.likeCount != null ? +v.statistics.likeCount : null,
  comentarios: v.statistics?.commentCount != null ? +v.statistics.commentCount : null,
  url: `https://youtu.be/${v.id}`,
});

/** Vídeos do canal (inclusive privados e agendados), do mais novo para o mais antigo. 1 unidade de cota por chamada. */
export async function listarVideos({ ctx, max = 20, pagina }) {
  const cid = await canalId(ctx);
  const c = await lerJson(await api(ctx, `${API}/channels?part=contentDetails&id=${cid}`));
  const uploads = c.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error("o canal não tem playlist de uploads");
  const p = await lerJson(await api(ctx, `${API}/playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=${ate(max, 50)}${pagina ? `&pageToken=${encodeURIComponent(pagina)}` : ""}`));
  const ids = (p.items || []).map((i) => i.contentDetails?.videoId).filter(Boolean);
  if (!ids.length) return { videos: [], proxima: p.nextPageToken || null };
  const d = await lerJson(await api(ctx, `${API}/videos?part=snippet,status,statistics,contentDetails&id=${ids.join(",")}&maxResults=50`));
  const porId = new Map((d.items || []).map((v) => [v.id, v]));
  return { videos: ids.map((id) => porId.get(id)).filter(Boolean).map(resumoVideo), proxima: p.nextPageToken || null };
}

export async function lerVideo({ ctx, videoId }) {
  const d = await lerJson(await api(ctx, `${API}/videos?part=snippet,status,statistics,contentDetails&id=${encodeURIComponent(videoId)}`));
  const v = d.items?.[0];
  if (!v) throw Object.assign(new Error(`o vídeo ${videoId} não existe neste canal`), { status: 404 });
  return resumoVideo(v);
}

const CAMPOS_SNIPPET = ["title", "description", "tags", "categoryId", "defaultLanguage", "defaultAudioLanguage"];
const semAngulos = (s) => !/[<>]/.test(s);

/**
 * Edita título, descrição e/ou tags preservando o resto do snippet (categoria, idioma). 50 unidades de cota.
 * `simular: true` só devolve { antes, depois } sem escrever.
 */
/** Apaga um vídeo do canal (videos.delete). Quem chama confere ANTES que ele ainda é privado. 404 = já não existe. */
export async function apagarVideo({ ctx, videoId }) {
  const r = await api(ctx, `${API}/videos?id=${encodeURIComponent(videoId)}`, { method: "DELETE" });
  if (r.status === 404) return { id: videoId, apagado: false, jaNaoExistia: true };
  if (r.status < 200 || r.status > 299) throw Object.assign(new Error(`o YouTube recusou apagar o vídeo (HTTP ${r.status})`), { status: r.status });
  return { id: videoId, apagado: true };
}

export async function editarVideo({ ctx, videoId, titulo, descricao, tags, simular = false }) {
  if (titulo === undefined && descricao === undefined && tags === undefined) throw new Error("nada para mudar: informe titulo, descricao ou tags");
  if (titulo !== undefined && (!titulo.trim() || titulo.length > 100 || !semAngulos(titulo))) throw new Error("título inválido: de 1 a 100 caracteres e sem < ou >");
  if (descricao !== undefined && (descricao.length > 5000 || !semAngulos(descricao))) throw new Error("descrição inválida: até 5000 caracteres e sem < ou >");
  if (tags !== undefined && (!Array.isArray(tags) || tags.join(",").length > 500)) throw new Error("tags inválidas: lista de até 500 caracteres no total");
  const d = await lerJson(await api(ctx, `${API}/videos?part=snippet&id=${encodeURIComponent(videoId)}`));
  const v = d.items?.[0];
  if (!v) throw Object.assign(new Error(`o vídeo ${videoId} não existe neste canal`), { status: 404 });
  const atual = {}; for (const k of CAMPOS_SNIPPET) if (v.snippet?.[k] !== undefined) atual[k] = v.snippet[k];
  const novo = { ...atual, ...(titulo !== undefined ? { title: titulo } : {}), ...(descricao !== undefined ? { description: descricao } : {}), ...(tags !== undefined ? { tags } : {}) };
  const antes = { titulo: atual.title, descricao: atual.description, tags: atual.tags || [] };
  const depois = { titulo: novo.title, descricao: novo.description, tags: novo.tags || [] };
  const mudou = JSON.stringify(antes) !== JSON.stringify(depois);
  if (simular || !mudou) return { id: videoId, antes, depois, mudou, escrito: false };
  await lerJson(await api(ctx, `${API}/videos?part=snippet`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: videoId, snippet: novo }) }));
  return { id: videoId, antes, depois, mudou, escrito: true, url: `https://youtu.be/${videoId}` };
}

const comentarioDe = (c) => ({
  id: c.id,
  autor: c.snippet?.authorDisplayName,
  autorCanal: c.snippet?.authorChannelId?.value || null,
  texto: c.snippet?.textOriginal ?? c.snippet?.textDisplay,
  publicadoEm: c.snippet?.publishedAt,
  curtidas: c.snippet?.likeCount ?? 0,
});

/** O dono respondeu? Usa as respostas que vieram junto; se o YouTube cortou a lista, pergunta por comments.list (1 unidade). */
async function donoRespondeu(ctx, thread, cid) {
  const total = thread.snippet?.totalReplyCount ?? 0;
  if (!total) return false;
  const vindas = (thread.replies?.comments || []).map(comentarioDe);
  if (vindas.some((c) => c.autorCanal === cid)) return true;
  if (vindas.length >= total) return false;
  let pagina;
  do {
    const r = await lerJson(await api(ctx, `${API}/comments?part=snippet&parentId=${encodeURIComponent(thread.id)}&maxResults=100&textFormat=plainText${pagina ? `&pageToken=${encodeURIComponent(pagina)}` : ""}`));
    if ((r.items || []).some((c) => c.snippet?.authorChannelId?.value === cid)) return true;
    pagina = r.nextPageToken;
  } while (pagina);
  return false;
}

/**
 * Comentários do canal (todos os vídeos) ou de um vídeo. `semResposta`: só os de terceiros que o dono ainda não respondeu.
 * Devolve { comentarios, proxima }. Com filtro, varre até 10 páginas (10 unidades) para juntar `max` itens.
 */
export async function listarComentarios({ ctx, videoId, semResposta = false, max = 20, pagina }) {
  const cid = await canalId(ctx);
  const alvo = videoId ? `videoId=${encodeURIComponent(videoId)}` : `allThreadsRelatedToChannelId=${cid}`;
  const saida = []; let prox = pagina || null, paginas = 0;
  do {
    const r = await lerJson(await api(ctx, `${API}/commentThreads?part=snippet,replies&${alvo}&maxResults=${ate(semResposta ? 100 : max, 100)}&order=time&textFormat=plainText${prox ? `&pageToken=${encodeURIComponent(prox)}` : ""}`));
    paginas++; prox = r.nextPageToken || null;
    for (const t of r.items || []) {
      const topo = comentarioDe(t.snippet?.topLevelComment || {});
      const doDono = topo.autorCanal === cid;
      const respondido = doDono ? false : await donoRespondeu(ctx, t, cid);
      if (semResposta && (doDono || respondido)) continue;
      saida.push({
        id: t.id, videoId: t.snippet?.videoId || videoId || null, ...topo, doDono,
        totalRespostas: t.snippet?.totalReplyCount ?? 0, respondido,
        respostas: (t.replies?.comments || []).map(comentarioDe),
      });
      if (saida.length >= max) return { comentarios: saida, proxima: prox };
    }
  } while (prox && semResposta && paginas < 10);
  return { comentarios: saida, proxima: prox };
}

/** Responde a um comentário (thread). Escopo youtube.force-ssl; 50 unidades. O comentário fica no thread, não fixado. */
export async function responderComentario({ ctx, parentId, texto }) {
  if (!parentId) throw new Error("falta o id do comentário (thread)");
  if (!texto || !texto.trim() || texto.length > 10000) throw new Error("texto inválido: de 1 a 10000 caracteres");
  const j = await lerJson(await api(ctx, `${API}/comments?part=snippet`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ snippet: { parentId, textOriginal: texto } }) }));
  return { id: j.id, parentId, texto: j.snippet?.textOriginal ?? texto };
}

/** Troca a última linha só de hashtags da descrição por `novas` (ou acrescenta no fim, depois de uma linha em branco). */
export function trocarHashtags(descricao, novas) {
  const nv = String(novas).trim().split(/\s+/).filter(Boolean).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
  if (!nv) throw new Error("informe ao menos uma hashtag");
  const linhas = String(descricao || "").replace(/\s+$/, "").split("\n");
  for (let i = linhas.length - 1; i >= 0; i--) {
    if (!linhas[i].trim()) continue;
    if (/^\s*(#\S+\s*)+$/.test(linhas[i])) { linhas[i] = nv; return linhas.join("\n"); }
    break;
  }
  return `${linhas.join("\n")}\n\n${nv}`.replace(/^\n+/, "");
}

// ---------- Insights: estatísticas em lote (1 unidade de cota por chamada) ----------
const num = (x) => (x != null && x !== "" && !Number.isNaN(+x) ? +x : null);

/**
 * Estatísticas atuais de vídeos (até 50 por chamada; várias chamadas se houver mais). Devolve Map id → { views, curtidas, comentarios,
 * privacidade, publishAt, publicadoEm, titulo }. Vídeo que sumiu do canal simplesmente não aparece no Map.
 */
export async function estatisticasVideos({ ctx, ids }) {
  const saida = new Map(), unicos = [...new Set(ids)];
  for (let i = 0; i < unicos.length; i += 50) {
    const lote = unicos.slice(i, i + 50);
    const d = await lerJson(await api(ctx, `${API}/videos?part=snippet,status,statistics&id=${lote.map(encodeURIComponent).join(",")}&maxResults=50`));
    for (const v of d.items || []) {
      saida.set(v.id, {
        views: num(v.statistics?.viewCount), curtidas: num(v.statistics?.likeCount), comentarios: num(v.statistics?.commentCount),
        privacidade: v.status?.privacyStatus || null, publishAt: v.status?.publishAt || null, publicadoEm: v.snippet?.publishedAt || null, titulo: v.snippet?.title || null,
      });
    }
  }
  return saida;
}

/** Números do canal: inscritos (null se o canal os esconde), views e vídeos. */
export async function estatisticasCanal({ ctx }) {
  const d = await lerJson(await api(ctx, `${API}/channels?part=statistics&mine=true`));
  const c = d.items?.[0];
  if (!c) throw new Error("a conta autorizada não tem canal do YouTube");
  const s = c.statistics || {};
  return { seguidores: s.hiddenSubscriberCount ? null : num(s.subscriberCount), totalViews: num(s.viewCount), totalVideos: num(s.videoCount) };
}

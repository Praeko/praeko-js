// YouTube Analytics: retenção, desempenho por vídeo (YouTube Analytics API v2) e impressões/CTR da miniatura (YouTube Reporting API v1).
// Mesma regra do youtube-api.mjs: só fetch, nada de Node. Tudo exige o escopo yt-analytics.readonly (não sensível, e já vai na conexão normal); um token conectado antes dele existir
// (só youtube.upload + youtube.force-ssl) NÃO serve: `temEscopoAnalytics` diz isso e as chamadas lançam um erro com `reautorizar: true` (HTTP 403).
// Fontes (conferidas em 2026-11-07):
//   • https://developers.google.com/youtube/analytics/channel_reports (relatório de retenção: dimensão elapsedVideoTimeRatio, filtro `video` obrigatório e de UM vídeo só)
//   • https://developers.google.com/youtube/analytics/metrics (audienceWatchRatio, relativeRetentionPerformance, averageViewDuration, averageViewPercentage)
//   • https://developers.google.com/youtube/reporting/v1/reports/channel_reports (channel_reach_basic_a1: video_thumbnail_impressions e video_thumbnail_impressions_ctr)
//   • videoThumbnailImpressions NÃO existe na Analytics API v2 (consulta direta); só no Reporting API (relatórios em lote, diários, CSV).
import { ESCOPOS_BASE, ESCOPO_ANALYTICS, api, falha, REF_TOKEN } from "./youtube-api.mjs";
export { ESCOPO_ANALYTICS };

export const ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";
export const REPORTING = "https://youtubereporting.googleapis.com/v1";
export const TIPO_RELATORIO_ALCANCE = "channel_reach_basic_a1";
export const NOME_JOB_ALCANCE = "praeko-alcance";

/** Erro que diz ao painel "reconecte o YouTube para liberar a retenção". */
export const erroReautorizar = (detalhe) => Object.assign(new Error(`o token do YouTube não tem o escopo yt-analytics.readonly: reconecte o canal para liberar retenção, impressões e CTR${detalhe ? ` (${detalhe})` : ""}`), { status: 403, reautorizar: true });

/** Escopos que o Google concedeu ao token guardado (null = sem token). Um token antigo sem o campo conta como os dois escopos do upload. */
export async function escoposConcedidos(ctx) {
  const bruto = await ctx.segredos.obter(REF_TOKEN);
  if (!bruto) return null;
  let t; try { t = JSON.parse(bruto); } catch { return null; }
  return Array.isArray(t.escopos) ? t.escopos : ESCOPOS_BASE;
}
export const temEscopoAnalytics = async (ctx) => (await escoposConcedidos(ctx))?.includes(ESCOPO_ANALYTICS) ?? false;

/** Resposta da Google → erro com mensagem útil; 401/403 de escopo vira `reautorizar`. */
async function lerRespostaGoogle(r) {
  const txt = await r.text();
  if (r.ok) return txt ? JSON.parse(txt) : {};
  if (r.status === 403 && /insufficient|scope|permission|access.?not.?configured|accessNotConfigured/i.test(txt)) {
    if (/accessNotConfigured|has not been used|is disabled/i.test(txt)) throw Object.assign(falha(r.status, txt), { apiDesligada: true }); // a API não está ativada no projeto do Google Cloud
    throw erroReautorizar();
  }
  if (r.status === 401) throw erroReautorizar("token recusado");
  throw falha(r.status, txt);
}

const dataISO = (ms) => new Date(ms).toISOString().slice(0, 10);
const arredonda = (x, n = 4) => (Number.isFinite(+x) ? Math.round(+x * 10 ** n) / 10 ** n : null);

/** Linhas da Analytics API → objetos pelo nome da coluna. */
const linhasDe = (j) => { const cols = (j.columnHeaders || []).map((c) => c.name); return (j.rows || []).map((l) => Object.fromEntries(cols.map((c, i) => [c, l[i]]))); };

/**
 * Curva de retenção de UM vídeo (Analytics API v2, `reports.query`). `publicadoEm`: ISO do post (início do intervalo). Devolve { curva: [[posicao, assistida, relativa], …] }
 * (posicao = elapsedVideoTimeRatio 0..1, assistida = audienceWatchRatio — passa de 1 quando há reprises —, relativa = relativeRetentionPerformance 0..1, 0,5 = mediana de
 * vídeos de duração parecida) e os totais do vídeo { views, minutos, duracaoMediaSeg, percentualMedio }. `curva` vazia = o YouTube ainda não tem dado (vídeo novo ou pequeno).
 * Custo: 2 consultas à Analytics API (cota própria, em "queries" por dia do projeto). `audienceType==ORGANIC` exclui tráfego de anúncio.
 */
export async function retencaoDoVideo({ ctx, videoId, publicadoEm, agora = Date.now() }) {
  const inicio = dataISO(Math.min(Date.parse(publicadoEm) || agora, agora) - 86400e3), fim = dataISO(agora);
  const consulta = (extra) => `${ANALYTICS}?${new URLSearchParams({ ids: "channel==MINE", startDate: inicio, endDate: fim, ...extra })}`;
  const curvaJ = await lerRespostaGoogle(await api(ctx, consulta({ metrics: "audienceWatchRatio,relativeRetentionPerformance", dimensions: "elapsedVideoTimeRatio", filters: `video==${videoId};audienceType==ORGANIC` })));
  const curva = linhasDe(curvaJ).map((l) => [arredonda(l.elapsedVideoTimeRatio), arredonda(l.audienceWatchRatio), arredonda(l.relativeRetentionPerformance)]).filter((p) => p[0] != null && p[1] != null).sort((a, b) => a[0] - b[0]);
  const totJ = await lerRespostaGoogle(await api(ctx, consulta({ metrics: "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage", filters: `video==${videoId}` })));
  const t = linhasDe(totJ)[0] || {};
  return { curva, views: t.views ?? null, minutos: t.estimatedMinutesWatched ?? null, duracaoMediaSeg: t.averageViewDuration ?? null, percentualMedio: t.averageViewPercentage ?? null };
}

// ---------- Reporting API: impressões e CTR ----------
const jobs = async (ctx) => (await lerRespostaGoogle(await api(ctx, `${REPORTING}/jobs`))).jobs || [];

/** Garante o job do relatório de alcance deste canal (uma vez por canal; o YouTube só gera relatórios depois do job e preenche os 30 dias anteriores). Devolve { id, criado }. */
export async function garantirJobAlcance({ ctx }) {
  const existente = (await jobs(ctx)).find((j) => j.reportTypeId === TIPO_RELATORIO_ALCANCE);
  if (existente) return { id: existente.id, criado: false };
  const j = await lerRespostaGoogle(await api(ctx, `${REPORTING}/jobs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reportTypeId: TIPO_RELATORIO_ALCANCE, name: NOME_JOB_ALCANCE }) }));
  return { id: j.id, criado: true };
}

/** Relatórios novos do job (`createdAfter` inclui os de backfill). Devolve [{ id, inicio, fim, criadoEm, url }] do mais antigo para o mais novo. */
export async function relatoriosDoJob({ ctx, jobId, criadosApos }) {
  const out = [];
  let pagina;
  for (let i = 0; i < 10; i++) {
    const q = new URLSearchParams({ pageSize: "100", ...(criadosApos ? { createdAfter: criadosApos } : {}), ...(pagina ? { pageToken: pagina } : {}) });
    const j = await lerRespostaGoogle(await api(ctx, `${REPORTING}/jobs/${encodeURIComponent(jobId)}/reports?${q}`));
    for (const r of j.reports || []) out.push({ id: r.id, inicio: r.startTime, fim: r.endTime, criadoEm: r.createTime, url: r.downloadUrl });
    pagina = j.nextPageToken; if (!pagina) break;
  }
  return out.sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)));
}

/** CSV do relatório de alcance → [{ dia, videoId, impressoes, ctr }]. Cabeçalho lido pelo nome (a ordem das colunas pode mudar entre versões). `ctr` = razão 0..1 como vem no CSV. */
export function lerCsvAlcance(csv) {
  const linhas = String(csv || "").split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return [];
  const cab = linhas[0].split(",").map((c) => c.trim()), ix = (n) => cab.indexOf(n);
  const iD = ix("date"), iV = ix("video_id"), iI = ix("video_thumbnail_impressions"), iC = ix("video_thumbnail_impressions_ctr");
  if (iD < 0 || iV < 0 || iI < 0) return [];
  const out = [];
  for (const l of linhas.slice(1)) {
    const c = l.split(","), d = String(c[iD] || "").trim();
    if (!/^\d{8}$/.test(d) || !c[iV]?.trim()) continue;
    const imp = Number(c[iI]), ctr = iC >= 0 && c[iC]?.trim() !== "" ? Number(c[iC]) : null;
    if (!Number.isFinite(imp)) continue;
    out.push({ dia: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, videoId: c[iV].trim(), impressoes: Math.round(imp), ctr: ctr != null && Number.isFinite(ctr) ? ctr : null });
  }
  return out;
}

/** Baixa um relatório (URL do `downloadUrl`; só aceita o host da Reporting API) e já o devolve lido. */
export async function baixarRelatorioAlcance({ ctx, url }) {
  if (!/^https:\/\/youtubereporting\.googleapis\.com\//.test(String(url))) throw new Error("URL de relatório inesperada");
  const r = await api(ctx, url);
  if (!r.ok) await lerRespostaGoogle(r);
  return lerCsvAlcance(await r.text());
}

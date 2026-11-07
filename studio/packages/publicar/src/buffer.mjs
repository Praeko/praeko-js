// Agendamento pelo Buffer (https://developers.buffer.com): API GraphQL em https://api.buffer.com, chave no cabeçalho Bearer.
// O Buffer não recebe arquivo: busca o vídeo numa URL pública estável (ver hospedagem.mjs) na hora de publicar.
// Tudo aqui é puro ou recebe `fetchFn` por parâmetro, para testar sem rede.
import { capitulos, link, linhaLink } from "./index.mjs";

export const ENDPOINT = "https://api.buffer.com";
/** Nomes curtos aceitos em --redes. */
export const REDES = { yt: "youtube", youtube: "youtube", ig: "instagram", instagram: "instagram", tt: "tiktok", tiktok: "tiktok" };
const tags = (l) => (l || []).join(" ");

/** "06/11 17:30" | "06/11/2026 17:30" | "2026-11-06T17:30" | ISO com fuso → ISO UTC. `fuso` padrão "-03:00" (Brasil não tem horário de verão desde 2019). */
export function parseQuando(txt, { fuso = "-03:00", agora = new Date() } = {}) {
  const s = String(txt).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?[ T]+(\d{1,2}):(\d{2})$/);
  let iso;
  if (m) {
    let ano = m[3] ? +m[3] : agora.getFullYear();
    const mk = (a) => `${a}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}T${String(m[4]).padStart(2, "0")}:${m[5]}:00${fuso}`;
    iso = mk(ano);
    if (!m[3] && new Date(iso) < agora) iso = mk(ano + 1); // sem ano e já passou: próximo ano
  } else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(s)) iso = s.replace(" ", "T") + (s.length === 16 ? ":00" : "") + fuso;
  else if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/.test(s)) iso = s;
  else throw new Error(`data inválida: "${txt}" (use "06/11 17:30", "06/11/2026 17:30" ou "2026-11-06T17:30")`);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`data inválida: "${txt}"`);
  return d.toISOString();
}

/** Textos de cada rede (os mesmos que o `textos.md` mostra), prontos para o Buffer. */
export function textosPorRede({ marca, ep }) {
  const lk = (plataforma) => link(marca, { plataforma, campanha: ep.campanha, formato: ep.formato || "short" });
  const longo = ep.formato === "longo";
  const yt = [ep.yt?.descricao || ""];
  if (ep.capitulos?.length) yt.push("", "⏱ Capítulos", capitulos(ep.capitulos));
  if (!longo && ep.artigo) yt.push("", `📖 Artigo completo: ${ep.artigo}`);
  if (!longo && ep.videoCompleto) yt.push(`▶️ Completo: ${ep.videoCompleto}`);
  yt.push("", ...linhaLink(marca, () => lk("youtube")), "", tags(ep.hashtags?.youtube));
  return {
    youtube: { titulo: ep.titulo, texto: yt.join("\n").trim(), comentarioFixo: ep.yt?.comentarioFixo },
    instagram: { texto: `${ep.ig?.legenda || ""}${ep.hashtags?.instagram ? " " + tags(ep.hashtags.instagram) : ""}`.trim(), comentarioFixo: ep.ig?.comentarioFixo },
    tiktok: { texto: `${ep.tiktok?.legenda || ep.ig?.legenda || ""}${ep.hashtags?.tiktok ? " " + tags(ep.hashtags.tiktok) : ""}`.trim() },
  };
}

/**
 * Monta os `CreatePostInput` do Buffer (um por rede). `canais`: { youtube: id, instagram: id, tiktok: id };
 * `quando`: { youtube, instagram, tiktok } em ISO UTC; `lembrete`: true usa schedulingType "notification" (você publica pelo app).
 */
export function montarPosts({ marca, ep, canais, videoUrl, quando, redes = ["youtube", "instagram", "tiktok"], lembrete = false, miniaturaMs }) {
  const t = textosPorRede({ marca, ep });
  const cfg = marca.publicacao?.buffer || {};
  const miniatura = miniaturaMs ?? cfg.miniaturaMs ?? 1000;
  const base = (rede) => ({
    channelId: canais[rede],
    schedulingType: lembrete ? "notification" : "automatic",
    mode: "customScheduled",
    dueAt: quando[rede] || quando.todas,
    needsApproval: false,
    source: "praeko-studio",
    assets: [{ video: { url: videoUrl, metadata: rede === "youtube" ? undefined : { thumbnailOffset: miniatura } } }],
  });
  const out = [];
  for (const rede of redes) {
    if (!t[rede]) throw new Error(`rede desconhecida: ${rede}`);
    const p = { ...base(rede), text: t[rede].texto };
    if (rede === "youtube") {
      p.metadata = { youtube: { title: t.youtube.titulo, madeForKids: false, notifySubscribers: cfg.youtube?.avisarInscritos ?? true, categoryId: String(cfg.youtube?.categoriaId ?? "28"), ...(cfg.youtube?.privacidade ? { privacy: cfg.youtube.privacidade } : {}) } };
    } else if (rede === "instagram") {
      p.metadata = { instagram: { type: "reel", shouldShareToFeed: true, ...(cfg.primeiroComentario && t.instagram.comentarioFixo ? { firstComment: t.instagram.comentarioFixo } : {}) } };
    } else p.metadata = { tiktok: {} };
    if (!p.dueAt) throw new Error(`sem horário para ${rede}`);
    out.push({ rede, input: JSON.parse(JSON.stringify(p)) });
  }
  return out;
}

/** Chamada GraphQL. Lança com a mensagem do Buffer em caso de erro. */
export async function gql(consulta, variaveis, { chave, fetchFn = fetch } = {}) {
  if (!chave) throw new Error("sem chave do Buffer (PRAEKO_STUDIO_KEY_BUFFER_PRINCIPAL, Chaveiro do macOS ou `praeko studio agendar --chave`)");
  const r = await fetchFn(ENDPOINT, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${chave}` }, body: JSON.stringify({ query: consulta, variables: variaveis || {} }) });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { throw new Error(`Buffer respondeu ${r.status}: ${txt.slice(0, 200)}`); }
  if (!r.ok || j.errors?.length) throw new Error(`Buffer: ${(j.errors || []).map((e) => e.message).join("; ") || r.status}`);
  return j.data;
}

const Q_CANAIS = `query { account { organizations { id name } } }`;
const Q_CANAIS_ORG = `query($org: OrganizationId!) { channels(input: { organizationId: $org }) { id name displayName service isQueuePaused } }`;
/** Todos os canais conectados: [{ id, nome, servico, org }]. */
export async function listarCanais(op) {
  const d = await gql(Q_CANAIS, {}, op);
  const lista = [];
  for (const o of d.account.organizations) {
    const c = await gql(Q_CANAIS_ORG, { org: o.id }, op);
    for (const x of c.channels) lista.push({ id: x.id, nome: x.displayName || x.name, servico: x.service, org: o.name, pausado: !!x.isQueuePaused });
  }
  return lista;
}

/** Descobre o canal de cada rede: o configurado em marca.publicacao.buffer.canais ou o único do serviço. */
export function escolherCanais({ marca, canais, redes }) {
  const cfg = marca.publicacao?.buffer?.canais || {};
  const saida = {}, faltam = [];
  for (const r of redes) {
    if (cfg[r]) { saida[r] = cfg[r]; continue; }
    const ach = canais.filter((c) => c.servico === r);
    if (ach.length === 1) saida[r] = ach[0].id;
    else faltam.push(ach.length ? `${r}: ${ach.length} canais (${ach.map((c) => `${c.nome}=${c.id}`).join(", ")}); fixe um em marca.publicacao.buffer.canais.${r}` : `${r}: nenhum canal conectado no Buffer`);
  }
  return { canais: saida, faltam };
}

const M_CRIAR = `mutation($input: CreatePostInput!) { createPost(input: $input) { ... on PostActionSuccess { post { id dueAt } } ... on MutationError { message } } }`;
const M_APAGAR = `mutation($id: PostId!) { deletePost(input: { id: $id }) { ... on DeletePostSuccess { __typename } ... on MutationError { message } } }`;

export async function criarPost(input, op) {
  const d = await gql(M_CRIAR, { input }, op);
  const r = d.createPost;
  if (r.message) throw new Error(`Buffer recusou o post: ${r.message}`);
  return r.post;
}
export async function apagarPost(id, op) {
  const d = await gql(M_APAGAR, { id }, op);
  if (d.deletePost?.message) throw new Error(`Buffer não apagou ${id}: ${d.deletePost.message}`);
  return true;
}

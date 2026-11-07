// @praeko/core: pacote de publicação por plataforma (título, descrição, legendas, UTM, hashtags, comentário fixo, conferência).
// Nada aqui conhece um canal: tudo vem de `praeko.json` (links, hashtags, limites) e do `publicacao.json` do vídeo.

export const PADRAO = {
  utm: { instagram: ["instagram", "bio"], youtube: ["youtube", "short"], tiktok: ["tiktok", "bio"] },
  limites: { youtubeTitulo: 100, youtubeDescricao: 5000, instagram: 2200, tiktok: 2200, hashtagsInstagram: 30 },
  hashtagsProibidas: [],
  // marcas de texto escrito por IA (a skill copywriting do projeto proíbe)
  marcasDeIA: [
    { re: /\bnão é [^.!?]{1,45}, é\s/i, aviso: 'structure "it is not X, it is Y"' },
    { re: /\bsem [^,.!?]{1,25}, sem [^,.!?]{1,25}, sem\b/i, aviso: 'list "no X, no Y, no Z"' },
  ],
};

/** Link com UTM. `plataforma`: instagram | youtube | tiktok; `formato`: "short" ou "longo" (muda o medium do YouTube). */
export function link(config: any, { plataforma, destino = "main", campanha, formato }: any) {
  const base = config.links?.[destino];
  if (!base) return null; // links are optional: without a configured link the package simply carries no tracked link
  const u = { ...PADRAO.utm, ...(config.utm || {}) };
  let [fonte, midia] = u[plataforma] || [plataforma, "bio"];
  if (plataforma === "youtube" && formato) midia = formato === "longo" ? "long" : formato;
  const q = new URLSearchParams({ utm_source: fonte, utm_medium: midia });
  if (campanha) q.set("utm_campaign", campanha);
  return `${base}${base.includes("?") ? "&" : "?"}${q.toString()}`;
}

const tags = (l: any) => (l || []).join(" ");
export const linkLine = (url: string | null) => (url ? [`🔗 Link: ${url}`] : []);

/** Segundos → "m:ss" (ou "h:mm:ss"). */
export const mmss = (s: any) => { const t = Math.round(s), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; };
/** `[{ t, titulo }]` (t em s) → linhas "0:00 Título" para a descrição do YouTube. */
export const capitulos = (lista: any) => lista.map((c: any) => `${mmss(c.t)} ${c.titulo}`).join("\n");
/** Regras do YouTube para virar capítulos: começa em 0:00, pelo menos 3, cada um com 10 s ou mais. */
export function validarCapitulos(lista: any) {
  const e: any[] = [];
  if (!lista?.length) return e;
  if (lista.length < 3) e.push(`${lista.length} chapter(s): YouTube only creates chapters with 3 or more`);
  if (Math.round(lista[0].t) !== 0) e.push("the first chapter must start at 0:00");
  for (let i = 1; i < lista.length; i++) if (lista[i].t - lista[i - 1].t < 10) e.push(`chapter "${lista[i - 1].titulo}" lasts ${(lista[i].t - lista[i - 1].t).toFixed(1)} s (minimum 10 s)`);
  return e;
}

/** Confere limites, hashtags proibidas e marcas de IA. Devolve `{ erros, avisos }`. */
export function validar({ config, ep }: any) {
  const L = { ...PADRAO.limites, ...(config.limites || {}) };
  const proibidas = [...PADRAO.hashtagsProibidas, ...(config.hashtags?.proibidas || [])].map((h) => h.toLowerCase());
  const permitidas = (config.hashtags?.permitidas || []).map((h: any) => h.toLowerCase());
  const erros = [], avisos = [];
  const yt = `${ep.yt?.descricao || ""}\n${ep.capitulos ? capitulos(ep.capitulos) : ""}\n${tags(ep.hashtags?.youtube)}`;
  for (const x of validarCapitulos(ep.capitulos)) erros.push(`chapters: ${x}`);
  if ((ep.titulo || "").length > L.youtubeTitulo) erros.push(`title has ${ep.titulo.length} characters (limit ${L.youtubeTitulo})`);
  if (yt.length > L.youtubeDescricao) erros.push(`YouTube description has ${yt.length} characters (limit ${L.youtubeDescricao})`);
  const ig = `${ep.ig?.legenda || ""}\n${tags(ep.hashtags?.instagram)}`;
  if (ig.length > L.instagram) erros.push(`Instagram caption has ${ig.length} characters (limit ${L.instagram})`);
  const tk = `${ep.tiktok?.legenda || ""}\n${tags(ep.hashtags?.tiktok)}`;
  if (tk.length > L.tiktok) avisos.push(`TikTok caption has ${tk.length} characters (suggested limit ${L.tiktok})`);
  if ((ep.hashtags?.instagram || []).length > L.hashtagsInstagram) erros.push(`more than ${L.hashtagsInstagram} hashtags on Instagram`);
  for (const [pl, hs] of Object.entries((ep.hashtags || {}) as Record<string, string[]>)) for (const h of hs) {
    if (proibidas.includes(h.toLowerCase())) erros.push(`banned hashtag on ${pl}: ${h}`);
    else if (permitidas.length && !permitidas.includes(h.toLowerCase())) avisos.push(`hashtag outside the allowed list on ${pl}: ${h}`);
  }
  const tudo = [ep.titulo, ...(ep.alternativas || []), ep.yt?.descricao, ep.ig?.legenda, ep.ig?.comentarioFixo, ep.tiktok?.legenda, ep.respostaComentario].filter(Boolean).join("\n");
  for (const m of PADRAO.marcasDeIA) if (m.re.test(tudo)) avisos.push(`AI writing tic: ${m.aviso}`);
  return { erros, avisos };
}

/** Monta o `textos.md` do episódio. */
export function pacote({ config, ep }: any) {
  const camp = ep.campanha;
  const lk = (plataforma: any) => link(config, { plataforma, campanha: camp, formato: ep.formato || "short" });
  const v = validar({ config, ep });
  const o = [];
  o.push(`# ${ep.nome || ep.titulo} (pacote de publicação, ${ep.data || ""})`.replace(/ \(pacote de publicação, \)/, " (pacote de publicação)"));
  o.push("");
  o.push(`**Nada publicado.**${ep.arquivos?.video ? ` Vídeo: \`${ep.arquivos.video}\`` : ""}${ep.arquivos?.capa ? `. Capa: \`${ep.arquivos.capa}\`` : ""}.${ep.publicarEm ? ` Publicar: ${ep.publicarEm}.` : ""}`);
  o.push("", "## Antes de publicar");
  (ep.antesDePublicar || ["Assistir com som."]).forEach((x: any, i: any) => o.push(`${i + 1}. ${x}`));
  if (lk("youtube")) o.push(`${(ep.antesDePublicar || [1]).length + 1}. Links com marcação: \`${lk("instagram")}\` · \`${lk("youtube")}\` · \`${lk("tiktok")}\``);
  if (v.erros.length || v.avisos.length) {
    o.push("", "## Conferência automática");
    v.erros.forEach((e) => o.push(`- ERRO: ${e}`));
    v.avisos.forEach((e) => o.push(`- aviso: ${e}`));
  }
  if (ep.formato === "longo") {
    o.push("", "---", "", "## YouTube (longo): título", `**Sugerido:** \`${ep.titulo}\``);
    if (ep.alternativas?.length) o.push(`Alternativas: ${ep.alternativas.map((a: any) => `\`${a}\``).join(" · ")}`);
    o.push("", "**Descrição**", "```", ep.yt?.descricao || "", "");
    if (ep.capitulos?.length) o.push("⏱ Capítulos", capitulos(ep.capitulos), "");
    o.push(...linkLine(lk("youtube")), "", tags(ep.hashtags?.youtube), "```");
    if (ep.yt?.comentarioFixo) o.push("**Comentário para fixar:**", "```", ep.yt.comentarioFixo, "```");
    o.push("", "## Instagram (Reel do longo): legenda", "Capa vertical: `" + (ep.arquivos?.capaVertical || "capa vertical") + "`", "```", `${ep.ig?.legenda || ""}${ep.hashtags?.instagram ? " " + tags(ep.hashtags.instagram) : ""}`, "```");
    if (ep.ig?.comentarioFixo) o.push("**Comentário para fixar:**", "```", ep.ig.comentarioFixo, "```");
    if (ep.fatos?.length) { o.push("", "---", "", "## Conferido contra os fatos"); ep.fatos.forEach((x: any) => o.push(`- ${x}`)); }
    return o.join("\n") + "\n";
  }
  o.push("", "---", "", "## Instagram (Reels): legenda", "```", `${ep.ig?.legenda || ""}${ep.hashtags?.instagram ? " " + tags(ep.hashtags.instagram) : ""}`, "```");
  if (ep.ig?.comentarioFixo) o.push("**Comentário para fixar:**", "```", ep.ig.comentarioFixo, "```");
  o.push("", "## TikTok", "```", `${ep.tiktok?.legenda || ""}${ep.hashtags?.tiktok ? " " + tags(ep.hashtags.tiktok) : ""}`, "```");
  o.push("", "## YouTube Shorts: título", `**Sugerido:** \`${ep.titulo}\``);
  if (ep.alternativas?.length) o.push(`Alternativas: ${ep.alternativas.map((a: any) => `\`${a}\``).join(" · ")}`);
  o.push("", "**Descrição**", "```", ep.yt?.descricao || "", "");
  if (ep.artigo) o.push(`📖 Artigo completo: ${ep.artigo}`);
  if (ep.videoCompleto) o.push(`▶️ Completo: ${ep.videoCompleto}`);
  o.push(...linkLine(lk("youtube")), "", tags(ep.hashtags?.youtube), "```");
  if (ep.respostaComentario) o.push("", "## Resposta sugerida ao comentário original", "```", ep.respostaComentario, "```");
  if (ep.fatos?.length) { o.push("", "---", "", "## Conferido contra os fatos"); ep.fatos.forEach((x: any) => o.push(`- ${x}`)); }
  return o.join("\n") + "\n";
}

export * from "./buffer.ts";
export * as hospedagem from "./hospedagem.ts";
export * as capaQuadro from "./capa-quadro.ts";
export * from "./fila.ts";
export * from "./config.ts";
export * from "./segredos.ts";
export * from "./estado.ts";
export * from "./contexto.ts";
export * from "./publicador.ts";
export * as provedores from "./provedores/registro.ts";
export * as adaptadores from "./adaptadores/index.ts";

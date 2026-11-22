// Horário e textos de cada rede, compartilhados pelo CLI, pelos provedores e pelo cliente remoto.
import { capitulos, link, linkLine } from "./index.ts";

/** Nomes curtos aceitos em --redes. */
export { REDES } from "./contrato.ts";
const tags = (l: any) => (l || []).join(" ");

/** "06/11 17:30" | "06/11/2026 17:30" | "2026-11-06T17:30" | ISO com fuso → ISO UTC. `fuso` padrão "-03:00" (Brasil não tem horário de verão desde 2019). */
export function parseQuando(txt: any, { fuso = "-03:00", agora = new Date() }: any = {}) {
  const s = String(txt).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?[ T]+(\d{1,2}):(\d{2})$/);
  let iso;
  if (m) {
    let ano = m[3] ? +m[3] : agora.getFullYear();
    const mk = (a: any) => `${a}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}T${String(m[4]).padStart(2, "0")}:${m[5]}:00${fuso}`;
    iso = mk(ano);
    if (!m[3] && new Date(iso) < agora) iso = mk(ano + 1); // sem ano e já passou: próximo ano
  } else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(s)) iso = s.replace(" ", "T") + (s.length === 16 ? ":00" : "") + fuso;
  else if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/.test(s)) iso = s;
  else throw new Error(`data inválida: "${txt}" (use "06/11 17:30", "06/11/2026 17:30" ou "2026-11-06T17:30")`);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`data inválida: "${txt}"`);
  return d.toISOString();
}

/** Textos de cada rede (os mesmos que o `textos.md` mostra). */
export function textosPorRede({ config, ep }: any) {
  const lk = (plataforma: any) => link(config, { plataforma, campanha: ep.campanha, formato: ep.formato || "short" });
  const longo = ep.formato === "longo";
  const yt = [ep.yt?.descricao || ""];
  if (ep.capitulos?.length) yt.push("", "⏱ Capítulos", capitulos(ep.capitulos));
  if (!longo && ep.artigo) yt.push("", `📖 Artigo completo: ${ep.artigo}`);
  if (!longo && ep.videoCompleto) yt.push(`▶️ Completo: ${ep.videoCompleto}`);
  yt.push("", ...linkLine(lk("youtube")), "", tags(ep.hashtags?.youtube));
  return {
    youtube: { titulo: ep.titulo, texto: yt.join("\n").trim(), comentarioFixo: ep.yt?.comentarioFixo },
    instagram: { texto: `${ep.ig?.legenda || ""}${ep.hashtags?.instagram ? " " + tags(ep.hashtags.instagram) : ""}`.trim(), comentarioFixo: ep.ig?.comentarioFixo },
    tiktok: { texto: `${ep.tiktok?.legenda || ep.ig?.legenda || ""}${ep.hashtags?.tiktok ? " " + tags(ep.hashtags.tiktok) : ""}`.trim() },
  };
}

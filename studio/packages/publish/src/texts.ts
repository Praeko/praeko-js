// Texts for each network, ready for the queue and for Praeko.
import { formatChapters, labels, link, linkLine } from "./index.ts";
import type { Brand, NetworkName, Publication, Texts } from "./types.ts";

const tags = (l?: string[]) => (l || []).join(" ");

/** Texts for each network (the same ones `texts.md` shows). */
export function textsByNetwork({ brand, publication }: { brand: Brand; publication: Publication }): Texts {
  const p = publication, R = labels(brand);
  const lk = (platform: NetworkName) => link(brand, { platform, campaign: p.campaign, format: p.format || "short" });
  const long = p.format === "long";
  const yt = [p.yt?.description || ""];
  if (p.chapters?.length) yt.push("", `⏱ ${R.chapters}`, formatChapters(p.chapters));
  if (!long && p.article) yt.push("", `📖 ${R.article}: ${p.article}`);
  if (!long && p.fullVideo) yt.push(`▶️ ${R.fullVideo}: ${p.fullVideo}`);
  yt.push("", ...linkLine(brand, () => lk("youtube")), "", tags(p.hashtags?.youtube));
  return {
    youtube: { title: p.title, text: yt.join("\n").trim(), pinnedComment: p.yt?.pinnedComment },
    instagram: { text: `${p.ig?.caption || ""}${p.hashtags?.instagram ? " " + tags(p.hashtags.instagram) : ""}`.trim(), pinnedComment: p.ig?.pinnedComment },
    tiktok: { text: `${p.tiktok?.caption || p.ig?.caption || ""}${p.hashtags?.tiktok ? " " + tags(p.hashtags.tiktok) : ""}`.trim() },
  };
}

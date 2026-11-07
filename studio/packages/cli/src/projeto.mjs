// Descoberta do projeto: sobe pastas até achar `marca.json` (ao lado de `src/index.ts`).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function acharProjeto(a = process.cwd()) {
  let d = resolve(a);
  for (;;) {
    if (existsSync(join(d, "marca.json")) && existsSync(join(d, "src", "index.ts"))) return { raiz: d, marca: JSON.parse(readFileSync(join(d, "marca.json"), "utf8")) };
    const p = dirname(d);
    if (p === d) throw new Error("não achei um projeto do Praeko Studio (pasta com marca.json e src/index.ts). Rode `praeko studio init <pasta>` ou entre na pasta do projeto.");
    d = p;
  }
}
export const pascal = (slug) => slug.split(/[^a-zA-Z0-9]+/).filter(Boolean).map((s) => s[0].toUpperCase() + s.slice(1)).join("");
export function episodio(proj, slug) {
  const pasta = join(proj.raiz, "episodios", slug);
  if (!existsSync(pasta)) throw new Error(`episódio "${slug}" não existe (${pasta}). Crie com: praeko studio novo ${slug}`);
  const info = existsSync(join(pasta, "episodio.json")) ? JSON.parse(readFileSync(join(pasta, "episodio.json"), "utf8")) : { id: pascal(slug), capa: `Capa${pascal(slug)}` };
  return { slug, pasta, ...info, mp4: join(proj.raiz, "out", `${slug}.mp4`), png: join(proj.raiz, "out", `${slug}-capa.png`) };
}

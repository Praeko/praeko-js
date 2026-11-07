// Peças compartilhadas pelos geradores de longo e de Short: tema, fontes, tempo por frase, assets.
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const VERSAO_HF = "0.9.13";
export const f2 = (x) => +Number(x).toFixed(2);
export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/** Instante (s) em que a frase começa na voz a partir de `from`; -1 se não existe (mesma regra do `praeko studio compilar`). */
export function achar(palavras, frase, nth = 0, from = 0) {
  const f = String(frase).split(/\s+/).map(norm).filter(Boolean), W = palavras.map((p) => norm(p.t));
  let c = 0;
  for (let k = 0; k <= W.length - f.length; k++) if (palavras[k].a >= from && f.every((w, j) => W[k + j] === w)) { if (c === nth) return palavras[k].a; c++; }
  return -1;
}

const TEMA_PADRAO = {
  fundo: "#14110f", fundoCapa: "#0e0c14", destaque: "#f4b942", texto: "#f3ece0", suave: "#a89c8a", ok: "#7ee787", erro: "#ff6b5e",
  info: "#7fd7ff", extra: "#a98bff", caixa: "#2a2118", codigo: "#1b1610",
  fonte: "'Arial Black', 'Helvetica Neue', system-ui, sans-serif", mono: "Menlo, 'Courier New', monospace", handle: "@seucanal", avatar: "capa/avatar.png",
};
/** Mesma leitura do `temaDaMarca` do @praeko/studio-core (que é TSX e não roda em Node). */
export function temaDaMarca(m = {}) {
  return { ...TEMA_PADRAO, ...(m.cores || {}), ...(m.fontes?.titulo ? { fonte: m.fontes.titulo } : {}), ...(m.fontes?.mono ? { mono: m.fontes.mono } : {}), ...(m.handle ? { handle: m.handle } : {}), ...(m.avatar ? { avatar: m.avatar } : {}) };
}
export const cor = (T, c) => (c ? (T[c] && !String(c).startsWith("#") ? T[c] : c) : undefined);

const EMBUTIDAS = ["Inter", "Montserrat", "Outfit", "Nunito", "Oswald", "League Gothic", "Archivo Black", "Space Mono", "IBM Plex Mono", "JetBrains Mono", "EB Garamond", "Playfair Display", "Source Code Pro", "Noto Sans JP", "Roboto", "Open Sans", "Lato", "Poppins"];
const primeira = (stack) => String(stack).split(",")[0].trim().replace(/^['"]|['"]$/g, "");
/**
 * Fontes do HyperFrames: só as embutidas resolvem pelo nome. Por padrão a fonte da marca vira a embutida mais próxima
 * (Arial Black → Montserrat 900; Menlo → JetBrains Mono), o que é portátil. Com `marca.hyperframes.fontesLocais: true`
 * a fonte da marca é carregada do sistema (`local()`), com a embutida como reserva: paridade exata com o Remotion nesta máquina.
 */
export function fontes(marca = {}, T = temaDaMarca(marca)) {
  const locais = !!marca.hyperframes?.fontesLocais;
  const titulo = primeira(T.fonte), mono = primeira(T.mono);
  const heavy = /black|heavy|extrabold|impact/i.test(titulo);
  const resp = (nome, embutida) => (EMBUTIDAS.includes(nome) ? { fam: `'${nome}'`, face: "" } : locais ? { fam: `'Studio ${embutida}', '${embutida}'`, face: `@font-face{font-family:"Studio ${embutida}";src:local("${nome}"),local("${nome.replace(/\s+/g, "-")}");font-weight:100 900}` } : { fam: `'${embutida}'`, face: "" });
  const t = resp(titulo, "Montserrat"), m = resp(mono, "JetBrains Mono");
  return { titulo: `${t.fam}, sans-serif`, mono: `${m.fam}, monospace`, peso: heavy || !EMBUTIDAS.includes(titulo) ? 900 : 700, faces: [t.face, m.face].filter(Boolean).join("") };
}

/** Tempo (s) a partir de: número · "frase" · { quando, nth, depois, mais } (as formas que o `praeko studio compilar` deixa no spec). */
export function resolvedor(palavras) {
  return (q, fallback = 0) => {
    if (q === undefined || q === null) return fallback;
    if (typeof q === "number") return q;
    const o = typeof q === "string" ? { quando: q } : q;
    const t = achar(palavras, o.quando, o.nth ?? 0, o.depois ?? 0);
    if (t < 0) throw new Error(`frase "${o.quando}" não aparece na voz (palavras.json)`);
    return f2(t + (o.mais ?? 0));
  };
}

/** Itens (recursivos) que dependem de TSX: `componente` nas cenas e nos itens. */
export function componentesDoSpec(spec) {
  const achados = [];
  (spec.cenas ?? []).forEach((c, i) => { if (c.componente) achados.push({ cena: i + 1, titulo: c.titulo ?? c.rotulo ?? "", componente: c.componente }); });
  return achados;
}
export class ErroHF extends Error {}
export function exigirSemComponentes(slug, spec) {
  const a = componentesDoSpec(spec);
  if (!a.length) return;
  throw new ErroHF(`"${slug}" usa \`componente:\` (TSX) e o HyperFrames só renderiza cenas declarativas. Cenas: ${a.map((x) => `${x.cena}${x.titulo ? ` (${x.titulo})` : ""} → ${x.componente}`).join("; ")}. Converta para itens no episodio.yaml ou renderize com --motor remotion.`);
}

/** Copia só os assets referenciados (caminhos relativos ao publicDir) para <projeto>/assets/. Falta de arquivo vira erro claro. */
export function copiarAssets({ publico, saida, caminhos, avisos = [] }) {
  const lista = [...new Set(caminhos.filter(Boolean))];
  for (const rel of lista) {
    const de = resolve(publico, rel), para = join(saida, "assets", rel);
    if (!existsSync(de)) throw new ErroHF(`asset "${rel}" não existe em ${publico}`);
    mkdirSync(dirname(para), { recursive: true });
    if (!existsSync(para) || statSync(para).size !== statSync(de).size) copyFileSync(de, para);
  }
  return lista;
}

export const ARQUIVOS_HF = (nome) => ({
  "hyperframes.json": JSON.stringify({ $schema: "https://hyperframes.heygen.com/schema/hyperframes.json", registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry", paths: { blocks: "compositions", components: "compositions/components", assets: "assets" }, media: { autoProxy: true } }, null, 2) + "\n",
  "meta.json": JSON.stringify({ id: nome, name: nome, createdAt: "2026-01-01T00:00:00.000Z" }, null, 2) + "\n",
  "package.json": JSON.stringify({ name: nome, private: true, type: "module", scripts: { dev: `npx --yes hyperframes@${VERSAO_HF} preview`, check: `npx --yes hyperframes@${VERSAO_HF} check`, render: `npx --yes hyperframes@${VERSAO_HF} render` } }, null, 2) + "\n",
});

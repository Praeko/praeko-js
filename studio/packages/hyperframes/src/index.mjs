// @praeko/studio-hyperframes: segundo motor de render do Praeko Studio. Lê o episódio compilado e gera um projeto HyperFrames (HTML + GSAP).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ARQUIVOS_HF, ErroHF, VERSAO_HF, copiarAssets, componentesDoSpec, exigirSemComponentes, fontes, temaDaMarca } from "./comum.mjs";
import { gerarLongo } from "./longo.mjs";
import { gerarShort, agrupar } from "./short.mjs";

export { ErroHF, VERSAO_HF, componentesDoSpec, exigirSemComponentes, fontes, temaDaMarca, agrupar };

const lerJson = (arq, padrao) => (existsSync(arq) ? JSON.parse(readFileSync(arq, "utf8")) : padrao);
export const ehLongo = (spec) => !spec.fechamento;

/** Escolha do motor: --motor > `motor:` do episodio.yaml (vai no spec) > `motor` da marca > remotion. */
export function escolherMotor({ flag, spec, marca }) {
  const m = flag ?? spec?.motor ?? marca?.motor ?? "remotion";
  if (!["remotion", "hyperframes"].includes(m)) throw new ErroHF(`motor "${m}" não existe (use remotion ou hyperframes)`);
  return m;
}

/**
 * Gera o projeto HyperFrames de um episódio em <raiz>/.hf/<slug>/ (ou `saida`).
 * Pré-requisito: `praeko studio compilar` (episodio.spec.json) e `praeko studio voz` (palavras.json).
 */
export function gerarProjeto({ raiz, slug, saida, marca }) {
  const pasta = join(raiz, "episodios", slug);
  const arqSpec = join(pasta, "episodio.spec.json");
  if (!existsSync(arqSpec)) throw new ErroHF(`falta ${arqSpec}: rode \`praeko studio compilar ${slug}\``);
  const spec = JSON.parse(readFileSync(arqSpec, "utf8"));
  const palavras = lerJson(join(pasta, "palavras.json"), []);
  if (!palavras.length) throw new ErroHF(`falta palavras.json em ${pasta}: rode \`praeko studio voz ${slug}\``);
  const blocos = lerJson(join(pasta, "blocos.json"), []);
  marca = marca ?? lerJson(join(raiz, "marca.json"), {});
  const T = temaDaMarca(marca), F = fontes(marca, T);
  const publico = resolve(raiz, marca.publico || "public");
  const dir = resolve(saida ?? join(raiz, ".hf", slug));

  exigirSemComponentes(slug, spec);
  const longo = ehLongo(spec);
  const r = longo ? gerarLongo({ spec, palavras, blocos, marca, T, F, slug }) : gerarShort({ spec, palavras, marca, T, F, slug });

  rmSync(join(dir, "compositions"), { recursive: true, force: true });
  rmSync(join(dir, "index.html"), { force: true });
  mkdirSync(dir, { recursive: true });
  for (const [nome, txt] of Object.entries({ ...ARQUIVOS_HF(`${slug}-hf`), ...r.arquivos })) {
    const arq = join(dir, nome);
    if (nome.startsWith("compositions/") || nome === "index.html" || !existsSync(arq)) { mkdirSync(dirname(arq), { recursive: true }); writeFileSync(arq, txt); }
  }
  const assets = copiarAssets({ publico, saida: dir, caminhos: r.assets });
  return { dir, formato: longo ? "longo" : "short", durS: r.durS, cenas: r.cenas, assets, arquivos: Object.keys(r.arquivos) };
}

/** Resume o JSON do `hyperframes check --json` (erros e avisos) em linhas curtas. */
export function resumirCheck(json) {
  const achados = [];
  for (const sec of ["lint", "runtime", "layout", "motion", "contrast", "craft", "audio", "hdr"]) {
    for (const f of json?.[sec]?.findings ?? []) achados.push({ nivel: f.severity, sec, codigo: f.code, msg: String(f.message ?? "").slice(0, 160), quando: f.time ?? f.timestamp });
  }
  const erros = achados.filter((x) => x.nivel === "error"), avisos = achados.filter((x) => x.nivel === "warning");
  const porCodigo = {};
  for (const a of avisos) porCodigo[a.codigo] = (porCodigo[a.codigo] ?? 0) + 1;
  return { ok: erros.length === 0, erros, avisos, porCodigo };
}

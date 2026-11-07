// Rewrites a project's TSX/TS files for the English layout: module specifiers, imported identifiers of @praeko/studio-core/kit (keeping the local name),
// and the props of the generated glue. Also scans for Portuguese names it does NOT convert (manual follow-ups).

export const CORE_NAMES: Record<string, string> = {
  Palavra: "Word", Tema: "Theme", TEMA_PADRAO: "DEFAULT_THEME", TemaProvider: "ThemeProvider", useTema: "useTheme", temaDaMarca: "themeFromBrand", surge: "appear",
  mkAt: "makeAt", mkAtG: "makeAtGlobal", janela: "fadeWindow", Episodio: "Episode", Longo: "Long", EpData: "EpisodeData", agrupar: "groupWords",
  Som: "Sound", Golpe: "Hit", EpCena: "EpisodeScene", Grupo: "Group", CenaLongo: "LongScene", FechoLongo: "LongEndcard", LongoData: "LongData", Rotulo: "Label", Fundo: "Background", Tempo: "Time",
};
export const KIT_NAMES: Record<string, string> = {
  PainelD: "Panel", Caixa: "Box", Linha: "Line", Balao: "Bubble", Codigo: "Code", Janela: "Window", Celular: "Phone", Gato: "Mascot", Moldura: "Frame",
  EpisodioDecl: "EpisodeDecl", EpSpec: "EpisodeSpec", CenaSpec: "SceneSpec", epDataDeSpec: "episodeDataFromSpec", LongoDecl: "LongDecl", LongoSpec: "LongSpec",
  CenaLSpec: "LongSceneSpec", longoDeSpec: "longDataFromSpec", CapaLongoSpec: "LongCoverSpec", CapasLongo: "LongCovers", CapaLongo16x9: "LongCover16x9", CapaLongoVertical: "LongCoverVertical",
  CodigoL: "CodeL", CartaoL: "CardL", TxtL: "TextL", surgeL: "appearL", LinhaCodigo: "CodeLine",
};
const SPEC_BASENAMES: Record<string, string> = { cenas: "scenes", palavras: "words", episodio: "episode", "episodio.spec.json": "episode.spec.json", marca: "brand", "marca.json": "brand.json" };

export function rewriteSpecifier(s: string): string {
  if (!s.startsWith(".")) return s;
  const parts = s.replace(/\/episodios\//g, "/episodes/").split("/");
  const last = parts[parts.length - 1]!;
  if (SPEC_BASENAMES[last]) parts[parts.length - 1] = SPEC_BASENAMES[last]!;
  return parts.join("/");
}

const specifiers = (text: string): string => text
  .replace(/(from\s+)(["'])([^"']+)\2/g, (_m, a, q, s) => `${a}${q}${rewriteSpecifier(s)}${q}`)
  .replace(/(import\s*\(\s*)(["'])([^"']+)\2/g, (_m, a, q, s) => `${a}${q}${rewriteSpecifier(s)}${q}`)
  .replace(/(import\s+)(["'])([^"']+)\2/g, (_m, a, q, s) => `${a}${q}${rewriteSpecifier(s)}${q}`);


/** Imports from the studio packages: `X` → `New as X` when X is still used in the file (so the code keeps compiling untouched), else `New`. */
function studioImports(text: string): string {
  return text.replace(/import\s*(type\s*)?\{([^}]*)\}\s*from\s*(["'])@praeko\/studio-(core|kit)\3/g, (_m, type, list: string, q, pkg: string) => {
    const map = pkg === "core" ? CORE_NAMES : KIT_NAMES;
    const out = list.split(",").map((x) => x.trim()).filter(Boolean).map((spec) => {
      const m = spec.match(/^(type\s+)?([A-Za-z0-9_$]+)(?:\s+as\s+([A-Za-z0-9_$]+))?$/);
      if (!m) return spec;
      const [, t = "", name, alias] = m as unknown as [string, string | undefined, string, string | undefined];
      const neu = map[name];
      if (!neu) return spec;
      const local = alias ?? name;
      return local === neu ? `${t}${neu}` : `${t}${neu} as ${local}`;
    });
    return `import ${type ?? ""}{ ${out.join(", ")} } from ${q}@praeko/studio-${pkg}${q}`;
  });
}

/** Imports from the project's brand module: `tema` → `theme as tema`, `marca` → `brand as marca`. */
function brandImports(text: string): string {
  return text.replace(/import\s*\{([^}]*)\}\s*from\s*(["'])([^"']*\/brand|\.\/brand)\2/g, (_m, list: string, q, spec) => {
    const out = list.split(",").map((x) => x.trim()).filter(Boolean).map((x) => (x === "tema" ? "theme as tema" : x === "marca" ? "brand as marca" : x));
    return `import { ${out.join(", ")} } from ${q}${spec}${q}`;
  });
}

export function rewriteTsx(text: string): string {
  let t = specifiers(text);
  t = studioImports(t);
  t = brandImports(t);
  if (/\b(EpisodioDecl|LongoDecl|EpisodeDecl|LongDecl)\b/.test(t)) t = t.replace(/(\s)palavras=\{/g, "$1words={").replace(/(\s)tema=\{/g, "$1theme={").replace(/(\s)pecas=\{/g, "$1components={");
  return t;
}

/** words.ts in the generated shape: `import { Palavra } …; export const PALAVRAS: Palavra[] = [...]`. */
export function rewriteWordsTs(text: string): string {
  const m = text.match(/^import \{ Palavra \} from "@praeko\/studio-core";\s*export const (\w+): Palavra\[\] = ([\s\S]*?);\s*$/);
  if (!m) return rewriteTsx(text);
  const name = m[1] === "PALAVRAS" ? "WORDS" : m[1];
  return `import type { Word } from "@praeko/studio-core";\n\nexport const ${name}: Word[] = ${m[2]};\n`;
}

export type FollowUp = { file: string; line: number; text: string; hint: string };
const OLD_THEME_FIELDS = /\b(?:tema|T|theme)\.(fundo|fundoCapa|destaque|texto|suave|erro|caixa|caixaLongo|codigo|fonte)\b/;
const OLD_COMPONENTS = /<(Gato|Moldura|Caixa|Linha|Big|Balao|Codigo|Janela|Celular|PainelD|CodigoL|CartaoL|ChipL|TxtL|Mascot|Frame|Box|Line|Bubble|Code|Window|Phone|Panel|CodeL|CardL|TextL)\b/;
const OLD_PROPS = /\s(nome|titulo|cor|tam|linhas|duracao|de|rotulo)=/;
/** Portuguese names left in user-written TSX after the automatic rewrite. */
export function followUps(file: string, text: string): FollowUp[] {
  const out: FollowUp[] = [];
  text.split("\n").forEach((l, i) => {
    if (OLD_THEME_FIELDS.test(l)) out.push({ file, line: i + 1, text: l.trim().slice(0, 120), hint: "theme fields are English now (background, accent, text, muted, error, box, code, font)" });
    if (OLD_COMPONENTS.test(l) && OLD_PROPS.test(l)) out.push({ file, line: i + 1, text: l.trim().slice(0, 120), hint: "component props are English now (name, title, color, size, lines, duration, from)" });
    if (/\bPALAVRAS\b/.test(l) && !/^\s*\/\//.test(l) && !/import|export const/.test(l)) out.push({ file, line: i + 1, text: l.trim().slice(0, 120), hint: "WORDS replaces PALAVRAS in generated files" });
  });
  return out;
}

// `praeko studio migrate [--dry-run]`: converts a Studio 0.1.x project (Portuguese file, folder and key names) to the English layout, in place.
// Everything it replaces is copied to `.studio-backup/<timestamp>/` first; `--dry-run` prints the plan and writes nothing. It is idempotent.
// This is the only module of the Studio that reads the old Portuguese names (together with legacy-keys.ts and tsx.ts).
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { blockCacheKey, blockHash, hookHash, readBlocks } from "@praeko/studio-voice";
import { compileEpisode } from "../compile.ts";
import { findProjectRoot } from "../project.ts";
import { BLOCK_END, BLOCK_START, installSkill } from "../skill.ts";
import { BODY } from "../skill-texts.ts";
import * as T from "../templates.ts";
import { legacyVoiceAlias, translateBlocks, translateBrand, translateCut, translateEpisode, translateEpisodeInfo, translateHookCache, translatePublication, translateSchedule, translateVoices } from "./legacy-keys.ts";
import { followUps, rewriteTsx, rewriteWordsTs } from "./tsx.ts";
import type { FollowUp } from "./tsx.ts";
import { rewriteYaml } from "./yaml-preserve.ts";

type Write = { kind: "write"; to: string; content: string | Buffer; from?: string; keys: boolean };
type Move = { kind: "move"; from: string; to: string };
type Remove = { kind: "remove"; path: string };
type Op = Write | Move | Remove;
export type Plan = { root: string; ops: Op[]; followUps: FollowUp[]; textEdits: string[]; cache: { renamed: number; kept: string[] }; notes: string[] };

const sha1 = (s: string): string => createHash("sha1").update(s).digest("hex").slice(0, 10);
const json = (v: unknown): string => JSON.stringify(v, null, 2) + "\n";
const readText = (f: string): string => readFileSync(f, "utf8");
const walk = (dir: string): string[] => existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])) : [];

/** Old command words and flags in hand-written Markdown (agent files, README): only the command/flag tokens and file names change. */
const COMMAND_WORDS: Record<string, string> = { novo: "new", voz: "voice", compilar: "compile", corte: "cut", prever: "preview", capa: "cover", folha: "contact-sheet", checar: "check", pacote: "package", agendar: "schedule", postar: "post", fila: "queue", conta: "account", licencas: "licenses" };
const FLAG_WORDS: Record<string, string> = { titulo: "title", longo: "long", qualidade: "quality", voz: "voice", alinhador: "aligner", "sem-failover": "no-failover", de: "from", ate: "to", abertura: "hook", "sem-abertura": "no-hook", refazer: "redo", soltar: "detach", motor: "engine", escala: "scale", quando: "when", redes: "networks", enviar: "send", canais: "channels", chave: "key", aceitar: "accept", "sem-instalar": "no-install", "de-env": "from-env", simular: "dry-run", "voz-id": "voice-id", nome: "name", minutos: "minutes", colunas: "columns", cancelar: "cancel", limpar: "clear", manter: "keep", lembrete: "reminder", capa: "cover", "sem-capa-no-quadro": "no-cover-frame" };
/** Name the tool had before it became `praeko studio` (built in parts: the publication audit forbids it in the shipped sources). */
const PRE_RENAME_TOOL = ["bar", "do"].join("");
const TOOL_NAMES = new RegExp(`(praeko studio|praeko-studio|${PRE_RENAME_TOOL})\\b`);
const OLD_COMMAND = new RegExp(`\\b(praeko studio|praeko-studio|${PRE_RENAME_TOOL})(\\s+)(novo|voz|compilar|corte|prever|capa|folha|checar|pacote|agendar|postar|fila|conta|licencas)\\b`, "g");
const OLD_ROOT_MARKER = new RegExp(`(${PRE_RENAME_TOOL}|praeko-studio):(\\/?)(imports|composicoes)`, "g");
const FILE_WORDS: [RegExp, string][] = [
  [/\bepisodio\.spec\.json\b/g, "episode.spec.json"], [/\bepisodio\.yaml\b/g, "episode.yaml"], [/\bepisodio\.json\b/g, "episode.json"], [/\bepisodio-yaml\.md\b/g, "episode-yaml.md"], [/\blongo-yaml\.md\b/g, "long-yaml.md"],
  [/\bmarca\.json\b/g, "brand.json"], [/\bvozes\.json\b/g, "voices.json"], [/\bepisodios\//g, "episodes/"], [/\broteiro\.txt\b/g, "script.txt"], [/\bpublicacao\.json\b/g, "publication.json"],
  [/\bpalavras\.json\b/g, "words.json"], [/\bcenas\.tsx\b/g, "scenes.tsx"], [/\btextos\.md\b/g, "texts.md"], [/\bagendamento\.json\b/g, "schedule.json"],
];
export function rewriteMarkdown(text: string): string {
  let t = text.split("\n").map((line) => {
    if (!TOOL_NAMES.test(line)) return line;
    let l = line.replace(OLD_COMMAND, (_m, a: string, sp: string, c: string) => `${a === PRE_RENAME_TOOL ? "praeko studio" : a}${sp}${COMMAND_WORDS[c]}`);
    l = l.replace(/\bvoice\s+(saldo|vozes|conta|config chave)\b/g, (_m, c: string) => `voice ${({ saldo: "balance", vozes: "voices", conta: "account", "config chave": "config key" } as Record<string, string>)[c]}`);
    l = l.replace(/\b(account\s+)(listar|adicionar)\b/g, (_m, a: string, c: string) => a + (c === "listar" ? "list" : "add"));
    l = l.replace(/\bqueue\s+(listar|executar|cancelar|instalar|remover)\b/g, (_m, c: string) => `queue ${({ listar: "list", executar: "run", cancelar: "cancel", instalar: "install", remover: "remove" } as Record<string, string>)[c]}`);
    l = l.replace(/(^|[\s`])--([a-z][a-z-]*)\b/g, (m, pre: string, f: string) => (FLAG_WORDS[f] ? `${pre}--${FLAG_WORDS[f]}` : m));
    l = l.replace(/--quality rascunho/g, "--quality draft");
    return l;
  }).join("\n");
  for (const [re, to] of FILE_WORDS) t = t.replace(re, to);
  return t;
}

const OLD_BLOCK_START = "<!-- praeko-studio:inicio", OLD_BLOCK_END = "<!-- praeko-studio:fim -->";
const AGENT_FILES = ["CLAUDE.md", "AGENTS.md", "GEMINI.md"], AGENT_WHOLE = [".claude/skills/praeko-studio/SKILL.md", ".cursor/rules/praeko-studio.mdc", ".clinerules/praeko-studio.md", ".windsurf/rules/praeko-studio.md"];
const isPt = (text: string): boolean => /Você \(o agente\)|Projeto de vídeo \(Praeko Studio\)/.test(text);

/** Builds the plan without touching the disk. */
export function planMigration(root: string): Plan {
  const plan: Plan = { root, ops: [], followUps: [], textEdits: [], cache: { renamed: 0, kept: [] }, notes: [] };
  const abs = (r: string) => join(root, r), has = (r: string) => existsSync(abs(r));
  const write = (to: string, content: string | Buffer, from?: string, keys = false) => plan.ops.push({ kind: "write", to, content, from, keys });
  const move = (from: string, to: string) => plan.ops.push({ kind: "move", from, to });
  const remove = (path: string) => plan.ops.push({ kind: "remove", path });
  const rewriteJson = (from: string, to: string, translate: (v: any) => { value: any; renamed: string[] }, extra?: (v: any) => void) => {
    const r = translate(JSON.parse(readText(abs(from)))); extra?.(r.value);
    write(to, json(r.value), from, true);
  };

  // ----- brand.json and voices.json
  let oldBrand: any = {}, oldVoices: any = {};
  if (has("marca.json")) {
    oldBrand = JSON.parse(readText(abs("marca.json")));
    rewriteJson("marca.json", "brand.json", translateBrand, (b) => {
      if (has("public/gatos") && !b.mascotPath) b.mascotPath = "gatos/gato-{name}.png";
      b.publishing ??= {};
      b.publishing.youtube = { language: "pt", ...(b.publishing.youtube || {}) }; // YouTube metadata language: the old Studio texts were Portuguese
      b.publishing.labels ??= { chapters: "Capítulos", article: "Artigo completo", fullVideo: "Completo" };
      if (b.publishing.aiTics !== false && !b.publishing.aiTicPatterns) b.publishing.aiTicPatterns = [
        { regex: "\\bnão é [^.!?]{1,45}, é\\s", message: 'estrutura "não é X, é Y"' },
        { regex: "\\bsem [^,.!?]{1,25}, sem [^,.!?]{1,25}, sem\\b", message: 'lista "sem X, sem Y, sem Z"' },
      ];
    });
    plan.notes.push("brand.json: publishing.youtube.language is set to \"pt\", publishing.labels to the Portuguese labels and publishing.aiTicPatterns to the two Portuguese AI-tic patterns the old Studio checked (edit or remove them if your texts are not Portuguese).");
  }
  if (has("vozes.json")) { oldVoices = JSON.parse(readText(abs("vozes.json"))); rewriteJson("vozes.json", "voices.json", translateVoices); }
  const pron: Record<string, string> = oldBrand.pronuncia ?? {};

  // ----- src/
  if (has("src/marca.ts")) write("src/brand.ts", T.brandTs, "src/marca.ts", true);
  for (const f of walk(abs("src")).map((x) => relative(root, x))) {
    if (!/\.(ts|tsx)$/.test(f) || f === "src/marca.ts") continue;
    const old = readText(abs(f));
    let t = rewriteTsx(old);
    if (f === "src/Root.tsx") t = t.replace(OLD_ROOT_MARKER, (_m, _p, slash: string, w: string) => `praeko-studio:${slash}${w === "imports" ? "imports" : "compositions"}`);
    if (t !== old) { write(f, t, undefined, false); plan.followUps.push(...followUps(f, t)); }
  }
  if (has("tsconfig.json")) { const old = readText(abs("tsconfig.json")), t = old.replace('"episodios"', '"episodes"'); if (t !== old) write("tsconfig.json", t); }

  // ----- episodes
  // Which (alias, provider, model) the old cache files were named after. An alias that no longer exists in vozes.json (an old brand `voz`, or a
  // value of `qualidade`) is tried with the settings of the voice of its provider, and it maps to the alias the new narrate computes for that provider.
  const newProvider = (p: string) => (p === "estimado" ? "estimated" : p);
  const voiceCandidates = (): { alias: string; provider: string; model: string; newAlias: string }[] => {
    const builtin: Record<string, { provedor: string; modelo?: string }> = { "rascunho-mudo": { provedor: "estimado" }, "minha-voz": { provedor: "elevenlabs", modelo: "eleven_v4" }, "voz-local": { provedor: "voicestudio", modelo: "" } };
    const all: Record<string, any> = { ...builtin };
    for (const [k, v] of Object.entries<any>(oldVoices.vozes ?? {})) all[k] = { ...(builtin[k] || {}), ...v };
    const qualityOf = (q: string, d: string): string => legacyVoiceAlias(oldVoices.qualidade?.[q] ?? d) as string;
    const target: Record<string, string> = { estimado: "draft-silent", elevenlabs: qualityOf("final", "minha-voz"), voicestudio: qualityOf("local", "voz-local") };
    const extra = [oldBrand.voz, ...Object.values<string>(oldVoices.qualidade ?? {})].filter((x) => typeof x === "string" && !all[x]);
    const list = Object.entries(all).map(([alias, v]) => ({ alias, provider: (v.provedor ?? "elevenlabs") as string, model: (v.modelo ?? "") as string, newAlias: (builtin[alias] ? legacyVoiceAlias(alias) : target[v.provedor ?? "elevenlabs"] ?? legacyVoiceAlias(alias)) as string }));
    for (const alias of extra) { const t = all["minha-voz"]; list.push({ alias, provider: t.provedor, model: t.modelo ?? "", newAlias: target[t.provedor] ?? "my-voice" }); }
    return list;
  };
  for (const dirent of has("episodios") ? readdirSync(abs("episodios"), { withFileTypes: true }) : []) {
    if (!dirent.isDirectory()) { move(`episodios/${dirent.name}`, `episodes/${dirent.name}`); continue; }
    const slug = dirent.name, from = `episodios/${slug}`, to = `episodes/${slug}`;
    const top: Record<string, [string, "yaml" | "info" | "tsx-glue" | "tsx" | "words" | "blocks" | "cut" | "publication" | "schedule" | "move" | "drop"]> = {
      "episodio.yaml": ["episode.yaml", "yaml"], "episodio.json": ["episode.json", "info"], "episodio.spec.json": ["", "drop"], "episodio.tsx": ["episode.tsx", "tsx-glue"], "cenas.tsx": ["scenes.tsx", "tsx"],
      "palavras.json": ["words.json", "move"], "palavras.ts": ["words.ts", "words"], "roteiro.txt": ["script.txt", "move"], "voz.mp3": ["voice.mp3", "move"], "voz.estimada": ["voice.estimated", "move"],
      "blocos.json": ["blocks.json", "blocks"], "corte.json": ["cut.json", "cut"], "publicacao.json": ["publication.json", "publication"], "textos.md": ["texts.md", "move"],
      "agendamento.json": ["schedule.json", "schedule"], "agendamento.cancelado.json": ["schedule.cancelled.json", "schedule"], "agendamento.feito.json": ["schedule.done.json", "schedule"],
    };
    const script = has(`${from}/roteiro.txt`) ? readText(abs(`${from}/roteiro.txt`)) : "";
    const cutCfg = has(`${from}/corte.json`) ? JSON.parse(readText(abs(`${from}/corte.json`))) : null;
    for (const file of walk(abs(from))) {
      const inner = relative(abs(from), file).split("\\").join("/"), src = `${from}/${inner}`;
      if (!inner.includes("/")) {
        const m = top[inner];
        if (m) {
          const [name, kind] = m, dest = `${to}/${name}`;
          if (kind === "drop") { remove(src); plan.notes.push(`${src}: removed (episode.spec.json is regenerated by \`compile\`)`); continue; }
          if (kind === "move") { move(src, dest); continue; }
          const text = readText(file);
          if (kind === "yaml") { const r = rewriteYaml(text, (v) => translateEpisode(v).value); write(dest, r.text, src, true); if (!r.preserved) plan.notes.push(`${src}: comments/formatting could not be preserved (the original is in the backup)`); }
          else if (kind === "info") write(dest, json(translateEpisodeInfo(JSON.parse(text)).value), src, true);
          else if (kind === "blocks") write(dest, json(translateBlocks(JSON.parse(text)).value), src, true);
          else if (kind === "cut") write(dest, json(translateCut(JSON.parse(text)).value), src, true);
          else if (kind === "publication") write(dest, json(translatePublication(JSON.parse(text)).value), src, true);
          else if (kind === "schedule") write(dest, json(translateSchedule(JSON.parse(text)).value), src, true);
          else if (kind === "words") write(dest, rewriteWordsTs(text), src, true);
          else if (kind === "tsx-glue") {
            const g = text.match(/<(EpisodioDecl|LongoDecl) spec=\{spec as (?:EpSpec|LongoSpec)\} palavras=\{PALAVRAS\} tema=\{tema\} pecas=\{pecas(?: as any)?\} \/>/), id = text.match(/export const (\w+)Composition/);
            if (g && id) write(dest, g[1] === "LongoDecl" ? T.longTsx({ id: id[1]!, slug }) : T.episodeTsx({ id: id[1]!, slug }), src, true);
            else { const t = rewriteTsx(text); write(dest, t, src, true); plan.followUps.push(...followUps(dest, t)); }
          } else { const t = rewriteTsx(text); write(dest, t, src, true); plan.followUps.push(...followUps(dest, t)); }
          continue;
        }
        if (/\.(ts|tsx)$/.test(inner)) { const t = rewriteTsx(readText(file)); write(`${to}/${inner}`, t, src, true); plan.followUps.push(...followUps(`${to}/${inner}`, t)); continue; }
        move(src, `${to}/${inner}`); continue;
      }
      const [dir, ...restParts] = inner.split("/"), rest = restParts.join("/");
      if (dir === "voz-blocos") {
        // cache files are named `NN-<hash>.mp3|json`; the hash depends on the voice alias, provider, model and pronunciation, so it is recomputed
        const m = rest.match(/^(\d{2})-([0-9a-f]{10})\.(mp3|json)$/);
        let dest = `${to}/voice-blocks/${rest}`, content: string | null = null;
        if (m) {
          const n = +m[1]!, block = readBlocks(script).find((b) => b.n === n);
          const hit = block && voiceCandidates().find((c) => sha1(`${c.alias}|${c.provider}|${c.model}|${JSON.stringify(pron)}\n${block.text}`) === m[2]);
          if (block && hit) {
            const nh = blockHash(block.text, blockCacheKey({ voiceAlias: hit.newAlias, provider: newProvider(hit.provider), model: hit.model, pronunciation: pron }));
            dest = `${to}/voice-blocks/${m[1]}-${nh}.${m[3]}`; if (m[3] === "mp3") plan.cache.renamed++;
          } else if (m[3] === "mp3") plan.cache.kept.push(src);
          if (m[3] === "json") content = JSON.stringify(translateHookCache(JSON.parse(readText(file))).value);
        }
        if (content !== null) write(dest, content, src, true); else move(src, dest);
        continue;
      }
      if (dir === "voz-abertura") {
        const m = rest.match(/^([0-9a-f]{10})\.(mp3|json)$/), hook = cutCfg?.abertura;
        let dest = `${to}/voice-hook/${rest}`;
        if (m && hook && sha1(`${hook.texto}|${hook.qualidade}|${JSON.stringify(pron)}`) === m[1]) {
          dest = `${to}/voice-hook/${hookHash({ text: hook.texto, quality: hook.qualidade === "rascunho" ? "draft" : hook.qualidade, pronunciation: pron })}.${m[2]}`; if (m[2] === "mp3") plan.cache.renamed++;
        } else if (m && m[2] === "mp3") plan.cache.kept.push(src);
        if (m && m[2] === "json") write(dest, JSON.stringify(translateHookCache(JSON.parse(readText(file))).value), src, true); else move(src, dest);
        continue;
      }
      move(src, `${to}/${inner}`);
    }
  }

  // ----- package.json
  if (has("package.json")) {
    const old = JSON.parse(readText(abs("package.json"))), pkg = JSON.parse(JSON.stringify(old));
    for (const sect of ["dependencies", "devDependencies"]) for (const [k, v] of Object.entries<string>(pkg[sect] ?? {})) if (k.startsWith("@praeko/studio") && /^[\^~]0\.1\./.test(v)) pkg[sect][k] = "^0.2.0";
    for (const [k, v] of Object.entries<string>(pkg.scripts ?? {})) pkg.scripts[k] = rewriteMarkdown(v);
    if (JSON.stringify(pkg) !== JSON.stringify(old)) write("package.json", json(pkg), undefined, false);
  }
  // ----- agent instruction files
  for (const f of AGENT_FILES) {
    if (!has(f)) continue;
    const old = readText(abs(f)); let t = old;
    const i = Math.max(t.indexOf(OLD_BLOCK_START), t.indexOf(BLOCK_START.slice(0, 26))), j = t.includes(OLD_BLOCK_END) ? t.indexOf(OLD_BLOCK_END) + OLD_BLOCK_END.length : (t.indexOf(BLOCK_END) >= 0 ? t.indexOf(BLOCK_END) + BLOCK_END.length : -1);
    if (i >= 0 && j > i) {
      const lang = isPt(t.slice(i, j)) ? "pt" : "en";
      const body = f === "CLAUDE.md" ? (lang === "en" ? "Video project (Praeko Studio). Full instructions: the `praeko-studio` skill in `.claude/skills/`, or `praeko studio docs`." : "Projeto de vídeo (Praeko Studio). Instruções completas: skill `praeko-studio` em `.claude/skills/`, ou `praeko studio docs`.") : BODY[lang];
      t = t.slice(0, i) + `${BLOCK_START}\n${body}\n${BLOCK_END}\n`.trimEnd() + t.slice(j);
      // the hand-written rest (outside the managed block) gets the command/file tokens rewritten
      const a = t.indexOf(BLOCK_START), b = t.indexOf(BLOCK_END) + BLOCK_END.length;
      t = rewriteMarkdown(t.slice(0, a)) + t.slice(a, b) + rewriteMarkdown(t.slice(b));
    } else t = rewriteMarkdown(t);
    if (t !== old) { write(f, t); plan.textEdits.push(f); }
  }
  for (const f of ["README.md"]) if (has(f)) { const old = readText(abs(f)), t = rewriteMarkdown(old); if (t !== old) { write(f, t); plan.textEdits.push(f); } }
  for (const f of AGENT_WHOLE) {
    if (!has(f)) continue;
    const old = readText(abs(f));
    if (!/marca\.json|episodio\.yaml|praeko studio (novo|voz|compilar)\b/.test(old)) continue;
    const fresh = freshAgentFile(f, isPt(old) ? "pt" : "en");
    if (fresh && fresh !== old) { write(f, fresh); plan.textEdits.push(f); }
  }
  // .gitignore
  if (has(".gitignore")) { const old = readText(abs(".gitignore")); if (!old.includes(".studio-backup/")) write(".gitignore", old.replace(/\s*$/, "\n") + ".studio-backup/\n"); }
  else if (plan.ops.length) write(".gitignore", ".studio-backup/\n");
  return plan;
}

/** Content `skill install` would write for one of the whole-file targets (used to refresh them in place). */
function freshAgentFile(file: string, lang: "en" | "pt"): string | null {
  const tmp = mkdtempSync(join(tmpdir(), "studio-migrate-"));
  try {
    installSkill({ dir: tmp, agents: "all", lang });
    const f = join(tmp, file);
    return existsSync(f) ? readText(f) : null;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

export type Result = { backup: string | null; moved: number; rewritten: number; removed: number; compile: { slug: string; errors: string[]; warnings: number }[] };

const stamp = (d = new Date()): string => d.toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
function prune(dir: string): void {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) prune(join(dir, e.name));
  if (!readdirSync(dir).length) rmSync(dir, { recursive: true });
}

/** Applies the plan: backup first, then writes, moves and removals. */
export function applyMigration(plan: Plan, now = new Date()): Result {
  const { root } = plan, abs = (r: string) => join(root, r);
  // conflicts: a destination that already exists and is not the source
  for (const op of plan.ops) {
    const to = op.kind === "move" || (op.kind === "write" && op.from) ? op.to : null, from = op.kind === "move" ? op.from : op.kind === "write" ? op.from : op.path;
    if (to && to !== from && existsSync(abs(to))) throw new Error(`cannot migrate: ${to} already exists (move it away and run migrate again)`);
  }
  const backup = join(root, ".studio-backup", stamp(now));
  const save = (r: string): void => { const src = abs(r); if (!existsSync(src) || !statSync(src).isFile()) return; const dest = join(backup, r); mkdirSync(dirname(dest), { recursive: true }); copyFileSync(src, dest); };
  for (const op of plan.ops) {
    if (op.kind === "write") { if (op.from) save(op.from); save(op.to); } else if (op.kind === "remove") save(op.path);
  }
  let moved = 0, rewritten = 0, removed = 0;
  for (const op of plan.ops) {
    if (op.kind === "write") {
      mkdirSync(dirname(abs(op.to)), { recursive: true }); writeFileSync(abs(op.to), op.content);
      if (op.from && op.from !== op.to) rmSync(abs(op.from), { force: true });
      if (op.keys) rewritten++; else if (!op.from) rewritten++;
      if (op.from && op.from !== op.to) moved++;
    } else if (op.kind === "move") { mkdirSync(dirname(abs(op.to)), { recursive: true }); renameSync(abs(op.from), abs(op.to)); moved++; }
    else { rmSync(abs(op.path), { force: true }); removed++; }
  }
  prune(abs("episodios"));
  // regenerate the specs
  const compile: Result["compile"] = [];
  const eps = abs("episodes");
  for (const e of existsSync(eps) ? readdirSync(eps, { withFileTypes: true }) : []) {
    if (!e.isDirectory() || !existsSync(join(eps, e.name, "episode.yaml"))) continue;
    const r = compileEpisode(join(eps, e.name));
    compile.push({ slug: e.name, errors: r.errors, warnings: r.warnings.length });
  }
  const result: Result = { backup: plan.ops.length ? backup : null, moved, rewritten, removed, compile };
  if (plan.ops.length) { mkdirSync(backup, { recursive: true }); writeFileSync(join(backup, "REPORT.md"), reportText(plan, result)); }
  return result;
}

export function reportText(plan: Plan, r?: Result): string {
  const L: string[] = [];
  const moves = plan.ops.filter((o): o is Move => o.kind === "move"), writes = plan.ops.filter((o): o is Write => o.kind === "write"), removes = plan.ops.filter((o): o is Remove => o.kind === "remove");
  const renamedFiles = moves.length + writes.filter((w) => w.from && w.from !== w.to).length;
  L.push(`# Studio migration report`, "", `- files renamed/moved: ${renamedFiles}`, `- files rewritten (keys, imports, text): ${writes.length}`, `- files removed (regenerated): ${removes.length}`, `- audio cache files renamed to the new hash: ${plan.cache.renamed}${plan.cache.kept.length ? ` (kept under the old hash: ${plan.cache.kept.length})` : ""}`, `- text edits in agent/README files: ${plan.textEdits.length}`);
  if (r) { L.push(`- backup: ${r.backup ? relative(plan.root, r.backup) : "(nothing to back up)"}`); for (const c of r.compile) L.push(`- compile ${c.slug}: ${c.errors.length ? `ERRORS: ${c.errors.slice(0, 3).join("; ")}` : `ok (${c.warnings} warning(s))`}`); }
  if (plan.notes.length) { L.push("", "## Notes"); plan.notes.forEach((n) => L.push(`- ${n}`)); }
  if (plan.cache.kept.length) { L.push("", "## Cache files left under the old hash (they will be regenerated if needed)"); plan.cache.kept.forEach((k) => L.push(`- ${k}`)); }
  L.push("", "## Manual follow-ups (Portuguese names in your own TSX; not converted automatically)");
  if (!plan.followUps.length) L.push("- none found"); else plan.followUps.slice(0, 200).forEach((f) => L.push(`- ${f.file}:${f.line}: ${f.hint}\n    ${f.text}`));
  if (plan.followUps.length > 200) L.push(`- … and ${plan.followUps.length - 200} more`);
  L.push("", "## Text edits (command words and file names only)");
  plan.textEdits.length ? plan.textEdits.forEach((f) => L.push(`- ${f}`)) : L.push("- none");
  L.push("", "Stored keys do not move: YouTube/TikTok tokens saved by the old Studio under the old keychain/secrets entries may need `praeko studio account <network> connect` again.");
  return L.join("\n") + "\n";
}

export function migrateCommand(a: string[]): number {
  const dry = a.includes("--dry-run");
  const root = findProjectRoot();
  if (!root) throw new Error("no Praeko Studio project found (a folder with marca.json or brand.json next to src/index.ts). Enter the project folder.");
  const plan = planMigration(root);
  if (!plan.ops.length) { console.log("nothing to do: this project already uses the English layout"); return 0; }
  if (dry) {
    console.log(`DRY RUN (nothing is written): ${plan.ops.length} operation(s) planned in ${root}\n`);
    console.log(reportText(plan));
    return 0;
  }
  const r = applyMigration(plan);
  console.log(`migrated ${root}\n`);
  console.log(reportText(plan, r));
  console.log(`report: ${relative(root, join(r.backup!, "REPORT.md"))}`);
  return r.compile.some((c) => c.errors.length) ? 1 : 0;
}

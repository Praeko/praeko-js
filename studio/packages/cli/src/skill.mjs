// `praeko studio skill install [--agent claude|codex|gemini|cursor|opencode|cline|windsurf|all] [--lang pt|en] [--dir pasta]`
// Grava as instruções do Studio no formato que cada agente lê. Arquivos compartilhados (AGENTS.md, CLAUDE.md, GEMINI.md) recebem um bloco
// delimitado: reinstalar atualiza só o bloco e preserva o resto do arquivo. Formatos por agente: ver docs/ do Studio (a conferir na documentação de cada agente a cada versão).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { CORPO, DESCRICAO, NOME_SKILL } from "./skill-textos.mjs";

const INI = "<!-- praeko-studio:inicio (gerado por `praeko studio skill install`; edite fora deste bloco) -->", FIM = "<!-- praeko-studio:fim -->";
export const AGENTES = ["claude", "codex", "gemini", "cursor", "opencode", "cline", "windsurf"];
const bloco = (lang) => `${INI}\n${CORPO[lang]}\n${FIM}\n`;

/** Arquivos de cada agente: { caminho, tipo: "bloco" | "inteiro", conteudo(lang) }. */
export const ALVOS = {
  claude: [
    { caminho: `.claude/skills/${NOME_SKILL}/SKILL.md`, tipo: "inteiro", conteudo: (l) => `---\nname: ${NOME_SKILL}\ndescription: ${DESCRICAO[l]}\n---\n\n${CORPO[l]}` },
    { caminho: "CLAUDE.md", tipo: "bloco", conteudo: (l) => bloco(l).replace(CORPO[l], l === "en" ? "Video project (Praeko Studio). Full instructions: the `praeko-studio` skill in `.claude/skills/`, or `praeko studio docs`." : "Projeto de vídeo (Praeko Studio). Instruções completas: skill `praeko-studio` em `.claude/skills/`, ou `praeko studio docs`.") },
  ],
  codex: [{ caminho: "AGENTS.md", tipo: "bloco", conteudo: bloco }],
  opencode: [{ caminho: "AGENTS.md", tipo: "bloco", conteudo: bloco }],
  gemini: [{ caminho: "GEMINI.md", tipo: "bloco", conteudo: bloco }],
  cursor: [{ caminho: `.cursor/rules/${NOME_SKILL}.mdc`, tipo: "inteiro", conteudo: (l) => `---\ndescription: ${DESCRICAO[l]}\nglobs:\nalwaysApply: true\n---\n\n${CORPO[l]}` }],
  cline: [{ caminho: `.clinerules/${NOME_SKILL}.md`, tipo: "inteiro", conteudo: (l) => CORPO[l] }],
  windsurf: [{ caminho: `.windsurf/rules/${NOME_SKILL}.md`, tipo: "inteiro", conteudo: (l) => `---\ntrigger: always_on\ndescription: ${DESCRICAO[l]}\n---\n\n${CORPO[l]}` }],
};

/** Agentes que já deixaram rastro na pasta (para o padrão do `init`/`skill install` sem --agent). */
export function detectar(dir) {
  const tem = (p) => existsSync(join(dir, p));
  const r = [];
  if (tem(".claude") || tem("CLAUDE.md")) r.push("claude");
  if (tem("AGENTS.md")) r.push("codex");
  if (tem("GEMINI.md")) r.push("gemini");
  if (tem(".cursor")) r.push("cursor");
  if (tem(".clinerules")) r.push("cline");
  if (tem(".windsurf")) r.push("windsurf");
  return r;
}

function gravar(dir, alvo, lang) {
  const arq = join(dir, alvo.caminho), novo = alvo.conteudo(lang), existia = existsSync(arq);
  mkdirSync(dirname(arq), { recursive: true });
  if (alvo.tipo === "inteiro" || !existia) { writeFileSync(arq, novo); return existia ? "atualizado" : "criado"; }
  const atual = readFileSync(arq, "utf8"), i = atual.indexOf(INI.slice(0, 30)), j = atual.indexOf(FIM);
  if (i >= 0 && j > i) writeFileSync(arq, atual.slice(0, i) + novo.trimEnd() + atual.slice(j + FIM.length));
  else writeFileSync(arq, atual.replace(/\s*$/, "\n\n") + novo);
  return "atualizado";
}

/** Instala. `agentes`: lista ou "all". Devolve [{ agente, arquivo, acao }] (sem repetir arquivo compartilhado). */
export function instalarSkill({ dir, agentes = "all", lang = "pt" }) {
  dir = resolve(dir);
  const lista = agentes === "all" ? AGENTES : agentes;
  for (const a of lista) if (!AGENTES.includes(a)) throw new Error(`agente desconhecido: ${a} (use ${AGENTES.join(", ")} ou all)`);
  if (!["pt", "en"].includes(lang)) throw new Error(`idioma desconhecido: ${lang} (pt ou en)`);
  const feitos = [], vistos = new Set();
  for (const a of lista) for (const alvo of ALVOS[a]) {
    if (vistos.has(alvo.caminho)) continue; vistos.add(alvo.caminho);
    feitos.push({ agente: a, arquivo: alvo.caminho, acao: gravar(dir, alvo, lang) });
  }
  return feitos;
}

const flag = (a, k) => { const i = a.indexOf("--" + k); return i >= 0 ? a[i + 1] : undefined; };
export function skillCmd(a) {
  if (a[0] !== "install") throw new Error("uso: praeko studio skill install [--agent claude|codex|gemini|cursor|opencode|cline|windsurf|all] [--lang pt|en] [--dir pasta]");
  const dir = resolve(flag(a, "dir") || process.cwd()), ag = flag(a, "agent");
  const agentes = ag ? (ag === "all" ? "all" : ag.split(",").map((x) => x.trim())) : (detectar(dir).length ? detectar(dir) : ["claude", "codex"]);
  const r = instalarSkill({ dir, agentes, lang: flag(a, "lang") || (/^en/i.test(process.env.LANG || "") ? "en" : "pt") });
  for (const x of r) console.log(`✓ ${x.agente.padEnd(9)} ${x.acao} ${x.arquivo}`);
  console.log(`\nAbra o seu agente nesta pasta (${dir}) e peça o vídeo. O que o agente pode fazer sozinho e o que depende do seu sim está no texto instalado.`);
  return 0;
}

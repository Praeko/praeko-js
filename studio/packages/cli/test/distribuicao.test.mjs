// Distribuição do Praeko Studio: init por semver, modo --dev, skill por agente, doctor, aviso de licenças, docs e auditoria de dados pessoais.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENTES, ALVOS, instalarSkill } from "../src/skill.mjs";
import { acharChromium, diagnosticar, familiaPrincipal } from "../src/doctor.mjs";
import { AVISO, avisoTexto, gravarAceite, lerAceite, licencasCmd } from "../src/licencas.mjs";

const PACOTE = fileURLToPath(new URL("..", import.meta.url)), BIN = join(PACOTE, "bin", "praeko-studio.mjs"), STUDIO = join(PACOTE, "..", "..");
const base = mkdtempSync(join(tmpdir(), "praeko-studio-dist-"));
// ambiente isolado: nenhuma chave, cofre ou configuração do usuário de verdade entra nestes testes
const ENV = { ...process.env, HOME: base, USERPROFILE: base, PRAEKO_STUDIO_CONFIG: join(base, "cfg"), PRAEKO_SEGREDOS: join(base, "segredos.json"), PRAEKO_SEM_CHAVEIRO: "1", PRAEKO_STUDIO_SEM_AVISO: "1", LANG: "pt_BR.UTF-8" };
for (const k of ["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "PRAEKO_KEY", "PRAEKO_STUDIO"]) delete ENV[k];
const cli = (args, cwd = base) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", env: ENV });
const ler = (f) => readFileSync(f, "utf8");

test("init: dependências por semver publicado (sem file:), @praeko/studio em devDependencies, config sem alias, voz padrão muda", () => {
  const proj = join(base, "proj");
  const r = cli(["init", proj, "--nome", "Meu Canal", "--sem-instalar", "--agent", "claude"]);
  assert.equal(r.status, 0, r.stderr);
  const pj = JSON.parse(ler(join(proj, "package.json")));
  assert.match(pj.dependencies["@praeko/studio-core"], /^\^\d+\.\d+\.\d+$/); assert.match(pj.dependencies["@praeko/studio-kit"], /^\^\d+\.\d+\.\d+$/);
  assert.match(pj.devDependencies["@praeko/studio"], /^\^\d/);
  assert.doesNotMatch(JSON.stringify(pj), /file:/);
  assert.doesNotMatch(ler(join(proj, "remotion.config.ts")), /alias|node_modules\/remotion/);
  const marca = JSON.parse(ler(join(proj, "marca.json")));
  assert.equal(marca.voz, "rascunho-mudo"); assert.deepEqual(marca.links, {}); assert.equal(marca.publicacao.provedor, "praeko");
  assert.doesNotMatch(JSON.stringify(marca), /marcone|guilda|dev\.ocioso|jogo/i);
  assert.match(r.stdout, /Remotion/); assert.match(r.stdout, /NÃO é MIT/, "o aviso de licenças aparece no init");
  assert.ok(existsSync(join(proj, ".claude/skills/praeko-studio/SKILL.md")));
  assert.match(ler(join(proj, ".gitignore")), /\.env/);
});
test("init --dev <studio>: modo contribuidor com file: e alias de remotion/react", () => {
  const proj = join(base, "projdev");
  const r = cli(["init", proj, "--sem-instalar", "--dev", STUDIO, "--agent", "codex"]);
  assert.equal(r.status, 0, r.stderr);
  const pj = JSON.parse(ler(join(proj, "package.json")));
  assert.match(pj.dependencies["@praeko/studio-core"], /^file:.*packages\/core$/);
  assert.equal(pj.devDependencies["@praeko/studio"], undefined);
  assert.match(ler(join(proj, "remotion.config.ts")), /alias/);
  assert.notEqual(cli(["init", join(base, "x"), "--dev", "/nao/existe", "--sem-instalar"]).status, 0);
});
test("skill install: grava o arquivo certo de cada agente, com o texto de publicação em dois passos, upload local e declaração de IA", () => {
  const esperado = { claude: [".claude/skills/praeko-studio/SKILL.md", "CLAUDE.md"], codex: ["AGENTS.md"], opencode: ["AGENTS.md"], gemini: ["GEMINI.md"], cursor: [".cursor/rules/praeko-studio.mdc"], cline: [".clinerules/praeko-studio.md"], windsurf: [".windsurf/rules/praeko-studio.md"] };
  assert.deepEqual(AGENTES.sort(), Object.keys(esperado).sort());
  for (const [ag, arqs] of Object.entries(esperado)) for (const lang of ["pt", "en"]) {
    const d = mkdtempSync(join(base, "sk-"));
    instalarSkill({ dir: d, agentes: [ag], lang });
    for (const a of arqs) assert.ok(existsSync(join(d, a)), `${ag}/${lang}: ${a}`);
    const principal = ler(join(d, arqs[0]));
    for (const re of [/confirmation_code/, /create_media_upload/, /complete_media_upload/, /sintetico/, /praeko studio docs/]) assert.match(principal, re, `${ag}/${lang}: ${re}`);
    assert.doesNotMatch(principal, /marcone|dev\.ocioso|guilda|\/Users\//i);
    assert.match(principal, lang === "en" ? /Never confirm on your own/ : /Nunca confirme por conta própria/);
  }
  const c = mkdtempSync(join(base, "sk-")); instalarSkill({ dir: c, agentes: ["claude"] });
  assert.match(ler(join(c, ".claude/skills/praeko-studio/SKILL.md")), /^---\nname: praeko-studio\ndescription: /);
  assert.equal(ler(join(STUDIO, "skill", "praeko-studio", "SKILL.md")), ALVOS.claude[0].conteudo("pt"), "studio/skill/praeko-studio/SKILL.md é gerado (node scripts/build-studio.mjs)");
  assert.ok(ALVOS.cursor[0].conteudo("pt").includes("alwaysApply: true"));
});
test("skill install: preserva o texto do usuário em AGENTS.md/CLAUDE.md, atualiza só o bloco e é idempotente", () => {
  const d = mkdtempSync(join(base, "sk-"));
  writeFileSync(join(d, "AGENTS.md"), "# Minhas regras\nUse tabs.\n");
  instalarSkill({ dir: d, agentes: ["codex"] });
  const a = ler(join(d, "AGENTS.md"));
  assert.match(a, /^# Minhas regras\nUse tabs\./); assert.match(a, /praeko-studio:inicio/);
  const r2 = instalarSkill({ dir: d, agentes: ["codex"], lang: "pt" });
  assert.equal(ler(join(d, "AGENTS.md")), a, "reinstalar não muda nada"); assert.equal(r2[0].acao, "atualizado");
  instalarSkill({ dir: d, agentes: ["codex"], lang: "en" });
  const en = ler(join(d, "AGENTS.md"));
  assert.match(en, /Use tabs\./); assert.match(en, /Never confirm on your own/); assert.equal((en.match(/praeko-studio:inicio/g) || []).length, 1);
  assert.throws(() => instalarSkill({ dir: d, agentes: ["vim"] }), /agente desconhecido/);
});
test("skill install pela CLI: --agent all escreve os sete agentes; sem --agent detecta o que já existe", () => {
  const d = mkdtempSync(join(base, "sk-"));
  const r = cli(["skill", "install", "--agent", "all", "--lang", "en", "--dir", d]);
  assert.equal(r.status, 0, r.stderr);
  for (const a of ["AGENTS.md", "GEMINI.md", "CLAUDE.md", ".cursor/rules/praeko-studio.mdc", ".clinerules/praeko-studio.md", ".windsurf/rules/praeko-studio.md"]) assert.ok(existsSync(join(d, a)), a);
  const e = mkdtempSync(join(base, "sk-")); mkdirSync(join(e, ".cursor"));
  assert.equal(cli(["skill", "install", "--dir", e]).status, 0);
  assert.ok(existsSync(join(e, ".cursor/rules/praeko-studio.mdc")) && !existsSync(join(e, "GEMINI.md")));
  assert.notEqual(cli(["skill", "remove"]).status, 0);
});
test("doctor: sem chaves nem projeto roda offline, não imprime segredo e sinaliza o aviso de licenças", async () => {
  const r = cli(["doctor", "--json", "--offline"]);
  const j = JSON.parse(r.stdout);
  const ids = j.itens.map((i) => i.id);
  for (const id of ["node", "ffmpeg", "ffprobe", "chromium", "licencas", "rede", "chave-elevenlabs", "chave-praeko"]) assert.ok(ids.includes(id), id);
  assert.equal(j.itens.find((i) => i.id === "licencas").nivel, "aviso");
  assert.equal(j.itens.find((i) => i.id === "chave-elevenlabs").nivel, "info");
  assert.equal(r.status, j.ok ? 0 : 1);
  const texto = cli(["doctor", "--offline"]).stdout;
  assert.match(texto, /Remotion/); assert.match(texto, /NÃO é MIT/);
  const ruim = await diagnosticar({ offline: true, cwd: base, fetchFn: async () => { throw new Error("não deveria chamar a rede"); } });
  assert.ok(ruim.length > 5);
  const comRede = await diagnosticar({ cwd: base, fetchFn: async () => { throw Object.assign(new Error("x"), { cause: { code: "ENOTFOUND" } }); } });
  assert.equal(comRede.find((i) => i.id === "rede").nivel, "aviso");
});
test("doctor: chave presente aparece só como 'presente' (nunca o valor) e fonte ausente vira aviso dentro de um projeto", () => {
  const proj = join(base, "proj");
  const marca = JSON.parse(ler(join(proj, "marca.json"))); marca.fontes = { titulo: "'Fonte Que Nao Existe 9', sans-serif", mono: "monospace" };
  writeFileSync(join(proj, "marca.json"), JSON.stringify(marca));
  const r = spawnSync(process.execPath, [BIN, "doctor", "--json", "--offline"], { cwd: proj, encoding: "utf8", env: { ...ENV, ELEVENLABS_API_KEY: "sk_segredo_que_nao_pode_aparecer" } });
  assert.doesNotMatch(r.stdout + r.stderr, /sk_segredo/);
  const j = JSON.parse(r.stdout);
  assert.match(j.itens.find((i) => i.id === "chave-elevenlabs").msg, /presente/);
  assert.equal(j.itens.find((i) => i.id === "fonte-titulo").nivel, "aviso");
  assert.equal(familiaPrincipal("'Arial Black', 'Helvetica Neue', sans-serif"), "Arial Black"); assert.equal(familiaPrincipal("monospace"), null);
});
test("acharChromium usa CHROME_PATH e o Chrome baixado pelo Remotion no projeto", () => {
  const d = mkdtempSync(join(base, "ch-")); mkdirSync(join(d, "node_modules", ".remotion"), { recursive: true });
  assert.equal(acharChromium(d).onde, "baixado pelo Remotion neste projeto");
  const f = join(d, "chrome"); writeFileSync(f, ""); process.env.CHROME_PATH = f;
  try { assert.equal(acharChromium(d).onde, "variável de ambiente"); } finally { delete process.env.CHROME_PATH; }
});
test("licenças: o aviso diz que o Remotion não é MIT (3 pessoas, Company License), vale em pt e en e o aceite é registrado por versão", () => {
  for (const l of ["pt", "en"]) { const t = avisoTexto(l); assert.match(t, /Remotion/); assert.match(t, /MIT/); assert.match(t, /3/); assert.match(t, /Company License/); assert.match(t, /remotion\.pro\/license/); assert.match(t, /Apache-2\.0/); }
  assert.ok(AVISO.pt !== AVISO.en);
  process.env.PRAEKO_STUDIO_CONFIG = join(mkdtempSync(join(base, "ac-")), "cfg");
  assert.equal(lerAceite(), null);
  gravarAceite(new Date("2026-11-07T12:00:00Z"));
  assert.equal(lerAceite().aceitoEm, "2026-11-07T12:00:00.000Z");
  const antes = console.log; let saida = ""; console.log = (m) => { saida += m + "\n"; };
  try { licencasCmd(["--en"]); } finally { console.log = antes; }
  assert.match(saida, /NOT MIT/); assert.match(saida, /already recorded|já registrou/);
  delete process.env.PRAEKO_STUDIO_CONFIG;
});
test("o aviso e as notas de licença estão no README, no LICENSES.md e nos pacotes publicáveis (cópias idênticas)", () => {
  const lic = ler(join(STUDIO, "LICENSES.md"));
  for (const re of [/Remotion/, /NÃO é MIT|NOT MIT|não é MIT/i, /Company License/, /CC-BY-NC/, /Apache-2\.0/, /remotion\.pro\/license/]) assert.match(lic, re);
  for (const p of ["cli", "core", "kit"]) { assert.equal(ler(join(STUDIO, "packages", p, "LICENSES.md")), lic, p); assert.equal(ler(join(STUDIO, "packages", p, "LICENSE")), ler(join(STUDIO, "LICENSE")), p); }
  assert.match(ler(join(STUDIO, "LICENSE")), /^MIT License\n\nCopyright \(c\) 2026 Marcone Santos/);
  assert.match(ler(join(PACOTE, "README.md")), /Remotion/);
});
test("docs: lista os temas e imprime um; tema inexistente falha; --version e ajuda sem 'bardo'", () => {
  const l = cli(["docs"]).stdout;
  for (const t of ["episodio-yaml", "longo-yaml", "voz", "publicar", "hyperframes", "licencas"]) assert.match(l, new RegExp(t));
  assert.match(cli(["docs", "episodio-yaml"]).stdout, /episodio|quando/i);
  assert.match(cli(["docs", "licencas"]).stdout, /Licenças do Praeko Studio/);
  assert.notEqual(cli(["docs", "nada"]).status, 0);
  assert.match(cli(["--version"]).stdout.trim(), /^\d+\.\d+\.\d+$/);
  assert.doesNotMatch(cli(["--help"]).stdout, /bardo/i);
  const pkg = JSON.parse(ler(join(PACOTE, "package.json")));
  assert.deepEqual(Object.keys(pkg.bin), ["praeko-studio"]); assert.equal(pkg.name, "@praeko/studio"); assert.notEqual(pkg.private, true);
});
test("auditoria de publicação: nada do dono (nome, marca, ids de voz, caminhos, jogo) nos pacotes que vão ao público", () => {
  // os padrões são montados por partes para este arquivo não se auto-acusar na varredura de publicação
  const j = (...p) => new RegExp(p.join(""), "i");
  const PROIBIDO = [[j("marc", "one"), "nome do dono"], [j("dev\\.", "ocioso"), "projeto do dono"], [j("guil", "da"), "jogo do dono"], [/\/Users\//, "caminho absoluto"], [j("XFsV", "wg|nPUB", "lnc|GJo3", "Yol|b0c8", "d3f7"), "id de voz do dono"], [j("\\bbar", "do\\b"), "nome antigo"]];
  const sujos = [];
  const varrer = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist"].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) { varrer(p); continue; }
    if (/\.(png|wav|mp3|mp4)$/.test(e.name) || /LICENSES?\.md$/.test(e.name) || /(^|\/)test\//.test(relative(STUDIO, p)) || e.name === "bardo.mjs" || e.name === "comandos.mjs") continue; // comandos.mjs aceita o marcador antigo `bardo:` do Root.tsx de projetos antigos
    const t = ler(p); for (const [re, nome] of PROIBIDO) if (re.test(t)) sujos.push(`${nome}: ${relative(STUDIO, p)}`);
  } };
  for (const d of ["packages/cli/src", "packages/cli/bin", "packages/cli/docs", "packages/cli/modelos", "packages/voz/src", "packages/publicar/src", "packages/revisar/src", "packages/hyperframes/src", "packages/core/src", "packages/kit/src", "skill"]) if (existsSync(join(STUDIO, d))) varrer(join(STUDIO, d));
  assert.deepEqual(sujos, []);
  for (const velho of ["legado", "referencias", "exemplos", "config"]) assert.ok(!existsSync(join(STUDIO, velho)), `${velho}/ não vai à publicação`);
});

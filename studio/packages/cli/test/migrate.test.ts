// `praeko studio migrate`: converts a Studio 0.1.x project (Portuguese names) to the English layout, with a backup. Legacy detection, dry run, idempotence.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blockCacheKey, blockHash, hookHash } from "@praeko/studio-voice";
import { compileEpisode } from "../src/compile.ts";
import { rewriteMarkdown } from "../src/migrate/index.ts";
import { rewriteTsx, rewriteWordsTs } from "../src/migrate/tsx.ts";
import { translateBrand, translateEpisode, translatePublication, translateSchedule, translateVoices } from "../src/migrate/legacy-keys.ts";
import { rewriteYaml } from "../src/migrate/yaml-preserve.ts";

const BIN = new URL("../bin/praeko-studio.ts", import.meta.url).pathname;
const base = mkdtempSync(join(tmpdir(), "studio-migrate-"));
const ENV = { ...process.env, HOME: base, PRAEKO_NO_KEYCHAIN: "1", PRAEKO_STUDIO_CONFIG: join(base, "cfg"), PRAEKO_SECRETS: join(base, "secrets.json") } as NodeJS.ProcessEnv;
const studio = (args: string[], cwd: string) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", env: ENV });
const sha1 = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 10);
const put = (root: string, rel: string, content: string) => { mkdirSync(join(root, rel, ".."), { recursive: true }); writeFileSync(join(root, rel), content); };
const read = (root: string, rel: string) => readFileSync(join(root, rel), "utf8");
const tree = (dir: string, prefix = ""): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? tree(join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]));

const WORDS = [["Fui", 1], ["conferir", 1.4], ["aqui", 2], ["acabou", 6]].map(([t, a]) => ({ t, a, b: (a as number) + 0.3 }));
const PRON = { "exemplo.com": "exemplo ponto com" };
const OLD_BLOCK_TEXT = ["Primeiro bloco falado.", "Segundo bloco falado."];
const SCRIPT_LONG = `## 1 · A\n${OLD_BLOCK_TEXT[0]}\n\n## 2 · B\n${OLD_BLOCK_TEXT[1]}\n`;

/** A project exactly as Studio 0.1.x left it. */
function legacyProject(): string {
  const root = mkdtempSync(join(base, "old-"));
  put(root, "marca.json", JSON.stringify({ nome: "Canal", handle: "@canal", avatar: "capa/avatar.png", cores: { fundo: "#000", destaque: "#fa0", texto: "#fff", caixa: "#111" }, fontes: { titulo: "Arial", mono: "Menlo" }, assinatura: "Ócio.", links: { jogo: "https://exemplo.com/" }, voz: "minha-voz", pronuncia: PRON, legendaCorrige: { "0,40": "quarenta" }, nomesProibidos: [], publicacao: { provedor: "praeko", hashtags: { permitidas: ["#a"], proibidas: [] }, fusoOffset: "-03:00" } }));
  put(root, "vozes.json", JSON.stringify({ contas: { elevenlabs: ["principal"] }, vozes: { "minha-voz": { provedor: "elevenlabs", modelo: "eleven_v4", ids: { principal: "ID" }, alinhador: "scribe" } } }));
  put(root, "package.json", JSON.stringify({ name: "x", scripts: { dev: "remotion studio src/index.ts", novo: "praeko studio novo meu --titulo T" }, dependencies: { "@praeko/studio-core": "^0.1.0", "@praeko/studio-kit": "file:../kit", remotion: "4.0.539" }, devDependencies: { "@praeko/studio": "^0.1.0" } }, null, 2));
  put(root, "tsconfig.json", JSON.stringify({ include: ["src", "episodios"] }));
  put(root, ".gitignore", "node_modules/\n");
  put(root, "src/index.ts", 'import { registerRoot } from "remotion";\nimport { RemotionRoot } from "./Root";\nregisterRoot(RemotionRoot);\n');
  put(root, "src/marca.ts", 'import { temaDaMarca } from "@praeko/studio-core";\nimport marca from "../marca.json";\nexport { marca };\nexport const tema = temaDaMarca(marca as any);\n');
  const OLD = ["bar", "do"].join("");
  put(root, "src/Root.tsx", `// markers\nimport { CurtoComposition } from "../episodios/curto/episodio";\n// ${OLD}:imports\nimport { LongoComposition } from "../episodios/longo/episodio";\n// ${OLD}:/imports\nexport const RemotionRoot = () => (<>\n    <CurtoComposition />\n    {/* ${OLD}:composicoes */}\n    <LongoComposition />\n    {/* ${OLD}:/composicoes */}\n</>);\n`);
  put(root, "public/gatos/gato-feliz.png", "png");
  // short
  put(root, "episodios/curto/episodio.yaml", `# Curto\nid: Curto\nduracao: { voz: 2.5 }          # acompanha a voz\nlegenda: 80\nvoz: audio/Curto.mp3\nfechamento: { inicio: { voz: -2 }, cta: SEGUE }\ncapa: { id: CapaCurto, componente: CapaCurto }\ncenas:\n  - inicio: 0\n    titulo: ABERTURA\n    itens:\n      - { tipo: caixa, quando: Fui conferir, cor: destaque, tamanho: 44, texto: "oi, mundo", pos: { esquerda: 10, topo: 20, largura: 300 } }\n      - { tipo: texto, em: 0.3, altura: 1.2, alinhar: esquerda, texto: ola }\n      - tipo: codigo\n        quando: aqui\n        titulo: f\n        cor: erro\n        linhas:\n          - { s: "x", cor: erro, marca: true }\n`);
  put(root, "episodios/curto/episodio.json", JSON.stringify({ id: "Curto", capa: "CapaCurto", titulo: "Curto" }));
  put(root, "episodios/curto/episodio.spec.json", JSON.stringify({ id: "Curto", cenas: [] }));
  put(root, "episodios/curto/episodio.tsx", `import { EpisodioDecl, EpSpec } from "@praeko/studio-kit";\nimport { tema } from "../../src/marca";\nimport * as pecas from "./cenas";\nimport spec from "./episodio.spec.json";\nimport { PALAVRAS } from "./palavras";\n\n// comment\nexport const CurtoComposition = () => <EpisodioDecl spec={spec as EpSpec} palavras={PALAVRAS} tema={tema} pecas={pecas} />;\n`);
  put(root, "episodios/curto/cenas.tsx", `import { Gato, Moldura } from "@praeko/studio-kit";\nimport { tema } from "../../src/marca";\nexport const CapaCurto = () => (<Moldura glow="x" titulo={["A", "B"]} cor={tema.destaque} tam={104}><Gato nome="feliz" /></Moldura>);\n`);
  put(root, "episodios/curto/palavras.json", JSON.stringify(WORDS));
  put(root, "episodios/curto/palavras.ts", `import { Palavra } from "@praeko/studio-core";\n\nexport const PALAVRAS: Palavra[] = ${JSON.stringify(WORDS)};\n`);
  put(root, "episodios/curto/roteiro.txt", "Fui conferir aqui.\n");
  put(root, "episodios/curto/voz.mp3", "mp3");
  put(root, "episodios/curto/publicacao.json", JSON.stringify({ nome: "Curto", titulo: "Curto", formato: "short", arquivos: { video: "c.mp4", capa: "c.png" }, ia: { sintetico: true }, yt: { descricao: "d", comentarioFixo: "f" }, ig: { legenda: "l" }, tiktok: { legenda: "t" }, hashtags: { youtube: ["#a"], instagram: ["#a"], tiktok: ["#a"] }, antesDePublicar: ["ver"] }));
  put(root, "episodios/curto/textos.md", "# textos\n");
  put(root, "episodios/curto/agendamento.json", JSON.stringify({ provedor: "praeko", slug: "curto", titulo: "Curto", postId: "curto", videoUrl: null, criadoEm: "2026-11-01T00:00:00.000Z", posts: [{ rede: "youtube", id: "it1", postId: "curto", dueAt: "2026-11-10T20:30:00.000Z", canalId: "c1" }] }));
  // long with blocks and a block cache named with the OLD hash (alias minha-voz, provider elevenlabs, model eleven_v4)
  put(root, "episodios/longo/episodio.yaml", `formato: longo\nid: Longo\nduracao: 60\nvoz: audio/Longo.mp3\ncenas:\n  - titulo: A\n    inicio: { bloco: 1 }\n    itens:\n      - { tipo: txt, quando: Fui conferir, pos: { esquerda: 200, topo: 400, largura: 1500 }, tamanho: 80, cor: destaque, texto: titulo }\n      - { tipo: codigo, quando: aqui, pos: { esquerda: 0, topo: 0 }, titulo: t, linhas: [{ s: a, hl: [{ quando: Fui, depois: 0 }, 3] }] }\n  - titulo: B\n    inicio: { bloco: 2 }\n    itens:\n      - { tipo: contador, quando: acabou, pos: { esquerda: 1, topo: 1 }, de: 0, ate: 10, duracao: 1 }\nmascote: [{ quando: aqui, gato: feliz, mais: 0.5 }]\ncapa: { titulo: ["UM", "DOIS"], gato: feliz, chips: [{ texto: ok, cor: ok }] }\nfecho: { inicio: 50, texto: x, link: y }\n`);
  put(root, "episodios/longo/episodio.json", JSON.stringify({ id: "Longo", capa: "CapaLongo", titulo: "Longo" }));
  put(root, "episodios/longo/episodio.tsx", `import { LongoDecl, LongoSpec } from "@praeko/studio-kit";\nimport { tema } from "../../src/marca";\nimport * as pecas from "./cenas";\nimport spec from "./episodio.spec.json";\nimport { PALAVRAS } from "./palavras";\n\nexport const LongoComposition = () => <LongoDecl spec={spec as LongoSpec} palavras={PALAVRAS} tema={tema} pecas={pecas as any} />;\n`);
  put(root, "episodios/longo/cenas.tsx", "export {};\n");
  put(root, "episodios/longo/palavras.json", JSON.stringify(WORDS));
  put(root, "episodios/longo/palavras.ts", `import { Palavra } from "@praeko/studio-core";\n\nexport const PALAVRAS: Palavra[] = ${JSON.stringify(WORDS)};\n`);
  put(root, "episodios/longo/roteiro.txt", SCRIPT_LONG);
  put(root, "episodios/longo/blocos.json", JSON.stringify([{ n: 1, titulo: "A", a: 0.2, b: 3 }, { n: 2, titulo: "B", a: 3.6, b: 7 }]));
  const key = `minha-voz|elevenlabs|eleven_v4|${JSON.stringify(PRON)}`;
  OLD_BLOCK_TEXT.forEach((t, i) => { const h = sha1(key + "\n" + t), n = `0${i + 1}`; put(root, `episodios/longo/voz-blocos/${n}-${h}.mp3`, "audio" + i); put(root, `episodios/longo/voz-blocos/${n}-${h}.json`, JSON.stringify({ duracao: 1.5, palavras: [{ t: "x", a: 0, b: 1 }] })); });
  put(root, "episodios/longo/voz.mp3", "mp3");
  // cut with an own hook (old hash: sha1(texto|qualidade|pronuncia))
  put(root, "episodios/corte/episodio.yaml", "id: Corte\nduracao: 10\nvoz: x\nfechamento: { inicio: 8, cta: FIM }\ncenas:\n  - inicio: 0\n    itens:\n      - { tipo: big, em: 0.2, texto: oi }\n");
  put(root, "episodios/corte/episodio.json", JSON.stringify({ id: "Corte", capa: "CapaCorte" }));
  put(root, "episodios/corte/corte.json", JSON.stringify({ longo: "longo", de: "bloco:1", ate: "bloco:1", abertura: { texto: "Gancho aqui", qualidade: "final" } }));
  const hh = sha1(`Gancho aqui|final|${JSON.stringify(PRON)}`);
  put(root, `episodios/corte/voz-abertura/${hh}.mp3`, "hook"); put(root, `episodios/corte/voz-abertura/${hh}.json`, JSON.stringify({ duracao: 1, palavras: [], estimada: false }));
  put(root, "episodios/corte/palavras.json", JSON.stringify(WORDS));
  // agent files
  put(root, "CLAUDE.md", `# Meu projeto\nUse \`praeko studio novo x --titulo T\` e \`praeko studio voz x --qualidade rascunho\`; veja marca.json e episodios/.\n\n<!-- praeko-studio:inicio (gerado por \`praeko studio skill install\`; edite fora deste bloco) -->\nProjeto de vídeo (Praeko Studio). Instruções completas: skill \`praeko-studio\`.\n<!-- praeko-studio:fim -->\n`);
  put(root, ".claude/skills/praeko-studio/SKILL.md", "---\nname: praeko-studio\n---\n# Praeko Studio: como fazer um vídeo com o seu agente\nVocê (o agente) opera `praeko studio novo` e lê marca.json.\n");
  return root;
}

test("legacy detection: every other command stops with the migrate instruction (init, docs, doctor, skill install, help and migrate still work)", () => {
  const root = legacyProject();
  for (const args of [["compile", "curto"], ["check", "curto"], ["new", "x"], ["voice", "curto"], ["schedule", "curto", "--when", "30/12 10:00"], ["queue"]]) {
    const r = studio(args, root);
    assert.equal(r.status, 1, args.join(" "));
    assert.match(r.stderr, /this project uses the old Portuguese layout: run `npx @praeko\/studio@[\d.]+ migrate` \(add --dry-run to preview\)/);
  }
  assert.equal(studio(["docs"], root).status, 0); assert.equal(studio(["help"], root).status, 0);
  assert.equal(studio(["doctor", "--offline"], root).status === 1 || studio(["doctor", "--offline"], root).status === 0, true);
  assert.equal(studio(["skill", "install", "--dir", mkdtempSync(join(base, "s-")), "--agent", "codex"], root).status, 0);
});

test("migrate --dry-run prints the plan and writes nothing (not even the backup)", () => {
  const root = legacyProject(), before = tree(root).sort();
  const r = studio(["migrate", "--dry-run"], root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /DRY RUN/); assert.match(r.stdout, /files renamed\/moved: \d+/); assert.match(r.stdout, /audio cache files renamed to the new hash: 3/);
  assert.deepEqual(tree(root).sort(), before);
  assert.ok(!existsSync(join(root, ".studio-backup")));
});

test("migrate: renames files and folders, rewrites keys and imports, keeps comments, renames the audio cache, backs everything up, is idempotent", () => {
  const root = legacyProject();
  const r = studio(["migrate"], root);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  // layout
  for (const f of ["brand.json", "voices.json", "src/brand.ts", "episodes/curto/episode.yaml", "episodes/curto/episode.json", "episodes/curto/episode.tsx", "episodes/curto/scenes.tsx", "episodes/curto/words.json", "episodes/curto/words.ts", "episodes/curto/script.txt", "episodes/curto/voice.mp3", "episodes/curto/publication.json", "episodes/curto/texts.md", "episodes/curto/schedule.json", "episodes/curto/episode.spec.json", "episodes/longo/blocks.json", "episodes/longo/cut.json".replace("longo/cut", "corte/cut"), "episodes/corte/cut.json"]) assert.ok(existsSync(join(root, f)), f);
  for (const f of ["marca.json", "vozes.json", "src/marca.ts", "episodios"]) assert.ok(!existsSync(join(root, f)), `${f} is gone`);
  // brand and voices
  const brand = JSON.parse(read(root, "brand.json"));
  assert.equal(brand.name, "Canal"); assert.equal(brand.colors.accent, "#fa0"); assert.equal(brand.voice, "my-voice"); assert.deepEqual(brand.pronunciation, PRON);
  assert.equal(brand.links.jogo, "https://exemplo.com/", "user-named links keep their names"); assert.equal(brand.publishing.provider, "praeko"); assert.equal(brand.publishing.hashtags.allowed[0], "#a");
  assert.equal(brand.mascotPath, "gatos/gato-{name}.png"); assert.equal(brand.publishing.youtube.language, "pt");
  assert.ok(brand.publishing.aiTicPatterns.length === 2);
  const voices = JSON.parse(read(root, "voices.json"));
  assert.equal(voices.voices["my-voice"].provider, "elevenlabs"); assert.equal(voices.voices["my-voice"].aligner, "scribe"); assert.deepEqual(voices.accounts.elevenlabs, ["principal"]);
  // YAML: keys translated, comments kept
  const y = read(root, "episodes/curto/episode.yaml");
  assert.match(y, /# Curto/); assert.match(y, /# acompanha a voz/); assert.match(y, /duration: \{ voice: 2\.5 \}/); assert.match(y, /type: box/); assert.match(y, /color: accent/); assert.match(y, /align: left/); assert.match(y, /lineHeight: 1\.2/); assert.match(y, /outro:/);
  assert.doesNotMatch(y, /duracao|fechamento|cenas|itens|tipo:|quando|texto:/);
  // glue regenerated, user TSX imports rewritten, words renamed
  assert.match(read(root, "episodes/curto/episode.tsx"), /<EpisodeDecl spec=\{spec as EpisodeSpec\} words=\{WORDS\} theme=\{theme\} components=\{components\} \/>/);
  assert.match(read(root, "episodes/longo/episode.tsx"), /LongDecl/);
  const scenes = read(root, "episodes/curto/scenes.tsx");
  assert.match(scenes, /import \{ Mascot as Gato, Frame as Moldura \} from "@praeko\/studio-kit"|import \{ Frame as Moldura, Mascot as Gato \} from "@praeko\/studio-kit"/);
  assert.match(scenes, /import \{ theme as tema \} from "\.\.\/\.\.\/src\/brand"/);
  assert.match(read(root, "episodes/curto/words.ts"), /export const WORDS: Word\[\]/);
  assert.match(read(root, "src/brand.ts"), /themeFromBrand\(brand/);
  const rootTsx = read(root, "src/Root.tsx");
  assert.match(rootTsx, /from "\.\.\/episodes\/curto\/episode"/); assert.match(rootTsx, /praeko-studio:imports/); assert.match(rootTsx, /praeko-studio:\/compositions/); assert.doesNotMatch(rootTsx, /composicoes|episodios/);
  assert.match(read(root, "tsconfig.json"), /"episodes"/);
  const pkg = JSON.parse(read(root, "package.json"));
  assert.equal(pkg.dependencies["@praeko/studio-core"], "^0.2.0"); assert.equal(pkg.dependencies["@praeko/studio-kit"], "file:../kit"); assert.equal(pkg.devDependencies["@praeko/studio"], "^0.2.0");
  assert.equal(pkg.scripts.novo, "praeko studio new meu --title T");
  // publication, schedule, cut
  const pub = JSON.parse(read(root, "episodes/curto/publication.json"));
  assert.equal(pub.title, "Curto"); assert.equal(pub.files.cover, "c.png"); assert.equal(pub.ai.synthetic, true); assert.equal(pub.yt.pinnedComment, "f"); assert.deepEqual(pub.beforePublishing, ["ver"]);
  const sched = JSON.parse(read(root, "episodes/curto/schedule.json"));
  assert.equal(sched.provider, "praeko"); assert.equal(sched.createdAt, "2026-11-01T00:00:00.000Z"); assert.deepEqual(sched.posts[0], { network: "youtube", id: "it1", postId: "curto", dueAt: "2026-11-10T20:30:00.000Z", channelId: "c1" });
  const cut = JSON.parse(read(root, "episodes/corte/cut.json"));
  assert.deepEqual(cut, { long: "longo", from: "bloco:1", to: "bloco:1", hook: { text: "Gancho aqui", quality: "final" } });
  assert.deepEqual(JSON.parse(read(root, "episodes/longo/blocks.json"))[0], { n: 1, title: "A", a: 0.2, b: 3 });
  // audio cache: files renamed to the NEW hash (computed with the new key), so the audio is reused
  const newKey = blockCacheKey({ voiceAlias: "my-voice", provider: "elevenlabs", model: "eleven_v4", pronunciation: PRON });
  OLD_BLOCK_TEXT.forEach((t, i) => { const f = `episodes/longo/voice-blocks/0${i + 1}-${blockHash(t, newKey)}`; assert.ok(existsSync(join(root, f + ".mp3")), f); assert.deepEqual(JSON.parse(read(root, f + ".json")), { duration: 1.5, words: [{ t: "x", a: 0, b: 1 }] }); });
  const hook = hookHash({ text: "Gancho aqui", quality: "final", pronunciation: PRON });
  assert.ok(existsSync(join(root, `episodes/corte/voice-hook/${hook}.mp3`))); assert.deepEqual(JSON.parse(read(root, `episodes/corte/voice-hook/${hook}.json`)), { duration: 1, words: [], estimated: false });
  // agent files
  const claude = read(root, "CLAUDE.md");
  assert.match(claude, /praeko studio new x --title T/); assert.match(claude, /praeko studio voice x --quality draft/); assert.match(claude, /brand\.json/); assert.match(claude, /episodes\//);
  assert.match(claude, /praeko-studio:start/); assert.match(claude, /Projeto de vídeo \(Praeko Studio\)/, "the language already present (pt) is kept"); assert.doesNotMatch(claude, /praeko-studio:inicio|praeko-studio:fim/);
  assert.match(read(root, ".claude/skills/praeko-studio/SKILL.md"), /npx @praeko\/studio@[\d.]+ new/);
  assert.match(read(root, ".gitignore"), /\.studio-backup\//);
  // backup and report
  const backups = readdirSync(join(root, ".studio-backup")); assert.equal(backups.length, 1);
  const bk = join(root, ".studio-backup", backups[0]!);
  for (const f of ["marca.json", "vozes.json", "src/marca.ts", "episodios/curto/episodio.yaml", "episodios/curto/episodio.spec.json", "episodios/curto/episodio.tsx", "CLAUDE.md"]) assert.ok(existsSync(join(bk, f)), `backup has ${f}`);
  assert.match(readFileSync(join(bk, "REPORT.md"), "utf8"), /Manual follow-ups/);
  assert.match(readFileSync(join(bk, "REPORT.md"), "utf8"), /scenes\.tsx:\d+: theme fields are English now/);
  assert.match(r.stdout, /compile curto: ok/);
  // compile on the migrated project works (the spec is English)
  assert.equal(studio(["compile", "curto"], root).status, 0);
  const spec = JSON.parse(read(root, "episodes/curto/episode.spec.json"));
  assert.equal(spec.scenes[0].items[0].type, "box"); assert.equal(spec.outro.cta, "SEGUE"); assert.equal(spec.cover.component, "CapaCurto");
  assert.equal(studio(["compile", "longo"], root).status, 0);
  assert.equal(JSON.parse(read(root, "episodes/longo/episode.spec.json")).mascot[0].name, "feliz");
  // idempotent
  const again = studio(["migrate"], root);
  assert.equal(again.status, 0); assert.match(again.stdout, /nothing to do/);
  assert.equal(readdirSync(join(root, ".studio-backup")).length, 1, "no second backup");
});

test("migrate --lang pt prints the report headings in Portuguese", () => {
  const root = legacyProject();
  const r = studio(["migrate", "--dry-run", "--lang", "pt"], root);
  assert.match(r.stdout, /SIMULAÇÃO \(nada é gravado\)/); assert.match(r.stdout, /arquivos renomeados\/movidos/);
});

test("key translators: brand, voices, publication, schedule and episode", () => {
  assert.equal(translateBrand({ cores: { destaque: "#1" }, publicacao: { hospedagem: { tipo: "r2", urlBase: "u" }, buffer: { canais: { youtube: "x" } } } }).value.colors.accent, "#1");
  assert.deepEqual(translateBrand({ publicacao: { hospedagem: { tipo: "r2", urlBase: "u" } } }).value.publishing.hosting, { type: "r2", baseUrl: "u" });
  assert.deepEqual(translateBrand({ publicacao: { buffer: { canais: { youtube: "x" } } } }).value.publishing.buffer.channels, { youtube: "x" });
  const v = translateVoices({ qualidade: { rascunho: "rascunho-mudo", final: "minha-voz" }, vozes: { "voz-local": { provedor: "voicestudio", idioma: "pt-BR" } }, estrategia: { elevenlabs: "failover-saldo" } }).value;
  assert.deepEqual(v.quality, { draft: "draft-silent", final: "my-voice" }); assert.equal(v.voices["local-voice"].language, "pt-BR"); assert.equal(v.strategy.elevenlabs, "failover-balance");
  assert.equal(translatePublication({ formato: "longo", capitulos: [{ t: 0, titulo: "a" }] }).value.chapters[0].title, "a");
  assert.equal(translateSchedule({ posts: [{ rede: "youtube", canalId: "c" }] }).value.posts[0].channelId, "c");
  const e = translateEpisode({ formato: "longo", cenas: [{ inicio: { bloco: 2 }, itens: [{ tipo: "txt", altura: 3 }, { tipo: "barra", altura: 40 }] }] }).value;
  assert.deepEqual(e.scenes[0].start, { block: 2 }); assert.equal(e.scenes[0].items[0].type, "freetext"); assert.equal(e.scenes[0].items[1].height, 40);
  assert.equal(translateEpisode({ cenas: [{ itens: [{ tipo: "texto", altura: 1.2 }] }] }).value.scenes[0].items[0].lineHeight, 1.2);
  assert.deepEqual(translateEpisode({ cenas: [], golpes: [{ em: 1, tipo: "tudo" }] }).value.hits, [{ at: 1, type: "all" }]);
  // idempotent on English input
  const en = { duration: 5, scenes: [{ start: 0, items: [{ type: "box", color: "accent" }] }] };
  assert.deepEqual(translateEpisode(en).value, en); assert.deepEqual(translateEpisode(en).renamed, []);
});
test("tsx rewriting: specifiers, studio imports (keeping the local name) and the generated glue props", () => {
  const t = rewriteTsx('import { Gato, Moldura as M } from "@praeko/studio-kit";\nimport { mkAtG, janela as win, surge } from "@praeko/studio-core";\nimport { PALAVRAS } from "./palavras";\nimport { tema } from "../../src/marca";\nimport x from "./episodio.spec.json";\n');
  assert.match(t, /import \{ Mascot as Gato, Frame as M \} from "@praeko\/studio-kit"/);
  assert.match(t, /import \{ makeAtGlobal as mkAtG, fadeWindow as win, appear as surge \} from "@praeko\/studio-core"/);
  assert.match(t, /from "\.\/words"/); assert.match(t, /import \{ theme as tema \} from "\.\.\/\.\.\/src\/brand"/); assert.match(t, /"\.\/episode\.spec\.json"/);
  assert.match(rewriteWordsTs('import { Palavra } from "@praeko/studio-core";\n\nexport const PALAVRAS_BANCA: Palavra[] = [{"t":"a","a":0,"b":1}];\n'), /export const PALAVRAS_BANCA: Word\[\] = \[\{"t":"a"/);
});
test("markdown rewriting: only command words, flags and file names", () => {
  const OLD = ["bar", "do"].join("");
  const t = rewriteMarkdown(`Run \`${OLD} novo x --titulo T\`, \`praeko studio voz saldo\` and \`praeko studio fila listar\`; see marca.json, episodios/ and docs/episodio-yaml.md.\nA sentence with a novo word and --titulo outside a command stays.`);
  assert.match(t, /`praeko studio new x --title T`/); assert.match(t, /praeko studio voice balance/); assert.match(t, /praeko studio queue list/);
  assert.match(t, /brand\.json, episodes\/ and docs\/episode-yaml\.md/); assert.match(t, /A sentence with a novo word and --titulo outside a command stays\./);
});
test("yaml rewriting keeps comments and flow style", () => {
  const r = rewriteYaml("# top\nduracao: 12 # inline\nfechamento: { inicio: 9, cta: FIM }\n", (v) => translateEpisode(v).value);
  assert.equal(r.preserved, true); assert.match(r.text, /# top/); assert.match(r.text, /duration: 12 # inline/); assert.match(r.text, /outro: \{ start: 9, cta: FIM \}/);
});
test("the migrated copy of an episode compiles with the same result as an English one", () => {
  const root = legacyProject();
  assert.equal(studio(["migrate"], root).status, 0);
  const r = compileEpisode(join(root, "episodes", "curto"), { write: false });
  assert.deepEqual(r.errors, []);
});
void cpSync;

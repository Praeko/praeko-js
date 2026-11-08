// English is the only surface: help, commands, output language (--lang / PRAEKO_LANG), and a heuristic scan for Portuguese words.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { help } from "../src/help.ts";
import { BODY, DESCRIPTION } from "../src/skill-texts.ts";
import { NOTICE } from "../src/licenses.ts";
import { translate } from "../src/i18n.ts";
import { PT } from "../src/i18n-pt.ts";

const PACKAGE = fileURLToPath(new URL("..", import.meta.url)), BIN = join(PACKAGE, "bin", "praeko-studio.ts");
const base = mkdtempSync(join(tmpdir(), "studio-en-"));
const ENV = { ...process.env, HOME: base, PRAEKO_NO_KEYCHAIN: "1", PRAEKO_STUDIO_CONFIG: join(base, "cfg"), PRAEKO_SECRETS: join(base, "s.json") } as NodeJS.ProcessEnv;
delete ENV.PRAEKO_LANG;
const studio = (args: string[], cwd = base, env = ENV) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", env });

// distinctive Portuguese words (not shared with English)
const PT_WORDS = /\b(não|você|vocês|também|então|arquivos?|comandos?|projeto|roteiro|cenas?|legenda|fechamento|duração|publicação|título|descrição|gerar|vídeos?|pasta|escreva|precisa|nenhum|nenhuma|depois|antes|quando|sobre|pelo|pela|uma|dos|das)\b/gi;

test("the command list in --help is the English one", () => {
  const h = help("0.2.3");
  for (const cmd of ["new <slug>", "voice <slug>", "voice balance", "compile <slug>", "cut <long>", "preview", "render <slug>", "cover <slug>", "contact-sheet", "check <slug>", "package <slug>", "schedule <slug>", "post <slug>", "queue [list|run|cancel", "account <youtube|instagram|tiktok> [connect|status]", "migrate [--dry-run]", "doctor", "licenses", "skill install", "docs [topic]", "init <folder>"]) assert.ok(h.includes(cmd), cmd);
  for (const flag of ["--title", "--long", "--quality draft|final|local", "--aligner", "--no-failover", "--from <ref> --to <ref>", "--hook", "--engine", "--scale", "--when", "--networks", "--send", "--channels", "--key", "--accept", "--no-install"]) assert.ok(h.includes(flag), flag);
  for (const old of ["novo <slug>", "compilar", "folha", "checar", "agendar", "--titulo", "--qualidade", "--enviar", "--quando"]) assert.ok(!h.includes(old), old);
  assert.equal(studio(["--help"]).stdout, h + "\n");
});
test("no Portuguese words in the help text, the English skill text, the notice and the skill description", () => {
  const dirty = (name: string, text: string) => { const m = text.match(PT_WORDS); assert.equal(m, null, `${name}: ${m?.join(", ")}`); };
  dirty("help", help("0.2.3")); dirty("skill en", BODY.en); dirty("skill description en", DESCRIPTION.en); dirty("notice en", NOTICE.en);
});
test("source scan: no Portuguese words in the CLI sources outside the allow-list (pt dictionary, pt skill/notice texts, migrate)", () => {
  const ALLOW = new Set(["i18n-pt.ts", "skill-texts.ts", "licenses.ts", "skill.ts"]); // the pt translations live here
  const hits: string[] = [];
  const scan = (dir: string): void => { for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "migrate") scan(p); continue; }
    if (!/\.ts$/.test(e.name) || ALLOW.has(e.name)) continue;
    readFileSync(p, "utf8").split("\n").forEach((l, i) => { if (/[áâãàéêíóôõúç]/i.test(l) && !/\/\/ .*—|…|→|✓|✗|⚠|·|≈|–/.test(l)) hits.push(`${relative(PACKAGE, p)}:${i + 1}: ${l.trim().slice(0, 90)}`); });
  } };
  scan(join(PACKAGE, "src")); scan(join(PACKAGE, "bin"));
  assert.deepEqual(hits, []);
});
test("--lang pt translates messages; --lang en and the default stay English; PRAEKO_LANG=pt works and --lang en overrides it", () => {
  const proj = join(base, "p"); mkdirSync(join(proj, "src"), { recursive: true });
  writeFileSync(join(proj, "src", "index.ts"), ""); writeFileSync(join(proj, "brand.json"), "{}");
  const ep = join(proj, "episodes", "a"); mkdirSync(ep, { recursive: true });
  writeFileSync(join(ep, "episode.yaml"), "id: A\nduration: 12\nvoice: x\noutro: { start: 9, cta: END }\nscenes:\n  - start: 0\n    items:\n      - { type: big, text: hi }\n");
  const en = studio(["compile", "a"], proj);
  assert.match(en.stdout, /0 error\(s\), 1 warning\(s\)/); assert.match(en.stdout, /1 scenes/);
  const pt = studio(["compile", "a", "--lang", "pt"], proj);
  assert.match(pt.stdout, /0 erro\(s\), 1 aviso\(s\)/); assert.match(pt.stdout, /1 cenas/); assert.match(pt.stdout, /words\.json vazio ou ausente/);
  assert.match(studio(["compile", "a"], proj, { ...ENV, PRAEKO_LANG: "pt" }).stdout, /0 erro\(s\)/);
  assert.match(studio(["compile", "a", "--lang", "en"], proj, { ...ENV, PRAEKO_LANG: "pt" }).stdout, /0 error\(s\)/);
  const err = studio(["compile", "missing"], proj, { ...ENV, PRAEKO_LANG: "pt" });
  assert.match(err.stderr, /^erro: episódio "missing" não existe/);
  assert.match(studio(["licenses", "--lang", "pt"], proj).stdout, /Licenças \(leia antes do primeiro render\)/);
  assert.match(studio(["doctor", "--offline", "--lang", "pt"], proj).stdout, /\d+ erro\(s\), \d+ aviso\(s\)/);
});
test("the pt dictionary: unknown strings fall back to English, commands/flags/keys are never translated", () => {
  assert.equal(translate("something with no translation", "pt"), "something with no translation");
  assert.equal(translate("0 error(s), 2 warning(s)", "pt"), "0 erro(s), 2 aviso(s)");
  assert.equal(translate("praeko studio new x --title T", "pt"), "praeko studio new x --title T");
  assert.equal(translate("0 error(s), 2 warning(s)", "en"), "0 error(s), 2 warning(s)");
  assert.ok(PT.every(([re, to]) => re instanceof RegExp && typeof to === "string"));
});
test("old Portuguese flags do nothing and old commands print the help with exit 2", () => {
  for (const c of ["novo", "voz", "compilar", "corte", "prever", "capa", "folha", "checar", "pacote", "agendar", "postar", "fila", "conta", "licencas", "ajuda"]) { const r = studio([c]); assert.equal(r.status, 2, c); assert.match(r.stdout, /praeko studio <command>/); }
});

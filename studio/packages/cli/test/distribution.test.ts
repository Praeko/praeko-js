// Praeko Studio distribution: init by semver, --dev mode, skill per agent, doctor, license notice, docs, and the personal-data audit.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENTS, TARGETS, installSkill } from "../src/skill.ts";
import { findChromium, diagnose, primaryFamily } from "../src/doctor.ts";
import { NOTICE, noticeText, writeAcceptance, readAcceptance, licensesCommand } from "../src/licenses.ts";

const PACKAGE = fileURLToPath(new URL("..", import.meta.url)), BIN = join(PACKAGE, "bin", "praeko-studio.ts"), STUDIO = join(PACKAGE, "..", "..");
const base = mkdtempSync(join(tmpdir(), "praeko-studio-dist-"));
// isolated environment: no real key, keychain or user configuration gets into these tests
const ENV: Record<string, string | undefined> = { ...process.env, HOME: base, USERPROFILE: base, PRAEKO_STUDIO_CONFIG: join(base, "cfg"), PRAEKO_SECRETS: join(base, "secrets.json"), PRAEKO_NO_KEYCHAIN: "1", PRAEKO_STUDIO_NO_NOTICE: "1", LANG: "en_US.UTF-8" };
for (const k of ["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "PRAEKO_KEY", "PRAEKO_STUDIO", "PRAEKO_LANG"]) delete ENV[k];
const cli = (args: string[], cwd = base, env = ENV) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", env: env as NodeJS.ProcessEnv });
const read = (f: string) => readFileSync(f, "utf8");

test("init: dependencies by published semver (no file:), @praeko/studio in devDependencies, config without alias, silent draft voice", () => {
  const proj = join(base, "proj");
  const r = cli(["init", proj, "--name", "My Channel", "--no-install", "--agent", "claude"]);
  assert.equal(r.status, 0, r.stderr);
  const pj = JSON.parse(read(join(proj, "package.json")));
  assert.match(pj.dependencies["@praeko/studio-core"], /^\^\d+\.\d+\.\d+$/); assert.match(pj.dependencies["@praeko/studio-kit"], /^\^\d+\.\d+\.\d+$/);
  assert.equal(pj.dependencies["@praeko/studio-core"], "^0.2.0");
  assert.match(pj.devDependencies["@praeko/studio"], /^\^\d/);
  assert.doesNotMatch(JSON.stringify(pj), /file:/);
  assert.doesNotMatch(read(join(proj, "remotion.config.ts")), /alias|node_modules\/remotion/);
  const brand = JSON.parse(read(join(proj, "brand.json")));
  assert.equal(brand.voice, "draft-silent"); assert.deepEqual(brand.links, {}); assert.equal(brand.publishing.provider, "praeko");
  assert.equal(brand.avatar, "cover/avatar.png");
  assert.doesNotMatch(JSON.stringify(brand), /marcone|guilda|dev\.ocioso|jogo/i);
  assert.match(r.stdout, /Remotion/); assert.match(r.stdout, /NOT MIT/, "the license notice shows up in init");
  assert.ok(existsSync(join(proj, ".claude/skills/praeko-studio/SKILL.md")));
  assert.match(read(join(proj, ".gitignore")), /\.env/);
  assert.match(read(join(proj, ".gitignore")), /\.studio-backup\//);
});
test("init output is English: no Portuguese words in the generated project files", () => {
  const proj = join(base, "proj");
  const PT = /\b(roteiro|publicacao|episodio|cenas|palavras|voz|marca|titulo|vídeo|você|gancho|fechamento|legenda)\b/i;
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "node_modules" || e.name === "sfx" ? [] : walk(join(d, e.name))) : [join(d, e.name)]));
  for (const f of walk(proj)) { if (/\.(png|wav)$/.test(f)) continue; assert.doesNotMatch(read(f), PT, relative(proj, f)); }
});
test("init --dev <studio>: contributor mode with file: and remotion/react alias", () => {
  const proj = join(base, "projdev");
  const r = cli(["init", proj, "--no-install", "--dev", STUDIO, "--agent", "codex"]);
  assert.equal(r.status, 0, r.stderr);
  const pj = JSON.parse(read(join(proj, "package.json")));
  assert.match(pj.dependencies["@praeko/studio-core"], /^file:.*packages\/core$/);
  assert.equal(pj.devDependencies["@praeko/studio"], undefined);
  assert.match(read(join(proj, "remotion.config.ts")), /alias/);
  assert.notEqual(cli(["init", join(base, "x"), "--dev", "/does/not/exist", "--no-install"]).status, 0);
});
test("skill install: writes each agent's right file, with the two-step publishing text, local upload and AI disclosure, in en and pt with the new command names", () => {
  const expected: Record<string, string[]> = { claude: [".claude/skills/praeko-studio/SKILL.md", "CLAUDE.md"], codex: ["AGENTS.md"], opencode: ["AGENTS.md"], gemini: ["GEMINI.md"], cursor: [".cursor/rules/praeko-studio.mdc"], cline: [".clinerules/praeko-studio.md"], windsurf: [".windsurf/rules/praeko-studio.md"] };
  assert.deepEqual([...AGENTS].sort(), Object.keys(expected).sort());
  for (const [ag, files] of Object.entries(expected)) for (const lang of ["pt", "en"]) {
    const d = mkdtempSync(join(base, "sk-"));
    installSkill({ dir: d, agents: [ag], lang });
    for (const a of files) assert.ok(existsSync(join(d, a)), `${ag}/${lang}: ${a}`);
    const main = read(join(d, files[0]!));
    if (ag === "claude" && files[0]!.endsWith("SKILL.md") || ag !== "claude") {
      for (const re of [/confirmation_code/, /create_media_upload/, /complete_media_upload/, /synthetic/, /praeko studio docs/, /praeko studio compile/, /praeko studio voice <slug> --quality draft/, /script\.txt/, /brand\.json/]) assert.match(main, re, `${ag}/${lang}: ${re}`);
      for (const old of [/praeko studio (novo|voz|compilar|checar|pacote|agendar)\b/, /--(titulo|qualidade|quando|enviar)\b/, /marca\.json|roteiro\.txt|publicacao\.json|episodio\.yaml/]) assert.doesNotMatch(main, old, `${ag}/${lang}: ${old}`);
    }
    assert.doesNotMatch(main, /marcone|dev\.ocioso|guilda|\/Users\//i);
    if (ag !== "claude" || files[0]!.endsWith("SKILL.md")) assert.match(main, lang === "en" ? /Never confirm on your own/ : /Nunca confirme por conta própria/);
  }
  const c = mkdtempSync(join(base, "sk-")); installSkill({ dir: c, agents: ["claude"] });
  assert.match(read(join(c, ".claude/skills/praeko-studio/SKILL.md")), /^---\nname: praeko-studio\ndescription: /);
  assert.equal(read(join(STUDIO, "skill", "praeko-studio", "SKILL.md")), TARGETS.claude[0]!.content("en"), "studio/skill/praeko-studio/SKILL.md is generated in English (node scripts/build-studio.mjs)");
  assert.ok(TARGETS.cursor[0]!.content("pt").includes("alwaysApply: true"));
});
test("skill install: keeps the user's text in AGENTS.md/CLAUDE.md, updates only the block and is idempotent", () => {
  const d = mkdtempSync(join(base, "sk-"));
  writeFileSync(join(d, "AGENTS.md"), "# My rules\nUse tabs.\n");
  installSkill({ dir: d, agents: ["codex"] });
  const a = read(join(d, "AGENTS.md"));
  assert.match(a, /^# My rules\nUse tabs\./); assert.match(a, /praeko-studio:start/);
  const r2 = installSkill({ dir: d, agents: ["codex"], lang: "en" });
  assert.equal(read(join(d, "AGENTS.md")), a, "reinstalling changes nothing"); assert.equal(r2[0]!.action, "updated");
  installSkill({ dir: d, agents: ["codex"], lang: "pt" });
  const pt = read(join(d, "AGENTS.md"));
  assert.match(pt, /Use tabs\./); assert.match(pt, /Nunca confirme por conta própria/); assert.equal((pt.match(/praeko-studio:start/g) || []).length, 1);
  assert.throws(() => installSkill({ dir: d, agents: ["vim"] }), /unknown agent/);
});
test("skill install through the CLI: --agent all writes the seven agents; without --agent it detects what exists", () => {
  const d = mkdtempSync(join(base, "sk-"));
  const r = cli(["skill", "install", "--agent", "all", "--lang", "en", "--dir", d]);
  assert.equal(r.status, 0, r.stderr);
  for (const a of ["AGENTS.md", "GEMINI.md", "CLAUDE.md", ".cursor/rules/praeko-studio.mdc", ".clinerules/praeko-studio.md", ".windsurf/rules/praeko-studio.md"]) assert.ok(existsSync(join(d, a)), a);
  const e = mkdtempSync(join(base, "sk-")); mkdirSync(join(e, ".cursor"));
  assert.equal(cli(["skill", "install", "--dir", e]).status, 0);
  assert.ok(existsSync(join(e, ".cursor/rules/praeko-studio.mdc")) && !existsSync(join(e, "GEMINI.md")));
  assert.notEqual(cli(["skill", "remove"]).status, 0);
});
test("doctor: with no keys or project it runs offline, prints no secret and flags the license notice", async () => {
  const r = cli(["doctor", "--json", "--offline"]);
  const j = JSON.parse(r.stdout);
  const ids = j.items.map((i: any) => i.id);
  for (const id of ["node", "ffmpeg", "ffprobe", "chromium", "licenses", "network", "key-elevenlabs", "key-praeko"]) assert.ok(ids.includes(id), id);
  assert.equal(j.items.find((i: any) => i.id === "licenses").level, "warning");
  assert.equal(j.items.find((i: any) => i.id === "key-elevenlabs").level, "info");
  assert.equal(r.status, j.ok ? 0 : 1);
  const text = cli(["doctor", "--offline"]).stdout;
  assert.match(text, /Remotion/); assert.match(text, /NOT MIT/);
  const bad = await diagnose({ offline: true, cwd: base, fetchFn: (async () => { throw new Error("must not call the network"); }) as any });
  assert.ok(bad.length > 5);
  const withNet = await diagnose({ cwd: base, fetchFn: (async () => { throw Object.assign(new Error("x"), { cause: { code: "ENOTFOUND" } }); }) as any });
  assert.equal(withNet.find((i) => i.id === "network")!.level, "warning");
});
test("doctor: a present key shows only as 'present' (never the value) and a missing font is a warning inside a project", () => {
  const proj = join(base, "proj");
  const brand = JSON.parse(read(join(proj, "brand.json"))); brand.fonts = { title: "'Font That Does Not Exist 9', sans-serif", mono: "monospace" };
  writeFileSync(join(proj, "brand.json"), JSON.stringify(brand));
  const r = cli(["doctor", "--json", "--offline"], proj, { ...ENV, ELEVENLABS_API_KEY: "sk_secret_that_must_not_show" });
  assert.doesNotMatch(r.stdout + r.stderr, /sk_secret/);
  const j = JSON.parse(r.stdout);
  assert.match(j.items.find((i: any) => i.id === "key-elevenlabs").msg, /present/);
  assert.equal(j.items.find((i: any) => i.id === "font-title").level, "warning");
  assert.equal(primaryFamily("'Arial Black', 'Helvetica Neue', sans-serif"), "Arial Black"); assert.equal(primaryFamily("monospace"), null);
});
test("findChromium uses CHROME_PATH and the Chrome downloaded by Remotion in the project", () => {
  const d = mkdtempSync(join(base, "ch-")); mkdirSync(join(d, "node_modules", ".remotion"), { recursive: true });
  assert.equal(findChromium(d)!.where, "downloaded by Remotion in this project");
  const f = join(d, "chrome"); writeFileSync(f, ""); process.env.CHROME_PATH = f;
  try { assert.equal(findChromium(d)!.where, "environment variable"); } finally { delete process.env.CHROME_PATH; }
});
test("licenses: the notice says Remotion is not MIT (3 people, Company License), works in pt and en and the acceptance is recorded by version", () => {
  for (const l of ["pt", "en"] as const) { const t = noticeText(l); assert.match(t, /Remotion/); assert.match(t, /MIT/); assert.match(t, /3/); assert.match(t, /Company License/); assert.match(t, /remotion\.pro\/license/); assert.match(t, /Apache-2\.0/); }
  assert.ok(NOTICE.pt !== NOTICE.en);
  process.env.PRAEKO_STUDIO_CONFIG = join(mkdtempSync(join(base, "ac-")), "cfg");
  assert.equal(readAcceptance(), null);
  writeAcceptance(new Date("2026-11-07T12:00:00Z"));
  assert.equal(readAcceptance()!.acceptedAt, "2026-11-07T12:00:00.000Z");
  const before = console.log; let out = ""; console.log = (m: string) => { out += m + "\n"; };
  try { licensesCommand(["--lang", "en"]); } finally { console.log = before; }
  assert.match(out, /NOT MIT/); assert.match(out, /already recorded/);
  delete process.env.PRAEKO_STUDIO_CONFIG;
});
test("the notice and the license notes are in the README, in LICENSES.md and in the publishable packages (identical copies)", () => {
  const lic = read(join(STUDIO, "LICENSES.md"));
  for (const re of [/Remotion/, /NOT MIT|not MIT/i, /Company License/, /CC-BY-NC/, /Apache-2\.0/, /remotion\.pro\/license/]) assert.match(lic, re);
  for (const p of ["cli", "core", "kit"]) { assert.equal(read(join(STUDIO, "packages", p, "LICENSES.md")), lic, p); assert.equal(read(join(STUDIO, "packages", p, "LICENSE")), read(join(STUDIO, "LICENSE")), p); }
  assert.match(read(join(STUDIO, "LICENSE")), /^MIT License\n\nCopyright \(c\) 2026 Marcone Santos/);
  assert.match(read(join(PACKAGE, "README.md")), /Remotion/);
});
test("docs: lists the topics and prints one; an unknown topic fails; --version and help have no Portuguese commands", () => {
  const l = cli(["docs"]).stdout;
  for (const t of ["episode-yaml", "long-yaml", "voice", "publish", "hyperframes", "licenses"]) assert.match(l, new RegExp(t));
  assert.match(cli(["docs", "episode-yaml"]).stdout, /episode\.yaml/);
  assert.match(cli(["docs", "licenses"]).stdout, /Praeko Studio licenses/);
  assert.notEqual(cli(["docs", "nothing"]).status, 0);
  assert.notEqual(cli(["docs", "episodio-yaml"]).status, 0, "the old topic name is gone");
  assert.match(cli(["--version"]).stdout.trim(), /^\d+\.\d+\.\d+$/);
  const help = cli(["--help"]).stdout;
  assert.doesNotMatch(help, /bardo/i);
  const pkg = JSON.parse(read(join(PACKAGE, "package.json")));
  assert.deepEqual(Object.keys(pkg.bin), ["praeko-studio"]); assert.equal(pkg.name, "@praeko/studio"); assert.notEqual(pkg.private, true); assert.equal(pkg.version, "0.2.0");
});
test("publication audit: nothing of the owner (name, brand, voice ids, paths, game) in the packages that go public", () => {
  // the patterns are built in parts so this file does not accuse itself in the publication scan
  const j = (...p: string[]) => new RegExp(p.join(""), "i");
  const FORBIDDEN: [RegExp, string][] = [[j("marc", "one"), "owner's name"], [j("dev\\.", "ocioso"), "owner's project"], [j("guil", "da"), "owner's game"], [/\/Users\//, "absolute path"], [j("\\bbar", "do\\b"), "old name"]];
  const dirty: string[] = [];
  // migrate/ is the only place that still knows the old Portuguese names (and it mentions the old tool name in a marker pattern)
  const scan = (dir: string): void => { for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist"].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) { scan(p); continue; }
    if (/\.(png|wav|mp3|mp4)$/.test(e.name) || /LICENSES?\.md$/.test(e.name) || /(^|\/)test\//.test(relative(STUDIO, p))) continue;
    const t = read(p); for (const [re, name] of FORBIDDEN) if (re.test(t)) dirty.push(`${name}: ${relative(STUDIO, p)}`);
  } };
  for (const d of ["packages/cli/src", "packages/cli/bin", "packages/cli/docs", "packages/cli/templates", "packages/voice/src", "packages/publish/src", "packages/review/src", "packages/hyperframes/src", "packages/core/src", "packages/kit/src", "skill"]) if (existsSync(join(STUDIO, d))) scan(join(STUDIO, d));
  assert.deepEqual(dirty, []);
  for (const old of ["legado", "referencias", "exemplos", "config"]) assert.ok(!existsSync(join(STUDIO, old)), `${old}/ does not go to publication`);
});

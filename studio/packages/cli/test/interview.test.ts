// Brand interview: answer parsing, hex validation, brief/playbook, the interactive flow (fake stdin), --yes unchanged, ../brand tokens and `brief` keeping manual edits.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { brief, init } from "../src/commands.ts";
import { initialBrand } from "../src/templates.ts";
import { applyBrand, hasBrief, interview, lineAsk, normalizeHex, parseAnswers, readBriefAnswers, readBrandTokens, renderBrief, renderPlaybook } from "../src/interview.ts";
import type { Ask } from "../src/interview.ts";
import { BODY } from "../src/skill-texts.ts";
import { help } from "../src/help.ts";

const BIN = fileURLToPath(new URL("../bin/praeko-studio.ts", import.meta.url));
const base = mkdtempSync(join(tmpdir(), "studio-interview-"));
const ENV = { ...process.env, HOME: base, PRAEKO_NO_KEYCHAIN: "1", PRAEKO_STUDIO_CONFIG: join(base, "cfg"), PRAEKO_SECRETS: join(base, "s.json") } as NodeJS.ProcessEnv;
delete ENV.PRAEKO_LANG;
const studio = (args: string[], cwd = base) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", env: ENV });
/** Scripted answers by a piece of the question; anything not listed gets Enter (the default). Records what was asked. */
const scripted = (answers: Record<string, string>): { ask: Ask; asked: string[] } => {
  const asked: string[] = [];
  const ask: Ask = async (q, def) => { asked.push(q); for (const [k, v] of Object.entries(answers)) if (q.includes(k)) return v || (def ?? ""); return def ?? ""; };
  return { ask, asked };
};
const quiet = { say: () => {} };
const silently = async <T>(f: () => Promise<T>): Promise<T> => { const log = console.log; console.log = () => {}; try { return await f(); } finally { console.log = log; } };
const tree = (dir: string, root = dir): Record<string, string> => { const o: Record<string, string> = {}; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) Object.assign(o, tree(p, root)); else o[relative(root, p)] = String(statSync(p).size) + ":" + (/\.(png|wav)$/.test(e.name) ? "" : readFileSync(p, "utf8")); } return o; };

test("normalizeHex accepts #rgb, #rrggbb and without #, and rejects the rest", () => {
  assert.equal(normalizeHex("#F4B942"), "#f4b942"); assert.equal(normalizeHex("f4b942"), "#f4b942"); assert.equal(normalizeHex("#abc"), "#aabbcc"); assert.equal(normalizeHex(" #0e0c14 "), "#0e0c14");
  for (const bad of ["", "red", "#12", "#12345", "#gggggg", "#1234567", undefined]) assert.equal(normalizeHex(bad as string), null, String(bad));
});
test("parseAnswers reads the flags, normalizes, pairs notes with references and rejects bad values", () => {
  const a = parseAnswers(["--name", "My Chan", "--handle", "mychan", "--lang", "pt", "--agent", "claude, codex", "--about", "devs", "--accent", "ABC", "--background", "#101010", "--font", "'Inter'",
    "--reference", "https://x.test/v", "--reference-note", "fast cuts", "--reference", "the old show", "--voice-alias", "main", "--voice-provider", "elevenlabs"]);
  assert.deepEqual(a, { name: "My Chan", handle: "@mychan", lang: "pt", agents: ["claude", "codex"], about: "devs", accent: "#aabbcc", background: "#101010", font: "Inter",
    references: [{ ref: "https://x.test/v", note: "fast cuts" }, { ref: "the old show", note: "" }], voiceAlias: "main", voiceProvider: "elevenlabs" });
  assert.deepEqual(parseAnswers(["x", "--yes"]), {});
  assert.equal(parseAnswers(["--agent", "all"]).agents, "all");
  assert.throws(() => parseAnswers(["--accent", "blue"]), /not a hex color/);
  assert.throws(() => parseAnswers(["--lang", "es"]), /use pt or en/);
  assert.throws(() => parseAnswers(["--agent", "nope"]), /--agent nope/);
  assert.throws(() => parseAnswers(["--voice-provider", "x"]), /--voice-provider/);
  assert.throws(() => parseAnswers(["--reference", "1", "--reference", "2", "--reference", "3", "--reference", "4"]), /at most 3/);
  assert.throws(() => parseAnswers(["--reference-note", "orphan"]), /without a matching/);
});
test("brief.md has readable sections and the answers; playbook only infers from what was written", () => {
  const ans = { name: "Chan", handle: "@chan", lang: "en" as const, about: "Dev tools in 60 seconds", audience: "junior devs", tone: "direct and curious", references: [{ ref: "https://x.test/v", note: "the opening" }] };
  const b = renderBrief(ans);
  for (const s of ["# Brief: Chan", "## What it is about", "Dev tools in 60 seconds", "## Audience", "junior devs", "## Tone of voice", "direct and curious", "1. https://x.test/v", "What I liked: the opening", "Accent color: (not answered yet)"]) assert.ok(b.includes(s), s);
  const p = renderPlaybook(ans);
  assert.match(p, /Fast pace/); assert.match(p, /Open with a question/); assert.match(p, /inferred from your tone of voice: "direct and curious"/);
  assert.match(p, /Open with the strongest claim/, "'direct' also reads as a bold opening");
  assert.match(p, /## Captions\nTODO: the agent completes this after analyzing the references/);
  assert.match(p, /- https:\/\/x\.test\/v\n {2}- What the person liked: the opening\n {2}- TODO: the agent completes this after analyzing the references/);
  // nothing written => only TODOs, no invented analysis
  const empty = renderPlaybook({ name: "Z", lang: "en" });
  assert.ok(!/inferred/.test(empty)); assert.ok((empty.match(/TODO: the agent completes this/g) || []).length >= 5);
  assert.match(renderPlaybook({ ...ans, lang: "pt" }), /TODO: o agente completa depois de analisar as referências/);
  assert.match(renderBrief({ ...ans, lang: "pt" }), /## Sobre o que é/);
  assert.deepEqual(readBriefAnswers(join(base, "nope")), null);
});
test("brief.md round-trips its answers (even with '--' and quotes) through the hidden comment", () => {
  const d = mkdtempSync(join(base, "rt-")), ans = { name: "A", lang: "en" as const, about: 'a --> "b" -- c', references: [{ ref: "--x--", note: "n" }] };
  writeFileSync(join(d, "brief.md"), renderBrief(ans));
  assert.ok(!/-->.*-->/s.test(readFileSync(join(d, "brief.md"), "utf8").split("praeko-brief:")[1]!.split("\n")[0]!.replace(/ -->$/, "")));
  assert.deepEqual(readBriefAnswers(d), { name: "A", lang: "en", about: 'a --> "b" -- c', references: [{ ref: "--x--", note: "n" }] });
});
test("applyBrand changes name, handle, colors and font and keeps the rest; same answers give the same text", () => {
  const text = initialBrand({ name: "N", handle: "@n" });
  assert.equal(applyBrand(text, { name: "N", handle: "@n" }), text, "no override = identical");
  const b = JSON.parse(applyBrand(text, { accent: "#112233", background: "#000000", font: "Inter" }));
  assert.equal(b.colors.accent, "#112233"); assert.equal(b.colors.background, "#000000"); assert.equal(b.colors.text, "#f3ece0");
  assert.match(b.fonts.title, /^'Inter', 'Arial Black'/);
  const again = JSON.parse(applyBrand(applyBrand(text, { font: "Inter" }), { font: "Lato" }, "Inter"));
  assert.match(again.fonts.title, /^'Lato', 'Arial Black'/); assert.ok(!again.fonts.title.includes("Inter"));
});
test("lineAsk reads lines from a stream: Enter takes the default, closed input takes the defaults", async () => {
  const input = new PassThrough(), output = new PassThrough(); const { ask, close } = lineAsk(input, output);
  input.write("hello\n\n"); const a = await ask("one", "d1"), b = await ask("two", "d2");
  input.end(); const c = await ask("three", "d3"), d = await ask("four");
  close();
  assert.deepEqual([a, b, c, d], ["hello", "d2", "d3", ""]);
  assert.match(String(output.read()), /one \[d1\]: /);
});
test("interview: fake stdin end to end; a question answered by flag is not asked again; invalid hex asks again", async () => {
  const input = new PassThrough(), { ask, close } = lineAsk(input, new PassThrough());
  // lang, handle (name comes by flag), agents, about, audience, tone, accent (bad, then good), background, font, ref1, note1, ref2 (end), voice alias, provider
  input.write(["pt", "", "claude,gemini", "canal de dev", "iniciantes", "direto e calmo", "azul", "#ABCDEF", "", "Inter", "https://x.test/1", "a abertura", "", "voz1", "voicestudio"].join("\n") + "\n");
  const msgs: string[] = [];
  const r = await interview(ask, { name: "Cana" }, { lang: "en", say: (s) => msgs.push(s), defaults: { name: "dir", lang: "en" }, agentsDefault: ["codex"] });
  close();
  assert.equal(r.name, "Cana"); assert.equal(r.lang, "pt"); assert.equal(r.handle, "@cana"); assert.deepEqual(r.agents, ["claude", "gemini"]);
  assert.equal(r.about, "canal de dev"); assert.equal(r.tone, "direto e calmo"); assert.equal(r.accent, "#abcdef"); assert.equal(r.background, undefined); assert.equal(r.font, "Inter");
  assert.deepEqual(r.references, [{ ref: "https://x.test/1", note: "a abertura" }]);
  assert.equal(r.voiceAlias, "voz1"); assert.equal(r.voiceProvider, "voicestudio");
  assert.ok(msgs.some((m) => /não é uma cor hex/.test(m)), "after choosing pt the prompts are in Portuguese");
  const s = scripted({}); await interview(s.ask, { name: "X", about: "a", accent: "#fff", references: [] }, { lang: "en", say: () => {}, defaults: {} });
  for (const skipped of ["Channel or brand name", "What is the channel about", "Accent color"]) assert.ok(!s.asked.some((q) => q.includes(skipped)), skipped);
  assert.ok(s.asked.some((q) => q.includes("Who is it for")));
});
test("init is interactive with a TTY (injected): writes brand.json, brief.md, playbook.md, agents and no questions for flags", async () => {
  const dir = join(base, "chan1"), s = scripted({ "Language": "en", "Channel or brand name": "Chan One", "AI agents": "claude", "about": "devs in a hurry", "Who is it for": "backend devs", "Tone": "direct, fast", "Accent": "#ff8800", "Background": "101820", "Font": "Inter", "Reference 1": "https://x.test/v", "What did you like": "no intro", "Voice name": "main", "Voice provider": "elevenlabs" });
  assert.equal(await silently(() => init([dir, "--no-install", "--handle", "@chanone"], { interactive: true, ask: s.ask, ...quiet })), 0);
  assert.ok(!s.asked.some((q) => q.startsWith("Handle")), "--handle was not asked");
  const b = JSON.parse(readFileSync(join(dir, "brand.json"), "utf8"));
  assert.equal(b.name, "Chan One"); assert.equal(b.handle, "@chanone"); assert.equal(b.colors.accent, "#ff8800"); assert.equal(b.colors.background, "#101820"); assert.match(b.fonts.title, /^'Inter'/);
  const brief = readFileSync(join(dir, "brief.md"), "utf8");
  assert.match(brief, /devs in a hurry/); assert.match(brief, /What I liked: no intro/); assert.match(brief, /Provider: elevenlabs/);
  assert.match(readFileSync(join(dir, "playbook.md"), "utf8"), /Fast pace/);
  assert.ok(existsSync(join(dir, "CLAUDE.md"))); assert.ok(!existsSync(join(dir, "AGENTS.md")), "only the chosen agent");
  assert.equal(readBriefAnswers(dir)!.voiceAlias, "main");
  assert.ok(!/sk_|key=|xi-api/i.test(brief));
});
test("init with everything skipped writes no brief (the agent runs the interview) and keeps the defaults", async () => {
  const dir = join(base, "chan2"), s = scripted({});
  await silently(() => init([dir, "--no-install"], { interactive: true, ask: s.ask, ...quiet }));
  assert.ok(!existsSync(join(dir, "brief.md"))); assert.ok(!existsSync(join(dir, "playbook.md")));
  assert.equal(readFileSync(join(dir, "brand.json"), "utf8"), initialBrand({ name: "chan2", handle: "@chan2" }));
});
test("--yes and no TTY: no questions and the files are exactly the old ones", async () => {
  const d1 = join(base, "yes1"), d2 = join(base, "yes2");
  const r = studio(["init", d1, "--name", "Channel X", "--handle", "@channelx", "--no-install", "--yes"]);
  assert.equal(r.status, 0, r.stderr); assert.ok(!/\?|\[/.test(r.stdout.split("project created")[0]!));
  assert.equal(studio(["init", d2, "--name", "Channel X", "--handle", "@channelx", "--no-install"]).status, 0, "no TTY in spawnSync");
  const t1 = tree(d1), t2 = tree(d2);
  assert.deepEqual(Object.keys(t1).sort(), Object.keys(t2).sort());
  for (const k of Object.keys(t1)) assert.equal(t1[k], t2[k], k);
  assert.ok(!existsSync(join(d1, "brief.md")) && !existsSync(join(d1, "playbook.md")));
  assert.equal(readFileSync(join(d1, "brand.json"), "utf8"), initialBrand({ name: "Channel X", handle: "@channelx" }));
  assert.equal(readFileSync(join(d1, "README.md"), "utf8"), "# Channel X\n\nPraeko Studio video project. First video: `npx praeko-studio new my-first` (or `praeko studio new my-first`). Check the environment with `praeko studio doctor`.\n");
  assert.deepEqual(readdirSync(d1).sort(), [".claude", ".gitignore", "AGENTS.md", "CLAUDE.md", "README.md", "brand.json", "episodes", "package.json", "public", "remotion.config.ts", "src", "tsconfig.json"]);
});
test("--yes with answer flags fills brand.json, brief.md and the playbook, with no questions", () => {
  const d = join(base, "flags");
  const r = studio(["init", d, "--yes", "--no-install", "--name", "Flags", "--about", "cats", "--audience", "everyone", "--tone", "calm", "--accent", "#00ff00", "--font", "Lato", "--reference", "https://x.test/c", "--reference-note", "the slow start", "--agent", "codex"]);
  assert.equal(r.status, 0, r.stderr);
  const b = JSON.parse(readFileSync(join(d, "brand.json"), "utf8")); assert.equal(b.colors.accent, "#00ff00"); assert.match(b.fonts.title, /^'Lato'/);
  assert.match(readFileSync(join(d, "brief.md"), "utf8"), /the slow start/); assert.match(readFileSync(join(d, "playbook.md"), "utf8"), /Calm pace/);
  assert.ok(existsSync(join(d, "AGENTS.md")) && !existsSync(join(d, "CLAUDE.md")));
  assert.notEqual(studio(["init", join(base, "badhex"), "--yes", "--accent", "blue"]).status, 0);
  assert.ok(!existsSync(join(base, "badhex")), "invalid flags fail before anything is written");
});
test("tokens of a brand/ folder next to the project are offered as defaults (read only)", async () => {
  const ws = mkdtempSync(join(base, "ws-")); mkdirSync(join(ws, "brand", "build"), { recursive: true });
  const tokens = JSON.stringify({ cor: { fundo: "#141414", acento: "#7ccf77" }, fonte: "Inter" });
  writeFileSync(join(ws, "brand", "build", "tokens.json"), tokens);
  assert.deepEqual(readBrandTokens(join(ws, "site")), { file: join(ws, "brand", "build", "tokens.json"), accent: "#7ccf77", background: "#141414", font: "Inter" });
  assert.equal(readBrandTokens(join(base, "no-brand-here", "x")), null);
  const dir = join(ws, "site"), s = scripted({ "Use them as defaults": "y" });
  await silently(() => init([dir, "--no-install"], { interactive: true, ask: s.ask, ...quiet }));
  const b = JSON.parse(readFileSync(join(dir, "brand.json"), "utf8"));
  assert.equal(b.colors.accent, "#7ccf77"); assert.equal(b.colors.background, "#141414"); assert.match(b.fonts.title, /^'Inter'/);
  assert.equal(readFileSync(join(ws, "brand", "build", "tokens.json"), "utf8"), tokens, "the brand folder is untouched");
  assert.deepEqual(readdirSync(join(ws, "brand")), ["build"]);
  const d2 = join(ws, "site2"); await silently(() => init([d2, "--no-install"], { interactive: true, ask: scripted({ "Use them as defaults": "n" }).ask, ...quiet }));
  assert.equal(JSON.parse(readFileSync(join(d2, "brand.json"), "utf8")).colors.accent, "#f4b942", "declined: the Studio defaults stay");
  writeFileSync(join(ws, "brand", "build", "tokens.json"), JSON.stringify({ cor: { acento: "red" }, colors: { background: "#222" } }));
  assert.equal(readBrandTokens(join(ws, "site"))!.accent, undefined, "an invalid hex is ignored"); assert.equal(readBrandTokens(join(ws, "site"))!.background, "#222222");
});
test("brief rewrites brief.md with a .bak and does not lose manual edits of playbook.md", async () => {
  const dir = join(base, "chan3");
  await silently(() => init([dir, "--no-install", "--yes", "--name", "Three", "--about", "first", "--tone", "calm"]));
  const cwd = process.cwd();
  try {
    process.chdir(dir);
    // playbook still the unedited draft: replaced (with a backup)
    await silently(() => brief(["--about", "second"], { interactive: false }));
    assert.match(readFileSync(join(dir, "brief.md"), "utf8"), /second/); assert.match(readFileSync(join(dir, "brief.md.bak"), "utf8"), /first/);
    assert.match(readFileSync(join(dir, "playbook.md"), "utf8"), /second/); assert.match(readFileSync(join(dir, "playbook.md.bak"), "utf8"), /first/);
    assert.equal(readBriefAnswers(dir)!.tone, "calm", "answers not chosen are kept");
    // the person edits the playbook: it survives
    const edited = readFileSync(join(dir, "playbook.md"), "utf8") + "\n## My rule\nNever say 'basically'.\n";
    writeFileSync(join(dir, "playbook.md"), edited);
    await silently(() => brief(["--audience", "seniors", "--accent", "#123456"], { interactive: false }));
    assert.equal(readFileSync(join(dir, "playbook.md"), "utf8"), edited, "edited playbook untouched");
    assert.match(readFileSync(join(dir, "playbook.md.new"), "utf8"), /seniors/);
    assert.match(readFileSync(join(dir, "brief.md"), "utf8"), /seniors/); assert.match(readFileSync(join(dir, "brief.md"), "utf8"), /second/);
    assert.equal(JSON.parse(readFileSync(join(dir, "brand.json"), "utf8")).colors.accent, "#123456");
    // interactive: redo only the chosen answers
    const s = scripted({ "Which answers": "tone", "Tone": "direct" });
    await silently(() => brief([], { interactive: true, ask: s.ask, ...quiet }));
    assert.equal(readBriefAnswers(dir)!.tone, "direct"); assert.equal(readBriefAnswers(dir)!.audience, "seniors");
    assert.ok(!s.asked.some((q) => q.includes("Who is it for")), "only the chosen answer was asked");
    await assert.rejects(() => brief([], { interactive: false }), /usage: praeko studio brief/);
    await assert.rejects(() => brief(["--only", "agents", "--about", "x"], { interactive: false }), /--only agents/);
  } finally { process.chdir(cwd); }
});
test("hasBrief, help and the skill texts mention the interview", () => {
  assert.equal(hasBrief({ name: "x", accent: "#fff" }), false); assert.equal(hasBrief({ tone: "t" }), true);
  assert.match(help("x"), /^  brief \[--only/m); assert.match(help("x"), /--reference <url\|text>/);
  for (const l of ["en", "pt"] as const) { const t = BODY[l]; for (const k of ["brief.md", "playbook.md", "praeko studio brief", "brand/build/tokens.json", "TODO"]) assert.ok(t.includes(k), `${l}: ${k}`); }
  assert.match(BODY.en, /one at a time/); assert.match(BODY.pt, /uma de cada vez/);
});
test("--yes imports colors and font from ../brand tokens, --brand points elsewhere, flags win, and it says what it imported", () => {
  const ws = mkdtempSync(join(base, "wsy-")); mkdirSync(join(ws, "brand", "build"), { recursive: true });
  writeFileSync(join(ws, "brand", "build", "tokens.json"), JSON.stringify({ cor: { fundo: "#141414", acento: "#7ccf77" }, fonte: "Inter" }));
  const d1 = join(ws, "site1"), r1 = studio(["init", d1, "--yes", "--no-install", "--name", "Site"]);
  assert.equal(r1.status, 0, r1.stderr); assert.match(r1.stdout, /imported from .*tokens\.json: accent #7ccf77, background #141414, font Inter/);
  const b1 = JSON.parse(readFileSync(join(d1, "brand.json"), "utf8")); assert.equal(b1.colors.accent, "#7ccf77"); assert.equal(b1.colors.background, "#141414"); assert.match(b1.fonts.title, /^'Inter'/);
  const d2 = join(ws, "site2"), r2 = studio(["init", d2, "--yes", "--no-install", "--accent", "#00ff00", "--font", "Lato"]);
  assert.equal(r2.status, 0, r2.stderr);
  const b2 = JSON.parse(readFileSync(join(d2, "brand.json"), "utf8")); assert.equal(b2.colors.accent, "#00ff00"); assert.equal(b2.colors.background, "#141414"); assert.match(b2.fonts.title, /^'Lato'/);
  assert.match(r2.stdout, /background #141414/); assert.doesNotMatch(r2.stdout, /accent #7ccf77/);
  // explicit --brand (folder with tokens.json), project far from any brand/ folder
  const other = mkdtempSync(join(base, "other-")); writeFileSync(join(other, "tokens.json"), JSON.stringify({ colors: { accent: "#123456" } }));
  const d3 = join(base, "far-site"), r3 = studio(["init", d3, "--yes", "--no-install", "--brand", other]);
  assert.equal(r3.status, 0, r3.stderr); assert.equal(JSON.parse(readFileSync(join(d3, "brand.json"), "utf8")).colors.accent, "#123456");
  // clear error and nothing written
  const d4 = join(base, "bad-brand"), r4 = studio(["init", d4, "--yes", "--no-install", "--brand", join(base, "nope")]);
  assert.notEqual(r4.status, 0); assert.match(r4.stderr, /--brand .*did not find/); assert.ok(!existsSync(d4));
  // without a brand folder and without --brand the output is the old one (see the snapshot test above)
  const d5 = join(base, "no-brand-again"), r5 = studio(["init", d5, "--yes", "--no-install", "--name", "Plain"]);
  assert.doesNotMatch(r5.stdout, /imported from/); assert.equal(readFileSync(join(d5, "brand.json"), "utf8"), initialBrand({ name: "Plain", handle: "@plain" }));
});

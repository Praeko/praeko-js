// The interview questions about source, formats, visual style and editing style; brief --only style; the style block of brand.json; .gitignore; doctor and check
// on projects with and without a style; `new --from-video` with a real ffmpeg video (the transcription is a fixture); render --seconds and transcribe --out.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeTranscript } from "@praeko/studio-voice";
import { brief, init, newEpisode, ownVideoFindings, secondsRange } from "../src/commands.ts";
import { compileEpisode } from "../src/compile.ts";
import { videoSourceItems } from "../src/doctor.ts";
import { cleanWords, transcriptWarnings } from "../src/from-video.ts";
import { help } from "../src/help.ts";
import { applyBrand, checkCombination, hasBrief, interview, mergeAnswers, parseAnswers, parseLiked, readBriefAnswers, renderBrief, renderPlaybook, styleWarning } from "../src/interview.ts";
import type { Ask } from "../src/interview.ts";
import { STYLES, STYLE_TOKENS, STUDIO_TOKENS, parseChoice, styleName } from "../src/styles.ts";
import { PROJECT_GITIGNORE, initialBrand } from "../src/templates.ts";
import { BODY } from "../src/skill-texts.ts";

const BIN = fileURLToPath(new URL("../bin/praeko-studio.ts", import.meta.url));
const base = mkdtempSync(join(tmpdir(), "studio-style-"));
const ENV = { ...process.env, HOME: base, PRAEKO_NO_KEYCHAIN: "1", PRAEKO_STUDIO_CONFIG: join(base, "cfg"), PRAEKO_SECRETS: join(base, "s.json"), PRAEKO_CONFIG_DIR: join(base, "praeko-cfg") } as NodeJS.ProcessEnv;
delete ENV.PRAEKO_LANG;
const studio = (args: string[], cwd = base) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", env: ENV });
const scripted = (answers: Record<string, string>): { ask: Ask; asked: string[] } => {
  const asked: string[] = [];
  const ask: Ask = async (q, def) => { asked.push(q); for (const [k, v] of Object.entries(answers)) if (q.includes(k)) return v || (def ?? ""); return def ?? ""; };
  return { ask, asked };
};
const silently = async <T>(f: () => Promise<T> | T): Promise<T> => { const log = console.log; console.log = () => {}; try { return await f(); } finally { console.log = log; } };
const inDir = async <T>(dir: string, f: () => Promise<T> | T): Promise<T> => { const cwd = process.cwd(); process.chdir(dir); try { return await f(); } finally { process.chdir(cwd); } };
const brandOf = (dir: string) => JSON.parse(readFileSync(join(dir, "brand.json"), "utf8"));
const ffmpegOk = spawnSync("ffmpeg", ["-version"]).status === 0;

// ---------- flags ----------
test("parseAnswers: every new flag, valid values, several values, and a clear error for anything outside the closed lists", () => {
  const a = parseAnswers(["--source", "script,video", "--format", "long,short", "--style", "clay-3d,flat,neon", "--style-other", "watercolor", "--pace", "fast", "--captions", "phrase", "--effects", "shake,zoom", "--sound", "sfx", "--face", "face"]);
  assert.deepEqual(a, { source: ["script", "video"], format: ["long", "short"], style: ["clay-3d", "flat", "neon"], styleOther: "watercolor", edit: { pace: "fast", captions: "phrase", effects: ["shake", "zoom"], sound: "sfx", face: "face" } });
  assert.deepEqual(parseAnswers(["--style", STYLES.join(",")]).style, [...STYLES], "no limit on the number of styles");
  assert.deepEqual(parseAnswers(["--format", "short,short,image"]).format, ["short", "image"], "duplicates dropped, order kept");
  assert.deepEqual(parseAnswers(["--effects", "none"]).edit, { effects: [] });
  assert.deepEqual(parseAnswers(["--source", "VIDEO"]).source, ["video"], "case does not matter");
  for (const [args, re] of [
    [["--source", "podcast"], /--source podcast: use script, video/], [["--format", "short,reel"], /--format short,reel: use short, long, carousel, image/],
    [["--style", "watercolor"], /--style watercolor: use flat, .*cinema-3d.*--style-other/], [["--pace", "slow"], /--pace slow: use calm or fast/],
    [["--captions", "karaoke"], /--captions karaoke: use word or phrase or none/], [["--effects", "shake,none"], /--effects shake,none: use shake, zoom, flash \(or none alone\)/],
    [["--effects", "blur"], /--effects blur/], [["--sound", "music"], /--sound music: use sfx or none/], [["--face", "avatar"], /--face avatar: use face or mascot or none/],
  ] as [string[], RegExp][]) assert.throws(() => parseAnswers(args), re, args.join(" "));
});
test("checkCombination: --face face needs the own-video source; styleWarning only above 2 styles; hasBrief counts the new answers", () => {
  assert.throws(() => checkCombination({ edit: { face: "face" } }), /--face face needs --source video/);
  assert.throws(() => checkCombination({ source: ["script"], edit: { face: "face" } }), /--face face/);
  assert.doesNotThrow(() => checkCombination({ source: ["script", "video"], edit: { face: "face" } }));
  assert.doesNotThrow(() => checkCombination({ edit: { face: "mascot" } }));
  assert.equal(styleWarning({ style: ["flat", "neon"] }), null);
  assert.match(styleWarning({ style: ["flat", "neon", "comic"] })!, /^3 visual styles: allowed, but 1 or 2/);
  assert.equal(hasBrief({ style: ["flat"] }), true); assert.equal(hasBrief({ edit: { pace: "calm" } }), true); assert.equal(hasBrief({ edit: {} }), false);
});
test("parseChoice and parseLiked: numbers or names; the guided answer about a reference, with free text still accepted", () => {
  assert.deepEqual(parseChoice("9, 1", STYLES), ["clay-3d", "flat"]);
  assert.deepEqual(parseChoice("8bit 7", STYLES), ["8bit"], "a slug made of digits and letters is a name; duplicates dropped");
  assert.deepEqual(parseChoice("13", STYLES, ["other"]), ["other"]);
  assert.equal(parseChoice("14", STYLES, ["other"]), null); assert.equal(parseChoice("watercolor", STYLES), null);
  assert.deepEqual(parseLiked("1,3"), { liked: ["pace", "look"], note: "" });
  assert.deepEqual(parseLiked("abertura, legenda"), { liked: ["opening", "captions"], note: "" });
  assert.deepEqual(parseLiked("the fast cuts"), { note: "the fast cuts" });
  assert.deepEqual(parseAnswers(["--reference", "x", "--reference-note", "pace,opening"]).references, [{ ref: "x", liked: ["pace", "opening"], note: "" }]);
});

// ---------- the interview ----------
test("interview: new order, numbered lists, 'other' asks for a description, more than 2 styles warns, an invalid option asks again", async () => {
  const msgs: string[] = [];
  const s = scripted({ "Source": "1", "Formats (": "2,1", "Visual styles": "9,1,3,other", "Describe the other style": "watercolor", "Pace": "x", "Captions": "1", "Effects": "4", "Sound": "1", "Who appears": "1" });
  // "Pace: x" is invalid three times (the scripted answer repeats), so pace stays unanswered
  const r = await interview(s.ask, { name: "C" }, { lang: "en", say: (m) => msgs.push(m), defaults: {}, agentsDefault: ["claude"] });
  assert.deepEqual(r.source, ["script"]); assert.deepEqual(r.format, ["long", "short"]); assert.deepEqual(r.style, ["clay-3d", "flat", "neon"]); assert.equal(r.styleOther, "watercolor");
  assert.deepEqual(r.edit, { captions: "word", effects: [], sound: "sfx", face: "mascot" }, "pace skipped after three invalid answers; without the own video, 1 = mascot");
  const order = ["Language", "Handle", "AI agents", "Source", "What is the channel about", "Who is it for", "Tone of voice", "Formats (", "Visual styles", "Describe the other style", "Pace", "Captions", "Effects", "Sound", "Who appears", "Accent color", "Background color", "Font", "Reference 1", "Voice name"];
  const idx = order.map((k) => s.asked.findIndex((q) => q.includes(k)));
  assert.ok(idx.every((x) => x >= 0), JSON.stringify(order.filter((_, i) => idx[i]! < 0)));
  assert.deepEqual([...idx].sort((x, y) => x - y), idx, "questions come in the new order");
  assert.equal(s.asked.filter((q) => q.startsWith("Pace")).length, 3);
  assert.ok(msgs.some((m) => /3 visual styles: allowed/.test(m)));
  assert.ok(msgs.some((m) => /the other style has no preset/.test(m)));
  assert.ok(msgs.some((m) => /2D: 1 Flat · 2 Minimal/.test(m)) && msgs.some((m) => /3D: 9 Clay 3D/.test(m)), "numbered lists with readable names");
  assert.ok(!s.asked.some((q) => /you, on camera/.test(q)), "face is not offered without the own video");
  assert.equal(r.accent, STYLE_TOKENS["clay-3d"].colors.accent, "Enter on the color takes the chosen style's suggestion");
});
test("interview: source video only skips the voice and offers 'you, on camera'; pt shows names and questions in Portuguese", async () => {
  const msgs: string[] = [];
  const s = scripted({ "Origem": "2", "Quem aparece": "1", "Estilos visuais": "argila,1" });
  const r = await interview(s.ask, { lang: "pt" }, { lang: "pt", say: (m) => msgs.push(m), defaults: {} });
  assert.deepEqual(r.source, ["video"]); assert.equal(r.edit?.face, "face");
  assert.ok(!s.asked.some((q) => /alias da voz|Provedor da voz/.test(q)), "no voice question for a video-only channel");
  assert.ok(s.asked.some((q) => /Tom de voz/.test(q)));
  assert.ok(s.asked.some((q) => /você, na câmera/.test(q)));
  assert.ok(msgs.some((m) => /3D: 9 Argila 3D/.test(m)));
  assert.equal(r.style, undefined, "'argila' is not a slug: asked three times, then skipped");
});
test("interview: flags answer ahead (no question), Enter keeps every default and stores nothing new", async () => {
  const s = scripted({});
  const r = await interview(s.ask, { source: ["video"], format: ["short"], style: ["neon"], edit: { pace: "calm", captions: "word", effects: ["zoom"], sound: "none", face: "none" } }, { lang: "en", say: () => {}, defaults: {} });
  for (const k of ["Source", "Formats (", "Visual styles", "Pace", "Captions", "Effects", "Sound", "Who appears", "Voice name"]) assert.ok(!s.asked.some((q) => q.includes(k)), k);
  assert.deepEqual(r.edit, { pace: "calm", captions: "word", effects: ["zoom"], sound: "none", face: "none" });
  const e = scripted({});
  const r2 = await interview(e.ask, {}, { lang: "en", say: () => {}, defaults: {} });
  for (const k of ["source", "format", "style", "styleOther", "edit"] as const) assert.equal(r2[k], undefined, k);
});

// ---------- brief.md, playbook.md, brand.json ----------
test("brief.md and playbook.md with the style sections, in en and pt; each edit option says who applies it", () => {
  const ans = { name: "C", lang: "en" as const, source: ["script" as const], format: ["short" as const, "long" as const], style: ["clay-3d" as const, "flat" as const], styleOther: "watercolor", edit: { pace: "fast" as const, captions: "phrase" as const, effects: ["shake" as const], sound: "sfx" as const, face: "mascot" as const }, tone: "calm and slow" };
  const b = renderBrief(ans);
  for (const x of ["## Format", "- Source: script: Studio makes the voice from a script", "- Main format: short (9:16)", "- Also: long (16:9)", "## Visual style", "- Channel style: Clay 3D (`clay-3d`): applied by Studio", "- Also used: Flat (`flat`)", "- Other (described): watercolor (no preset: instruction for the agent)", "## Editing style", "- Pace: fast, short cuts (instruction for the agent)", "- Captions: by phrase (instruction for the agent)", "- Effects: shake (applied by Studio)", "- Sound: sound effects (applied by Studio)", "- Who appears: a mascot (instruction for the agent)"]) assert.ok(b.includes(x), x);
  const json = JSON.parse(/praeko-brief:(.*) -->/.exec(b)![1]!);
  assert.deepEqual([json.source, json.format, json.style, json.edit], [ans.source, ans.format, ans.style, ans.edit]);
  const p = renderPlaybook(ans);
  assert.match(p, /## Pace\n- Fast pace: short sentences.*\(from your editing style\)/, "the editing style wins over the tone of voice (calm)");
  assert.doesNotMatch(p, /Calm pace/);
  assert.match(p, /## Opening\n- Open with the strongest point in the first second/);
  assert.match(p, /## Captions\nCaptions by phrase: the engine does not do this yet/);
  assert.match(p, /## Visual\n- Channel style: Clay 3D \(`clay-3d`\)\. Soft clay-like 3D shapes.*\n- Never use hard shadows or thin outlines/);
  assert.match(p, /Style described by the person \(no preset: follow it as an instruction\): watercolor/);
  const bp = renderBrief({ ...ans, lang: "pt" }), pp = renderPlaybook({ ...ans, lang: "pt" });
  for (const x of ["## Formato", "## Estilo visual", "- Estilo do canal: Argila 3D (`clay-3d`): aplicado pelo Studio", "## Estilo de edição", "- Ritmo: rápido, cortes curtos (instrução para o agente)", "- Efeitos: tremor (aplicado pelo Studio)"]) assert.ok(bp.includes(x), x);
  for (const x of ["## Ritmo\n- Ritmo rápido", "## Abertura\n- Abrir com o ponto mais forte", "## Visual\n- Estilo do canal: Argila 3D", "Nunca use sombra dura nem contorno fino"]) assert.ok(pp.includes(x), x);
  assert.match(renderBrief({ name: "V", source: ["video"] }), /## Voice\n\(Video only: the sound comes from your own video/);
});
test("an old answer set without style renders the same playbook as before (no Visual section) and the brief says 'not answered'", () => {
  const p = renderPlaybook({ name: "Z", lang: "en", tone: "direct" });
  assert.doesNotMatch(p, /## Visual/); assert.match(p, /## Captions\nTODO/); assert.match(p, /Fast pace.*inferred from your tone of voice/);
  assert.match(renderBrief({ name: "Z" }), /## Visual style\n- Channel style: \(not answered yet\)\n\n## Editing style\n- Pace: \(not answered yet\)/);
});
test("applyBrand writes the style block; changing the style moves only the colors still at the old style's value; no style = brand.json untouched", () => {
  const text = initialBrand({ name: "N", handle: "@n" });
  assert.equal(applyBrand(text, { name: "N" }), text);
  const b1 = JSON.parse(applyBrand(text, { style: ["flat"], format: ["short", "long"], edit: { pace: "calm" }, source: ["video"] }));
  assert.deepEqual(b1.style, { visual: ["flat"], format: ["short", "long"], edit: { pace: "calm" }, source: ["video"] });
  assert.equal(b1.colors.accent, STYLE_TOKENS.flat.colors.accent); assert.equal(b1.colors.background, STYLE_TOKENS.flat.colors.background); assert.equal(b1.colors.box, STYLE_TOKENS.flat.colors.box);
  assert.equal(b1.colors.ok, "#7ee787", "colors a style does not have stay");
  // the person changes the accent by hand, then switches to minimal: the accent stays, the rest moves
  b1.colors.accent = "#123456";
  const b2 = JSON.parse(applyBrand(JSON.stringify(b1), { style: ["minimal"], accent: "#123456" }));
  assert.equal(b2.colors.accent, "#123456"); assert.equal(b2.colors.background, STYLE_TOKENS.minimal.colors.background); assert.equal(b2.fonts.title, STYLE_TOKENS.minimal.title);
  assert.deepEqual(b2.style.format, ["short", "long"], "what was not answered stays"); assert.deepEqual(b2.style.visual, ["minimal"]);
  // a font the person chose stays when the style changes again
  const b3 = JSON.parse(applyBrand(applyBrand(JSON.stringify(b2), { font: "Inter" }), { style: ["neon"] }));
  assert.match(b3.fonts.title, /^'Inter', /); assert.equal(b3.colors.background, STYLE_TOKENS.neon.colors.background);
  // removing every style goes back to the Studio's own values (where untouched)
  const b4 = JSON.parse(applyBrand(JSON.stringify(b3), { style: [] }));
  assert.equal(b4.colors.background, STUDIO_TOKENS.colors.background); assert.equal(b4.colors.accent, "#123456"); assert.deepEqual(b4.style.visual, []);
  assert.equal(initialBrand({ name: "x", handle: "@x" }).includes(STUDIO_TOKENS.colors.accent), true);
  assert.deepEqual(mergeAnswers({ edit: { pace: "calm" }, tone: "a" }, { edit: { sound: "sfx" } }), { edit: { pace: "calm", sound: "sfx" }, tone: "a" });
});

// ---------- init and brief (files) ----------
test("init --yes with the style flags: no questions, brand.json style block, brief, playbook and .gitignore with public/video/", () => {
  const d = join(base, "styled");
  const r = studio(["init", d, "--yes", "--no-install", "--name", "Styled", "--source", "script", "--format", "long,short", "--style", "pixel,8bit,retro-crt", "--pace", "fast", "--effects", "zoom", "--captions", "word"]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!/\?|\[/.test(r.stdout.split("project created")[0]!), "no prompt");
  assert.match(r.stdout, /⚠ 3 visual styles: allowed, but 1 or 2 give the channel an identity/);
  assert.match(r.stdout, /next step: cd .* new my-first --title "My first video" --long/, "the main format decides the first episode");
  const b = brandOf(d);
  assert.deepEqual(b.style, { visual: ["pixel", "8bit", "retro-crt"], format: ["long", "short"], edit: { pace: "fast", effects: ["zoom"], captions: "word" }, source: ["script"] });
  assert.equal(b.colors.background, STYLE_TOKENS.pixel.colors.background);
  assert.match(readFileSync(join(d, "brief.md"), "utf8"), /Channel style: Pixel art/);
  assert.match(readFileSync(join(d, "playbook.md"), "utf8"), /## Visual\n- Channel style: Pixel art/);
  assert.match(readFileSync(join(d, ".gitignore"), "utf8"), /^public\/video\/$/m);
  assert.equal(PROJECT_GITIGNORE.includes("public/video/"), true);
  const bad = studio(["init", join(base, "bad-face"), "--yes", "--no-install", "--face", "face"]);
  assert.notEqual(bad.status, 0); assert.match(bad.stderr, /--face face needs --source video/); assert.ok(!existsSync(join(base, "bad-face")));
  assert.notEqual(studio(["init", join(base, "bad-style"), "--yes", "--no-install", "--style", "vaporwave"]).status, 0);
});
test("init --lang pt suggests the first episode in Portuguese; source video suggests --from-video and reports the local Whisper (never downloads it)", async () => {
  const pt = studio(["init", join(base, "pt-proj"), "--yes", "--no-install", "--lang", "pt"]);
  assert.equal(pt.status, 0, pt.stderr);
  assert.match(pt.stdout, /próximo passo: cd .* new meu-primeiro --title "Meu primeiro vídeo"/);
  const lines: string[] = [], log = console.log; console.log = (m: string) => lines.push(String(m));
  try { assert.equal(await init([join(base, "own-video"), "--yes", "--no-install", "--source", "video", "--face", "face"], { whisper: { available: async () => "whisper-cli found but model ggml-large-v3-turbo-q5_0.bin is missing" } }), 0); }
  finally { console.log = log; }
  const out = lines.join("\n");
  assert.match(out, /⚠ local Whisper \(to transcribe your own videos\) is not ready: whisper-cli found but model/);
  assert.match(out, /→ npx @praeko\/studio@[\d.]+ transcribe --download-model downloads the model \(about 547 MB\) only after your yes/);
  assert.match(out, /next step: cd .* new my-first --from-video <your-video\.mp4>/);
  assert.ok(!existsSync(join(base, "praeko-cfg", "models")), "nothing downloaded");
  assert.doesNotMatch(readFileSync(join(base, "own-video", "brief.md"), "utf8"), /Name or alias/, "no voice for a video-only channel");
});
test("brief --only style reopens only format, style and edit, keeps the rest, and keeps the colors the person changed", async () => {
  const dir = join(base, "restyle");
  await silently(() => init([dir, "--no-install", "--yes", "--name", "Re", "--about", "cats", "--tone", "calm", "--style", "flat", "--accent", "#abcdef"]));
  const b0 = brandOf(dir);
  assert.equal(b0.colors.accent, "#abcdef", "the accent flag wins over the style"); assert.equal(b0.colors.background, STYLE_TOKENS.flat.colors.background);
  const s = scripted({ "Formats (": "short", "Visual styles": "neon", "Pace": "2" });
  await inDir(dir, () => silently(() => brief(["--only", "style"], { interactive: true, ask: s.ask, say: () => {} })));
  const asked = s.asked.map((q) => q.split(/[:(]/)[0]!.trim());
  assert.deepEqual([...new Set(asked)], ["Formats", "Visual styles", "Pace", "Captions", "Effects", "Sound", "Who appears"], "only the style questions");
  const b1 = brandOf(dir), ans = readBriefAnswers(dir)!;
  assert.deepEqual(b1.style.visual, ["neon"]); assert.equal(b1.colors.accent, "#abcdef", "changed by hand: kept"); assert.equal(b1.colors.background, STYLE_TOKENS.neon.colors.background, "still the old style's: moved");
  assert.equal(ans.about, "cats"); assert.equal(ans.tone, "calm"); assert.deepEqual(ans.style, ["neon"]); assert.equal(ans.edit?.pace, "fast"); assert.equal(ans.background, STYLE_TOKENS.neon.colors.background, "brief.md shows the colors brand.json ended with");
  assert.match(readFileSync(join(dir, "brief.md.bak"), "utf8"), /Flat/);
  // the person edits playbook.md: a new style goes to playbook.md.new
  writeFileSync(join(dir, "playbook.md"), readFileSync(join(dir, "playbook.md"), "utf8") + "\nmy rule\n");
  await inDir(dir, () => silently(() => brief(["--style", "comic", "--style-other", "watercolor"], { interactive: false })));
  assert.match(readFileSync(join(dir, "playbook.md"), "utf8"), /my rule/); assert.match(readFileSync(join(dir, "playbook.md.new"), "utf8"), /Comic book/);
  await assert.rejects(() => inDir(dir, () => brief(["--only", "looks", "--about", "x"], { interactive: false })), /--only looks: use .*style = format, style and edit/);
  await assert.rejects(() => inDir(dir, () => brief(["--face", "face"], { interactive: false })), /--face face needs --source video/);
});
test("a project made before the style questions: brief, doctor and check keep working and nothing about style is added unasked", async () => {
  const dir = join(base, "old-proj");
  assert.equal(studio(["init", dir, "--yes", "--no-install", "--name", "Old"]).status, 0);
  const old = readFileSync(join(dir, "brand.json"), "utf8");
  assert.equal(brandOf(dir).style, undefined);
  assert.equal(studio(["brief", "--yes", "--about", "dogs"], dir).status, 0);
  assert.equal(readFileSync(join(dir, "brand.json"), "utf8"), old, "no style block unless a style question was answered");
  assert.deepEqual(await videoSourceItems({ brand: brandOf(dir) }), [], "doctor: no Whisper line without the own-video source");
  const doc = studio(["doctor", "--json", "--offline"], dir);
  assert.ok(!JSON.parse(doc.stdout.slice(doc.stdout.indexOf("{"))).items.some((i: any) => i.id === "whisper-local"));
  assert.equal(studio(["new", "ep1"], dir).status, 0);
  const c = studio(["check", "ep1"], dir);
  assert.equal(c.status, 0, c.stdout + c.stderr); assert.match(c.stdout, /\d+ words, ~\d+ s of speech/);
});
test("doctor (videoSourceItems): with the own-video source it reports the local Whisper, ok or with the command that gets it", async () => {
  const brand = { style: { source: ["script", "video"] } };
  const [miss] = await videoSourceItems({ brand, engine: { available: async () => "no whisper-cli or faster-whisper on PATH" } });
  assert.equal(miss!.level, "warning"); assert.match(miss!.fix!, /transcribe --download-model .*only after your yes/);
  const [ok] = await videoSourceItems({ brand, engine: { available: async () => null } });
  assert.equal(ok!.level, "ok");
  assert.deepEqual(await videoSourceItems({ brand: { style: { source: ["script"] } } }), []);
});

// ---------- new episodes ----------
test("new in a pt project writes the outro in Portuguese (no FOLLOW FOR MORE)", () => {
  const dir = join(base, "pt-new");
  assert.equal(studio(["init", dir, "--yes", "--no-install", "--lang", "pt", "--about", "x"]).status, 0);
  assert.equal(studio(["new", "um"], dir).status, 0);
  assert.match(readFileSync(join(dir, "episodes", "um", "episode.yaml"), "utf8"), /cta: SIGA PARA MAIS/);
  assert.equal(studio(["new", "two", "--lang", "en"], dir).status, 0);
  assert.match(readFileSync(join(dir, "episodes", "two", "episode.yaml"), "utf8"), /cta: FOLLOW FOR MORE/);
});

/** Whether the engine of this checkout knows the `base` video layer (the motor agent adds it): then `new --from-video` compiles and registers. */
function engineHasBase(): boolean {
  const d = mkdtempSync(join(base, "probe-"));
  writeFileSync(join(d, "episode.yaml"), "id: P\nduration: 3\ncaption: 80\nbase: { src: video/p.mp4, volume: 1, fit: cover }\nscenes:\n  - start: 0\n    items:\n      - { type: text, at: 0.3, text: hi }\n");
  return !compileEpisode(d, { write: false }).errors.some((e) => /missing "(voice|outro)"|base/.test(e));
}
const WORDS = [{ t: "Hello", a: 0.1, b: 0.5 }, { t: "world", a: 0.5, b: 0.5 }, { t: "42", a: 0.6, b: 1.0 }, { t: "times", a: 1.05, b: 1.6 }];
const makeVideo = (file: string, seconds = 2, size = "216x384"): void => {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `testsrc=size=${size}:rate=30`, "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", String(seconds), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", file]);
  assert.equal(r.status, 0, String(r.stderr));
};
const sha = (f: string): string => createHash("sha256").update(readFileSync(f)).digest("hex");

test("new --from-video (real ffmpeg, transcript fixture): copies the video, writes words, base episode without voice/outro, warns, never touches the original", { skip: !ffmpegOk && "ffmpeg not on PATH" }, async () => {
  const dir = join(base, "fv");
  assert.equal(studio(["init", dir, "--yes", "--no-install", "--name", "FV", "--source", "video"]).status, 0);
  const media = mkdtempSync(join(base, "media-")), video = join(media, "My Talk.mp4");
  makeVideo(video);
  const before = sha(video);
  const seen: any[] = [], lines: string[] = [];
  const run = () => inDir(dir, () => newEpisode(["my-talk", "--from-video", video, "--lang", "en", "--title", "My talk"], { log: (m) => lines.push(m), transcribeImpl: async (o) => { seen.push(o); assert.ok(existsSync(o.file) && o.file.endsWith(".wav")); return { words: WORDS, text: "Hello world 42 times", engine: "fixture", language: "en" }; } }));
  const ready = engineHasBase();
  if (ready) assert.equal(await run(), 0);
  else await assert.rejects(run, /did not compile: .*missing "voice".*does not know the `base` video layer yet/);
  assert.equal(seen.length, 1); assert.equal(seen[0].language, "en"); assert.equal(seen[0].allowCloud, undefined, "no cloud without --cloud");
  assert.equal(sha(video), before, "the original is never changed");
  assert.equal(sha(join(dir, "public", "video", "my-talk.mp4")), before, "copied as is");
  const ep = join(dir, "episodes", "my-talk");
  assert.deepEqual(JSON.parse(readFileSync(join(ep, "words.json"), "utf8")), WORDS);
  assert.match(readFileSync(join(ep, "words.ts"), "utf8"), /"Hello"/);
  assert.equal(readFileSync(join(ep, "script.txt"), "utf8"), "Hello world 42 times\n");
  assert.equal(JSON.parse(readFileSync(join(ep, "publication.json"), "utf8")).ai.synthetic, false);
  const y = readFileSync(join(ep, "episode.yaml"), "utf8");
  assert.match(y, /^base: \{ src: video\/my-talk\.mp4, volume: 1, fit: cover \}$/m); assert.doesNotMatch(y, /^voice:/m); assert.doesNotMatch(y, /^outro:/m);
  assert.match(y, /^duration: 2(\.\d+)?/m); assert.match(y, /label: MY TALK/);
  const root = readFileSync(join(dir, "src", "Root.tsx"), "utf8");
  if (ready) {
    assert.match(root, /<MyTalkComposition \/>/);
    assert.ok(lines.some((l) => /1 word\(s\) with zero duration.*"world" at 0\.50 s/.test(l)), lines.join("\n"));
    assert.ok(lines.some((l) => /number\(s\) written as digits in the captions: 42/.test(l)));
    assert.ok(lines.some((l) => /the original was not changed/.test(l)));
  } else assert.doesNotMatch(root, /MyTalkComposition/, "not registered until it compiles");
  // check counts the real speech (words.json), not the script
  const found = ownVideoFindings(ep, [{ level: "ok", msg: "4 words, ~1 s of speech (190 words/min)" }, { level: "warning", msg: "digits in the spoken text (spell numbers out): 42" }, { level: "ok", msg: "4 timed words" }]);
  assert.deepEqual(found.map((x) => x.msg), ["own video (base): 4 words spoken in 1.5 s (from words.json, not from script.txt)", "4 timed words", "the captions show digits as the transcription wrote them: 42 (spell them out with captionFixes in brand.json if you prefer)"]);
  // a second run with the same slug, or a video without audio, stops before writing anything
  await assert.rejects(() => inDir(dir, () => newEpisode(["my-talk", "--from-video", video, "--transcript", join(media, "x.json")])), /already exists/);
  const mute = join(media, "mute.mp4");
  assert.equal(spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=216x384:rate=30", "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", mute]).status, 0);
  await assert.rejects(() => inDir(dir, () => newEpisode(["mute", "--from-video", mute])), /no audio track/);
  assert.ok(!existsSync(join(dir, "episodes", "mute")) && !existsSync(join(dir, "public", "video", "mute.mp4")));
  await assert.rejects(() => inDir(dir, () => newEpisode(["x", "--from-video", join(media, "nope.mp4")])), /file not found/);
  await assert.rejects(() => inDir(dir, () => newEpisode(["y", "--from-video", video, "--long"])), /does not go with --long/);
  await assert.rejects(() => inDir(dir, () => newEpisode(["z", "--from-video", video, "--lang", "es"])), /--lang es: use pt, en or auto/);
});
test("new --from-video --transcript: uses an existing transcript.json (CLI, nothing transcribed), --cloud passes on", { skip: !ffmpegOk && "ffmpeg not on PATH" }, async () => {
  const dir = join(base, "fv2");
  assert.equal(studio(["init", dir, "--yes", "--no-install", "--name", "FV2"]).status, 0);
  const media = mkdtempSync(join(base, "media2-")), video = join(media, "clip.mov");
  makeVideo(video, 1, "1080x1920");
  writeFileSync(join(media, "t.json"), JSON.stringify({ language: "pt", text: "Olá mundo", words: [{ t: "Olá", a: 0.1, b: 0.4 }, { t: "mundo", a: 0.45, b: 0.9 }] }));
  const r = studio(["new", "clip", "--from-video", video, "--transcript", join(media, "t.json")], dir);
  assert.ok(existsSync(join(dir, "public", "video", "clip.mov")), r.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "episodes", "clip", "words.json"), "utf8")), [{ t: "Olá", a: 0.1, b: 0.4 }, { t: "mundo", a: 0.45, b: 0.9 }]);
  if (engineHasBase()) assert.equal(r.status, 0, r.stderr); else assert.match(r.stderr, /does not know the `base` video layer yet/);
  const seen: any[] = [];
  await inDir(dir, () => newEpisode(["clip2", "--from-video", video, "--cloud"], { log: () => {}, transcribeImpl: async (o) => { seen.push(o); return { words: [{ t: "a", a: 0, b: 0.3 }], text: "a", engine: "f", language: "auto" }; } })).catch(() => {});
  assert.equal(seen[0]?.allowCloud, true);
});
test("from-video helpers: cleanWords rounds and drops empty words; transcriptWarnings names zero-duration words and digits", () => {
  assert.deepEqual(cleanWords([{ t: " a ", a: 0.123, b: 0.456 }, { t: "", a: 1, b: 2 }, { t: "b", a: 2, b: 1 }]), [{ t: "a", a: 0.12, b: 0.46 }, { t: "b", a: 2, b: 2 }]);
  assert.throws(() => cleanWords({}), /no word list/);
  assert.deepEqual(transcriptWarnings([{ t: "ok", a: 0, b: 1 }]), []);
  assert.equal(transcriptWarnings([{ t: "x", a: 1, b: 1 }, { t: "2026", a: 1, b: 2 }]).length, 2);
});

// ---------- render --seconds, transcribe --out, help, skill ----------
test("render --seconds: the frame range of the first n seconds; bad values are refused", () => {
  assert.equal(secondsRange(undefined), null); assert.equal(secondsRange("10"), "0-299"); assert.equal(secondsRange("0.5"), "0-14");
  for (const v of ["0", "-1", "abc", ""]) assert.throws(() => secondsRange(v), /--seconds/);
});
test("transcribe --out <name>.json names the three files; help, docs topics and the skill describe the new questions", () => {
  const d = mkdtempSync(join(base, "tr-")), f = writeTranscript({ engine: "x", engineVersion: "x", language: "en", durationSec: 1, words: [{ t: "hi", a: 0, b: 0.5 }], text: "hi", attempts: [] }, d, "ep02");
  assert.deepEqual([f.json, f.srt, f.txt].map((x) => x.split(/[\\/]/).pop()), ["ep02.json", "ep02.srt", "ep02.txt"]);
  const h = help("x");
  for (const x of ["--source script,video", "--format short,long,carousel,image", "--style flat,minimal", "--pace calm|fast", "--captions word|phrase|none", "--effects shake,zoom,flash|none", "--sound sfx|none", "--face face|mascot|none", "--from-video <file.mp4>", "--seconds <n>", "--out <folder>|<name>.json", "from-video, transcription", "--only style reopens format"]) assert.ok(h.includes(x), x);
  const topics = studio(["docs"]).stdout;
  for (const t of ["from-video", "transcription"]) assert.match(topics, new RegExp(t));
  assert.match(studio(["docs", "transcription"]).stdout, /--download-model/);
  assert.match(studio(["docs", "from-video"]).stdout, /base: \{ src: video\/my-talk\.mp4/);
  for (const l of ["en", "pt"] as const) for (const k of ["--from-video", "--source", "--style", "--pace"]) assert.ok(BODY[l].includes(k), `${l}: ${k}`);
  assert.equal(styleName("clay-3d", "pt"), "Argila 3D"); assert.equal(styleName("clay-3d", "en"), "Clay 3D");
});

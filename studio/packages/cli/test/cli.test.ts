import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BIN = new URL("../bin/praeko-studio.ts", import.meta.url).pathname;
const env = { ...process.env, HOME: mkdtempSync(join(tmpdir(), "studio-home-")), PRAEKO_NO_KEYCHAIN: "1", PRAEKO_STUDIO_CONFIG: join(tmpdir(), "studio-cfg-" + process.pid) };
const studio = (args: string[], cwd: string) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", env });
const base = mkdtempSync(join(tmpdir(), "studio-cli-"));
const proj = join(base, "channel");

test("init creates the project (without installing) with brand, Root with markers, sfx and agent instructions", () => {
  const r = studio(["init", proj, "--name", "Channel X", "--handle", "@channelx", "--no-install"], base);
  assert.equal(r.status, 0, r.stderr);
  for (const f of ["package.json", "brand.json", "remotion.config.ts", "src/index.ts", "src/Root.tsx", "CLAUDE.md", "AGENTS.md", ".claude/skills/praeko-studio/SKILL.md", "public/sfx/pop.wav", "public/cover/avatar.png"]) assert.ok(existsSync(join(proj, f)), f);
  assert.equal(JSON.parse(readFileSync(join(proj, "brand.json"), "utf8")).handle, "@channelx");
  const pj = JSON.parse(readFileSync(join(proj, "package.json"), "utf8"));
  assert.match(pj.dependencies["@praeko/studio-core"], /^\^\d+\.\d+\.\d+$/, "published semver, not file:");
  assert.match(pj.devDependencies["@praeko/studio"], /^\^\d/);
});
test("init refuses a folder that already has files", () => {
  assert.notEqual(studio(["init", proj, "--no-install"], base).status, 0);
});
test("new creates the episode and registers it in Root; repeating fails", () => {
  const r = studio(["new", "my-video", "--title", "A test title"], proj);
  assert.equal(r.status, 0, r.stderr);
  for (const f of ["script.txt", "publication.json", "episode.json", "episode.yaml", "episode.spec.json", "scenes.tsx", "episode.tsx", "words.ts"]) assert.ok(existsSync(join(proj, "episodes/my-video", f)), f);
  const root = readFileSync(join(proj, "src/Root.tsx"), "utf8");
  assert.match(root, /import \{ MyVideoComposition \} from "\.\.\/episodes\/my-video\/episode";/);
  assert.match(root, /<MyVideoComposition \/>/);
  assert.equal(JSON.parse(readFileSync(join(proj, "episodes/my-video/episode.json"), "utf8")).id, "MyVideo");
  assert.notEqual(studio(["new", "my-video"], proj).status, 0);
  assert.notEqual(studio(["new", "Bad Slug"], proj).status, 0);
});
test("check runs on the new episode and warns about what is missing", () => {
  const r = studio(["check", "my-video"], proj);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /words\.json is empty or missing|no words\.json yet/);
  assert.match(r.stdout, /publication\.json still lacks/);
});
test("outside a project, the error is clear", () => {
  const r = studio(["check", "x"], base);
  assert.notEqual(r.status, 0); assert.match(r.stderr, /no Praeko Studio project found/);
});
test("help lists the commands", () => {
  assert.match(studio(["help"], base).stdout, /new <slug>/);
});

// ---- declarative episode (YAML) ----
import { mkdirSync, writeFileSync } from "node:fs";
import { compileEpisode } from "../src/compile.ts";
const PAL = ([["I", 1], ["checked", 1.4], ["here", 2], ["the", 2.4], ["millisecond", 2.6], ["ended", 6]] as [string, number][]).map(([t, a]) => ({ t, a, b: a + 0.3 }));
function ep(yaml: string, words = PAL) {
  const d = join(mkdtempSync(join(tmpdir(), "studio-yaml-")), "x");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "episode.yaml"), yaml);
  writeFileSync(join(d, "words.json"), JSON.stringify(words));
  writeFileSync(join(d, "episode.json"), JSON.stringify({ id: "X", cover: "CoverX" }));
  return d;
}
const HEAD = "duration: 12\nvoice: audio/x.mp3\noutro: { start: 9, cta: END }\n";
test("compile: a valid episode writes the spec and normalizes pos", () => {
  const d = ep(HEAD + `scenes:\n  - start: 0\n    title: T\n    items:\n      - { type: box, when: I checked, color: ok, text: hi, pos: { left: 10, top: 20, width: 300 } }\n`);
  const r = compileEpisode(d);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.spec.scenes[0].items[0].pos, { left: 10, top: 20, w: 300 });
  assert.equal(JSON.parse(readFileSync(join(d, "episode.spec.json"), "utf8")).id, "X");
  assert.equal(r.spec.outro.a, 9); assert.equal(r.spec.durS, 12);
});
test("compile: a phrase that is not in the voice is an error and the spec is not written", () => {
  const d = ep(HEAD + `scenes:\n  - start: 0\n    items:\n      - { type: box, when: missing phrase, text: hi }\n`);
  const r = compileEpisode(d);
  assert.match(r.errors.join("\n"), /missing phrase.*does not appear in the voice/);
  assert.equal(existsSync(join(d, "episode.spec.json")), false);
});
test("compile: a comma without quotes inside { } becomes an explained error", () => {
  const d = ep(HEAD + `scenes:\n  - start: 0\n    items:\n      - { type: text, text: counts in hits, not in power }\n`);
  assert.match(compileEpisode(d).errors.join("\n"), /comma in the text separates fields/);
});
test("compile: Portuguese keys are NOT accepted (unknown key / missing field errors)", () => {
  const d = ep("duracao: 12\nvoz: audio/x.mp3\nfechamento: { inicio: 9, cta: FIM }\ncenas:\n  - inicio: 0\n    itens:\n      - { tipo: caixa, texto: oi }\n");
  const r = compileEpisode(d, { write: false });
  assert.match(r.errors.join("\n"), /missing "duration"/);
  const d2 = ep(HEAD + `scenes:\n  - start: 0\n    items:\n      - { type: box, texto: hi, cor: ok }\n`);
  assert.match(compileEpisode(d2, { write: false }).errors.join("\n"), /unknown key "texto"/);
});
test("compile: unknown type and color, scenes out of order and an anchor outside the scene", () => {
  const d = ep(HEAD + `scenes:\n  - start: 0\n    end: 1.5\n    items:\n      - { type: rocket, text: a }\n      - { type: box, color: pink, text: b }\n      - { type: box, when: ended, text: c }\n  - start: 0\n    items:\n      - { type: box, text: d }\n`);
  const r = compileEpisode(d, { write: false }), t = r.errors.join("\n") + r.warnings.join("\n");
  assert.match(t, /unknown type "rocket"/);
  assert.match(t, /color "pink" does not exist/);
  assert.match(t, /does not come after the previous scene/);
  assert.match(t, /"ended" is spoken at 6\.00 s, outside the scene/);
});
test("compile: warns about items that overflow the panel and absolute positions that overlap", () => {
  const many = Array.from({ length: 9 }, (_, i) => `      - { type: box, text: item ${i}, size: 50 }`).join("\n");
  const d = ep(HEAD + `scenes:\n  - start: 0\n    items:\n${many}\n  - start: 5\n    layout: free\n    items:\n      - { type: box, text: a, pos: { left: 0, top: 0, width: 300, height: 200 } }\n      - { type: box, text: b, pos: { left: 100, top: 100, width: 300, height: 200 } }\n`);
  const r = compileEpisode(d, { write: false });
  assert.deepEqual(r.errors, []);
  assert.match(r.warnings.join("\n"), /will overflow or overlap/);
  assert.match(r.warnings.join("\n"), /overlap on screen/);
});
test("compile: warns when the duration cuts the voice", () => {
  const d = ep(HEAD.replace("duration: 12", "duration: 6.8").replace("start: 9", "start: 5") + `scenes:\n  - start: 0\n    items:\n      - { type: box, text: a }\n`);
  const r = compileEpisode(d, { write: false });
  assert.deepEqual(r.errors, []);
  assert.match(r.warnings.join("\n"), /less than 1 s after the end of the voice \(6\.30 s\)/);
});

// ---- long video (YAML + voice blocks) ----
test("new --long creates the long yaml, the episode and the compiled spec", () => {
  assert.equal(studio(["new", "my-long", "--title", "My long", "--long"], proj).status, 0);
  const folder = join(proj, "episodes/my-long");
  assert.match(readFileSync(join(folder, "episode.yaml"), "utf8"), /format: long/);
  assert.match(readFileSync(join(folder, "episode.tsx"), "utf8"), /LongDecl/);
  assert.ok(existsSync(join(folder, "episode.spec.json")));
});
test("compile long: missing block, phrase outside the voice, unknown key and overlap", () => {
  const d = ep(`format: long\nduration: 20\nvoice: audio/x.mp3\nscenes:\n  - title: A\n    start: { block: 3 }\n    items:\n      - { type: chip, when: I checked, pos: { left: 0, top: 0 }, text: hi }\n  - title: B\n    start: 5\n    items:\n      - { type: chip, when: phrase that does not exist, pos: { left: 0, top: 0 }, text: hi }\n      - { type: rocket, when: here, pos: { left: 0, top: 0 }, text: x }\n      - { type: code, when: here, pos: { left: 0, top: 0 }, lines: [{ s: a }] }\n      - { type: freetext, when: here, pos: { left: 10, top: 10 }, texto: oops }\n`);
  const r = compileEpisode(d, { write: false }), t = r.errors.join("\n") + "\n" + r.warnings.join("\n");
  assert.match(t, /block 3 does not exist/);
  assert.match(t, /phrase that does not exist.*does not appear in the voice/);
  assert.match(t, /unknown type "rocket"/);
  assert.match(t, /unknown key "texto"/);
});

// ---- derived cuts ----
import { findPhraseIndex, resolvePoint, sliceWords } from "../src/cut.ts";
const PL = ([["One", 0.2], ["two", 0.6], ["three.", 1.0], ["Four", 2.0], ["five", 2.4], ["six.", 2.8]] as [string, number][]).map(([t, a]) => ({ t, a, b: a + 0.3 }));
const BL = [{ n: 1, a: 0.2, b: 1.3 }, { n: 2, a: 2.0, b: 3.1 }];
test("cut: resolvePoint (seconds, block, phrase) and sliceWords re-anchors with breathing room", () => {
  assert.equal(resolvePoint(3, "from", { words: PL, blocks: BL }), 3);
  assert.equal(resolvePoint("block:2", "from", { words: PL, blocks: BL }), 2.0);
  assert.equal(resolvePoint("block:2", "to", { words: PL, blocks: BL }), 3.1);
  assert.equal(resolvePoint("four five", "from", { words: PL, blocks: BL }), 2.0);
  assert.equal(resolvePoint("four five", "to", { words: PL, blocks: BL }), 2.7);
  assert.throws(() => resolvePoint("block:9", "from", { words: PL, blocks: BL }), /block 9 does not exist/);
  assert.throws(() => resolvePoint("does not exist", "from", { words: PL, blocks: BL }), /does not appear/);
  assert.equal(findPhraseIndex(PL, "three"), 2);
  const f = sliceWords(PL, 2.0, 3.1);
  assert.deepEqual(f.words.map((p) => p.t), ["Four", "five", "six."]);
  assert.equal(f.words[0]!.a, 0.2); // 0.2 s of breathing room before the first word
  assert.equal(f.duration, 1.1 + 0.2 + 0.3);
});
test("cut: slices the long video's voice, creates the Short, registers it and protects `voice`; --redo re-slices", () => {
  assert.equal(studio(["voice", "my-long", "--quality", "draft"], proj).status, 0);
  const r = studio(["cut", "my-long", "my-cut", "--from", "block:2", "--to", "block:2", "--title", "My cut"], proj);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const folder = join(proj, "episodes/my-cut");
  for (const f of ["voice.mp3", "words.json", "cut.json", "script.txt", "episode.yaml", "episode.spec.json"]) assert.ok(existsSync(join(folder, f)), f);
  const words = JSON.parse(readFileSync(join(folder, "words.json"), "utf8"));
  assert.ok(words[0].a >= 0.2 && words[0].a < 0.8, "starts with breathing room before the first word");
  assert.match(readFileSync(join(folder, "episode.yaml"), "utf8"), /FULL VIDEO ON YOUTUBE/);
  assert.equal(JSON.parse(readFileSync(join(folder, "publication.json"), "utf8")).fullVideo, "[LONG_VIDEO_LINK]");
  assert.ok(existsSync(join(folder, "voice.estimated")), "the estimated voice is inherited");
  assert.match(readFileSync(join(proj, "src/Root.tsx"), "utf8"), /MyCutComposition/);
  const v = studio(["voice", "my-cut"], proj);
  assert.notEqual(v.status, 0); assert.match(v.stderr, /cut derived from a long video/);
  assert.equal(studio(["cut", "my-cut", "--redo"], proj).status, 0);
  assert.notEqual(studio(["cut", "my-long", "other", "--from", "block:9", "--to", "block:9"], proj).status, 0);
});
test("compile: start and outro by phrase and { voice: N } follow the voice", () => {
  const d = ep(`duration: { voice: 2.5 }\nvoice: audio/x.mp3\noutro: { start: { voice: -2 }, cta: END }\nhits: [{ at: "checked", type: flash }]\nscenes:\n  - start: 0\n    items:\n      - { type: box, text: a }\n  - start: { when: here, plus: -0.1 }\n    items:\n      - { type: box, text: b }\n`);
  const r = compileEpisode(d);
  assert.deepEqual(r.errors, []);
  assert.equal(r.spec.scenes[1].start, 1.9);        // "here" is spoken at 2.0 − 0.1
  assert.equal(r.spec.durS, 6.3 + 2.5);             // end of the voice + 2.5
  assert.equal(r.spec.outro.a, 4.3);                // end of the voice − 2
  assert.equal(r.spec.hits[0].at, 1.4);
  const bad = compileEpisode(ep(`duration: 12\nvoice: x\noutro: { start: 9, cta: END }\nscenes:\n  - start: { when: phrase that does not exist }\n    items:\n      - { type: box, text: a }\n`), { write: false });
  assert.match(bad.errors.join("\n"), /phrase that does not exist.*does not appear in the voice/);
});
test("cut --hook: own voice before the excerpt (cache, redo keeps), --no-hook and --detach free `voice`", () => {
  const r = studio(["cut", "my-long", "hook-cut", "--from", "block:2", "--to", "block:2", "--hook", "Have you ever clicked twice?"], proj);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const folder = join(proj, "episodes/hook-cut");
  const words = JSON.parse(readFileSync(join(folder, "words.json"), "utf8"));
  assert.deepEqual(words.slice(0, 4).map((p: any) => p.t), ["Have", "you", "ever", "clicked"]);
  assert.match(readFileSync(join(folder, "script.txt"), "utf8"), /^Have you ever clicked twice\?\n/);
  assert.equal(JSON.parse(readFileSync(join(folder, "cut.json"), "utf8")).hook.text, "Have you ever clicked twice?");
  assert.match(studio(["cut", "hook-cut", "--redo"], proj).stdout, /hook: reused from the cache/);
  assert.equal(studio(["cut", "hook-cut", "--redo", "--no-hook"], proj).status, 0);
  assert.ok(!("hook" in JSON.parse(readFileSync(join(folder, "cut.json"), "utf8"))));
  assert.notEqual(studio(["voice", "hook-cut", "--quality", "draft"], proj).status, 0);
  assert.equal(studio(["cut", "hook-cut", "--detach"], proj).status, 0);
  assert.ok(!existsSync(join(folder, "cut.json")));
  assert.equal(studio(["voice", "hook-cut", "--quality", "draft"], proj).status, 0); // now a plain Short
});

// ---- English only: no Portuguese commands or flags ----
test("Portuguese commands and flags are gone", () => {
  for (const cmd of ["novo", "voz", "compilar", "corte", "prever", "capa", "folha", "checar", "pacote", "agendar", "postar", "fila", "conta", "licencas", "ajuda"]) {
    const r = studio([cmd], base);
    assert.equal(r.status, 2, cmd); assert.match(r.stdout, /praeko studio <command>/);
  }
  studio(["new", "pt-flag", "--titulo", "X"], proj); // unknown flags are ignored: the old flag does nothing
  assert.equal(JSON.parse(readFileSync(join(proj, "episodes/pt-flag/episode.json"), "utf8")).title, "pt flag");
});

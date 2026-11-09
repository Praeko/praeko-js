import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { hookHash, joinAudios, narrate, narratePiece } from "@praeko/studio-voice";
import { buildPackage, validate } from "@praeko/studio-publish";
import { checkEpisode, contactSheet } from "@praeko/studio-review";
import { episodeOf, findProject, pascal } from "./project.ts";
import type { Episode, Project } from "./project.ts";
import * as T from "./templates.ts";
import { compileEpisode, imageEngine, imageFormat, isImagePiece } from "./compile.ts";
import { IMAGE_LIMITS, SLIDE_TIMEOUT_S, checkJpeg, slideFile } from "./image.ts";
import { cutAudio, readJson, resolvePoint, sliceWords } from "./cut.ts";
import { coverHyperframes, engineOf, hyperframesWarnings, previewHyperframes, renderHyperframes } from "./engine.ts";
import { HERE, PACKAGE_ROOT, VERSION } from "./version.ts";
import { noticeText, shortNotice } from "./licenses.ts";
import { lang } from "./i18n.ts";
import { detectAgents, installSkill } from "./skill.ts";
import { GROUPS, agentsOnPath, applyBrand, hasBrief, interview, lineAsk, parseAnswers, readBriefAnswers, readBrandTokens, readTokensIn, writeBriefFiles } from "./interview.ts";
import type { Answers, Ask, Group, Tokens } from "./interview.ts";

// Voice subcommands (balance, voices, account, config) are their own scripts: in development they live in packages/voice/bin; in the published package, in dist/voice-<name>.mjs (one bundle per script).
const VOICE_BIN = (n: string): string => { const bundled = join(HERE, "voice-" + n + ".mjs"); return existsSync(bundled) ? bundled : join(HERE, "..", "..", "voice", "bin", n + ".ts"); };
export const flag = (a: string[], k: string): string | undefined => { const i = a.indexOf("--" + k); return i >= 0 ? a[i + 1] : undefined; };
export const has = (a: string[], k: string): boolean => a.includes("--" + k);
const publicDir = (p: Project): string => resolve(p.root, p.brand.publicDir || "public");
const write = (file: string, text: string): void => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); };
const run = (cmd: string, args: string[], cwd: string, timeoutMs?: number): Promise<number> => new Promise((ok) => {
  const c = spawn(cmd, args, { cwd, stdio: "inherit", shell: false });
  const timer = timeoutMs ? setTimeout(() => { console.error(`error: ${cmd} did not finish in ${Math.round(timeoutMs / 1000)} s: stopped`); c.kill("SIGKILL"); }, timeoutMs) : null;
  c.on("error", (e) => { if (timer) clearTimeout(timer); console.error(`error running ${cmd}: ${e.message}`); ok(1); });
  c.on("exit", (code) => { if (timer) clearTimeout(timer); ok(code ?? 1); });
});
/** Runs the project's Remotion directly through Node (no npx or .cmd: the same on macOS, Linux and Windows). */
const runRemotion = (p: Project, args: string[], timeoutMs?: number): Promise<number> => {
  let cli: string;
  try { cli = join(dirname(createRequire(join(p.root, "package.json")).resolve("@remotion/cli/package.json")), "remotion-cli.js"); }
  catch { throw new Error("@remotion/cli is not installed in this project: run `npm install` in the project folder (or create it with `praeko studio init`)"); }
  return run(process.execPath, [cli, ...args], p.root, timeoutMs);
};
/** `npm` without a shell: on Windows, the npm-cli.js that ships with Node; elsewhere, the `npm` on PATH. */
const npmInstall = (cwd: string): Promise<number> => process.platform === "win32" ? run(process.execPath, [join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"), "install", "--loglevel=error"], cwd) : run("npm", ["install", "--loglevel=error"], cwd);
const ICON = { ok: "✓", warning: "⚠", error: "✗" } as const;

export type InitIO = { interactive?: boolean; ask?: Ask; say?: (s: string) => void };
const isTTY = (): boolean => !!process.stdin.isTTY && !!process.stdout.isTTY;
/** Question source: the injected one (tests) or readline over stdin/stdout. */
const openAsk = (io: InitIO): { ask: Ask; close: () => void } => io.ask ? { ask: io.ask, close: () => {} } : lineAsk(process.stdin, process.stdout);

export async function init(a: string[], io: InitIO = {}): Promise<number> {
  const usage = 'usage: praeko studio init <folder> [--yes] [--name "My Channel"] [--handle @mychannel] [--agent claude,codex|all] [--lang en|pt] [--about "…"] [--audience "…"] [--tone "…"] [--accent #hex] [--background #hex] [--font "Name"] [--brand <brand folder>] [--reference <url|text>]… [--reference-note "…"]… [--voice-alias A] [--voice-provider draft|elevenlabs|voicestudio] [--dev <path of the Studio repository>] [--no-install]';
  if (!a[0] || a[0].startsWith("--")) throw new Error(usage);
  const dir = resolve(a[0]);
  if (existsSync(dir) && readdirSync(dir).length) throw new Error(`${dir} already exists and is not empty`);
  const dev = flag(a, "dev") ? resolve(flag(a, "dev")!) : null;
  if (dev && !existsSync(join(dev, "packages", "core", "package.json"))) throw new Error(`--dev ${dev}: I did not find packages/core (point at the studio/ folder of the Praeko repository)`);
  const given = parseAnswers(a), interactive = !has(a, "yes") && (io.interactive ?? isTTY());
  let ans: Answers = given;
  const brandFlag = flag(a, "brand");
  let tokens: Tokens | null = null;
  if (brandFlag) {
    tokens = readTokensIn(resolve(brandFlag));
    if (!tokens) throw new Error(`--brand ${brandFlag}: I did not find build/tokens.json or tokens.json with colors or a font in that folder`);
  } else tokens = readBrandTokens(dir);
  if (interactive) {
    const q = openAsk(io);
    try { ans = await interview(q.ask, given, { lang: given.lang ?? lang(), say: io.say ?? console.log, defaults: { name: basename(dir), lang: lang() }, agentsDefault: detectAgents(dir).length ? detectAgents(dir) : agentsOnPath(), tokens }); }
    finally { q.close(); }
  }
  let imported = "";
  if (!interactive && tokens) {
    // --yes / no TTY: the tokens fill what no flag gave (flags win)
    const took: string[] = [];
    if (ans.accent === undefined && tokens.accent) { ans = { ...ans, accent: tokens.accent }; took.push(`accent ${tokens.accent}`); }
    if (ans.background === undefined && tokens.background) { ans = { ...ans, background: tokens.background }; took.push(`background ${tokens.background}`); }
    if (ans.font === undefined && tokens.font) { ans = { ...ans, font: tokens.font }; took.push(`font ${tokens.font}`); }
    if (took.length) imported = `imported from ${tokens.file}: ${took.join(", ")}`;
  }
  const name = ans.name || basename(dir), handle = ans.handle || "@" + (name.toLowerCase().replace(/[^a-z0-9]+/g, "") || "mychannel");
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-channel";
  write(join(dir, "package.json"), T.projectPackage({ name: slug, dev: dev ? relative(dir, dev).split("\\").join("/") : null, studioVersion: VERSION }));
  write(join(dir, "brand.json"), applyBrand(T.initialBrand({ name, handle }), { ...ans, name, handle }));
  write(join(dir, "remotion.config.ts"), dev ? T.remotionConfigDev : T.remotionConfigBase);
  write(join(dir, "tsconfig.json"), T.tsconfig);
  write(join(dir, "src", "index.ts"), T.indexTs);
  write(join(dir, "src", "brand.ts"), T.brandTs);
  write(join(dir, "src", "Root.tsx"), T.rootTsx);
  write(join(dir, ".gitignore"), "node_modules/\nout/\n.hf/\n.praeko-studio/\n.studio-backup/\n.env\n.env.*\n.DS_Store\n");
  write(join(dir, "README.md"), `# ${name}\n\nPraeko Studio video project. First video: \`npx praeko-studio new my-first\` (or \`praeko studio new my-first\`). Check the environment with \`praeko studio doctor\`.\n`);
  cpSync(join(PACKAGE_ROOT, "templates", "sfx"), join(dir, "public", "sfx"), { recursive: true });
  mkdirSync(join(dir, "public", "cover"), { recursive: true });
  copyFileSync(join(PACKAGE_ROOT, "templates", "avatar.png"), join(dir, "public", "cover", "avatar.png"));
  mkdirSync(join(dir, "episodes"), { recursive: true });
  const agents = ans.agents ?? (detectAgents(dir).length ? detectAgents(dir) : ["claude", "codex"]);
  const done = installSkill({ dir, agents, lang: ans.lang || lang() });
  console.log(`project created in ${dir}${dev ? " (--dev mode: packages by local path)" : ""}`);
  if (imported) console.log(imported);
  for (const f of done) console.log(`  instructions for ${f.agent}: ${f.file}`);
  if (hasBrief(ans)) for (const m of writeBriefFiles(dir, { ...ans, name, handle, lang: ans.lang || lang() }, null)) console.log(m);
  console.log("\n" + noticeText());
  if (!has(a, "no-install")) { const c = await npmInstall(dir); if (c) throw new Error("npm install failed"); }
  console.log(`\nnext step: cd ${dir} && npx praeko-studio new my-first --title "My first video"`);
  console.log("\n" + mcpInstallLines(dir).join("\n"));
  return 0;
}

/** The two install lines of the local MCP server (@praeko/studio-mcp) for a project folder: the Claude Code command and the generic JSON block (command + args). */
export function mcpInstallLines(dir: string): string[] {
  const abs = resolve(dir), quoted = /^[A-Za-z0-9_@%+=:,./~-]+$/.test(abs) ? abs : `"${abs.replace(/(["\\$`])/g, "\\$1")}"`;
  return [
    "local MCP server (for an agent without a terminal, such as Claude Desktop), same project:",
    `  claude mcp add praeko-studio -- npx -y @praeko/studio-mcp --project ${quoted}`,
    `  generic JSON: ${JSON.stringify({ command: "npx", args: ["-y", "@praeko/studio-mcp", "--project", abs] })}`,
  ];
}

/** `praeko studio brief [--only about,tone,…] [answer flags]`: reopens the interview in an existing project. */
export async function brief(a: string[], io: InitIO = {}): Promise<number> {
  const proj = findProject(), given = parseAnswers(a), prevBrief = readBriefAnswers(proj.root);
  const onlyFlag = flag(a, "only"), allowed = GROUPS.filter((g) => g !== "agents");
  let only: Set<Group> | undefined;
  if (onlyFlag) {
    const l = onlyFlag.split(",").map((x) => x.trim()).filter(Boolean);
    const bad = l.filter((x) => !(allowed as readonly string[]).includes(x));
    if (bad.length) throw new Error(`--only ${bad.join(",")}: use ${allowed.join(", ")}`);
    only = new Set(l as Group[]);
  }
  const interactive = !has(a, "yes") && (io.interactive ?? isTTY());
  const b = proj.brand as any;
  const defaults: Answers = { name: b.name, handle: b.handle, accent: b.colors?.accent, background: b.colors?.background, ...(prevBrief ?? {}) };
  if (!defaults.lang) defaults.lang = lang();
  let ans: Answers = { ...defaults, ...given };
  if (interactive) {
    const q = openAsk(io), say = io.say ?? console.log;
    try {
      if (!only && !Object.keys(given).length) {
        const v = await q.ask(`Which answers to redo? (${allowed.join(", ")}; Enter = all)`);
        if (v) { const l = v.split(",").map((x) => x.trim()).filter((x) => (allowed as readonly string[]).includes(x)); if (l.length) only = new Set(l as Group[]); }
      }
      ans = await interview(q.ask, given, { lang: given.lang ?? defaults.lang!, say, defaults, tokens: readBrandTokens(proj.root), only: only ?? new Set(allowed) });
    } finally { q.close(); }
  } else if (!Object.keys(given).length) throw new Error('usage: praeko studio brief [--only about,audience,tone,colors,font,references,voice,name,handle,lang] [--about "…"] [--audience "…"] [--tone "…"] [--accent #hex] [--background #hex] [--font "Name"] [--reference <url|text>]… [--reference-note "…"]…  (without answer flags it asks, in a terminal)');
  const file = join(proj.root, "brand.json"), cur = readFileSync(file, "utf8"), next = applyBrand(cur, ans, prevBrief?.font);
  if (next !== cur) { writeFileSync(file, next); console.log("brief: updated brand.json"); }
  for (const m of writeBriefFiles(proj.root, ans, prevBrief)) console.log(m);
  console.log("\n" + mcpInstallLines(proj.root).join("\n"));
  return 0;
}

export function newEpisode(a: string[]): number {
  const proj = findProject(), slug = a[0];
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('usage: praeko studio new <slug-in-lowercase-with-hyphens> [--title "Video title"] [--long | --image | --carousel]');
  const folder = join(proj.root, "episodes", slug);
  if (existsSync(folder)) throw new Error(`${folder} already exists`);
  const id = pascal(slug), cover = `Cover${id}`, title = flag(a, "title") || slug.replace(/-/g, " ");
  const longForm = has(a, "long"), carouselForm = has(a, "carousel"), imageForm = has(a, "image") || carouselForm;
  if ([longForm, has(a, "image"), carouselForm].filter(Boolean).length > 1) throw new Error("--long, --image and --carousel cannot go together");
  const upper = title.toUpperCase().split(/\s+/).filter(Boolean), size = Math.ceil(upper.length / Math.min(3, upper.length));
  const lines: string[] = [];
  for (let i = 0; i < upper.length; i += size) lines.push(upper.slice(i, i + size).join(" "));
  if (imageForm) { // a photo post or a carousel: no script, voice or video; the slides are rendered to JPEG by `praeko studio slides`
    write(join(folder, "publication.json"), T.imagePublication({ title, carousel: carouselForm }));
    write(join(folder, "episode.json"), JSON.stringify({ id, title, format: carouselForm ? "carousel" : "image" }, null, 2) + "\n");
    write(join(folder, "episode.yaml"), carouselForm ? T.carouselYaml({ id, title }) : T.imageYaml({ id, title }));
    write(join(folder, "scenes.tsx"), T.imageScenesTsx);
    write(join(folder, "episode.tsx"), T.imageTsx({ id, slug }));
  } else {
  write(join(folder, "script.txt"), longForm ? T.longScript : T.initialScript);
  write(join(folder, "publication.json"), T.initialPublication({ title }));
  write(join(folder, "episode.json"), JSON.stringify({ id, cover, title }, null, 2) + "\n");
  write(join(folder, "words.ts"), T.wordsTs());
  if (longForm) {
    write(join(folder, "episode.yaml"), T.longYaml({ id, title }));
    write(join(folder, "scenes.tsx"), T.longScenesTsx);
    write(join(folder, "episode.tsx"), T.longTsx({ id, slug }));
  } else {
    write(join(folder, "episode.yaml"), T.episodeYaml({ id, cover, title }));
    write(join(folder, "scenes.tsx"), T.scenesTsx({ cover, lines }));
    write(join(folder, "episode.tsx"), T.episodeTsx({ id, slug }));
  }
  }
  const r0 = compileEpisode(folder);
  if (r0.errors.length) throw new Error("the initial episode did not compile: " + r0.errors.join("; "));
  // registers it in Root.tsx (between the "praeko-studio:" comments)
  const root = join(proj.root, "src", "Root.tsx");
  let s = readFileSync(root, "utf8");
  if (!s.includes(`// ${T.MARKER_IMPORTS}`) || !s.includes(`{/* ${T.MARKER_COMPOSITIONS} */}`)) throw new Error(`src/Root.tsx has no \`${T.MARKER_IMPORTS}\` and \`${T.MARKER_COMPOSITIONS}\` markers: register the episode by hand`);
  s = s.replace(`// ${T.MARKER_IMPORTS_END}`, `import { ${id}Composition } from "../episodes/${slug}/episode";\n// ${T.MARKER_IMPORTS_END}`).replace(`{/* ${T.MARKER_COMPOSITIONS_END} */}`, `<${id}Composition />\n    {/* ${T.MARKER_COMPOSITIONS_END} */}`);
  writeFileSync(root, s);
  if (imageForm) console.log(`${carouselForm ? "carousel" : "image post"} created: episodes/${slug}/ (id ${id}). Next: edit the ${carouselForm ? "slides" : "slide"} in episode.yaml (each with its alt text), the caption in publication.json, then \`praeko studio slides ${slug}\``);
  else console.log(`episode created: episodes/${slug}/ (id ${id}). Next: write script.txt and run \`praeko studio voice ${slug} --quality draft\``);
  return 0;
}

/** Image pieces have no voice, video or cover: the commands of a video say what to run instead. */
const notForImage = (ep: Episode, what: string): void => { if (isImagePiece(ep.folder)) throw new Error(`"${ep.slug}" is an image piece (format: ${imageFormat(ep.folder)}): it has no ${what}. Render it with \`praeko studio slides ${ep.slug}\``); };

export async function voice(a: string[]): Promise<number> {
  const sub = a[0];
  if (["balance", "voices", "account", "config"].includes(sub!)) return run(process.execPath, [VOICE_BIN(sub!), ...a.slice(1)], process.cwd());
  const proj = findProject(), ep = episodeOf(proj, sub);
  notForImage(ep, "voice");
  if (existsSync(join(ep.folder, "cut.json"))) throw new Error(`"${sub}" is a cut derived from a long video: the voice comes from there. Make the voice of the long video and run \`praeko studio cut ${sub} --redo\``);
  const r = await narrate({ folder: ep.folder, brand: proj.brand as any, log: (m: string) => console.error(m), noFailover: has(a, "no-failover"), voice: flag(a, "voice"), quality: flag(a, "quality"), aligner: flag(a, "aligner") });
  const target = join(publicDir(proj), "audio", `${ep.id}.mp3`);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(ep.folder, "voice.mp3"), target);
  if (r.corrected?.length) console.log("captions corrected from the script:", r.corrected.map(([x, y]) => `${x}→${y}`).join(", "));
  if (r.blocks) console.log(`long video in ${r.blocks} blocks: ${r.regenerated} generated, ${r.reused} reused from the cache · ${r.duration.toFixed(1)} s · ${r.words} words · block starts in episodes/${ep.slug}/blocks.json`);
  if (r.estimated) console.log(`ESTIMATED voice (silent, ~190 words/min) · ${r.duration.toFixed(1)} s · ${r.words} words → ${relative(proj.root, target)}\n⚠ good for assembling and checking scenes; the timings change with the final voice (run \`praeko studio compile\` again). Anchors with numbers: the script spells them out, the real voice returns digits.`);
  else if (!r.blocks) console.log(`voice ${r.voice} (${r.provider}, ${r.account}) · ${r.duration.toFixed(1)} s · ${r.words} words → ${relative(proj.root, target)}`);
  return 0;
}

/**
 * `praeko studio cut <long> <new-slug> --from <ref> --to <ref> [--hook "hook phrase" [--quality draft|final|local]] [--title "T"]`
 * Vertical Short sliced from the long video's voice (no voice spent). `ref`: seconds, "block:N" or "phrase".
 * `--hook` makes voice only for that phrase (it goes before the excerpt). `praeko studio cut <slug> --redo` re-slices after the long voice changed
 * (accepts `--hook "new text"` and `--no-hook`). `praeko studio cut <slug> --detach` removes the link to the long video: it becomes a plain Short.
 */
export async function cut(a: string[]): Promise<number> {
  const proj = findProject();
  const redo = has(a, "redo"), detach = has(a, "detach");
  const slug = redo || detach ? a[0] : a[1];
  const usage = 'usage: praeko studio cut <long> <new-slug> --from <seconds|block:N|"phrase"> --to <…> [--hook "hook"] [--title "T"]  |  praeko studio cut <slug> --redo [--hook "…"|--no-hook]  |  praeko studio cut <slug> --detach';
  if (!slug || (!redo && !detach && !a[0])) throw new Error(usage);
  const cutFile = join(proj.root, "episodes", slug, "cut.json");
  if (detach) {
    if (!existsSync(cutFile)) throw new Error(`"${slug}" has no cut.json (it is not a derived cut)`);
    unlinkSync(cutFile);
    console.log(`"${slug}" detached from the long video: it is now a plain Short. The audio and the script stay as they are; edit script.txt and run \`praeko studio voice ${slug} --quality final\` for a brand-new voice.`);
    return 0;
  }
  let cfg: any;
  if (redo) { cfg = readJson<any>(cutFile, null); if (!cfg) throw new Error(`"${slug}" has no cut.json (it is not a derived cut)`); }
  else cfg = { long: a[0], from: flag(a, "from"), to: flag(a, "to") };
  if (flag(a, "hook")) cfg.hook = { text: flag(a, "hook"), quality: flag(a, "quality") || cfg.hook?.quality || "draft" };
  if (has(a, "no-hook")) delete cfg.hook;
  if (cfg.from === undefined || cfg.to === undefined) throw new Error("--from and --to are required");
  const lg = episodeOf(proj, cfg.long);
  const words = readJson<any[]>(join(lg.folder, "words.json"), []), blocks = readJson<any[]>(join(lg.folder, "blocks.json"), []);
  if (!words.length || !existsSync(join(lg.folder, "voice.mp3"))) throw new Error(`the long video "${cfg.long}" has no voice yet: run \`praeko studio voice ${cfg.long} --quality draft\``);
  const t0 = resolvePoint(cfg.from, "from", { words, blocks }), t1 = resolvePoint(cfg.to, "to", { words, blocks });
  if (t1 - t0 < 5) throw new Error(`an excerpt of ${(t1 - t0).toFixed(1)} s is too short (from ${t0.toFixed(2)} to ${t1.toFixed(2)}); minimum 5 s`);
  const f = sliceWords(words, t0, t1);
  if (f.duration > 180) throw new Error(`an excerpt of ${f.duration.toFixed(0)} s: choose a shorter one`);
  if (!redo) newEpisode([slug, "--title", flag(a, "title") || slug.replace(/-/g, " ")]);
  const ep = episodeOf(proj, slug);
  // audio: [own hook] + excerpt of the long video
  const excerpt = join(ep.folder, "voice-excerpt.mp3");
  cutAudio(join(lg.folder, "voice.mp3"), excerpt, f.start, f.end);
  let words2: any[] = f.words, total = f.duration, estimated = existsSync(join(lg.folder, "voice.estimated")), script = f.words.map((p) => p.t).join(" ");
  if (cfg.hook) {
    const quality = cfg.hook.quality, key = hookHash({ text: cfg.hook.text, quality, pronunciation: (proj.brand as any).pronunciation });
    const base = join(ep.folder, "voice-hook", key);
    mkdirSync(dirname(base), { recursive: true });
    if (!existsSync(base + ".mp3") || !existsSync(base + ".json")) {
      console.log(`hook: making voice (${quality}) for "${cfg.hook.text}"`);
      const r = await narratePiece({ text: cfg.hook.text, file: base + ".mp3", brand: proj.brand as any, quality, log: (m: string) => console.error(m) });
      writeFileSync(base + ".json", JSON.stringify({ duration: r.duration, words: r.words, estimated: r.estimated }));
    } else console.log("hook: reused from the cache");
    const hk = JSON.parse(readFileSync(base + ".json", "utf8")), GAP = 0.25, shift = hk.duration + GAP;
    joinAudios([base + ".mp3", excerpt], join(ep.folder, "voice.mp3"), GAP);
    words2 = [...hk.words, ...f.words.map((p) => ({ ...p, a: +(p.a + shift).toFixed(2), b: +(p.b + shift).toFixed(2) }))];
    total = +(shift + f.duration).toFixed(2);
    script = cfg.hook.text + "\n" + script;
    estimated = estimated || hk.estimated;
  } else copyFileSync(excerpt, join(ep.folder, "voice.mp3"));
  unlinkSync(excerpt);
  write(join(ep.folder, "script.txt"), script + "\n");
  write(join(ep.folder, "words.json"), JSON.stringify(words2));
  write(join(ep.folder, "words.ts"), T.wordsTs(words2));
  write(cutFile, JSON.stringify(cfg, null, 2) + "\n");
  const target = join(publicDir(proj), "audio", `${ep.id}.mp3`);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(ep.folder, "voice.mp3"), target);
  if (estimated) write(join(ep.folder, "voice.estimated"), "estimated voice: make the final one (on the long video, and `praeko studio cut " + slug + " --redo`; the hook with --quality final) before publishing\n");
  else if (existsSync(join(ep.folder, "voice.estimated"))) unlinkSync(join(ep.folder, "voice.estimated"));
  if (!redo) { // fits the initial YAML to the duration and the package to the "full video"
    const y = join(ep.folder, "episode.yaml");
    let t = readFileSync(y, "utf8");
    t = t.replace(/^duration: .*$/m, "duration: { voice: 2.5 }          # 2.5 s after the end of the voice (follows the voice)").replace(/^outro: .*$/m, "outro: { start: { voice: -2 }, cta: FULL VIDEO ON YOUTUBE }");
    writeFileSync(y, t);
    const pj = join(ep.folder, "publication.json"), meta = JSON.parse(readFileSync(pj, "utf8"));
    meta.fullVideo = "[LONG_VIDEO_LINK]"; meta.beforePublishing = ["Watch it with sound.", "Fill in [LONG_VIDEO_LINK] (only publish after the long video)."];
    writeFileSync(pj, JSON.stringify(meta, null, 2) + "\n");
  }
  const r = compileEpisode(ep.folder);
  console.log(`cut "${slug}": ${total.toFixed(1)} s (${t0.toFixed(2)}–${t1.toFixed(2)} of the long video "${cfg.long}"${cfg.hook ? " + own hook" : ""}), ${words2.length} words${redo ? " (redone)" : ""}`);
  r.warnings.forEach((x) => console.log(`${ICON.warning} ${x}`)); r.errors.forEach((x) => console.log(`${ICON.error} ${x}`));
  if (!redo) console.log(`next: write the scenes in episodes/${slug}/episode.yaml (\`start\` and \`when\` accept phrases of this excerpt) and run \`praeko studio render ${slug}\``);
  return r.errors.length ? 1 : 0;
}

/** Compiles episode.yaml if it exists (render, cover and check call this first). Returns 1 on errors. */
function compileIfPresent(ep: Episode): number {
  if (!existsSync(join(ep.folder, "episode.yaml"))) return 0;
  const r = compileEpisode(ep.folder);
  r.warnings.forEach((x) => console.log(`${ICON.warning} ${x}`)); r.errors.forEach((x) => console.log(`${ICON.error} ${x}`));
  return r.errors.length ? 1 : 0;
}
export function compile(a: string[]): number {
  const p = findProject(), ep = episodeOf(p, a[0]);
  const r = compileEpisode(ep.folder);
  if (!r.errors.length && engineOf(p, ep, flag(a, "engine")) === "hyperframes") r.warnings.push(...hyperframesWarnings(ep));
  r.warnings.forEach((x) => console.log(`${ICON.warning} ${x}`)); r.errors.forEach((x) => console.log(`${ICON.error} ${x}`));
  if (!r.errors.length) console.log(`${ICON.ok} episodes/${ep.slug}/episode.spec.json (${r.spec.scenes.length} scenes)`);
  console.log(`\n${r.errors.length} error(s), ${r.warnings.length} warning(s)`);
  return r.errors.length ? 1 : 0;
}
export function preview(a: string[] = []): Promise<number> | number {
  const p = findProject(), slug = a.find((x) => !x.startsWith("--") && x !== flag(a, "engine"));
  if (slug && engineOf(p, episodeOf(p, slug), flag(a, "engine")) === "hyperframes") return compileIfPresent(episodeOf(p, slug)) || previewHyperframes(p, episodeOf(p, slug));
  return runRemotion(p, ["studio", "src/index.ts"]);
}
export async function render(a: string[]): Promise<number> {
  const p = findProject(), ep = episodeOf(p, a[0]), scale = flag(a, "scale");
  notForImage(ep, "video");
  if (compileIfPresent(ep)) return 1;
  if (engineOf(p, ep, flag(a, "engine")) === "hyperframes") return renderHyperframes(p, ep);
  shortNotice();
  mkdirSync(join(p.root, "out"), { recursive: true });
  const c = await runRemotion(p, ["render", "src/index.ts", ep.id, ep.mp4, ...(scale ? ["--scale", scale] : [])]);
  if (!c) console.log(`rendered: ${relative(process.cwd(), ep.mp4)}`);
  return c;
}
export async function cover(a: string[]): Promise<number> {
  const p = findProject(), ep = episodeOf(p, a[0]);
  notForImage(ep, "cover");
  if (compileIfPresent(ep)) return 1;
  if (engineOf(p, ep, flag(a, "engine")) === "hyperframes") return coverHyperframes(p, ep);
  shortNotice();
  mkdirSync(join(p.root, "out"), { recursive: true });
  const specFile = join(ep.folder, "episode.spec.json");
  const spec = existsSync(specFile) ? JSON.parse(readFileSync(specFile, "utf8")) : null;
  if (spec && !spec.outro && spec.cover) { // long video: 16:9 cover (YouTube) and vertical (Instagram)
    const wide = join(p.root, "out", `${ep.slug}-cover-1280x720.png`), vertical = join(p.root, "out", `${ep.slug}-cover-vertical-1080x1920.png`);
    const c1 = await runRemotion(p, ["still", "src/index.ts", spec.cover.id, wide]);
    const c2 = c1 ? c1 : await runRemotion(p, ["still", "src/index.ts", `${spec.cover.id}Vertical`, vertical]);
    if (!c2) console.log(`covers: ${relative(process.cwd(), wide)} · ${relative(process.cwd(), vertical)}`);
    return c2;
  }
  const c = await runRemotion(p, ["still", "src/index.ts", ep.cover, ep.png]);
  if (!c) console.log(`cover: ${relative(process.cwd(), ep.png)}`);
  return c;
}
/**
 * `praeko studio slides <slug>`: renders the slide(s) of an image piece or a carousel to out/<slug>-slide-NN.jpg (NN = 01, 02, … in the order of `slides:`): 1080x1350 (4:5), sRGB JPEG
 * (`remotion still --image-format=jpeg --jpeg-quality=92`, one still per slide), then checks each file (JPEG, size, at most 8 MB). Remotion only: HyperFrames has no image mode.
 * Each slide is its own `remotion still` call (Remotion keeps its webpack cache between calls, so only the first one pays for the full bundle); a slide that takes more than
 * `--timeout <seconds>` (default 180) is stopped and named. A slide that fails does not stop the others from being listed: the command reports every failed slide and exits 1.
 */
export async function slides(a: string[]): Promise<number> {
  const p = findProject(), ep = episodeOf(p, a[0]);
  if (!isImagePiece(ep.folder)) throw new Error(`"${a[0]}" is not an image piece: set \`format: image\` (one slide) or \`format: carousel\` (2 to 20) and \`slides:\` in episode.yaml (create one with \`praeko studio new <slug> --image\` or \`--carousel\`). Videos use render and cover`);
  if (flag(a, "engine") === "hyperframes" || imageEngine(ep.folder) === "hyperframes") throw new Error("image pieces render only with Remotion: HyperFrames has no image mode yet (remove --engine hyperframes / engine: hyperframes)");
  if (flag(a, "engine") && flag(a, "engine") !== "remotion") throw new Error(`engine "${flag(a, "engine")}" does not exist (image pieces use remotion)`);
  if (compileIfPresent(ep)) return 1;
  const spec = JSON.parse(readFileSync(join(ep.folder, "episode.spec.json"), "utf8"));
  shortNotice();
  mkdirSync(join(p.root, "out"), { recursive: true });
  const timeoutS = flag(a, "timeout") ? Number(flag(a, "timeout")) : SLIDE_TIMEOUT_S;
  if (!(timeoutS > 0)) throw new Error("--timeout takes a number of seconds (per slide)");
  const total = (spec.slides as any[]).length, failedSlides: number[] = [];
  let failed = 0;
  for (const [i, s] of (spec.slides as any[]).entries()) {
    const file = slideFile(p.root, ep.slug, i + 1);
    rmSync(file, { force: true }); // never leave the file of an older render standing in for a slide that failed now
    const c = await runRemotion(p, ["still", "src/index.ts", s.id, file, "--image-format=jpeg", `--jpeg-quality=${IMAGE_LIMITS.quality}`], timeoutS * 1000);
    if (c) { console.log(`${ICON.error} slide ${i + 1} of ${total} (${s.id}) failed to render (exit ${c}; limit ${timeoutS} s per slide): fix that slide in episode.yaml and run \`praeko studio slides ${ep.slug}\` again`); failedSlides.push(i + 1); failed++; continue; }
    const r = checkJpeg(file);
    r.errors.forEach((x) => console.log(`${ICON.error} slide ${i + 1}: ${x}`)); r.warnings.forEach((x) => console.log(`${ICON.warning} slide ${i + 1}: ${x}`));
    console.log(`${r.errors.length ? ICON.error : ICON.ok} slide ${i + 1}: ${relative(process.cwd(), file)} (${r.width}x${r.height}, ${(r.bytes / 1024).toFixed(0)} KB)`);
    if (r.errors.length) failedSlides.push(i + 1);
    failed += r.errors.length;
  }
  if (failedSlides.length) console.log(`${ICON.error} ${failedSlides.length} of ${total} slide(s) failed: ${failedSlides.join(", ")}`);
  else console.log("next: `praeko studio check " + ep.slug + "` and `praeko studio package " + ep.slug + "`");
  return failed ? 1 : 0;
}
/** publication.json of an image piece with `images` filled from the compiled spec (alt text) and the slide files. */
function withImages(p: Project, ep: Episode, publication: any, compiled?: any): any {
  const specFile = join(ep.folder, "episode.spec.json");
  const spec = compiled ?? (existsSync(specFile) ? JSON.parse(readFileSync(specFile, "utf8")) : null);
  const kind = spec?.format === "carousel" || publication.format === "carousel" || publication.kind === "carousel" ? "carousel" : "image";
  if (!spec?.slides) return { ...publication, kind };
  return { ...publication, kind, format: kind, images: spec.slides.map((s: any, i: number) => ({ file: relative(p.root, slideFile(p.root, ep.slug, i + 1)), ...(s.alt ? { alt: s.alt } : {}) })) };
}
/** `check` of an image piece: compile, alt text, the rendered JPEG and the Instagram caption (no voice, no video). */
function checkImage(p: Project, ep: Episode): number {
  const extra = compileEpisode(ep.folder, { write: false });
  const res: { level: "error" | "warning"; msg: string }[] = [...extra.errors.map((msg) => ({ level: "error" as const, msg })), ...extra.warnings.map((msg) => ({ level: "warning" as const, msg }))];
  const publication = withImages(p, ep, JSON.parse(readFileSync(join(ep.folder, "publication.json"), "utf8")), extra.spec);
  for (const [i, im] of (publication.images || []).entries()) {
    const abs = resolve(p.root, im.file);
    if (!existsSync(abs)) res.push({ level: "warning", msg: `slide ${i + 1} is not rendered yet (${im.file}): run \`praeko studio slides ${ep.slug}\`` });
    else for (const x of checkJpeg(abs).errors) res.push({ level: "error", msg: x });
  }
  const v = validate({ brand: p.brand, publication });
  res.push(...v.errors.map((msg) => ({ level: "error" as const, msg })), ...v.warnings.map((msg) => ({ level: "warning" as const, msg })));
  for (const x of res) console.log(`${ICON[x.level]} ${x.msg}`);
  const errors = res.filter((x) => x.level === "error").length;
  console.log(`\n${errors} error(s), ${res.length - errors} warning(s)`);
  return errors ? 1 : 0;
}
export function contactSheetCommand(a: string[]): number {
  const p = findProject(), target = a[0];
  const video = existsSync(target || "") ? resolve(target!) : episodeOf(p, target).mp4;
  const output = join(p.root, "out", `${(target || "").split("/").pop()!.replace(/\.mp4$/, "")}-contact-sheet.png`);
  const r = contactSheet({ video, output, count: +(flag(a, "n") || 12), columns: +(flag(a, "columns") || 6) });
  console.log(`mosaic of ${r.count} frames: ${relative(process.cwd(), r.output)}`);
  return 0;
}
export function check(a: string[]): number {
  const p = findProject(), ep = episodeOf(p, a[0]);
  if (isImagePiece(ep.folder)) return checkImage(p, ep);
  const estimated = existsSync(join(ep.folder, "voice.estimated")) ? [{ level: "warning" as const, msg: "the voice is ESTIMATED (silent draft): make the final one before publishing (praeko studio voice " + ep.slug + " --quality final)" }] : [];
  const extra = existsSync(join(ep.folder, "episode.yaml")) ? compileEpisode(ep.folder, { write: false }) : null;
  const res = [...estimated, ...(extra ? [...extra.errors.map((msg) => ({ level: "error" as const, msg })), ...extra.warnings.map((msg) => ({ level: "warning" as const, msg }))] : []), ...checkEpisode({ folder: ep.folder, brand: p.brand as any, video: existsSync(ep.mp4) ? ep.mp4 : undefined })];
  for (const x of res) console.log(`${ICON[x.level]} ${x.msg}`);
  const errors = res.filter((x) => x.level === "error").length, warnings = res.filter((x) => x.level === "warning").length;
  console.log(`\n${errors} error(s), ${warnings} warning(s)`);
  return errors ? 1 : 0;
}
export function packageCommand(a: string[]): number {
  const p = findProject(), ep = episodeOf(p, a[0]);
  let publication = JSON.parse(readFileSync(join(ep.folder, "publication.json"), "utf8"));
  if (isImagePiece(ep.folder)) { // an image piece: images (file + alt) come from the compiled spec; publication.json keeps them for `schedule`
    const c = compileEpisode(ep.folder);
    c.errors.forEach((x) => console.log(`${ICON.error} ${x}`));
    if (c.errors.length) return 1;
    publication = withImages(p, ep, publication, c.spec);
    writeFileSync(join(ep.folder, "publication.json"), JSON.stringify(publication, null, 2) + "\n");
  }
  const specFile = join(ep.folder, "episode.spec.json");
  if (publication.format === "long" && !publication.chapters && existsSync(specFile)) { // chapters = the scenes of the long video (lowercase title, first letter capitalized)
    const spec = JSON.parse(readFileSync(specFile, "utf8"));
    publication.chapters = spec.scenes.map((c: any) => ({ t: c.start, title: c.title.charAt(0) + c.title.slice(1).toLowerCase() }));
  }
  const v = validate({ brand: p.brand, publication });
  const output = join(ep.folder, "texts.md");
  writeFileSync(output, buildPackage({ brand: p.brand, publication }));
  console.log(`wrote ${relative(process.cwd(), output)}; ${v.errors.length} error(s), ${v.warnings.length} warning(s)`);
  v.errors.forEach((e) => console.log("  ✗", e)); v.warnings.forEach((e) => console.log("  ⚠", e));
  return v.errors.length ? 1 : 0;
}

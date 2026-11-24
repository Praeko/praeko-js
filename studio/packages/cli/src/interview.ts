// Brand interview: `praeko studio init` (interactive) and `praeko studio brief`.
// The answers become brand.json (name, handle, colors, font), brief.md (the answers, readable) and a DRAFT playbook.md (editorial rules inferred ONLY from what the person wrote).
// Studio never downloads or analyzes video: references are stored as text and the person's agent analyzes them later (see skill-texts.ts).
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { AGENTS } from "./skill.ts";
import { CUES_OPENING, CUES_RHYTHM, EDIT_CAPTIONS, EDIT_EFFECTS, EDIT_FACE, EDIT_OPENING, EDIT_RHYTHM, EDIT_SOUND, PT_INTERVIEW, PT_TEXT } from "./i18n-pt.ts";
import { CAPTIONS, EDIT_KEYS, EFFECTS, FACES, FORMATS, LIKED, PACES, SOUNDS, SOURCES, STYLES, STYLES_2D, STYLES_3D, STYLE_ADVISED_MAX, appliedByStudio, tokenOf, parseChoice, presetReady, styleLook, styleName, styleNever } from "./styles.ts";
import type { Edit, Format, Liked, Source, Style } from "./styles.ts";
import { STUDIO_NPX } from "./version.ts";

export type Ref = { ref: string; note: string; liked?: Liked[] };
export type Answers = {
  name?: string; handle?: string; lang?: "pt" | "en"; agents?: string[] | "all";
  source?: Source[]; about?: string; audience?: string; tone?: string;
  format?: Format[]; style?: Style[]; styleOther?: string; edit?: Edit;
  accent?: string; background?: string; font?: string;
  references?: Ref[]; voiceAlias?: string; voiceProvider?: string;
};
export type Ask = (question: string, def?: string) => Promise<string>;
/** Question groups, in the order of the interview (what `brief --only` accepts; `style` there also reopens `format` and `edit`). */
export const GROUPS = ["lang", "name", "handle", "agents", "source", "about", "audience", "tone", "format", "style", "edit", "colors", "font", "references", "voice"] as const;
export type Group = (typeof GROUPS)[number];
/** `brief --only style` reopens the three questions of how the videos look and are edited. */
export const STYLE_GROUPS: readonly Group[] = ["format", "style", "edit"];
export const VOICE_PROVIDERS = ["draft", "elevenlabs", "voicestudio"] as const;
/** English is the source; in pt the text goes through the dictionary (exact phrases, then the patterns). */
const tt = (l: "en" | "pt") => (en: string): string => (l === "pt" ? (PT_TEXT[en] ?? ptInterview(en)) : en);
const ptInterview = (en: string): string => { for (const [re, to] of PT_INTERVIEW) if (re.test(en)) return en.replace(re, to); return en; };

// ---------- values ----------
/** "#abc", "ABC123" or "#aabbcc" become "#aabbcc"; anything else is null. */
export function normalizeHex(s: string | undefined): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((s ?? "").trim());
  if (!m) return null;
  let h = m[1]!.toLowerCase();
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return "#" + h;
}
export const deriveHandle = (name: string): string => "@" + (name.toLowerCase().replace(/[^a-z0-9]+/g, "") || "mychannel");
const normHandle = (h: string): string => (h.startsWith("@") ? h : "@" + h);
const cleanFont = (f: string): string => f.replace(/['"]/g, "").trim();
const parseAgents = (v: string): string[] | "all" | null => {
  const l = v.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (l.includes("all")) return "all";
  return l.length && l.every((x) => (AGENTS as readonly string[]).includes(x)) ? l : null;
};
/** Portuguese words accepted in the guided answer about a reference. */
const LIKED_PT: Record<string, Liked> = { ritmo: "pace", abertura: "opening", visual: "look", legenda: "captions", legendas: "captions" };
/** "What did you like in it?": a list of pace, opening, look, captions (numbers or words, en or pt) becomes `liked`; anything else is a free-text note. */
export function parseLiked(v: string): { liked?: Liked[]; note: string } {
  const text = v.trim();
  if (!text) return { note: "" };
  const l = parseChoice(text.split(/[,\s]+/).map((x) => LIKED_PT[x.toLowerCase()] ?? x).join(","), LIKED);
  return l && l.length ? { liked: l as Liked[], note: "" } : { note: text };
}
/** Joins two answer sets: `over` wins key by key, and `edit` is merged per option. */
export function mergeAnswers(base: Answers, over: Answers): Answers {
  const out: Answers = { ...base };
  for (const k of Object.keys(over) as (keyof Answers)[]) if (over[k] !== undefined) (out as any)[k] = over[k];
  if (base.edit || over.edit) out.edit = { ...(base.edit ?? {}), ...(over.edit ?? {}) };
  return out;
}

// ---------- flags ----------
const flagAll = (a: string[], k: string): string[] => { const r: string[] = []; a.forEach((x, i) => { if (x === "--" + k && a[i + 1] !== undefined && !a[i + 1]!.startsWith("--")) r.push(a[i + 1]!); }); return r; };
const flag1 = (a: string[], k: string): string | undefined => flagAll(a, k)[0];
/** A closed list given by a flag: slugs separated by commas, each one from `options`; duplicates are dropped. Anything else throws. */
const closedList = <T extends string>(k: string, v: string, options: readonly T[], hint = ""): T[] => {
  const l = [...new Set(v.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean))];
  const bad = l.filter((x) => !(options as readonly string[]).includes(x));
  if (!l.length || bad.length) throw new Error(`--${k} ${v}: use ${options.join(", ")}${hint}`);
  return l as T[];
};
const closedOne = <T extends string>(k: string, v: string, options: readonly T[]): T => {
  const x = v.trim().toLowerCase();
  if (!(options as readonly string[]).includes(x)) throw new Error(`--${k} ${v}: use ${options.join(" or ")}`);
  return x as T;
};
/** Answers given by flags. Invalid values throw (a flag is not asked again, so it cannot be fixed on the spot). */
export function parseAnswers(a: string[]): Answers {
  const r: Answers = {};
  const s = (k: string): string | undefined => { const v = flag1(a, k); return v === undefined ? undefined : v.trim(); };
  if (s("name") !== undefined) r.name = s("name");
  if (s("handle") !== undefined) r.handle = normHandle(s("handle")!);
  if (s("lang") !== undefined) { if (s("lang") !== "pt" && s("lang") !== "en") throw new Error(`--lang ${s("lang")}: use pt or en`); r.lang = s("lang") as "pt" | "en"; }
  if (s("agent") !== undefined) { const ag = parseAgents(s("agent")!); if (!ag) throw new Error(`--agent ${s("agent")}: use ${AGENTS.join(", ")} or all`); r.agents = ag; }
  if (s("source") !== undefined) r.source = closedList("source", s("source")!, SOURCES, " (both: script,video)");
  for (const k of ["about", "audience", "tone"] as const) if (s(k) !== undefined) r[k] = s(k);
  if (s("format") !== undefined) r.format = closedList("format", s("format")!, FORMATS, " (the first one is the main one)");
  if (s("style") !== undefined) r.style = closedList("style", s("style")!, STYLES, ' (any other style: --style-other "a description")');
  if (s("style-other") !== undefined) r.styleOther = s("style-other");
  const edit: Edit = {};
  if (s("pace") !== undefined) edit.pace = closedOne("pace", s("pace")!, PACES);
  if (s("captions") !== undefined) edit.captions = closedOne("captions", s("captions")!, CAPTIONS);
  if (s("effects") !== undefined) {
    const v = s("effects")!;
    if (v.toLowerCase() === "none") edit.effects = [];
    else edit.effects = closedList("effects", v, EFFECTS, " (or none alone)");
  }
  if (s("sound") !== undefined) edit.sound = closedOne("sound", s("sound")!, SOUNDS);
  if (s("face") !== undefined) edit.face = closedOne("face", s("face")!, FACES);
  if (Object.keys(edit).length) r.edit = edit;
  for (const k of ["accent", "background"] as const) if (s(k) !== undefined) { const h = normalizeHex(s(k)); if (!h) throw new Error(`--${k} ${s(k)}: not a hex color (use #rrggbb or #rgb)`); r[k] = h; }
  if (s("font") !== undefined) r.font = cleanFont(s("font")!);
  const refs = flagAll(a, "reference"), notes = flagAll(a, "reference-note");
  if (refs.length > 3) throw new Error("at most 3 --reference");
  if (notes.length > refs.length) throw new Error("--reference-note without a matching --reference (notes pair with references in order)");
  if (refs.length) r.references = refs.map((ref, i) => ({ ref: ref.trim(), ...parseLiked(notes[i] ?? "") }));
  if (s("voice-alias") !== undefined) r.voiceAlias = s("voice-alias");
  if (s("voice-provider") !== undefined) { if (!(VOICE_PROVIDERS as readonly string[]).includes(s("voice-provider")!)) throw new Error(`--voice-provider ${s("voice-provider")}: use ${VOICE_PROVIDERS.join(", ")}`); r.voiceProvider = s("voice-provider"); }
  return r;
}
/** Combinations a single flag cannot check: showing your face needs your own video. Throws with what to use instead. */
export function checkCombination(x: Answers): void {
  if (x.edit?.face === "face" && !(x.source ?? ["script"]).includes("video")) throw new Error("--face face needs --source video (your own video); in the script flow use --face mascot or none");
}
/** Soft warning when more than the advised number of visual styles is chosen (allowed: the person may want to test). */
export const styleWarning = (x: Answers): string | null => ((x.style?.length ?? 0) > STYLE_ADVISED_MAX ? `${x.style!.length} visual styles: allowed, but 1 or 2 give the channel an identity (the first one is the channel's style)` : null);
/** Video-only channels skip the voice questions (the sound comes from the video). */
export const videoOnly = (x: Answers): boolean => !!x.source?.length && !x.source.includes("script");
/** True when there is something for brief.md (name/handle/colors/font only change brand.json). */
export const hasBrief = (x: Answers): boolean => !!(x.about || x.audience || x.tone || x.references?.length || x.voiceAlias || x.voiceProvider || x.source?.length || x.format?.length || x.style?.length || x.styleOther || (x.edit && Object.keys(x.edit).length));

// ---------- ../brand/ tokens ----------
export type Tokens = { file: string; accent?: string; background?: string; font?: string };
/** Reads (never copies) design tokens of a `brand/` folder next to the project: `../brand/build/tokens.json` or `../brand/tokens.json` (keys cor.acento/cor.fundo/fonte, or colors.accent/colors.background/font). */
export function readBrandTokens(projectDir: string): Tokens | null { return readTokensIn(resolve(projectDir, "..", "brand")); }
/** Same read for an explicit brand folder (`--brand <folder>`): `build/tokens.json` or `tokens.json` inside it. */
export function readTokensIn(brandDir: string): Tokens | null {
  for (const rel of [["build", "tokens.json"], ["tokens.json"]]) {
    const file = resolve(brandDir, ...rel);
    if (!existsSync(file)) continue;
    try {
      const j = JSON.parse(readFileSync(file, "utf8"));
      const accent = normalizeHex(j?.cor?.acento ?? j?.colors?.accent) ?? undefined, background = normalizeHex(j?.cor?.fundo ?? j?.colors?.background) ?? undefined;
      const f = j?.fonte ?? j?.font, font = typeof f === "string" && f.trim() ? cleanFont(f) : undefined;
      if (accent || background || font) return { file, accent, background, font };
    } catch { /* unreadable tokens: ignored */ }
  }
  return null;
}

/** Coding agents whose command is on the PATH (default of the question; only used in the interactive flow). */
export function agentsOnPath(): string[] {
  const cmds: Record<string, string> = { claude: "claude", codex: "codex", gemini: "gemini", opencode: "opencode" };
  const dirs = (process.env.PATH || "").split(delimiter).filter(Boolean);
  return Object.keys(cmds).filter((a) => dirs.some((d) => existsSync(join(d, cmds[a]!)) || existsSync(join(d, cmds[a]! + ".cmd"))));
}

// ---------- asking ----------
/** `ask` over a stream (readline, no dependency). Enter returns the default; closed input returns the default for every remaining question. */
export function lineAsk(input: NodeJS.ReadableStream, output: NodeJS.WritableStream): { ask: Ask; close: () => void } {
  const rl = createInterface({ input, terminal: false });
  const queue: string[] = []; let waiter: ((s: string | null) => void) | null = null, ended = false;
  rl.on("line", (l) => { if (waiter) { const w = waiter; waiter = null; w(l); } else queue.push(l); });
  rl.on("close", () => { ended = true; if (waiter) { const w = waiter; waiter = null; w(null); } });
  const next = (): Promise<string | null> => queue.length ? Promise.resolve(queue.shift()!) : ended ? Promise.resolve(null) : new Promise((r) => { waiter = r; });
  const ask: Ask = async (q, def) => {
    output.write(q + (def ? ` [${def}]` : "") + ": ");
    const l = await next();
    if (l === null) { output.write("\n"); return def ?? ""; }
    return l.trim() || (def ?? "");
  };
  return { ask, close: () => rl.close() };
}

export type Ctx = { lang: "en" | "pt"; say: (s: string) => void; defaults: Answers; agentsDefault?: string[]; tokens?: Tokens | null; only?: ReadonlySet<Group> };
const YES = /^(y|yes|s|sim)$/i;
const OTHER = ["other", "outro"];
const numbered = (opts: readonly string[], label: (o: string) => string, from = 1): string => opts.map((o, i) => `${i + from} ${label(o)}`).join(" · ");

/** Asks, in sequence, what was not answered by a flag. Everything has a default and Enter skips. Returns the answers merged over the defaults. */
export async function interview(ask: Ask, given: Answers, ctx: Ctx): Promise<Answers> {
  const r: Answers = { ...given }, d: Answers = { ...ctx.defaults };
  let L = ctx.lang, t = tt(L);
  const want = (g: Group): boolean => !ctx.only || ctx.only.has(g);
  const say = ctx.say;
  const text = async (g: Group, k: "name" | "about" | "audience" | "tone", q: string, def?: string): Promise<void> => { if (want(g) && r[k] === undefined) r[k] = await ask(q, def ?? d[k]); };
  const hex = async (k: "accent" | "background", q: string): Promise<void> => {
    if (!want("colors") || r[k] !== undefined) return;
    for (let i = 0; i < 3; i++) { const v = await ask(q, d[k]); if (!v) return; const h = normalizeHex(v); if (h) { r[k] = h; return; } say(t(`  "${v}" is not a hex color (e.g. #f4b942); try again or press Enter to skip`)); }
  };
  /** A numbered list: numbers or names separated by commas. Enter keeps `def` (undefined = not answered: the Studio default). Three tries, then it is skipped. */
  const choose = async <T extends string>(q: string, options: readonly T[], def: string | undefined, opts: { one?: boolean; extra?: readonly string[] } = {}): Promise<string[] | undefined> => {
    for (let i = 0; i < 3; i++) {
      const v = await ask(q, def);
      if (!v) return undefined;
      const l = parseChoice(v, options, opts.extra ?? []);
      if (l && l.length && (!opts.one || l.length === 1)) return l;
      say(t(opts.one ? "  choose one option: its number or its name" : "  unknown option; use the numbers or the names above, separated by commas"));
    }
    return undefined;
  };

  if (want("lang") && r.lang === undefined) {
    for (let i = 0; i < 3; i++) { const v = (await ask(t("Language of the project texts (pt|en)"), d.lang ?? L)).toLowerCase(); if (v === "pt" || v === "en") { r.lang = v; break; } say(t("  use pt or en")); }
  }
  if (r.lang ?? d.lang) { L = (r.lang ?? d.lang)!; t = tt(L); }
  await text("name", "name", t("Channel or brand name"));
  if (want("handle") && r.handle === undefined) r.handle = normHandle(await ask(t("Handle"), d.handle ?? deriveHandle(r.name ?? d.name ?? "")));
  if (want("agents") && r.agents === undefined) {
    const def = (ctx.agentsDefault?.length ? ctx.agentsDefault : ["claude", "codex"]).join(",");
    for (let i = 0; i < 3; i++) { const v = await ask(t(`AI agents to configure (${AGENTS.join(", ")} or all)`), def); const ag = parseAgents(v); if (ag) { r.agents = ag; break; } say(t("  unknown agent; use the names above, separated by commas")); }
  }
  if (want("source") && r.source === undefined) {
    say(t("Where do the videos come from? 1 script: Studio makes the voice from a script · 2 video: you edit a video you recorded (both: 1,2)"));
    const v = await choose(t("Source (Enter = script)"), SOURCES, d.source?.join(","));
    if (v) r.source = v as Source[];
  }
  await text("about", "about", t("What is the channel about? (one sentence)"));
  await text("audience", "audience", t("Who is it for?"));
  await text("tone", "tone", t("Tone of voice (one sentence)"));

  if (want("format") && r.format === undefined) {
    say(t("Formats, as many as you want; the first one is the main one:") + " " + numbered(FORMATS, (f) => t(FORMAT_LABEL[f as Format])));
    const v = await choose(t("Formats (Enter = short)"), FORMATS, d.format?.join(","));
    if (v) r.format = v as Format[];
  }
  if (want("style") && r.style === undefined) {
    say(t("Visual style: 1 or 2 give the channel an identity (the first one is the channel's style, the others are styles you also use); more is allowed."));
    say("  2D: " + numbered(STYLES_2D, (s) => styleName(s, L)));
    say("  3D: " + numbered(STYLES_3D, (s) => styleName(s, L), STYLES_2D.length + 1));
    say("  " + numbered([t("other (describe it)")], (x) => x, STYLES.length + 1));
    const cur = [...(d.style ?? []), ...(d.styleOther ? ["other"] : [])].join(",") || undefined;
    const v = await choose(t("Visual styles (numbers or names; Enter = none yet)"), STYLES, cur, { extra: OTHER });
    if (v) {
      const other = v.some((x) => OTHER.includes(x));
      r.style = v.filter((x) => !OTHER.includes(x)) as Style[];
      if (other && r.styleOther === undefined) { const o = await ask(t("Describe the other style"), d.styleOther); if (o) r.styleOther = o; }
      if (!other && r.styleOther === undefined) r.styleOther = "";
      const w = styleWarning(r); if (w) say(t(`  ${w}`));
      for (const s of r.style) if (!presetReady(s)) say(t(`  ${styleName(s, L)}: preset not available yet; kept as an instruction for your agent`));
      if (r.styleOther) say(t("  the other style has no preset: it is kept as an instruction for your agent"));
      if (r.style[0] && presetReady(r.style[0])) say(t(`  ${styleName(r.style[0], L)} is applied by Studio to the videos (the colors below start from it)`));
    }
  }
  if (want("edit")) {
    const g = given.edit ?? {}, e: Edit = { ...(d.edit ?? {}), ...g };
    say(t("Editing style: each option says whether Studio applies it or your agent follows it as an instruction. Enter keeps the Studio default."));
    if (g.pace === undefined) { const v = await choose(t("Pace: 1 calm · 2 fast, short cuts (instruction for the agent)"), PACES, e.pace, { one: true }); if (v) e.pace = v[0] as Edit["pace"]; }
    if (g.captions === undefined) { const v = await choose(t("Captions: 1 word by word (applied by Studio) · 2 phrase · 3 none (instructions for the agent: the engine does not apply them yet)"), CAPTIONS, e.captions, { one: true }); if (v) e.captions = v[0] as Edit["captions"]; }
    if (g.effects === undefined) {
      const v = await choose(t("Effects: 1 shake · 2 zoom · 3 flash (applied by Studio) · 4 none"), EFFECTS, e.effects ? (e.effects.length ? e.effects.join(",") : "none") : undefined, { extra: ["none"] });
      if (v) e.effects = v.includes("none") ? [] : (v as Edit["effects"]);
    }
    if (g.sound === undefined) { const v = await choose(t("Sound: 1 sound effects (applied by Studio) · 2 none"), SOUNDS, e.sound, { one: true }); if (v) e.sound = v[0] as Edit["sound"]; }
    if (g.face === undefined) {
      const withVideo = (r.source ?? d.source ?? ["script"]).includes("video");
      const opts: readonly string[] = withVideo ? FACES : FACES.filter((f) => f !== "face");
      const v = await choose(withVideo ? t("Who appears: 1 you, on camera · 2 a mascot · 3 nobody (instruction for the agent)") : t("Who appears: 1 a mascot · 2 nobody (instruction for the agent)"), opts, e.face && opts.includes(e.face) ? e.face : undefined, { one: true });
      if (v) e.face = v[0] as Edit["face"];
    }
    if (Object.keys(e).length) r.edit = e;
  }

  if (ctx.tokens && (want("colors") || want("font")) && [r.accent, r.background, r.font].some((x) => x === undefined)) {
    const k = ctx.tokens;
    say(t(`Found a brand/ folder next to the project (${k.file}): accent ${k.accent ?? "-"}, background ${k.background ?? "-"}, font ${k.font ?? "-"}. Nothing is copied; it only fills the defaults below.`));
    if (YES.test(await ask(t("Use them as defaults? (y/n)"), t("y")))) { if (k.accent) d.accent = k.accent; if (k.background) d.background = k.background; if (k.font) d.font = k.font; }
  }
  // a visual style chosen now suggests its colors as the defaults, only where the value is still the previous style's (or the Studio's own)
  const prevStyle = ctx.defaults.style?.[0], newStyle = r.style?.[0];
  if (newStyle && newStyle !== prevStyle) for (const k of ["accent", "background"] as const) if (!d[k] || d[k] === tokenOf(prevStyle, k)) d[k] = tokenOf(newStyle, k);
  await hex("accent", t("Accent color (hex)"));
  await hex("background", t("Background color (hex)"));
  if (want("font") && r.font === undefined) r.font = cleanFont(await ask(t("Font (a name installed on the machine)"), d.font));

  if (want("references") && r.references === undefined) {
    say(t("References: up to 3 videos or channels you like (a URL or a description). Studio does not watch them; your agent will analyze them. Enter on the first one keeps what is there."));
    const refs: Ref[] = [];
    for (let i = 0; i < 3; i++) {
      const ref = await ask(t(`Reference ${i + 1} (URL or text; Enter to finish)`));
      if (!ref) break;
      refs.push({ ref, ...parseLiked(await ask(t("  What did you like in it? 1 pace · 2 opening · 3 look · 4 captions (numbers, or say it in your words)"), "")) });
    }
    if (refs.length) r.references = refs;
  }
  if (want("voice") && !videoOnly({ source: r.source ?? d.source })) {
    say(t(`Voice: only the name/alias and the provider. Never type a key here (keys go in with \`${STUDIO_NPX} voice config key\`).`));
    if (r.voiceAlias === undefined) r.voiceAlias = await ask(t("Voice name or alias (Enter = none yet)"), d.voiceAlias);
    if (r.voiceProvider === undefined && (r.voiceAlias || d.voiceProvider)) {
      for (let i = 0; i < 3; i++) { const v = (await ask(t(`Voice provider (${VOICE_PROVIDERS.join("|")})`), d.voiceProvider ?? "elevenlabs")).toLowerCase(); if ((VOICE_PROVIDERS as readonly string[]).includes(v)) { r.voiceProvider = v; break; } say(t(`  use ${VOICE_PROVIDERS.join(", ")}`)); }
    }
  }
  const out: Answers = { ...d };
  for (const k of Object.keys(r) as (keyof Answers)[]) if (r[k] !== undefined && r[k] !== "") (out as any)[k] = r[k];
  if (r.styleOther === "") delete out.styleOther; // styles chosen again without "other": the old free text goes away
  return out;
}

// ---------- brand.json ----------
const THEMED = ["accent", "background", "text", "muted", "box", "code", "coverBackground"] as const;
/** Moves the theme tokens from one visual style to another, but only the values that are still the previous style's (or the Studio's own): what the person changed stays. */
function retheme(b: any, prev: string | undefined, next: string | undefined): void {
  const same = (x: unknown, y: string | undefined): boolean => typeof x === "string" && !!y && x.toLowerCase() === y.toLowerCase();
  b.colors = b.colors || {};
  for (const k of THEMED) if (b.colors[k] === undefined || same(b.colors[k], tokenOf(prev, k))) b.colors[k] = tokenOf(next, k);
  b.fonts = b.fonts || {};
  if (b.fonts.title === undefined || same(b.fonts.title, tokenOf(prev, "title"))) b.fonts.title = tokenOf(next, "title");
}
/**
 * Applies name, handle, colors, font and the style block to the text of a brand.json (everything else stays). `prevFont`: the font this tool put first last time (replaced, not stacked).
 * `style` = { visual, format, edit, source } (read by the engine: `style.visual[0]` is the channel's skin). Changing the visual style moves only the colors and font still at the
 * previous style's value; an answer equal to what brand.json already has is not a change (so a re-asked default never undoes the new style's colors).
 */
export function applyBrand(text: string, ans: Answers, prevFont?: string): string {
  const b = JSON.parse(text);
  const before = { accent: b.colors?.accent, background: b.colors?.background };
  if (ans.name) b.name = ans.name;
  if (ans.handle) b.handle = ans.handle;
  if (ans.style !== undefined || ans.format || ans.edit || ans.source) {
    const cur = b.style && typeof b.style === "object" ? b.style : {};
    const prev: string | undefined = Array.isArray(cur.visual) ? cur.visual[0] : undefined, next = ans.style !== undefined ? ans.style[0] : prev;
    if (next !== prev) retheme(b, prev, next);
    b.style = {
      visual: ans.style !== undefined ? [...ans.style] : (cur.visual ?? []),
      format: ans.format ? [...ans.format] : (cur.format ?? ["short"]),
      edit: ans.edit ? { ...ans.edit } : (cur.edit ?? {}),
      source: ans.source ? [...ans.source] : (cur.source ?? ["script"]),
    };
  }
  const changed = (k: "accent" | "background"): boolean => !!ans[k] && ans[k]!.toLowerCase() !== String(before[k] ?? "").toLowerCase();
  if (changed("accent") || changed("background")) { b.colors = b.colors || {}; if (changed("accent")) b.colors.accent = ans.accent; if (changed("background")) b.colors.background = ans.background; }
  if (ans.font) {
    b.fonts = b.fonts || {};
    let title: string = b.fonts.title || "system-ui, sans-serif";
    if (prevFont && title.startsWith(`'${prevFont}', `)) title = title.slice(prevFont.length + 4);
    if (!title.startsWith(`'${ans.font}', `)) title = `'${ans.font}', ${title}`;
    b.fonts.title = title;
  }
  return JSON.stringify(b, null, 2) + "\n";
}

// ---------- brief.md and playbook.md ----------
const MARK = /<!-- praeko-brief:(.*?) -->/s;
export function readBriefAnswers(dir: string): Answers | null {
  const f = join(dir, "brief.md");
  if (!existsSync(f)) return null;
  const m = MARK.exec(readFileSync(f, "utf8"));
  if (!m) return {};
  try { return JSON.parse(m[1]!); } catch { return {}; }
}
/** Only the fields that go into brief.md (name/handle included for context). */
const briefData = (x: Answers): Answers => { const o: Answers = {}; for (const k of ["name", "handle", "lang", "source", "about", "audience", "tone", "format", "style", "styleOther", "edit", "accent", "background", "font", "references", "voiceAlias", "voiceProvider"] as const) if (x[k] !== undefined && x[k] !== "") (o as any)[k] = x[k]; return o; };

const FORMAT_LABEL: Record<Format, string> = { short: "short (9:16)", long: "long (16:9)", carousel: "carousel (Instagram, 2 to 20 slides)", image: "image (Instagram, one slide)" };
const SOURCE_LABEL: Record<Source, string> = { script: "script: Studio makes the voice from a script", video: "video: you edit a video you recorded" };
const LIKED_LABEL: Record<Liked, string> = { pace: "pace", opening: "opening", look: "look", captions: "captions" };
const EDIT_LABEL: Record<(typeof EDIT_KEYS)[number], string> = { pace: "Pace", captions: "Captions", effects: "Effects", sound: "Sound", face: "Who appears" };
const VALUE_LABEL: Record<string, string> = { calm: "calm", fast: "fast, short cuts", word: "word by word", phrase: "by phrase", none: "none", sfx: "sound effects", face: "you, on camera", mascot: "a mascot", shake: "shake", zoom: "zoom", flash: "flash" };
/** "pace, opening" (+ the free-text note) in the person's language. */
const likedText = (r: Ref, t: (s: string) => string): string => [...(r.liked ?? []).map((k) => t(LIKED_LABEL[k])), ...(r.note ? [r.note] : [])].join(", ");
/** One line per editing option, each marked as applied by Studio or as an instruction for the agent. */
const editLines = (e: Edit | undefined, t: (s: string) => string, none: string): string[] => EDIT_KEYS.map((k) => {
  const v = e?.[k];
  if (v === undefined) return `- ${t(EDIT_LABEL[k])}: ${none}`;
  const shown = Array.isArray(v) ? (v.length ? v.map((x) => t(VALUE_LABEL[x] ?? x)).join(", ") : t("none")) : t(VALUE_LABEL[v] ?? v);
  const raw = Array.isArray(v) ? (v.length ? v[0]! : "none") : v;
  return `- ${t(EDIT_LABEL[k])}: ${shown} (${appliedByStudio(k, raw) ? t("applied by Studio") : t("instruction for the agent")})`;
});

export function renderBrief(x: Answers): string {
  const L = x.lang ?? "en", t = tt(L), none = t("(not answered yet)");
  const line = (label: string, v: string | undefined): string => `- ${label}: ${v || none}`;
  const refs = (x.references ?? []).map((r, i) => `${i + 1}. ${r.ref}\n   - ${t("What I liked")}: ${likedText(r, t) || none}`);
  const json = JSON.stringify(briefData(x)).replace(/-/g, "\\u002d");
  const fmt = x.format ?? [], sty = x.style ?? [];
  const styleLines = [
    line(t("Channel style"), sty[0] ? `${styleName(sty[0], L)} (\`${sty[0]}\`)${presetReady(sty[0]) ? `: ${t("applied by Studio")}` : `: ${t("preset not available yet; instruction for the agent")}`}` : undefined),
    ...(sty.length > 1 ? [`- ${t("Also used")}: ${sty.slice(1).map((s) => `${styleName(s, L)} (\`${s}\`)`).join(", ")}`] : []),
    ...(x.styleOther ? [`- ${t("Other (described)")}: ${x.styleOther} (${t("no preset: instruction for the agent")})`] : []),
  ];
  return [
    `# ${t("Brief")}: ${x.name || t("my channel")}`,
    "",
    t(`Answers from the brand interview (\`${STUDIO_NPX} init\` or \`${STUDIO_NPX} brief\`). Your agent reads this before writing any script. Rewritten by \`${STUDIO_NPX} brief\` (the previous one is kept as \`brief.md.bak\`).`),
    "",
    `## ${t("Channel")}`,
    line(t("Name"), x.name), line("Handle", x.handle), line(t("Language"), x.lang),
    "",
    `## ${t("What it is about")}`, x.about || none, "",
    `## ${t("Audience")}`, x.audience || none, "",
    `## ${t("Tone of voice")}`, x.tone || none, "",
    `## ${t("Format")}`,
    line(t("Source"), x.source?.map((s) => t(SOURCE_LABEL[s])).join("; ")),
    line(t("Main format"), fmt[0] ? t(FORMAT_LABEL[fmt[0]]) : undefined),
    ...(fmt.length > 1 ? [`- ${t("Also")}: ${fmt.slice(1).map((f) => t(FORMAT_LABEL[f])).join(", ")}`] : []),
    "",
    `## ${t("Visual style")}`, ...styleLines, "",
    `## ${t("Editing style")}`, ...editLines(x.edit, t, none), "",
    `## ${t("Look")}`,
    line(t("Accent color"), x.accent), line(t("Background color"), x.background), line(t("Font"), x.font),
    "",
    `## ${t("References")}`,
    refs.length ? refs.join("\n") : none,
    "",
    `## ${t("Voice")}`,
    ...(videoOnly(x) ? [t("(Video only: the sound comes from your own video, there is no voice to make.)")] : [
      line(t("Name or alias"), x.voiceAlias), line(t("Provider"), x.voiceProvider),
      t(`(No keys here: they are stored with \`${STUDIO_NPX} voice config key\`.)`),
    ]),
    "",
    `<!-- praeko-brief:${json} -->`,
    "",
  ].join("\n");
}

/** Draft of the editorial rules. Only what the person wrote is used; the rest is a TODO for the agent, who analyzes the references with their own tools. */
export function renderPlaybook(x: Answers): string {
  const L = x.lang ?? "en", t = tt(L), todo = t("TODO: the agent completes this after analyzing the references");
  const pick = (table: [RegExp, string, string][]): string[] => { const s = x.tone || ""; return s ? table.filter(([re]) => re.test(s)).map(([, en, pt]) => `${L === "pt" ? pt : en} (${t("inferred from your tone of voice")}: "${s}")`) : []; };
  const e = x.edit ?? {}, fromEdit = (s: [string, string]): string => `${L === "pt" ? s[1] : s[0]} (${t("from your editing style")})`;
  // the editing style wins over what the tone of voice suggests
  const rhythm = e.pace ? [fromEdit(EDIT_RHYTHM[e.pace])] : pick(CUES_RHYTHM), opening = e.pace ? [fromEdit(EDIT_OPENING[e.pace])] : pick(CUES_OPENING);
  if (e.effects) rhythm.push(fromEdit(e.effects.length ? EDIT_EFFECTS.some : EDIT_EFFECTS.none).replace("{effects}", e.effects.join(", ")));
  if (e.sound) rhythm.push(fromEdit(EDIT_SOUND[e.sound]));
  const captions = e.captions ? [fromEdit(EDIT_CAPTIONS[e.captions])] : [todo];
  const sty = x.style ?? [], visual: string[] = [];
  if (sty[0]) visual.push(`- ${t("Channel style")}: ${styleName(sty[0], L)} (\`${sty[0]}\`). ${styleLook(sty[0], L) ?? ""}`.trimEnd(), `- ${styleNever(sty[0], L) ?? todo}`);
  for (const s of sty.slice(1)) visual.push(`- ${t("Also used")}: ${styleName(s, L)} (\`${s}\`). ${styleLook(s, L) ?? ""} ${styleNever(s, L) ?? ""}`.trimEnd());
  if (x.styleOther) visual.push(`- ${t("Style described by the person (no preset: follow it as an instruction)")}: ${x.styleOther}`);
  if (sty.length) visual.push(`- ${t("A single episode can use another style with `style:` in its episode.yaml.")}`);
  if (e.face) visual.push(`- ${fromEdit(EDIT_FACE[e.face])}`);
  const out: string[] = [
    `# Playbook: ${x.name || t("my channel")}`, "",
    t(`Draft of the editorial rules, built only from \`brief.md\`. Edit freely: \`${STUDIO_NPX} brief\` never overwrites an edited playbook (it writes \`playbook.md.new\` instead).`), "",
    `## ${t("What the channel is")}`, x.about || todo, "",
    `## ${t("Audience")}`, x.audience ? `${t("Write for")}: ${x.audience}` : todo, "",
    `## ${t("Tone of voice")}`, x.tone ? `${t("Tone")}: ${x.tone}` : todo, "",
    `## ${t("Pace")}`, ...(rhythm.length ? rhythm.map((s) => `- ${s}`) : [todo]), "",
    `## ${t("Opening")}`, ...(opening.length ? opening.map((s) => `- ${s}`) : [todo]), "",
    `## ${t("Captions")}`, ...captions, "",
    ...(visual.length ? [`## ${t("Visual")}`, ...visual, ""] : []),
    `## ${t("Never say")}`, t(`One phrase per line, in quotes. \`${STUDIO_NPX} review\` flags these phrases in the script, captions, on-screen text and publication texts. TODO: add the promises this channel must never make.`), "",
    `## ${t("Rules from the references")}`,
    t("References are inputs to study, never to copy: describe pace, opening and captions as RULES, never reproduce someone else's video."),
  ];
  if (x.references?.length) for (const r of x.references) out.push("", `- ${r.ref}`, `  - ${t("What the person liked")}: ${likedText(r, t) || t("(not said)")}`, `  - ${todo}`);
  else out.push("", todo);
  out.push("");
  return out.join("\n");
}

/** Writes brief.md and playbook.md in the project. An existing brief.md is saved as .bak; an existing playbook.md is only replaced if it is still the unedited draft of the previous answers (otherwise the new draft goes to playbook.md.new). Returns the messages to print. */
export function writeBriefFiles(dir: string, ans: Answers, prev: Answers | null): string[] {
  const msgs: string[] = [];
  const put = (name: string, body: string): void => {
    const f = join(dir, name);
    if (existsSync(f) && readFileSync(f, "utf8") !== body) { copyFileSync(f, f + ".bak"); writeFileSync(f, body); msgs.push(`brief: wrote ${name} (previous one saved as ${name}.bak)`); }
    else if (!existsSync(f)) { writeFileSync(f, body); msgs.push(`brief: wrote ${name}`); }
  };
  put("brief.md", renderBrief(ans));
  const pb = join(dir, "playbook.md"), fresh = renderPlaybook(ans);
  if (!existsSync(pb)) put("playbook.md", fresh);
  else {
    const cur = readFileSync(pb, "utf8");
    if (cur === fresh) { /* nothing changed */ }
    else if (prev && cur === renderPlaybook(prev)) put("playbook.md", fresh);
    else { writeFileSync(pb + ".new", fresh); msgs.push("brief: kept your edited playbook.md; the new draft is in playbook.md.new"); }
  }
  return msgs;
}

// Brand interview: `praeko studio init` (interactive) and `praeko studio brief`.
// The answers become brand.json (name, handle, colors, font), brief.md (the answers, readable) and a DRAFT playbook.md (editorial rules inferred ONLY from what the person wrote).
// Studio never downloads or analyzes video: references are stored as text and the person's agent analyzes them later (see skill-texts.ts).
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { AGENTS } from "./skill.ts";
import { CUES_OPENING, CUES_RHYTHM, PT_INTERVIEW, PT_TEXT } from "./i18n-pt.ts";

export type Ref = { ref: string; note: string };
export type Answers = {
  name?: string; handle?: string; lang?: "pt" | "en"; agents?: string[] | "all";
  about?: string; audience?: string; tone?: string;
  accent?: string; background?: string; font?: string;
  references?: Ref[]; voiceAlias?: string; voiceProvider?: string;
};
export type Ask = (question: string, def?: string) => Promise<string>;
/** Question groups (what `brief --only` accepts). */
export const GROUPS = ["name", "handle", "lang", "agents", "about", "audience", "tone", "colors", "font", "references", "voice"] as const;
export type Group = (typeof GROUPS)[number];
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

// ---------- flags ----------
const flagAll = (a: string[], k: string): string[] => { const r: string[] = []; a.forEach((x, i) => { if (x === "--" + k && a[i + 1] !== undefined && !a[i + 1]!.startsWith("--")) r.push(a[i + 1]!); }); return r; };
const flag1 = (a: string[], k: string): string | undefined => flagAll(a, k)[0];
/** Answers given by flags. Invalid values throw (a flag is not asked again, so it cannot be fixed on the spot). */
export function parseAnswers(a: string[]): Answers {
  const r: Answers = {};
  const s = (k: string): string | undefined => { const v = flag1(a, k); return v === undefined ? undefined : v.trim(); };
  if (s("name") !== undefined) r.name = s("name");
  if (s("handle") !== undefined) r.handle = normHandle(s("handle")!);
  if (s("lang") !== undefined) { if (s("lang") !== "pt" && s("lang") !== "en") throw new Error(`--lang ${s("lang")}: use pt or en`); r.lang = s("lang") as "pt" | "en"; }
  if (s("agent") !== undefined) { const ag = parseAgents(s("agent")!); if (!ag) throw new Error(`--agent ${s("agent")}: use ${AGENTS.join(", ")} or all`); r.agents = ag; }
  for (const k of ["about", "audience", "tone"] as const) if (s(k) !== undefined) r[k] = s(k);
  for (const k of ["accent", "background"] as const) if (s(k) !== undefined) { const h = normalizeHex(s(k)); if (!h) throw new Error(`--${k} ${s(k)}: not a hex color (use #rrggbb or #rgb)`); r[k] = h; }
  if (s("font") !== undefined) r.font = cleanFont(s("font")!);
  const refs = flagAll(a, "reference"), notes = flagAll(a, "reference-note");
  if (refs.length > 3) throw new Error("at most 3 --reference");
  if (notes.length > refs.length) throw new Error("--reference-note without a matching --reference (notes pair with references in order)");
  if (refs.length) r.references = refs.map((ref, i) => ({ ref: ref.trim(), note: (notes[i] ?? "").trim() }));
  if (s("voice-alias") !== undefined) r.voiceAlias = s("voice-alias");
  if (s("voice-provider") !== undefined) { if (!(VOICE_PROVIDERS as readonly string[]).includes(s("voice-provider")!)) throw new Error(`--voice-provider ${s("voice-provider")}: use ${VOICE_PROVIDERS.join(", ")}`); r.voiceProvider = s("voice-provider"); }
  return r;
}
/** True when there is something for brief.md (name/handle/colors/font only change brand.json). */
export const hasBrief = (x: Answers): boolean => !!(x.about || x.audience || x.tone || x.references?.length || x.voiceAlias || x.voiceProvider);

// ---------- ../brand/ tokens ----------
export type Tokens = { file: string; accent?: string; background?: string; font?: string };
/** Reads (never copies) design tokens of a `brand/` folder next to the project: `../brand/build/tokens.json` or `../brand/tokens.json` (keys cor.acento/cor.fundo/fonte, or colors.accent/colors.background/font). */
export function readBrandTokens(projectDir: string): Tokens | null {
  for (const rel of [["..", "brand", "build", "tokens.json"], ["..", "brand", "tokens.json"]]) {
    const file = resolve(projectDir, ...rel);
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
  await text("about", "about", t("What is the channel about? (one sentence)"));
  await text("audience", "audience", t("Who is it for?"));
  await text("tone", "tone", t("Tone of voice (one sentence)"));

  if (ctx.tokens && (want("colors") || want("font")) && [r.accent, r.background, r.font].some((x) => x === undefined)) {
    const k = ctx.tokens;
    say(t(`Found a brand/ folder next to the project (${k.file}): accent ${k.accent ?? "-"}, background ${k.background ?? "-"}, font ${k.font ?? "-"}. Nothing is copied; it only fills the defaults below.`));
    if (YES.test(await ask(t("Use them as defaults? (y/n)"), t("y")))) { if (k.accent) d.accent = k.accent; if (k.background) d.background = k.background; if (k.font) d.font = k.font; }
  }
  await hex("accent", t("Accent color (hex)"));
  await hex("background", t("Background color (hex)"));
  if (want("font") && r.font === undefined) r.font = cleanFont(await ask(t("Font (a name installed on the machine)"), d.font));

  if (want("references") && r.references === undefined) {
    say(t("References: up to 3 videos or channels you like (a URL or a description). Studio does not watch them; your agent will analyze them. Enter on the first one keeps what is there."));
    const refs: Ref[] = [];
    for (let i = 0; i < 3; i++) {
      const ref = await ask(t(`Reference ${i + 1} (URL or text; Enter to finish)`));
      if (!ref) break;
      refs.push({ ref, note: await ask(t("  What did you like in it?"), "") });
    }
    if (refs.length) r.references = refs;
  }
  if (want("voice")) {
    say(t("Voice: only the name/alias and the provider. Never type a key here (keys go in with `praeko studio voice config key`)."));
    if (r.voiceAlias === undefined) r.voiceAlias = await ask(t("Voice name or alias (Enter = none yet)"), d.voiceAlias);
    if (r.voiceProvider === undefined && (r.voiceAlias || d.voiceProvider)) {
      for (let i = 0; i < 3; i++) { const v = (await ask(t(`Voice provider (${VOICE_PROVIDERS.join("|")})`), d.voiceProvider ?? "elevenlabs")).toLowerCase(); if ((VOICE_PROVIDERS as readonly string[]).includes(v)) { r.voiceProvider = v; break; } say(t(`  use ${VOICE_PROVIDERS.join(", ")}`)); }
    }
  }
  const out: Answers = { ...d };
  for (const k of Object.keys(r) as (keyof Answers)[]) if (r[k] !== undefined && r[k] !== "") (out as any)[k] = r[k];
  return out;
}

// ---------- brand.json ----------
/** Applies name, handle, colors and font to the text of a brand.json (everything else stays). `prevFont`: the font this tool put first last time (replaced, not stacked). */
export function applyBrand(text: string, ans: Answers, prevFont?: string): string {
  const b = JSON.parse(text);
  if (ans.name) b.name = ans.name;
  if (ans.handle) b.handle = ans.handle;
  if (ans.accent || ans.background) { b.colors = b.colors || {}; if (ans.accent) b.colors.accent = ans.accent; if (ans.background) b.colors.background = ans.background; }
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
const briefData = (x: Answers): Answers => { const o: Answers = {}; for (const k of ["name", "handle", "lang", "about", "audience", "tone", "accent", "background", "font", "references", "voiceAlias", "voiceProvider"] as const) if (x[k] !== undefined && x[k] !== "") (o as any)[k] = x[k]; return o; };

export function renderBrief(x: Answers): string {
  const t = tt(x.lang ?? "en"), none = t("(not answered yet)");
  const line = (label: string, v: string | undefined): string => `- ${label}: ${v || none}`;
  const refs = (x.references ?? []).map((r, i) => `${i + 1}. ${r.ref}${r.note ? `\n   - ${t("What I liked")}: ${r.note}` : `\n   - ${t("What I liked")}: ${none}`}`);
  const json = JSON.stringify(briefData(x)).replace(/-/g, "\\u002d");
  return [
    `# ${t("Brief")}: ${x.name || t("my channel")}`,
    "",
    t("Answers from the brand interview (`praeko studio init` or `praeko studio brief`). Your agent reads this before writing any script. Rewritten by `praeko studio brief` (the previous one is kept as `brief.md.bak`)."),
    "",
    `## ${t("Channel")}`,
    line(t("Name"), x.name), line("Handle", x.handle), line(t("Language"), x.lang),
    "",
    `## ${t("What it is about")}`, x.about || none, "",
    `## ${t("Audience")}`, x.audience || none, "",
    `## ${t("Tone of voice")}`, x.tone || none, "",
    `## ${t("Look")}`,
    line(t("Accent color"), x.accent), line(t("Background color"), x.background), line(t("Font"), x.font),
    "",
    `## ${t("References")}`,
    refs.length ? refs.join("\n") : none,
    "",
    `## ${t("Voice")}`,
    line(t("Name or alias"), x.voiceAlias), line(t("Provider"), x.voiceProvider),
    t("(No keys here: they are stored with `praeko studio voice config key`.)"),
    "",
    `<!-- praeko-brief:${json} -->`,
    "",
  ].join("\n");
}

/** Draft of the editorial rules. Only what the person wrote is used; the rest is a TODO for the agent, who analyzes the references with their own tools. */
export function renderPlaybook(x: Answers): string {
  const L = x.lang ?? "en", t = tt(L), todo = t("TODO: the agent completes this after analyzing the references");
  const pick = (table: [RegExp, string, string][]): string[] => { const s = x.tone || ""; return s ? table.filter(([re]) => re.test(s)).map(([, en, pt]) => `${L === "pt" ? pt : en} (${t("inferred from your tone of voice")}: "${s}")`) : []; };
  const rhythm = pick(CUES_RHYTHM), opening = pick(CUES_OPENING);
  const out: string[] = [
    `# Playbook: ${x.name || t("my channel")}`, "",
    t("Draft of the editorial rules, built only from `brief.md`. Edit freely: `praeko studio brief` never overwrites an edited playbook (it writes `playbook.md.new` instead)."), "",
    `## ${t("What the channel is")}`, x.about || todo, "",
    `## ${t("Audience")}`, x.audience ? `${t("Write for")}: ${x.audience}` : todo, "",
    `## ${t("Tone of voice")}`, x.tone ? `${t("Tone")}: ${x.tone}` : todo, "",
    `## ${t("Pace")}`, ...(rhythm.length ? rhythm.map((s) => `- ${s}`) : [todo]), "",
    `## ${t("Opening")}`, ...(opening.length ? opening.map((s) => `- ${s}`) : [todo]), "",
    `## ${t("Captions")}`, todo, "",
    `## ${t("Rules from the references")}`,
    t("References are inputs to study, never to copy: describe pace, opening and captions as RULES, never reproduce someone else's video."),
  ];
  if (x.references?.length) for (const r of x.references) out.push("", `- ${r.ref}`, `  - ${t("What the person liked")}: ${r.note || t("(not said)")}`, `  - ${todo}`);
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

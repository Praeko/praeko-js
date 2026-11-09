// The brand's cautions applied to every text of a piece: forbidden phrases (brand.json `review.forbiddenPhrases`, the prohibitions section of playbook.md and a tiny neutral default),
// names in `bannedNames`, and the AI text tics of the publish package. Plain text matching: it finds what is written, it does not judge what is meant.
import { aiTicWarnings } from "@praeko/studio-publish";
import type { Brand } from "@praeko/studio-publish";
import type { ReviewFinding, TextSource } from "./types.ts";
import { clock } from "./findings.ts";

/** Phrases no brand should promise by default (the project's CLAUDE.md: never "free forever"). Each project adds its own in brand.json or playbook.md. */
export const DEFAULT_FORBIDDEN = ["free forever", "grátis para sempre"] as const;
export type Rule = { phrase: string; source: string };
export type Rules = { phrases: Rule[]; bannedNames: string[] };

export const fold = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
/** Headings that open a list of prohibitions (English and Portuguese): "Forbidden phrases", "Never say", "Do not promise", "Cautions", "Proibido", "Nunca dizer", "Evite"… */
const PROHIBITION_HEADING = /^(forbidden|banned|prohibited|never|do not|don'?t|avoid|cautions?|red lines|things to avoid|proibid|nunca|nao (faca|diga|dizer|use|prometa)|evite|cautelas?|linhas vermelhas)/;
const QUOTES = /[“"«`]([^”"»`\n]{2,80})[”"»`]/g;

/** The phrases the playbook forbids: the bullet lines under a prohibitions heading. Quoted phrases are used as written; an unquoted bullet counts only if it is short (up to 5 words). */
export function playbookProhibitions(markdown: string): Rule[] {
  const out: Rule[] = [];
  let level = 0, heading = "", on = false;
  for (const raw of markdown.split(/\r?\n/)) {
    const h = HEADING.exec(raw);
    if (h) {
      const l = (h[1] as string).length;
      if (on && l <= level) on = false;
      if (!on && PROHIBITION_HEADING.test(fold((h[2] as string).replace(/[*_`]/g, "")).trim())) { on = true; level = l; heading = (h[2] as string).replace(/[*_`]/g, "").trim(); }
      continue;
    }
    if (!on) continue;
    const b = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(raw);
    if (!b) continue;
    const text = (b[1] as string).trim();
    if (/^todo\b/i.test(text)) continue;
    const quoted = [...text.matchAll(QUOTES)].map((m) => (m[1] as string).trim()).filter(Boolean);
    if (quoted.length) { for (const q of quoted) out.push({ phrase: q, source: `playbook.md › ${heading}` }); continue; }
    const plain = text.replace(/[*_]/g, "").replace(/[.;]$/, "");
    if (plain.split(/\s+/).length <= 5 && plain.length >= 3) out.push({ phrase: plain, source: `playbook.md › ${heading}` });
  }
  return out;
}
export function collectRules(brand: Brand, playbook: string | null): Rules {
  const phrases: Rule[] = [
    ...DEFAULT_FORBIDDEN.map((phrase) => ({ phrase: phrase as string, source: "built-in default" })),
    ...(brand.review?.forbiddenPhrases ?? []).filter((p) => typeof p === "string" && p.trim()).map((phrase) => ({ phrase: phrase.trim(), source: "brand.json › review.forbiddenPhrases" })),
    ...(playbook ? playbookProhibitions(playbook) : []),
  ];
  const seen = new Set<string>(), unique = phrases.filter((p) => { const k = fold(p.phrase); if (seen.has(k)) return false; seen.add(k); return true; });
  return { phrases: unique, bannedNames: (brand.bannedNames ?? []).filter((n) => typeof n === "string" && n.trim()) };
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const bounded = (phrase: string): RegExp => new RegExp(`(?<![a-z0-9])${escape(fold(phrase).trim()).replace(/\s+/g, "\\s+")}(?![a-z0-9])`, "g");
const around = (text: string, i: number, len: number): string => { const a = Math.max(0, i - 25), b = Math.min(text.length, i + len + 25); return `${a > 0 ? "…" : ""}${text.slice(a, b).replace(/\s+/g, " ")}${b < text.length ? "…" : ""}`; };

/** Applies the rules to every source. Sources are scanned in order; a `dedupe` source skips a phrase already found in an earlier one. */
export function scanTexts(sources: TextSource[], rules: Rules, brand: Brand): ReviewFinding[] {
  const out: ReviewFinding[] = [], seen = new Set<string>();
  for (const src of sources) {
    const folded = fold(src.text);
    const hit = (severity: ReviewFinding["severity"], code: string, key: string, message: string, i: number, len: number, rule: string): void => {
      if (src.dedupe && seen.has(`${code}|${key}`)) return;
      seen.add(`${code}|${key}`);
      const time = src.timeAt ? src.timeAt(i) : src.time ?? null;
      out.push({ severity, time: time === null ? null : +time.toFixed(2), code, message, evidence: `${src.source}${time !== null ? ` at ${clock(time)}` : ""}: "${around(src.text, i, len)}" (${rule})`, ...(src.slide !== undefined ? { slide: src.slide } : {}) });
    };
    for (const r of rules.phrases) for (const m of folded.matchAll(bounded(r.phrase))) { hit("warning", "forbidden_phrase", fold(r.phrase), `forbidden phrase "${r.phrase}"`, m.index ?? 0, m[0].length, r.source); break; }
    for (const name of rules.bannedNames) for (const m of folded.matchAll(bounded(name))) { hit("error", "banned_name", fold(name), "a banned name appears (bannedNames in brand.json)", m.index ?? 0, m[0].length, "brand.json › bannedNames"); break; }
    for (const tic of aiTicWarnings(brand, src.text)) {
      const key = `${src.source}|${tic}`;
      if (seen.has(`ai_text_tic|${key}`)) continue;
      seen.add(`ai_text_tic|${key}`);
      out.push({ severity: "warning", time: src.time ?? null, code: "ai_text_tic", message: `AI text tic: ${tic}`, evidence: `${src.source}: "${src.text.replace(/\s+/g, " ").trim().slice(0, 100)}"`, ...(src.slide !== undefined ? { slide: src.slide } : {}) });
    }
  }
  return out;
}

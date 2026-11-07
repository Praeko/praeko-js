// Output language. English strings in the code are the source; `--lang pt` / PRAEKO_LANG=pt translates the common ones through
// a small dictionary (i18n-pt.ts) when printing, and anything without a translation falls back to English.
import { PT } from "./i18n-pt.ts";

let forced: "en" | "pt" | null = null;
export const setLang = (l: string): void => { forced = l === "pt" ? "pt" : l === "en" ? "en" : null; };
/** "en" (default) or "pt". Order: --lang, then PRAEKO_LANG. */
export const lang = (): "en" | "pt" => forced ?? (/^pt/i.test(process.env.PRAEKO_LANG || "") ? "pt" : "en");

/** Translates one message (possibly multi-line) to a language. */
export function translate(msg: string, l: "en" | "pt" = lang()): string {
  if (l !== "pt" || typeof msg !== "string") return msg;
  const one = (text: string): string | null => { for (const [re, to] of PT) if (re.test(text)) return text.replace(re, to); return null; };
  // a leading marker (✓ ⚠ ✗ ·) or indentation is kept; the dictionary entries match the text after it
  return msg.split("\n").map((line) => { const whole = one(line); if (whole !== null) return whole; const m = line.match(/^(\s*(?:[⚠✗✓·☐]\s+)?)(.*)$/)!; const rest = one(m[2]!); return rest === null ? line : m[1] + rest; }).join("\n");
}

/** In pt mode every string printed with console.log/error goes through the dictionary (covers the helper packages' messages too). */
export function installTranslation(): void {
  if (lang() !== "pt" || (console as any).__praekoPt) return;
  for (const k of ["log", "error", "warn"] as const) { const orig = console[k].bind(console); console[k] = (...a: unknown[]) => orig(...a.map((x) => (typeof x === "string" ? translate(x) : x))); }
  (console as any).__praekoPt = true;
}

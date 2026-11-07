// Alignment to the script: uses the SPELLING of the script with the TIMINGS of the transcription.
// The transcription (Scribe or Whisper) misspells technical terms ("Sbuild", "0,40"); the script is the right text. Numbers stay as the
// transcription wrote them (digits read better in captions) and are left out of the pairing. The spelled-out number words are Portuguese
// because the narration language is Portuguese.
import type { Word } from "./estimated.ts";

const NUM = new Set("zero um uma dois duas três tres quatro cinco seis sete oito nove dez onze doze treze catorze quatorze quinze dezesseis dezessete dezoito dezenove vinte trinta quarenta cinquenta sessenta setenta oitenta noventa cem cento duzentos duzentas trezentos trezentas quatrocentos quatrocentas quinhentos quinhentas seiscentos seiscentas setecentos setecentas oitocentos oitocentas novecentos novecentas mil milhão milhões bilhão bilhões meio meia primeiro primeira".split(" "));
const norm = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const hasDigit = (s: string): boolean => /\d/.test(s);

/** Strips [tags], splits into words and drops runs of spelled-out numbers ("quatro mil e quinhentos"). */
export function scriptWords(script: string): string[] {
  const toks = script.replace(/\[[^\]]*\]/g, " ").split(/\s+/).filter(Boolean);
  const isNum = (t: string) => NUM.has(norm(t));
  const out: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i] as string, n = norm(t);
    if (isNum(t)) continue;
    // "e" between two spelled-out numbers is part of the number
    if (n === "e" && i > 0 && i < toks.length - 1 && isNum(toks[i - 1] as string) && isNum(toks[i + 1] as string)) continue;
    out.push(t);
  }
  return out;
}

const lev = (a: string, b: string): number => {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min((prev[j] as number) + 1, (cur[j - 1] as number) + 1, (prev[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n] as number;
};
const points = (a: string, b: string): number => (a === b ? 3 : a.length > 3 && b.length > 3 && lev(a, b) <= Math.max(2, Math.floor(Math.max(a.length, b.length) / 3)) ? 1 : -2);

type Fixable = Word & { _fix?: boolean; _orig?: string };

/** `words`: [{ t, a, b }] from the transcription; `script`: the original text. Returns `{ words, replaced, corrected }`. */
export function alignToScript(words: Word[], script: string): { words: Word[]; replaced: number; corrected: [string, string, number][] } {
  const S = scriptWords(script), sn = S.map(norm);
  const idxA = words.map((_, i) => i).filter((i) => !hasDigit((words[i] as Word).t));
  const an = idxA.map((i) => norm((words[i] as Word).t));
  const n = an.length, m = sn.length, GAP = -1;
  const D: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) (D[i] as number[])[0] = i * GAP;
  for (let j = 1; j <= m; j++) (D[0] as number[])[j] = j * GAP;
  const d = (i: number, j: number): number => (D[i] as number[])[j] as number;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) (D[i] as number[])[j] = Math.max(d(i - 1, j - 1) + points(an[i - 1] as string, sn[j - 1] as string), d(i - 1, j) + GAP, d(i, j - 1) + GAP);
  const pairs = new Map<number, string>();
  for (let i = n, j = m; i > 0 && j > 0;) {
    const p = points(an[i - 1] as string, sn[j - 1] as string);
    if (d(i, j) === d(i - 1, j - 1) + p) { if (p > 0) pairs.set(idxA[i - 1] as number, S[j - 1] as string); i--; j--; }
    else if (d(i, j) === d(i - 1, j) + GAP) i--;
    else j--;
  }
  let replaced = 0;
  const corrected: [string, string, number][] = [];
  const out: Fixable[] = words.map((p, i) => {
    const s = pairs.get(i);
    if (!s) return p;
    const a = norm(p.t), b = norm(s);
    const clean0 = s.replace(/^["'(]+|[.,!?:;"')]+$/g, "");
    if (a === b) {                                            // same word: only fix accents (ninguem → ninguém); the rest of the spelling stays as the transcription wrote it
      const bare = (x: string) => x.replace(/^["'(]+|[.,!?:;"')]+$/g, "").toLowerCase();
      if (bare(p.t) === bare(clean0)) return p;
      const tail0 = (p.t.match(/[.,!?:;"')]+$/) || [""])[0];
      const cap = /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(p.t) ? (clean0[0] as string).toUpperCase() + clean0.slice(1) : clean0.toLowerCase();
      replaced++; corrected.push([p.t, cap + tail0, p.a]);
      return { ...p, t: cap + tail0 };
    }
    const dist = lev(a, b);
    if (a.length < 5 || dist < 1 || dist > 2 || /[\d-]/.test(s)) return p; // only near-misses (esbuild/Sbuild); the rest is left to the brand's caption fixes
    const tail = (p.t.match(/[.,!?:;"')]+$/) || [""])[0];
    const clean = s.replace(/^["'(]+|[.,!?:;"')]+$/g, "");
    replaced++; corrected.push([p.t, clean + tail, p.a]);
    return { ...p, t: clean + tail, _fix: true, _orig: p.t };
  });
  // short unpaired fragment before a corrected word ("S" + "-Build" → esbuild): merge into the right word
  const merged: Fixable[] = [];
  out.forEach((p, i) => {
    const prev = merged[merged.length - 1];
    if (p._fix && prev && !prev._fix && !pairs.has(i - 1) && norm(prev.t).length <= 3 && lev(norm(prev.t) + norm(p._orig as string), norm(p.t)) <= 1) { prev.t = p.t; prev.b = p.b; prev._fix = true; return; }
    merged.push({ ...p });
  });
  const clean = merged.map(({ _fix, _orig, ...r }) => r);
  return { words: clean, replaced, corrected };
}

/** Whisper sometimes splits "4.500" into "4" and ".500": joins neighboring numeric fragments. */
export function joinNumbers(words: Word[]): Word[] {
  const out: Word[] = [];
  for (const p of words) {
    const prev = out[out.length - 1];
    if (prev && /\d$/.test(prev.t) && /^[.,]\d/.test(p.t)) { prev.t += p.t; prev.b = p.b; continue; }
    out.push({ ...p });
  }
  return out;
}

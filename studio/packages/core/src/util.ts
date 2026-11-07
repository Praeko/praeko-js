import { Easing, interpolate } from "remotion";
import type { Word } from "./word.ts";

export const FPS = 30;
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const EO = Easing.bezier(0.16, 1, 0.3, 1);
/** 0 -> 1 from instant `q` (s), with a soft ease-out. */
export const appear = (t: number, q: number, d = 0.35) => interpolate(t, [q, q + d], [0, 1], { ...clamp, easing: EO });
export const ramp = (t: number, a: number, b: number) => interpolate(t, [a, b], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
export const pop = (t: number, q: number) => interpolate(t, [q, q + 0.18, q + 0.4], [0.6, 1.14, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
/** Number with "." as thousands separator (pt-BR style): 13500 -> "13.500". */
export const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
/**
 * Phrase anchors: `makeAt(words, starts)(i)(phrase, n)` returns the LOCAL instant (s since the start of scene i) at which the phrase
 * starts in the voice. Fails loudly if the phrase does not exist (the aligner sometimes writes numbers as digits).
 */
export const makeAt = (P: Word[], S: number[]) => {
  const W = P.map((p) => norm(p.t));
  return (i: number) => (phrase: string, nth = 0): number => {
    const f = phrase.split(/\s+/).map(norm).filter(Boolean);
    let c = 0;
    for (let k = 0; k <= W.length - f.length; k++) {
      if (f.every((w, j) => W[k + j] === w)) { if (c === nth) return P[k].a - S[i]; c++; }
    }
    throw new Error("phrase not found: " + phrase);
  };
};


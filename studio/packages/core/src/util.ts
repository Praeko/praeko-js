import { Easing, interpolate } from "remotion";
import { Palavra } from "./palavra";

export const FPS = 30;
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const EO = Easing.bezier(0.16, 1, 0.3, 1);
/** 0 → 1 a partir do instante `q` (s), com saída suave. */
export const surge = (t: number, q: number, d = 0.35) => interpolate(t, [q, q + d], [0, 1], { ...clamp, easing: EO });
export const ramp = (t: number, a: number, b: number) => interpolate(t, [a, b], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
export const pop = (t: number, q: number) => interpolate(t, [q, q + 0.18, q + 0.4], [0.6, 1.14, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
export const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
/**
 * Âncoras por frase: `mkAt(palavras, inicios)(i)(frase, n)` devolve o instante LOCAL (s, desde o início da cena i) em que
 * a frase começa na voz. Falha alto se a frase não existe (o Scribe às vezes escreve número em dígitos).
 */
export const mkAt = (P: Palavra[], S: number[]) => {
  const W = P.map((p) => norm(p.t));
  return (i: number) => (frase: string, nth = 0): number => {
    const f = frase.split(/\s+/).map(norm).filter(Boolean);
    let c = 0;
    for (let k = 0; k <= W.length - f.length; k++) {
      if (f.every((w, j) => W[k + j] === w)) { if (c === nth) return P[k].a - S[i]; c++; }
    }
    throw new Error("frase não achada: " + frase);
  };
};

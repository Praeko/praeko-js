// Text that does not fit: single-line items (box, line, big, code, row) shrink until they fit the width they have.
// Deterministic: the measure is the browser's layout (same fonts, same sizes → same result), done in a layout effect before the frame is
// painted, and it only ever shrinks (no oscillation). An item that already fits is untouched (scale 1), so nothing changes for it.
import { useLayoutEffect, useRef, useState } from "react";

/** Smallest scale an item is shrunk to; below it the `check` warns that the text is too long for the skin. */
export const FIT_MIN = 0.45;
/** The next scale given the space needed and the space available (two decimals, rounded down so the result fits). */
export const nextFit = (k: number, need: number, avail: number): number => (need > avail + 0.5 && avail > 0 ? Math.max(FIT_MIN, Math.floor(k * (avail / need) * 100) / 100) : k);

const padX = (el: HTMLElement): number => { const s = getComputedStyle(el); return (parseFloat(s.paddingLeft) || 0) + (parseFloat(s.paddingRight) || 0); };

/**
 * For an element whose text runs on one line (`white-space: nowrap`/`pre`) inside its own box: returns the font-size factor that makes the
 * text fit the box. Apply it to the font size of the element.
 */
export function useFitText<E extends HTMLElement>(): [React.RefObject<E | null>, number] {
  const ref = useRef<E | null>(null), steps = useRef(0);
  const [k, setK] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    // a few steps converge (the first one is proportional); the cap keeps an overflow that does not scale with the text (a decoration
    // wider than the box) from shrinking forever
    if (!el || steps.current >= MAX_STEPS) return;
    const p = padX(el), nk = nextFit(k, el.scrollWidth - p, el.clientWidth - p);
    if (nk < k) { steps.current++; setK(nk); }
  });
  return [ref, k];
}
/** Re-measures per item and mount (well under React's limit of nested updates). */
export const MAX_STEPS = 4;

/**
 * For a centered flex row: the scale (CSS transform, around the center) that makes its children fit the row's width. A transform does not
 * change the layout, so the children are measured at their natural size.
 */
export function useFitRow<E extends HTMLElement>(enabled = true): [React.RefObject<E | null>, number] {
  const ref = useRef<E | null>(null);
  const [k, setK] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const kids = Array.from(el.children) as HTMLElement[];
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const need = kids.reduce((a, c) => a + c.offsetWidth, 0) + Math.max(0, kids.length - 1) * gap;
    const nk = nextFit(1, need, el.clientWidth - padX(el));
    if (nk < k) setK(nk);
  });
  return [ref, k];
}

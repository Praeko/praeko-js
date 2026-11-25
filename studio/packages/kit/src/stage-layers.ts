// What the 3D stage draws around the slab, as data (pure: no three.js, no React), so it can be tested without a GPU.
import type { SkinStage } from "@praeko/studio-core";

export type StageLayers = {
  /** the canvas is transparent (alpha) and has no background color: the `base` video shows through */
  transparent: boolean;
  /** linear fog [near, far]; null = none */
  fog: [number, number] | null;
  /** sweep = floor and back wall; grid = glowing grid floor; shadow = an invisible floor that only receives the soft shadow; none */
  floor: "sweep" | "grid" | "shadow" | "none";
  /** the striped synthwave sun on the horizon */
  sun: boolean;
};

/**
 * The layers of the stage. Without a `base` video: exactly the skin's (background color, fog, floor and wall or grid, sun). Over the
 * person's own video: a transparent canvas with only the slab, the props and their shadow; no floor, wall, grid, sun nor fog (the fog
 * color is the skin background, which is no longer seen). The shadow falls on an invisible plane when the skin casts shadows.
 */
export function stageLayers(st: SkinStage, overVideo: boolean): StageLayers {
  if (!overVideo) return { transparent: false, fog: st.fog, floor: st.floor, sun: !!st.sun };
  return { transparent: true, fog: null, floor: st.shadows ? "shadow" : "none", sun: false };
}

// Scene timing of the declarative Short (pure: tested in Node).

/** What `sceneWindows` needs of an episode spec. */
export type SceneTiming = { scenes: { start: number; end?: number }[]; outro?: { a: number }; durS: number; base?: unknown };

/**
 * Scene windows: [a, b) of each scene's Sequence and how long its panel stays. Without a base video the scene unmounts 0.1 s before the next one
 * (the kit's look since 0.1); with a base video nothing unmounts between scenes (the video is the background): each scene runs until the next
 * one starts. Without an outro the last scene runs to the end of the episode.
 */
export function sceneWindows(spec: SceneTiming): { a: number; b: number; panelDur: number }[] {
  const S = spec.scenes.map((c) => c.start), endAt = spec.outro?.a ?? spec.durS;
  const endOf = (i: number) => spec.scenes[i]!.end ?? (i + 1 < S.length ? S[i + 1]! : endAt);
  return spec.scenes.map((c, i) => {
    const next = i + 1 < S.length ? S[i + 1]! : endOf(i);
    return { a: c.start, b: spec.base ? next : next - 0.1, panelDur: endOf(i) - c.start };
  });
}

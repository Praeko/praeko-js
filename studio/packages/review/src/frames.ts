// Which moments of a video get a JPEG: dense at the opening (it decides retention), one per scene change, one every N seconds, and the last frame; capped.
import type { FrameReason, SceneInfo } from "./types.ts";

export const FRAME_DEFAULTS = { every: 2, maxFrames: 24, width: 540, minGap: 0.3, openingTimes: [0, 0.5, 1, 1.5, 2], sceneOffset: 0.25, lastOffset: 0.1 } as const;
export type PickedFrame = { time: number; scene: number | null; reason: FrameReason };

const round1 = (t: number): number => Math.round(t * 10) / 10;
/** File name of a frame: the time in the name, `0002.0s.jpg`. */
export const frameName = (time: number): string => { const t = round1(time), s = Math.floor(t + 1e-9); return `${String(s).padStart(4, "0")}.${Math.round((t - s) * 10)}s.jpg`; };
const sceneAt = (scenes: SceneInfo[], t: number): number | null => { for (const s of scenes) if (t >= s.start - 1e-9 && t < s.end - 1e-9) return s.n; const last = scenes[scenes.length - 1]; return last && t >= last.end - 1e-9 ? last.n : null; };

export function pickFrames({ duration, scenes, every = FRAME_DEFAULTS.every, maxFrames = FRAME_DEFAULTS.maxFrames }: { duration: number; scenes: SceneInfo[]; every?: number; maxFrames?: number }): PickedFrame[] {
  const limit = Math.max(0, duration - FRAME_DEFAULTS.lastOffset), kept: { time: number; reason: FrameReason }[] = [];
  const add = (t: number, reason: FrameReason): void => {
    const time = round1(Math.min(Math.max(0, t), limit));
    if (kept.some((k) => Math.abs(k.time - time) < FRAME_DEFAULTS.minGap - 1e-9)) return;
    kept.push({ time, reason });
  };
  add(limit, "last");
  for (const t of FRAME_DEFAULTS.openingTimes) if (t <= limit) add(t, "opening");
  for (const s of scenes) if (s.start > 0.01 && s.kind !== "outro") add(Math.min(s.start + FRAME_DEFAULTS.sceneOffset, Math.max(s.start, s.end - 0.05)), "scene");
  for (const s of scenes) if (s.kind === "outro" && s.start > 0.01) add(Math.min(s.start + FRAME_DEFAULTS.sceneOffset, Math.max(s.start, s.end - 0.05)), "scene");
  for (let t = every; t <= limit + 1e-9; t += every) add(t, "interval");
  const order: FrameReason[] = ["interval", "scene", "opening"];
  while (kept.length > Math.max(1, maxFrames)) {
    const klass = order.find((r) => kept.some((k) => k.reason === r));
    if (!klass) break;
    const all = [...kept].sort((a, b) => a.time - b.time);
    let worst: { time: number; reason: FrameReason } | null = null, gap = Infinity;
    for (const k of all) {
      if (k.reason !== klass || (klass === "opening" && k.time === 0)) continue;
      const i = all.indexOf(k), before = all[i - 1], after = all[i + 1];
      const g = Math.min(before ? k.time - before.time : Infinity, after ? after.time - k.time : Infinity);
      if (g < gap) { gap = g; worst = k; }
    }
    if (!worst) break;
    kept.splice(kept.indexOf(worst), 1);
  }
  return kept.sort((a, b) => a.time - b.time).map((k) => ({ ...k, scene: sceneAt(scenes, k.time) }));
}

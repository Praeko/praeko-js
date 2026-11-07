// Cover on the first frames: the networks (and Buffer) do not take a separately uploaded cover, only a frame of the video itself.
// Pastes the cover image over the first `n` frames (without changing duration, audio or sync), so the thumbnail becomes frame 0.
import { spawnSync } from "node:child_process";

export type Exec = (cmd: string, args: string[], opts?: Record<string, unknown>) => { status: number | null; stdout?: any };
export type VideoInfo = { width: number; height: number; fps: number; duration: number };
const defaultExec = spawnSync as unknown as Exec;

const num = (s: string) => { const [a = 0, b] = String(s).split("/").map(Number); return b ? a / b : a; };

/** { width, height, fps, duration } of a video file (ffprobe). */
export function probe(file: string, exec: Exec = defaultExec): VideoInfo {
  const r = exec("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-show_entries", "format=duration", "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffprobe failed on ${file}`);
  const j = JSON.parse(r.stdout), s = j.streams[0];
  return { width: s.width, height: s.height, fps: num(s.r_frame_rate), duration: +j.format.duration };
}
export function imageSize(file: string, exec: Exec = defaultExec): { width: number; height: number } {
  const r = exec("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffprobe failed on ${file}`);
  const s = JSON.parse(r.stdout).streams[0];
  return { width: s.width, height: s.height };
}
/** The cover works if it has the same aspect ratio as the video (±2%). */
export const sameAspect = (a: { width: number; height: number }, b: { width: number; height: number }): boolean => Math.abs(a.width / a.height - b.width / b.height) < 0.02 * (b.width / b.height);

/** ffmpeg arguments (pure, testable). */
export function argsFfmpeg({ video, cover, output, width, height, frames = 2, duration = 3600, fps = 30 }: { video: string; cover: string; output: string; width: number; height: number; frames?: number; duration?: number; fps?: number }): string[] {
  const filter = `[1:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,format=yuv420p[c];[0:v][c]overlay=enable='lt(n,${frames})':format=auto,format=yuv420p[v]`;
  return ["-v", "error", "-y", "-i", video, "-loop", "1", "-framerate", String(fps), "-t", String(duration + 1), "-i", cover, "-filter_complex", filter, "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-c:a", "copy", "-movflags", "+faststart", "-t", String(duration), output];
}

/** Makes the video with the cover on the first frames. Returns { output, frames }. */
export function embedCover({ video, cover, output, frames = 2, exec = defaultExec }: { video: string; cover: string; output: string; frames?: number; exec?: Exec }): { output: string; frames: number } {
  const v = probe(video, exec), c = imageSize(cover, exec);
  if (!sameAspect(c, v)) throw new Error(`the cover (${c.width}x${c.height}) does not have the video's aspect ratio (${v.width}x${v.height})`);
  const r = exec("ffmpeg", argsFfmpeg({ video, cover, output, width: v.width, height: v.height, frames, duration: v.duration, fps: v.fps }), { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg failed to paste the cover");
  const d = probe(output, exec);
  if (Math.abs(d.duration - v.duration) > 0.1) throw new Error(`the duration changed (${v.duration.toFixed(2)} s → ${d.duration.toFixed(2)} s); aborted`);
  return { output, frames };
}

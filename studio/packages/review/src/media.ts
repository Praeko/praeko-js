// ffmpeg/ffprobe helpers of the review package (the same tools `praeko studio doctor` already requires): gray thumbnails to measure, silences, one JPEG per key moment.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Silence } from "./types.ts";

const ff = (args: string[], maxBuffer = 1 << 28) => spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...args], { maxBuffer });

export type Gray = { fps: number; width: number; height: number; frames: Uint8Array[] };
/** Every `1/fps` seconds of the video as a small gray image (to measure content and change; never shown to anyone). */
export function grayFrames(video: string, { fps, width, sourceWidth, sourceHeight }: { fps: number; width: number; sourceWidth: number; sourceHeight: number }): Gray {
  const height = Math.max(2, Math.round((width * sourceHeight) / sourceWidth));
  const r = ff(["-v", "error", "-i", video, "-vf", `fps=${fps},scale=${width}:${height},format=gray`, "-f", "rawvideo", "-"]);
  if (r.status !== 0 && !(r.stdout as Buffer).length) throw new Error("could not sample the video frames: " + String(r.stderr).slice(0, 200));
  const buf = r.stdout as Buffer, size = width * height, frames: Uint8Array[] = [];
  for (let o = 0; o + size <= buf.length; o += size) frames.push(buf.subarray(o, o + size));
  return { fps, width, height, frames };
}

/** Share of pixels that differ from the frame's own background (the median gray) by more than `delta`: independent of a dark or a light brand background. */
export function contentFraction(frame: Uint8Array, delta = 30): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of frame) hist[v] = (hist[v] as number) + 1;
  let acc = 0, median = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i] as number; if (acc >= frame.length / 2) { median = i; break; } }
  let n = 0;
  for (const v of frame) if (Math.abs(v - median) > delta) n++;
  return n / frame.length;
}
/** Mean absolute difference (0 to 255) between two gray frames of the same size. */
export function frameDifference(a: Uint8Array, b: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs((a[i] as number) - (b[i] as number));
  return s / a.length;
}

export function hasAudio(file: string): boolean {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_type", "-of", "csv=p=0", file], { encoding: "utf8" });
  return r.status === 0 && /audio/.test(String(r.stdout));
}

/** Silences of at least `minimum` seconds (`silencedetect`, -40 dB). A silence that runs to the end of the file ends at `duration`. */
export function silences(file: string, duration: number, { minimum = 1, noise = -40 }: { minimum?: number; noise?: number } = {}): Silence[] {
  const r = ff(["-i", file, "-af", `silencedetect=noise=${noise}dB:d=${minimum}`, "-vn", "-f", "null", "-"]);
  const out: Silence[] = [];
  let open: number | null = null;
  for (const line of String(r.stderr).split("\n")) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line), e = /silence_end:\s*(-?[\d.]+)/.exec(line);
    if (s) open = Math.max(0, +(s[1] as string));
    if (e && open !== null) { const end = +(e[1] as string); out.push({ start: +open.toFixed(2), end: +end.toFixed(2), duration: +(end - open).toFixed(2) }); open = null; }
  }
  if (open !== null) out.push({ start: +open.toFixed(2), end: +duration.toFixed(2), duration: +(duration - open).toFixed(2) });
  return out;
}

/** One JPEG at `time` seconds, at most `width` px wide. A time past the last frame (the clip duration is a little longer than its last picture) falls back to the last frame of the file. */
export function extractFrame(video: string, time: number, output: string, width: number): void {
  mkdirSync(dirname(output), { recursive: true });
  const vf = `scale='min(${width},iw)':-2`;
  let r = ff(["-v", "error", "-y", "-ss", time.toFixed(3), "-i", video, "-frames:v", "1", "-vf", vf, "-q:v", "5", "-strict", "unofficial", output]);
  if (!existsSync(output)) r = ff(["-v", "error", "-y", "-sseof", "-0.5", "-i", video, "-vf", vf, "-q:v", "5", "-strict", "unofficial", "-update", "1", output]);
  if (!existsSync(output)) throw new Error(`could not extract the frame at ${time.toFixed(1)} s: ` + String(r.stderr).slice(0, 200));
}
/** A slide (or any image) reduced to at most `width` px wide, as JPEG. */
export function reduceImage(input: string, output: string, width: number): void {
  mkdirSync(dirname(output), { recursive: true });
  const r = ff(["-v", "error", "-y", "-i", input, "-frames:v", "1", "-vf", `scale='min(${width},iw)':-2`, "-q:v", "5", "-strict", "unofficial", output]);
  if (r.status !== 0 || !existsSync(output)) throw new Error(`could not reduce ${input}: ` + String(r.stderr).slice(0, 200));
}
/** The image as `width` px wide gray pixels (to measure it); null if it cannot be decoded. */
export function grayImage(input: string, width = 96): { frame: Uint8Array; width: number; height: number } | null {
  const r = ff(["-v", "error", "-i", input, "-frames:v", "1", "-vf", `scale=${width}:-2,format=gray`, "-f", "rawvideo", "-"]);
  const buf = r.stdout as Buffer, height = Math.floor(buf.length / width);
  return r.status === 0 && height > 0 ? { frame: buf.subarray(0, width * height), width, height } : null;
}
/** Width and height of an image (ffprobe), or null. */
export function imageSize(file: string): { width: number; height: number } | null {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { encoding: "utf8" });
  const [w, h] = String(r.stdout).trim().split(",").map(Number);
  return r.status === 0 && w && h ? { width: w, height: h } : null;
}

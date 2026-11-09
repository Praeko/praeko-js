// Shapes of the review package (`praeko studio review`): everything here is plain data, so the checks can be tested without a video.
export type Severity = "error" | "warning" | "info";
/** One measured fact. `evidence` states what was measured; nothing here is an opinion and nothing comes from a language model. */
export type ReviewFinding = { severity: Severity; time: number | null; code: string; message: string; evidence: string; slide?: number };
export type Word = { t: string; a: number; b: number };
export type SceneKind = "scene" | "outro" | "endcard";
export type SceneInfo = { n: number; kind: SceneKind; title?: string; start: number; end: number; duration: number; text: string[] };
export type FrameReason = "opening" | "scene" | "interval" | "last";
export type FrameInfo = { file: string; time: number; scene: number | null; reason: FrameReason };
/** A piece of text the rules are applied to. `timeAt` maps a character index to a second (captions); `dedupe` drops a hit already found elsewhere (the script, whose phrases are also in the captions). */
export type TextSource = { source: string; text: string; time?: number | null; slide?: number; timeAt?: (index: number) => number; dedupe?: boolean };
/** A text that does not fit where it is placed (computed from the compiled spec by the CLI, which knows the kit's layout). */
export type LayoutIssue = { time: number | null; slide?: number; message: string; evidence: string };
export type Silence = { start: number; end: number; duration: number };
export type SlideInfo = { n: number; file: string; frame: string | null; width: number | null; height: number | null; bytes: number; rendered: boolean; alt: string; text: string[]; contentFraction: number | null };
export type ContrastPair = { pair: string; foreground: string; background: string; ratio: number; required: number; ok: boolean };
export type ReviewKind = "video" | "image" | "carousel";
export type ReviewFormat = "short" | "long" | "image" | "carousel";

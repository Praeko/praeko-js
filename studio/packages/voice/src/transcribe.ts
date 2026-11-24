// Transcription of any audio or video file, with engine fallback (design: docs/studio-transcricao-plano.md).
// Order: voicestudio -> whisper-local -> scribe. Scribe (cloud) only with `allowCloud` AND a key: the audio never leaves the machine otherwise.
// A engine failing (down, 429, timeout, missing binary or model, bad output) moves on; a bad INPUT (corrupt, no audio) stops at once.
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { getKey, loadConfig } from "./config.ts";
import type { VoicesConfig } from "./config.ts";
import { createVoiceStudio } from "./providers/voicestudio.ts";
import type { Word } from "./estimated.ts";

export type Attempt = { engine: string; ok: boolean; reason?: string };
export type TranscriptResult = { engine: string; engineVersion: string; language: string; durationSec: number; words: Word[]; text: string; attempts: Attempt[] };
export type EngineOutput = { words: Word[]; text?: string; language?: string; version?: string };
export type EngineRun = { wav: string; language: string; durationSec: number; signal: AbortSignal };
/** `available()` returns null when the engine can run, or the reason it cannot (that reason goes in `attempts`). */
export type TranscribeEngine = { name: string; cloud?: boolean; available(): Promise<string | null>; run(a: EngineRun): Promise<EngineOutput> };

export const DEFAULT_ENGINES = ["voicestudio", "whisper-local", "scribe"];
export const DEFAULT_MODEL = "large-v3-turbo-q5_0";
/** faster-whisper has its own model names (it cannot read the ggml quantized file). */
const FASTER_MODEL = "large-v3-turbo";
export const modelDir = (): string => join(process.env.PRAEKO_CONFIG_DIR || join(homedir(), ".config", "praeko"), "models");

/** The input is the problem (corrupt, no audio, unreadable): another engine would not help. */
export class InputError extends Error {}
/** Every allowed engine failed (or none was allowed). `attempts` never holds a key or a path. */
export class TranscribeError extends Error { attempts: Attempt[]; constructor(message: string, attempts: Attempt[]) { super(message); this.attempts = attempts; } }

const FFMPEG_HELP = "ffmpeg not found on PATH: install it (macOS: `brew install ffmpeg`; Debian/Ubuntu: `sudo apt install ffmpeg`; Windows: `winget install ffmpeg`) and try again";

/** Strips paths and anything key-like from an error message before it goes in `attempts`. */
export function clean(m: unknown): string {
  return String(m instanceof Error ? m.message : m).replace(/(?:[A-Za-z]:)?(?:[\\/][^\s"'`:;,)]+){2,}/g, "<path>").replace(/\b(?:sk|xi|key|tok)[-_][A-Za-z0-9_-]{8,}|[A-Za-z0-9_-]{32,}/g, "<redacted>").replace(/\s+/g, " ").trim().slice(0, 160);
}

const norm2 = (l: string): string => ({ por: "pt", eng: "en", spa: "es" } as Record<string, string>)[l.toLowerCase()] ?? l.toLowerCase().slice(0, 2);

// ---------- quality gate ----------
/** Whisper "answers" even when it is wrong, so the output is judged before it is accepted. Returns the reason to reject, or null. */
export function qualityGate(o: { words: Word[]; text?: string; language?: string }, durationSec: number, requested: string): string | null {
  const w = o.words;
  if (!w.length) return "empty output";
  if (durationSec >= 5) {
    const wpm = w.length / (durationSec / 60);
    if (wpm < 40 || wpm > 300) return `${Math.round(wpm)} words per minute (expected 40 to 300)`;
  }
  const zero = w.filter((p) => !(p.b > p.a)).length;
  if (w.length >= 5 && zero / w.length > 0.3) return `${zero} of ${w.length} words with zero duration`;
  if (requested !== "auto" && o.language && norm2(o.language) !== norm2(requested)) return `detected language ${norm2(o.language)}, asked ${norm2(requested)}`;
  const k = w.map((p) => p.t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""));
  for (let n = 1; n <= 4; n++) {
    let run = 1;
    for (let i = n; i + n <= k.length; i++) {
      if (k.slice(i, i + n).join(" ") === k.slice(i - n, i).join(" ")) { run++; if (run >= (n === 1 ? 6 : 4)) return "repeating loop in the text"; i += n - 1; } else run = 1;
    }
  }
  return null;
}

// ---------- audio extraction ----------
export type Prepared = { wav: string; durationSec: number; cleanup(): void };
/** ffmpeg -> 16 kHz mono wav. Missing ffmpeg, corrupt file or no audio track: InputError (stops; no engine can fix it). */
export function prepareAudio(file: string): Prepared {
  if (!existsSync(file)) throw new InputError("file not found");
  const run = (cmd: string, args: string[]): string => {
    try { return execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] }).toString(); }
    catch (e: any) { if (e?.code === "ENOENT") throw new InputError(FFMPEG_HELP); throw new InputError(`unreadable input or no audio track (${clean(String(e?.stderr || "").trim().split("\n").pop() || e.message)})`); }
  };
  const streams = run("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", file]).trim();
  if (!streams) throw new InputError("the file has no audio track");
  const dir = mkdtempSync(join(tmpdir(), "praeko-transcribe-"));
  const wav = join(dir, "audio.wav");
  try { run("ffmpeg", ["-v", "error", "-y", "-i", file, "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", wav]); } catch (e) { rmSync(dir, { recursive: true, force: true }); throw e; }
  const d = +run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav]).trim();
  if (!(d > 0)) { rmSync(dir, { recursive: true, force: true }); throw new InputError("the file has no audio (zero duration)"); }
  return { wav, durationSec: d, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// ---------- engines ----------
const onPath = (name: string): string | null => { for (const d of (process.env.PATH || "").split(delimiter)) { const f = join(d, name); if (d && existsSync(f)) return f; } return null; };
const execP = (cmd: string, args: string[], signal: AbortSignal): Promise<string> => new Promise((ok, no) => execFile(cmd, args, { signal, maxBuffer: 64 * 1024 * 1024 }, (e, out) => (e ? no(e) : ok(String(out)))));

/** whisper.cpp `-oj` (with `-ml 1 -sow`: one word per segment) -> words. */
export function parseWhisperCppJson(json: any): EngineOutput {
  const words: Word[] = [];
  for (const s of json?.transcription ?? []) {
    const t = String(s.text ?? "").trim();
    if (!t || /^\[.*\]$/.test(t)) continue;
    const a = +(Number(s.offsets?.from ?? 0) / 1000).toFixed(2), b = +(Number(s.offsets?.to ?? 0) / 1000).toFixed(2);
    // punctuation arrives as its own segment: glue it to the previous word
    if (/^[.,!?;:…]+$/.test(t) && words.length) { const last = words[words.length - 1]!; last.t += t; last.b = Math.max(last.b, b); continue; }
    words.push({ t, a, b });
  }
  return { words, text: words.map((p) => p.t).join(" "), language: json?.result?.language };
}

const PY = `import sys, json\nfrom faster_whisper import WhisperModel\nm = WhisperModel(sys.argv[1], local_files_only=True)\nsegs, info = m.transcribe(sys.argv[2], language=None if sys.argv[3] == "auto" else sys.argv[3], word_timestamps=True)\nw = [{"t": x.word.strip(), "a": round(x.start, 2), "b": round(x.end, 2)} for s in segs for x in (s.words or [])]\nprint(json.dumps({"words": w, "language": info.language}))\n`;

/** whisper.cpp (`whisper-cli`) or faster-whisper (python3), whichever is on PATH. Never downloads a model. */
export function whisperLocalEngine(config: VoicesConfig): TranscribeEngine {
  const t = config.transcription ?? {};
  const model = t.model || DEFAULT_MODEL;
  const modelPath = t.modelPath || join(modelDir(), `ggml-${model}.bin`);
  const cli = (): string | null => onPath("whisper-cli") || onPath("whisper-cpp");
  const py = (): boolean => { const p = onPath("python3"); if (!p) return false; try { execFileSync(p, ["-I", "-c", "import faster_whisper"], { stdio: "ignore" }); return true; } catch { return false; } };
  const fasterModel = t.model || FASTER_MODEL;
  const GET = model === DEFAULT_MODEL ? `get the model with "praeko studio transcribe --download-model" (about 547 MB from huggingface.co/ggerganov/whisper.cpp, only after your yes, SHA-256 checked)` : `put ggml-${model}.bin in ~/.config/praeko/models (huggingface.co/ggerganov/whisper.cpp)`;
  const HOWTO = `install whisper.cpp ("brew install whisper-cpp") and ${GET}; or "pip install faster-whisper" and run it once with the ${fasterModel} model`;
  return {
    name: "whisper-local",
    async available() {
      if (cli()) return existsSync(modelPath) ? null : `whisper-cli found but model ggml-${model}.bin is missing in ~/.config/praeko/models: ${GET}`;
      return py() ? null : `no whisper-cli or faster-whisper on PATH: ${HOWTO}`;
    },
    async run({ wav, language, signal }) {
      const bin = cli();
      if (bin && existsSync(modelPath)) {
        const dir = mkdtempSync(join(tmpdir(), "praeko-whisper-"));
        try {
          await execP(bin, ["-m", modelPath, "-f", wav, "-l", language, "-ml", "1", "-sow", "-oj", "-of", join(dir, "out")], signal);
          return { ...parseWhisperCppJson(JSON.parse(readFileSync(join(dir, "out.json"), "utf8"))), version: `whisper.cpp ${modelPath.split(/[\\/]/).pop()!.replace(/^ggml-|\.bin$/g, "")}` };
        } finally { rmSync(dir, { recursive: true, force: true }); }
      }
      const r = JSON.parse(await execP("python3", ["-I", "-c", PY, fasterModel, wav, language], signal));
      return { words: r.words, text: r.words.map((p: Word) => p.t).join(" "), language: r.language, version: `faster-whisper ${fasterModel}` };
    },
  };
}

export function voiceStudioEngine(config: VoicesConfig): TranscribeEngine {
  const vs = createVoiceStudio({ base: config.voicestudio?.base });
  let version = "";
  return {
    name: "voicestudio",
    async available() { const s = await vs.available(); version = s.version || ""; return s.ok ? null : `unavailable (${clean(s.reason)})`; },
    async run({ wav, language }) {
      const r = await vs.transcribe({ audio: wav, bytes: readFileSync(wav), language });
      return { words: r.words, text: r.text, language: r.language, version: version ? `voicestudio ${version}` : "voicestudio" };
    },
  };
}

const scribeRef = (config: VoicesConfig): string | undefined => { const el = config.accounts?.elevenlabs; return (Array.isArray(el) ? el : []).map((c) => `elevenlabs/${c}`).find((r) => getKey(r)); };
/** Cloud: ElevenLabs Scribe through `align` (same key lookup). Only ever built into the plan when the person allowed the cloud. */
export function scribeEngine(config: VoicesConfig): TranscribeEngine {
  return {
    name: "scribe", cloud: true,
    async available() { return scribeRef(config) ? null : "no ElevenLabs key found"; },
    async run({ wav, language }) {
      const { align } = await import("./index.ts");
      const r = await align({ audio: wav, aligner: "scribe", language: language === "pt" ? "por" : language === "en" ? "eng" : language, config });
      return { words: r.words, text: r.text, version: "scribe_v1" };
    },
  };
}

export type TranscribeOptions = {
  file: string; language?: string; engines?: string[]; allowCloud?: boolean; config?: VoicesConfig;
  /** Test hooks: engines by name, the audio preparation, and the timeout (seconds). */
  engineImpls?: Record<string, TranscribeEngine>; prepare?: (file: string) => Prepared; log?: (m: string) => void;
};

const withTimeout = async <T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> => {
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, no) => { timer = setTimeout(() => { ac.abort(); no(new Error(`timed out after ${Math.round(ms / 1000)} s`)); }, ms); });
  try { return await Promise.race([fn(ac.signal), timeout]); } finally { clearTimeout(timer); }
};

export async function transcribe({ file, language = "auto", engines, allowCloud, config = loadConfig(), engineImpls, prepare = prepareAudio, log = () => {} }: TranscribeOptions): Promise<TranscriptResult> {
  const t = config.transcription ?? {};
  const cloudOk = allowCloud ?? t.allowCloud ?? false;
  const order = engines?.length ? engines : t.engines?.length ? t.engines : DEFAULT_ENGINES;
  const lang = language === "auto" ? "auto" : norm2(language);
  const impl = (n: string): TranscribeEngine | undefined => engineImpls?.[n] ?? (n === "voicestudio" ? voiceStudioEngine(config) : n === "whisper-local" ? whisperLocalEngine(config) : n === "scribe" ? scribeEngine(config) : undefined);
  for (const n of order) if (!impl(n)) throw new InputError(`unknown engine "${n}" (voicestudio, whisper-local, scribe)`);
  if (engines?.length === 1 && impl(engines[0]!)!.cloud && !cloudOk) throw new TranscribeError("scribe sends the audio to ElevenLabs (cloud): turn it on with --cloud or transcription.allowCloud. Nothing was sent.", []);

  const p = prepare(file); // InputError stops here: no engine is tried
  const attempts: Attempt[] = [];
  try {
    for (const n of order) {
      const e = impl(n)!;
      if (e.cloud && !cloudOk) { attempts.push({ engine: n, ok: false, reason: "cloud disabled (audio stays on this machine; turn on with --cloud or transcription.allowCloud)" }); continue; }
      const why = await e.available().catch((x) => clean(x));
      if (why) { attempts.push({ engine: n, ok: false, reason: why }); continue; }
      const factor = e.cloud ? t.cloudTimeoutFactor ?? 1 : t.localTimeoutFactor ?? 3;
      const ms = Math.max(factor * p.durationSec, t.minTimeoutSec ?? 20) * 1000;
      try {
        log(`[transcribe] ${n}`);
        const o = await withTimeout(ms, (signal) => e.run({ wav: p.wav, language: lang, durationSec: p.durationSec, signal }));
        const bad = qualityGate(o, p.durationSec, lang);
        if (bad) { attempts.push({ engine: n, ok: false, reason: `rejected: ${bad}` }); continue; }
        attempts.push({ engine: n, ok: true });
        return { engine: n, engineVersion: o.version || n, language: o.language ? norm2(o.language) : lang, durationSec: +p.durationSec.toFixed(2), words: o.words, text: o.text ?? o.words.map((w) => w.t).join(" "), attempts };
      } catch (x) { attempts.push({ engine: n, ok: false, reason: clean(x) }); }
    }
  } finally { p.cleanup(); }
  const cloudSkipped = attempts.some((a) => /cloud disabled/.test(a.reason || ""));
  throw new TranscribeError(`no engine could transcribe the file. Tried: ${attempts.map((a) => `${a.engine} (${a.reason})`).join("; ")}${cloudSkipped ? ". The cloud engine was not used because it is off." : ""}`, attempts);
}

// ---------- output files ----------
const ts = (s: number): string => { const ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`; };

/** SRT cues: break on sentence end, a pause over 0.8 s, 6 s or 84 characters; a cue over 42 characters becomes two lines. */
export function toSrt(words: Word[]): string {
  const cues: Word[][] = [];
  let cur: Word[] = [];
  for (const [i, w] of words.entries()) {
    cur.push(w);
    const next = words[i + 1];
    const len = cur.map((x) => x.t).join(" ").length;
    if (!next || /[.!?…]$/.test(w.t) || next.a - w.b > 0.8 || w.b - cur[0]!.a >= 6 || len >= 84) { cues.push(cur); cur = []; }
  }
  return cues.map((c, i) => {
    const txt = c.map((x) => x.t).join(" ");
    let body = txt;
    if (txt.length > 42) { const mid = txt.length / 2; let best = 0, d = 1e9; for (let k = 0, pos = 0; k < c.length - 1; k++) { pos += c[k]!.t.length + 1; if (Math.abs(pos - mid) < d) { d = Math.abs(pos - mid); best = k + 1; } } if (best) body = c.slice(0, best).map((x) => x.t).join(" ") + "\n" + c.slice(best).map((x) => x.t).join(" "); }
    return `${i + 1}\n${ts(c[0]!.a)} --> ${ts(Math.max(c[c.length - 1]!.b, c[0]!.a + 0.05))}\n${body}\n`;
  }).join("\n");
}
export const toTxt = (r: Pick<TranscriptResult, "text">): string => r.text.trim() + "\n";

/** Writes transcript.json, transcript.srt and transcript.txt in `dir`. Returns the file names. */
/** Writes <name>.json, <name>.srt and <name>.txt in `dir` (`name` defaults to "transcript"). */
export function writeTranscript(r: TranscriptResult, dir: string, name = "transcript"): { json: string; srt: string; txt: string } {
  mkdirSync(dir, { recursive: true });
  const f = { json: resolve(dir, `${name}.json`), srt: resolve(dir, `${name}.srt`), txt: resolve(dir, `${name}.txt`) };
  writeFileSync(f.json, JSON.stringify(r, null, 2) + "\n"); writeFileSync(f.srt, toSrt(r.words)); writeFileSync(f.txt, toTxt(r));
  return f;
}

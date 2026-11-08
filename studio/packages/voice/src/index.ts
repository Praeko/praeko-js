// @praeko/studio-voice: narration (TTS), loudness normalization and per-word timings (Scribe). Node only; needs `ffmpeg` on PATH.
// The key comes from the environment (ELEVENLABS_API_KEY) and the voice id from a variable named in `brand.voice.idEnv`: no secrets in git.
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { createReadStream, existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { getKey, loadConfig, resolveVoice } from "./config.ts";
import type { VoiceBrand, VoicesConfig } from "./config.ts";
import { generateWithFailover, saveBuffer } from "./router.ts";
import { createVoiceStudio } from "./providers/voicestudio.ts";
import { alignToScript, joinNumbers } from "./alignment.ts";
import { silentAudio, estimateWords } from "./estimated.ts";
import type { Word } from "./estimated.ts";
import { blockCacheKey, narrateBlocks, readBlocks } from "./blocks.ts";

export * from "./config.ts";
export { DEFAULT_VOICES } from "./defaults.ts";
export { generateWithFailover, balances, sameBalanceGroups } from "./router.ts";
export type { Attempt, AccountBalance } from "./router.ts";
export { createVoiceStudio, prepareText } from "./providers/voicestudio.ts";
export { estimateWords, silentAudio } from "./estimated.ts";
export type { Word } from "./estimated.ts";
export { readBlocks, narrateBlocks, joinAudios, blockCacheKey, blockHash, hookHash } from "./blocks.ts";
export { alignToScript, scriptWords, joinNumbers } from "./alignment.ts";

const ensureDir = (file: string) => mkdirSync(dirname(file), { recursive: true });
const ESTIMATED_MARKER = "estimated voice: generate the final one before publishing (praeko studio voice <slug> --quality final)\n";
const wordsTs = (constantName: string, words: Word[]) => `import type { Word } from "@praeko/studio-core";\n\nexport const ${constantName}: Word[] = ${JSON.stringify(words)};\n`;

/** Swaps terms the voice reads wrong (`{ "mysite.com": "my site dot com" }`). Spoken text only. */
export function applyPronunciation(text: string, map: Record<string, string> = {}): string {
  let t = text;
  for (const [from, to] of Object.entries(map)) t = t.split(from).join(to);
  return t;
}

/** Fixes caption words the Scribe misspells (`{ "0,40": "forty" }`). Compares case-insensitively and ignoring trailing punctuation. */
export function applyCaptionFixes(words: Word[], map: Record<string, string> = {}): Word[] {
  const k = (s: string) => s.toLowerCase().replace(/[.,!?:;"]+$/g, "");
  const m = Object.fromEntries(Object.entries(map).map(([a, b]) => [k(a), b]));
  return words.map((p) => (m[k(p.t)] ? { ...p, t: m[k(p.t)] as string } : p));
}

/** Normalizes loudness (loudnorm). Returns the duration in seconds. */
export function normalizeAudio(input: string, output: string, lufs = -15): number {
  ensureDir(output);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", input, "-af", `loudnorm=I=${lufs}:TP=-1.5`, "-ar", "44100", output]);
  return duration(output);
}
export function duration(file: string): number {
  return +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim();
}

type Log = (m: string) => void;

/**
 * Generates the narration. `voice` is a name from `voices.json` ("my-voice") or the old shape `{ provider, idEnv, model }`.
 * The router picks the account, checks the balance and switches account when the quota runs out. eleven_v4 text accepts tags like [curious].
 */
export async function generateVoice({ text, output, voice, lufs = -15, pronunciation, log = () => {}, noFailover = false, config = loadConfig() }: {
  text: string; output: string; voice: unknown; lufs?: number; pronunciation?: Record<string, string>; log?: Log; noFailover?: boolean; config?: VoicesConfig;
}): Promise<{ file: string; duration: number; account: string; provider: string; attempts: { account: string; reason: string }[] }> {
  const v = resolveVoice(voice, config);
  const spoken = applyPronunciation(text.trim(), pronunciation);
  let buffer: Buffer, ext = "mp3", account: string, attempts: { account: string; reason: string }[] = [];
  if (v.provider === "voicestudio") {
    const vs = createVoiceStudio({ base: config.voicestudio?.base });
    const st = await vs.available();
    if (!st.ok) throw new Error(`VoiceStudio unavailable: ${st.reason}`);
    log(`[voice] voicestudio ${st.version} (${st.device}), voice ${v.alias} (${v.id})`);
    buffer = await vs.generate({ text: spoken, id: v.id as string, model: v.model, language: v.language, settings: v.settings });
    ext = "wav"; account = "local";
  } else {
    const r = await generateWithFailover({ text: spoken, voice: v, config, log, noFailover });
    buffer = r.buffer; account = r.account; attempts = r.attempts;
  }
  const raw = `${output}.raw.${ext}`;
  saveBuffer(buffer, raw);
  const d = normalizeAudio(raw, output, lufs);
  unlinkSync(raw);
  return { file: output, duration: d, account, provider: v.provider, attempts };
}

/**
 * Per-word timings. `aligner`: "scribe" (ElevenLabs, spends credit) or "voicestudio" (local faster-whisper, free).
 * With `script`, fixes near-miss spellings from the original text (esbuild/Sbuild, ninguém/ninguem); `fixes` applies the brand map.
 */
export async function align({ audio, aligner = "scribe", language = "por", script, fixes, config = loadConfig() }: {
  audio: string; aligner?: string; language?: string; script?: string; fixes?: Record<string, string>; config?: VoicesConfig;
}): Promise<{ words: Word[]; events: { t: string; a: number }[]; text: string; corrected: [string, string, number][] }> {
  let words: Word[], events: { t: string; a: number }[] = [], text: string;
  if (aligner === "voicestudio") {
    const vs = createVoiceStudio({ base: config.voicestudio?.base });
    const st = await vs.available();
    if (!st.ok) throw new Error(`VoiceStudio unavailable: ${st.reason}`);
    ({ words, text } = await vs.transcribe({ audio, bytes: readFileSync(audio), language: language === "por" ? "pt" : language }));
  } else if (aligner === "scribe") {
    const el = config.accounts?.elevenlabs;
    const ref = (Array.isArray(el) ? el : []).map((c) => `elevenlabs/${c}`).find((r) => getKey(r));
    if (!ref) throw new Error("align: no ElevenLabs key found (system keychain, ~/.config/praeko or ELEVENLABS_API_KEY)");
    const client = new ElevenLabsClient({ apiKey: getKey(ref) as string });
    const r: any = await client.speechToText.convert({ file: createReadStream(audio), modelId: "scribe_v1", languageCode: language, timestampsGranularity: "word", tagAudioEvents: true });
    words = r.words.filter((w: any) => w.type === "word").map((w: any) => ({ t: w.text, a: +w.start.toFixed(2), b: +w.end.toFixed(2) }));
    events = r.words.filter((w: any) => w.type === "audio_event").map((w: any) => ({ t: w.text, a: +w.start.toFixed(2) }));
    text = r.text;
  } else throw new Error(`unknown aligner: ${aligner}`);
  words = joinNumbers(words);
  let corrected: [string, string, number][] = [];
  if (script) ({ words, corrected } = alignToScript(words, script));
  return { words: applyCaptionFixes(words, fixes), events, text, corrected };
}

const aliasOf = (voice: string | undefined, quality: string | undefined, brand: VoiceBrand, config: VoicesConfig): unknown =>
  voice || (quality && config.quality?.[quality]) || brand.voice;

/**
 * Generates ONE short piece (a hook sentence, a block): audio in `file` and local per-word timings.
 * The `estimated` provider does not speak (silent mp3); the others use voice + aligner like `narrate`.
 */
export async function narratePiece({ text, file, brand = {}, quality, voice, aligner, log = () => {}, noFailover = false, config = loadConfig() }: {
  text: string; file: string; brand?: VoiceBrand; quality?: string; voice?: string; aligner?: string; log?: Log; noFailover?: boolean; config?: VoicesConfig;
}): Promise<{ duration: number; words: Word[]; estimated: boolean; voice: string; account?: string }> {
  const alias = aliasOf(voice, quality, brand, config);
  const v = resolveVoice(alias, config);
  if (v.provider === "estimated") {
    const est = estimateWords(applyPronunciation(text.trim(), brand.pronunciation), { wpm: v.wordsPerMin });
    silentAudio(file, est.duration);
    return { duration: est.duration, words: applyCaptionFixes(est.words, brand.captionFixes), estimated: true, voice: v.alias };
  }
  const g = await generateVoice({ text, output: file, voice: alias, pronunciation: brand.pronunciation, log, noFailover, config });
  const al = await align({ audio: file, aligner: aligner || v.aligner || "scribe", script: text, fixes: brand.captionFixes, config });
  return { duration: g.duration, words: al.words, estimated: false, voice: v.alias, account: g.account };
}

export type NarrateResult = {
  duration: number; words: number; events: { t: string; a: number }[]; account: string; provider: string; voice: string;
  corrected: [string, string, number][]; estimated: boolean; blocks?: number; regenerated?: number; reused?: number;
};

/**
 * Full step: reads `<folder>/script.txt`, writes `<folder>/voice.mp3` and `<folder>/words.json`
 * (and `words.ts` with `export const WORDS`, ready to import in the episode). A script with `## title` headings is a long video:
 * one cached audio per block, plus `blocks.json` (`[{ n, title, a, b }]`).
 */
export async function narrate({ folder, brand, constantName = "WORDS", log = () => {}, noFailover = false, voice, quality, aligner, config = loadConfig() }: {
  folder: string; brand: VoiceBrand; constantName?: string; log?: Log; noFailover?: boolean; voice?: string; quality?: string; aligner?: string; config?: VoicesConfig;
}): Promise<NarrateResult> {
  const text = readFileSync(join(folder, "script.txt"), "utf8");
  const alias = aliasOf(voice, quality, brand, config);
  const v = resolveVoice(alias, config);
  const marker = join(folder, "voice.estimated");
  const writeWords = (words: Word[]) => {
    writeFileSync(join(folder, "words.json"), JSON.stringify(words));
    writeFileSync(join(folder, "words.ts"), wordsTs(constantName, words));
  };
  if (readBlocks(text).length) {
    // LONG: script in blocks (`## title`), one audio per block with a cache, joined with a pause
    const estimated = v.provider === "estimated";
    const r = await narrateBlocks({
      folder, script: text, log,
      key: blockCacheKey({ voiceAlias: v.alias, provider: v.provider, model: v.model, pronunciation: brand.pronunciation }),
      generateBlock: async ({ text: bt, file }) => {
        if (estimated) {
          const est = estimateWords(applyPronunciation(bt.trim(), brand.pronunciation), { wpm: v.wordsPerMin });
          silentAudio(file, est.duration);
          return { duration: est.duration, words: applyCaptionFixes(est.words, brand.captionFixes) };
        }
        const g = await generateVoice({ text: bt, output: file, voice: alias, pronunciation: brand.pronunciation, log, noFailover, config });
        const al = await align({ audio: file, aligner: aligner || v.aligner || "scribe", script: bt, fixes: brand.captionFixes, config });
        return { duration: g.duration, words: al.words };
      },
    });
    if (estimated) writeFileSync(marker, ESTIMATED_MARKER); else if (existsSync(marker)) unlinkSync(marker);
    writeWords(r.words);
    writeFileSync(join(folder, "blocks.json"), JSON.stringify(r.blocks, null, 2) + "\n");
    return { duration: r.duration, words: r.words.length, events: [], account: estimated ? "-" : "blocks", provider: v.provider, voice: v.alias, corrected: [], estimated, blocks: r.blocks.length, regenerated: r.regenerated, reused: r.reused };
  }
  if (v.provider === "estimated") {
    // silent draft: estimated timings from the script and silent audio; for assembling and checking scenes
    const est = estimateWords(applyPronunciation(text.trim(), brand.pronunciation), { wpm: v.wordsPerMin });
    const words = applyCaptionFixes(est.words, brand.captionFixes);
    silentAudio(join(folder, "voice.mp3"), est.duration);
    writeFileSync(marker, ESTIMATED_MARKER);
    writeWords(words);
    return { duration: est.duration, words: words.length, events: [], account: "-", provider: "estimated", voice: v.alias, corrected: [], estimated: true };
  }
  if (existsSync(marker)) unlinkSync(marker);
  const g = await generateVoice({ text, output: join(folder, "voice.mp3"), voice: alias, pronunciation: brand.pronunciation, log, noFailover, config });
  const al = await align({ audio: g.file, aligner: aligner || v.aligner || "scribe", script: text, fixes: brand.captionFixes, config });
  writeWords(al.words);
  return { duration: g.duration, words: al.words.length, events: al.events, account: g.account, provider: g.provider, voice: v.alias, corrected: al.corrected, estimated: false };
}

// VoiceStudio (local): "omnivoice" TTS and transcription with per-word timings, all at http://127.0.0.1:3900 (OpenAI-like API).
import type { Word } from "../estimated.ts";

export const DEFAULT_BASE = "http://127.0.0.1:3900";
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** VoiceStudio does not read eleven_v4 tags and reads "IA" as letters: strips [brackets] and spells it out (the narration language is Portuguese). */
export function prepareText(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\bIA\b/g, "inteligência artificial")
    .replace(/\s*\n\s*/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

export type VoiceStudioStatus = { ok: boolean; device?: string; version?: string; reason?: string };
export type VoiceStudio = {
  name: string; base: string;
  available(): Promise<VoiceStudioStatus>;
  profiles(): Promise<{ id: string; name: string; language: string }[]>;
  generate(a: { text: string; id: string; model?: string; language?: string; settings?: Record<string, any>; retries?: number; interval?: number; limit?: number }): Promise<Buffer>;
  transcribe(a: { audio: string; bytes: Uint8Array; language?: string }): Promise<{ words: Word[]; text: string }>;
};

export function createVoiceStudio({ base = DEFAULT_BASE, wait = sleep }: { base?: string; wait?: (ms: number) => Promise<void> } = {}): VoiceStudio {
  return {
    name: "voicestudio",
    base,
    async available() {
      try {
        const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
        if (!r.ok) return { ok: false, reason: `HTTP ${r.status}` };
        const d: any = await r.json();
        return { ok: d.status === "ok", device: d.device, version: d.version };
      } catch {
        return { ok: false, reason: `no response at ${base} (open VoiceStudio)` };
      }
    },
    /** Voice profiles. */
    async profiles() {
      const r = await fetch(`${base}/profiles`, { signal: AbortSignal.timeout(10000) });
      const d: any = await r.json();
      return (Array.isArray(d) ? d : d.profiles || d.data || []).map((p: any) => ({ id: p.id, name: p.name, language: p.language }));
    },
    /** Returns a wav Buffer. 429 = busy: waits and retries. */
    async generate({ text, id, model = "omnivoice", language = "pt-BR", settings = {}, retries = 15, interval = 60000, limit = 1800000 }) {
      const body = JSON.stringify({ model, input: prepareText(text), voice: id, language, response_format: "wav", ...settings });
      for (let i = 0; i < retries; i++) {
        const r = await fetch(`${base}/v1/audio/speech`, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(limit) });
        if (r.status === 429) { await wait(interval); continue; }
        if (!r.ok) { const e: any = new Error(`VoiceStudio: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`); e.statusCode = r.status; throw e; }
        return Buffer.from(await r.arrayBuffer());
      }
      throw new Error("VoiceStudio is busy (429) after several attempts");
    },
    /** Transcription with per-word timing (VoiceStudio's own faster-whisper). */
    async transcribe({ audio, bytes, language = "pt" }) {
      const f = new FormData();
      f.append("file", new Blob([bytes as BlobPart]), audio.split("/").pop());
      f.append("model", "whisper-1");
      f.append("language", language);
      f.append("response_format", "verbose_json");
      f.append("timestamp_granularities[]", "word");
      const r = await fetch(`${base}/v1/audio/transcriptions`, { method: "POST", body: f, signal: AbortSignal.timeout(600000) });
      if (!r.ok) throw new Error(`VoiceStudio (transcription): HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
      const d: any = await r.json();
      return { words: (d.words || []).map((w: any) => ({ t: String(w.word).trim(), a: +w.start.toFixed(2), b: +w.end.toFixed(2) })), text: d.text };
    },
  };
}

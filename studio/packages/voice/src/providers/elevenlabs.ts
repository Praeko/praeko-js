import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

export type ErrorKind = "quota" | "auth" | "rate" | "server" | "network" | "text";
export type Balance = { used: number; limit: number; remaining: number; plan: string; resets: Date | null };
export type VoiceProvider = {
  name: string;
  generate(a: { text: string; id: string; model?: string; settings?: Record<string, any> }): Promise<Buffer>;
  balance(): Promise<Balance>;
};

/** Classifies an ElevenLabs error for the router. */
export function classifyError(e: any): ErrorKind {
  const status = e?.statusCode ?? e?.status ?? 0;
  const body = JSON.stringify(e?.body ?? e?.message ?? "").toLowerCase();
  if (body.includes("quota_exceeded") || status === 402) return "quota";
  if (status === 401 || status === 403) return "auth";
  if (status === 429 || body.includes("too_many_concurrent") || body.includes("system_busy")) return "rate";
  if (status >= 500) return "server";
  if (status === 400 || status === 422) return "text";
  if (!status) return "network";
  return "server";
}

export function createElevenLabs({ key }: { key: string }): VoiceProvider {
  const client = new ElevenLabsClient({ apiKey: key });
  return {
    name: "elevenlabs",
    /** `{ text, id, model, settings }` → mp3 Buffer */
    async generate({ text, id, model, settings = {} }) {
      const audio = await client.textToSpeech.convert(id, {
        text,
        modelId: model || "eleven_v4",
        languageCode: "pt",
        outputFormat: "mp3_44100_128",
        voiceSettings: { stability: settings.stability ?? 0.5, similarityBoost: settings.similarity ?? 0.75, style: settings.style ?? 0, useSpeakerBoost: true, speed: settings.speed ?? 1 },
      });
      const chunks: Uint8Array[] = [];
      for await (const c of audio as unknown as AsyncIterable<Uint8Array>) chunks.push(c);
      return Buffer.concat(chunks);
    },
    /** Characters used, limit, remaining, plan and reset date. */
    async balance() {
      const r = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": key } });
      if (!r.ok) { const e: any = new Error(`balance: HTTP ${r.status}`); e.statusCode = r.status; throw e; }
      const d: any = await r.json();
      return { used: d.character_count, limit: d.character_limit, remaining: d.character_limit - d.character_count, plan: d.tier, resets: d.next_character_count_reset_unix ? new Date(d.next_character_count_reset_unix * 1000) : null };
    },
  };
}

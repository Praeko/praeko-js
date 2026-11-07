// Default voice configuration (no ids, no secrets). Kept as a TS object so it goes into the bundle without a JSON import.
// For your own voice: `praeko studio voice account add <name> --voice-id <id>` (writes the project's voices.json)
// or set ELEVENLABS_VOICE_ID. Everyone uses ONLY their own voice or one they are authorized to use.
import type { VoicesConfig } from "./config.ts";

export const DEFAULT_VOICES: VoicesConfig = {
  accounts: { elevenlabs: ["principal"] },
  voices: {
    "draft-silent": { provider: "estimated", wordsPerMin: 190 },
    "my-voice": { provider: "elevenlabs", model: "eleven_v4", ids: {}, aligner: "scribe" },
    "local-voice": { provider: "voicestudio", model: "", id: "", language: "pt-BR", settings: {}, aligner: "voicestudio" },
  },
  strategy: { elevenlabs: "failover-balance" },
  quality: { draft: "draft-silent", local: "local-voice", final: "my-voice" },
  voicestudio: { base: "http://127.0.0.1:3900" },
};

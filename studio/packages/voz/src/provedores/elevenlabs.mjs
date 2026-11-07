import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

/** Classifica um erro do ElevenLabs para o roteador: "cota" | "auth" | "limite" | "servidor" | "rede" | "texto". */
export function classificarErro(e) {
  const status = e?.statusCode ?? e?.status ?? 0;
  const corpo = JSON.stringify(e?.body ?? e?.message ?? "").toLowerCase();
  if (corpo.includes("quota_exceeded") || status === 402) return "cota";
  if (status === 401 || status === 403) return "auth";
  if (status === 429 || corpo.includes("too_many_concurrent") || corpo.includes("system_busy")) return "limite";
  if (status >= 500) return "servidor";
  if (status === 400 || status === 422) return "texto";
  if (!status) return "rede";
  return "servidor";
}

export function criarElevenLabs({ chave }) {
  const client = new ElevenLabsClient({ apiKey: chave });
  return {
    nome: "elevenlabs",
    /** `{ texto, id, modelo, ajustes }` → Buffer de mp3 */
    async gerar({ texto, id, modelo, ajustes = {} }) {
      const audio = await client.textToSpeech.convert(id, {
        text: texto,
        modelId: modelo || "eleven_v4",
        languageCode: "pt",
        outputFormat: "mp3_44100_128",
        voiceSettings: { stability: ajustes.stability ?? 0.5, similarityBoost: ajustes.similarity ?? 0.75, style: ajustes.style ?? 0, useSpeakerBoost: true, speed: ajustes.speed ?? 1 },
      });
      const chunks = [];
      for await (const c of audio) chunks.push(c);
      return Buffer.concat(chunks);
    },
    /** `{ usados, limite, restantes, plano, reinicia }` (caracteres) */
    async saldo() {
      const r = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": chave } });
      if (!r.ok) { const e = new Error(`saldo: HTTP ${r.status}`); e.statusCode = r.status; throw e; }
      const d = await r.json();
      return { usados: d.character_count, limite: d.character_limit, restantes: d.character_limit - d.character_count, plano: d.tier, reinicia: d.next_character_count_reset_unix ? new Date(d.next_character_count_reset_unix * 1000) : null };
    },
  };
}

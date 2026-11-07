// VoiceStudio (local): TTS "omnivoice" e transcrição com tempos por palavra, tudo em http://127.0.0.1:3900 (API tipo OpenAI).
export const BASE_PADRAO = "http://127.0.0.1:3900";
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** O VoiceStudio não lê tags do eleven_v4 e lê "IA" como letras: tira os [colchetes] e escreve por extenso. */
export function prepararTexto(texto) {
  return texto
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\bIA\b/g, "inteligência artificial")
    .replace(/\s*\n\s*/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

export function criarVoiceStudio({ base = BASE_PADRAO, esperar = dormir } = {}) {
  return {
    nome: "voicestudio",
    base,
    /** { ok, device, versao } ou { ok: false, motivo } */
    async disponivel() {
      try {
        const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
        if (!r.ok) return { ok: false, motivo: `HTTP ${r.status}` };
        const d = await r.json();
        return { ok: d.status === "ok", device: d.device, versao: d.version };
      } catch (e) {
        return { ok: false, motivo: `sem resposta em ${base} (abra o VoiceStudio)` };
      }
    },
    /** Perfis de voz: [{ id, name, language }] */
    async perfis() {
      const r = await fetch(`${base}/profiles`, { signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      return (Array.isArray(d) ? d : d.profiles || d.data || []).map((p) => ({ id: p.id, name: p.name, language: p.language }));
    },
    /** `{ texto, id, modelo, idioma, ajustes, tentativas, intervalo }` → Buffer (wav). 429 = ocupado: espera e repete. */
    async gerar({ texto, id, modelo = "omnivoice", idioma = "pt-BR", ajustes = {}, tentativas = 15, intervalo = 60000, limite = 1800000 }) {
      const corpo = JSON.stringify({ model: modelo, input: prepararTexto(texto), voice: id, language: idioma, response_format: "wav", ...ajustes });
      for (let i = 0; i < tentativas; i++) {
        const r = await fetch(`${base}/v1/audio/speech`, { method: "POST", headers: { "Content-Type": "application/json" }, body: corpo, signal: AbortSignal.timeout(limite) });
        if (r.status === 429) { await esperar(intervalo); continue; }
        if (!r.ok) { const e = new Error(`VoiceStudio: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`); e.statusCode = r.status; throw e; }
        return Buffer.from(await r.arrayBuffer());
      }
      throw new Error("VoiceStudio ocupado (429) depois de várias tentativas");
    },
    /** Transcrição com tempo por palavra (faster-whisper do próprio VoiceStudio). → [{ t, a, b }] */
    async transcrever({ audio, bytes, idioma = "pt" }) {
      const f = new FormData();
      f.append("file", new Blob([bytes]), audio.split("/").pop());
      f.append("model", "whisper-1");
      f.append("language", idioma);
      f.append("response_format", "verbose_json");
      f.append("timestamp_granularities[]", "word");
      const r = await fetch(`${base}/v1/audio/transcriptions`, { method: "POST", body: f, signal: AbortSignal.timeout(600000) });
      if (!r.ok) throw new Error(`VoiceStudio (transcrição): HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
      const d = await r.json();
      return { palavras: (d.words || []).map((w) => ({ t: w.word.trim(), a: +w.start.toFixed(2), b: +w.end.toFixed(2) })), texto: d.text };
    },
  };
}

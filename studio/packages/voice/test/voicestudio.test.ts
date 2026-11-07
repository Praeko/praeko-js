// node --test studio/packages/voice/test/voicestudio.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createVoiceStudio, prepareText } from "../src/providers/voicestudio.ts";
import { alignToScript, scriptWords, joinNumbers } from "../src/alignment.ts";
import type { Word } from "../src/estimated.ts";

type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<unknown>;
function serve(handler: Handler): Promise<{ s: http.Server; base: string }> {
  return new Promise((ok) => { const s = http.createServer(handler); s.listen(0, "127.0.0.1", () => ok({ s, base: `http://127.0.0.1:${(s.address() as { port: number }).port}` })); });
}
const body = (req: IncomingMessage): Promise<Buffer> => new Promise((ok) => { const c: Buffer[] = []; req.on("data", (d) => c.push(d)); req.on("end", () => ok(Buffer.concat(c))); });

test("prepareText drops tags, spells out IA and joins lines", () => {
  assert.equal(prepareText("[curious] A IA\n\nfala. [short pause]"), "A inteligência artificial fala.");
});

test("generate: sends the right body, waits on 429 and returns the audio", async () => {
  let n = 0, received: any;
  const { s, base } = await serve(async (req, res) => {
    if (req.url === "/v1/audio/speech") { n++; received = JSON.parse((await body(req)).toString()); if (n === 1) { res.statusCode = 429; return res.end("busy"); } res.setHeader("Content-Type", "audio/wav"); return res.end(Buffer.from("RIFFwav")); }
    res.statusCode = 404; res.end();
  });
  const vs = createVoiceStudio({ base });
  const buf = await vs.generate({ text: "[curious] Olá IA", id: "a1b2c3d4", settings: { num_step: 16, seed: 123 }, interval: 7, retries: 3 });
  s.close();
  assert.equal(buf.toString(), "RIFFwav"); assert.equal(n, 2);
  assert.deepEqual({ model: received.model, voice: received.voice, language: received.language, response_format: received.response_format, num_step: received.num_step, seed: received.seed, input: received.input },
    { model: "omnivoice", voice: "a1b2c3d4", language: "pt-BR", response_format: "wav", num_step: 16, seed: 123, input: "Olá inteligência artificial" });
});

test("available gives the reason when the service is down", async () => {
  const r = await createVoiceStudio({ base: "http://127.0.0.1:1" }).available();
  assert.equal(r.ok, false); assert.match(r.reason as string, /open VoiceStudio/);
});

test("transcribe reads the words with timing", async () => {
  const { s, base } = await serve(async (req, res) => {
    if (req.url === "/v1/audio/transcriptions") { await body(req); res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ text: "oi mundo", words: [{ word: " oi", start: 0, end: 0.3 }, { word: "mundo", start: 0.31, end: 0.8 }] })); }
    res.statusCode = 404; res.end();
  });
  const r = await createVoiceStudio({ base }).transcribe({ audio: "x/voice.mp3", bytes: Buffer.from("a") });
  s.close();
  assert.deepEqual(r.words, [{ t: "oi", a: 0, b: 0.3 }, { t: "mundo", a: 0.31, b: 0.8 }]);
});

test("alignment to the script: fixes near-misses and accents, keeps numbers and punctuation", () => {
  const asr: Word[] = [["O", 0], ["Sbuild", 0.2], ["tem", 0.5], ["4.500", 0.7], ["golpes,", 1.1], ["mas", 1.4], ["ninguem", 1.6], ["ve.", 1.9]].map(([t, a]) => ({ t: t as string, a: a as number, b: (a as number) + 0.2 }));
  const { words, replaced } = alignToScript(asr, "[curious] O esbuild tem quatro mil e quinhentos golpes, mas ninguém vê.");
  assert.equal(words.map((p) => p.t).join(" "), "O esbuild tem 4.500 golpes, mas ninguém vê.");
  assert.equal(replaced, 3);
  assert.deepEqual(words.map((p) => p.a), asr.map((p) => p.a)); // the timings do not change
});
test("alignment does not swap a truly different word", () => {
  const asr: Word[] = [{ t: "segundo", a: 0, b: 1 }];
  assert.equal((alignToScript(asr, "GB-segundo").words[0] as Word).t, "segundo");
});
test("scriptWords drops tags and spelled-out numbers", () => {
  assert.deepEqual(scriptWords("[curious] Dez e catorze da noite."), ["da", "noite."]);
});
test("joinNumbers glues '4' and '.500'", () => {
  assert.deepEqual(joinNumbers([{ t: "4", a: 1, b: 1.2 }, { t: ".500", a: 1.3, b: 1.8 }, { t: "golpes", a: 2, b: 2.4 }]), [{ t: "4.500", a: 1, b: 1.8 }, { t: "golpes", a: 2, b: 2.4 }]);
});
test("alignment merges a short fragment before the corrected word (S + -Build → esbuild)", () => {
  const asr: Word[] = [["O", 0], ["S", 0.3], ["-Build", 0.4], ["falhou", 0.9]].map(([t, a]) => ({ t: t as string, a: a as number, b: (a as number) + 0.3 }));
  const { words } = alignToScript(asr, "O esbuild falhou");
  assert.equal(words.map((p) => p.t).join(" "), "O esbuild falhou");
  assert.equal((words[1] as Word).a, 0.3);
});

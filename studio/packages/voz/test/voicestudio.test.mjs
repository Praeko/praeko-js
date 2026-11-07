// node --test packages/voz/test/voicestudio.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { criarVoiceStudio, prepararTexto } from "../src/provedores/voicestudio.mjs";
import { alinharPeloRoteiro, palavrasDoRoteiro, juntarNumeros } from "../src/alinhamento.mjs";

function servidor(handler) {
  return new Promise((ok) => { const s = http.createServer(handler); s.listen(0, "127.0.0.1", () => ok({ s, base: `http://127.0.0.1:${s.address().port}` })); });
}
const corpo = (req) => new Promise((ok) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => ok(Buffer.concat(c))); });

test("prepararTexto tira tags, escreve IA por extenso e junta linhas", () => {
  assert.equal(prepararTexto("[curious] A IA\n\nfala. [short pause]"), "A inteligência artificial fala.");
});

test("gerar: manda o corpo certo, espera no 429 e devolve o áudio", async () => {
  let n = 0, recebido;
  const { s, base } = await servidor(async (req, res) => {
    if (req.url === "/v1/audio/speech") { n++; recebido = JSON.parse((await corpo(req)).toString()); if (n === 1) { res.statusCode = 429; return res.end("ocupado"); } res.setHeader("Content-Type", "audio/wav"); return res.end(Buffer.from("RIFFwav")); }
    res.statusCode = 404; res.end();
  });
  const esperas = [];
  const vs = criarVoiceStudio({ base });
  const buf = await vs.gerar({ texto: "[curious] Olá IA", id: "a1b2c3d4", ajustes: { num_step: 16, seed: 123 }, intervalo: 7, tentativas: 3 });
  s.close();
  assert.equal(buf.toString(), "RIFFwav"); assert.equal(n, 2);
  assert.deepEqual({ model: recebido.model, voice: recebido.voice, language: recebido.language, response_format: recebido.response_format, num_step: recebido.num_step, seed: recebido.seed, input: recebido.input },
    { model: "omnivoice", voice: "a1b2c3d4", language: "pt-BR", response_format: "wav", num_step: 16, seed: 123, input: "Olá inteligência artificial" });
});

test("disponivel diz o motivo quando o serviço está fora", async () => {
  const r = await criarVoiceStudio({ base: "http://127.0.0.1:1" }).disponivel();
  assert.equal(r.ok, false); assert.match(r.motivo, /abra o VoiceStudio/);
});

test("transcrever lê as palavras com tempo", async () => {
  const { s, base } = await servidor(async (req, res) => {
    if (req.url === "/v1/audio/transcriptions") { await corpo(req); res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ text: "oi mundo", words: [{ word: " oi", start: 0, end: 0.3 }, { word: "mundo", start: 0.31, end: 0.8 }] })); }
    res.statusCode = 404; res.end();
  });
  const r = await criarVoiceStudio({ base }).transcrever({ audio: "x/voz.mp3", bytes: Buffer.from("a") });
  s.close();
  assert.deepEqual(r.palavras, [{ t: "oi", a: 0, b: 0.3 }, { t: "mundo", a: 0.31, b: 0.8 }]);
});

test("alinhamento pelo roteiro: corrige quase-acerto e acento, mantém número e pontuação", () => {
  const asr = [["O", 0], ["Sbuild", 0.2], ["tem", 0.5], ["4.500", 0.7], ["golpes,", 1.1], ["mas", 1.4], ["ninguem", 1.6], ["ve.", 1.9]].map(([t, a]) => ({ t, a, b: a + 0.2 }));
  const { palavras, trocadas } = alinharPeloRoteiro(asr, "[curious] O esbuild tem quatro mil e quinhentos golpes, mas ninguém vê.");
  assert.equal(palavras.map((p) => p.t).join(" "), "O esbuild tem 4.500 golpes, mas ninguém vê.");
  assert.equal(trocadas, 3);
  assert.deepEqual(palavras.map((p) => p.a), asr.map((p) => p.a)); // os tempos não mudam
});
test("alinhamento não troca palavra diferente de verdade", () => {
  const asr = [{ t: "segundo", a: 0, b: 1 }];
  assert.equal(alinharPeloRoteiro(asr, "GB-segundo").palavras[0].t, "segundo");
});
test("palavrasDoRoteiro descarta tags e números por extenso", () => {
  assert.deepEqual(palavrasDoRoteiro("[curious] Dez e catorze da noite."), ["da", "noite."].slice(0, 0).concat(["da", "noite."]));
});

test("juntarNumeros cola '4' e '.500'", () => {
  assert.deepEqual(juntarNumeros([{ t: "4", a: 1, b: 1.2 }, { t: ".500", a: 1.3, b: 1.8 }, { t: "golpes", a: 2, b: 2.4 }]), [{ t: "4.500", a: 1, b: 1.8 }, { t: "golpes", a: 2, b: 2.4 }]);
});
test("alinhamento funde fragmento curto antes da palavra corrigida (S + -Build → esbuild)", () => {
  const asr = [["O", 0], ["S", 0.3], ["-Build", 0.4], ["falhou", 0.9]].map(([t, a]) => ({ t, a, b: a + 0.3 }));
  const { palavras } = alinharPeloRoteiro(asr, "O esbuild falhou");
  assert.equal(palavras.map((p) => p.t).join(" "), "O esbuild falhou");
  assert.equal(palavras[1].a, 0.3);
});

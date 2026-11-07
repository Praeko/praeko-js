import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { audioMudo, duracao, estimarPalavras, narrar } from "../src/index.mjs";

test("estimarPalavras: ritmo perto de 190 palavras/min, pausa depois de ponto e [short pause]", () => {
  const txt = Array.from({ length: 95 }, () => "palavra").join(" ");
  const { palavras, duracao: d } = estimarPalavras(txt);
  assert.equal(palavras.length, 95);
  assert.ok(d > 28 && d < 33, `duração ${d}`); // 95 palavras ≈ 30 s
  const a = estimarPalavras("um dois. três"), b = estimarPalavras("um dois três");
  assert.ok(a.palavras[2].a - b.palavras[2].a > 0.3); // o ponto abre pausa
  const c = estimarPalavras("um [short pause] dois"), d2 = estimarPalavras("um dois");
  assert.ok(c.palavras[1].a - d2.palavras[1].a > 0.4);
  assert.deepEqual(c.palavras.map((p) => p.t), ["um", "dois"]); // tags não viram palavra
  for (let i = 1; i < palavras.length; i++) assert.ok(palavras[i].a >= palavras[i - 1].b);
});
test("narrar com voz estimada: escreve palavras, mp3 mudo na duração e o marcador", async () => {
  const pasta = mkdtempSync(join(tmpdir(), "praeko-studio-est-"));
  writeFileSync(join(pasta, "roteiro.txt"), "[curious] Abri o site meusite.com.br. [short pause] Tinha um bug, simples.");
  const config = { vozes: { m: { provedor: "estimado", palavrasPorMin: 190 } }, qualidade: {} };
  const r = await narrar({ pasta, marca: { pronuncia: { "meusite.com.br": "meu site ponto com ponto br" } }, voz: "m", config });
  assert.equal(r.estimada, true);
  const pal = JSON.parse(readFileSync(join(pasta, "palavras.json"), "utf8"));
  assert.deepEqual(pal.slice(3, 8).map((p) => p.t), ["meu", "site", "ponto", "com", "ponto"]);
  assert.ok(existsSync(join(pasta, "voz.estimada")));
  assert.ok(Math.abs(duracao(join(pasta, "voz.mp3")) - r.duracao) < 0.2);
  assert.match(readFileSync(join(pasta, "palavras.ts"), "utf8"), /export const PALAVRAS: Palavra\[\] =/);
});

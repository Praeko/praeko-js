import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { duracao, lerBlocos, narrar } from "../src/index.mjs";

const ROT = "texto solto antes é ignorado\n## 1 · GANCHO\nUm dois três quatro cinco seis.\n\n## 2 · MEIO\n[curious] Sete oito nove dez onze doze treze quatorze.\n## 3 · FIM\nÓcio produtivo.\n";
const config = { vozes: { m: { provedor: "estimado", palavrasPorMin: 190 } }, qualidade: {} };

test("lerBlocos: cabeçalhos abrem blocos, vazio é descartado, sem cabeçalho devolve []", () => {
  const b = lerBlocos(ROT);
  assert.deepEqual(b.map((x) => [x.n, x.titulo]), [[1, "1 · GANCHO"], [2, "2 · MEIO"], [3, "3 · FIM"]]);
  assert.equal(b[0].texto, "Um dois três quatro cinco seis.");
  assert.deepEqual(lerBlocos("só texto"), []);
});
test("narrar em blocos: junta o áudio, desloca os tempos, grava blocos.json e reaproveita o cache", async () => {
  const pasta = mkdtempSync(join(tmpdir(), "praeko-studio-blocos-"));
  writeFileSync(join(pasta, "roteiro.txt"), ROT);
  const r = await narrar({ pasta, marca: {}, voz: "m", config });
  assert.equal(r.blocos, 3); assert.equal(r.regerados, 3); assert.equal(r.reaproveitados, 0);
  const blocos = JSON.parse(readFileSync(join(pasta, "blocos.json"), "utf8"));
  assert.equal(blocos[0].a, 0);
  assert.ok(Math.abs(blocos[1].a - (blocos[0].b + 0.6)) < 0.02, "pausa de 0,6 s entre blocos");
  const pal = JSON.parse(readFileSync(join(pasta, "palavras.json"), "utf8"));
  const sete = pal.find((p) => p.t === "Sete");
  assert.ok(sete.a >= blocos[1].a, "tempos do bloco 2 deslocados para o vídeo todo");
  assert.ok(Math.abs(duracao(join(pasta, "voz.mp3")) - r.duracao) < 0.3);
  assert.ok(existsSync(join(pasta, "voz.estimada")));
  // edita só o bloco 2: 1 regerado, 2 reaproveitados
  writeFileSync(join(pasta, "roteiro.txt"), ROT.replace("Sete oito", "Sete e meio oito"));
  const r2 = await narrar({ pasta, marca: {}, voz: "m", config });
  assert.equal(r2.regerados, 1); assert.equal(r2.reaproveitados, 2);
  assert.equal(readdirSync(join(pasta, "voz-blocos")).filter((f) => f.endsWith(".mp3")).length, 4); // o antigo do bloco 2 fica no cache
});

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checarRoteiro, folha, infoVideo, vazio } from "../src/index.mjs";

const dir = mkdtempSync(join(tmpdir(), "praeko-studio-rev-"));
const sintetico = (arq, filtro) => execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", filtro, "-t", "6", "-pix_fmt", "yuv420p", arq]);

test("checarRoteiro: dígitos, tags estranhas, marcas de IA, endereço e nome proibido", () => {
  const r = checarRoteiro("[curious] São 4500 golpes. Isso não é um bug, é uma feature. [gritando] Veja meusite.com.br e fale com Fulano.", { nomesProibidos: ["Fulano"] });
  const msgs = r.map((x) => x.msg).join("\n");
  assert.match(msgs, /dígitos/); assert.match(msgs, /\[gritando\]/); assert.match(msgs, /não é X, é Y/); assert.match(msgs, /endereço/);
  assert.ok(r.some((x) => x.nivel === "erro" && /Fulano/.test(x.msg)));
});
test("checarRoteiro: texto limpo só informa a duração", () => {
  const r = checarRoteiro("[curious] Hoje abre o chefão da semana. [short pause]");
  assert.deepEqual(r.map((x) => x.nivel), ["ok"]);
});
test("vazio: vídeo preto é um trecho vazio de 6 s; vídeo com conteúdo não é", () => {
  const preto = join(dir, "preto.mp4"), cheio = join(dir, "cheio.mp4");
  sintetico(preto, "color=c=black:s=270x480:r=10"); sintetico(cheio, "testsrc=s=270x480:r=10");
  assert.deepEqual(vazio(preto).trechos, [[0, 6]]);
  assert.deepEqual(vazio(cheio).trechos, []);
});
test("folha gera o mosaico e infoVideo lê as dimensões", () => {
  const v = join(dir, "cheio.mp4"), png = join(dir, "folha.png");
  assert.equal(infoVideo(v).largura, 270);
  folha({ video: v, saida: png, n: 6, colunas: 3, largura: 90 });
  assert.ok(existsSync(png));
});

import test from "node:test";
import assert from "node:assert/strict";
import { capitulos, link, mmss, pacote, validar, validarCapitulos } from "../src/index.mjs";

const marca = { links: { jogo: "https://exemplo.com" } };
const CAPS = [{ t: 0, titulo: "O gancho" }, { t: 31, titulo: "O problema" }, { t: 75.3, titulo: "A lição" }, { t: 3725, titulo: "Fim" }];

test("mmss e capitulos: m:ss e h:mm:ss", () => {
  assert.equal(mmss(75.3), "1:15");
  assert.equal(mmss(3725), "1:02:05");
  assert.equal(capitulos(CAPS), "0:00 O gancho\n0:31 O problema\n1:15 A lição\n1:02:05 Fim");
});
test("validarCapitulos: precisa de 0:00, 3 ou mais e 10 s cada", () => {
  assert.deepEqual(validarCapitulos(CAPS), []);
  assert.match(validarCapitulos([{ t: 0, titulo: "a" }, { t: 20, titulo: "b" }]).join(), /3 ou mais/);
  assert.match(validarCapitulos([{ t: 5, titulo: "a" }, { t: 20, titulo: "b" }, { t: 40, titulo: "c" }]).join(), /0:00/);
  assert.match(validarCapitulos([{ t: 0, titulo: "a" }, { t: 4, titulo: "b" }, { t: 40, titulo: "c" }]).join(), /mínimo 10 s/);
});
test("link: longo usa utm_medium=long no YouTube", () => {
  assert.match(link(marca, { plataforma: "youtube", formato: "longo" }), /utm_medium=long$/);
  assert.match(link(marca, { plataforma: "youtube", formato: "short" }), /utm_medium=short$/);
});
test("pacote de longo: capítulos na descrição, comentário fixo do YouTube, Instagram com capa vertical; erro se capítulos inválidos", () => {
  const ep = { titulo: "Um longo", formato: "longo", capitulos: CAPS, yt: { descricao: "Descrição.", comentarioFixo: "Qual foi o seu?" }, ig: { legenda: "Legenda." }, hashtags: { youtube: ["#sql"] }, arquivos: { capaVertical: "capa-v.png" } };
  const md = pacote({ marca, ep });
  assert.match(md, /⏱ Capítulos\n0:00 O gancho\n0:31 O problema/);
  assert.match(md, /YouTube \(longo\)/);
  assert.match(md, /Qual foi o seu\?/);
  assert.match(md, /capa-v\.png/);
  assert.deepEqual(validar({ marca, ep }).erros, []);
  assert.match(validar({ marca, ep: { ...ep, capitulos: CAPS.slice(0, 2) } }).erros.join(), /capítulos: 2 capítulo/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { parseQuando, textosPorRede } from "../src/index.ts";
import { chaveObjeto, configHospedagem, subir } from "../src/hospedagem.ts";

const config = { links: { main: "https://exemplo.com/" } };
const ep = { titulo: "Título", campanha: "camp", formato: "short", yt: { descricao: "Desc" }, ig: { legenda: "Legenda IG", comentarioFixo: "Comenta" }, hashtags: { youtube: ["#a"], instagram: ["#b"] } };

test("parseQuando: dd/mm hh:mm no fuso do Brasil vira UTC", () => {
  assert.equal(parseQuando("06/11 17:30", { agora: new Date("2026-11-04T12:00:00Z") }), "2026-11-06T20:30:00.000Z");
  assert.equal(parseQuando("2026-11-06T17:30"), "2026-11-06T20:30:00.000Z");
  assert.equal(parseQuando("2026-11-06T17:30:00Z"), "2026-11-06T17:30:00.000Z");
});
test("parseQuando: sem ano e já passou vai para o ano seguinte; lixo dá erro", () => {
  assert.equal(parseQuando("02/01 10:00", { agora: new Date("2026-11-04T12:00:00Z") }).slice(0, 4), "2027");
  assert.throws(() => parseQuando("amanhã"), /data inválida/);
});
test("textosPorRede de longo inclui capítulos", () => {
  const t = textosPorRede({ config, ep: { ...ep, formato: "longo", capitulos: [{ t: 0, titulo: "A" }, { t: 20, titulo: "B" }, { t: 40, titulo: "C" }] } });
  assert.ok(t.youtube.texto.includes("0:00 A") && t.youtube.texto.includes("0:40 C"));
});
test("hospedagem: chave aleatória, config e subida com wrangler injetado", () => {
  assert.equal(chaveObjeto("s", "/x/v.mp4", "abc"), "s/abc/v.mp4");
  assert.throws(() => configHospedagem({}), /sem hospedagem/);
  assert.throws(() => configHospedagem({ hospedagem: { tipo: "r2", bucket: "b", urlBase: "http://x" } }), /https/);
  let args;
  const s = subir({ h: { bucket: "b", urlBase: "https://m.exemplo.com/" }, slug: "s", arquivo: "/x/v.mp4", cwd: ".", rodar: (c, a) => { args = a; return { status: 0 }; } });
  assert.ok(s.url.startsWith("https://m.exemplo.com/s/") && s.url.endsWith("/v.mp4"));
  assert.ok(args.includes("--remote") && args.includes("video/mp4"));
  assert.throws(() => subir({ h: { bucket: "b", urlBase: "https://m" }, slug: "s", arquivo: "v.mp4", cwd: ".", rodar: () => ({ status: 1 }) }), /wrangler/);
});
import { argsFfmpeg, mesmaProporcao } from "../src/capa-quadro.ts";
test("capa nos quadros: filtro só nos primeiros quadros, áudio copiado, proporção conferida", () => {
  const a = argsFfmpeg({ video: "v.mp4", capa: "c.png", saida: "o.mp4", largura: 1080, altura: 1920, quadros: 2 });
  const f = a[a.indexOf("-filter_complex") + 1];
  assert.ok(f.includes("lt(n,2)") && f.includes("scale=1080:1920"));
  assert.ok(a.includes("copy") && a.includes("0:a?"));
  assert.ok(mesmaProporcao({ largura: 1080, altura: 1920 }, { largura: 540, altura: 960 }));
  assert.ok(!mesmaProporcao({ largura: 1280, altura: 720 }, { largura: 1080, altura: 1920 }));
});

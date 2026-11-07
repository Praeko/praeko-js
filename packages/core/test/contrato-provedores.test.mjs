import test from "node:test";
import assert from "node:assert/strict";
import { verificarProvedor } from "../src/contrato.mjs";
import * as youtube from "../src/provedores/youtube.mjs";
import * as youtubeApi from "../src/provedores/youtube-api.mjs";
import * as instagram from "../src/provedores/instagram.mjs";
import * as tiktok from "../src/provedores/tiktok.mjs";

test("contrato de provedor: YouTube (Node e sem Node), Instagram e TikTok cumprem a interface", () => {
  for (const [nome, mod] of Object.entries({ youtube, youtubeApi, instagram, tiktok })) assert.deepEqual(verificarProvedor(mod), [], nome);
});
test("contrato de provedor: aponta o que falta", () => {
  assert.ok(verificarProvedor({}).length >= 4);
  assert.match(verificarProvedor({ nome: "x", rede: "orkut", status() {}, publicar() {} }).join(), /rede/);
  assert.match(verificarProvedor({ nome: "x", rede: "instagram", status() {}, publicar() {}, preparar() {} }).join(), /antecedenciaMs/);
  assert.deepEqual(verificarProvedor({ nome: "x", rede: "tiktok", status() {}, publicar() {} }), []);
});

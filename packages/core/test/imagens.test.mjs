// Foto única: pedido (kind/images), limites do Instagram, post do Buffer com UM asset de imagem e contêiner de imagem da Meta. Nenhuma chamada de rede.
import test from "node:test";
import assert from "node:assert/strict";
import { montarFotoInstagram } from "../src/buffer-api.ts";
import { LIMITES_IMAGEM_INSTAGRAM, validarImagemInstagram, validarPedido } from "../src/contrato.ts";
import { REF_META, criarContainerImagem } from "../src/provedores/instagram-meta.ts";

const AGORA = Date.parse("2026-11-04T20:00:00Z");
const foto = { canalId: "CH", texto: "Legenda #a", imagemUrl: "https://praeko.app/v1/m/ID/TOK/foto.jpg", quando: "2026-11-08T15:00:00Z", agora: AGORA };
const pedidoImg = (extra = {}) => ({ titulo: "Foto", kind: "image", midia: { images: [{ midia: "M1", alt: "descrição" }] }, textos: { instagram: { texto: "Legenda" } }, destinos: [{ rede: "instagram", quando: "2026-11-08T15:00:00Z" }], ...extra });

test("montarFotoInstagram: UM asset de imagem, metadata type post, sem alt e sem metadados de vídeo", () => {
  const i = montarFotoInstagram(foto);
  assert.deepEqual(i, { channelId: "CH", schedulingType: "automatic", needsApproval: false, source: "arauto", mode: "customScheduled", dueAt: "2026-11-08T15:00:00.000Z", text: "Legenda #a", assets: [{ image: { url: foto.imagemUrl } }], metadata: { instagram: { type: "post", shouldShareToFeed: true } } });
  assert.equal(montarFotoInstagram({ ...foto, quando: null, agoraMesmo: true }).mode, "shareNow");
  assert.throws(() => montarFotoInstagram({ ...foto, imagemUrl: "http://x/f.jpg" }), /https/);
  assert.throws(() => montarFotoInstagram({ ...foto, quando: new Date(AGORA + 4 * 60e3).toISOString() }), /5 minutos/);
  assert.throws(() => montarFotoInstagram({ ...foto, texto: "" }), /vazia/);
  assert.throws(() => montarFotoInstagram({ ...foto, canalId: "" }), /canal/);
});
test("validarPedido: kind image exige media.images e não aceita vídeo, capa nem imagens por item; kind inválido é recusado; vídeo segue como sempre", () => {
  assert.deepEqual(validarPedido(pedidoImg()), []);
  assert.match(validarPedido(pedidoImg({ midia: {} }))[0], /media\.images is required/);
  assert.match(validarPedido(pedidoImg({ midia: { images: [{ midia: "M1" }], video: "V" } }))[0], /media\.video does not apply/);
  assert.match(validarPedido(pedidoImg({ midia: { images: [{ midia: "M1" }], capa: "C" } }))[0], /media\.cover does not apply/);
  assert.match(validarPedido(pedidoImg({ midia: { images: [{ midia: "M1", alt: "x".repeat(1001) }] } }))[0], /up to 1000/);
  assert.match(validarPedido(pedidoImg({ midia: { images: [{}] } }))[0], /must be the id of a media/);
  assert.match(validarPedido(pedidoImg({ destinos: [{ rede: "instagram", midia: { images: [] } }] }))[0], /images per item/);
  assert.match(validarPedido(pedidoImg({ kind: "slideshow" }))[0], /kind "slideshow" is invalid/);
  assert.deepEqual(validarPedido(pedidoImg({ kind: "carousel", midia: { images: [{ midia: "M1" }, { midia: "M2" }] } })), []);
  const video = { titulo: "V", midia: { video: "V1" }, textos: { instagram: { texto: "x" } }, destinos: [{ rede: "instagram" }] };
  assert.deepEqual(validarPedido(video), []); assert.deepEqual(validarPedido({ ...video, kind: "video" }), []);
  assert.match(validarPedido({ ...video, midia: { video: "V1", images: [] } })[0], /only applies to kind image/);
  assert.match(validarPedido({ ...video, midia: {} })[0], /midia\.video é obrigatório/);
});
test("validarImagemInstagram: JPEG, até 8 MB, proporção 4:5 a 1,91:1 são erros; largura fora de 320..1440 e dimensões desconhecidas são só avisos", () => {
  const ok = { mime: "image/jpeg", tamanho: 500_000, largura: 1080, altura: 1350 };
  assert.deepEqual(validarImagemInstagram(ok), { erros: [], avisos: [] });
  assert.equal(validarImagemInstagram({ ...ok, mime: "image/png" }).erros[0].codigo, "imagem_invalida");
  assert.deepEqual(validarImagemInstagram({ ...ok, tamanho: LIMITES_IMAGEM_INSTAGRAM.bytesMax }).erros, []);
  assert.equal(validarImagemInstagram({ ...ok, tamanho: LIMITES_IMAGEM_INSTAGRAM.bytesMax + 1 }).erros[0].codigo, "imagem_grande");
  for (const [l, a] of [[1080, 1350], [1080, 1080], [1080, 566], [1910, 1000], [800, 1000]]) assert.deepEqual(validarImagemInstagram({ ...ok, largura: l, altura: a }).erros, [], `${l}x${a}`);
  for (const [l, a] of [[1000, 1500], [1080, 1351], [2000, 1000], [1000, 500]]) assert.equal(validarImagemInstagram({ ...ok, largura: l, altura: a }).erros[0]?.codigo, "imagem_proporcao", `${l}x${a}`);
  assert.deepEqual(validarImagemInstagram({ ...ok, largura: 240, altura: 300 }).avisos.map((a) => a.codigo), ["image_small"]);
  assert.deepEqual(validarImagemInstagram({ ...ok, largura: 2160, altura: 2700 }).avisos.map((a) => a.codigo), ["image_will_be_resized"]);
  const sem = validarImagemInstagram({ ...ok, largura: null, altura: null });
  assert.deepEqual([sem.erros.length, sem.avisos.map((a) => a.codigo)], [0, ["image_dimensions_unknown"]], "dimensões desconhecidas: aviso, nunca recusa");
});
test("criarContainerImagem: POST /{ig}/media com image_url, caption e alt_text; sem media_type; recusa URL sem https, legenda vazia e alt grande", async () => {
  const vistas = [];
  const ctx = { segredos: { obter: async (ref) => (ref === REF_META ? JSON.stringify({ token: "TK-TESTE-1234567890", userId: "1784" }) : null) }, fetchFn: async (u, o = {}) => { vistas.push({ url: String(u), corpo: Object.fromEntries(new URLSearchParams(o.body)), metodo: o.method }); return new Response(JSON.stringify({ id: "CONT9" }), { status: 200 }); } };
  const r = await criarContainerImagem({ ctx, imagemUrl: "https://praeko.app/v1/m/ID/TOK/f.jpg", legenda: "Legenda", alt: "Texto alternativo" });
  assert.deepEqual(r, { id: "CONT9" });
  assert.equal(vistas[0].metodo, "POST"); assert.match(vistas[0].url, /graph\.facebook\.com\/v23\.0\/1784\/media$/);
  assert.deepEqual(vistas[0].corpo, { image_url: "https://praeko.app/v1/m/ID/TOK/f.jpg", caption: "Legenda", alt_text: "Texto alternativo", access_token: "TK-TESTE-1234567890" });
  await criarContainerImagem({ ctx, imagemUrl: "https://praeko.app/f.jpg", legenda: "L" });
  assert.equal("alt_text" in vistas[1].corpo, false, "sem alt, o campo não vai");
  await assert.rejects(criarContainerImagem({ ctx, imagemUrl: "http://x/f.jpg", legenda: "L" }), /https/);
  await assert.rejects(criarContainerImagem({ ctx, imagemUrl: "https://x/f.jpg", legenda: " " }), /legenda vazia/);
  await assert.rejects(criarContainerImagem({ ctx, imagemUrl: "https://x/f.jpg", legenda: "L", alt: "x".repeat(1001) }), /1000/);
  assert.equal(vistas.length, 2, "nada foi enviado nos casos recusados");
});

import test from "node:test";
import assert from "node:assert/strict";
import { canalDoServico, consultarPost, contarHashtags, montarReelInstagram, validarLegendaInstagram, LEGENDA_MAX } from "../src/buffer-api.mjs";
import { validarPedido } from "../src/contrato.mjs";
import { apagarPost, criarPost, gql } from "../src/buffer.mjs"; // o buffer.mjs reexporta (o CLI e os adaptadores continuam importando de lá)

const AGORA = Date.parse("2026-11-04T20:00:00Z");
const base = { canalId: "CH", texto: "Legenda #a #b", videoUrl: "https://arauto.exemplo/v1/m/ID/TOK/v.mp4", quando: "2026-11-08T15:00:00Z", agora: AGORA };

test("montarReelInstagram: Reel agendado no formato do Buffer (customScheduled, automatic, reel, miniatura)", () => {
  const i = montarReelInstagram(base);
  assert.deepEqual(i, { channelId: "CH", schedulingType: "automatic", needsApproval: false, source: "arauto", mode: "customScheduled", dueAt: "2026-11-08T15:00:00.000Z", text: "Legenda #a #b", assets: [{ video: { url: base.videoUrl, metadata: { thumbnailOffset: 0 } } }], metadata: { instagram: { type: "reel", shouldShareToFeed: true } } });
  assert.equal(montarReelInstagram({ ...base, miniaturaMs: 1500 }).assets[0].video.metadata.thumbnailOffset, 1500);
});
test("montarReelInstagram: shareNow não leva dueAt nem exige 5 min; o resto continua valendo", () => {
  const i = montarReelInstagram({ ...base, quando: null, agoraMesmo: true });
  assert.equal(i.mode, "shareNow"); assert.equal(i.dueAt, undefined);
  assert.throws(() => montarReelInstagram({ ...base, agoraMesmo: true, videoUrl: "http://inseguro/v.mp4" }), /https/);
});
test("montarReelInstagram: recusa horário a menos de 5 min, URL sem https, sem canal, legenda grande e hashtags demais", () => {
  assert.throws(() => montarReelInstagram({ ...base, quando: new Date(AGORA + 4 * 60e3).toISOString() }), /5 minutos/);
  assert.doesNotThrow(() => montarReelInstagram({ ...base, quando: new Date(AGORA + 5 * 60e3).toISOString() }));
  assert.throws(() => montarReelInstagram({ ...base, quando: "lixo" }), /inválido/);
  assert.throws(() => montarReelInstagram({ ...base, videoUrl: "http://x/v.mp4" }), /https/);
  assert.throws(() => montarReelInstagram({ ...base, videoUrl: "" }), /URL pública/);
  assert.throws(() => montarReelInstagram({ ...base, canalId: "" }), /canal/);
  assert.throws(() => montarReelInstagram({ ...base, texto: "x".repeat(LEGENDA_MAX + 1) }), /2201 caracteres/);
  assert.throws(() => montarReelInstagram({ ...base, texto: Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ") }), /31 hashtags/);
  assert.throws(() => montarReelInstagram({ ...base, texto: "  " }), /vazia/);
});
test("hashtags: conta #palavra com acento e underscore, ignora # no meio de palavra", () => {
  assert.equal(contarHashtags("oi #devbrasil #vida_de_dev #açaí e a#b"), 3);
  assert.deepEqual(validarLegendaInstagram("ok #a"), []);
});
test("canalDoServico: o único canal do serviço, o id fixo, ou erro com a lista", () => {
  const cs = [{ id: "A", nome: "yt", servico: "youtube" }, { id: "B", nome: "ig1", servico: "instagram" }];
  assert.equal(canalDoServico(cs, "instagram").id, "B");
  assert.equal(canalDoServico(cs, "instagram", "A").id, "A");
  assert.throws(() => canalDoServico(cs, "instagram", "Z"), /não existe/);
  assert.throws(() => canalDoServico(cs, "tiktok"), /nenhum canal tiktok/);
  assert.throws(() => canalDoServico([...cs, { id: "C", nome: "ig2", servico: "instagram" }], "instagram"), /2 canais instagram.*BUFFER_CANAL_INSTAGRAM/);
});
test("consultarPost/criarPost/apagarPost: GraphQL com Bearer e erros do Buffer viram exceção", async () => {
  const chamadas = [];
  const fetchFn = (resposta) => async (url, init) => { chamadas.push({ url, auth: init.headers.authorization, corpo: JSON.parse(init.body) }); return new Response(JSON.stringify(resposta), { status: 200 }); };
  const p = await consultarPost("P1", { chave: "K", fetchFn: fetchFn({ data: { post: { id: "P1", status: "sent", sentAt: "2026-11-07T13:00:00Z", externalLink: "https://i/x" } } }) });
  assert.equal(p.status, "sent"); assert.equal(chamadas[0].url, "https://api.buffer.com"); assert.equal(chamadas[0].auth, "Bearer K"); assert.deepEqual(chamadas[0].corpo.variables, { id: "P1" });
  await assert.rejects(consultarPost("P2", { chave: "K", fetchFn: fetchFn({ data: { post: null } }) }), /não achou o post P2/);
  await assert.rejects(criarPost({}, { chave: "K", fetchFn: fetchFn({ data: { createPost: { message: "vídeo inválido" } } }) }), /Buffer recusou o post: vídeo inválido/);
  assert.equal(await apagarPost("P1", { chave: "K", fetchFn: fetchFn({ data: { deletePost: { __typename: "DeletePostSuccess" } } }) }), true);
  await assert.rejects(gql("q", {}, { fetchFn: fetchFn({}) }), /sem chave do Buffer/);
  await assert.rejects(gql("q", {}, { chave: "K", fetchFn: fetchFn({ errors: [{ message: "Cannot query field" }] }) }), /Buffer: Cannot query field/);
});
test("contrato: destinos[].midia precisa ser { video?, capa? } com ids em texto", () => {
  const ok = { titulo: "t", midia: { video: "V" }, textos: { instagram: { texto: "x" } }, destinos: [{ rede: "instagram", quando: "2026-11-08T15:00:00Z", midia: { video: "V2", capa: "C" } }] };
  assert.deepEqual(validarPedido(ok), []);
  assert.match(validarPedido({ ...ok, destinos: [{ rede: "instagram", midia: "x" }] })[0], /midia do destino/);
  assert.match(validarPedido({ ...ok, destinos: [{ rede: "instagram", midia: { video: 7 } }] })[0], /midia do destino/);
  assert.match(validarPedido({ ...ok, destinos: [{ rede: "instagram", midia: [] }] })[0], /midia do destino/);
});

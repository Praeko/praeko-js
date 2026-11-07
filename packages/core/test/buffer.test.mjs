import test from "node:test";
import assert from "node:assert/strict";
import { parseQuando, montarPosts, textosPorRede, gql, listarCanais, escolherCanais, criarPost, apagarPost } from "../src/index.ts";
import { chaveObjeto, configHospedagem, subir } from "../src/hospedagem.ts";

const config = { links: { jogo: "https://exemplo.com/" }, buffer: { youtube: { categoriaId: 28 } } };
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
test("montarPosts: um post por rede, tipos e metadados", () => {
  const q = "2026-11-06T20:30:00.000Z";
  const ps = montarPosts({ config, ep, canais: { youtube: "c1", instagram: "c2", tiktok: "c3" }, videoUrl: "https://x/v.mp4", quando: { todas: q }, redes: ["youtube", "instagram", "tiktok"] });
  assert.equal(ps.length, 3);
  const [yt, ig, tt] = ps.map((p) => p.input);
  assert.equal(yt.mode, "customScheduled"); assert.equal(yt.schedulingType, "automatic"); assert.equal(yt.dueAt, q);
  assert.equal(yt.metadata.youtube.title, "Título"); assert.equal(yt.metadata.youtube.categoryId, "28"); assert.equal(yt.metadata.youtube.madeForKids, false);
  assert.equal(ig.metadata.instagram.type, "reel"); assert.equal(ig.metadata.instagram.firstComment, undefined);
  assert.ok(tt.assets[0].video.metadata.thumbnailOffset >= 0);
  assert.ok(yt.text.includes("utm_source=youtube") && yt.text.includes("#a"));
  assert.ok(ig.text.endsWith("#b"));
});
test("montarPosts: lembrete usa notification e falta de horário é erro", () => {
  const p = montarPosts({ config, ep, canais: { youtube: "c" }, videoUrl: "https://x/v.mp4", quando: { youtube: "2026-11-06T20:30:00.000Z" }, redes: ["youtube"], lembrete: true });
  assert.equal(p[0].input.schedulingType, "notification");
  assert.throws(() => montarPosts({ config, ep, canais: { youtube: "c" }, videoUrl: "u", quando: {}, redes: ["youtube"] }), /sem horário/);
});
test("textosPorRede de longo inclui capítulos", () => {
  const t = textosPorRede({ config, ep: { ...ep, formato: "longo", capitulos: [{ t: 0, titulo: "A" }, { t: 20, titulo: "B" }, { t: 40, titulo: "C" }] } });
  assert.ok(t.youtube.texto.includes("0:00 A") && t.youtube.texto.includes("0:40 C"));
});
const resp = (corpo, ok = true) => async () => ({ ok, status: ok ? 200 : 401, text: async () => JSON.stringify(corpo) });
test("gql: envia Bearer e trata erro", async () => {
  let visto;
  const f = async (url, o) => { visto = { url, o }; return { ok: true, status: 200, text: async () => JSON.stringify({ data: { ok: 1 } }) }; };
  assert.deepEqual(await gql("query{x}", {}, { chave: "K", fetchFn: f }), { ok: 1 });
  assert.equal(visto.url, "https://api.buffer.com"); assert.equal(visto.o.headers.authorization, "Bearer K");
  await assert.rejects(gql("q", {}, { chave: "K", fetchFn: resp({ errors: [{ message: "ruim" }] }, false) }), /ruim/);
  await assert.rejects(gql("q", {}, { fetchFn: resp({}) }), /sem chave/);
});
test("listarCanais + escolherCanais", async () => {
  const f = async (_u, o) => { const q = JSON.parse(o.body).query; const data = q.includes("organizations") ? { account: { organizations: [{ id: "o1", name: "Org" }] } } : { channels: [{ id: "a", displayName: "YT", service: "youtube" }, { id: "b", name: "ig", service: "instagram" }, { id: "c", name: "ig2", service: "instagram" }] }; return { ok: true, status: 200, text: async () => JSON.stringify({ data }) }; };
  const cs = await listarCanais({ chave: "K", fetchFn: f });
  assert.equal(cs.length, 3);
  const r = escolherCanais({ config, canais: cs, redes: ["youtube", "instagram", "tiktok"] });
  assert.equal(r.canais.youtube, "a"); assert.equal(r.faltam.length, 2);
  assert.equal(escolherCanais({ config: { buffer: { canais: { instagram: "c" } } }, canais: cs, redes: ["instagram"] }).canais.instagram, "c");
});
test("criarPost e apagarPost tratam MutationError", async () => {
  assert.equal((await criarPost({}, { chave: "K", fetchFn: resp({ data: { createPost: { post: { id: "p1", dueAt: "x" } } } }) })).id, "p1");
  await assert.rejects(criarPost({}, { chave: "K", fetchFn: resp({ data: { createPost: { message: "URL inválida" } } }) }), /URL inválida/);
  assert.equal(await apagarPost("p1", { chave: "K", fetchFn: resp({ data: { deletePost: { __typename: "DeletePostSuccess" } } }) }), true);
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
test("montarPosts: miniaturaMs por parâmetro vale para Instagram e TikTok", () => {
  const ps = montarPosts({ config, ep, canais: { instagram: "c", tiktok: "d" }, videoUrl: "u", quando: { todas: "2026-11-06T20:30:00.000Z" }, redes: ["instagram", "tiktok"], miniaturaMs: 0 });
  assert.equal(ps[0].input.assets[0].video.metadata.thumbnailOffset, 0);
  assert.equal(ps[1].input.assets[0].video.metadata.thumbnailOffset, 0);
});

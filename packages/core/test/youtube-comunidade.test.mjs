import test from "node:test";
import assert from "node:assert/strict";
import { editarVideo, listarComentarios, listarVideos, lerVideo, responderComentario, trocarHashtags } from "../src/provedores/youtube-comunidade.ts";

const resp = (corpo, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(corpo), json: async () => corpo });
/** ctx com rotas simuladas: { "trecho da url": (url, init) => corpo | [corpo, status] } na ordem; guarda as chamadas. */
function ctxCom(rotas) {
  const chamadas = [];
  return {
    chamadas,
    segredos: { obter: async () => JSON.stringify({ access_token: "T", refresh_token: "R", expiry: Date.now() + 3600e3 }), guardar: async () => {} },
    fetchFn: async (url, init = {}) => {
      url = String(url); chamadas.push({ url, metodo: init.method || "GET", corpo: init.body ? JSON.parse(init.body) : undefined });
      if (url.includes("/channels?part=id&mine=true")) return resp({ items: [{ id: "UCme" }] });
      for (const [trecho, f] of rotas) if (url.includes(trecho)) { const r = typeof f === "function" ? f(url, init) : f; return Array.isArray(r) ? resp(r[0], r[1]) : resp(r); }
      throw new Error("rota não simulada: " + url);
    },
  };
}

test("listarVideos: playlist de uploads, paginação e estatísticas", async () => {
  const ctx = ctxCom([
    ["/channels?part=contentDetails", { items: [{ contentDetails: { relatedPlaylists: { uploads: "UUme" } } }] }],
    ["/playlistItems", (u) => (u.includes("pageToken=P2") ? { items: [{ contentDetails: { videoId: "v3" } }] } : { items: [{ contentDetails: { videoId: "v1" } }, { contentDetails: { videoId: "v2" } }], nextPageToken: "P2" })],
    ["/videos?part=snippet,status,statistics,contentDetails", (u) => ({ items: u.includes("&id=v3") ? [{ id: "v3", snippet: { title: "C" }, status: { privacyStatus: "public" } }] : [
      { id: "v2", snippet: { title: "B", publishedAt: "2026-11-02T00:00:00Z" }, status: { privacyStatus: "private", publishAt: "2026-11-08T15:00:00Z" }, statistics: { viewCount: "12", likeCount: "3", commentCount: "1" } },
      { id: "v1", snippet: { title: "A" }, status: { privacyStatus: "public" } }] })],
  ]);
  const p1 = await listarVideos({ ctx, max: 2 });
  assert.deepEqual(p1.videos.map((v) => v.id), ["v1", "v2"]); // ordem da playlist, não a do videos.list
  assert.equal(p1.proxima, "P2");
  assert.equal(p1.videos[1].visualizacoes, 12); assert.equal(p1.videos[1].publishAt, "2026-11-08T15:00:00Z"); assert.equal(p1.videos[0].visualizacoes, null);
  const p2 = await listarVideos({ ctx, max: 2, pagina: "P2" });
  assert.deepEqual(p2.videos.map((v) => v.id), ["v3"]); assert.equal(p2.proxima, null);
});

test("lerVideo: erro claro quando não existe", async () => {
  const ctx = ctxCom([["/videos?part=snippet,status", { items: [] }]]);
  await assert.rejects(lerVideo({ ctx, videoId: "zz" }), (e) => e.status === 404 && /não existe/.test(e.message));
});

test("editarVideo: preserva categoria e idioma, só troca o que foi pedido", async () => {
  const snippet = { title: "Antigo", description: "texto\n\n#a #b", tags: ["x"], categoryId: "28", defaultLanguage: "pt", defaultAudioLanguage: "pt-BR", channelId: "UCme", publishedAt: "2026-01-01T00:00:00Z", thumbnails: {} };
  const ctx = ctxCom([["/videos?part=snippet&id=", { items: [{ id: "v1", snippet }] }], ["/videos?part=snippet", { id: "v1" }]]);
  const r = await editarVideo({ ctx, videoId: "v1", descricao: "texto\n\n#c" });
  assert.equal(r.escrito, true);
  const put = ctx.chamadas.find((c) => c.metodo === "PUT");
  assert.deepEqual(put.corpo, { id: "v1", snippet: { title: "Antigo", description: "texto\n\n#c", tags: ["x"], categoryId: "28", defaultLanguage: "pt", defaultAudioLanguage: "pt-BR" } });
});
test("editarVideo: simular e 'nada muda' não escrevem; entradas inválidas são recusadas", async () => {
  const rotas = [["/videos?part=snippet&id=", { items: [{ id: "v1", snippet: { title: "T", description: "D", categoryId: "28" } }] }]];
  const ctx = ctxCom(rotas);
  const s = await editarVideo({ ctx, videoId: "v1", titulo: "Novo", simular: true });
  assert.deepEqual([s.escrito, s.mudou, s.antes.titulo, s.depois.titulo], [false, true, "T", "Novo"]);
  assert.equal((await editarVideo({ ctx, videoId: "v1", titulo: "T" })).escrito, false);
  assert.equal(ctx.chamadas.some((c) => c.metodo === "PUT"), false);
  await assert.rejects(editarVideo({ ctx, videoId: "v1" }), /nada para mudar/);
  await assert.rejects(editarVideo({ ctx, videoId: "v1", titulo: "a<b" }), /título inválido/);
  await assert.rejects(editarVideo({ ctx, videoId: "v1", descricao: "x".repeat(5001) }), /descrição inválida/);
});

const topo = (id, autor, canal, texto, extra = {}) => ({ id, snippet: { videoId: "v1", topLevelComment: { id, snippet: { authorDisplayName: autor, authorChannelId: { value: canal }, textOriginal: texto, publishedAt: "2026-11-03T00:00:00Z", likeCount: 2 } }, totalReplyCount: extra.total ?? 0 }, ...(extra.replies ? { replies: { comments: extra.replies } } : {}) });
const resposta = (canal, texto) => ({ id: "r-" + texto, snippet: { authorDisplayName: "x", authorChannelId: { value: canal }, textOriginal: texto, publishedAt: "2026-11-03T01:00:00Z" } });

test("listarComentarios: respondido, do dono, cortado (consulta as respostas) e sem resposta", async () => {
  const ctx = ctxCom([
    ["/commentThreads", { items: [
      topo("t1", "Ana", "UCana", "oi", { total: 1, replies: [resposta("UCme", "valeu")] }),
      topo("t2", "Eu", "UCme", "fixado"),
      topo("t3", "Bia", "UCbia", "dúvida", { total: 6, replies: [resposta("UCout", "1")] }),
      topo("t4", "Caio", "UCcaio", "sem resposta"),
    ] }],
    ["/comments?part=snippet&parentId=t3", { items: [{ snippet: { authorChannelId: { value: "UCout" } } }, { snippet: { authorChannelId: { value: "UCme" } } }] }],
  ]);
  const todos = await listarComentarios({ ctx, max: 10 });
  assert.deepEqual(todos.comentarios.map((c) => [c.id, c.respondido, c.doDono]), [["t1", true, false], ["t2", false, true], ["t3", true, false], ["t4", false, false]]);
  assert.equal(todos.comentarios[0].respostas[0].texto, "valeu");
  const so = await listarComentarios({ ctx, max: 10, semResposta: true });
  assert.deepEqual(so.comentarios.map((c) => c.id), ["t4"]);
});
test("listarComentarios: com filtro varre as páginas até juntar o máximo", async () => {
  let n = 0;
  const ctx = ctxCom([["/commentThreads", (u) => { n++; return u.includes("pageToken=B") ? { items: [topo("t3", "C", "UC3", "c")] } : { items: [topo("t1", "A", "UC1", "a"), topo("t2", "B", "UC2", "b")], nextPageToken: "B" }; }]]);
  const r = await listarComentarios({ ctx, max: 3, semResposta: true, videoId: "v1" });
  assert.deepEqual(r.comentarios.map((c) => c.id), ["t1", "t2", "t3"]); assert.equal(n, 2);
  assert.ok(ctx.chamadas.some((c) => c.url.includes("videoId=v1")));
  const um = await listarComentarios({ ctx: ctxCom([["/commentThreads", { items: [topo("t1", "A", "UC1", "a"), topo("t2", "B", "UC2", "b")], nextPageToken: "B" }]]), max: 1 });
  assert.equal(um.comentarios.length, 1); assert.equal(um.proxima, "B");
});

test("responderComentario: corpo certo e validação", async () => {
  const ctx = ctxCom([["/comments?part=snippet", { id: "c9", snippet: { textOriginal: "obrigado!" } }]]);
  const r = await responderComentario({ ctx, parentId: "t1", texto: "obrigado!" });
  assert.equal(r.id, "c9");
  assert.deepEqual(ctx.chamadas.find((c) => c.metodo === "POST").corpo, { snippet: { parentId: "t1", textOriginal: "obrigado!" } });
  await assert.rejects(responderComentario({ ctx, parentId: "t1", texto: "  " }), /texto inválido/);
  await assert.rejects(responderComentario({ ctx, texto: "oi" }), /falta o id/);
});

test("erro de cota vira mensagem clara com status", async () => {
  const ctx = ctxCom([["/channels?part=contentDetails", [{ error: { code: 403, message: "quota", errors: [{ reason: "quotaExceeded" }] } }, 403]]]);
  await assert.rejects(listarVideos({ ctx }), (e) => e.status === 403 && /cota da API do YouTube esgotada/.test(e.message));
});

test("trocarHashtags: substitui a última linha de hashtags ou acrescenta", () => {
  assert.equal(trocarHashtags("Texto\n\n🔗 link\n\n#quiz #python", "#shorts devbrasil"), "Texto\n\n🔗 link\n\n#shorts #devbrasil");
  assert.equal(trocarHashtags("Texto sem tags", "#a"), "Texto sem tags\n\n#a");
  assert.equal(trocarHashtags("", "#a"), "#a");
  assert.throws(() => trocarHashtags("x", "  "), /ao menos uma/);
});

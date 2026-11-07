// praeko studio agendar --via praeko: fetch FALSO, nenhuma chamada de rede real, nada é enviado de verdade.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agendar } from "../src/agendar.mjs";

const SLUG = "meu-ep";
const META = { titulo: "Um título", campanha: "camp", formato: "short", yt: { descricao: "Desc do YouTube", comentarioFixo: "Fixa" }, ig: { legenda: "Legenda IG" }, tiktok: { legenda: "Legenda TT" }, hashtags: { youtube: ["#a"], instagram: ["#b"], tiktok: ["#c"] } };
const QUANDO = "2099-11-06T17:30"; // distante e sem fuso: vale o do Brasil (-03:00)
const sem = async () => {};

/** Projeto de teste: marca.json, src/index.ts, episódio com publicacao.json, vídeo e capa falsos (bytes quaisquer). */
function projeto(publicacao = {}) {
  const raiz = mkdtempSync(join(tmpdir(), "praeko-studio-praeko-"));
  mkdirSync(join(raiz, "src")); writeFileSync(join(raiz, "src", "index.ts"), "");
  writeFileSync(join(raiz, "marca.json"), JSON.stringify({ links: { jogo: "https://exemplo.com/" }, publicacao }));
  mkdirSync(join(raiz, "episodios", SLUG), { recursive: true }); mkdirSync(join(raiz, "out"));
  writeFileSync(join(raiz, "episodios", SLUG, "publicacao.json"), JSON.stringify(META));
  writeFileSync(join(raiz, "out", `${SLUG}.mp4`), "video-falso"); writeFileSync(join(raiz, "out", `${SLUG}-capa.png`), "capa-falsa");
  return raiz;
}
const arqAg = (raiz, ext = "") => join(raiz, "episodios", SLUG, `agendamento${ext}.json`);

/** Roda agendar dentro do projeto, com console.log capturado e fetch falso. */
async function rodar(raiz, args, { rotas, chave = "arauto_TESTE", guardar } = {}) {
  const chamadas = [], saida = [], cwd = process.cwd(), log = console.log;
  const fetchFn = async (url, init) => {
    const u = new URL(url), c = { metodo: init.method, caminho: u.pathname, headers: init.headers, corpo: init.body };
    chamadas.push(c);
    const r = (await rotas?.(c)) ?? { corpo: {} };
    const status = r.status ?? 200;
    return { ok: status < 400, status, text: async () => JSON.stringify(r.corpo ?? {}) };
  };
  process.chdir(raiz); console.log = (...x) => saida.push(x.join(" "));
  let codigo, erro;
  try { codigo = await agendar(args, { fetchFn, espera: sem, obterChave: (ref) => (ref === "praeko/principal" ? chave : null), guardarChave: guardar || (() => { throw new Error("não devia guardar"); }) }); }
  catch (e) { erro = e; }
  finally { process.chdir(cwd); console.log = log; }
  return { chamadas, texto: saida.join("\n"), codigo, erro };
}
const CANAIS = { channels: [{ network: "youtube", id: "yt1", name: "Canal YT", connected: true }, { network: "instagram", id: "ig1", name: "meucanal", connected: true, default: true }, { network: "instagram", id: "ig2", name: "outro", connected: true }, { network: "tiktok", id: "tk1", name: "tt", connected: true }] };
/** servidor falso feliz: canais, mídia, post. */
function feliz({ postId = SLUG } = {}) {
  let m = 0;
  return (c) => {
    if (c.metodo === "GET" && c.caminho === "/v1/channels") return { corpo: CANAIS };
    if (c.metodo === "POST" && c.caminho === "/v1/media") return { corpo: { id: `m${++m}`, state: "uploading" } };
    if (c.metodo === "PUT" && c.caminho.endsWith("/content")) return { corpo: { state: "ready" } };
    if (c.metodo === "POST" && c.caminho === "/v1/posts") { const b = JSON.parse(c.corpo); return { status: 201, corpo: { id: b.id, items: b.items.map((i, n) => ({ id: `it${n + 1}`, network: i.network, state: "scheduled", scheduledFor: new Date(i.scheduledFor).toISOString() })) } }; }
    return { status: 404, corpo: { error: { code: "route_not_found", message: "rota?" } } };
  };
}
const escrita = (chamadas) => chamadas.filter((c) => c.metodo !== "GET");

test("o provedor padrão continua sendo o Buffer (sem --via e sem marca.publicacao.provedor)", async () => {
  const raiz = projeto();
  const r = await rodar(raiz, [SLUG, "--quando", QUANDO]);
  assert.equal(r.erro, undefined); assert.equal(r.codigo, 0);
  assert.match(r.texto, /SIMULAÇÃO \(nada será enviado; use --enviar\)/); assert.doesNotMatch(r.texto, /PRAEKO/);
  assert.equal(r.chamadas.length, 0);
});
test("marca.json → publicacao.provedor escolhe o padrão; --via buffer vence; provedor inválido dá erro claro", async () => {
  const raiz = projeto({ provedor: "praeko" });
  assert.match((await rodar(raiz, [SLUG, "--quando", QUANDO, "--via", "buffer"])).texto, /SIMULAÇÃO \(nada será enviado/);
  assert.match((await rodar(raiz, [SLUG, "--quando", QUANDO], { chave: null })).texto, /SIMULAÇÃO NO PRAEKO/);
  assert.match((await rodar(raiz, [SLUG, "--quando", QUANDO, "--via", "zap"])).erro.message, /provedor "zap" desconhecido.*buffer ou praeko/);
  assert.match((await rodar(projeto({ provedor: "arauto" }), [SLUG, "--quando", QUANDO])).erro.message, /publicacao\.provedor/);
});
test("--via praeko sem chave: simula sem rede, mas --enviar recusa com mensagem útil e não escreve nada", async () => {
  const raiz = projeto();
  const sim = await rodar(raiz, [SLUG, "--quando", QUANDO, "--via", "praeko"], { chave: null });
  assert.equal(sim.codigo, 0); assert.equal(sim.chamadas.length, 0);
  const env = await rodar(raiz, [SLUG, "--quando", QUANDO, "--via", "praeko", "--enviar"], { chave: null });
  assert.match(env.erro.message, /sem chave do Praeko.*--via praeko --chave/); assert.equal(env.chamadas.length, 0);
  assert.ok(!existsSync(arqAg(raiz)));
});
test("simulação com chave só lê os canais (nenhuma chamada de escrita), mostra o plano e não grava agendamento", async () => {
  const raiz = projeto();
  const r = await rodar(raiz, [SLUG, "--quando", QUANDO, "--via", "praeko"], { rotas: feliz() });
  assert.equal(r.codigo, 0, r.erro?.message);
  assert.deepEqual(r.chamadas.map((c) => `${c.metodo} ${c.caminho}`), ["GET /v1/channels"]);
  assert.equal(escrita(r.chamadas).length, 0);
  assert.match(r.texto, /SIMULAÇÃO NO PRAEKO/); assert.match(r.texto, /YouTube .*agendado \(o Praeko sobe privado e agenda\)/);
  assert.match(r.texto, /Instagram .*via buffer/); assert.match(r.texto, /TikTok .*rascunho/);
  assert.ok(!existsSync(arqAg(raiz)));
});
test("simulação avisa canal não conectado, mas só o --enviar recusa", async () => {
  const raiz = projeto();
  const rotas = (c) => ({ corpo: { channels: [{ network: "youtube", id: "yt1", connected: true }, { network: "tiktok", connected: false }, { network: "instagram", id: "ig1", connected: true }] } });
  const sim = await rodar(raiz, [SLUG, "--quando", QUANDO, "--via", "praeko"], { rotas });
  assert.match(sim.texto, /TikTok: não está conectado no Praeko/);
  const env = await rodar(raiz, [SLUG, "--quando", QUANDO, "--via", "praeko", "--enviar"], { rotas });
  assert.match(env.erro.message, /TikTok: não está conectado/); assert.equal(escrita(env.chamadas).length, 0);
});
test("--enviar: sobe vídeo e capa (mídia simples), cria o post com id do slug, horário fixo com fuso e grava agendamento.json do Praeko", async () => {
  const raiz = projeto();
  const r = await rodar(raiz, [SLUG, "--quando", QUANDO, "--via", "praeko", "--enviar", "--sem-capa-no-quadro"], { rotas: feliz() });
  assert.equal(r.erro, undefined, r.erro?.message); assert.equal(r.codigo, 0);
  assert.deepEqual(r.chamadas.map((c) => `${c.metodo} ${c.caminho}`), ["GET /v1/channels", "POST /v1/media", "PUT /v1/media/m1/content", "POST /v1/media", "PUT /v1/media/m2/content", "POST /v1/posts"]);
  for (const c of r.chamadas) { assert.equal(c.headers.authorization, "Bearer arauto_TESTE"); assert.equal(c.headers["x-arauto-contract"], "en"); }
  assert.deepEqual([JSON.parse(r.chamadas[1].corpo), JSON.parse(r.chamadas[3].corpo)].map((b) => [b.type, b.name, b.mime, b.simple]), [["video", `${SLUG}.mp4`, "video/mp4", true], ["cover", `${SLUG}-capa.png`, "image/png", true]]);
  const post = JSON.parse(r.chamadas[5].corpo);
  assert.equal(post.id, SLUG); assert.equal(post.title, "Um título"); assert.deepEqual(post.media, { video: "m1", cover: "m2" });
  assert.deepEqual(post.items, [
    { network: "youtube", scheduledFor: "2099-11-06T17:30:00-03:00", mode: "scheduled" },
    { network: "instagram", scheduledFor: "2099-11-06T17:30:00-03:00", via: "buffer" },
    { network: "tiktok", scheduledFor: "2099-11-06T17:30:00-03:00", mode: "draft" },
  ]);
  assert.equal(post.texts.youtube.title, "Um título"); assert.equal(post.options.format, "short");
  const ag = JSON.parse(readFileSync(arqAg(raiz), "utf8"));
  assert.equal(ag.provedor, "praeko"); assert.equal(ag.postId, SLUG); assert.equal(ag.slug, SLUG); assert.equal(ag.videoUrl, null);
  assert.deepEqual(ag.posts.map((x) => [x.rede, x.id, x.postId]), [["youtube", "it1", SLUG], ["instagram", "it2", SLUG], ["tiktok", "it3", SLUG]]);
  assert.ok(ag.posts.every((x) => x.dueAt));
  assert.doesNotMatch(r.texto + JSON.stringify(ag), /arauto_TESTE/);
});
test("--redes e horários por rede: só os itens escolhidos, cada um no seu horário", async () => {
  const raiz = projeto();
  const r = await rodar(raiz, [SLUG, "--via", "praeko", "--yt", "2099-11-06T17:30", "--tt", "2099-11-06T19:00", "--redes", "yt,tt", "--enviar", "--sem-capa-no-quadro"], { rotas: feliz() });
  assert.equal(r.erro, undefined, r.erro?.message);
  const post = JSON.parse(r.chamadas.at(-1).corpo);
  assert.deepEqual(post.items.map((i) => [i.network, i.scheduledFor]), [["youtube", "2099-11-06T17:30:00-03:00"], ["tiktok", "2099-11-06T19:00:00-03:00"]]);
});
test("opções do marca.json: TikTok direto, Instagram via meta (25 min) e canal fixo", async () => {
  const raiz = projeto({ praeko: { tiktok: { modo: "direto" }, instagram: { via: "meta" }, canais: { instagram: "ig2" } } });
  const rotas = (c) => (c.caminho === "/v1/channels" ? { corpo: { channels: [...CANAIS.channels.map((x) => (x.network === "instagram" ? { ...x, meta: { connected: true } } : x))] } } : feliz()(c));
  const r = await rodar(raiz, [SLUG, "--quando", QUANDO, "--via", "praeko", "--enviar"], { rotas });
  assert.equal(r.erro, undefined, r.erro?.message);
  const post = JSON.parse(r.chamadas.at(-1).corpo);
  assert.deepEqual(post.items.find((i) => i.network === "tiktok"), { network: "tiktok", scheduledFor: "2099-11-06T17:30:00-03:00", mode: "direct" });
  assert.deepEqual(post.items.find((i) => i.network === "instagram"), { network: "instagram", scheduledFor: "2099-11-06T17:30:00-03:00", channel: "ig2", via: "meta" });
  assert.deepEqual(post.options.tiktok, { privacy: "SELF_ONLY" });
  // via meta sem a Meta conectada no Praeko: recusa antes de subir qualquer coisa
  const sem = await rodar(projeto({ praeko: { instagram: { via: "meta" } } }), [SLUG, "--quando", QUANDO, "--via", "praeko", "--enviar"], { rotas: feliz() });
  assert.match(sem.erro.message, /API da Meta não está conectada/); assert.equal(escrita(sem.chamadas).length, 0);
  // horário a menos de 25 min no Instagram via meta
  const perto = new Date(Date.now() + 10 * 60e3).toISOString();
  const curto = await rodar(projeto({ praeko: { instagram: { via: "meta" } } }), [SLUG, "--via", "praeko", "--redes", "ig", "--quando", perto], { rotas: feliz() });
  assert.match(curto.erro.message, /menos de 25 minutos/);
});
test("--lembrete não existe no Praeko: recusa com mensagem clara; --url também", async () => {
  const raiz = projeto();
  assert.match((await rodar(raiz, [SLUG, "--quando", QUANDO, "--via", "praeko", "--lembrete"])).erro.message, /--lembrete não existe no Praeko.*--via buffer/);
  assert.match((await rodar(raiz, [SLUG, "--quando", QUANDO, "--via", "praeko", "--url", "https://x/v.mp4"])).erro.message, /--url é do Buffer/);
});
test("falha ao criar o post: erro do servidor em português e a mídia que subiu é removida (sem órfãs)", async () => {
  const raiz = projeto();
  const base = feliz();
  const rotas = (c) => (c.metodo === "POST" && c.caminho === "/v1/posts" ? { status: 422, corpo: { error: { code: "invalid_field", message: "instagram: legenda longa demais" } } } : c.metodo === "DELETE" ? { corpo: {} } : base(c));
  const r = await rodar(raiz, [SLUG, "--quando", QUANDO, "--via", "praeko", "--enviar", "--sem-capa-no-quadro"], { rotas });
  assert.match(r.erro.message, /HTTP 422, invalid_field.*legenda longa demais/);
  assert.deepEqual(r.chamadas.filter((c) => c.metodo === "DELETE").map((c) => c.caminho), ["/v1/media/m1", "/v1/media/m2"]);
  assert.ok(!existsSync(arqAg(raiz)));
});
test("id já existe: com post cancelado usa slug-2; com as mesmas redes ainda vivas, recusa", async () => {
  const base = feliz();
  const existe = (estado) => (c) => c.metodo === "POST" && c.caminho === "/v1/posts" && JSON.parse(c.corpo).id === SLUG ? { status: 409, corpo: { error: { code: "id_exists", message: "já existe" } } } : c.metodo === "GET" && c.caminho === `/v1/posts/${SLUG}` ? { corpo: { id: SLUG, items: [{ network: "youtube", state: estado }] } } : base(c);
  const r = await rodar(projeto(), [SLUG, "--quando", QUANDO, "--via", "praeko", "--redes", "yt", "--enviar", "--sem-capa-no-quadro"], { rotas: existe("canceled") });
  assert.equal(r.erro, undefined, r.erro?.message);
  assert.equal(JSON.parse(r.chamadas.at(-1).corpo).id, `${SLUG}-2`);
  const v = await rodar(projeto(), [SLUG, "--quando", QUANDO, "--via", "praeko", "--redes", "yt", "--enviar", "--sem-capa-no-quadro"], { rotas: existe("scheduled") });
  assert.match(v.erro.message, /já existe no Praeko com YouTube \(agendado\)/);
});
test("--status e --cancelar usam o postId do agendamento.json; o cancelamento deixa o que já saiu", async () => {
  const raiz = projeto();
  await rodar(raiz, [SLUG, "--quando", QUANDO, "--via", "praeko", "--enviar", "--sem-capa-no-quadro"], { rotas: feliz() });
  const rotas = (c) => (c.metodo === "GET" ? { corpo: { id: SLUG, title: "Um título", items: [{ network: "youtube", state: "scheduled", scheduledFor: "2099-11-06T20:30:00Z" }, { network: "tiktok", state: "sent", url: "https://tt/x" }] } } : { corpo: { id: SLUG, canceled: ["it1", "it2"], kept: [{ network: "tiktok", state: "sent" }] } });
  const st = await rodar(raiz, [SLUG, "--status"], { rotas }); // sem --via: segue o provedor do agendamento
  assert.equal(st.erro, undefined, st.erro?.message);
  assert.deepEqual(st.chamadas.map((c) => `${c.metodo} ${c.caminho}`), [`GET /v1/posts/${SLUG}`]);
  assert.match(st.texto, /YouTube\s+agendado/); assert.match(st.texto, /TikTok\s+enviado .*https:\/\/tt\/x/);
  const ca = await rodar(raiz, [SLUG, "--cancelar", "--via", "praeko"], { rotas });
  assert.deepEqual(ca.chamadas.map((c) => `${c.metodo} ${c.caminho}`), [`DELETE /v1/posts/${SLUG}`]);
  assert.match(ca.texto, /cancelado no Praeko: meu-ep \(2 item/); assert.match(ca.texto, /TikTok ficou \(enviado\)/);
  assert.ok(!existsSync(arqAg(raiz)) && existsSync(arqAg(raiz, ".cancelado")));
});
test("--cancelar --redes: só quando a rede ocupa o post inteiro (o Praeko cancela o post todo)", async () => {
  const raiz = projeto();
  await rodar(raiz, [SLUG, "--quando", QUANDO, "--via", "praeko", "--enviar", "--sem-capa-no-quadro"], { rotas: feliz() });
  const r = await rodar(raiz, [SLUG, "--cancelar", "--redes", "yt"], { rotas: () => ({ corpo: {} }) });
  assert.match(r.erro.message, /cancela o post inteiro.*YouTube/); assert.equal(escrita(r.chamadas).length, 0);
  assert.ok(existsSync(arqAg(raiz)));
});
test("nunca mistura provedores: agendamento do Buffer não é mexido pelo Praeko e vice-versa", async () => {
  const buf = projeto();
  writeFileSync(arqAg(buf), JSON.stringify({ slug: SLUG, titulo: "t", videoUrl: "https://v/x.mp4", chaveObjeto: "k", posts: [{ rede: "youtube", id: "b1", dueAt: "2099-11-06T20:30:00.000Z" }] })); // formato antigo, sem `provedor`
  const a = await rodar(buf, [SLUG, "--cancelar", "--via", "praeko"], { rotas: feliz() });
  assert.match(a.erro.message, /agendado pelo Buffer.*--via buffer/); assert.equal(a.chamadas.length, 0);
  assert.match((await rodar(buf, [SLUG, "--status", "--via", "praeko"], { rotas: feliz() })).erro.message, /agendado pelo Buffer/);
  assert.match((await rodar(buf, [SLUG, "--quando", QUANDO, "--via", "praeko", "--enviar"], { rotas: feliz() })).erro.message, /já foi agendado pelo Buffer: cancele por lá/);
  const sbuf = await rodar(buf, [SLUG, "--status"], { rotas: feliz() }); // formato antigo continua lido como Buffer
  assert.equal(sbuf.erro, undefined); assert.match(sbuf.texto, /vídeo: https:\/\/v\/x\.mp4/); assert.equal(sbuf.chamadas.length, 0);
  const pk = projeto();
  writeFileSync(arqAg(pk), JSON.stringify({ provedor: "praeko", slug: SLUG, postId: SLUG, posts: [{ rede: "youtube", id: "it1", postId: SLUG, dueAt: "2099-11-06T20:30:00.000Z" }] }));
  const b = await rodar(pk, [SLUG, "--cancelar", "--via", "buffer"], { rotas: feliz() });
  assert.match(b.erro.message, /agendado pelo Praeko.*--via praeko/); assert.equal(b.chamadas.length, 0); assert.ok(existsSync(arqAg(pk)));
});
test("--limpar no Praeko: sem hospedagem; arquiva só se nada está pendente", async () => {
  const raiz = projeto();
  await rodar(raiz, [SLUG, "--quando", QUANDO, "--via", "praeko", "--enviar", "--sem-capa-no-quadro"], { rotas: feliz() });
  const pend = await rodar(raiz, [SLUG, "--limpar"], { rotas: () => ({ corpo: { id: SLUG, items: [{ network: "youtube", state: "scheduled" }] } }) });
  assert.match(pend.erro.message, /ainda há item\(ns\) pendente\(s\).*--cancelar/); assert.ok(existsSync(arqAg(raiz)));
  const ok = await rodar(raiz, [SLUG, "--limpar"], { rotas: () => ({ corpo: { id: SLUG, items: [{ network: "youtube", state: "sent" }] } }) });
  assert.equal(ok.erro, undefined); assert.match(ok.texto, /não há vídeo hospedado para limpar/);
  assert.ok(!existsSync(arqAg(raiz)) && existsSync(arqAg(raiz, ".feito")));
});
test("--canais --via praeko lista id, rede, nome e a conta padrão", async () => {
  const r = await rodar(projeto(), ["--canais", "--via", "praeko"], { rotas: feliz() });
  assert.equal(r.codigo, 0, r.erro?.message);
  assert.deepEqual(r.chamadas.map((c) => `${c.metodo} ${c.caminho}`), ["GET /v1/channels"]);
  assert.match(r.texto, /instagram\s+ig1\s+meucanal\s+\(padrão\)/); assert.match(r.texto, /instagram\s+ig2\s+outro\s*$/m); assert.match(r.texto, /youtube\s+yt1\s+Canal YT/);
  assert.match((await rodar(projeto(), ["--canais", "--via", "praeko"], { chave: null })).erro.message, /sem chave do Praeko/);
});
test("--chave com --via praeko guarda em praeko/principal e recusa chave que não é do Praeko", async () => {
  const guardadas = [];
  const r = await rodar(projeto(), ["--via", "praeko", "--chave", "arauto_NOVA"], { guardar: (ref, k) => guardadas.push([ref, k]) });
  assert.equal(r.codigo, 0); assert.deepEqual(guardadas, [["praeko/principal", "arauto_NOVA"]]);
  assert.match(r.texto, /cofre do sistema.*praeko\/principal/); assert.doesNotMatch(r.texto, /arauto_NOVA/);
  const ruim = await rodar(projeto(), ["--via", "praeko", "--chave", "outra-coisa"], { guardar: (ref, k) => guardadas.push([ref, k]) });
  assert.match(ruim.erro.message, /não parece uma chave do Praeko/); assert.equal(guardadas.length, 1);
  const buf = await rodar(projeto(), ["--chave", "bufferkey"], { guardar: (ref, k) => guardadas.push([ref, k]) }); // sem --via: continua sendo a do Buffer
  assert.deepEqual(guardadas.at(-1), ["buffer/principal", "bufferkey"]); assert.match(buf.texto, /chave do Buffer guardada/);
});
test("episódio sem publicacao.json válido ou com erro de conferência não agenda (mesma regra do Buffer)", async () => {
  const raiz = projeto();
  writeFileSync(join(raiz, "episodios", SLUG, "publicacao.json"), JSON.stringify({ ...META, hashtags: { instagram: Array.from({ length: 31 }, (_, i) => `#t${i}`) } }));
  const r = await rodar(raiz, [SLUG, "--quando", QUANDO, "--via", "praeko", "--enviar"], { rotas: feliz() });
  assert.equal(r.codigo, 1); assert.match(r.texto, /✗ mais de 30 hashtags/); assert.equal(r.chamadas.length, 0);
});
// Instagram pelo Buffer: o item do Instagram leva uma cópia do vídeo com a capa nos 2 primeiros quadros (precisa de ffmpeg; sem ele o teste é pulado).
import { spawnSync } from "node:child_process";
const temFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
test("Instagram via buffer: capa colada nos 2 primeiros quadros vira mídia só do item do Instagram", { skip: !temFfmpeg && "sem ffmpeg" }, async () => {
  const raiz = projeto();
  const f = (...a) => assert.equal(spawnSync("ffmpeg", ["-v", "error", "-y", ...a]).status, 0);
  f("-f", "lavfi", "-i", "testsrc=size=90x160:rate=10:duration=1", "-pix_fmt", "yuv420p", join(raiz, "out", `${SLUG}.mp4`));
  f("-f", "lavfi", "-i", "color=c=red:size=90x160", "-frames:v", "1", join(raiz, "out", `${SLUG}-capa.png`));
  const r = await rodar(raiz, [SLUG, "--quando", QUANDO, "--via", "praeko", "--enviar"], { rotas: feliz() });
  assert.equal(r.erro, undefined, r.erro?.message);
  assert.deepEqual(r.chamadas.filter((c) => c.metodo === "PUT").map((c) => c.caminho), ["/v1/media/m1/content", "/v1/media/m2/content", "/v1/media/m3/content"]);
  const post = JSON.parse(r.chamadas.at(-1).corpo);
  assert.deepEqual(post.media, { video: "m1", cover: "m2" });
  assert.deepEqual(post.items.find((i) => i.network === "instagram").media, { video: "m3" });
  assert.equal(post.items.find((i) => i.network === "youtube").media, undefined);
  assert.ok(existsSync(join(raiz, "out", `${SLUG}.capa.mp4`)));
});

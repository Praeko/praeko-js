import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { envDe, envAntigaDe, obter, guardar, obterNovo, obterAntigo, migrar, refAntiga, semChaveiro, chaveiro, segredos as segredosPadrao, REFS_CONHECIDAS } from "../src/segredos.mjs";
import { caminhoEstado, caminhoLeitura } from "../src/estado.mjs";
import { normalizarConfig, acharConfig } from "../src/config.mjs";
import { validarPedido, criarPublicador } from "../src/publicador.mjs";
import { arquivoFila, enfileirar, executar, lerFila, liberarItem, proximaAcao, plistLaunchd } from "../src/fila.mjs";
import * as local from "../src/adaptadores/local.mjs";
import * as bufferAd from "../src/adaptadores/buffer.mjs";
import * as yt from "../src/provedores/youtube.mjs";
import * as ig from "../src/provedores/instagram.mjs";
import * as tt from "../src/provedores/tiktok.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "praeko-"));
const log = () => {};
const pedido = (o = {}) => ({ id: "ped1", titulo: "Meu vídeo", midia: { video: "/x/v.mp4", capa: "/x/c.png" }, textos: { youtube: { titulo: "T", texto: "descrição", comentarioFixo: "Comenta aí" }, instagram: { texto: "legenda", comentarioFixo: "Comenta" }, tiktok: { texto: "tt" } }, destinos: [{ rede: "youtube" }], ...o });

test("segredos: env, arquivo 600 e prioridade", () => {
  const dir = tmp(), f = join(dir, "s.json");
  process.env.PRAEKO_SEGREDOS = f; process.env.PRAEKO_SEM_CHAVEIRO = "1";
  try {
    assert.equal(envDe("buffer/principal"), "PRAEKO_KEY_BUFFER_PRINCIPAL");
    assert.equal(obter("youtube/token"), null);
    assert.equal(guardar("youtube/token", '{"a":1}'), "arquivo");
    assert.equal(obter("youtube/token"), '{"a":1}');
    assert.equal(statSync(f).mode & 0o777, 0o600);
    process.env.PRAEKO_KEY_YOUTUBE_TOKEN = "do-ambiente";
    assert.equal(obter("youtube/token"), "do-ambiente");
  } finally { delete process.env.PRAEKO_KEY_YOUTUBE_TOKEN; delete process.env.PRAEKO_SEGREDOS; delete process.env.PRAEKO_SEM_CHAVEIRO; rmSync(dir, { recursive: true, force: true }); }
});

test("config: praeko.json plano e marca.json (seção publicacao) viram a mesma coisa; acharConfig sobe pastas", () => {
  assert.deepEqual(normalizarConfig({ links: { jogo: "x" }, buffer: { a: 1 } }), { links: { jogo: "x" }, buffer: { a: 1 } });
  const n = normalizarConfig({ nome: "Canal", links: { jogo: "x" }, cores: {}, publicacao: { buffer: { a: 1 }, hospedagem: { tipo: "r2" } } });
  assert.equal(n.nome, "Canal"); assert.deepEqual(n.links, { jogo: "x" }); assert.deepEqual(n.buffer, { a: 1 }); assert.equal(n.cores, undefined);
  const dir = tmp(); writeFileSync(join(dir, "marca.json"), JSON.stringify({ links: { jogo: "y" }, publicacao: { fusoOffset: "-03:00" } }));
  const r = acharConfig(join(dir, "a", "b")); // pasta que nem existe: sobe até achar
  assert.equal(r?.config.links.jogo, "y"); assert.equal(r.config.fusoOffset, "-03:00");
  writeFileSync(join(dir, "arauto.json"), JSON.stringify({ links: { jogo: "z" } }));
  assert.equal(acharConfig(dir).config.links.jogo, "z", "arauto.json (nome antigo) ainda vale e vence marca.json");
  writeFileSync(join(dir, "praeko.json"), JSON.stringify({ links: { jogo: "novo" } }));
  assert.equal(acharConfig(dir).config.links.jogo, "novo", "praeko.json vence arauto.json");
  assert.match(acharConfig(dir).arquivo, /praeko\.json$/);
  rmSync(dir, { recursive: true, force: true });
});

test("segredos (renomeação): variáveis ARAUTO_* e arquivo antigo valem como reserva; o novo vence; a escrita é só no novo", () => {
  const dir = tmp(), novo = join(dir, "novo.json"), velho = join(dir, "velho.json"), ant = { ...process.env };
  process.env.PRAEKO_SEM_CHAVEIRO = "1"; process.env.PRAEKO_SEGREDOS = novo;
  try {
    assert.equal(envAntigaDe("buffer/principal"), "ARAUTO_KEY_BUFFER_PRINCIPAL"); assert.equal(envAntigaDe("praeko/chave"), "ARAUTO_KEY_ARAUTO_CHAVE"); assert.equal(refAntiga("praeko/chave"), "arauto/chave"); assert.equal(refAntiga("youtube/token"), "youtube/token");
    process.env.ARAUTO_KEY_YOUTUBE_TOKEN = "env-antiga"; assert.equal(obter("youtube/token"), "env-antiga", "ARAUTO_KEY_* como reserva");
    process.env.PRAEKO_KEY_YOUTUBE_TOKEN = "env-nova"; assert.equal(obter("youtube/token"), "env-nova", "PRAEKO_KEY_* vence");
    delete process.env.PRAEKO_KEY_YOUTUBE_TOKEN; delete process.env.ARAUTO_KEY_YOUTUBE_TOKEN;
    // ARAUTO_SEGREDOS sozinha (sem PRAEKO_SEGREDOS) ainda indica o arquivo; um arquivo antigo com a conta arauto/chave é lido como praeko/chave
    delete process.env.PRAEKO_SEGREDOS; process.env.ARAUTO_SEGREDOS = velho;
    writeFileSync(velho, JSON.stringify({ "arauto/chave": "arauto_antiga_xxxxxxxxxxxxxxxxx", "youtube/token": "t1" }));
    assert.equal(obter("praeko/chave"), "arauto_antiga_xxxxxxxxxxxxxxxxx"); assert.equal(obterNovo("praeko/chave"), null); assert.equal(obterAntigo("praeko/chave"), "arauto_antiga_xxxxxxxxxxxxxxxxx");
    guardar("praeko/chave", "praeko_nova_xxxxxxxxxxxxxxxxxxxx");
    assert.equal(obter("praeko/chave"), "praeko_nova_xxxxxxxxxxxxxxxxxxxx", "o novo vence o antigo"); assert.equal(JSON.parse(readFileSync(velho, "utf8"))["arauto/chave"], "arauto_antiga_xxxxxxxxxxxxxxxxx", "o antigo não é apagado");
    assert.equal(semChaveiro({ ARAUTO_SEM_CHAVEIRO: "1" }), true, "ARAUTO_SEM_CHAVEIRO ainda vale"); assert.equal(semChaveiro({}), false);
  } finally { for (const k of Object.keys(process.env)) if (!(k in ant)) delete process.env[k]; Object.assign(process.env, ant); rmSync(dir, { recursive: true, force: true }); }
});

/** Dublê do Chaveiro: um mapa serviço → conta → valor, no lugar do comando `security`. */
const chaveiroFalso = (ini = {}) => {
  const m = new Map(Object.entries(ini).flatMap(([sv, c]) => Object.entries(c).map(([ref, v]) => [`${sv}|${ref}`, v])));
  return { m, ativo: () => true, ler: (sv, ref) => m.get(`${sv}|${ref}`) ?? null, gravar: (sv, ref, v) => { m.set(`${sv}|${ref}`, v); } };
};
test("Chaveiro: lê o serviço praeko e cai no arauto (conta arauto/chave); guarda só no praeko; migrar copia sem mostrar segredo", () => {
  const real = { ...chaveiro }, dir = tmp(), ant = { ...process.env };
  const falso = chaveiroFalso({ arauto: { "arauto/chave": "arauto_ANTIGA_segredo1234567890", "youtube/token": "TOKEN-ANTIGO", "buffer/principal": "BUF-ANTIGO" }, praeko: { "buffer/principal": "BUF-NOVO" } });
  Object.assign(chaveiro, falso); delete process.env.PRAEKO_SEM_CHAVEIRO; delete process.env.ARAUTO_SEM_CHAVEIRO; process.env.PRAEKO_SEGREDOS = join(dir, "s.json");
  const platform = Object.getOwnPropertyDescriptor(process, "platform"); Object.defineProperty(process, "platform", { value: "darwin" });
  try {
    assert.equal(obter("praeko/chave"), "arauto_ANTIGA_segredo1234567890", "cai no serviço arauto, conta arauto/chave");
    assert.equal(obter("buffer/principal"), "BUF-NOVO", "o serviço praeko vence");
    assert.equal(guardar("youtube/cliente", "X"), "chaveiro"); assert.equal(falso.m.get("praeko|youtube/cliente"), "X"); assert.ok(![...falso.m.keys()].includes("arauto|youtube/cliente"), "a escrita nunca vai para o serviço antigo");
    const antes = new Map(falso.m);
    const r = migrar();
    assert.deepEqual(r.copiados.sort(), ["praeko/chave", "youtube/token"].sort()); assert.deepEqual(r.jaNoNovo.sort(), ["buffer/principal", "youtube/cliente"].sort());
    assert.ok(r.ausentes.every((x) => REFS_CONHECIDAS.includes(x)) && r.copiados.length + r.jaNoNovo.length + r.ausentes.length === REFS_CONHECIDAS.length);
    assert.equal(falso.m.get("praeko|praeko/chave"), "arauto_ANTIGA_segredo1234567890", "a conta arauto/chave virou praeko/chave"); assert.equal(falso.m.get("praeko|youtube/token"), "TOKEN-ANTIGO");
    assert.equal(falso.m.get("praeko|buffer/principal"), "BUF-NOVO", "o que já existia no novo não é sobrescrito");
    for (const [k, v] of antes) assert.equal(falso.m.get(k), v, "nada do que existia foi apagado ou alterado");
    assert.ok(!JSON.stringify(r).includes("segredo1234567890") && !JSON.stringify(r).includes("TOKEN-ANTIGO"), "o resultado só tem nomes");
    assert.deepEqual(migrar().copiados, [], "idempotente");
  } finally { Object.assign(chaveiro, real); Object.defineProperty(process, "platform", platform); for (const k of Object.keys(process.env)) if (!(k in ant)) delete process.env[k]; Object.assign(process.env, ant); rmSync(dir, { recursive: true, force: true }); }
});

test("estado local: grava em .praeko/, lê .praeko/ e cai em .arauto/; a fila antiga continua visível e a primeira gravação passa para o novo", () => {
  const raiz = tmp();
  try {
    assert.equal(caminhoEstado(raiz, "fila.json"), join(raiz, ".praeko", "fila.json")); assert.equal(caminhoLeitura(raiz, "fila.json"), join(raiz, ".praeko", "fila.json"), "nenhum dos dois existe: o novo");
    mkdirSync(join(raiz, ".arauto")); writeFileSync(join(raiz, ".arauto", "fila.json"), JSON.stringify({ itens: [{ id: "velho", estado: "pendente", rede: "youtube", slug: "s" }] }));
    assert.equal(caminhoLeitura(raiz, "fila.json"), join(raiz, ".arauto", "fila.json"));
    assert.deepEqual(lerFila(raiz).itens.map((i) => i.id), ["velho"], "a fila de antes da renomeação aparece");
    assert.ok(!existsSync(join(raiz, ".praeko")), "só ler não cria nada");
    const novo = enfileirar(raiz, { slug: "n", rede: "youtube", provedor: "youtube", quando: "2026-12-01T10:00:00Z", textos: {}, opcoes: {} });
    assert.ok(existsSync(arquivoFila(raiz)) && arquivoFila(raiz).includes(".praeko"));
    assert.deepEqual(lerFila(raiz).itens.map((i) => i.id).sort(), ["velho", novo.id].sort(), "o item antigo veio junto para o arquivo novo");
    assert.equal(JSON.parse(readFileSync(join(raiz, ".arauto", "fila.json"), "utf8")).itens.length, 1, ".arauto/ não é alterado");
    assert.equal(caminhoLeitura(raiz, "fila.json"), join(raiz, ".praeko", "fila.json"), "agora o novo vence");
  } finally { rmSync(raiz, { recursive: true, force: true }); }
});

test("LaunchAgent: o rótulo passa a br.praeko.fila e o caminho do bin entra como `praeko` (ou `arauto`, o nome antigo do parâmetro)", () => {
  const novo = plistLaunchd({ node: "/n", praeko: "/bin/praeko.mjs", cwd: "/c", minutos: 5, log: "/l" });
  assert.match(novo, /<string>br\.praeko\.fila<\/string>/); assert.match(novo, /<string>\/bin\/praeko\.mjs<\/string>/);
  assert.match(plistLaunchd({ node: "/n", arauto: "/bin/arauto.mjs", cwd: "/c", log: "/l" }), /<string>\/bin\/arauto\.mjs<\/string>/);
});

test("validarPedido: erros claros, modos por rede, marcador [LINK_X] recusado", () => {
  assert.deepEqual(validarPedido(pedido()), []);
  assert.match(validarPedido(pedido({ destinos: [] })).join(), /destinos/);
  assert.match(validarPedido(pedido({ destinos: [{ rede: "x" }] })).join(), /rede desconhecida/);
  assert.match(validarPedido(pedido({ destinos: [{ rede: "youtube", modo: "rascunho" }] })).join(), /modo "rascunho" inválido/);
  assert.deepEqual(validarPedido(pedido({ destinos: [{ rede: "tiktok", modo: "direto" }] })), []);
  assert.match(validarPedido(pedido({ destinos: [{ rede: "youtube", quando: "ontem" }] })).join(), /quando inválido/);
  assert.match(validarPedido(pedido({ textos: { youtube: { titulo: "T", texto: "veja [LINK_DO_LONGO]" } } })).join(), /marcador/);
  assert.match(validarPedido(pedido({ midia: {} })).join(), /midia.video/);
});

test("criarPublicador: escolhe o adaptador; remoto sem url avisa; desconhecido dá erro", async () => {
  const ctx = { raiz: tmp(), segredos: { obter: () => null, guardar() {} }, log };
  assert.equal((await criarPublicador({ config: {}, provedor: "local", ctx })).nome, "local");
  assert.equal((await criarPublicador({ config: { provedor: "buffer" }, ctx })).nome, "buffer");
  const r = await criarPublicador({ config: {}, provedor: "remoto", ctx });
  await assert.rejects(r.publicar(pedido()), /falta a url do serviço/);
  await assert.rejects(criarPublicador({ config: {}, provedor: "x", ctx }), /desconhecido/);
});

// ---- adaptador local com provedores de mentira ----
const provFalso = (rede, extra = {}) => { const chamadas = []; return { chamadas, nome: rede, rede, status: async () => ({ conectado: true, detalhe: "ok" }), publicar: async ({ item }) => { chamadas.push({ modo: item.opcoes?.modo, quando: item.quando, acao: item.acao }); return { id: rede + "1", url: "https://x/" + rede, ...(extra.resultado || {}) }; }, ...extra.mod }; };

test("local: modos por destino; padrões da config; youtube imediato roda já; instagram espera a hora", async () => {
  const raiz = tmp(), yP = provFalso("youtube", { mod: { imediato: true } }), iP = provFalso("instagram", { mod: { antecedenciaMs: 0 } });
  const ctx = { raiz, log, agora: () => new Date("2026-11-06T12:00:00Z"), segredos: {} };
  const L = local.criar({ config: { youtube: { modo: "agendado" }, tiktok: { modo: "direto" } }, ctx, provedores: { youtube: yP, instagram: iP } });
  const r = await L.publicar(pedido({ destinos: [{ rede: "youtube" }, { rede: "instagram", quando: "2026-11-06T20:30:00.000Z" }] }));
  assert.equal(yP.chamadas.length, 1); assert.equal(yP.chamadas[0].modo, "agendado", "padrão da config");
  assert.equal(iP.chamadas.length, 0);
  assert.deepEqual(r.itens.map((i) => [i.rede, i.estado]), [["youtube", "enviado"], ["instagram", "agendado"]]);
  const r2 = await L.publicar(pedido({ id: "ped2", destinos: [{ rede: "youtube", modo: "publico" }] }));
  assert.equal(yP.chamadas[1].modo, "publico", "modo do destino vence a config");
  const c = await L.cancelar("ped1");
  assert.equal(c.cancelados.length, 1); assert.equal(c.mantidos.length, 1);
  assert.equal((await L.status("ped1")).itens.find((i) => i.rede === "instagram").estado, "cancelado");
  assert.ok((await L.canais()).every((x) => x.conectado));
  await assert.rejects(L.publicar(pedido({ destinos: [{ rede: "tiktok" }] })), /não instalado/);
  rmSync(raiz, { recursive: true, force: true });
});

test("TikTok agendado: espera a hora nos dois modos e envia quando vence; sem hora envia já", async () => {
  for (const modo of ["rascunho", "direto"]) {
    const raiz = tmp(), tP = provFalso("tiktok");
    let agora = new Date("2026-11-06T12:00:00Z");
    const ctx = { raiz, log, agora: () => agora, segredos: {} };
    const L = local.criar({ config: {}, ctx, provedores: { tiktok: tP } });
    const r = await L.publicar(pedido({ id: "t" + modo, destinos: [{ rede: "tiktok", quando: "2026-11-06T21:00:00.000Z", modo }] }));
    assert.equal(tP.chamadas.length, 0, "antes da hora não envia"); assert.equal(r.itens[0].estado, "agendado");
    agora = new Date("2026-11-06T20:59:00Z");
    await executar({ raiz, provedores: { tiktok: tP }, ctx, agora, log });
    assert.equal(tP.chamadas.length, 0);
    agora = new Date("2026-11-06T21:01:00Z");
    await executar({ raiz, provedores: { tiktok: tP }, ctx, agora, log });
    assert.equal(tP.chamadas.length, 1); assert.equal(tP.chamadas[0].modo, modo);
    await executar({ raiz, provedores: { tiktok: tP }, ctx, agora: new Date("2026-11-07T00:00:00Z"), log });
    assert.equal(tP.chamadas.length, 1, "não reenvia");
    const sem = await L.publicar(pedido({ id: "s" + modo, destinos: [{ rede: "tiktok", modo }] }));
    assert.equal(tP.chamadas.length, 2, "sem hora: envia já"); assert.equal(sem.itens[0].estado, modo === "rascunho" ? "enviado" : "enviado");
    rmSync(raiz, { recursive: true, force: true });
  }
});

test("provedor TikTok real é agendável: não age antes da hora e age depois", () => {
  assert.equal(tt.imediato, false);
  const it = { estado: "pendente", tentativas: 0, quando: "2026-11-06T21:00:00.000Z" };
  assert.equal(proximaAcao(it, tt, new Date("2026-11-06T20:59:00Z")), null);
  assert.equal(proximaAcao(it, tt, new Date("2026-11-06T21:00:30Z")), "publicar");
});

// ---- comentário do YouTube como ação posterior ----
const respY = (status, corpo, cab = {}) => ({ ok: status < 400, status, headers: { get: (k) => cab[k.toLowerCase()] ?? null }, json: async () => corpo, text: async () => JSON.stringify(corpo) });
const NOW = Date.parse("2026-11-04T20:00:00Z");
const ctxY = (rotas) => { const m = { "youtube/cliente": JSON.stringify({ client_id: "i", client_secret: "s" }), "youtube/token": JSON.stringify({ access_token: "AT", refresh_token: "RT", expiry: NOW + 3600e3 }) }; const chamadas = []; return { chamadas, ctx: { fetchFn: async (url, o = {}) => { chamadas.push({ url, o }); const k = Object.keys(rotas).find((x) => url.includes(x)); if (!k) throw new Error("rota " + url); return rotas[k](o); }, segredos: { obter: (r) => m[r] ?? null, guardar: (r, v) => { m[r] = v; } }, log, deps: { agora: () => NOW, dormir: async () => {}, abrirArquivo: () => ({ tamanho: 10, ler: () => Buffer.alloc(10), fechar() {} }) } } }; };
const itemY = (modo, extra = {}) => ({ slug: "s", rede: "youtube", quando: "2026-11-06T20:30:00.000Z", video: "/x/v.mp4", capa: null, textos: { titulo: "T", texto: "d", comentarioFixo: "Comenta" }, opcoes: { modo }, ...extra });

test("YouTube: o comentário vira ação posterior (privado: manual; agendado: 2 min depois; publico: 1 min depois)", async () => {
  const rotas = { "uploadType=resumable": () => respY(200, {}, { location: "https://up/sessao" }), "https://up/sessao": () => respY(200, { id: "VID" }) };
  for (const [modo, esperado] of [["privado", "manual"], ["agendado", "2026-11-06T20:32:00.000Z"], ["publico", new Date(NOW + 60e3).toISOString()]]) {
    const { ctx } = ctxY(rotas);
    const r = await yt.publicar({ item: itemY(modo), ctx });
    const s = r.seguinte[0];
    assert.equal(s.acao, "comentar"); assert.equal(s.videoId, "VID");
    if (esperado === "manual") { assert.equal(s.manual, true); assert.equal(s.quando, null); } else assert.equal(s.quando, esperado);
  }
  const { ctx } = ctxY(rotas);
  assert.deepEqual((await yt.publicar({ item: itemY("privado", { textos: { titulo: "T", texto: "d" } }), ctx })).seguinte, []);
  assert.deepEqual((await yt.publicar({ item: itemY("privado", { opcoes: { modo: "privado", comentar: false } }), ctx })).seguinte, []);
});

test("fila: ação posterior entra na fila, manual não roda sozinha e `liberarItem` + executar comenta", async () => {
  const raiz = tmp(); let corpoComentario;
  const rotas = { "uploadType=resumable": () => respY(200, {}, { location: "https://up/sessao" }), "https://up/sessao": () => respY(200, { id: "VID" }),
    "channels?part=id": () => respY(200, { items: [{ id: "CANAL" }] }), "commentThreads": (o) => { corpoComentario = JSON.parse(o.body); return respY(200, { id: "COM1" }); } };
  const { ctx } = ctxY(rotas); ctx.raiz = raiz;
  const it = enfileirar(raiz, itemY("privado", { provedor: "youtube", pedido: "p" }));
  await executar({ raiz, provedores: { youtube: yt }, ctx, agora: new Date(NOW), log });
  let f = lerFila(raiz); assert.equal(f.itens.length, 2); const c = f.itens[1];
  assert.equal(c.acao, "comentar"); assert.equal(c.manual, true); assert.equal(c.origem, it.id);
  await executar({ raiz, provedores: { youtube: yt }, ctx, agora: new Date(NOW + 9e9), log });
  assert.equal(lerFila(raiz).itens[1].estado, "pendente", "manual: não roda sozinho");
  liberarItem(raiz, c.id);
  await executar({ raiz, provedores: { youtube: yt }, ctx, agora: new Date(NOW + 9e9), log });
  f = lerFila(raiz); assert.equal(f.itens[1].estado, "enviado"); assert.equal(f.itens[1].resultado.id, "COM1");
  assert.equal(corpoComentario.snippet.channelId, "CANAL"); assert.equal(corpoComentario.snippet.topLevelComment.snippet.textOriginal, "Comenta");
  assert.ok(yt.ESCOPOS.some((e) => e.endsWith("youtube.force-ssl")));
  rmSync(raiz, { recursive: true, force: true });
});

test("YouTube: comentário recusado vira erro com orientação (escopo/publicado)", async () => {
  const { ctx } = ctxY({ "channels?part=id": () => respY(200, { items: [{ id: "C" }] }), "commentThreads": () => respY(403, { error: { message: "forbidden", errors: [{ reason: "forbidden" }] } }) });
  await assert.rejects(yt.publicar({ item: { ...itemY("privado"), acao: "comentar", videoId: "V" }, ctx }), /publicado|force-ssl/);
});

// ---- adaptador buffer ----
test("adaptador buffer: horário obrigatório, canais, vídeo hospedado, privacidade pelo modo, registro e cancelar", async () => {
  const raiz = tmp(), posts = [], apagados = [], hospedados = [], removidos = [];
  const fetchFn = async (_u, o) => { const { query, variables } = JSON.parse(o.body); let data;
    if (query.includes("organizations")) data = { account: { organizations: [{ id: "o", name: "Org" }] } };
    else if (query.includes("channels")) data = { channels: [{ id: "cy", name: "yt", service: "youtube" }, { id: "ci", name: "ig", service: "instagram" }] };
    else if (query.includes("createPost")) { posts.push(variables.input); data = { createPost: { post: { id: "post" + posts.length, dueAt: variables.input.dueAt } } }; }
    else if (query.includes("deletePost")) { apagados.push(variables.id); data = { deletePost: { __typename: "DeletePostSuccess" } }; }
    return { ok: true, status: 200, text: async () => JSON.stringify({ data }) }; };
  const ctx = { raiz, log, fetchFn, segredos: { obter: (r) => (r === "buffer/principal" ? "KEY" : null), guardar() {} }, hospedar: async (a, s) => { hospedados.push(a); return { url: "https://m/v.mp4", chave: "s/x/v.mp4" }; }, removerHospedado: async (c) => { removidos.push(c); }, deps: { capaQuadro: { sondar: () => ({ largura: 1080, altura: 1920 }), dimensoesImagem: () => ({ largura: 1080, altura: 1920 }), mesmaProporcao: () => true, embutirCapa: ({ saida }) => ({ saida }) } } };
  const B = bufferAd.criar({ config: { links: { jogo: "https://e.com/" }, buffer: {} }, ctx });
  await assert.rejects(B.publicar(pedido({ destinos: [{ rede: "youtube" }] })), /precisa de horário/);
  const q = "2026-11-06T20:30:00.000Z";
  const r = await B.publicar(pedido({ destinos: [{ rede: "youtube", quando: q, modo: "privado" }, { rede: "instagram", quando: q }] }));
  assert.equal(posts.length, 2); assert.equal(posts[0].metadata.youtube.privacy, "private"); assert.equal(posts[0].metadata.youtube.categoryId, "28");
  assert.equal(posts[1].assets[0].video.metadata.thumbnailOffset, 0, "capa embutida: quadro 0");
  assert.ok(hospedados[0].endsWith("ped1.capa.mp4"));
  assert.deepEqual(r.itens.map((i) => i.estado), ["agendado", "agendado"]);
  assert.equal((await B.status("ped1")).itens.length, 2);
  assert.equal((await B.canais()).length, 2);
  const c = await B.cancelar("ped1", { redes: ["youtube"] });
  assert.deepEqual(c.cancelados, ["post1"]); assert.equal(removidos.length, 0);
  await B.cancelar("ped1"); assert.deepEqual(apagados, ["post1", "post2"]); assert.deepEqual(removidos, ["s/x/v.mp4"]);
  await assert.rejects(B.status("ped1"), /não existe/);
  rmSync(raiz, { recursive: true, force: true });
});

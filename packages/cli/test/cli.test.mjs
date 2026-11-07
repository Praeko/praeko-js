import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { executarCli } from "../src/cli.mjs";

const FIX = fileURLToPath(new URL("./fixtures", import.meta.url));
process.env.PRAEKO_SEM_CHAVEIRO = "1";
const proibida = async (u) => { throw new Error("REDE PROIBIDA no teste: " + u); };
const rodar = async (args, extra = {}) => { const linhas = []; const cod = await executarCli(args, { log: (m) => linhas.push(String(m)), erro: (m) => linhas.push(String(m)), ctxExtra: { fetchFn: proibida, ...extra } }); return { cod, saida: linhas.join("\n") }; };
const ambiente = () => { const dir = mkdtempSync(join(tmpdir(), "praeko-cli-")); cpSync(FIX, dir, { recursive: true }); process.env.PRAEKO_SEGREDOS = join(dir, "segredos.json"); return dir; };
const base = (dir) => ["--config", join(dir, "praeko.json")];

test("post: simulação mostra o plano por rede, não cria fila e não toca a rede", async () => {
  const dir = ambiente();
  const r = await rodar(["post", join(dir, "pacotes", "pacote-teste"), "--when", "30/12 17:30", "--networks", "yt,ig,tt", "--tt", "30/12 18:00", "--tt-mode", "direct", ...base(dir)]);
  assert.equal(r.cod, 0); assert.match(r.saida, /SIMULAÇÃO.*\[local\]/);
  assert.match(r.saida, /YouTube\s+agora/); assert.match(r.saida, /Instagram\s+30\/12\/2026/); assert.match(r.saida, /TikTok\s+30\/12\/2026.*modo direto/);
  assert.match(r.saida, /privacidade: SELF_ONLY/); assert.match(r.saida, /nada disto é publicado/);
  assert.ok(!existsSync(join(dir, ".praeko", "fila.json")));
  rmSync(dir, { recursive: true, force: true });
});
test("post: acha o pacote pelo nome em <raiz>/pacotes e aceita --yt-mode scheduled", async () => {
  const dir = ambiente();
  const r = await rodar(["post", "pacote-teste", "--when", "30/12 17:30", "--networks", "yt", "--yt-mode", "scheduled", ...base(dir)]);
  assert.equal(r.cod, 0); assert.match(r.saida, /YouTube\s+30\/12\/2026/); assert.match(r.saida, /publica sozinho em/);
  rmSync(dir, { recursive: true, force: true });
});
test("travas: modo inválido, marcador [LINK_…], hashtag proibida e rede sem horário", async () => {
  const dir = ambiente(), pk = join(dir, "pacotes", "pacote-teste");
  assert.equal((await rodar(["post", pk, "--when", "30/12 17:30", "--networks", "tt", "--tt-mode", "x", ...base(dir)])).cod, 1);
  const meta = JSON.parse(readFileSync(join(pk, "publicacao.json"), "utf8"));
  writeFileSync(join(pk, "publicacao.json"), JSON.stringify({ ...meta, yt: { descricao: "veja [LINK_DO_LONGO]" } }));
  const m = await rodar(["post", pk, "--when", "30/12 17:30", "--networks", "yt", ...base(dir)]);
  assert.equal(m.cod, 1); assert.match(m.saida, /marcador não preenchido/);
  writeFileSync(join(pk, "publicacao.json"), JSON.stringify({ ...meta, hashtags: { youtube: ["#bitcoin"] } }));
  const h = await rodar(["post", pk, "--when", "30/12 17:30", "--networks", "yt", ...base(dir)]);
  assert.equal(h.cod, 1); assert.match(h.saida, /hashtag proibida/);
  writeFileSync(join(pk, "publicacao.json"), JSON.stringify(meta));
  const s = await rodar(["post", pk, "--networks", "ig", ...base(dir)]); // sem --quando: o Instagram vai "agora"; só simula
  assert.equal(s.cod, 0); assert.match(s.saida, /Instagram\s+agora/);
  rmSync(dir, { recursive: true, force: true });
});
test("schedule (Buffer): simulação, e o Buffer recusa horário que já passou", async () => {
  const dir = ambiente(), pk = join(dir, "pacotes", "pacote-teste");
  const r = await rodar(["schedule", pk, "--when", "30/12 17:30", "--networks", "yt,ig", ...base(dir)]);
  assert.equal(r.cod, 0); assert.match(r.saida, /\[buffer\]/); assert.match(r.saida, /YouTube\s+30\/12\/2026/);
  const passado = await rodar(["schedule", pk, "--when", "2020-01-01T10:00", "--networks", "yt", ...base(dir)]);
  assert.equal(passado.cod, 1); assert.match(passado.saida, /menos de 5 minutos|já passou/);
  rmSync(dir, { recursive: true, force: true });
});
test("queue: list e `comentar <id>` libera o item manual e comenta (rede simulada)", async () => {
  const dir = ambiente(); const { enfileirar } = await import("@praeko/core");
  assert.match((await rodar(["queue", "list", ...base(dir)])).saida, /fila vazia/);
  const it = enfileirar(dir, { slug: "s", rede: "youtube", provedor: "youtube", acao: "comentar", manual: true, quando: null, videoId: "VID", textos: { comentarioFixo: "oi" }, opcoes: {} });
  assert.match((await rodar(["queue", "list", ...base(dir)])).saida, /\[comentar, manual\]/);
  const seg = { "youtube/cliente": JSON.stringify({ client_id: "i", client_secret: "s" }), "youtube/token": JSON.stringify({ access_token: "AT", refresh_token: "RT", expiry: Date.now() + 3600e3 }) };
  const fetchFn = async (url, o = {}) => { const j = url.includes("channels") ? { items: [{ id: "C" }] } : { id: "COM" }; return { ok: true, status: 200, headers: { get: () => null }, json: async () => j, text: async () => JSON.stringify(j) }; };
  const r = await rodar(["queue", "comment", it.id, ...base(dir)], { fetchFn, segredos: { obter: (k) => seg[k] ?? null, guardar() {} } });
  assert.equal(r.cod, 0); assert.match(r.saida, /comentário feito/);
  assert.match((await rodar(["queue", "list", ...base(dir)])).saida, /enviado/);
  rmSync(dir, { recursive: true, force: true });
});
test("account status sem credencial: não conectado (código 1) e ajuda (código 0)", async () => {
  const dir = ambiente();
  const r = await rodar(["account", "youtube", "status", ...base(dir)], { segredos: { obter: () => null, guardar() {} } });
  assert.equal(r.cod, 1); assert.match(r.saida, /NÃO conectado/);
  assert.equal((await rodar(["help"])).cod, 0);
  rmSync(dir, { recursive: true, force: true });
});

// ---- serviço remoto (Praeko na Cloudflare), com um cliente de mentira no lugar do SDK ----
import { hashChave } from "@praeko/core/chaves";
const falso = (extra = {}) => { const chamadas = []; const reg = (n, r) => (...a) => { chamadas.push([n, ...a]); return r instanceof Function ? r(...a) : r; };
  return { chamadas, media: { upload: reg("media.upload", (_f, o) => ({ id: "M-" + o.type })) }, posts: { create: reg("posts.create", (p) => ({ id: p.id, items: p.items.map((d, i) => ({ id: "d" + i, network: d.network, state: d.draft ? "draft" : "scheduled", scheduledFor: d.scheduledFor ?? "2026-11-06T20:30:00.000Z", custom: false })) })), list: reg("posts.list", { total: 1, posts: [{ id: "ep-1", state: "queued", title: "Meu vídeo", tags: ["raide"], items: [{ network: "youtube", state: "scheduled", scheduledFor: "2026-11-06T20:30:00.000Z" }] }] }), publishNow: reg("posts.publishNow", { items: [{ network: "youtube", state: "scheduled" }] }) }, channels: { slots: reg("channels.slots", { timezone: "America/Sao_Paulo", slots: [{ day: "fri", time: "17:30" }] }), setSlots: reg("channels.setSlots", (_r, v) => ({ timezone: "America/Sao_Paulo", slots: v.map((x) => ({ day: x.split(" ")[0], time: x.split(" ")[1] })), rescheduled: [1] })), connect: reg("channels.connect", { url: "https://accounts.example/auth?x=1" }), list: reg("channels.list", { channels: [] }) }, apiKeys: { create: reg("apiKeys.create", (n, e) => ({ id: "chv_1", scope: e, key: "arauto_NOVA" })), list: reg("apiKeys.list", { keys: [{ id: "chv_1", name: "bardo", prefix: "arauto_abc", scope: "write", revoked: false, lastUsedAt: null }] }), revoke: reg("apiKeys.revoke", {}) }, calendar: reg("calendar", { items: [{ scheduledFor: "2026-11-06T20:30:00.000Z", network: "youtube", state: "scheduled", title: "Meu vídeo", custom: false }], freeSlots: [{ network: "youtube", scheduledFor: "2026-11-09T01:00:00.000Z" }] }), ...extra }; };

test("remoto: post --server --queue simula e, com --send, sobe a mídia e cria o post com fila e etiquetas (contrato em inglês)", async () => {
  const dir = ambiente(), a = falso(), pk = join(dir, "pacotes", "pacote-teste");
  const sim = await rodar(["post", pk, "--server", "https://praeko.exemplo", "--queue", "--networks", "yt", "--tag", "raide, dia-5", ...base(dir)], { praeko: a });
  assert.equal(sim.cod, 0, sim.saida); assert.match(sim.saida, /SIMULAÇÃO.*\[remoto\]/); assert.match(sim.saida, /próxima vaga da fila/); assert.equal(a.chamadas.length, 0, "simulação não chama o serviço");
  const r = await rodar(["post", pk, "--server", "https://praeko.exemplo", "--queue", "--networks", "yt", "--tag", "raide, dia-5", "--yt-mode", "scheduled", "--send", ...base(dir)], { praeko: a });
  assert.equal(r.cod, 0, r.saida); assert.match(r.saida, /✓ YouTube agendado para/);
  const criado = a.chamadas.find((c) => c[0] === "posts.create")[1];
  assert.equal(criado.id, "pacote-teste"); assert.deepEqual(criado.tags, ["raide", "dia-5"]);
  assert.deepEqual(criado.items, [{ network: "youtube", mode: "scheduled", queue: true }]); assert.deepEqual(criado.media, { video: "M-video", cover: "M-cover" });
  assert.ok(criado.title && criado.texts.youtube.title, "campos em inglês");
  assert.equal(a.chamadas.filter((c) => c[0] === "media.upload").length, 2);
  rmSync(dir, { recursive: true, force: true });
});
test("aliases em português: postar --servidor --fila --enviar faz a mesma chamada que post --server --queue --send", async () => {
  const dir = ambiente(), pk = join(dir, "pacotes", "pacote-teste"), novo = falso(), velho = falso();
  await rodar(["post", pk, "--server", "https://x", "--queue", "--networks", "yt", "--tag", "a,b", "--yt-mode", "scheduled", "--send", ...base(dir)], { arauto: novo });
  const r = await rodar(["postar", pk, "--servidor", "https://x", "--fila", "--redes", "yt", "--etiqueta", "a,b", "--modo-yt", "agendado", "--enviar", ...base(dir)], { arauto: velho });
  assert.equal(r.cod, 0, r.saida);
  assert.deepEqual(velho.chamadas.map((c) => c[0]), novo.chamadas.map((c) => c[0]));
  assert.deepEqual(velho.chamadas.find((c) => c[0] === "posts.create")[1], novo.chamadas.find((c) => c[0] === "posts.create")[1]);
  rmSync(dir, { recursive: true, force: true });
});
test("remoto: --draft vai como rascunho; id do pacote com caracteres estranhos é limpo", async () => {
  const dir = ambiente(), a = falso(); cpSync(join(dir, "pacotes", "pacote-teste"), join(dir, "pacotes", "Ep 1: o começo"), { recursive: true });
  const r = await rodar(["post", join(dir, "pacotes", "Ep 1: o começo"), "--server", "https://x", "--draft", "--networks", "yt", "--send", ...base(dir)], { praeko: a });
  assert.equal(r.cod, 0, r.saida); const c = a.chamadas.find((x) => x[0] === "posts.create")[1];
  assert.match(c.id, /^[A-Za-z0-9_-]+$/); assert.equal(c.items[0].draft, true); assert.match(r.saida, /YouTube rascunho/);
  rmSync(dir, { recursive: true, force: true });
});
test("remoto: slots, posts, calendar, publish-now e account connect", async () => {
  const dir = ambiente(), a = falso();
  const v = await rodar(["slots", "youtube", "fri", "17:30", "sun", "22:00", "--timezone", "America/Sao_Paulo", ...base(dir)], { praeko: a });
  assert.match(v.saida, /vagas de YouTube.*sex 17:30, dom 22:00; 1 item/); assert.deepEqual(a.chamadas.find((c) => c[0] === "channels.setSlots").slice(1), ["youtube", ["fri 17:30", "sun 22:00"], { timezone: "America/Sao_Paulo" }]);
  assert.match((await rodar(["slots", "youtube", ...base(dir)], { praeko: a })).saida, /sex 17:30/);
  assert.equal((await rodar(["slots", "youtube", "fri", ...base(dir)], { praeko: a })).cod, 1);
  const p = await rodar(["posts", "--state", "queued", ...base(dir)], { praeko: a }); assert.match(p.saida, /ep-1\s+fila\s+Meu vídeo.*youtube:agendado.*#raide/);
  assert.deepEqual(a.chamadas.find((c) => c[0] === "posts.list")[1], { state: "queued", channel: undefined, tag: undefined, limit: undefined });
  const cal = await rodar(["calendar", ...base(dir)], { praeko: a }); assert.match(cal.saida, /YouTube agendado  Meu vídeo/); assert.match(cal.saida, /YouTube vaga livre/);
  assert.match((await rodar(["publish-now", "ep-1", ...base(dir)], { praeko: a })).saida, /YouTube\s+agendado/);
  const cn = await rodar(["account", "youtube", "connect", "--server", "https://x", ...base(dir)], { praeko: a }); assert.match(cn.saida, /accounts\.example\/auth/);
  rmSync(dir, { recursive: true, force: true });
});
test("aliases em português: vagas, posts --estado fila, calendario, publicar-agora e conta conectar chamam o mesmo que os novos", async () => {
  const dir = ambiente(), a = falso();
  await rodar(["vagas", "youtube", "sex", "17:30", "dom", "22:00", "--fuso", "America/Sao_Paulo", ...base(dir)], { praeko: a });
  assert.deepEqual(a.chamadas.find((c) => c[0] === "channels.setSlots").slice(1), ["youtube", ["fri 17:30", "sun 22:00"], { timezone: "America/Sao_Paulo" }]);
  await rodar(["posts", "--estado", "fila", "--etiqueta", "raide", ...base(dir)], { praeko: a });
  assert.deepEqual(a.chamadas.find((c) => c[0] === "posts.list")[1], { state: "queued", channel: undefined, tag: "raide", limit: undefined });
  assert.match((await rodar(["calendario", "--de", "2026-11-01T00:00:00Z", ...base(dir)], { praeko: a })).saida, /vaga livre/);
  assert.equal(a.chamadas.find((c) => c[0] === "calendar")[1].from, "2026-11-01T00:00:00Z");
  assert.match((await rodar(["publicar-agora", "ep-1", "--redes", "yt", ...base(dir)], { praeko: a })).saida, /YouTube\s+agendado/);
  assert.deepEqual(a.chamadas.find((c) => c[0] === "posts.publishNow").slice(1), ["ep-1", { network: "youtube" }]);
  assert.match((await rodar(["conta", "youtube", "conectar", "--servidor", "https://x", ...base(dir)], { praeko: a })).saida, /accounts\.example\/auth/);
  assert.match((await rodar(["ajuda"])).saida, /Deprecated aliases/);
  rmSync(dir, { recursive: true, force: true });
});
test("key: create --sql gera a chave e o SQL (escopo do banco em português) com o hash certo; create/list/revoke pelo serviço; store exige o prefixo", async () => {
  const dir = ambiente(), a = falso();
  const s = await rodar(["key", "create", "--name", "ad'min", "--scope", "admin", "--sql", ...base(dir)]);
  assert.equal(s.cod, 0, s.saida); const chave = /(praeko_[A-Za-z0-9_-]+)/.exec(s.saida)[1];
  assert.ok(s.saida.includes(await hashChave(chave)), "o SQL leva o hash da chave mostrada"); assert.ok(!/INSERT[^\n]*praeko_[A-Za-z0-9_-]{30,}/.test(s.saida), "a chave em claro não vai no SQL");
  assert.match(s.saida, /ad''min/); assert.match(s.saida, /'admin'/);
  const w = await rodar(["key", "create", "--name", "x", "--scope", "write", "--sql", ...base(dir)]); assert.match(w.saida, /'escrita'/, "o banco guarda escrita");
  const velha = await rodar(["chave", "criar", "--nome", "y", "--escopo", "escrita", "--sql", ...base(dir)]); assert.match(velha.saida, /'escrita'/);
  assert.equal((await rodar(["key", "create", "--sql", ...base(dir)])).cod, 1);
  assert.match((await rodar(["key", "create", "--name", "bardo", "--server", "https://x", ...base(dir)], { praeko: a })).saida, /arauto_NOVA/);
  assert.deepEqual(a.chamadas.find((c) => c[0] === "apiKeys.create").slice(1), ["bardo", "write"]);
  assert.match((await rodar(["key", "list", ...base(dir)], { praeko: a })).saida, /chv_1\s+write\s+bardo/);
  assert.match((await rodar(["key", "revoke", "chv_1", ...base(dir)], { praeko: a })).saida, /revogada/);
  const velho = falso(); await rodar(["chave", "criar", "--nome", "bardo", "--escopo", "leitura", "--servidor", "https://x", ...base(dir)], { arauto: velho });
  assert.deepEqual(velho.chamadas.find((c) => c[0] === "apiKeys.create").slice(1), ["bardo", "read"], "leitura → read");
  delete process.env.ARAUTO_CHAVE; delete process.env.PRAEKO_KEY; const sem = await rodar(["posts", "--server", "https://x", ...base(dir)]);
  assert.equal(sem.cod, 1); assert.match(sem.saida, /falta a chave do serviço/);
  rmSync(dir, { recursive: true, force: true });
});

// ---- Instagram pelo Buffer no serviço remoto: capa nos 2 primeiros quadros e adoção ----
import { spawnSync } from "node:child_process";
const temFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
const comIds = () => { const a = falso(); let n = 0; a.media.upload = (f, o) => { a.chamadas.push(["media.upload", f, o]); return { id: `M${++n}-${o.type}` }; }; return a; };

test("remoto + Instagram: o destino recebe uma cópia do vídeo com a capa nos 2 primeiros quadros (mídia extra do destino)", { skip: !temFfmpeg && "sem ffmpeg" }, async () => {
  const dir = ambiente(), a = comIds(), pk = join(dir, "pacotes", "pacote-teste");
  const sim = await rodar(["post", pk, "--server", "https://x", "--when", "30/12 17:30", "--networks", "yt,ig", "--yt-mode", "scheduled", ...base(dir)], { praeko: a });
  assert.equal(sim.cod, 0, sim.saida); assert.match(sim.saida, /Instagram: capa nos 2 primeiros quadros/); assert.equal(a.chamadas.length, 0); assert.ok(!existsSync(join(dir, ".praeko", "pacote-teste-instagram.mp4")), "a cópia só sai no --send");
  const r = await rodar(["post", pk, "--server", "https://x", "--when", "30/12 17:30", "--networks", "yt,ig", "--yt-mode", "scheduled", "--send", ...base(dir)], { praeko: a });
  assert.equal(r.cod, 0, r.saida); assert.match(r.saida, /capa colada nos 2 primeiros quadros/);
  assert.ok(existsSync(join(dir, ".praeko", "pacote-teste-instagram.mp4")));
  const uploads = a.chamadas.filter((c) => c[0] === "media.upload");
  assert.equal(uploads.length, 3, "vídeo, capa e a cópia do Instagram");
  const criado = a.chamadas.find((c) => c[0] === "posts.create")[1], ig = criado.items.find((d) => d.network === "instagram"), yt = criado.items.find((d) => d.network === "youtube");
  assert.deepEqual(criado.media, { video: "M1-video", cover: "M2-cover" }); assert.deepEqual(ig.media, { video: "M3-video" }); assert.equal(yt.media, undefined, "só o Instagram leva cópia");
  rmSync(dir, { recursive: true, force: true });
});
test("remoto + Instagram: --no-cover-in-frame desliga; vídeo longo não recebe capa nos quadros", { skip: !temFfmpeg && "sem ffmpeg" }, async () => {
  const dir = ambiente(), a = comIds(), pk = join(dir, "pacotes", "pacote-teste");
  const r = await rodar(["post", pk, "--server", "https://x", "--when", "30/12 17:30", "--networks", "ig", "--no-cover-in-frame", "--send", ...base(dir)], { praeko: a });
  assert.equal(r.cod, 0, r.saida); assert.equal(a.chamadas.filter((c) => c[0] === "media.upload").length, 2); assert.equal(a.chamadas.find((c) => c[0] === "posts.create")[1].items[0].media, undefined);
  const meta = JSON.parse(readFileSync(join(pk, "publicacao.json"), "utf8"));
  writeFileSync(join(pk, "publicacao.json"), JSON.stringify({ ...meta, formato: "longo" }));
  const l = await rodar(["post", pk, "--server", "https://x", "--when", "30/12 17:30", "--networks", "ig", ...base(dir)], { praeko: a });
  assert.match(l.saida, /capa não colada no vídeo longo/);
  rmSync(dir, { recursive: true, force: true });
});
test("remoto: adopt-buffer registra no painel um Reel já agendado no Buffer (sem chamar o Buffer) e exige os campos; adotar-buffer continua valendo", async () => {
  const dir = ambiente(), a = falso(); a.posts.adopt = (p) => { a.chamadas.push(["posts.adopt", p]); return { id: p.id, items: [{ state: "scheduled", scheduledFor: p.scheduledFor }] }; };
  const r = await rodar(["adopt-buffer", "--id", "longo-ig", "--title", "Eu ia fechar a brecha", "--when", "30/12 10:00", "--buffer-id", "6aebc2a5", "--text", "Legenda", "--server", "https://x", ...base(dir)], { praeko: a });
  assert.equal(r.cod, 0, r.saida); assert.match(r.saida, /adotado: longo-ig/);
  const esperado = { id: "longo-ig", title: "Eu ia fechar a brecha", network: "instagram", scheduledFor: "2026-12-30T13:00:00.000Z", external: { provider: "buffer", id: "6aebc2a5" }, texts: { instagram: { text: "Legenda" } } };
  assert.deepEqual(a.chamadas.find((x) => x[0] === "posts.adopt")[1], esperado);
  assert.equal((await rodar(["adopt-buffer", "--title", "x", "--server", "https://x", ...base(dir)], { praeko: a })).cod, 1);
  const b = falso(); b.posts.adopt = a.posts.adopt;
  const v = await rodar(["adotar-buffer", "--id", "longo-ig", "--titulo", "Eu ia fechar a brecha", "--quando", "30/12 10:00", "--buffer-id", "6aebc2a5", "--texto", "Legenda", "--servidor", "https://x", ...base(dir)], { arauto: b });
  assert.equal(v.cod, 0, v.saida);
  rmSync(dir, { recursive: true, force: true });
});

// ---- TikTok no serviço remoto ----
test("remoto + TikTok: post leva modo, privacidade e quadro da capa, avisa da auditoria e da capa em imagem", async () => {
  const dir = ambiente(), a = falso(), pk = join(dir, "pacotes", "pacote-teste");
  const args = ["post", pk, "--server", "https://x", "--when", "30/12 17:30", "--networks", "tt", "--tt-mode", "direct", "--tt-privacy", "SELF_ONLY", "--tt-frame", "1500"];
  const sim = await rodar([...args, ...base(dir)], { praeko: a });
  assert.equal(sim.cod, 0, sim.saida); assert.match(sim.saida, /SIMULAÇÃO/); assert.match(sim.saida, /TikTok\s+30\/12\/2026.*modo direto/); assert.match(sim.saida, /só vale SELF_ONLY.*auditado|auditado pelo TikTok/);
  assert.equal(a.chamadas.filter(([n]) => n === "posts.create").length, 0);
  const r = await rodar([...args, "--send", ...base(dir)], { praeko: a });
  assert.equal(r.cod, 0, r.saida);
  const pedido = a.chamadas.find(([n]) => n === "posts.create")[1];
  assert.deepEqual(pedido.items.map((d) => [d.network, d.mode]), [["tiktok", "direct"]]); assert.deepEqual(pedido.options.tiktok, { privacy: "SELF_ONLY", coverFrameMs: 1500 });
  const velho = falso(); await rodar(["postar", pk, "--servidor", "https://x", "--quando", "30/12 17:30", "--redes", "tt", "--modo-tt", "direto", "--privacidade-tt", "SELF_ONLY", "--quadro-tt", "1500", "--enviar", ...base(dir)], { arauto: velho });
  assert.deepEqual(velho.chamadas.find(([n]) => n === "posts.create")[1], pedido, "o alias faz a mesma chamada");
  const rasc = await rodar(["post", pk, "--server", "https://x", "--when", "30/12 17:30", "--networks", "tt", ...base(dir)], { praeko: a });
  assert.match(rasc.saida, /TikTok rascunho: o vídeo chega à caixa de entrada/);
  rmSync(dir, { recursive: true, force: true });
});
test("tiktok: import, videos, status, connect e disconnect pelo serviço; account tiktok status/disconnect com --server vai ao serviço; velhos nomes valem", async () => {
  const dir = ambiente(), conectado = { channels: [{ network: "tiktok", connected: true, detail: "Dev Ocioso" }] };
  const a = falso({ insights: { import: (o) => ({ imported: [{ network: o.network, simulated: !!o.dryRun, found: 5, created: 3, updated: 2, views: 900, likes: 80, comments: 6 }] }) }, content: { list: (o) => ({ total: 1, items: [{ publishedAt: "2026-11-02T12:00:00Z", network: o.network, views: 321, reactions: 40, title: "Vídeo de teste" }] }) } });
  a.channels.list = (o) => (o?.verify ? conectado : { channels: [] }); a.channels.disconnect = async (r) => { a.chamadas.push(["channels.disconnect", r]); return { disconnected: true, revokedAtTiktok: true }; };
  const imp = await rodar(["tiktok", "import", "--dry-run", ...base(dir)], { praeko: a }); assert.equal(imp.cod, 0, imp.saida); assert.match(imp.saida, /TikTok \(simulação\): 5 encontrados · 3 novos · 2 atualizados · 900 views/);
  assert.match((await rodar(["tiktok", "importar", "--simular", ...base(dir)], { praeko: a })).saida, /simulação/);
  const vid = await rodar(["tiktok", "videos", ...base(dir)], { praeko: a }); assert.match(vid.saida, /TikTok\s+321 views\s+40 reações\s+Vídeo de teste/);
  const st = await rodar(["tiktok", "status", ...base(dir)], { praeko: a }); assert.equal(st.cod, 0); assert.match(st.saida, /TikTok: conectado \(Dev Ocioso\)/); assert.match(st.saida, /auditado/);
  assert.match((await rodar(["account", "tiktok", "status", "--server", "https://x", ...base(dir)], { praeko: a })).saida, /TikTok: conectado/);
  assert.match((await rodar(["conta", "tiktok", "desconectar", "--servidor", "https://x", ...base(dir)], { praeko: a })).saida, /TikTok desconectado \(acesso revogado/);
  assert.match((await rodar(["tiktok", "connect", ...base(dir)], { praeko: a })).saida, /accounts\.example\/auth/);
  a.channels.list = () => ({ channels: [{ network: "tiktok", connected: false, detail: "não conectado" }] });
  assert.equal((await rodar(["tiktok", "status", ...base(dir)], { praeko: a })).cod, 1);
  assert.equal((await rodar(["tiktok", "xis", ...base(dir)], { praeko: a })).cod, 1);
  rmSync(dir, { recursive: true, force: true });
});
test("youtube, insights e followers pelo serviço leem os campos em inglês; aliases em português fazem a mesma chamada", async () => {
  const dir = ambiente();
  const a = falso({
    youtube: {
      listVideos: (o) => { a.chamadas.push(["youtube.listVideos", o]); return { videos: [{ id: "V1", publishedAt: "2026-11-02T12:00:00Z", privacy: "public", viewCount: 9, title: "Vídeo" }], next: null }; },
      getVideo: async () => ({ video: { title: "T", url: "https://y/V1", privacy: "public", publishedAt: "2026-11-02T12:00:00Z", viewCount: 9, likes: 2, comments: 1, description: "desc" } }),
      editVideo: (id, o) => { a.chamadas.push(["youtube.editVideo", id, o]); return { before: { title: "A", description: "d" }, after: { title: "B", description: "d" }, changed: true, written: !o.dryRun }; },
      comments: (o) => { a.chamadas.push(["youtube.comments", o]); return { comments: [{ id: "T1", publishedAt: "2026-11-02T12:00:00Z", videoId: "V1", fromOwner: false, answered: false, author: "Ana", text: "oi" }], next: null }; },
      reply: async () => ({ id: "R1" }), resolve: async () => ({}), reopen: async () => ({}),
    },
    insights: { get: (o) => { a.chamadas.push(["insights.get", o]); return { cards: { posts: 2, views: 100, reactions: 10, comments: 3, engagement: 13, followers: 50, followersChange: 2, change: {} }, sources: {}, topPosts: [{ title: "Top", network: "youtube", reactions: 5, comments: 1, views: 50 }], channels: [{ network: "youtube", posts: 2, reactions: 10, comments: 3, engagement: 13 }], summary: [{ title: "Resumo", text: "ok" }], collection: { collecting: false }, reading48h: [], reading48hText: "| tabela |" }; } },
    channels: { followers: async () => ({ records: [{ day: "2026-11-04", followers: 1000, source: "manual" }] }), setFollowers: async (n, v, o) => { a.chamadas.push(["channels.setFollowers", n, v, o]); return { followers: v, day: "2026-11-04" }; } },
  });
  assert.match((await rodar(["youtube", "videos", "--max", "5", ...base(dir)], { praeko: a })).saida, /V1\s.*public.*Vídeo/);
  assert.match((await rodar(["youtube", "video", "V1", ...base(dir)], { praeko: a })).saida, /9 views · 2 curtidas/);
  const ed = await rodar(["youtube", "edit", "V1", "--title", "B", "--send", ...base(dir)], { praeko: a }); assert.match(ed.saida, /EDITANDO/); assert.match(ed.saida, /escrito no YouTube/);
  assert.equal(a.chamadas.find((c) => c[0] === "youtube.editVideo")[2].dryRun, false);
  const ed2 = await rodar(["youtube", "editar", "V1", "--titulo", "B", ...base(dir)], { praeko: a }); assert.match(ed2.saida, /SIMULAÇÃO/);
  assert.match((await rodar(["youtube", "comments", "--unanswered", ...base(dir)], { praeko: a })).saida, /SEM RESPOSTA  Ana: oi/);
  await rodar(["youtube", "comentarios", "--sem-resposta", ...base(dir)], { praeko: a });
  const cs = a.chamadas.filter((c) => c[0] === "youtube.comments"); assert.deepEqual(cs[0][1], cs[1][1]);
  assert.match((await rodar(["youtube", "reply", "T1", "--text", "valeu", "--send", ...base(dir)], { praeko: a })).saida, /respondido \(R1\)/);
  assert.match((await rodar(["youtube", "responder", "T1", "--texto", "valeu", ...base(dir)], { praeko: a })).saida, /SIMULAÇÃO/);
  const ins = await rodar(["insights", "--days", "7", "--type", "long", "--compare", ...base(dir)], { praeko: a }); assert.match(ins.saida, /posts 2 · views 100 · reações 10 · comentários 3/); assert.match(ins.saida, /• Resumo: ok/);
  await rodar(["insights", "--dias", "7", "--tipo", "longo", "--comparar", ...base(dir)], { praeko: a });
  const ig = a.chamadas.filter((c) => c[0] === "insights.get"); assert.equal(ig[0][1].type, "long"); assert.equal(ig[0][1].compare, true); assert.equal(ig[1][1].type, "long");
  assert.match((await rodar(["insights", "48h", ...base(dir)], { praeko: a })).saida, /\| tabela \|/);
  assert.match((await rodar(["followers", "instagram", ...base(dir)], { praeko: a })).saida, /2026-11-04\s+1000\s+manual/);
  assert.match((await rodar(["followers", "instagram", "1200", "--day", "2026-11-04", ...base(dir)], { praeko: a })).saida, /1200 seguidores/);
  assert.deepEqual(a.chamadas.find((c) => c[0] === "channels.setFollowers").slice(1), ["instagram", 1200, { day: "2026-11-04" }]);
  rmSync(dir, { recursive: true, force: true });
});

test("PRAEKO_KEY e PRAEKO_SERVER valem (com ARAUTO_CHAVE como reserva) e a ajuda se apresenta como Praeko", async () => {
  const chamadas = [], arauto = { posts: async () => ({ posts: [] }), channels: async () => ({ channels: [] }) };
  const ant = { s: process.env.PRAEKO_SERVER, k: process.env.PRAEKO_KEY, c: process.env.ARAUTO_CHAVE };
  try {
    process.env.PRAEKO_SERVER = "https://praeko.exemplo"; process.env.PRAEKO_KEY = "arauto_" + "x".repeat(24); delete process.env.ARAUTO_CHAVE;
    const saida = []; await executarCli(["posts"], { log: (x) => saida.push(String(x)), erro: (x) => saida.push(String(x)), ctxExtra: { arauto } });
    assert.ok(!saida.some((l) => /falta o endereço|falta a chave/.test(l)), saida.join("\n"));
    const ajuda = []; await executarCli(["help"], { log: (x) => ajuda.push(String(x)) });
    assert.match(ajuda.join("\n"), /Praeko CLI/); assert.match(ajuda.join("\n"), /PRAEKO_KEY/); void chamadas;
  } finally { for (const [k, v] of [["PRAEKO_SERVER", ant.s], ["PRAEKO_KEY", ant.k], ["ARAUTO_CHAVE", ant.c]]) v === undefined ? delete process.env[k] : (process.env[k] = v); }
});

test("keys migrate: copia do Chaveiro antigo para o novo (dublê de segredos), sem imprimir segredo; `key migrate` e `chave migrar` valem", async () => {
  const dir = ambiente();
  const novo = new Map(), antigo = new Map([["praeko/chave", "arauto_SEGREDO_DA_CHAVE_ANTIGA_123456"], ["youtube/token", "TOKEN-SECRETO-ANTIGO"]]);
  const segredos = { obterNovo: (r) => novo.get(r) ?? null, obterAntigoGuardado: (r) => antigo.get(r) ?? null, obter: (r) => novo.get(r) ?? antigo.get(r) ?? null, guardar: (r, v) => { novo.set(r, v); return "chaveiro"; } };
  const r = await rodar(["keys", "migrate"], { segredos });
  assert.equal(r.cod, 0, r.saida);
  assert.match(r.saida, /praeko\/chave: copiado/); assert.match(r.saida, /youtube\/token: copiado/); assert.match(r.saida, /2 item\(ns\) copiado\(s\)/);
  assert.ok(!r.saida.includes("SEGREDO_DA_CHAVE") && !r.saida.includes("TOKEN-SECRETO"), "nenhum valor aparece na saída");
  assert.equal(novo.get("praeko/chave"), "arauto_SEGREDO_DA_CHAVE_ANTIGA_123456"); assert.equal(novo.get("youtube/token"), "TOKEN-SECRETO-ANTIGO"); assert.equal(antigo.size, 2, "o antigo continua onde estava");
  const de_novo = await rodar(["key", "migrate"], { segredos });
  assert.equal(de_novo.cod, 0); assert.match(de_novo.saida, /nada a copiar/); assert.match(de_novo.saida, /praeko\/chave: já existe no novo/);
  assert.equal((await rodar(["chave", "migrar"], { segredos })).cod, 0);
  assert.match((await rodar(["help"])).saida, /keys migrate/);
  rmSync(dir, { recursive: true, force: true });
});

test("o comando `praeko` e o apelido `arauto` rodam o mesmo CLI", async () => {
  const { execFileSync } = await import("node:child_process");
  const bin = (n) => fileURLToPath(new URL(`../bin/${n}.mjs`, import.meta.url));
  const a = execFileSync(process.execPath, [bin("praeko"), "help"], { encoding: "utf8" }), b = execFileSync(process.execPath, [bin("arauto"), "help"], { encoding: "utf8" });
  assert.match(a, /Praeko CLI/); assert.equal(a, b);
});

test("usage e usage log pelo serviço: resumo em português, filtros viram a query do contrato", async () => {
  const dir = ambiente(), chamadas = [];
  const a = falso({ usage: {
    get: (o) => { chamadas.push(["usage.get", o]); return { days: 7, total: 120, succeeded: 117, errors: 3, p95Ms: 412, peakPerMinute: 30, limitPerMinute: 300, byDay: [{ day: "2026-11-05", total: 120, errors: 3 }], byKey: [{ id: "k1", name: "CLI no Mac", total: 100, errors: 1, lastAt: "2026-11-05T12:00:00Z" }, { id: "session", name: "Painel", total: 20, errors: 2, lastAt: "2026-11-05T13:00:00Z" }] }; },
    log: (o) => { chamadas.push(["usage.log", o]); return { records: [{ id: "01", method: "GET", route: "/v1/posts/:id", status: 404, durationMs: 12, key: "k1", keyName: "CLI no Mac", createdAt: "2026-11-05T12:00:00Z" }], next: "01ZZ" }; },
  } });
  const r = await rodar(["usage", "--days", "7", ...base(dir)], { praeko: a });
  assert.equal(r.cod, 0, r.saida); assert.match(r.saida, /chamadas 120 · sucesso 97,5% · erros 3 · p95 412 ms · pico 30\/min \(limite 300\/min\)/); assert.match(r.saida, /CLI no Mac\s+100 chamadas · 1 erros/);
  assert.deepEqual(chamadas[0], ["usage.get", { days: "7" }]);
  const l = await rodar(["usage", "log", "--key-id", "session", "--code", "4xx", "--route", "/v1/posts", "--method", "GET", "--limit", "5", ...base(dir)], { praeko: a });
  assert.equal(l.cod, 0, l.saida); assert.match(l.saida, /GET\s+404\s+12 ms\s+\/v1\/posts\/:id/); assert.match(l.saida, /--cursor 01ZZ/);
  assert.deepEqual(chamadas[1], ["usage.log", { key: "session", status: "4xx", route: "/v1/posts", method: "GET", days: undefined, limit: "5", cursor: undefined }]);
  assert.equal((await rodar(["usage", "xis", ...base(dir)], { praeko: a })).cod, 1);
  rmSync(dir, { recursive: true, force: true });
});

test("webhook pelo serviço: create mostra o segredo uma vez; list, test, deliveries, pause, events e remove", async () => {
  const dir = ambiente(), ch = [], w = { id: "wh_1", url: "https://c.example/h", events: ["post.sent"], active: true };
  const d = { id: "whd_1", event: "ping.test", state: "delivered", attempts: 1, lastStatus: 200, createdAt: "2026-11-05T12:00:00Z" };
  const reg = (n, r) => (...x) => { ch.push([n, ...x]); return r; };
  const a = falso({ webhooks: { list: reg("list", { webhooks: [w], events: [] }), create: reg("create", { ...w, secret: "whsec_SEGREDO" }), test: reg("test", { delivery: d }), deliveries: reg("deliveries", { deliveries: [d] }), redeliver: reg("redeliver", { delivery: d }), update: reg("update", { ...w, active: false }), remove: reg("remove", { deleted: "wh_1" }), rotateSecret: reg("rotate", { secret: "whsec_NOVO" }) } });
  const r = (args) => rodar([...args, ...base(dir)], { praeko: a });
  const cr = await r(["webhook", "create", "--url", "https://c.example/h", "--events", "post.sent, post.failed"]);
  assert.equal(cr.cod, 0, cr.saida); assert.match(cr.saida, /aparece só agora\): whsec_SEGREDO/); assert.deepEqual(ch.at(-1), ["create", { url: "https://c.example/h", events: ["post.sent", "post.failed"] }]);
  assert.match((await r(["webhook", "list"])).saida, /wh_1\s+ativo\s+https:\/\/c\.example\/h\s+\[post\.sent\]/);
  const t = await r(["webhook", "test", "wh_1"]); assert.equal(t.cod, 0); assert.match(t.saida, /ping\.test\s+delivered\s+200/);
  assert.match((await r(["webhook", "deliveries", "wh_1"])).saida, /whd_1/);
  assert.equal((await r(["webhook", "retry", "wh_1", "whd_1"])).cod, 0); assert.deepEqual(ch.at(-1), ["redeliver", "wh_1", "whd_1"]);
  assert.match((await r(["webhook", "pause", "wh_1"])).saida, /pausado/); assert.deepEqual(ch.at(-1), ["update", "wh_1", { active: false }]);
  await r(["webhook", "events", "wh_1", "post.failed"]); assert.deepEqual(ch.at(-1), ["update", "wh_1", { events: ["post.failed"] }]);
  assert.match((await r(["webhook", "rotate-secret", "wh_1"])).saida, /whsec_NOVO/);
  assert.match((await r(["webhook", "remove", "wh_1"])).saida, /apagado/);
  assert.equal((await r(["webhook", "create"])).cod, 1); assert.equal((await r(["webhook", "test"])).cod, 1); assert.equal((await r(["webhook", "xis", "a"])).cod, 1);
  rmSync(dir, { recursive: true, force: true });
});

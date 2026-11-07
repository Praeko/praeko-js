// CLI do Praeko (comando `praeko`; `arauto` segue como apelido). Simulação por padrão; `--enviar` é o que publica/agenda de verdade.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Praeko } from "@praeko/sdk";
import { trocarHashtags } from "@praeko/core/provedores/youtube-comunidade";
import { FORMATO_CHAVE, gerarChave, hashChave, idChave, prefixoChave } from "@praeko/core/chaves";
import { NOME_PROJETO, REDES, acharConfig, capaQuadro, migrar, pastaEstado, caminhoEstado, cancelarItem, criarContexto, criarPublicador, executar, lerFila, liberarItem, normalizarConfig, parseQuando, plistLaunchd, provedores, segredos, validarPedido } from "@praeko/core";
import { lerPacote, montarPedido } from "./pacote.mjs";

/** Cliente do serviço já pronto injetado pelos testes: `praeko` (ou o nome antigo, `arauto`). */
const injetado = (extra) => extra?.praeko ?? extra?.arauto;

const BIN = resolve(fileURLToPath(import.meta.url), "..", "..", "bin", "praeko.mjs");
const NOME = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok" };
const COM_VALOR = new Set(["type", "sort", "direction", "limit", "when", "networks", "yt", "ig", "tt", "yt-mode", "tt-mode", "video", "cover", "meta", "instagram", "instagram-id", "id", "url", "via", "config", "minutes", "key", "server", "scope", "name", "timezone", "from", "to", "state", "tag", "channel", "max", "page", "title", "description-file", "swap-hashtags", "text", "buffer-id", "cover-media", "days", "day", "tt-privacy", "tt-frame", "code", "route", "method", "cursor", "key-id", "events", "idempotency-key"]);

// Deprecated Portuguese names → English. Applied right after parsing, so the rest of the CLI only knows the new names.
const FLAG_ALIAS = { quando: "when", redes: "networks", "modo-yt": "yt-mode", "modo-tt": "tt-mode", por: "via", enviar: "send", simular: "dry-run", etiqueta: "tag", estado: "state", canal: "channel", titulo: "title", "descricao-arquivo": "description-file", "trocar-hashtags": "swap-hashtags", texto: "text", "sem-resposta": "unanswered", ordem: "sort", direcao: "direction", limite: "limit", pagina: "page", comparar: "compare", dias: "days", dia: "day", servidor: "server", chave: "key", escopo: "scope", nome: "name", fuso: "timezone", de: "from", ate: "to", fila: "queue", rascunho: "draft", lembrete: "reminder", capa: "cover", "capa-midia": "cover-media", "privacidade-tt": "tt-privacy", "quadro-tt": "tt-frame", cancelar: "cancel", "sem-capa-no-quadro": "no-cover-in-frame", minutos: "minutes", tipo: "type", ajuda: "help" };
const CMD_ALIAS = { postar: "post", agendar: "schedule", fila: "queue", conta: "account", canais: "channels", calendario: "calendar", vagas: "slots", "publicar-agora": "publish-now", "youtube-agendar": "youtube-schedule", "adotar-buffer": "adopt-buffer", importar: "import", conteudo: "content", seguidores: "followers", chave: "key", keys: "key", ajuda: "help" };
const SUB_ALIAS = {
  queue: { listar: "list", executar: "run", cancelar: "cancel", comentar: "comment", instalar: "install", remover: "remove" },
  account: { conectar: "connect", desconectar: "disconnect", enviar: "send" },
  youtube: { editar: "edit", comentarios: "comments", resolver: "resolve", reabrir: "reopen", responder: "reply" },
  tiktok: { importar: "import", conectar: "connect", desconectar: "disconnect" },
  key: { guardar: "store", criar: "create", listar: "list", revogar: "revoke", migrar: "migrate" },
};
// Old value spellings → the ones the CLI uses internally. Modes go back to Portuguese because the Publisher "pedido" (local/Buffer providers) is internal and Portuguese.
const MODO_YT = { private: "privado", scheduled: "agendado", public: "publico" }, MODO_TT = { draft: "rascunho", direct: "direto" };
const ESTADO = { fila: "queued", rascunho: "draft", enviado: "sent", erro: "error", cancelado: "canceled" };
const ESCOPO = { leitura: "read", escrita: "write" }, ESCOPO_PT = { read: "leitura", write: "escrita" };
const ORDEM = { recentes: "recent", reacoes: "reactions", comentarios: "comments", engajamento: "engagement", compartilhamentos: "shares", salvamentos: "saves", alcance: "reach", publicadoEm: "publishedAt" };
const DIA = { dom: "sun", seg: "mon", ter: "tue", qua: "wed", qui: "thu", sex: "fri", sab: "sat" }, DIA_PT = Object.fromEntries(Object.entries(DIA).map(([k, v]) => [v, k]));
const ESTADO_PT = { draft: "rascunho", scheduled: "agendado", sent: "enviado", error: "erro", canceled: "cancelado", private: "privado", queued: "fila" };
const estadoPt = (e) => ESTADO_PT[e] ?? e;

export const AJUDA = `Praeko CLI (formerly "arauto"): personal publisher (YouTube, Instagram, TikTok)

  post <folder|name> --when "06/11 17:30" [--networks yt,ig,tt] [--yt|--ig|--tt "time"]
       [--yt-mode private|scheduled|public] [--tt-mode draft|direct] [--via local|buffer] [--send]
       [--tt-privacy SELF_ONLY|PUBLIC_TO_EVERYONE|…] [--tt-frame 1500]   (only with --server; direct public TikTok needs the app audit)
                                  publishes through Praeko (queue + direct providers); without --send it only simulates
  schedule <folder|name> …        the same, through Buffer (--via buffer); schedule <name> --status | --cancel [--networks yt]
                                  schedule --key: stores the Buffer key (echo $KEY | praeko schedule --key)
  queue [list|run [--dry-run]|cancel <id>|comment <id>|install [--minutes N]|remove]     the local queue
  account <youtube|instagram|tiktok> [connect|status]
  channels [--via local|buffer]   what is connected

Praeko service (Cloudflare; formerly Arauto), with --server https://praeko.app (or PRAEKO_SERVER, or "remoto": { "url" } in praeko.json) and the key in PRAEKO_KEY (ARAUTO_CHAVE still works):
  post <package> --server URL [--queue | --when … | --draft] [--tag a,b] [--yt-mode …] [--send]
  posts [--state queued|draft|sent|error|canceled] [--channel yt] [--tag x] [--limit n]   lists the service posts
  calendar [--from ISO] [--to ISO] [--channel yt]                          scheduled items and free slots
  slots <network> [day time …] [--timezone America/Sao_Paulo]              show or replace the weekly slots (e.g. slots youtube fri 17:30 sun 22:00)
  publish-now <id> [--networks yt]                                         takes it out of the queue and publishes now
  youtube videos [--max 20] | video <id>                                   the channel videos (private and scheduled included)
  youtube edit <id> [--title T] [--description-file f.txt] [--swap-hashtags "#a #b"] [--send]
                                                                           changes title/description (simulates; --send writes)
  youtube comments [--video id] [--unanswered] [--max 20]                  comments still without your reply
  youtube resolve|reopen <thread>                                          hides/restores a thread in the pending box (Praeko only)
  youtube reply <thread> --text "…" [--send]                               replies to a comment (simulates; --send writes)
  adopt-buffer --id name --title "…" --when "07/11 10:00" --buffer-id <Buffer post>   shows a Reel already scheduled in Buffer (does not call Buffer)
  insights [--days 30] [--channel yt|ig] [--type reel|short|long] [--tag x] [--compare] [--sort views] [--posts] [--json]
  insights 48h [--days 30]                                                 48 h reading per post, as a table for product-marketing.md
  import [youtube|instagram|tiktok] [--dry-run]                            (admin) brings the history into Insights
  content [--channel yt] [--limit 30] [--sort recent|views|reactions]      everything already published (Praeko + imported)
  followers <instagram|tiktok> [value] [--day YYYY-MM-DD]                  lists followers; manual entry only for Instagram
  tiktok import [--dry-run] | videos [--limit 30] [--sort views] | status | connect | disconnect
  youtube-schedule <post> --when "07/11 10:00"                             schedules a video already uploaded to YouTube (private)
  account <network> connect --server URL                                   returns (and opens) the authorization link
  account tiktok connect|status|disconnect --server URL
  account instagram connect --meta [--replace] [--instagram user] [--instagram-id ID] [--probe] --server URL   login da Meta (OAuth); --replace só se já houver conexão
  account instagram send --server URL                                      sends the Meta token (Keychain) to the server, encrypted
  key store                                                                stores the service key (echo $KEY | praeko key store)
  key create --name bardo [--scope write] [--server URL]                   creates an API key (needs an admin key); scopes: read, write, admin
  key create --name admin --scope admin --sql                              generates the first key and the SQL for D1 (docs/servidor.md)
  key list | key revoke <id>
  usage [--days 7] [--json]                                                API usage: calls, success rate, p95, peak per minute, per day and per key
  usage log [--key-id id|session] [--code 4xx|404] [--route /v1/posts] [--method GET] [--days 30] [--limit 50] [--cursor c] [--json]   request log (30 days, metadata only)
  webhook list | create --url https://… [--events post.sent,post.failed] | test <id> | deliveries <id> [--limit 20] | retry <id> <delivery>
  webhook pause|resume|remove <id> | rotate-secret <id> | events <id> post.sent,post.failed      (admin) outgoing webhooks; the secret is printed once
  keys migrate                                                             copies the Keychain items of the old service (arauto) to the new one (praeko); prints names only, never secrets
  help

Global flags: --server URL, --key, --config file, --help. --idempotency-key K (publish-now, webhook create): sends the Idempotency-Key header so a repeated command does not repeat the action (docs/idempotencia.md).
The package folder has publicacao.json, the video and the cover (or use --meta/--video/--cover). Config: praeko.json (or the old arauto.json, or the
publicacao section of a marca.json) in the current folder or above. Nothing is sent without --send. Human-readable output is in Portuguese.

Deprecated aliases (Portuguese), still working: postar agendar fila conta canais calendario vagas publicar-agora youtube-agendar adotar-buffer importar conteudo seguidores chave ajuda;
subcommands listar executar cancelar comentar instalar remover conectar desconectar enviar editar comentarios resolver reabrir responder importar guardar criar revogar;
flags --quando --redes --modo-yt --modo-tt --por --enviar --simular --etiqueta --estado --canal --titulo --descricao-arquivo --trocar-hashtags --texto --sem-resposta --ordem --direcao --limite --pagina --comparar --dias --dia --servidor --chave --escopo --nome --fuso --de --ate --fila --rascunho --lembrete --capa --capa-midia --privacidade-tt --quadro-tt --cancelar --sem-capa-no-quadro --minutos --tipo --ajuda;
old values (privado agendado publico rascunho direto fila enviado leitura escrita …) are accepted too.
`;

function flags(a) {
  const f = { _: [] };
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith("--")) { let k = a[i].slice(2); k = FLAG_ALIAS[k] ?? k; if (COM_VALOR.has(k) && a[i + 1] !== undefined && !a[i + 1].startsWith("--")) f[k] = a[++i]; else f[k] = true; }
    else f._.push(a[i]);
  }
  // values written in the old spelling
  if (f["yt-mode"] && typeof f["yt-mode"] === "string") f["yt-mode"] = MODO_YT[f["yt-mode"]] ?? f["yt-mode"];
  if (f["tt-mode"] && typeof f["tt-mode"] === "string") f["tt-mode"] = MODO_TT[f["tt-mode"]] ?? f["tt-mode"];
  if (typeof f.state === "string") f.state = ESTADO[f.state] ?? f.state;
  if (typeof f.scope === "string") f.scope = ESCOPO[f.scope] ?? f.scope;
  if (typeof f.sort === "string") f.sort = ORDEM[f.sort] ?? f.sort;
  if (f.type === "longo") f.type = "long";
  return f;
}
const redesDe = (txt, padrao) => (txt ? String(txt).split(",").map((x) => REDES[x.trim()] || (() => { throw new Error(`rede desconhecida: ${x}`); })()) : padrao);
const local = (iso) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

function carregar(f) {
  const achado = f.config ? { raiz: resolve(f.config, ".."), config: normalizarConfig(JSON.parse(readFileSync(resolve(f.config), "utf8"))) } : acharConfig();
  if (!achado) throw new Error("não achei praeko.json (nem arauto.json ou marca.json) na pasta atual ou acima");
  return achado;
}

export async function executarCli(argv, { log = console.log, erro = console.error, ctxExtra = {} } = {}) {
  const [cmd0, ...resto] = argv;
  const cmd = CMD_ALIAS[cmd0] ?? cmd0;
  if (cmd === "--version" || cmd === "-v" || cmd === "version") { log(typeof __PRAEKO_CLI_VERSION__ === "undefined" ? "dev" : __PRAEKO_CLI_VERSION__); return 0; }
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "--ajuda") { log(AJUDA); return 0; }
  const f = flags(resto);
  if (!f.server && process.env.PRAEKO_SERVER) f.server = process.env.PRAEKO_SERVER; // PRAEKO_SERVER=https://praeko.app: todo comando que fala com o serviço usa esse endereço sem repetir --server
  const subs = SUB_ALIAS[cmd], idx = cmd === "account" ? 1 : 0;
  if (subs && f._[idx]) f._[idx] = subs[f._[idx]] ?? f._[idx];
  try {
    if (cmd === "post" || cmd === "schedule") return await postar(cmd, f, log, ctxExtra);
    if (cmd === "queue") return await fila(f, log, ctxExtra);
    if (cmd === "account") return await conta(f, log, ctxExtra, resto);
    if (cmd === "channels") return await canais(f, log, ctxExtra);
    if (cmd === "posts") return await postsRemoto(f, log, ctxExtra);
    if (cmd === "calendar") return await calendarioRemoto(f, log, ctxExtra);
    if (cmd === "slots") return await vagasRemoto(f, log, ctxExtra);
    if (cmd === "publish-now") return await publicarAgoraRemoto(f, log, ctxExtra);
    if (cmd === "youtube-schedule") return await youtubeAgendarRemoto(f, log, ctxExtra);
    if (cmd === "adopt-buffer") return await adotarBufferRemoto(f, log, ctxExtra);
    if (cmd === "youtube") return await youtubeCmd(f, log, ctxExtra);
    if (cmd === "tiktok") return await tiktokCmd(f, log, ctxExtra);
    if (cmd === "insights") return await insightsCmd(f, log, ctxExtra);
    if (cmd === "import") return await importarCmd(f, log, ctxExtra);
    if (cmd === "followers") return await seguidoresCmd(f, log, ctxExtra);
    if (cmd === "content") return await conteudoCmd(f, log, ctxExtra);
    if (cmd === "key") return await chave(f, log, ctxExtra);
    if (cmd === "usage") return await usoCmd(f, log, ctxExtra);
    if (cmd === "webhook" || cmd === "webhooks") return await webhookCmd(f, log, ctxExtra);
    log(AJUDA); return 2;
  } catch (e) { erro("erro: " + e.message); return 1; }
}

async function postar(cmd, f, log, extra) {
  if (cmd === "schedule" && f.key !== undefined) {
    let k = typeof f.key === "string" ? f.key : "";
    if (!k) { const ch = []; for await (const c of process.stdin) ch.push(c); k = Buffer.concat(ch).toString().trim(); }
    if (!k) throw new Error("uso: echo $KEY | praeko schedule --key   (publish.buffer.com/settings/api)");
    log(`chave do Buffer guardada (${segredos.guardar("buffer/principal", k)})`); return 0;
  }
  const { raiz, config: config0 } = carregar(f);
  const config = f.server ? { ...config0, remoto: { ...(config0.remoto || {}), url: f.server } } : config0, ctx = criarContexto({ config, raiz, log, ...extra });
  const provedor = f.server ? "remoto" : f.via || (cmd === "schedule" ? "buffer" : config.provedor && config.provedor !== "buffer" ? config.provedor : "local");
  const arg = f._[0];
  const pub = await criarPublicador({ config, provedor, ctx: provedor === "remoto" && injetado(extra) ? { ...ctx, praeko: injetado(extra) } : ctx });
  if (f.status || f.cancel) {
    if (!arg) throw new Error("diga o pacote: praeko schedule <name> --status");
    const id = f.id || basename(resolve(arg));
    if (f.status) { for (const i of (await pub.status(id)).itens) log(`${NOME[i.rede].padEnd(10)} ${i.estado.padEnd(10)} ${i.quando ? local(i.quando) : ""}  ${i.id}`); return 0; }
    const r = await pub.cancelar(id, { redes: f.networks ? redesDe(f.networks) : undefined });
    log(`✓ cancelados: ${r.cancelados.join(", ") || "nenhum"}${r.mantidos.length ? `; mantidos: ${r.mantidos.join(", ")}` : ""}`); return 0;
  }
  if (!arg && !f.meta) throw new Error(`uso: praeko ${cmd} <package-folder> --when "06/11 17:30" [--send]`);
  const pacote = lerPacote({ arg, flags: f, raiz, config });
  const padraoRedes = Array.isArray(config.redes) ? config.redes.map((x) => REDES[x]) : pacote.meta.formato === "longo" ? ["youtube", "instagram"] : ["youtube", "instagram", "tiktok"];
  const redes = redesDe(f.networks, padraoRedes);
  const fuso = config.fusoOffset || "-03:00", chaveRede = { youtube: "yt", instagram: "ig", tiktok: "tt" };
  const destinos = redes.map((r) => {
    const q = f[chaveRede[r]] || f.when;
    const modo = r === "youtube" ? f["yt-mode"] : r === "tiktok" ? f["tt-mode"] : undefined;
    const quando = q ? parseQuando(q, { fuso }) : null;
    if (quando && Date.parse(quando) < Date.now() + 5 * 60e3 && provedor === "buffer") throw new Error(`${NOME[r]}: ${local(quando)} é daqui a menos de 5 minutos ou já passou`);
    return { rede: r, quando, ...(modo ? { modo } : {}), ...(f.queue && !quando ? { fila: true } : {}), ...(f.draft ? { rascunho: true } : {}) };
  });
  const { pedido, erros, avisos } = montarPedido({ pacote, config, destinos, opcoes: { lembrete: !!f.reminder, ...(f["no-cover-in-frame"] ? { capaNoQuadro: false } : {}), ...(f.url ? { videoUrl: f.url } : {}) } });
  if (provedor === "remoto" && destinos.some((d) => d.rede === "tiktok")) {
    const o = { ...(config.tiktok?.privacidade ? { privacidade: config.tiktok.privacidade } : {}), ...(config.tiktok?.capaMs != null ? { miniaturaMs: config.tiktok.capaMs } : {}), ...(f["tt-privacy"] ? { privacidade: f["tt-privacy"] } : {}), ...(f["tt-frame"] ? { miniaturaMs: Number(f["tt-frame"]) } : {}) };
    if (Object.keys(o).length) pedido.opcoes.tiktok = o;
    const direto = pedido.destinos.find((d) => d.rede === "tiktok")?.modo === "direto";
    avisos.push(direto ? "TikTok direto: enquanto o app não for auditado pelo TikTok, só vale SELF_ONLY (privado) e só contas de teste; público exige auditoria (docs/tiktok.md)" : "TikTok rascunho: o vídeo chega à caixa de entrada do app; legenda e capa você ajusta no app (a API da caixa de entrada não leva as duas)");
    if (pacote.capa) avisos.push("TikTok: a capa em imagem não é usada (o TikTok só aceita um quadro do vídeo: --tt-frame <ms>)");
  }
  if (provedor === "remoto") { pedido.id = String(pedido.id).replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 64); if (f.tag) pedido.etiquetas = String(f.tag).split(",").map((x) => x.trim()).filter(Boolean); }
  erros.forEach((e) => log("  ✗ " + e)); if (erros.length) return 1;
  const errosPedido = validarPedido(pedido); if (errosPedido.length) { errosPedido.forEach((e) => log("  ✗ " + e)); return 1; }
  const enviar = !!f.send;
  if (provedor === "remoto") await capaNosQuadrosInstagram({ pedido, pacote, f, raiz, enviar, log, avisos });
  log(`${enviar ? "PUBLICANDO" : "SIMULAÇÃO (nada será enviado; use --send)"} [${provedor}]: ${pedido.titulo}`);
  log(`pacote: ${pacote.dir}\nvídeo: ${basename(pacote.video)}${pacote.capa ? `  capa: ${basename(pacote.capa)}` : "  (sem capa)"}`);
  for (const d of pedido.destinos) log(`  ${NOME[d.rede].padEnd(10)} ${d.fila ? "próxima vaga da fila" : d.rascunho ? "rascunho" : !d.quando || (provedor === "local" && d.rede === "youtube" && (d.modo || config.youtube?.modo || "privado") !== "agendado") ? "agora" : local(d.quando)}${d.modo ? `  modo ${d.modo}` : ""}  texto ${pedido.textos[d.rede].texto.length} caract.`);
  if (provedor === "local") { // linhas de resumo de cada provedor (não publica nada)
    const todos = await provedores.carregarTodos();
    for (const d of pedido.destinos) for (const l of (await todos[d.rede]?.planejar?.({ item: { slug: pedido.id, rede: d.rede, quando: d.quando || new Date().toISOString(), video: pacote.video, capa: pacote.capa, textos: pedido.textos[d.rede], opcoes: { ...(config[d.rede] || {}), modo: d.modo || config[d.rede]?.modo }, titulo: pedido.titulo }, ctx })) || []) log("     " + l);
  }
  avisos.forEach((x) => log("  ⚠ " + x));
  (pacote.meta.antesDePublicar || []).forEach((x) => log("  ☐ " + x));
  if (!enviar) return 0;
  const r = await pub.publicar(pedido);
  for (const i of r.itens) log(`${i.estado === "erro" ? "✗" : "✓"} ${NOME[i.rede]} ${i.estado}${i.quando && i.estado === "agendado" ? " para " + local(i.quando) : ""}${i.url ? "  " + i.url : ""}${i.studio ? "  (" + i.studio + ")" : ""}${i.aviso ? "  " + i.aviso : ""}`);
  return r.itens.some((i) => i.estado === "erro") ? 1 : 0;
}

/**
 * Instagram pelo Buffer: o Buffer não aceita capa à parte, então o destino Instagram recebe uma CÓPIA do vídeo com a capa colada nos 2
 * primeiros quadros (miniatura = quadro 0), enviada como mídia extra do destino. Só para vídeo e capa da mesma proporção; --sem-capa-no-quadro desliga.
 */
async function capaNosQuadrosInstagram({ pedido, pacote, f, raiz, enviar, log, avisos }) {
  const d = pedido.destinos.find((x) => x.rede === "instagram");
  if (!d || f["no-cover-in-frame"] || d.midia) return;
  if (!pacote.capa) { avisos.push("Instagram: sem capa, a miniatura será um quadro do vídeo"); return; }
  if (pedido.opcoes?.formato === "longo") { avisos.push("Instagram: capa não colada no vídeo longo (a capa 16:9 não serve de miniatura de Reel)"); return; }
  let v, c;
  try { v = capaQuadro.sondar(pacote.video); c = capaQuadro.dimensoesImagem(pacote.capa); } catch (e) { avisos.push(`Instagram: não consegui conferir a capa (${e.message}); sem capa nos quadros`); return; }
  if (!capaQuadro.mesmaProporcao(c, v)) { avisos.push(`Instagram: a capa ${c.largura}x${c.altura} não tem a proporção do vídeo ${v.largura}x${v.altura}; não colei nos quadros`); return; }
  if (!enviar) { log(`  Instagram: capa nos 2 primeiros quadros (${basename(pacote.capa)}); a cópia é gerada no --send`); return; }
  const dir = pastaEstado(raiz); mkdirSync(dir, { recursive: true });
  const saida = join(dir, `${pedido.id}-instagram.mp4`);
  capaQuadro.embutirCapa({ video: pacote.video, capa: pacote.capa, saida });
  d.midia = { video: saida };
  log(`  ✓ capa colada nos 2 primeiros quadros do vídeo do Instagram: ${basename(saida)}`);
}

async function fila(f, log, extra) {
  const { raiz, config } = carregar(f), sub = f._[0] || "list", ctx = criarContexto({ config, raiz, log, ...extra });
  if (sub === "list") {
    const itens = lerFila(raiz).itens;
    if (!itens.length) { log("fila vazia"); return 0; }
    for (const it of itens) log(`${it.id}  ${it.estado.padEnd(10)} ${NOME[it.rede].padEnd(9)} ${it.quando ? local(it.quando) : "manual   "}  ${it.slug}${it.acao ? ` [${it.acao}${it.manual ? ", manual" : ""}]` : ""}${it.erro ? `  ✗ ${it.erro.slice(0, 80)}` : ""}${it.resultado?.url ? "  " + it.resultado.url : ""}`);
    return 0;
  }
  if (sub === "run") { const r = await executar({ raiz, provedores: await provedores.carregarTodos(), ctx, simular: !!f["dry-run"], log }); if (!r.feitos.length && !f["dry-run"]) log("nada a fazer agora"); return 0; }
  if (sub === "cancel") { const it = cancelarItem(raiz, f._[1]); log(`✓ cancelado ${it.id} (${NOME[it.rede]}, ${it.slug})`); return 0; }
  if (sub === "comment") {
    const it = liberarItem(raiz, f._[1]);
    await executar({ raiz, provedores: await provedores.carregarTodos(), ctx, soIds: [it.id], log });
    const novo = lerFila(raiz).itens.find((x) => x.id === it.id);
    log(novo.estado === "enviado" ? `✓ comentário feito${novo.resultado?.lembrete ? " (" + novo.resultado.lembrete + ")" : ""}` : `✗ ${novo.erro}`);
    return novo.estado === "enviado" ? 0 : 1;
  }
  const agentes = join(homedir(), "Library", "LaunchAgents"), plist = join(agentes, "br.praeko.fila.plist"), plistAntigo = join(agentes, "br.arauto.fila.plist"); // o agente de antes da renomeação se chamava br.arauto.fila
  const pararAntigo = () => { try { execFileSync("launchctl", ["bootout", `gui/${process.getuid()}`, plistAntigo], { stdio: "ignore" }); } catch { /* não estava carregado */ } rmSync(plistAntigo, { force: true }); };
  if (sub === "install") {
    mkdirSync(agentes, { recursive: true }); pararAntigo(); // troca o agente br.arauto.fila (se havia) pelo br.praeko.fila: nunca ficam dois executores
    writeFileSync(plist, plistLaunchd({ node: process.execPath, praeko: BIN, cwd: raiz, minutos: +f.minutes || 5, log: caminhoEstado(raiz, "fila.log") }));
    try { execFileSync("launchctl", ["bootout", `gui/${process.getuid()}`, plist], { stdio: "ignore" }); } catch { /* não estava carregado */ }
    execFileSync("launchctl", ["bootstrap", `gui/${process.getuid()}`, plist]);
    log(`✓ executor instalado; roda a cada ${+f.minutes || 5} min com o Mac ligado. Log: .praeko/fila.log`); return 0;
  }
  if (sub === "remove") { try { execFileSync("launchctl", ["bootout", `gui/${process.getuid()}`, plist], { stdio: "ignore" }); } catch { /* já parado */ } pararAntigo(); log("✓ executor removido"); return 0; }
  throw new Error("uso: praeko queue [list|run [--dry-run]|cancel <id>|comment <id>|install|remove]");
}

async function conta(f, log, extra, resto = []) {
  const rede = REDES[f._[0]], acao = f._[1] || "status";
  if (!rede) throw new Error("uso: praeko account <youtube|instagram|tiktok> [connect|status]");
  if (rede === "instagram" && acao === "send") { // envia o token da Meta (guardado no Chaveiro por `conta instagram conectar --user-id …`) para o servidor, que o guarda cifrado
    const bruto = extra.segredos ? extra.segredos.obter("instagram/token") : segredos.obter("instagram/token");
    if (!bruto) throw new Error("não achei o token do Instagram no Chaveiro: rode antes `praeko account instagram connect --user-id <id>`");
    const t = JSON.parse(bruto), a = clienteRemoto(f, carregarSeHouver(f).config, extra);
    const r = await a.channels.sendInstagramToken({ token: t.token, userId: t.userId, username: t.username, type: t.tipo, host: t.host });
    log(`✓ token da Meta enviado ao servidor: @${r.username} (${r.followers ?? "?"} seguidores, ${r.mediaItems ?? "?"} mídias)`);
    return 0;
  }
  if (acao === "connect" && (f.server || injetado(extra))) {
    const meta = rede === "instagram" && f.meta, a = clienteRemoto(f, carregarSeHouver(f).config, extra);
    if (meta && f.replace) log("ATENÇÃO: --replace troca o token de publicação do Instagram por este login da Meta.");
    const r = await a.channels.connect(meta ? "meta" : rede, meta ? { replace: !!f.replace, instagram: typeof f.instagram === "string" ? f.instagram : undefined, instagramId: typeof f["instagram-id"] === "string" ? f["instagram-id"] : undefined, probe: !!f.probe } : {});
    log(`Abra este endereço no navegador e autorize:\n${r.url}`);
    if (!injetado(extra)) { try { spawn("open", [r.url], { stdio: "ignore", detached: true }).unref(); } catch { /* o dono abre à mão */ } }
    return 0;
  }
  if (rede === "tiktok" && (acao === "status" || acao === "disconnect") && (f.server || injetado(extra))) return tiktokCmd({ ...f, _: [acao] }, log, extra);
  let achado; try { achado = carregar(f); } catch { achado = { raiz: process.cwd(), config: normalizarConfig({}) }; } // conectar/status só mexem no Chaveiro: não exigem praeko.json
  const { raiz, config } = achado, ctx = criarContexto({ config, raiz, log, ...extra });
  const prov = await provedores.carregar(rede);
  if (acao === "connect") return (await prov.conectar({ ctx, args: resto.slice(Math.max(resto.indexOf("connect"), resto.indexOf("conectar")) + 1) })) ?? 0;
  const s = await prov.status({ ctx });
  log(`${NOME[rede]}: ${s.conectado ? "conectado" : "NÃO conectado"}${s.detalhe ? ` (${s.detalhe})` : ""}`);
  return s.conectado ? 0 : 1;
}

async function canais(f, log, extra) {
  const { raiz, config } = carregar(f), ctx = criarContexto({ config, raiz, log, ...extra });
  const pub = await criarPublicador({ config, provedor: f.via || "local", ctx });
  for (const c of await pub.canais()) log(`${(NOME[c.rede] || c.rede).padEnd(10)} ${c.conectado ? "conectado " : "NÃO conectado"} ${c.id ? c.id + "  " : ""}${c.detalhe || ""}`);
  return 0;
}

// ---------- serviço remoto ----------
const carregarSeHouver = (f) => { try { return carregar(f); } catch { return { raiz: process.cwd(), config: {} }; } };
function clienteRemoto(f, config, extra = {}) {
  if (injetado(extra)) return injetado(extra);
  const url = f.server || config?.remoto?.url, chave = process.env.PRAEKO_KEY || process.env.ARAUTO_CHAVE || segredos.obter("praeko/chave"); // o Chaveiro novo (serviço praeko, conta praeko/chave); cai no antigo (arauto, arauto/chave)
  if (!url) throw new Error('falta o endereço do serviço: --server https://… (ou "remoto": { "url" } no praeko.json)');
  if (!chave) throw new Error("falta a chave do serviço: PRAEKO_KEY (ou ARAUTO_CHAVE) ou `echo $CHAVE | praeko chave guardar`");
  return new Praeko({ url, key: chave });
}
const hora = (iso, fuso = "America/Sao_Paulo") => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: fuso, dateStyle: "short", timeStyle: "short" }) : "—");

async function postsRemoto(f, log, extra) {
  const a = clienteRemoto(f, carregarSeHouver(f).config, extra);
  const r = await a.posts.list({ state: f.state, channel: f.channel ? REDES[f.channel] || f.channel : undefined, tag: f.tag, limit: f.limit });
  if (!r.posts.length) { log("nenhum post"); return 0; }
  for (const p of r.posts) log(`${p.id.padEnd(28)} ${estadoPt(p.state).padEnd(9)} ${p.title.slice(0, 40).padEnd(40)} ${p.items.map((i) => `${i.network}:${estadoPt(i.state)}${i.scheduledFor ? " " + hora(i.scheduledFor) : ""}`).join(" · ")}${p.tags.length ? "  #" + p.tags.join(" #") : ""}`);
  log(`${r.posts.length} de ${r.total}`);
  return 0;
}
async function calendarioRemoto(f, log, extra) {
  const a = clienteRemoto(f, carregarSeHouver(f).config, extra), c = await a.calendar({ from: f.from, to: f.to, channel: f.channel ? REDES[f.channel] || f.channel : undefined, tag: f.tag });
  const linhas = [...c.items.map((i) => ({ q: i.scheduledFor, t: `${NOME[i.network]} ${estadoPt(i.state)}${i.custom ? " (Custom)" : ""}  ${i.title}` })), ...c.freeSlots.map((v) => ({ q: v.scheduledFor, t: `${NOME[v.network]} vaga livre` }))].sort((x, y) => x.q.localeCompare(y.q));
  if (!linhas.length) { log("nada no período"); return 0; }
  for (const l of linhas) log(`${hora(l.q).padEnd(18)} ${l.t}`);
  return 0;
}
async function vagasRemoto(f, log, extra) {
  const rede = REDES[f._[0]];
  if (!rede) throw new Error("uso: praeko slots <youtube|instagram|tiktok> [fri 17:30 sun 22:00] [--timezone America/Sao_Paulo]");
  const a = clienteRemoto(f, carregarSeHouver(f).config, extra), pares = f._.slice(1);
  const dia = (d) => DIA[String(d).toLowerCase()] ?? d, mostra = (d) => DIA_PT[d] ?? d;
  if (pares.length) {
    if (pares.length % 2) throw new Error('as vagas vêm em pares: dia hora (ex.: slots youtube fri 17:30 sun 22:00)');
    const vagas = []; for (let i = 0; i < pares.length; i += 2) vagas.push(`${dia(pares[i])} ${pares[i + 1]}`);
    const r = await a.channels.setSlots(rede, vagas, { timezone: f.timezone });
    log(`✓ vagas de ${NOME[rede]} (${r.timezone}): ${r.slots.map((v) => `${mostra(v.day)} ${v.time}`).join(", ") || "nenhuma"}${r.rescheduled.length ? `; ${r.rescheduled.length} item(ns) da fila reorganizado(s)` : ""}`);
    return 0;
  }
  const r = await a.channels.slots(rede);
  log(`${NOME[rede]} (${r.timezone}): ${r.slots.map((v) => `${mostra(v.day)} ${v.time}`).join(", ") || "sem vagas"}`);
  return 0;
}
async function publicarAgoraRemoto(f, log, extra) {
  if (!f._[0]) throw new Error("uso: praeko publish-now <id> [--networks yt]");
  const a = clienteRemoto(f, carregarSeHouver(f).config, extra), r = await a.posts.publishNow(f._[0], { network: f.networks ? REDES[f.networks] : undefined, ...(f["idempotency-key"] ? { idempotencyKey: f["idempotency-key"] } : {}) });
  for (const i of r.items) log(`${NOME[i.network].padEnd(10)} ${estadoPt(i.state)}`);
  return 0;
}
async function usoCmd(f, log, extra) {
  const a = clienteRemoto(f, carregarSeHouver(f).config, extra);
  const num = (x) => (x == null ? "—" : Number(x).toLocaleString("pt-BR"));
  if (f._[0] === "log") {
    const r = await a.usage.log({ key: typeof f["key-id"] === "string" ? f["key-id"] : undefined, status: typeof f.code === "string" ? f.code : undefined, route: f.route, method: f.method, days: f.days, limit: f.limit, cursor: f.cursor });
    if (f.json) { log(JSON.stringify(r, null, 2)); return 0; }
    if (!r.records.length) { log("(nenhuma chamada com esses filtros)"); return 0; }
    for (const x of r.records) log(`${local(x.createdAt)}  ${x.method.padEnd(6)} ${String(x.status).padEnd(3)} ${String(x.durationMs).padStart(5)} ms  ${x.route.padEnd(36)} ${x.keyName}`);
    if (r.next) log(`(mais: --cursor ${r.next})`);
    return 0;
  }
  if (f._[0] !== undefined) throw new Error(`subcomando desconhecido: usage ${f._[0]} (use: usage | usage log)`);
  const r = await a.usage.get({ days: f.days });
  if (f.json) { log(JSON.stringify(r, null, 2)); return 0; }
  const pct = r.total ? `${String(Math.round((r.succeeded / r.total) * 1000) / 10).replace(".", ",")}%` : "—";
  log(`Uso da API · ${r.days === 1 ? "últimas 24 horas" : `últimos ${r.days} dias`}`);
  log(`  chamadas ${num(r.total)} · sucesso ${pct} · erros ${num(r.errors)} · p95 ${r.p95Ms == null ? "—" : r.p95Ms + " ms"} · pico ${num(r.peakPerMinute)}/min (limite ${num(r.limitPerMinute)}/min)`);
  for (const d of r.byDay) if (d.total) log(`  ${d.day}  ${String(d.total).padStart(6)} chamadas${d.errors ? ` · ${d.errors} erros` : ""}`);
  if (r.byKey.length) { log("Por chave:"); for (const k of r.byKey) log(`  ${k.name.padEnd(24)} ${String(k.total).padStart(6)} chamadas${k.errors ? ` · ${k.errors} erros` : ""} · última ${local(k.lastAt)}`); }
  return 0;
}
async function webhookCmd(f, log, extra) {
  const a = clienteRemoto(f, carregarSeHouver(f).config, extra), [sub = "list", id, outro] = f._;
  const linha = (w) => `${w.id}  ${w.active ? "ativo  " : "pausado"}  ${w.url}  [${w.events.join(", ")}]${w.disabledReason ? `  (${w.disabledReason})` : ""}`;
  const entrega = (e) => `${e.createdAt ? local(e.createdAt) : ""}  ${e.event.padEnd(19)} ${e.state.padEnd(9)} ${e.lastStatus ?? "—"}  ${e.attempts}x${e.lastError ? `  ${e.lastError}` : ""}  ${e.id}`;
  const precisa = () => { if (!id) throw new Error(`diga o webhook: praeko webhook ${sub} <id>`); return id; };
  if (sub === "list") { const r = await a.webhooks.list(); if (!r.webhooks.length) log("(nenhum webhook)"); for (const w of r.webhooks) log(linha(w)); return 0; }
  if (sub === "create") {
    if (typeof f.url !== "string") throw new Error("falta --url https://…");
    const w = await a.webhooks.create({ url: f.url, events: typeof f.events === "string" ? f.events.split(",").map((x) => x.trim()).filter(Boolean) : undefined, ...(f["idempotency-key"] ? { idempotencyKey: f["idempotency-key"] } : {}) });
    log(`✓ ${linha(w)}`); log(`Segredo de assinatura (aparece só agora): ${w.secret}`); return 0;
  }
  if (sub === "rotate-secret") { const r = await a.webhooks.rotateSecret(precisa()); log(`✓ novo segredo (aparece só agora; o anterior deixou de valer): ${r.secret}`); return 0; }
  if (sub === "test") { const r = await a.webhooks.test(precisa()); log(entrega(r.delivery)); return r.delivery.state === "delivered" ? 0 : 1; }
  if (sub === "deliveries") { const r = await a.webhooks.deliveries(precisa(), { limit: f.limit }); if (!r.deliveries.length) log("(nenhuma entrega)"); for (const e of r.deliveries) log(entrega(e)); return 0; }
  if (sub === "retry") { if (!outro) throw new Error("diga a entrega: praeko webhook retry <id> <entrega>"); const r = await a.webhooks.redeliver(precisa(), outro); log(entrega(r.delivery)); return r.delivery.state === "delivered" ? 0 : 1; }
  if (sub === "pause" || sub === "resume") { const w = await a.webhooks.update(precisa(), { active: sub === "resume" }); log(`✓ ${linha(w)}`); return 0; }
  if (sub === "events") { if (!outro) throw new Error("diga os eventos: praeko webhook events <id> post.sent,post.failed"); const w = await a.webhooks.update(precisa(), { events: outro.split(",").map((x) => x.trim()).filter(Boolean) }); log(`✓ ${linha(w)}`); return 0; }
  if (sub === "remove") { await a.webhooks.remove(precisa()); log(`✓ webhook ${id} apagado`); return 0; }
  throw new Error(`subcomando desconhecido: webhook ${sub}`);
}
const curto = (t, n = 110) => { const x = String(t ?? "").replace(/\s+/g, " ").trim(); return x.length > n ? x.slice(0, n - 1) + "…" : x; };
async function insightsCmd(f, log, extra) {
  const a = clienteRemoto(f, carregarSeHouver(f).config, extra), dias = Math.max(1, Number(f.days) || 30), ate = Date.now();
  const canal = f.channel ? (REDES[f.channel] || f.channel) : undefined;
  const r = await a.insights.get({ from: new Date(ate - dias * 86400e3).toISOString(), to: new Date(ate).toISOString(), channel: canal, tag: f.tag, type: f.type, compare: !!(f.compare || f.posts), sort: f.sort, direction: f.direction, limit: f.limit });
  if (f.json) { log(JSON.stringify(r, null, 2)); return 0; }
  if (f._[0] === "48h") {
    log(r.reading48hText);
    if (!r.reading48h.length) log(`(nenhum post publicado há 48 h ou mais nos últimos ${dias} dias)`);
    return 0;
  }
  const k = r.cards, n = (x) => (x == null ? "—" : String(x)), pct = (x) => (x == null ? "—" : `${String(x).replace(".", ",")}%`);
  log(`Últimos ${dias} dias${canal ? ` · ${NOME[canal] || canal}` : ""}${f.tag ? ` · etiqueta ${f.tag}` : ""}`);
  log(`  posts ${n(k.posts)} · views ${n(k.views)} · reações ${n(k.reactions)} · comentários ${n(k.comments)} · engajamento ${pct(k.engagement)} · seguidores ${n(k.followers)}${k.followersChange != null ? ` (${k.followersChange > 0 ? "+" : ""}${k.followersChange})` : ""}`);
  const maisCartoes = [["shares", "compart."], ["saves", "salvos"], ["reach", "alcance"], ["watchTimeMin", "min assistidos"], ["avgWatchTimeSec", "s médios"], ["followersGained", "seguidores ganhos"]].filter(([x]) => k[x] != null).map(([x, t]) => `${t} ${k[x]}${k.change?.[x]?.pct != null ? ` (${k.change[x].pct > 0 ? "+" : ""}${String(k.change[x].pct).replace(".", ",")}%)` : ""}`);
  if (maisCartoes.length) log(`  ${maisCartoes.join(" · ")}`);
  if (r.sources?.bufferAggregate) log("  (números do agregado do Buffer: " + Object.keys(r.sources.current).join(", ") + ")");
  if (f.posts && r.posts?.items?.length) { log(`Posts do período (${r.posts.total}, ordem ${r.posts.sort} ${r.posts.direction}):`); r.posts.items.forEach((p, i) => log(`  ${String(i + 1).padStart(2)}. ${curto(p.title, 55)}  [${NOME[p.network] || p.network}${p.type ? ` · ${p.type}` : ""}]  ${p.reactions} reações · ${p.comments} coment. · ${p.views} views · ${p.engagement == null ? "—" : String(p.engagement).replace(".", ",") + "%"}`)); }
  if (r.topPosts.length) { log("Top posts (reações):"); r.topPosts.forEach((p, i) => log(`  ${i + 1}. ${curto(p.title, 60)}  [${NOME[p.network] || p.network}]  ${p.reactions} reações · ${p.comments} coment. · ${p.views} views${p.noMetrics ? "  (sem métricas ainda)" : ""}`)); }
  for (const c of r.channels) log(`  ${(NOME[c.network] || c.network).padEnd(10)} posts ${String(c.posts).padStart(3)} · reações ${String(c.reactions).padStart(5)} · coment. ${String(c.comments).padStart(4)} · engajamento ${pct(c.engagement)}`);
  for (const x of r.summary) log(`• ${x.title}: ${x.text}`);
  if (r.collection.collecting) log("(a coleta de métricas ainda não rodou para estes posts: 1 h, 6 h, 24 h, 48 h e 7 dias depois de cada publicação)");
  return 0;
}
async function importarCmd(f, log, extra) {
  const a = clienteRemoto(f, carregarSeHouver(f).config, extra), rede = f._[0] ? (REDES[f._[0]] || f._[0]) : "all";
  const r = await a.insights.import({ network: rede, dryRun: !!f["dry-run"] });
  for (const x of r.imported) {
    if (x.error) log(`${NOME[x.network]}: ✗ ${x.error}`);
    else if (x.skipped) log(`${NOME[x.network]}: ignorado (${x.reason})`);
    else log(`${NOME[x.network]}${x.simulated ? " (simulação)" : ""}: ${x.found} encontrados · ${x.created} novos · ${x.updated} atualizados · ${x.views} views · ${x.likes} reações · ${x.comments} comentários`);
  }
  return r.imported.some((x) => x.error) ? 1 : 0;
}
/** TikTok no servidor: importar e listar o histórico, ver o estado da conta e (des)conectar. */
async function tiktokCmd(f, log, extra) {
  const sub = f._[0], a = clienteRemoto(f, carregarSeHouver(f).config, extra);
  if (sub === "import") return importarCmd({ ...f, _: ["tiktok"] }, log, extra);
  if (sub === "videos") return conteudoCmd({ ...f, channel: "tiktok" }, log, extra);
  if (sub === "connect") { const r = await a.channels.connect("tiktok"); log(`Abra este endereço no navegador e autorize:\n${r.url}`); return 0; }
  if (sub === "disconnect") { const r = await a.channels.disconnect("tiktok"); log(`✓ TikTok desconectado${r.revokedAtTiktok ? " (acesso revogado no TikTok)" : ""}`); return 0; }
  if (sub === "status") {
    const c = (await a.channels.list({ verify: true })).channels.find((x) => x.network === "tiktok");
    log(`TikTok: ${c?.connected ? "conectado" : "NÃO conectado"}${c?.detail ? ` (${c.detail})` : ""}`);
    if (c?.connected) log("  rascunho: o vídeo vai para a caixa de entrada do app · direto: privado (SELF_ONLY) até o app ser auditado (docs/tiktok.md)");
    return c?.connected ? 0 : 1;
  }
  throw new Error("uso: praeko tiktok import [--dry-run] | videos [--limit 30] | status | connect | disconnect");
}
async function seguidoresCmd(f, log, extra) {
  const rede = REDES[f._[0]], a = clienteRemoto(f, carregarSeHouver(f).config, extra);
  if (!rede) throw new Error("uso: praeko followers <instagram|tiktok> [<value>] [--day YYYY-MM-DD]");
  if (f._[1] === undefined) { for (const x of (await a.channels.followers(rede)).records.slice(0, 15)) log(`${x.day}  ${String(x.followers).padStart(7)}  ${x.source}`); return 0; }
  const valor = Number(f._[1]);
  if (!Number.isInteger(valor)) throw new Error("o valor precisa ser um número inteiro");
  const r = await a.channels.setFollowers(rede, valor, { day: f.day });
  log(`✓ ${NOME[rede]}: ${r.followers} seguidores em ${r.day} (manual)`); return 0;
}
async function conteudoCmd(f, log, extra) {
  const a = clienteRemoto(f, carregarSeHouver(f).config, extra), r = await a.content.list({ network: f.channel ? (REDES[f.channel] || f.channel) : undefined, limit: f.limit || 30, sort: f.sort });
  for (const i of r.items) log(`${hora(i.publishedAt).padEnd(15)} ${(NOME[i.network] || i.network).padEnd(9)} ${String(i.views ?? "—").padStart(6)} views ${String(i.reactions ?? "—").padStart(4)} reações  ${curto(i.title, 70)}`);
  log(`(${r.items.length} de ${r.total})`); return 0;
}
async function youtubeCmd(f, log, extra) {
  const sub = f._[0], a = clienteRemoto(f, carregarSeHouver(f).config, extra);
  if (sub === "videos") {
    const r = await a.youtube.listVideos({ max: f.max, page: f.page });
    for (const v of r.videos) log(`${v.id}  ${hora(v.publishedAt).padEnd(15)} ${(v.privacy + (v.publishAt ? " → " + hora(v.publishAt) : "")).padEnd(30)} ${String(v.viewCount ?? "—").padStart(6)} views  ${curto(v.title, 70)}`);
    if (r.next) log(`(mais: --page ${r.next})`);
    return 0;
  }
  if (sub === "video") {
    if (!f._[1]) throw new Error("uso: praeko youtube video <id>");
    const { video: v } = await a.youtube.getVideo(f._[1]);
    log(`${v.title}\n${v.url}  ${v.privacy}${v.publishAt ? " → " + hora(v.publishAt) : ""}  publicado ${hora(v.publishedAt)}\n${v.viewCount ?? "—"} views · ${v.likes ?? "—"} curtidas · ${v.comments ?? "—"} comentários\n\n${v.description}`);
    return 0;
  }
  if (sub === "edit") {
    const id = f._[1];
    if (!id) throw new Error('uso: praeko youtube edit <id> [--title T] [--description-file f.txt] [--swap-hashtags "#a #b"] [--send]');
    const m = {};
    if (f.title) m.title = f.title;
    if (f["description-file"]) m.description = readFileSync(resolve(f["description-file"]), "utf8").replace(/\s+$/, "");
    if (f["swap-hashtags"]) { const { video: v } = await a.youtube.getVideo(id); m.description = trocarHashtags(m.description ?? v.description, f["swap-hashtags"]); }
    if (!Object.keys(m).length) throw new Error("nada para mudar: use --title, --description-file ou --swap-hashtags");
    const r = await a.youtube.editVideo(id, { ...m, dryRun: !f.send });
    log(`${f.send ? "EDITANDO" : "SIMULAÇÃO (use --send)"}: ${id}`);
    if (r.before.title !== r.after.title) log(`  título: ${r.before.title}\n       → ${r.after.title}`);
    if (r.before.description !== r.after.description) { const u = (d) => String(d || "").split("\n").filter((x) => x.trim()).slice(-2).join(" | "); log(`  descrição (final): ${curto(u(r.before.description), 140)}\n              → ${curto(u(r.after.description), 140)}`); }
    if (!r.changed) log("  (nada muda)");
    else if (r.written) log("✓ escrito no YouTube");
    return 0;
  }
  if (sub === "comments") {
    const r = await a.youtube.comments({ video: f.video, unanswered: !!f.unanswered, max: f.max, page: f.page });
    if (!r.comments.length) log("nenhum comentário" + (f.unanswered ? " sem resposta" : ""));
    for (const c of r.comments) log(`${c.id}  ${hora(c.publishedAt).padEnd(15)} ${c.videoId ?? ""}  ${c.fromOwner ? "(você)" : c.answered ? "respondido" : "SEM RESPOSTA"}  ${c.author}: ${curto(c.text)}`);
    if (r.next) log(`(mais: --page ${r.next})`);
    return 0;
  }
  if (sub === "resolve" || sub === "reopen") {
    const id = f._[1];
    if (!id) throw new Error(`uso: praeko youtube ${sub} <thread>`);
    await (sub === "resolve" ? a.youtube.resolve(id) : a.youtube.reopen(id));
    log(`✓ ${sub === "resolve" ? "resolvido" : "reaberto"}: ${id}`); return 0;
  }
  if (sub === "reply") {
    const id = f._[1];
    if (!id || !f.text) throw new Error('uso: praeko youtube reply <thread> --text "…" [--send]');
    if (!f.send) { log(`SIMULAÇÃO (use --send): responderia ao comentário ${id} com:\n  ${f.text}`); return 0; }
    const r = await a.youtube.reply(id, f.text);
    log(`✓ respondido (${r.id})`); return 0;
  }
  throw new Error("uso: praeko youtube videos | video <id> | edit <id> … | comments … | resolve|reopen <thread> | reply <thread> --text …");
}
async function adotarBufferRemoto(f, log, extra) {
  if (!f.title || !f.when || !f["buffer-id"]) throw new Error('uso: praeko adopt-buffer --id <name> --title "…" --when "07/11 10:00" --buffer-id <Buffer post id> [--text "caption"] [--cover-media <id>]  (registra no painel um Reel que já está agendado no Buffer; não chama o Buffer)');
  const quando = parseQuando(f.when, { fuso: carregarSeHouver(f).config?.fusoOffset || "-03:00" });
  const a = clienteRemoto(f, carregarSeHouver(f).config, extra);
  const p = await a.posts.adopt({ ...(f.id ? { id: f.id } : {}), title: f.title, network: "instagram", scheduledFor: quando, external: { provider: "buffer", id: f["buffer-id"] }, ...(f.text ? { texts: { instagram: { text: f.text } } } : {}), ...(f["cover-media"] ? { media: { cover: f["cover-media"] } } : {}) });
  log(`✓ adotado: ${p.id} (Instagram, ${estadoPt(p.items[0]?.state)}, ${p.items[0]?.scheduledFor})`);
  return 0;
}
async function youtubeAgendarRemoto(f, log, extra) {
  if (!f._[0] || !f.when) throw new Error('uso: praeko youtube-schedule <post> --when "07/11 10:00" (o vídeo já está no YouTube, privado)');
  const quando = parseQuando(f.when, { fuso: carregarSeHouver(f).config?.fusoOffset || "-03:00" });
  const a = clienteRemoto(f, carregarSeHouver(f).config, extra), r = await a.posts.scheduleYoutube(f._[0], quando);
  log(`✓ ${r.url} agendado para ${new Date(r.publishAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })} (privado até lá)`);
  return 0;
}
async function chave(f, log, extra) {
  const sub = f._[0];
  if (sub === "store") {
    let k = ""; for await (const c of process.stdin) k += c;
    k = k.trim(); if (!FORMATO_CHAVE.test(k)) throw new Error("a chave do serviço começa com praeko_ (ou arauto_, as chaves antigas) (uso: echo $KEY | praeko key store)");
    log(`chave guardada (${segredos.guardar("praeko/chave", k)})`); return 0;
  }
  if (sub === "migrate") { // Chaveiro (e arquivo) do Arauto → Praeko: copia o que ainda não existe no novo; só nomes saem na tela, nunca valores
    const r = migrar(extra.segredos ?? segredos);
    for (const ref of r.copiados) log(`✓ ${ref}: copiado para o Chaveiro novo (serviço praeko)`);
    for (const ref of r.jaNoNovo) log(`• ${ref}: já existe no novo; nada a copiar`);
    for (const ref of r.ausentes) log(`· ${ref}: não havia no antigo`);
    log(r.copiados.length ? `${r.copiados.length} item(ns) copiado(s). Os antigos continuam onde estavam (apague-os à mão quando quiser).` : "nada a copiar."); return 0;
  }
  if (sub === "create" && f.sql) { // primeira chave: gera aqui e imprime o SQL para o D1 (o servidor ainda não tem nenhuma chave admin)
    if (!f.name) throw new Error("diga o nome: praeko key create --name admin --scope admin --sql");
    const escopo = f.scope || "admin", k = gerarChave(), id = idChave(), h = await hashChave(k);
    if (!["read", "write", "admin"].includes(escopo)) throw new Error("scope: read, write or admin");
    const escopoBanco = ESCOPO_PT[escopo] ?? escopo; // o banco guarda leitura/escrita/admin
    const nomeSql = String(f.name).replace(/'/g, "''");
    log(`Chave (guarde agora, ela não aparece de novo):\n  ${k}\n\nExecute no D1 (veja docs/servidor.md; use --local para o wrangler dev):\n  npx wrangler d1 execute arauto --remote --command "INSERT INTO chaves_api (id, nome, hash, prefixo, escopo, criado_em) VALUES ('${id}', '${nomeSql}', '${h}', '${prefixoChave(k)}', '${escopoBanco}', '${new Date().toISOString()}')"`);
    return 0;
  }
  const a = clienteRemoto(f, carregarSeHouver(f).config, extra);
  if (sub === "create") {
    if (!f.name) throw new Error("diga o nome: praeko key create --name bardo [--scope write]");
    const r = await a.apiKeys.create(f.name, f.scope || "write");
    log(`✓ chave ${r.id} (${r.scope}) criada. Guarde agora, ela não aparece de novo:\n  ${r.key}`); return 0;
  }
  if (sub === "list") { for (const k of (await a.apiKeys.list()).keys) log(`${k.id}  ${k.scope.padEnd(8)} ${k.name.padEnd(16)} ${k.prefix}…  ${k.revoked ? "REVOGADA" : k.lastUsedAt ? "último uso " + hora(k.lastUsedAt) : "nunca usada"}`); return 0; }
  if (sub === "revoke") { if (!f._[1]) throw new Error("uso: praeko key revoke <id>"); await a.apiKeys.revoke(f._[1]); log(`✓ chave ${f._[1]} revogada`); return 0; }
  throw new Error("uso: praeko key store | create --name N [--scope S] [--sql] | list | revoke <id> | migrate");
}

// Praeko CLI (`praeko` command). Simulation by default; `--send` is what really publishes/schedules.
/** Injected by esbuild at build time (scripts/build-cli.mjs); it does not exist outside the bundle. */
declare const __PRAEKO_CLI_VERSION__: string | undefined;
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Praeko } from "@praeko/sdk";
import { trocarHashtags } from "@praeko/core/provedores/youtube-comunidade";
import { FORMATO_CHAVE, gerarChave, hashChave, idChave, prefixoChave } from "@praeko/core/chaves";
import { NOME_PROJETO, REDES, acharConfig, capaQuadro, migrar, pastaEstado, caminhoEstado, cancelarItem, criarContexto, criarPublicador, executar, lerFila, liberarItem, normalizarConfig, parseQuando, plistLaunchd, provedores, segredos, validarPedido } from "@praeko/core";
import { readPackage, buildRequest, toCoreConfig } from "./package-folder.ts";

/** Ready-made service client injected by the tests: `praeko`. */
const injected = (extra: any) => extra?.praeko;

const BIN = resolve(fileURLToPath(import.meta.url), "..", "..", "bin", "praeko.mjs");
const NAMES: Record<string, any> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok" };
const VALUE_FLAGS = new Set(["type", "sort", "direction", "limit", "when", "networks", "yt", "ig", "tt", "yt-mode", "tt-mode", "video", "cover", "meta", "instagram", "instagram-id", "id", "url", "via", "config", "minutes", "key", "server", "scope", "name", "timezone", "from", "to", "state", "tag", "channel", "max", "page", "title", "description-file", "swap-hashtags", "text", "buffer-id", "cover-media", "days", "day", "tt-privacy", "tt-frame", "code", "route", "method", "cursor", "key-id", "events", "idempotency-key"]);

// The publisher request (core) is internal and uses its own mode/scope spellings.
const YT_MODE: Record<string, any> = { private: "privado", scheduled: "agendado", public: "publico" }, TT_MODE: Record<string, any> = { draft: "rascunho", direct: "direto" };
const SCOPE_DB: Record<string, any> = { read: "leitura", write: "escrita", admin: "admin" };
/** States printed by core (queue/publisher) in their stored spelling → English. */
const STATE_EN: Record<string, string> = { enviado: "sent", erro: "error", agendado: "scheduled", pendente: "pending", fila: "queued", feito: "done", cancelado: "canceled", rascunho: "draft", privado: "private", manual: "manual", publico: "public", direto: "direct" };
const stateLabel = (e: any) => STATE_EN[e] ?? e;

export const HELP = `Praeko CLI: personal publisher (YouTube, Instagram, TikTok)

  post <folder|name> --when "06/11 17:30" [--networks yt,ig,tt] [--yt|--ig|--tt "time"]
       [--yt-mode private|scheduled|public] [--tt-mode draft|direct] [--via local|buffer] [--send]
       [--tt-privacy SELF_ONLY|PUBLIC_TO_EVERYONE|…] [--tt-frame 1500]   (only with --server; direct public TikTok needs the app audit)
                                  publishes through Praeko (queue + direct providers); without --send it only simulates
  schedule <folder|name> …        the same, through Buffer (--via buffer); schedule <name> --status | --cancel [--networks yt]
                                  schedule --key: stores the Buffer key (echo $KEY | praeko schedule --key)
  queue [list|run [--dry-run]|cancel <id>|comment <id>|install [--minutes N]|remove]     the local queue
  account <youtube|instagram|tiktok> [connect|status]
  channels [--via local|buffer]   what is connected

Praeko service (Cloudflare), with --server https://praeko.app (or PRAEKO_SERVER, or "remote": { "url" } in praeko.json) and the key in PRAEKO_KEY:
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
  account instagram connect --meta [--replace] [--instagram user] [--instagram-id ID] [--probe] --server URL   Meta login (OAuth); --replace only if a connection already exists
  account instagram send --server URL                                      sends the Meta token (Keychain) to the server, encrypted
  key store                                                                stores the service key (echo $KEY | praeko key store)
  key create --name studio [--scope write] [--server URL]                   creates an API key (needs an admin key); scopes: read, write, admin
  key create --name admin --scope admin --sql                              generates the first key and the SQL for D1 (docs/servidor.md)
  key list | key revoke <id>
  usage [--days 7] [--json]                                                API usage: calls, success rate, p95, peak per minute, per day and per key
  usage log [--key-id id|session] [--code 4xx|404] [--route /v1/posts] [--method GET] [--days 30] [--limit 50] [--cursor c] [--json]   request log (30 days, metadata only)
  webhook list | create --url https://… [--events post.sent,post.failed] | test <id> | deliveries <id> [--limit 20] | retry <id> <delivery>
  webhook pause|resume|remove <id> | rotate-secret <id> | events <id> post.sent,post.failed      (admin) outgoing webhooks; the secret is printed once
  key migrate                                                              copies the Keychain items of the old service (arauto) to the new one (praeko); prints names only, never secrets
  help

Global flags: --server URL, --key, --config file, --help. --idempotency-key K (publish-now, webhook create): sends the Idempotency-Key header so a repeated command does not repeat the action (docs/idempotencia.md).
The package folder has publication.json, the video and the cover (or use --meta/--video/--cover). Config: praeko.json in the current folder or above.
Nothing is sent without --send. Output is in English.
`;

function flags(a: any) {
  const f: Record<string, any> = { _: [] };
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith("--")) { let k = a[i].slice(2); if (VALUE_FLAGS.has(k) && a[i + 1] !== undefined && !a[i + 1].startsWith("--")) f[k] = a[++i]; else f[k] = true; }
    else f._.push(a[i]);
  }
  if (f["yt-mode"] && typeof f["yt-mode"] === "string") f["yt-mode"] = YT_MODE[f["yt-mode"]] ?? f["yt-mode"];
  if (f["tt-mode"] && typeof f["tt-mode"] === "string") f["tt-mode"] = TT_MODE[f["tt-mode"]] ?? f["tt-mode"];
  return f;
}
const parseNetworks = (txt: any, padrao?: any) => (txt ? String(txt).split(",").map((x) => REDES[x.trim()] || (() => { throw new Error(`unknown network: ${x}`); })()) : padrao);
const localTime = (iso: any) => new Date(iso).toLocaleString("en-GB", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

function loadConfig(f: any) {
  const found = f.config ? { raiz: resolve(f.config, ".."), config: toCoreConfig(normalizarConfig(JSON.parse(readFileSync(resolve(f.config), "utf8")))) } : (() => { const a = acharConfig(); return a && { ...a, config: toCoreConfig(a.config) }; })();
  if (!found) throw new Error("could not find praeko.json in the current folder or above");
  return found;
}

export async function runCli(argv: any, { log = console.log, error = console.error, ctxExtra = {} }: any = {}) {
  const [cmd0, ...resto] = argv;
  const cmd = cmd0;
  if (cmd === "--version" || cmd === "-v" || cmd === "version") { log(typeof __PRAEKO_CLI_VERSION__ === "undefined" ? "dev" : __PRAEKO_CLI_VERSION__); return 0; }
  if (!cmd || cmd === "help" || cmd === "--help") { log(HELP); return 0; }
  const f = flags(resto);
  if (!f.server && process.env.PRAEKO_SERVER) f.server = process.env.PRAEKO_SERVER; // PRAEKO_SERVER=https://praeko.app: every command that talks to the service uses this address without repeating --server
  try {
    if (cmd === "post" || cmd === "schedule") return await postCmd(cmd, f, log, ctxExtra);
    if (cmd === "queue") return await queueCmd(f, log, ctxExtra);
    if (cmd === "account") return await accountCmd(f, log, ctxExtra, resto);
    if (cmd === "channels") return await channelsCmd(f, log, ctxExtra);
    if (cmd === "posts") return await remotePosts(f, log, ctxExtra);
    if (cmd === "calendar") return await remoteCalendar(f, log, ctxExtra);
    if (cmd === "slots") return await remoteSlots(f, log, ctxExtra);
    if (cmd === "publish-now") return await remotePublishNow(f, log, ctxExtra);
    if (cmd === "youtube-schedule") return await remoteYoutubeSchedule(f, log, ctxExtra);
    if (cmd === "adopt-buffer") return await remoteAdoptBuffer(f, log, ctxExtra);
    if (cmd === "youtube") return await youtubeCmd(f, log, ctxExtra);
    if (cmd === "tiktok") return await tiktokCmd(f, log, ctxExtra);
    if (cmd === "insights") return await insightsCmd(f, log, ctxExtra);
    if (cmd === "import") return await importCmd(f, log, ctxExtra);
    if (cmd === "followers") return await followersCmd(f, log, ctxExtra);
    if (cmd === "content") return await contentCmd(f, log, ctxExtra);
    if (cmd === "key") return await keyCmd(f, log, ctxExtra);
    if (cmd === "usage") return await usageCmd(f, log, ctxExtra);
    if (cmd === "webhook" || cmd === "webhooks") return await webhookCmd(f, log, ctxExtra);
    log(HELP); return 2;
  } catch (e) { error("error: " + e.message); return 1; }
}

async function postCmd(cmd: any, f: any, log: any, extra: any) {
  if (cmd === "schedule" && f.key !== undefined) {
    let k = typeof f.key === "string" ? f.key : "";
    if (!k) { const ch = []; for await (const c of process.stdin) ch.push(c); k = Buffer.concat(ch).toString().trim(); }
    if (!k) throw new Error("usage: echo $KEY | praeko schedule --key   (publish.buffer.com/settings/api)");
    log(`Buffer key stored (${segredos.guardar("buffer/principal", k)})`); return 0;
  }
  const { raiz: root, config: config0 } = loadConfig(f);
  const config = f.server ? { ...config0, remoto: { ...(config0.remoto || {}), url: f.server } } : config0, ctx = criarContexto({ config, raiz: root, log, ...extra });
  const provider = f.server ? "remoto" : (f.via === "remote" ? "remoto" : f.via) || (cmd === "schedule" ? "buffer" : config.provedor && config.provedor !== "buffer" ? config.provedor : "local");
  const arg = f._[0];
  const pub = await criarPublicador({ config, provedor: provider, ctx: provider === "remoto" && injected(extra) ? { ...ctx, praeko: injected(extra) } : ctx });
  if (f.status || f.cancel) {
    if (!arg) throw new Error("name the package: praeko schedule <name> --status");
    const id = f.id || basename(resolve(arg));
    if (f.status) { for (const i of (await pub.status(id)).itens) log(`${NAMES[i.rede].padEnd(10)} ${i.estado.padEnd(10)} ${i.quando ? localTime(i.quando) : ""}  ${i.id}`); return 0; }
    const r = await pub.cancelar(id, { redes: f.networks ? parseNetworks(f.networks) : undefined });
    log(`✓ canceled: ${r.cancelados.join(", ") || "none"}${r.mantidos.length ? `; kept: ${r.mantidos.join(", ")}` : ""}`); return 0;
  }
  if (!arg && !f.meta) throw new Error(`usage: praeko ${cmd} <package-folder> --when "06/11 17:30" [--send]`);
  const pkg = readPackage({ arg, flags: f, root, config });
  const defaultNetworks = Array.isArray(config.redes) ? config.redes.map((x: any) => REDES[x]) : pkg.meta.formato === "longo" ? ["youtube", "instagram"] : ["youtube", "instagram", "tiktok"];
  const networks = parseNetworks(f.networks, defaultNetworks);
  const tz = config.fusoOffset || "-03:00", networkFlag: Record<string, any> = { youtube: "yt", instagram: "ig", tiktok: "tt" };
  const targets = networks.map((r: any) => {
    const q = f[networkFlag[r]] || f.when;
    const modo = r === "youtube" ? f["yt-mode"] : r === "tiktok" ? f["tt-mode"] : undefined;
    const quando = q ? parseQuando(q, { tz }) : null;
    if (quando && Date.parse(quando) < Date.now() + 5 * 60e3 && provider === "buffer") throw new Error(`${NAMES[r]}: ${localTime(quando)} is less than 5 minutes from now or already past`);
    return { rede: r, quando, ...(modo ? { modo } : {}), ...(f.queue && !quando ? { fila: true } : {}), ...(f.draft ? { rascunho: true } : {}) };
  });
  const { request, errors, warnings } = buildRequest({ pkg, config, targets, options: { lembrete: !!f.reminder, ...(f["no-cover-in-frame"] ? { capaNoQuadro: false } : {}), ...(f.url ? { videoUrl: f.url } : {}) } });
  if (provider === "remoto" && targets.some((d: any) => d.rede === "tiktok")) {
    const o = { ...(config.tiktok?.privacidade ? { privacidade: config.tiktok.privacidade } : {}), ...(config.tiktok?.capaMs != null ? { miniaturaMs: config.tiktok.capaMs } : {}), ...(f["tt-privacy"] ? { privacidade: f["tt-privacy"] } : {}), ...(f["tt-frame"] ? { miniaturaMs: Number(f["tt-frame"]) } : {}) };
    if (Object.keys(o).length) request.opcoes!.tiktok = o;
    const direct = request.destinos.find((d: any) => d.rede === "tiktok")?.modo === "direto";
    warnings.push(direct ? "TikTok direct: until the app is audited by TikTok only SELF_ONLY (private) works, and only test accounts; public needs the audit (docs/tiktok.md)" : "TikTok draft: the video lands in the app inbox; you set the caption and cover in the app (the inbox API carries neither)");
    if (pkg.capa) warnings.push("TikTok: the cover image is not used (TikTok only accepts a video frame: --tt-frame <ms>)");
  }
  if (provider === "remoto") { request.id = String(request.id).replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 64); if (f.tag) request.etiquetas = String(f.tag).split(",").map((x) => x.trim()).filter(Boolean); }
  errors.forEach((e) => log("  ✗ " + e)); if (errors.length) return 1;
  const requestErrors = validarPedido(request); if (requestErrors.length) { requestErrors.forEach((e) => log("  ✗ " + e)); return 1; }
  const send = !!f.send;
  if (provider === "remoto") await coverInInstagramFrames({ request, pkg, f, root, send, log, warnings });
  log(`${send ? "PUBLISHING" : "SIMULATION (nothing will be sent; use --send)"} [${provider === "remoto" ? "remote" : provider}]: ${request.titulo}`);
  log(`package: ${pkg.dir}\nvideo: ${basename(pkg.video)}${pkg.capa ? `  cover: ${basename(pkg.capa)}` : "  (no cover)"}`);
  for (const d of request.destinos) log(`  ${NAMES[d.rede].padEnd(10)} ${d.fila ? "next queue slot" : d.rascunho ? "draft" : !d.quando || (provider === "local" && d.rede === "youtube" && (d.modo || config.youtube?.modo || "privado") !== "agendado") ? "now" : localTime(d.quando)}${d.modo ? `  mode ${stateLabel(d.modo)}` : ""}  text ${request.textos[d.rede]!.texto.length} chars`);
  if (provider === "local") { // summary lines from each provider (publishes nothing)
    const all = await provedores.carregarTodos();
    for (const d of request.destinos) for (const l of (await all[d.rede]?.planejar?.({ item: { slug: request.id, rede: d.rede, quando: d.quando || new Date().toISOString(), video: pkg.video, capa: pkg.capa, textos: request.textos[d.rede], opcoes: { ...(config[d.rede] || {}), modo: d.modo || config[d.rede]?.modo }, titulo: request.titulo }, ctx })) || []) log("     " + l);
  }
  warnings.forEach((x) => log("  ⚠ " + x));
  (pkg.meta.antesDePublicar || []).forEach((x: any) => log("  ☐ " + x));
  if (!send) return 0;
  const r = await pub.publicar(request);
  for (const i of r.itens) log(`${i.estado === "erro" ? "✗" : "✓"} ${NAMES[i.rede]} ${stateLabel(i.estado)}${i.quando && i.estado === "agendado" ? " for " + localTime(i.quando) : ""}${i.url ? "  " + i.url : ""}${i.studio ? "  (" + i.studio + ")" : ""}${i.aviso ? "  " + i.aviso : ""}`);
  return r.itens.some((i) => i.estado === "erro") ? 1 : 0;
}

/**
 * Instagram through Buffer: Buffer does not accept a separate cover, so the Instagram target gets a COPY of the video with the cover pasted on the first 2
 * frames (thumbnail = frame 0), sent as extra media of the target. Only for a video and cover of the same aspect ratio; --no-cover-in-frame turns it off.
 */
async function coverInInstagramFrames({ request, pkg, f, root, send, log, warnings }: any) {
  const d = request.destinos.find((x: any) => x.rede === "instagram");
  if (!d || f["no-cover-in-frame"] || d.midia) return;
  if (!pkg.capa) { warnings.push("Instagram: no cover, the thumbnail will be a video frame"); return; }
  if (request.opcoes?.formato === "longo") { warnings.push("Instagram: cover not pasted on the long video (a 16:9 cover is no Reel thumbnail)"); return; }
  let v, c;
  try { v = capaQuadro.sondar(pkg.video); c = capaQuadro.dimensoesImagem(pkg.capa); } catch (e) { warnings.push(`Instagram: could not check the cover (${e.message}); no cover in the frames`); return; }
  if (!capaQuadro.mesmaProporcao(c, v)) { warnings.push(`Instagram: the cover ${c.largura}x${c.altura} does not have the video aspect ratio ${v.largura}x${v.altura}; not pasted on the frames`); return; }
  if (!send) { log(`  Instagram: cover on the first 2 frames (${basename(pkg.capa)}); the copy is generated with --send`); return; }
  const dir = pastaEstado(root); mkdirSync(dir, { recursive: true });
  const saida = join(dir, `${request.id}-instagram.mp4`);
  capaQuadro.embutirCapa({ video: pkg.video, capa: pkg.capa, saida });
  d.midia = { video: saida };
  log(`  ✓ cover pasted on the first 2 frames of the Instagram video: ${basename(saida)}`);
}

async function queueCmd(f: any, log: any, extra: any) {
  const { raiz: root, config } = loadConfig(f), sub = f._[0] || "list", ctx = criarContexto({ config, raiz: root, log, ...extra });
  if (sub === "list") {
    const items = lerFila(root).itens;
    if (!items.length) { log("queue empty"); return 0; }
    for (const it of items) log(`${it.id}  ${stateLabel(it.estado).padEnd(10)} ${NAMES[it.rede].padEnd(9)} ${it.quando ? localTime(it.quando) : "manual   "}  ${it.slug}${it.acao ? ` [${it.acao}${it.manual ? ", manual" : ""}]` : ""}${it.erro ? `  ✗ ${it.erro.slice(0, 80)}` : ""}${it.resultado?.url ? "  " + it.resultado.url : ""}`);
    return 0;
  }
  if (sub === "run") { const r = await executar({ raiz: root, provedores: await provedores.carregarTodos(), ctx, simular: !!f["dry-run"], log }); if (!r.feitos.length && !f["dry-run"]) log("nothing to do now"); return 0; }
  if (sub === "cancel") { const it = cancelarItem(root, f._[1]); log(`✓ canceled ${it.id} (${NAMES[it.rede]}, ${it.slug})`); return 0; }
  if (sub === "comment") {
    const it = liberarItem(root, f._[1]);
    await executar({ raiz: root, provedores: await provedores.carregarTodos(), ctx, soIds: [it.id], log });
    const updated = lerFila(root).itens.find((x: any) => x.id === it.id);
    log(updated.estado === "enviado" ? `✓ comment posted${updated.resultado?.lembrete ? " (" + updated.resultado.lembrete + ")" : ""}` : `✗ ${updated.erro}`);
    return updated.estado === "enviado" ? 0 : 1;
  }
  const agents = join(homedir(), "Library", "LaunchAgents"), plist = join(agents, "br.praeko.fila.plist"), oldPlist = join(agents, "br.arauto.fila.plist"); // the agent from before the rename was called br.arauto.fila
  const stopOld = () => { try { execFileSync("launchctl", ["bootout", `gui/${process.getuid!()}`, oldPlist], { stdio: "ignore" }); } catch { /* was not loaded */ } rmSync(oldPlist, { force: true }); };
  if (sub === "install") {
    mkdirSync(agents, { recursive: true }); stopOld(); // replaces the br.arauto.fila agent (if any) with br.praeko.fila: there are never two runners
    writeFileSync(plist, plistLaunchd({ node: process.execPath, praeko: BIN, cwd: root, minutos: +f.minutes || 5, log: caminhoEstado(root, "fila.log") }));
    try { execFileSync("launchctl", ["bootout", `gui/${process.getuid!()}`, plist], { stdio: "ignore" }); } catch { /* was not loaded */ }
    execFileSync("launchctl", ["bootstrap", `gui/${process.getuid!()}`, plist]);
    log(`✓ runner installed; runs every ${+f.minutes || 5} min while the Mac is on. Log: .praeko/fila.log`); return 0;
  }
  if (sub === "remove") { try { execFileSync("launchctl", ["bootout", `gui/${process.getuid!()}`, plist], { stdio: "ignore" }); } catch { /* already stopped */ } stopOld(); log("✓ runner removed"); return 0; }
  throw new Error("usage: praeko queue [list|run [--dry-run]|cancel <id>|comment <id>|install|remove]");
}

async function accountCmd(f: any, log: any, extra: any, resto: string[] = []) {
  const network = REDES[f._[0]], action = f._[1] || "status";
  if (!network) throw new Error("usage: praeko account <youtube|instagram|tiktok> [connect|status]");
  if (network === "instagram" && action === "send") { // sends the Meta token (stored in the Keychain by `account instagram connect --user-id …`) to the server, which stores it encrypted
    const raw = extra.segredos ? extra.segredos.obter("instagram/token") : segredos.obter("instagram/token");
    if (!raw) throw new Error("could not find the Instagram token in the Keychain: first run `praeko account instagram connect --user-id <id>`");
    const t = JSON.parse(raw), a = remoteClient(f, loadConfigIfAny(f).config, extra);
    const r = await a.channels.sendInstagramToken({ token: t.token, userId: t.userId, username: t.username, type: t.tipo, host: t.host });
    log(`✓ Meta token sent to the server: @${r.username} (${r.followers ?? "?"} followers, ${r.mediaItems ?? "?"} media items)`);
    return 0;
  }
  if (action === "connect" && (f.server || injected(extra))) {
    const meta = network === "instagram" && f.meta, a = remoteClient(f, loadConfigIfAny(f).config, extra);
    if (meta && f.replace) log("WARNING: --replace replaces the Instagram publishing token with this Meta login.");
    const r = await a.channels.connect(meta ? "meta" : network, meta ? { replace: !!f.replace, instagram: typeof f.instagram === "string" ? f.instagram : undefined, instagramId: typeof f["instagram-id"] === "string" ? f["instagram-id"] : undefined, probe: !!f.probe } : {});
    log(`Open this address in the browser and authorize:\n${r.url}`);
    if (!injected(extra)) { try { spawn("open", [r.url], { stdio: "ignore", detached: true }).unref(); } catch { /* the owner opens it by hand */ } }
    return 0;
  }
  if (network === "tiktok" && (action === "status" || action === "disconnect") && (f.server || injected(extra))) return tiktokCmd({ ...f, _: [action] }, log, extra);
  let found; try { found = loadConfig(f); } catch { found = { raiz: process.cwd(), config: toCoreConfig({}) }; } // connect/status only touch the Keychain: they do not require praeko.json
  const { raiz: root, config } = found, ctx = criarContexto({ config, raiz: root, log, ...extra });
  const prov = await provedores.carregar(network);
  if (action === "connect") return (await prov.conectar({ ctx, args: resto.slice(Math.max(resto.indexOf("connect"), resto.indexOf("conectar")) + 1) })) ?? 0;
  const s = await prov.status({ ctx });
  log(`${NAMES[network]}: ${s.conectado ? "connected" : "NOT connected"}${s.detalhe ? ` (${s.detalhe})` : ""}`);
  return s.conectado ? 0 : 1;
}

async function channelsCmd(f: any, log: any, extra: any) {
  const { raiz: root, config } = loadConfig(f), ctx = criarContexto({ config, raiz: root, log, ...extra });
  const pub = await criarPublicador({ config, provedor: f.via || "local", ctx });
  for (const c of await pub.canais()) log(`${(NAMES[c.rede] || c.rede).padEnd(10)} ${c.conectado ? "connected " : "NOT connected"} ${c.id ? c.id + "  " : ""}${c.detalhe || ""}`);
  return 0;
}

// ---------- remote service ----------
const loadConfigIfAny = (f: any) => { try { return loadConfig(f); } catch { return { raiz: process.cwd(), config: {} }; } };
function remoteClient(f: any, config: any, extra = {}) {
  if (injected(extra)) return injected(extra);
  const url = f.server || config?.remoto?.url, chave = process.env.PRAEKO_KEY || process.env.ARAUTO_CHAVE || segredos.obter("praeko/chave"); // the new Keychain item (service praeko, account praeko/chave); falls back to the old one (arauto, arauto/chave)
  if (!url) throw new Error('missing the service address: --server https://… (or "remote": { "url" } in praeko.json)');
  if (!chave) throw new Error("missing the service key: PRAEKO_KEY (or ARAUTO_CHAVE) or `echo $KEY | praeko key store`");
  return new Praeko({ url, key: chave });
}
const timeOf = (iso: any, tz = "America/Sao_Paulo") => (iso ? new Date(iso).toLocaleString("en-GB", { timeZone: tz, dateStyle: "short", timeStyle: "short" }) : "—");

async function remotePosts(f: any, log: any, extra: any) {
  const a = remoteClient(f, loadConfigIfAny(f).config, extra);
  const r = await a.posts.list({ state: f.state, channel: f.channel ? REDES[f.channel] || f.channel : undefined, tag: f.tag, limit: f.limit });
  if (!r.posts.length) { log("no posts"); return 0; }
  for (const p of r.posts) log(`${p.id.padEnd(28)} ${stateLabel(p.state).padEnd(9)} ${p.title.slice(0, 40).padEnd(40)} ${p.items.map((i: any) => `${i.network}:${stateLabel(i.state)}${i.scheduledFor ? " " + timeOf(i.scheduledFor) : ""}`).join(" · ")}${p.tags.length ? "  #" + p.tags.join(" #") : ""}`);
  log(`${r.posts.length} of ${r.total}`);
  return 0;
}
async function remoteCalendar(f: any, log: any, extra: any) {
  const a = remoteClient(f, loadConfigIfAny(f).config, extra), c = await a.calendar({ from: f.from, to: f.to, channel: f.channel ? REDES[f.channel] || f.channel : undefined, tag: f.tag });
  const lines = [...c.items.map((i: any) => ({ q: i.scheduledFor, t: `${NAMES[i.network]} ${stateLabel(i.state)}${i.custom ? " (Custom)" : ""}  ${i.title}` })), ...c.freeSlots.map((v: any) => ({ q: v.scheduledFor, t: `${NAMES[v.network]} free slot` }))].sort((x, y) => x.q.localeCompare(y.q));
  if (!lines.length) { log("nothing in the period"); return 0; }
  for (const l of lines) log(`${timeOf(l.q).padEnd(18)} ${l.t}`);
  return 0;
}
async function remoteSlots(f: any, log: any, extra: any) {
  const network = REDES[f._[0]];
  if (!network) throw new Error("usage: praeko slots <youtube|instagram|tiktok> [fri 17:30 sun 22:00] [--timezone America/Sao_Paulo]");
  const a = remoteClient(f, loadConfigIfAny(f).config, extra), pairs = f._.slice(1);
  const day = (d: any) => String(d).toLowerCase();
  if (pairs.length) {
    if (pairs.length % 2) throw new Error('slots come in pairs: day time (e.g. slots youtube fri 17:30 sun 22:00)');
    const slotList = []; for (let i = 0; i < pairs.length; i += 2) slotList.push(`${day(pairs[i])} ${pairs[i + 1]}`);
    const r = await a.channels.setSlots(network, slotList, { timezone: f.timezone });
    log(`✓ ${NAMES[network]} slots (${r.timezone}): ${r.slots.map((v: any) => `${v.day} ${v.time}`).join(", ") || "none"}${r.rescheduled.length ? `; ${r.rescheduled.length} queue item(s) rescheduled` : ""}`);
    return 0;
  }
  const r = await a.channels.slots(network);
  log(`${NAMES[network]} (${r.timezone}): ${r.slots.map((v: any) => `${v.day} ${v.time}`).join(", ") || "no slots"}`);
  return 0;
}
async function remotePublishNow(f: any, log: any, extra: any) {
  if (!f._[0]) throw new Error("usage: praeko publish-now <id> [--networks yt]");
  const a = remoteClient(f, loadConfigIfAny(f).config, extra), r = await a.posts.publishNow(f._[0], { network: f.networks ? REDES[f.networks] : undefined, ...(f["idempotency-key"] ? { idempotencyKey: f["idempotency-key"] } : {}) });
  for (const i of r.items) log(`${NAMES[i.network].padEnd(10)} ${stateLabel(i.state)}`);
  return 0;
}
async function usageCmd(f: any, log: any, extra: any) {
  const a = remoteClient(f, loadConfigIfAny(f).config, extra);
  const num = (x: any) => (x == null ? "—" : Number(x).toLocaleString("en-US"));
  if (f._[0] === "log") {
    const r = await a.usage.log({ key: typeof f["key-id"] === "string" ? f["key-id"] : undefined, status: typeof f.code === "string" ? f.code : undefined, route: f.route, method: f.method, days: f.days, limit: f.limit, cursor: f.cursor });
    if (f.json) { log(JSON.stringify(r, null, 2)); return 0; }
    if (!r.records.length) { log("(no calls match these filters)"); return 0; }
    for (const x of r.records) log(`${localTime(x.createdAt)}  ${x.method.padEnd(6)} ${String(x.status).padEnd(3)} ${String(x.durationMs).padStart(5)} ms  ${x.route.padEnd(36)} ${x.keyName}`);
    if (r.next) log(`(more: --cursor ${r.next})`);
    return 0;
  }
  if (f._[0] !== undefined) throw new Error(`unknown subcommand: usage ${f._[0]} (use: usage | usage log)`);
  const r = await a.usage.get({ days: f.days });
  if (f.json) { log(JSON.stringify(r, null, 2)); return 0; }
  const pct = r.total ? `${String(Math.round((r.succeeded / r.total) * 1000) / 10).replace(",", ".")}%` : "—";
  log(`API usage · ${r.days === 1 ? "last 24 hours" : `last ${r.days} days`}`);
  log(`  calls ${num(r.total)} · success ${pct} · errors ${num(r.errors)} · p95 ${r.p95Ms == null ? "—" : r.p95Ms + " ms"} · peak ${num(r.peakPerMinute)}/min (limit ${num(r.limitPerMinute)}/min)`);
  for (const d of r.byDay) if (d.total) log(`  ${d.day}  ${String(d.total).padStart(6)} calls${d.errors ? ` · ${d.errors} errors` : ""}`);
  if (r.byKey.length) { log("By key:"); for (const k of r.byKey) log(`  ${k.name.padEnd(24)} ${String(k.total).padStart(6)} calls${k.errors ? ` · ${k.errors} errors` : ""} · last ${localTime(k.lastAt)}`); }
  return 0;
}
async function webhookCmd(f: any, log: any, extra: any) {
  const a = remoteClient(f, loadConfigIfAny(f).config, extra), [sub = "list", id, second] = f._;
  const row = (w: any) => `${w.id}  ${w.active ? "active " : "paused "}  ${w.url}  [${w.events.join(", ")}]${w.disabledReason ? `  (${w.disabledReason})` : ""}`;
  const delivery = (e: any) => `${e.createdAt ? localTime(e.createdAt) : ""}  ${e.event.padEnd(19)} ${e.state.padEnd(9)} ${e.lastStatus ?? "—"}  ${e.attempts}x${e.lastError ? `  ${e.lastError}` : ""}  ${e.id}`;
  const need = () => { if (!id) throw new Error(`name the webhook: praeko webhook ${sub} <id>`); return id; };
  if (sub === "list") { const r = await a.webhooks.list(); if (!r.webhooks.length) log("(no webhooks)"); for (const w of r.webhooks) log(row(w)); return 0; }
  if (sub === "create") {
    if (typeof f.url !== "string") throw new Error("missing --url https://…");
    const w = await a.webhooks.create({ url: f.url, events: typeof f.events === "string" ? f.events.split(",").map((x: any) => x.trim()).filter(Boolean) : undefined, ...(f["idempotency-key"] ? { idempotencyKey: f["idempotency-key"] } : {}) });
    log(`✓ ${row(w)}`); log(`Signing secret (shown only now): ${w.secret}`); return 0;
  }
  if (sub === "rotate-secret") { const r = await a.webhooks.rotateSecret(need()); log(`✓ new secret (shown only now; the previous one is no longer valid): ${r.secret}`); return 0; }
  if (sub === "test") { const r = await a.webhooks.test(need()); log(delivery(r.delivery)); return r.delivery.state === "delivered" ? 0 : 1; }
  if (sub === "deliveries") { const r = await a.webhooks.deliveries(need(), { limit: f.limit }); if (!r.deliveries.length) log("(no deliveries)"); for (const e of r.deliveries) log(delivery(e)); return 0; }
  if (sub === "retry") { if (!second) throw new Error("name the delivery: praeko webhook retry <id> <delivery>"); const r = await a.webhooks.redeliver(need(), second); log(delivery(r.delivery)); return r.delivery.state === "delivered" ? 0 : 1; }
  if (sub === "pause" || sub === "resume") { const w = await a.webhooks.update(need(), { active: sub === "resume" }); log(`✓ ${row(w)}`); return 0; }
  if (sub === "events") { if (!second) throw new Error("name the events: praeko webhook events <id> post.sent,post.failed"); const w = await a.webhooks.update(need(), { events: second.split(",").map((x: any) => x.trim()).filter(Boolean) }); log(`✓ ${row(w)}`); return 0; }
  if (sub === "remove") { await a.webhooks.remove(need()); log(`✓ webhook ${id} removed`); return 0; }
  throw new Error(`unknown subcommand: webhook ${sub}`);
}
const short = (t: any, n = 110) => { const x = String(t ?? "").replace(/\s+/g, " ").trim(); return x.length > n ? x.slice(0, n - 1) + "…" : x; };
async function insightsCmd(f: any, log: any, extra: any) {
  const a = remoteClient(f, loadConfigIfAny(f).config, extra), days = Math.max(1, Number(f.days) || 30), untilMs = Date.now();
  const channel = f.channel ? (REDES[f.channel] || f.channel) : undefined;
  const r = await a.insights.get({ from: new Date(untilMs - days * 86400e3).toISOString(), to: new Date(untilMs).toISOString(), channel: channel, tag: f.tag, type: f.type, compare: !!(f.compare || f.posts), sort: f.sort, direction: f.direction, limit: f.limit });
  if (f.json) { log(JSON.stringify(r, null, 2)); return 0; }
  if (f._[0] === "48h") {
    log(r.reading48hText);
    if (!r.reading48h.length) log(`(no post published 48 h ago or more in the last ${days} days)`);
    return 0;
  }
  const k = r.cards, n = (x: any) => (x == null ? "—" : String(x)), pct = (x: any) => (x == null ? "—" : `${String(x).replace(",", ".")}%`);
  log(`Last ${days} days${channel ? ` · ${NAMES[channel] || channel}` : ""}${f.tag ? ` · tag ${f.tag}` : ""}`);
  log(`  posts ${n(k.posts)} · views ${n(k.views)} · reactions ${n(k.reactions)} · comments ${n(k.comments)} · engagement ${pct(k.engagement)} · followers ${n(k.followers)}${k.followersChange != null ? ` (${k.followersChange > 0 ? "+" : ""}${k.followersChange})` : ""}`);
  const moreCards = ([["shares", "shares"], ["saves", "saves"], ["reach", "reach"], ["watchTimeMin", "watch min"], ["avgWatchTimeSec", "avg watch s"], ["followersGained", "followers gained"]] as [string, string][]).filter(([x]) => k[x] != null).map(([x, t]) => `${t} ${k[x]}${k.change?.[x]?.pct != null ? ` (${k.change[x].pct > 0 ? "+" : ""}${String(k.change[x].pct).replace(".", ",")}%)` : ""}`);
  if (moreCards.length) log(`  ${moreCards.join(" · ")}`);
  if (r.sources?.bufferAggregate) log("  (numbers from the Buffer aggregate: " + Object.keys(r.sources.current).join(", ") + ")");
  if (f.posts && r.posts?.items?.length) { log(`Posts in the period (${r.posts.total}, order ${r.posts.sort} ${r.posts.direction}):`); r.posts.items.forEach((p: any, i: any) => log(`  ${String(i + 1).padStart(2)}. ${short(p.title, 55)}  [${NAMES[p.network] || p.network}${p.type ? ` · ${p.type}` : ""}]  ${p.reactions} reactions · ${p.comments} comments · ${p.views} views · ${p.engagement == null ? "—" : String(p.engagement) + "%"}`)); }
  if (r.topPosts.length) { log("Top posts (reactions):"); r.topPosts.forEach((p: any, i: any) => log(`  ${i + 1}. ${short(p.title, 60)}  [${NAMES[p.network] || p.network}]  ${p.reactions} reactions · ${p.comments} comments · ${p.views} views${p.noMetrics ? "  (no metrics yet)" : ""}`)); }
  for (const c of r.channels) log(`  ${(NAMES[c.network] || c.network).padEnd(10)} posts ${String(c.posts).padStart(3)} · reactions ${String(c.reactions).padStart(5)} · comments ${String(c.comments).padStart(4)} · engagement ${pct(c.engagement)}`);
  for (const x of r.summary) log(`• ${x.title}: ${x.text}`);
  if (r.collection.collecting) log("(metrics collection has not run yet for these posts: 1 h, 6 h, 24 h, 48 h and 7 days after each publication)");
  return 0;
}
async function importCmd(f: any, log: any, extra: any) {
  const a = remoteClient(f, loadConfigIfAny(f).config, extra), network = f._[0] ? (REDES[f._[0]] || f._[0]) : "all";
  const r = await a.insights.import({ network: network, dryRun: !!f["dry-run"] });
  for (const x of r.imported) {
    if (x.error) log(`${NAMES[x.network]}: ✗ ${x.error}`);
    else if (x.skipped) log(`${NAMES[x.network]}: skipped (${x.reason})`);
    else log(`${NAMES[x.network]}${x.simulated ? " (simulation)" : ""}: ${x.found} found · ${x.created} new · ${x.updated} updated · ${x.views} views · ${x.likes} reactions · ${x.comments} comments`);
  }
  return r.imported.some((x: any) => x.error) ? 1 : 0;
}
/** TikTok on the server: import and list the history, see the account state and (dis)connect. */
async function tiktokCmd(f: any, log: any, extra: any) {
  const sub = f._[0], a = remoteClient(f, loadConfigIfAny(f).config, extra);
  if (sub === "import") return importCmd({ ...f, _: ["tiktok"] }, log, extra);
  if (sub === "videos") return contentCmd({ ...f, channel: "tiktok" }, log, extra);
  if (sub === "connect") { const r = await a.channels.connect("tiktok"); log(`Open this address in the browser and authorize:\n${r.url}`); return 0; }
  if (sub === "disconnect") { const r = await a.channels.disconnect("tiktok"); log(`✓ TikTok disconnected${r.revokedAtTiktok ? " (access revoked at TikTok)" : ""}`); return 0; }
  if (sub === "status") {
    const c = (await a.channels.list({ verify: true })).channels.find((x: any) => x.network === "tiktok");
    log(`TikTok: ${c?.connected ? "connected" : "NOT connected"}${c?.detail ? ` (${c.detail})` : ""}`);
    if (c?.connected) log("  draft: the video goes to the app inbox · direct: private (SELF_ONLY) until the app is audited (docs/tiktok.md)");
    return c?.connected ? 0 : 1;
  }
  throw new Error("usage: praeko tiktok import [--dry-run] | videos [--limit 30] | status | connect | disconnect");
}
async function followersCmd(f: any, log: any, extra: any) {
  const network = REDES[f._[0]], a = remoteClient(f, loadConfigIfAny(f).config, extra);
  if (!network) throw new Error("usage: praeko followers <instagram|tiktok> [<value>] [--day YYYY-MM-DD]");
  if (f._[1] === undefined) { for (const x of (await a.channels.followers(network)).records.slice(0, 15)) log(`${x.day}  ${String(x.followers).padStart(7)}  ${x.source}`); return 0; }
  const value = Number(f._[1]);
  if (!Number.isInteger(value)) throw new Error("the value must be an integer");
  const r = await a.channels.setFollowers(network, value, { day: f.day });
  log(`✓ ${NAMES[network]}: ${r.followers} followers on ${r.day} (manual)`); return 0;
}
async function contentCmd(f: any, log: any, extra: any) {
  const a = remoteClient(f, loadConfigIfAny(f).config, extra), r = await a.content.list({ network: f.channel ? (REDES[f.channel] || f.channel) : undefined, limit: f.limit || 30, sort: f.sort });
  for (const i of r.items) log(`${timeOf(i.publishedAt).padEnd(15)} ${(NAMES[i.network] || i.network).padEnd(9)} ${String(i.views ?? "—").padStart(6)} views ${String(i.reactions ?? "—").padStart(4)} reactions  ${short(i.title, 70)}`);
  log(`(${r.items.length} of ${r.total})`); return 0;
}
async function youtubeCmd(f: any, log: any, extra: any) {
  const sub = f._[0], a = remoteClient(f, loadConfigIfAny(f).config, extra);
  if (sub === "videos") {
    const r = await a.youtube.listVideos({ max: f.max, page: f.page });
    for (const v of r.videos) log(`${v.id}  ${timeOf(v.publishedAt).padEnd(15)} ${(v.privacy + (v.publishAt ? " → " + timeOf(v.publishAt) : "")).padEnd(30)} ${String(v.viewCount ?? "—").padStart(6)} views  ${short(v.title, 70)}`);
    if (r.next) log(`(more: --page ${r.next})`);
    return 0;
  }
  if (sub === "video") {
    if (!f._[1]) throw new Error("usage: praeko youtube video <id>");
    const { video: v } = await a.youtube.getVideo(f._[1]);
    log(`${v.title}\n${v.url}  ${v.privacy}${v.publishAt ? " → " + timeOf(v.publishAt) : ""}  published ${timeOf(v.publishedAt)}\n${v.viewCount ?? "—"} views · ${v.likes ?? "—"} likes · ${v.comments ?? "—"} comments\n\n${v.description}`);
    return 0;
  }
  if (sub === "edit") {
    const id = f._[1];
    if (!id) throw new Error('usage: praeko youtube edit <id> [--title T] [--description-file f.txt] [--swap-hashtags "#a #b"] [--send]');
    const m: Record<string, any> = {};
    if (f.title) m.title = f.title;
    if (f["description-file"]) m.description = readFileSync(resolve(f["description-file"]), "utf8").replace(/\s+$/, "");
    if (f["swap-hashtags"]) { const { video: v } = await a.youtube.getVideo(id); m.description = trocarHashtags(m.description ?? v.description, f["swap-hashtags"]); }
    if (!Object.keys(m).length) throw new Error("nothing to change: use --title, --description-file or --swap-hashtags");
    const r = await a.youtube.editVideo(id, { ...m, dryRun: !f.send });
    log(`${f.send ? "EDITING" : "SIMULATION (use --send)"}: ${id}`);
    if (r.before.title !== r.after.title) log(`  title: ${r.before.title}\n       → ${r.after.title}`);
    if (r.before.description !== r.after.description) { const u = (d: any) => String(d || "").split("\n").filter((x) => x.trim()).slice(-2).join(" | "); log(`  description (end): ${short(u(r.before.description), 140)}\n              → ${short(u(r.after.description), 140)}`); }
    if (!r.changed) log("  (nothing changes)");
    else if (r.written) log("✓ written to YouTube");
    return 0;
  }
  if (sub === "comments") {
    const r = await a.youtube.comments({ video: f.video, unanswered: !!f.unanswered, max: f.max, page: f.page });
    if (!r.comments.length) log("no comments" + (f.unanswered ? " without a reply" : ""));
    for (const c of r.comments) log(`${c.id}  ${timeOf(c.publishedAt).padEnd(15)} ${c.videoId ?? ""}  ${c.fromOwner ? "(you)" : c.answered ? "answered" : "NO REPLY"}  ${c.author}: ${short(c.text)}`);
    if (r.next) log(`(more: --page ${r.next})`);
    return 0;
  }
  if (sub === "resolve" || sub === "reopen") {
    const id = f._[1];
    if (!id) throw new Error(`usage: praeko youtube ${sub} <thread>`);
    await (sub === "resolve" ? a.youtube.resolve(id) : a.youtube.reopen(id));
    log(`✓ ${sub === "resolve" ? "resolved" : "reopened"}: ${id}`); return 0;
  }
  if (sub === "reply") {
    const id = f._[1];
    if (!id || !f.text) throw new Error('usage: praeko youtube reply <thread> --text "…" [--send]');
    if (!f.send) { log(`SIMULATION (use --send): would reply to comment ${id} with:\n  ${f.text}`); return 0; }
    const r = await a.youtube.reply(id, f.text);
    log(`✓ replied (${r.id})`); return 0;
  }
  throw new Error("usage: praeko youtube videos | video <id> | edit <id> … | comments … | resolve|reopen <thread> | reply <thread> --text …");
}
async function remoteAdoptBuffer(f: any, log: any, extra: any) {
  if (!f.title || !f.when || !f["buffer-id"]) throw new Error('usage: praeko adopt-buffer --id <name> --title "…" --when "07/11 10:00" --buffer-id <Buffer post id> [--text "caption"] [--cover-media <id>]  (registers in the dashboard a Reel already scheduled in Buffer; it does not call Buffer)');
  const quando = parseQuando(f.when, { fuso: loadConfigIfAny(f).config?.fusoOffset || "-03:00" });
  const a = remoteClient(f, loadConfigIfAny(f).config, extra);
  const p = await a.posts.adopt({ ...(f.id ? { id: f.id } : {}), title: f.title, network: "instagram", scheduledFor: quando, external: { provider: "buffer", id: f["buffer-id"] }, ...(f.text ? { texts: { instagram: { text: f.text } } } : {}), ...(f["cover-media"] ? { media: { cover: f["cover-media"] } } : {}) });
  log(`✓ adopted: ${p.id} (Instagram, ${stateLabel(p.items[0]?.state)}, ${p.items[0]?.scheduledFor})`);
  return 0;
}
async function remoteYoutubeSchedule(f: any, log: any, extra: any) {
  if (!f._[0] || !f.when) throw new Error('usage: praeko youtube-schedule <post> --when "07/11 10:00" (the video is already on YouTube, private)');
  const quando = parseQuando(f.when, { fuso: loadConfigIfAny(f).config?.fusoOffset || "-03:00" });
  const a = remoteClient(f, loadConfigIfAny(f).config, extra), r = await a.posts.scheduleYoutube(f._[0], quando);
  log(`✓ ${r.url} scheduled for ${new Date(r.publishAt).toLocaleString("en-GB", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })} (private until then)`);
  return 0;
}
async function keyCmd(f: any, log: any, extra: any) {
  const sub = f._[0];
  if (sub === "store") {
    let k = ""; for await (const c of process.stdin) k += c;
    k = k.trim(); if (!FORMATO_CHAVE.test(k)) throw new Error("the service key starts with praeko_ (or arauto_, the old keys) (usage: echo $KEY | praeko key store)");
    log(`key stored (${segredos.guardar("praeko/chave", k)})`); return 0;
  }
  if (sub === "migrate") { // Keychain (and file) from Arauto → Praeko: copies what does not exist in the new one yet; only names are printed, never values
    const r = migrar(extra.segredos ?? segredos);
    for (const ref of r.copiados) log(`✓ ${ref}: copied to the new Keychain (service praeko)`);
    for (const ref of r.jaNoNovo) log(`• ${ref}: already in the new one; nothing to copy`);
    for (const ref of r.ausentes) log(`· ${ref}: was not in the old one`);
    log(r.copiados.length ? `${r.copiados.length} item(s) copied. The old ones stay where they were (delete them by hand whenever you like).` : "nothing to copy."); return 0;
  }
  if (sub === "create" && f.sql) { // first key: generate here and print the SQL for D1 (the server has no admin key yet)
    if (!f.name) throw new Error("name it: praeko key create --name admin --scope admin --sql");
    const scope = f.scope || "admin", k = gerarChave(), id = idChave(), h = await hashChave(k);
    if (!["read", "write", "admin"].includes(scope)) throw new Error("scope: read, write or admin");
    const scopeDb = SCOPE_DB[scope] ?? scope; // the database stores leitura/escrita/admin
    const sqlName = String(f.name).replace(/'/g, "''");
    log(`Key (store it now, it is not shown again):\n  ${k}\n\nRun on D1 (see docs/servidor.md; use --local for wrangler dev):\n  npx wrangler d1 execute arauto --remote --command "INSERT INTO chaves_api (id, nome, hash, prefixo, scope, criado_em) VALUES ('${id}', '${sqlName}', '${h}', '${prefixoChave(k)}', '${scopeDb}', '${new Date().toISOString()}')"`);
    return 0;
  }
  const a = remoteClient(f, loadConfigIfAny(f).config, extra);
  if (sub === "create") {
    if (!f.name) throw new Error("name it: praeko key create --name studio [--scope write]");
    const r = await a.apiKeys.create(f.name, f.scope || "write");
    log(`✓ key ${r.id} (${r.scope}) created. Store it now, it is not shown again:\n  ${r.key}`); return 0;
  }
  if (sub === "list") { for (const k of (await a.apiKeys.list()).keys) log(`${k.id}  ${k.scope.padEnd(8)} ${k.name.padEnd(16)} ${k.prefix}…  ${k.revoked ? "REVOKED" : k.lastUsedAt ? "last used " + timeOf(k.lastUsedAt) : "never used"}`); return 0; }
  if (sub === "revoke") { if (!f._[1]) throw new Error("usage: praeko key revoke <id>"); await a.apiKeys.revoke(f._[1]); log(`✓ key ${f._[1]} revoked`); return 0; }
  throw new Error("usage: praeko key store | create --name N [--scope S] [--sql] | list | revoke <id> | migrate");
}

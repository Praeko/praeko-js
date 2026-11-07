// `praeko studio postar` / `praeko studio fila` / `praeko studio conta`: publicação direta nas redes (YouTube, Instagram, TikTok), sem Buffer.
// `postar` coloca o vídeo na fila (e roda na hora o que é "imediato", como subir o YouTube como privado); `fila executar`
// roda o que venceu (agende no launchd com `fila instalar`); `conta <rede> conectar` faz a autorização uma vez.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { guardarChave, obterChave } from "@praeko/studio-voz";
import { REDES, cancelarItem, enfileirar, executar, hospedagem, lerFila, parseQuando, plistLaunchd, provedores, textosPorRede, validar } from "@praeko/studio-publicar";
import { acharProjeto, episodio } from "./projeto.mjs";
import { acharNaPasta, acharVideo, lerMeta, local } from "./agendar.mjs";

const flag = (a, k) => { const i = a.indexOf("--" + k); return i >= 0 && a[i + 1] && !a[i + 1].startsWith("--") ? a[i + 1] : undefined; };
const tem = (a, k) => a.includes("--" + k);
const NOME = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok" };
const STUDIO_BIN = process.argv[1]; // o próprio executável do Studio (bin/praeko-studio.mjs ou dist/praeko-studio.mjs)
const soMac = () => { if (process.platform !== "darwin") throw new Error("`fila instalar/remover` usa o launchd do macOS. Em Linux/Windows agende `praeko studio fila executar` no cron/Agendador de Tarefas, ou prefira `praeko studio agendar --via praeko` (o Praeko agenda no servidor)."); };

/** Contexto entregue aos provedores. */
export function contexto(p, { log = console.log } = {}) {
  const h = () => hospedagem.configHospedagem(p.marca);
  return {
    marca: p.marca, raiz: p.raiz, fetchFn: fetch, log, agora: () => new Date(),
    segredos: { obter: (ref) => obterChave(ref), guardar: (ref, v) => guardarChave(ref, v) },
    /** Sobe um arquivo para a hospedagem pública temporária (R2). { url, chave } */
    hospedar: async (arquivo, slug = "midia") => hospedagem.subir({ h: h(), slug, arquivo, cwd: p.raiz }),
    removerHospedado: async (chave) => hospedagem.apagar({ h: h(), chave, cwd: p.raiz }),
  };
}

const redesDe = (a, padrao) => (flag(a, "redes") ? flag(a, "redes").split(",").map((x) => REDES[x.trim()] || (() => { throw new Error(`rede desconhecida: ${x}`); })()) : padrao);

export async function postar(a) {
  const COM_VALOR = new Set(["quando", "redes", "yt", "ig", "tt", "video", "capa"]);
  const slug = (() => { for (let i = 0; i < a.length; i++) { if (a[i].startsWith("--")) { if (COM_VALOR.has(a[i].slice(2))) i++; continue; } return a[i]; } })();
  if (!slug) throw new Error('uso: praeko studio postar <slug> --quando "06/11 17:30" [--redes yt,ig,tt] [--yt|--ig|--tt "hora"] [--enviar]');
  const p = acharProjeto(), ep = episodio(p, slug), meta = lerMeta(ep);
  const v = validar({ marca: p.marca, ep: meta });
  if (v.erros.length) { v.erros.forEach((e) => console.log("  ✗", e)); return 1; }
  const redes = redesDe(a, meta.formato === "longo" ? ["youtube", "instagram"] : ["youtube", "instagram", "tiktok"]);
  const todos = await provedores.carregarTodos();
  const faltam = redes.filter((r) => !todos[r]);
  if (faltam.length) throw new Error(`provedor ainda não escrito: ${faltam.join(", ")}`);
  const fuso = p.marca.publicacao?.fusoOffset || "-03:00";
  const video = acharVideo(p, ep, meta, a);
  const capa = flag(a, "capa") ? resolve(flag(a, "capa")) : acharNaPasta(p, meta.arquivos?.capa);
  const textos = textosPorRede({ marca: p.marca, ep: meta });
  const enviar = tem(a, "enviar"), ctx = contexto(p);
  const itens = [];
  for (const r of redes) {
    const prov = todos[r];
    const q = flag(a, { youtube: "yt", instagram: "ig", tiktok: "tt" }[r]) || flag(a, "quando");
    if (!q && !prov.imediato) throw new Error(`falta o horário de ${NOME[r]}: --quando "06/11 17:30"`);
    const quando = q ? parseQuando(q, { fuso }) : new Date().toISOString();
    itens.push({ slug, rede: r, provedor: r, quando, video, capa: capa && existsSync(capa) ? capa : null, textos: textos[r], opcoes: { ...(p.marca.publicacao?.[r] || {}), ...(meta.ia?.sintetico != null && r === "youtube" ? { conteudoSintetico: !!meta.ia.sintetico } : {}), ...(meta.ia?.sintetico != null && r === "tiktok" ? { conteudoIA: !!meta.ia.sintetico } : {}) }, formato: meta.formato || "short", titulo: meta.titulo });
  }
  console.log(`${enviar ? "ENFILEIRANDO" : "SIMULAÇÃO (use --enviar)"}: ${meta.titulo}`);
  console.log(`vídeo: ${relative(process.cwd(), video)}${capa ? `  capa: ${basename(capa)}` : "  (sem capa)"}`);
  for (const it of itens) {
    const prov = todos[it.rede];
    console.log(`  ${NOME[it.rede].padEnd(10)} ${prov.imediato ? "agora (sobe como privado, você publica)" : local(it.quando)}  texto ${it.textos.texto.length} caract.`);
    for (const l of (await prov.planejar?.({ item: it, ctx })) || []) console.log("     " + l);
  }
  (meta.antesDePublicar || []).forEach((x) => console.log("  ☐", x));
  if (!enviar) return 0;
  const novos = itens.map((it) => enfileirar(p.raiz, it));
  await executar({ raiz: p.raiz, provedores: todos, ctx, soIds: novos.map((n) => n.id) });
  console.log(`\nFila: praeko studio fila listar. O que não é imediato sai na hora marcada se o executor estiver rodando (praeko studio fila instalar).`);
  return lerFila(p.raiz).itens.some((x) => novos.some((n) => n.id === x.id && x.estado === "erro")) ? 1 : 0;
}

export async function fila(a) {
  const p = acharProjeto(), sub = a[0] && !a[0].startsWith("--") ? a[0] : "listar";
  if (sub === "listar") {
    const f = lerFila(p.raiz);
    if (!f.itens.length) { console.log("fila vazia"); return 0; }
    for (const it of f.itens) console.log(`${it.id}  ${it.estado.padEnd(10)} ${NOME[it.rede].padEnd(9)} ${local(it.quando)}  ${it.slug}${it.erro ? `  ✗ ${it.erro.slice(0, 80)}` : ""}${it.resultado?.url ? "  " + it.resultado.url : ""}`);
    return 0;
  }
  if (sub === "executar") {
    const todos = await provedores.carregarTodos();
    const r = await executar({ raiz: p.raiz, provedores: todos, ctx: contexto(p), simular: tem(a, "simular") });
    if (!r.feitos.length && !tem(a, "simular")) console.log("nada a fazer agora");
    return 0;
  }
  if (sub === "cancelar") { const it = cancelarItem(p.raiz, a[1]); console.log(`✓ cancelado ${it.id} (${NOME[it.rede]}, ${it.slug})`); return 0; }
  if (sub === "instalar") {
    soMac();
    const plist = join(homedir(), "Library", "LaunchAgents", "br.praeko.studio.fila.plist");
    mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
    writeFileSync(plist, plistLaunchd({ node: process.execPath, bin: STUDIO_BIN, cwd: p.raiz, minutos: +flag(a, "minutos") || 5, log: join(p.raiz, ".praeko-studio", "fila.log") }));
    try { execFileSync("launchctl", ["bootout", `gui/${process.getuid()}`, plist], { stdio: "ignore" }); } catch { /* não estava carregado */ }
    execFileSync("launchctl", ["bootstrap", `gui/${process.getuid()}`, plist]);
    console.log(`✓ executor instalado (${plist}); roda a cada ${+flag(a, "minutos") || 5} min com o Mac ligado. Log: .praeko-studio/fila.log`);
    return 0;
  }
  if (sub === "remover") {
    soMac();
    const plist = join(homedir(), "Library", "LaunchAgents", "br.praeko.studio.fila.plist");
    try { execFileSync("launchctl", ["bootout", `gui/${process.getuid()}`, plist], { stdio: "ignore" }); } catch { /* já parado */ }
    console.log("✓ executor removido"); return 0;
  }
  throw new Error("uso: praeko studio fila [listar|executar [--simular]|cancelar <id>|instalar [--minutos N]|remover]");
}

export async function conta(a) {
  const rede = REDES[a[0]], acao = a[1] || "status";
  if (!rede) throw new Error("uso: praeko studio conta <youtube|instagram|tiktok> [conectar|status]");
  const p = acharProjeto(), ctx = contexto(p);
  const prov = await provedores.carregar(rede);
  if (acao === "conectar") return (await prov.conectar({ ctx, args: a.slice(2) })) ?? 0;
  const s = await prov.status({ ctx });
  console.log(`${NOME[rede]}: ${s.conectado ? "conectado" : "NÃO conectado"}${s.detalhe ? ` (${s.detalhe})` : ""}`);
  return s.conectado ? 0 : 1;
}

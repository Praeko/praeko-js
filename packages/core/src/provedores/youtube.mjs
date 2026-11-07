// Provedor direto do YouTube para o Node (CLI e executor local). A lógica da API está em youtube-api.mjs (sem Node, a mesma
// que o servidor usa); aqui entram só as peças do Node: OAuth com servidor loopback e navegador, leitura de arquivo no disco,
// conversão de capa com ffmpeg e o resumo com o tamanho do arquivo.
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { closeSync, fstatSync, openSync, readSync, statSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as api from "./youtube-api.mjs";

export * from "./youtube-api.mjs";

const b64url = (b) => Buffer.from(b).toString("base64url");
export const desafioPkce = (verificador) => createHash("sha256").update(verificador).digest("base64url");

/** Leitor de arquivo em blocos: { tamanho, ler(inicio, tamanho) → Buffer, fechar() }. */
function abrirArquivoReal(caminho) {
  const fd = openSync(caminho, "r"), tamanho = fstatSync(fd).size;
  return {
    tamanho,
    ler(inicio, n) { const buf = Buffer.alloc(Math.min(n, tamanho - inicio)); readSync(fd, buf, 0, buf.length, inicio); return buf; },
    fechar() { closeSync(fd); },
  };
}
function converterParaJpeg(entrada) {
  const saida = join(tmpdir(), `praeko-miniatura-${Date.now()}.jpg`);
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", entrada, "-q:v", "3", saida], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg não conseguiu reduzir a miniatura");
  return saida;
}

/** Acrescenta ao contexto os padrões do Node (disco, ffmpeg, navegador, servidor loopback). Dublês em ctx.deps vencem. */
export function comNode(ctx) {
  return {
    ...ctx,
    deps: {
      abrirArquivo: ctx.midia ? undefined : abrirArquivoReal,
      converterImagem: converterParaJpeg,
      aleatorio: (n) => randomBytes(n),
      abrirNavegador: (url) => { try { spawn("open", [url], { stdio: "ignore", detached: true }).unref(); } catch { /* o usuário abre à mão */ } },
      criarServidor: createServer,
      ...ctx.deps,
    },
  };
}

export const tokenValido = (ctx) => api.tokenValido(comNode(ctx));
export const status = ({ ctx }) => api.status({ ctx: comNode(ctx) });
export const enviarVideo = (o) => api.enviarVideo({ ...o, ctx: comNode(o.ctx) });
export const publicar = ({ item, ctx }) => api.publicar({ item, ctx: comNode(ctx) });
export const comentar = ({ item, ctx }) => api.comentar({ item, ctx: comNode(ctx) });

export async function planejar({ item, ctx }) {
  let tam = "?";
  try { tam = (statSync(item.video).size / 1048576).toFixed(1) + " MB"; } catch { /* arquivo some em teste */ }
  return api.planejar({ item: { ...item, tamanhoTexto: tam }, ctx });
}

/** Autoriza uma vez: servidor loopback + PKCE. Guarda youtube/cliente e youtube/token. */
export async function conectar({ ctx: ctx0, args = [] }) {
  const ctx = comNode(ctx0), d = api.deps(ctx), cl = await api.cliente(ctx, args);
  const verificador = b64url(d.aleatorio(48)), estado = b64url(d.aleatorio(16));
  let aguardo;
  const codigoP = new Promise((ok, no) => { aguardo = { ok, no }; });
  const srv = d.criarServidor((req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    if (u.pathname !== "/") { res.writeHead(404).end(); return; }
    const erro = u.searchParams.get("error"), codigo = u.searchParams.get("code");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<meta charset="utf-8"><body style="font-family:sans-serif"><h2>${erro || !codigo ? "Não deu certo" : "Pronto"}</h2><p>${erro || !codigo ? "Volte ao terminal." : "Pode fechar esta aba e voltar ao terminal."}</p>`);
    if (erro) aguardo.no(new Error(`autorização negada: ${erro}`));
    else if (u.searchParams.get("state") !== estado) aguardo.no(new Error("state não confere (tente de novo)"));
    else if (codigo) aguardo.ok(codigo);
  });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  const redirect = `http://127.0.0.1:${srv.address().port}`;
  const url = api.urlAutorizacao({ clientId: cl.client_id, redirect, desafio: desafioPkce(verificador), estado });
  ctx.log(`Abrindo o navegador para autorizar o Praeko no YouTube.\nSe não abrir, copie este endereço:\n${url}`);
  d.abrirNavegador(url);
  const limite = setTimeout(() => aguardo.no(new Error("tempo esgotado (5 min) esperando a autorização")), d.limiteMs ?? 5 * 60e3);
  try {
    const codigo = await codigoP;
    const j = await api.trocarCodigo(ctx, cl, { codigo, verificador, redirect });
    await ctx.segredos.guardar(api.REF_CLIENTE, JSON.stringify(cl));
    await ctx.segredos.guardar(api.REF_TOKEN, api.registroToken(j, d.agora()));
  } finally { clearTimeout(limite); srv.close(); }
  const s = await status({ ctx });
  ctx.log(s.conectado ? `✓ YouTube conectado: ${s.detalhe}` : "⚠ autorizado, mas não consegui ler o canal");
  return s.conectado ? 0 : 1;
}

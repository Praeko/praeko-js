// Lê uma PASTA-PACOTE (video + capa + publicacao.json) e monta o `pedido` do Publicador. Não depende do Bardo.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { capitulos as _c, textosPorRede, validar } from "@praeko/core";

const ehDir = (p) => existsSync(p) && statSync(p).isDirectory();

/** Acha a pasta do pacote: caminho direto, ou <raiz>/<config.pacotes ou "pacotes">/<nome>. */
export function acharPacote(arg, { raiz, config }) {
  for (const c of [resolve(arg), join(raiz, config.pacotes || "pacotes", arg), config.pasta ? join(raiz, config.pasta, arg) : null]) if (c && ehDir(c)) return c;
  throw new Error(`pacote "${arg}" não encontrado (pasta com publicacao.json, vídeo e capa). Use um caminho ou --meta/--video/--capa`);
}

/** { dir, id, meta, video, capa } a partir da pasta (e/ou --meta/--video/--capa). */
export function lerPacote({ arg, flags, raiz, config }) {
  const dir = arg ? acharPacote(arg, { raiz, config }) : null;
  const metaArq = flags.meta ? resolve(flags.meta) : dir && join(dir, "publicacao.json");
  if (!metaArq || !existsSync(metaArq)) throw new Error("sem publicacao.json (use uma pasta-pacote ou --meta arquivo.json)");
  const meta = JSON.parse(readFileSync(metaArq, "utf8"));
  const base = dir || resolve(metaArq, "..");
  const achar = (nome, re) => { if (nome && existsSync(join(base, nome))) return join(base, nome); const l = readdirSync(base).filter((f) => re.test(f)).sort(); return l.length ? join(base, l[l.length - 1]) : null; };
  const video = flags.video ? resolve(flags.video) : achar(meta.arquivos?.video, /\.(mp4|mov)$/i);
  const capa = flags.cover ? resolve(flags.cover) : achar(meta.arquivos?.capa, /(capa|cover|thumb).*\.(png|jpe?g)$/i);
  if (!video || !existsSync(video)) throw new Error(`não achei o vídeo (arquivos.video = ${meta.arquivos?.video || "?"}); use --video`);
  return { dir: base, id: flags.id || basename(base), meta, video, capa: capa && existsSync(capa) ? capa : null };
}

/** pedido do Publicador + conferência de texto. */
export function montarPedido({ pacote, config, destinos, opcoes = {} }) {
  const v = validar({ config, ep: pacote.meta });
  const textos = textosPorRede({ config, ep: pacote.meta });
  return {
    erros: v.erros, avisos: v.avisos,
    pedido: { id: pacote.id, titulo: pacote.meta.titulo, midia: { video: pacote.video, capa: pacote.capa }, textos, destinos, opcoes: { ...opcoes, formato: pacote.meta.formato || "short" } },
  };
}

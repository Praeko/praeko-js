// Reads a PACKAGE FOLDER (video + cover + publication.json) and builds the publisher request. It does not depend on Studio.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { textosPorRede, validar } from "@praeko/core";
import type { Pedido } from "@praeko/core/contrato";

/** Renames the keys of an object by `map` (unknown keys pass through). The public files are English; packages/core speaks its own internal Portuguese shape. */
const mapKeys = (o: any, map: Record<string, string>) => (o && typeof o === "object" && !Array.isArray(o) ? Object.fromEntries(Object.entries(o).map(([k, v]) => [map[k] ?? k, v])) : o);
const YT_MODE: Record<string, string> = { private: "privado", scheduled: "agendado", public: "publico" }, TT_MODE: Record<string, string> = { draft: "rascunho", direct: "direto" };

/** praeko.json (English) → the flat shape packages/core reads. */
export function toCoreConfig(c: any = {}) {
  const o: any = mapKeys(c, { name: "nome", timezoneOffset: "fusoOffset", folder: "pasta", limits: "limites", hosting: "hospedagem", provider: "provedor", providers: "provedores", networks: "redes", packages: "pacotes", remote: "remoto" });
  if (o.limites) o.limites = mapKeys(o.limites, { youtubeTitle: "youtubeTitulo", youtubeDescription: "youtubeDescricao", hashtagsInstagram: "hashtagsInstagram" });
  if (o.hashtags) o.hashtags = mapKeys(o.hashtags, { allowed: "permitidas", banned: "proibidas" });
  if (o.hospedagem) o.hospedagem = mapKeys(o.hospedagem, { type: "tipo", baseUrl: "urlBase" });
  if (o.buffer) { o.buffer = mapKeys(o.buffer, { channels: "canais", networks: "redes" }); }
  if (o.youtube) { o.youtube = mapKeys(o.youtube, { mode: "modo", categoryId: "categoriaId", notifySubscribers: "avisarInscritos", privacy: "privacidade" }); if (YT_MODE[o.youtube.modo]) o.youtube.modo = YT_MODE[o.youtube.modo]; }
  if (o.instagram) o.instagram = mapKeys(o.instagram, { version: "versao", comment: "comentar" });
  if (o.tiktok) { o.tiktok = mapKeys(o.tiktok, { mode: "modo", privacy: "privacidade", coverMs: "capaMs", audited: "auditado" }); if (TT_MODE[o.tiktok.modo]) o.tiktok.modo = TT_MODE[o.tiktok.modo]; }
  return o;
}

/** publication.json (English) → the shape packages/core reads. */
export function toCoreMeta(m: any = {}) {
  const o: any = mapKeys(m, { name: "nome", date: "data", title: "titulo", alternatives: "alternativas", format: "formato", files: "arquivos", beforePublishing: "antesDePublicar", ai: "ia", facts: "fatos", chapters: "capitulos", fullVideo: "videoCompleto", article: "artigo", commentReply: "respostaComentario", campaign: "campanha", publishOn: "publicarEm" });
  if (o.formato === "long") o.formato = "longo";
  if (o.arquivos) o.arquivos = mapKeys(o.arquivos, { cover: "capa", verticalCover: "capaVertical" });
  if (o.ia) o.ia = mapKeys(o.ia, { synthetic: "sintetico" });
  if (o.yt) o.yt = mapKeys(o.yt, { description: "descricao", pinnedComment: "comentarioFixo" });
  if (o.ig) o.ig = mapKeys(o.ig, { caption: "legenda", pinnedComment: "comentarioFixo" });
  if (o.tiktok) o.tiktok = mapKeys(o.tiktok, { caption: "legenda" });
  if (Array.isArray(o.capitulos)) o.capitulos = o.capitulos.map((c: any) => mapKeys(c, { title: "titulo" }));
  return o;
}

const isDir = (p: any) => existsSync(p) && statSync(p).isDirectory();

/** Finds the package folder: a direct path, or <root>/<config.pacotes or "packages">/<name>. */
export function findPackage(arg: any, { root, config }: any) {
  for (const c of [resolve(arg), join(root, config.pacotes || "packages", arg), config.pasta ? join(root, config.pasta, arg) : null]) if (c && isDir(c)) return c;
  throw new Error(`package "${arg}" not found (a folder with publication.json, the video and the cover). Use a path or --meta/--video/--cover`);
}

/** { dir, id, meta, video, cover } from the folder (and/or --meta/--video/--cover). */
export function readPackage({ arg, flags, root, config }: any) {
  const dir = arg ? findPackage(arg, { root, config }) : null;
  const metaFile = flags.meta ? resolve(flags.meta) : dir && join(dir, "publication.json");
  if (!metaFile || !existsSync(metaFile)) throw new Error("no publication.json (use a package folder or --meta file.json)");
  const meta = toCoreMeta(JSON.parse(readFileSync(metaFile, "utf8")));
  const base = dir || resolve(metaFile, "..");
  const find = (name: any, re: any) => { if (name && existsSync(join(base, name))) return join(base, name); const l = readdirSync(base).filter((f) => re.test(f)).sort(); return l.length ? join(base, l[l.length - 1] as string) : null; };
  const video = flags.video ? resolve(flags.video) : find(meta.arquivos?.video, /\.(mp4|mov)$/i);
  const cover = flags.cover ? resolve(flags.cover) : find(meta.arquivos?.capa, /(capa|cover|thumb).*\.(png|jpe?g)$/i);
  if (!video || !existsSync(video)) throw new Error(`could not find the video (arquivos.video = ${meta.arquivos?.video || "?"}); use --video`);
  return { dir: base, id: flags.id || basename(base), meta, video, capa: cover && existsSync(cover) ? cover : null };
}

/** Publisher request + text check. */
export function buildRequest({ pkg, config, targets, options = {} }: any): { errors: string[]; warnings: string[]; request: Pedido } {
  const v = validar({ config, ep: pkg.meta });
  const texts = textosPorRede({ config, ep: pkg.meta });
  return {
    errors: v.erros, warnings: v.avisos,
    request: { id: pkg.id, titulo: pkg.meta.titulo, midia: { video: pkg.video, capa: pkg.capa }, textos: texts, destinos: targets, opcoes: { ...options, formato: pkg.meta.formato || "short" } },
  };
}

// Pieces of the SDK that use the disk (Node): read a file in ranges and upload video and cover.
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { basename, extname } from "node:path";

const MIME = { ".mp4": "video/mp4", ".mov": "video/quicktime", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };
export const mimeOf = (path) => MIME[extname(path).toLowerCase()] || null;
/** @deprecated use mimeOf */
export const mimeDe = mimeOf;

/** Source of a file on disk: reads in ranges (never loads the whole video in memory). Also carries the old Portuguese fields (tamanho, ler, nome, fechar). */
export function fileSource(path) {
  const fd = openSync(path, "r"), size = fstatSync(fd).size;
  const read = async (start, n) => { const b = Buffer.alloc(Math.min(n, size - start)); readSync(fd, b, 0, b.length, start); return b; };
  const close = () => closeSync(fd), name = basename(path);
  return { size, name, mime: mimeOf(path), read, close, tamanho: size, nome: name, ler: read, fechar: close };
}
/** @deprecated use fileSource */
export const arquivoComoFonte = fileSource;

/** Uploads a file from disk. `type`: "video" | "cover" (old "capa" accepted). Returns the ready media. Works with the new client (media.upload) and the old one (midia.enviar). */
export async function uploadFile(cliente, path, { type, onProgress, tipo, aoProgredir } = {}) {
  const f = fileSource(path);
  try {
    if (!f.mime) throw new Error(`não sei o tipo de ${path} (use .mp4, .mov, .png ou .jpg)`);
    const t = type || tipo || (f.mime.startsWith("video/") ? "video" : "cover"), cb = onProgress || aoProgredir;
    if (cliente.media?.upload) return await cliente.media.upload(f, { type: t === "capa" ? "cover" : t, name: f.name, mime: f.mime, onProgress: cb });
    return await cliente.midia.enviar(f, { tipo: t === "cover" ? "capa" : t, nome: f.name, mime: f.mime, aoProgredir: cb });
  } finally { f.close(); }
}
/** @deprecated use uploadFile */
export const enviarArquivo = (cliente, caminho, { tipo, aoProgredir, type, onProgress } = {}) => uploadFile(cliente, caminho, { type: type ?? tipo, onProgress: onProgress ?? aoProgredir });

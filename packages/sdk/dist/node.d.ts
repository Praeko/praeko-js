import type { Media, Praeko, Source } from "./index.js";
export declare const mimeOf: (path: string) => string | null;
/** @deprecated use mimeOf */
export declare const mimeDe: typeof mimeOf;
/** Source of a file on disk: reads in ranges (never loads the whole video in memory). Also carries the old Portuguese fields (tamanho, ler, nome, fechar). */
export interface FileSource {
    size: number;
    name: string;
    mime: string | null;
    read(start: number, n: number): Promise<Uint8Array>;
    close(): void;
    /** @deprecated */ tamanho: number; /** @deprecated */
    nome: string; /** @deprecated */
    ler(start: number, n: number): Promise<Uint8Array>; /** @deprecated */
    fechar(): void;
}
export declare function fileSource(path: string): FileSource;
/** @deprecated use fileSource */
export declare const arquivoComoFonte: typeof fileSource;
/** Uploads a file from disk. `type`: "video" | "cover" (old "capa" accepted). Returns the ready media. Works with the new client (media.upload) and the old one (midia.enviar). */
export declare function uploadFile(cliente: Praeko, path: string, { type, onProgress, tipo, aoProgredir }?: {
    type?: "video" | "cover";
    onProgress?: (done: number, total: number) => void; /** @deprecated */
    tipo?: string; /** @deprecated */
    aoProgredir?: (done: number, total: number) => void;
}): Promise<Media>;
/** @deprecated use uploadFile */
export declare const enviarArquivo: (cliente: Praeko, caminho: string, { tipo, aoProgredir, type, onProgress }?: Parameters<typeof uploadFile>[2]) => Promise<Media>;
export type { Source };

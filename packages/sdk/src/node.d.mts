// Tipos de node.mjs (escritos à mão): envio de arquivos do disco (só Node).
import type { Praeko, Source } from "./index.js";
export declare const mimeOf: (path: string) => string | null;
/** @deprecated use mimeOf */
export declare const mimeDe: typeof mimeOf;
export interface FileSource { size: number; name: string; mime: string | null; read(start: number, n: number): Promise<Uint8Array>; close(): void; /** @deprecated */ tamanho: number; /** @deprecated */ nome: string; /** @deprecated */ ler(start: number, n: number): Promise<Uint8Array>; /** @deprecated */ fechar(): void }
export declare function fileSource(path: string): FileSource;
/** @deprecated use fileSource */
export declare const arquivoComoFonte: typeof fileSource;
export declare function uploadFile(client: Praeko, path: string, opts?: { type?: "video" | "cover"; onProgress?: (done: number, total: number) => void; /** @deprecated */ tipo?: string; /** @deprecated */ aoProgredir?: (done: number, total: number) => void }): Promise<{ id: string; [k: string]: unknown }>;
/** @deprecated use uploadFile */
export declare const enviarArquivo: (client: Praeko, path: string, opts?: Parameters<typeof uploadFile>[2]) => ReturnType<typeof uploadFile>;
export type { Source };

// Versão do Praeko Studio (e dos pacotes que o projeto novo usa): injetada pelo build (esbuild define); em desenvolvimento, lida do package.json.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const AQUI = dirname(fileURLToPath(import.meta.url));
/** Raiz do pacote (a pasta do package.json): `src/..` em desenvolvimento e `dist/..` publicado. */
export const RAIZ_PACOTE = join(AQUI, "..");
export const VERSAO = typeof __STUDIO_VERSION__ !== "undefined" ? __STUDIO_VERSION__ : JSON.parse(readFileSync(join(RAIZ_PACOTE, "package.json"), "utf8")).version;

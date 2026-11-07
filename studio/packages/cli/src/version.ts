// Praeko Studio version (and of the packages a new project uses): injected by the build (esbuild define); in development, read from package.json.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

declare const __STUDIO_VERSION__: string | undefined;
export const HERE = dirname(fileURLToPath(import.meta.url));
/** Package root (the folder with package.json): `src/..` in development and `dist/..` once published. */
export const PACKAGE_ROOT = join(HERE, "..");
export const VERSION: string = typeof __STUDIO_VERSION__ !== "undefined" ? __STUDIO_VERSION__ : JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")).version;

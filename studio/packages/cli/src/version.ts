// Praeko Studio version (and of the packages a new project uses): injected by the build (esbuild define); in development, read from package.json.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

declare const __STUDIO_VERSION__: string | undefined;
export const HERE = dirname(fileURLToPath(import.meta.url));
/** Package root (the folder with package.json): `src/..` in development and `dist/..` once published. */
export const PACKAGE_ROOT = join(HERE, "..");
export const VERSION: string = typeof __STUDIO_VERSION__ !== "undefined" ? __STUDIO_VERSION__ : JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")).version;
/** The command that runs Studio without the `praeko` CLI (@praeko/cli) installed, inside or outside a project folder: always the scoped package at THIS exact
 *  version (`npx @praeko/studio@<version>`). Never the unscoped `praeko-studio`/`praeko` names: they are not ours on npm, and npx would fetch whatever owns them. */
export const STUDIO_NPX = `npx @praeko/studio@${VERSION}`;

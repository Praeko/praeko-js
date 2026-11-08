// Version of this package: injected by the build (esbuild define); in development, read from package.json.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

declare const __MCP_VERSION__: string | undefined;
export const VERSION: string = typeof __MCP_VERSION__ !== "undefined" ? __MCP_VERSION__ : JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8")).version;

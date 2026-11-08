#!/usr/bin/env node
// Praeko Studio MCP server over stdio: `praeko-studio-mcp [--project <dir>]`. stdout is the protocol channel: anything human goes to stderr.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { maskSecrets } from "../src/mask.ts";
import { UserError } from "../src/paths.ts";
import { createStudioServer } from "../src/server.ts";
import { VERSION } from "../src/version.ts";

const USAGE = "usage: praeko-studio-mcp [--project <folder>]   (the folder must contain brand.json; default: the current folder)\n  claude mcp add praeko-studio -- npx -y @praeko/studio-mcp --project ~/my-channel";
const argv = process.argv.slice(2);
if (argv.includes("--version") || argv.includes("-v")) { console.log(VERSION); process.exit(0); }
if (argv.includes("--help") || argv.includes("-h")) { console.log(USAGE); process.exit(0); }
let project = process.cwd();
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--project" && argv[i + 1] && !argv[i + 1]!.startsWith("--")) project = argv[++i]!;
  else { console.error(`unknown argument: ${argv[i]}\n${USAGE}`); process.exit(2); }
}
try {
  const { server, jobs } = createStudioServer({ project });
  const stop = (): void => { jobs.shutdown(); };
  process.on("exit", stop);
  for (const s of ["SIGINT", "SIGTERM"] as const) process.on(s, () => { stop(); process.exit(0); });
  process.stdin.on("end", () => { stop(); process.exit(0); });
  await server.connect(new StdioServerTransport());
  console.error(`praeko-studio-mcp ${VERSION} ready (stdio), project ${project}`);
} catch (e: any) {
  console.error("error: " + maskSecrets(e instanceof UserError ? e.message : String(e?.message ?? e)));
  process.exit(1);
}

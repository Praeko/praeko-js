import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { FAKE_ELEVEN, REAL_BIN, SECRETS, noSecret, realProject, tmp } from "./helpers.ts";

const BIN = new URL("../bin/praeko-studio-mcp.ts", import.meta.url).pathname;

test("the real stdio server: clean protocol on stdout, a tool call works, nothing leaks on stderr", async () => {
  const project = realProject();
  const transport = new StdioClientTransport({ command: process.execPath, args: [BIN, "--project", project], env: process.env as Record<string, string>, stderr: "pipe" });
  let err = ""; 
  const client = new Client({ name: "test", version: "0" });
  await client.connect(transport);
  transport.stderr?.on("data", (d) => (err += d));
  const { tools } = await client.listTools();
  assert.equal(tools.length, 15);
  const r: any = await client.callTool({ name: "studio_status", arguments: {} });
  assert.match(r.content[0].text, /"id": "node"/);
  noSecret("stdout", JSON.stringify(r));
  await client.close();
  noSecret("stderr", err);
  assert.ok(!err.includes(FAKE_ELEVEN));
  void REAL_BIN; void SECRETS;
});
test("the binary explains itself: --version, --help, bad arguments, a folder without brand.json", () => {
  const run = (...a: string[]) => spawnSync(process.execPath, [BIN, ...a], { encoding: "utf8", env: process.env });
  assert.match(run("--version").stdout, /^\d+\.\d+\.\d+/);
  assert.match(run("--help").stdout, /usage: praeko-studio-mcp/);
  assert.equal(run("--bogus").status, 2);
  const bad = run("--project", tmp("nobrand"));
  assert.equal(bad.status, 1); assert.match(bad.stderr, /no brand\.json/); assert.equal(bad.stdout, "");
});

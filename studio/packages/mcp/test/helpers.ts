// Test support: an isolated environment (the owner's machine has real keys), fake secrets that must never come out, and an in-memory MCP client.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createStudioServer } from "../src/server.ts";
import type { ServerOptions } from "../src/server.ts";

export const FAKE_ELEVEN = "sk_FAKE0123456789abcdefghijklmnopqrstu3e";
export const FAKE_PRAEKO = "praeko_FAKE98765432zyxwvuts";
export const SECRETS = [FAKE_ELEVEN, FAKE_PRAEKO];
const home = mkdtempSync(join(tmpdir(), "mcp-home-"));
Object.assign(process.env, { HOME: home, USERPROFILE: home, PRAEKO_NO_KEYCHAIN: "1", PRAEKO_SECRETS: join(home, "secrets.json"), PRAEKO_STUDIO_CONFIG: join(home, "studio-config"), ELEVENLABS_API_KEY: FAKE_ELEVEN, PRAEKO_KEY: FAKE_PRAEKO });

export const REAL_BIN = { command: process.execPath, args: [new URL("../../cli/bin/praeko-studio.ts", import.meta.url).pathname] };
export const FAKE_BIN = { command: process.execPath, args: [new URL("./fixtures/fake-studio.mjs", import.meta.url).pathname] };
export const tmp = (n: string): string => mkdtempSync(join(tmpdir(), `mcp-${n}-`));

/** A real project made by `init` (no npm install). */
export function realProject(name = "Test Channel"): string {
  const dir = join(tmp("real"), "channel");
  execFileSync(REAL_BIN.command, [...REAL_BIN.args, "init", dir, "--yes", "--name", name, "--handle", "@testchannel", "--agent", "claude", "--no-install"], { env: process.env, stdio: "pipe" });
  return dir;
}
/** A minimal folder the fake CLI is happy with. */
export function fakeProject(slugs: string[] = ["quick", "slow", "leaky", "fails", "noisy", "other"]): string {
  const dir = tmp("fake");
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "index.ts"), "");
  writeFileSync(join(dir, "brand.json"), JSON.stringify({ name: "Fake" }));
  for (const s of slugs) mkdirSync(join(dir, "episodes", s), { recursive: true });
  return dir;
}

export type Called = { isError: boolean; text: string; body: any; rejected?: string };
export async function connect(opts: ServerOptions): Promise<{ client: Client; jobs: ReturnType<typeof createStudioServer>["jobs"]; root: string; close: () => Promise<void>; call: (name: string, args?: Record<string, unknown>) => Promise<Called> }> {
  const { server, jobs, root } = createStudioServer(opts);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<Called> => {
    try {
      const r: any = await client.callTool({ name, arguments: args });
      const text = r.content.map((c: any) => c.text).join("\n");
      let body: any = null; try { body = JSON.parse(text); } catch { /* plain text error from the SDK */ }
      return { isError: !!r.isError, text, body };
    } catch (e: any) { return { isError: true, text: String(e.message), body: null, rejected: String(e.message) }; }
  };
  return { client, jobs, root, call, close: async () => { jobs.shutdown(); await client.close(); await server.close(); } };
}
export const noSecret = (label: string, text: string): void => {
  for (const s of SECRETS) {
    if (text.includes(s)) throw new Error(`${label}: a secret came out`);
    if (text.includes(s.slice(5, 25))) throw new Error(`${label}: part of a secret came out`);
  }
};

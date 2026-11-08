// Runs the Praeko Studio CLI (`@praeko/studio`) with a FIXED argv: the command words are constants in this package, the only variable parts are values already
// validated by the tool schemas (episode slug, enums, a number). No shell, never a command line built from agent text. stdout is never inherited (it is the MCP channel).
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { UserError } from "./paths.ts";

export type StudioBin = { command: string; args: string[] };

/** The CLI of the installed `@praeko/studio`: dist bundle once published, bin/*.ts (Node type stripping) in the monorepo. */
export function resolveStudioBin(): StudioBin {
  let dir: string;
  try { dir = dirname(createRequire(import.meta.url).resolve("@praeko/studio/package.json")); }
  catch { throw new UserError("@praeko/studio is not installed next to this server (it is a dependency of @praeko/studio-mcp: reinstall the package)"); }
  const bundle = join(dir, "dist", "praeko-studio.mjs"), dev = join(dir, "bin", "praeko-studio.ts");
  if (existsSync(bundle)) return { command: process.execPath, args: [bundle] };
  if (existsSync(dev)) return { command: process.execPath, args: [dev] };
  throw new UserError("could not find the Studio CLI inside @praeko/studio (dist/praeko-studio.mjs)");
}

const CAP = 256 * 1024;
export type CliResult = { code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; timedOut: boolean; truncated: boolean };
export type RunningCli = { child: ChildProcess; done: Promise<CliResult>; kill: (force?: boolean) => void };

/** Starts the CLI in its own process group (so Chrome/ffmpeg children die with it). `onLine` gets every output line as it arrives. */
export function startCli(bin: StudioBin, argv: readonly string[], opts: { cwd: string; timeoutMs: number; onLine?: (line: string, stream: "stdout" | "stderr") => void }): RunningCli {
  const child = spawn(bin.command, [...bin.args, ...argv], {
    cwd: opts.cwd, shell: false, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32",
    env: { ...process.env, PRAEKO_LANG: "en", NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  const kill = (force = false): void => {
    const sig = force ? "SIGKILL" : "SIGTERM";
    try { if (process.platform !== "win32" && child.pid) process.kill(-child.pid, sig); else child.kill(sig); } catch { /* already gone */ }
  };
  let stdout = "", stderr = "", timedOut = false, truncated = false;
  const partial = { stdout: "", stderr: "" };
  const feed = (stream: "stdout" | "stderr", chunk: Buffer): void => {
    const text = chunk.toString("utf8");
    if (stream === "stdout") { if (stdout.length < CAP) stdout += text; else truncated = true; } else { if (stderr.length < CAP) stderr += text; else truncated = true; }
    if (!opts.onLine) return;
    const lines = (partial[stream] + text).split(/\r?\n|\r/);
    partial[stream] = lines.pop() ?? "";
    for (const l of lines) if (l) opts.onLine(l, stream);
  };
  child.stdout!.on("data", (d) => feed("stdout", d));
  child.stderr!.on("data", (d) => feed("stderr", d));
  const timer = setTimeout(() => { timedOut = true; kill(); setTimeout(() => kill(true), 3000).unref(); }, opts.timeoutMs);
  const done = new Promise<CliResult>((ok) => {
    const finish = (code: number | null, signal: NodeJS.Signals | null): void => {
      clearTimeout(timer);
      for (const s of ["stdout", "stderr"] as const) if (partial[s] && opts.onLine) opts.onLine(partial[s], s);
      ok({ code, signal, stdout, stderr, timedOut, truncated });
    };
    child.on("error", (e) => { stderr += `could not start the Studio CLI: ${e.message}\n`; finish(127, null); });
    child.on("close", finish);
  });
  return { child, done, kill };
}

/** Runs to completion (short commands: doctor, docs, new, compile, check). */
export const runCli = (bin: StudioBin, argv: readonly string[], opts: { cwd: string; timeoutMs?: number }): Promise<CliResult> => startCli(bin, argv, { cwd: opts.cwd, timeoutMs: opts.timeoutMs ?? 120_000 }).done;

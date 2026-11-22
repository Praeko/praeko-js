// Managed local Whisper model: download ONLY after the person's explicit yes, verify SHA-256, write to a temp file and rename at the end.
// Source: Hugging Face ggerganov/whisper.cpp (official whisper.cpp model repo). Size and SHA-256 are the LFS values of that repo, checked 2026-11-20
// (tree API `lfs.oid` and `x-linked-etag` agree). A file with another hash is refused and deleted.
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { modelDir } from "./transcribe.ts";

export type ModelSpec = { name: string; file: string; url: string; sha256: string; bytes: number };
export const MANAGED_MODEL: ModelSpec = {
  name: "large-v3-turbo-q5_0", file: "ggml-large-v3-turbo-q5_0.bin",
  url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin",
  sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2", bytes: 574041195,
};
export const modelPathFor = (spec: ModelSpec = MANAGED_MODEL): string => join(modelDir(), spec.file);
export const humanSize = (b: number): string => `~${Math.round(b / 1048576)} MB`;

export class ModelError extends Error {}

export function sha256File(file: string): Promise<string> {
  return new Promise((ok, no) => { const h = createHash("sha256"); const s = createReadStream(file); s.on("data", (c) => h.update(c)); s.on("error", no); s.on("end", () => ok(h.digest("hex"))); });
}

export type DownloadOptions = { spec?: ModelSpec; dest?: string; fetchImpl?: typeof fetch; onProgress?: (done: number, total: number) => void; log?: (m: string) => void };

/** Downloads the model to `dest` (default ~/.config/praeko/models/<file>). The caller must already have the person's yes. Resumes `<dest>.part` with a Range request. */
export async function downloadModel({ spec = MANAGED_MODEL, dest = modelPathFor(spec), fetchImpl = fetch, onProgress, log = () => {} }: DownloadOptions = {}): Promise<{ path: string; bytes: number; sha256: string; resumedFrom: number }> {
  mkdirSync(dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  let have = existsSync(part) ? statSync(part).size : 0;
  if (have > spec.bytes) { rmSync(part, { force: true }); have = 0; }
  const resumedFrom = have;
  if (have < spec.bytes) {
    let res: Response;
    try { res = await fetchImpl(spec.url, { headers: have ? { Range: `bytes=${have}-` } : {}, redirect: "follow" }); }
    catch (e: any) { throw new ModelError(`download failed (${String(e?.message ?? e).slice(0, 120)}); the partial file was kept, run the command again to resume`); }
    let resumedFromReal = have;
    if (have && res.status === 200) { rmSync(part, { force: true }); have = 0; resumedFromReal = 0; } // server ignored Range: start over
    else if (res.status !== 200 && res.status !== 206) throw new ModelError(`download failed: server answered ${res.status}`);
    if (!res.body) throw new ModelError("download failed: empty response");
    const out = createWriteStream(part, { flags: have ? "a" : "w" });
    let done = have;
    try {
      const reader = res.body.getReader();
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        if (!out.write(value)) await new Promise<void>((r) => out.once("drain", r));
        done += value.length; onProgress?.(done, spec.bytes);
      }
      await new Promise<void>((ok, no) => { out.once("error", no); out.end(ok); });
    } catch (e: any) { out.destroy(); throw new ModelError(`download interrupted (${String(e?.message ?? e).slice(0, 120)}); the partial file was kept, run the command again to resume`); }
    return finish(spec, part, dest, resumedFromReal, log);
  }
  return finish(spec, part, dest, resumedFrom, log);
}

async function finish(spec: ModelSpec, part: string, dest: string, resumedFrom: number, log: (m: string) => void) {
  log("checking SHA-256");
  const size = statSync(part).size, got = await sha256File(part);
  if (size !== spec.bytes || got !== spec.sha256) {
    rmSync(part, { force: true });
    throw new ModelError(`the downloaded file does not match the expected SHA-256 (${spec.sha256.slice(0, 12)}…): it was deleted and NOT installed`);
  }
  renameSync(part, dest);
  return { path: dest, bytes: size, sha256: got, resumedFrom };
}

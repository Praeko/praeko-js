// Temporary hosting of the video for Buffer/Instagram to fetch (needs a public HTTPS URL that stays stable until publishing time; no signed link).
// Provider "r2": Cloudflare R2 through `wrangler`. The object key carries a random suffix, so the URL cannot be guessed.
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { basename } from "node:path";
import type { Brand, Hosting } from "./types.ts";

type Exec = (cmd: string, args: string[], opts: Record<string, unknown>) => { status: number | null };

const mimeOf = (file: string) => (/\.mp4$/i.test(file) ? "video/mp4" : /\.mov$/i.test(file) ? "video/quicktime" : "application/octet-stream");

export function objectKey(slug: string, file: string, random: string = randomBytes(8).toString("hex")) {
  return `${slug}/${random}/${basename(file)}`;
}

/** Validates the configuration (brand.publishing.hosting) and returns { type, bucket, baseUrl }. */
export function hostingConfig(brand: Brand): Hosting {
  const h = brand.publishing?.hosting;
  if (!h) throw new Error('no hosting: set brand.publishing.hosting = { "type": "r2", "bucket": "...", "baseUrl": "https://..." } or pass --url');
  if (h.type !== "r2") throw new Error(`hosting "${h.type}" is not supported (use "r2")`);
  if (!h.bucket || !/^https:\/\//.test(h.baseUrl || "")) throw new Error("r2 hosting needs a bucket and an https:// baseUrl");
  return h;
}

/** Uploads the file and returns { url, key }. `exec` is injectable for tests. */
export function upload({ h, slug, file, cwd, exec = spawnSync as Exec }: { h: Hosting; slug: string; file: string; cwd?: string; exec?: Exec }): { url: string; key: string } {
  const key = objectKey(slug, file);
  const r = exec("npx", ["--yes", "wrangler@4", "r2", "object", "put", `${h.bucket}/${key}`, "--file", file, "--content-type", mimeOf(file), "--remote"], { cwd, stdio: "inherit" });
  if (r.status !== 0) throw new Error("wrangler could not upload the file (did you run `npx wrangler login`?)");
  return { url: `${h.baseUrl!.replace(/\/$/, "")}/${key}`, key };
}

export function remove({ h, key, cwd, exec = spawnSync as Exec }: { h: Hosting; key: string; cwd?: string; exec?: Exec }): boolean {
  const r = exec("npx", ["--yes", "wrangler@4", "r2", "object", "delete", `${h.bucket}/${key}`, "--remote"], { cwd, stdio: "inherit" });
  return r.status === 0;
}

// Hospedagem temporária do vídeo para o Buffer buscar (precisa de URL pública, HTTPS, estável até a hora de publicar; sem link assinado).
// Provedor "r2": Cloudflare R2 pelo `wrangler`. A chave do objeto leva um sufixo aleatório, então a URL não é adivinhável.
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { basename } from "node:path";

const tipo = (arq) => (/\.mp4$/i.test(arq) ? "video/mp4" : /\.mov$/i.test(arq) ? "video/quicktime" : "application/octet-stream");

export function chaveObjeto(slug, arquivo, aleatorio = randomBytes(8).toString("hex")) {
  return `${slug}/${aleatorio}/${basename(arquivo)}`;
}

/** Valida a configuração (praeko.json: hospedagem) e devolve { tipo, bucket, urlBase }. */
export function configHospedagem(config) {
  const h = config.hospedagem;
  if (!h) throw new Error('sem hospedagem: defina em praeko.json "hospedagem": { "tipo": "r2", "bucket": "...", "urlBase": "https://..." } ou passe --url');
  if (h.tipo !== "r2") throw new Error(`hospedagem "${h.tipo}" não suportada (use "r2")`);
  if (!h.bucket || !/^https:\/\//.test(h.urlBase || "")) throw new Error("hospedagem r2 precisa de bucket e urlBase https://");
  return h;
}

/** Sobe o arquivo e devolve { url, chave }. `rodar` é injetável para teste. */
export function subir({ h, slug, arquivo, cwd, rodar = spawnSync }) {
  const chave = chaveObjeto(slug, arquivo);
  const r = rodar("npx", ["--yes", "wrangler@4", "r2", "object", "put", `${h.bucket}/${chave}`, "--file", arquivo, "--content-type", tipo(arquivo), "--remote"], { cwd, stdio: "inherit" });
  if (r.status !== 0) throw new Error("wrangler não conseguiu subir o arquivo (você fez `npx wrangler login`?)");
  return { url: `${h.urlBase.replace(/\/$/, "")}/${chave}`, chave };
}

export function apagar({ h, chave, cwd, rodar = spawnSync }) {
  const r = rodar("npx", ["--yes", "wrangler@4", "r2", "object", "delete", `${h.bucket}/${chave}`, "--remote"], { cwd, stdio: "inherit" });
  return r.status === 0;
}

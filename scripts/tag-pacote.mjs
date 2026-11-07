// Mapeia uma tag de release para o pacote e confere a versão: `sdk-v0.2.0`, `cli-v0.3.0`, `studio-v0.1.0`, `studio-core-v0.1.0`, `studio-kit-v0.1.0`.
// Uso no workflow (publicar.yml): node scripts/tag-pacote.mjs "$GITHUB_REF_NAME"   -> imprime PACOTE=<chave> e DIR=<pasta> (sai com 1 se a tag for estranha ou a versão não bater).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const DIRS = { sdk: "packages/sdk", cli: "packages/cli", studio: "studio/packages/cli", "studio-core": "studio/packages/core", "studio-kit": "studio/packages/kit" };
const raiz = fileURLToPath(new URL("..", import.meta.url));

/** `tag` -> { chave, dir, versao } ou lança. A chave é o que vem antes de `-v<semver>` (o semver não tem "-v"; o nome do pacote também não). */
export function resolverTag(tag, base = raiz) {
  const m = /^([a-z][a-z-]*)-v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag || "");
  if (!m || !DIRS[m[1]]) throw new Error(`tag inesperada: ${tag} (use ${Object.keys(DIRS).map((k) => k + "-vX.Y.Z").join(", ")})`);
  const [, chave, versao] = m, dir = DIRS[chave];
  const atual = JSON.parse(readFileSync(join(base, dir, "package.json"), "utf8")).version;
  if (atual !== versao) throw new Error(`tag ${tag} não bate com ${dir}/package.json (${atual})`);
  return { chave, dir, versao };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { const r = resolverTag(process.argv[2]); console.log(`PACOTE=${r.chave}\nDIR=${r.dir}`); }
  catch (e) { console.error(e.message); process.exit(1); }
}

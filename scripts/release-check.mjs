// Confere, sem publicar nada, o que iria para o npm: roda `npm pack --dry-run --json` em @praeko/sdk e @praeko/cli e valida o conteúdo dos tarballs.
// Uso: node scripts/release-check.mjs   (roda igual no monorepo privado e na árvore exportada para o repositório público; a licença e o repositório são sempre exigidos)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { REPO_PUBLICO, URL_ISSUES, URL_REPO } from "./repo-publico.mjs";

const raiz = fileURLToPath(new URL("..", import.meta.url));
export const PACOTES = { sdk: "packages/sdk", cli: "packages/cli" };
const PROIBIDO = [/(^|\/)test\//, /\.test\.m?js$/, /\.check\.ts$/, /(^|\/)\.env/, /\.dev\.vars/, /segredos/i, /\.praeko\//, /\.arauto\//, /node_modules/, /\.map$/, /(^|\/)tsconfig\.json$/, /\.(pem|key)$/];

/** Lista o que o `npm pack` poria no tarball (sem gerar o arquivo). */
export function listarTarball(dir) {
  const saida = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts=false"], { cwd: join(raiz, dir), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const [info] = JSON.parse(saida.slice(saida.indexOf("[")));
  return { arquivos: info.files.map((f) => f.path), tamanho: info.size, descompactado: info.unpackedSize, nome: info.filename };
}

const alvosExports = (e) => typeof e === "string" ? [e] : e && typeof e === "object" ? Object.values(e).flatMap(alvosExports) : [];

/** Devolve a lista de problemas (vazia = ok). */
export function problemas(chave) {
  const dir = PACOTES[chave], pkg = JSON.parse(readFileSync(join(raiz, dir, "package.json"), "utf8"));
  const { arquivos } = listarTarball(dir), set = new Set(arquivos), p = [];
  if (pkg.private) p.push("package.json ainda tem private: true");
  if (pkg.publishConfig?.access !== "public") p.push("publishConfig.access deve ser public");
  if (pkg.publishConfig?.provenance) p.push("publishConfig.provenance não deve ser true: o publish manual do dono (fora do CI) falharia; a proveniência vem do workflow (--provenance) e é automática no publicador confiável");
  if (!pkg.repository?.url || !pkg.homepage || !pkg.bugs?.url) p.push("faltam repository/homepage/bugs");
  if (!pkg.engines?.node) p.push("falta engines.node");
  if (pkg.license !== "MIT") p.push("license deve ser MIT");
  if (pkg.repository?.url !== URL_REPO) p.push(`repository.url deve ser ${URL_REPO} (o publicador confiável do npm exige que bata com o repositório ${REPO_PUBLICO}; scripts/repo-publico.mjs)`);
  if (pkg.repository?.directory !== dir) p.push(`repository.directory deve ser ${dir}`);
  if (pkg.bugs?.url !== URL_ISSUES) p.push(`bugs.url deve ser ${URL_ISSUES}`);
  for (const ob of ["package.json", "README.md", "CHANGELOG.md", "LICENSE"]) if (!set.has(ob)) p.push(`falta no tarball: ${ob}`);
  for (const a of arquivos) if (PROIBIDO.some((r) => r.test(a))) p.push(`arquivo que não devia ir: ${a}`);
  const alvos = [...alvosExports(pkg.exports), ...(pkg.main ? [pkg.main] : []), ...(pkg.types ? [pkg.types] : []), ...Object.values(typeof pkg.bin === "string" ? { x: pkg.bin } : pkg.bin ?? {})];
  for (const a of alvos) if (a !== "./package.json" && !set.has(a.replace(/^\.\//, ""))) p.push(`aponta para arquivo fora do tarball: ${a}`);
  const deps = { ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies };
  for (const d of Object.keys(deps)) if (d.startsWith("@praeko/")) p.push(`dependência do monorepo em dependencies: ${d} (devia estar empacotada ou publicada)`);
  return p;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  execFileSync("npm", ["run", "build", "-w", "packages/cli"], { cwd: raiz, stdio: "inherit" });
  let falhou = false;
  for (const chave of Object.keys(PACOTES)) {
    const { arquivos, tamanho, descompactado, nome } = listarTarball(PACOTES[chave]), pr = problemas(chave);
    console.log(`\n== ${chave}: ${nome} (${arquivos.length} arquivos, ${tamanho} B compactado, ${descompactado} B descompactado)`);
    for (const a of arquivos) console.log("  " + a);
    for (const x of pr) { console.error("  PROBLEMA: " + x); falhou = true; }
  }
  process.exit(falhou ? 1 : 0);
}

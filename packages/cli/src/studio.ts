// `praeko studio <comando>`: entrega o comando ao Praeko Studio (pacote @praeko/studio, bin `praeko-studio`), instalado à parte.
// Onde procurar, nesta ordem: (1) o projeto atual (node_modules/@praeko/studio), (2) ao lado deste @praeko/cli, (3) a instalação global do npm, (4) um `praeko-studio` no PATH.
// Sem Studio: mensagem com os comandos de instalação e, em terminal interativo, a oferta de rodar `npx @praeko/studio` na hora.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, dirname, join } from "node:path";

export const PACOTE_STUDIO = "@praeko/studio";
export type Achado = { tipo: "node" | "binario"; caminho: string; onde: string };
export type Deps = { cwd?: string; env?: NodeJS.ProcessEnv; plataforma?: string; npmRootGlobal?: () => string | null; aqui?: string };

/** O arquivo que o `bin` do package.json do Studio aponta, dado o package.json. */
function binDe(pkgJson: string): string | null {
  try { const p = JSON.parse(readFileSync(pkgJson, "utf8")), b = typeof p.bin === "string" ? p.bin : p.bin?.["praeko-studio"]; const f = b && join(dirname(pkgJson), b); return f && existsSync(f) ? f : null; } catch { return null; }
}
const resolverDe = (base: string): string | null => { try { return binDe(createRequire(join(base, "noop.js")).resolve(PACOTE_STUDIO + "/package.json")); } catch { return null; } };

/** Pasta global do npm sem shell: `npm root -g` (no Windows, o npm-cli.js do Node). Null se não der. */
function npmRootGlobalPadrao(plataforma: string): string | null {
  try {
    const [cmd, args] = plataforma === "win32" ? [process.execPath, [join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"), "root", "-g"]] : ["npm", ["root", "-g"]];
    const r = spawnSync(cmd as string, args as string[], { encoding: "utf8", shell: false, timeout: 15000 });
    return r.status === 0 ? r.stdout.trim() : null;
  } catch { return null; }
}

export function acharStudio(d: Deps = {}): Achado | null {
  const cwd = d.cwd ?? process.cwd(), env = d.env ?? process.env, plat = d.plataforma ?? process.platform;
  let f = resolverDe(cwd);
  if (f) return { tipo: "node", caminho: f, onde: "neste projeto" };
  f = resolverDe(d.aqui ?? import.meta.dirname ?? cwd);
  if (f) return { tipo: "node", caminho: f, onde: "ao lado do @praeko/cli" };
  const raiz = (d.npmRootGlobal ?? (() => npmRootGlobalPadrao(plat)))();
  if (raiz) { f = binDe(join(raiz, "@praeko", "studio", "package.json")); if (f) return { tipo: "node", caminho: f, onde: "instalação global do npm" }; }
  for (const dir of (env.PATH || env.Path || "").split(delimiter).filter(Boolean)) {
    for (const nome of plat === "win32" ? ["praeko-studio.exe"] : ["praeko-studio"]) { const c = join(dir, nome); if (existsSync(c)) return { tipo: "binario", caminho: c, onde: "no PATH" }; }
  }
  return null;
}

export const MENSAGEM_AUSENTE = `praeko studio: o Praeko Studio (vídeos com o seu próprio agente) é um pacote à parte e não foi encontrado.
  Instalar no projeto (recomendado):  npm install -D ${PACOTE_STUDIO}
  Instalar globalmente:               npm install -g ${PACOTE_STUDIO}
  Rodar sem instalar:                 npx ${PACOTE_STUDIO} <comando>
  Novo projeto de vídeo:              npx ${PACOTE_STUDIO} init meu-canal
Os demais comandos do praeko continuam funcionando.`;

/** Roda o Studio com os argumentos. Devolve o código de saída. `executar` e `perguntar` são injetáveis nos testes. */
export function delegarStudio(args: string[], d: Deps & { executar?: (cmd: string, a: string[], env: NodeJS.ProcessEnv) => number; perguntar?: () => boolean; erro?: (m: string) => void } = {}): number {
  const env: NodeJS.ProcessEnv = { ...(d.env ?? process.env), PRAEKO_STUDIO: "1" };
  const executar = d.executar ?? ((cmd, a, e) => spawnSync(cmd, a, { stdio: "inherit", env: e, shell: false }).status ?? 1);
  const erro = d.erro ?? ((m: string) => console.error(m));
  const achado = acharStudio(d);
  if (achado) return achado.tipo === "node" ? executar(process.execPath, [achado.caminho, ...args], env) : executar(achado.caminho, args, env);
  erro(MENSAGEM_AUSENTE);
  const interativo = process.stdin.isTTY && process.stdout.isTTY;
  const quer = d.perguntar ? d.perguntar() : interativo && !env.PRAEKO_STUDIO_SEM_NPX && perguntarSimNao(`Rodar agora com \`npx ${PACOTE_STUDIO}\`? [s/N] `);
  if (!quer) return 1;
  const [cmd, a] = (d.plataforma ?? process.platform) === "win32" ? [process.execPath, [join(dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js"), "--yes", PACOTE_STUDIO, ...args]] : ["npx", ["--yes", PACOTE_STUDIO, ...args]];
  return executar(cmd as string, a as string[], env);
}

function perguntarSimNao(pergunta: string): boolean {
  process.stdout.write(pergunta);
  const buf = Buffer.alloc(16);
  try { const n = readSync(0, buf, 0, buf.length, null); return /^[sSyY]/.test(buf.subarray(0, n).toString()); } catch { return false; }
}

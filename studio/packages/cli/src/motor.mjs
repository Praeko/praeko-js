// Motor de render: remotion (padrão) ou hyperframes. `praeko studio render|prever <slug> --motor hyperframes`.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { ErroHF, VERSAO_HF, componentesDoSpec, escolherMotor, gerarProjeto, resumirCheck } from "@praeko/studio-hyperframes";

/** `npx` sem shell: no Windows, o npx-cli.js que acompanha o Node; nos outros, o `npx` do PATH. */
const npx = (args) => process.platform === "win32" ? [process.execPath, [join(dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js"), ...args]] : ["npx", args];
const rodar = (cmd0, args0, cwd, saida = "inherit") => new Promise((ok) => {
  const [cmd, args] = cmd0 === "npx" ? npx(args0) : [cmd0, args0];
  const c = spawn(cmd, args, { cwd, shell: false, stdio: saida === "inherit" ? "inherit" : ["ignore", "pipe", "inherit"] });
  let out = ""; if (saida !== "inherit") c.stdout.on("data", (d) => (out += d));
  c.on("exit", (code) => ok({ code: code ?? 1, out }));
});
const lerSpec = (ep) => { const a = join(ep.pasta, "episodio.spec.json"); return existsSync(a) ? JSON.parse(readFileSync(a, "utf8")) : null; };

/** O motor deste episódio: --motor > `motor:` do episodio.yaml > `motor` do marca.json > remotion. */
export function motorDe(p, ep, flag) { return escolherMotor({ flag, spec: lerSpec(ep), marca: p.marca }); }

/** Avisos do `praeko studio compilar` quando o episódio vai para o HyperFrames (cenas em TSX não existem lá). */
export function avisosHF(ep) {
  const spec = lerSpec(ep);
  return spec ? componentesDoSpec(spec).map((x) => `motor hyperframes: a cena ${x.cena}${x.titulo ? ` (${x.titulo})` : ""} usa \`componente: ${x.componente}\` (TSX) e não renderiza no HyperFrames`) : [];
}

export function mp4HF(p, ep) { return join(p.raiz, "out", `${ep.slug}.hf.mp4`); }

/** Gera o projeto, confere (`hyperframes check`) e renderiza em out/<slug>.hf.mp4. */
export async function renderHF(p, ep) {
  let g;
  try { g = gerarProjeto({ raiz: p.raiz, slug: ep.slug, marca: p.marca }); } catch (e) { if (e instanceof ErroHF) { console.log(`✗ ${e.message}`); return 1; } throw e; }
  console.log(`✓ projeto HyperFrames: ${relative(process.cwd(), g.dir)} (${g.formato}, ${g.cenas} cenas, ${g.assets.length} assets)`);
  const ck = await rodar("npx", ["--yes", `hyperframes@${VERSAO_HF}`, "check", "--json"], g.dir, "pipe");
  const json = (() => { const i = ck.out.indexOf("{"); try { return JSON.parse(ck.out.slice(i)); } catch { return null; } })();
  if (!json) { console.log("✗ `hyperframes check` não devolveu JSON; rode `npx hyperframes check` em " + relative(process.cwd(), g.dir)); return 1; }
  const r = resumirCheck(json);
  for (const e of r.erros.slice(0, 8)) console.log(`✗ [${e.codigo}] ${e.msg}`);
  const resumo = Object.entries(r.porCodigo).map(([k, n]) => `${k}×${n}`).join(", ");
  if (r.avisos.length) console.log(`⚠ ${r.avisos.length} aviso(s) do check: ${resumo}`);
  if (!r.ok) return 1;
  mkdirSync(join(p.raiz, "out"), { recursive: true });
  const saida = mp4HF(p, ep);
  const t0 = Date.now();
  const c = await rodar("npx", ["--yes", `hyperframes@${VERSAO_HF}`, "render", "--output", saida], g.dir);
  if (!c.code) console.log(`renderizado (hyperframes, ${((Date.now() - t0) / 1000).toFixed(0)} s): ${relative(process.cwd(), saida)}`);
  return c.code;
}

export async function preverHF(p, ep) {
  let g;
  try { g = gerarProjeto({ raiz: p.raiz, slug: ep.slug, marca: p.marca }); } catch (e) { if (e instanceof ErroHF) { console.log(`✗ ${e.message}`); return 1; } throw e; }
  return (await rodar("npx", ["--yes", `hyperframes@${VERSAO_HF}`, "preview"], g.dir)).code;
}

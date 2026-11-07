// `praeko studio doctor [--json] [--offline]`: confere o ambiente de quem vai fazer vídeo. Nunca imprime chave. Sai com 1 se faltar algo obrigatório (Node, ffmpeg).
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { obterChave } from "@praeko/studio-voz";
import { acharProjeto } from "./projeto.mjs";
import { avisoTexto, lerAceite } from "./licencas.mjs";

const rodaVersao = (cmd, args = ["-version"]) => { try { const r = spawnSync(cmd, args, { encoding: "utf8", shell: false, timeout: 15000 }); return r.status === 0 ? (r.stdout || r.stderr).split("\n")[0].trim() : null; } catch { return null; } };

/** Chrome que o Remotion pode usar: o Chrome Headless Shell que ele baixou no projeto, ou um Chrome/Chromium instalado (browserExecutable). */
export function acharChromium(raiz) {
  const env = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (env && existsSync(env)) return { onde: "variável de ambiente", caminho: env };
  if (raiz && existsSync(join(raiz, "node_modules", ".remotion"))) return { onde: "baixado pelo Remotion neste projeto", caminho: join(raiz, "node_modules", ".remotion") };
  const cand = platform() === "darwin" ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"]
    : platform() === "win32" ? [join(process.env.PROGRAMFILES || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe")]
    : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium"];
  const c = cand.find((x) => existsSync(x));
  return c ? { onde: "instalado no sistema", caminho: c } : null;
}

const semAspas = (s) => s.replace(/['"]/g, "").trim();
/** Primeira família não genérica de uma lista CSS de fontes. */
export const familiaPrincipal = (css = "") => css.split(",").map(semAspas).find((f) => f && !/^(system-ui|sans-serif|serif|monospace|ui-\w+)$/i.test(f)) || null;
export function temFonte(familia) {
  if (!familia) return true;
  if (platform() !== "win32") { try { const r = spawnSync("fc-list", [":", "family"], { encoding: "utf8", shell: false, timeout: 15000 }); if (r.status === 0) return r.stdout.toLowerCase().includes(familia.toLowerCase()); } catch { /* sem fontconfig */ } }
  const dirs = platform() === "darwin" ? ["/System/Library/Fonts", "/System/Library/Fonts/Supplemental", "/Library/Fonts", join(homedir(), "Library", "Fonts")] : platform() === "win32" ? [join(process.env.WINDIR || "C:\\Windows", "Fonts")] : ["/usr/share/fonts", join(homedir(), ".fonts")];
  const alvo = familia.toLowerCase().replace(/\s+/g, "");
  const ler = (d, n = 0) => { try { return readdirSync(d, { withFileTypes: true }).some((e) => (e.isDirectory() ? n < 2 && ler(join(d, e.name), n + 1) : e.name.toLowerCase().replace(/[\s_-]+/g, "").includes(alvo))); } catch { return false; } };
  return dirs.some((d) => ler(d));
}

export async function diagnosticar({ offline = false, cwd = process.cwd(), fetchFn = fetch } = {}) {
  const itens = [], add = (id, nivel, msg, correcao) => itens.push({ id, nivel, msg, ...(correcao ? { correcao } : {}) });
  const major = +process.versions.node.split(".")[0];
  add("node", major >= 22 ? "ok" : "erro", `Node ${process.versions.node}`, major >= 22 ? undefined : "instale o Node 22 ou mais novo (nodejs.org)");
  for (const b of ["ffmpeg", "ffprobe"]) { const v = rodaVersao(b); add(b, v ? "ok" : "erro", v || `${b} não encontrado no PATH`, v ? undefined : platform() === "darwin" ? "brew install ffmpeg" : platform() === "win32" ? "winget install ffmpeg (Windows é melhor esforço, sem teste)" : "sudo apt install ffmpeg (ou o gerenciador da sua distribuição)"); }
  let proj = null; try { proj = acharProjeto(cwd); } catch { /* fora de um projeto */ }
  add("projeto", proj ? "ok" : "info", proj ? `projeto em ${proj.raiz}` : "fora de um projeto (sem marca.json): ok para o doctor; use `praeko studio init <pasta>`");
  const ch = acharChromium(proj?.raiz);
  add("chromium", ch ? "ok" : "aviso", ch ? `Chrome/Chromium: ${ch.onde}` : "nenhum Chrome/Chromium encontrado", ch ? undefined : "o Remotion baixa o Chrome Headless Shell sozinho no primeiro render (precisa de internet nesse momento); ou instale o Chrome/Chromium e use CHROME_PATH");
  if (proj) {
    for (const [k, css] of Object.entries(proj.marca.fontes || {})) { const f = familiaPrincipal(css); if (f && !temFonte(f)) add(`fonte-${k}`, "aviso", `fonte "${f}" (marca.fontes.${k}) não está instalada: o texto vai cair em outra fonte e quebrar linhas diferente`, "instale a fonte ou troque `fontes` no marca.json por uma que exista nos dois sistemas (fontes abertas: Inter, Montserrat, JetBrains Mono)"); else if (f) add(`fonte-${k}`, "ok", `fonte "${f}" encontrada`); }
  } else add("fontes", "info", "fontes conferidas dentro de um projeto (marca.json)");
  for (const [ref, nome, dica] of [["elevenlabs/principal", "ElevenLabs (voz final)", "só é preciso para --qualidade final; o rascunho mudo é grátis"], ["praeko/principal", "chave do Praeko (publicar)", "crie no painel (escopo write); só é preciso para publicar"]]) {
    const tem = !!obterChave(ref); add(`chave-${ref.split("/")[0]}`, tem ? "ok" : "info", `${nome}: ${tem ? "presente" : "ausente"}`, tem ? undefined : dica);
  }
  if (offline) add("rede", "info", "rede não verificada (--offline)");
  else { try { const r = await fetchFn("https://praeko.app/", { method: "HEAD", signal: AbortSignal.timeout(6000) }); add("rede", r.status < 500 ? "ok" : "aviso", `praeko.app respondeu ${r.status}`); } catch (e) { add("rede", "aviso", `sem acesso a praeko.app (${e.cause?.code || e.message})`, "só afeta a publicação; renderizar e gerar o pacote funcionam sem rede (depois do primeiro download do Chrome)"); } }
  const ac = lerAceite();
  add("licencas", ac ? "ok" : "aviso", ac ? `aviso de licenças registrado em ${ac.aceitoEm.slice(0, 10)}` : "aviso de licenças ainda não registrado", ac ? undefined : "rode `praeko studio licencas --aceitar` depois de ler (Remotion não é MIT)");
  add("sistema", platform() === "win32" ? "aviso" : "info", `${platform()} ${process.arch}${platform() === "win32" ? ": Windows é melhor esforço e não foi testado" : ""}`);
  return itens;
}

const ICONE = { ok: "✓", aviso: "⚠", erro: "✗", info: "·" };
export async function doctorCmd(a, env = {}) {
  const itens = await diagnosticar({ offline: a.includes("--offline"), ...env });
  if (a.includes("--json")) { console.log(JSON.stringify({ ok: !itens.some((i) => i.nivel === "erro"), itens }, null, 2)); return itens.some((i) => i.nivel === "erro") ? 1 : 0; }
  for (const i of itens) console.log(`${ICONE[i.nivel]} ${i.msg}${i.correcao ? `\n    → ${i.correcao}` : ""}`);
  const erros = itens.filter((i) => i.nivel === "erro").length, avisos = itens.filter((i) => i.nivel === "aviso").length;
  console.log(`\n${erros} erro(s), ${avisos} aviso(s)\n\n${avisoTexto()}`);
  return erros ? 1 : 0;
}

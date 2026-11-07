// Configuração central do Praeko Studio: vozes (vozes.json em camadas) e chaves (ambiente, cofre do SO no macOS, arquivo em ~/.config/praeko/segredos.json).
// Camadas de vozes.json, da mais forte para a mais fraca: projeto (ao lado do marca.json) > usuário (~/.config/praeko/studio/vozes.json) > padrão do pacote (sem ids).
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { VOZES_PADRAO } from "./padrao.mjs";

/** Pasta de configuração do usuário (PRAEKO_STUDIO_CONFIG troca; útil em CI e testes). */
export const pastaConfigUsuario = () => process.env.PRAEKO_STUDIO_CONFIG || join(homedir(), ".config", "praeko", "studio");
export const arquivoVozesUsuario = () => join(pastaConfigUsuario(), "vozes.json");
/** Arquivo de segredos: PRAEKO_SEGREDOS (o mesmo do `praeko` CLI) ou ~/.config/praeko/segredos.json. */
export const arquivoSegredos = () => process.env.PRAEKO_SEGREDOS || join(homedir(), ".config", "praeko", "segredos.json");
export const SERVICO_CHAVEIRO = "praeko";
/** O cofre do macOS (`security`) só existe no darwin; PRAEKO_SEM_CHAVEIRO=1 o desliga (testes, CI). */
export const chaveiroAtivo = () => process.platform === "darwin" && !process.env.PRAEKO_SEM_CHAVEIRO;

/** Sobe pastas a partir de `de` até achar marca.json (raiz do projeto). Devolve null fora de um projeto. */
export function raizDoProjeto(de = process.cwd()) {
  let d = resolve(de);
  for (;;) { if (existsSync(join(d, "marca.json"))) return d; const p = dirname(d); if (p === d) return null; d = p; }
}
export const arquivoVozesProjeto = (de) => { const r = raizDoProjeto(de); return r ? join(r, "vozes.json") : null; };
/** Onde `voz conta adicionar` grava: o do projeto, se estiver em um; senão o do usuário. */
export const arquivoVozesEscrita = (de) => arquivoVozesProjeto(de) || arquivoVozesUsuario();

const lerJson = (a) => { try { return JSON.parse(readFileSync(a, "utf8")); } catch (e) { throw new Error(`${a}: JSON inválido (${e.message})`); } };
const mesclar = (base, extra) => ({
  ...base, ...extra,
  contas: { ...base.contas, ...extra.contas }, vozes: { ...base.vozes, ...extra.vozes }, estrategia: { ...base.estrategia, ...extra.estrategia },
  qualidade: { ...base.qualidade, ...extra.qualidade }, voicestudio: { ...base.voicestudio, ...extra.voicestudio },
});

/** Com `arquivo`, lê só ele (testes e uso avançado). Sem argumento, junta padrão < usuário < projeto. */
export function carregarConfig(arquivo) {
  if (arquivo) return mesclar({ contas: {}, vozes: {}, estrategia: {} }, lerJson(arquivo));
  let c = structuredClone(VOZES_PADRAO);
  for (const a of [arquivoVozesUsuario(), arquivoVozesProjeto()]) if (a && existsSync(a)) c = mesclar(c, lerJson(a));
  return c;
}

/** `marca.voz` pode ser um apelido ("minha-voz") ou, no formato antigo, `{ provedor, idEnv, modelo }`. Sem ids no arquivo, vale ELEVENLABS_VOICE_ID para a conta principal. */
export function resolverVoz(voz, config = carregarConfig()) {
  if (typeof voz === "string") {
    const v = config.vozes[voz];
    if (!v) throw new Error(`voz "${voz}" não existe em vozes.json (há: ${Object.keys(config.vozes).join(", ")})`);
    if (v.provedor === "elevenlabs" && !Object.keys(v.ids || {}).length && process.env.ELEVENLABS_VOICE_ID) return { apelido: voz, ...v, ids: { principal: process.env.ELEVENLABS_VOICE_ID } };
    return { apelido: voz, ...v };
  }
  if (voz && voz.idEnv) {
    const id = process.env[voz.idEnv];
    if (!id) throw new Error(`variável ${voz.idEnv} (id da voz) não definida`);
    return { apelido: voz.idEnv, provedor: voz.provedor || "elevenlabs", modelo: voz.modelo, ids: { principal: id }, ajustes: voz, legado: true };
  }
  throw new Error("marca.voz inválido: use um apelido (string) ou { provedor, idEnv, modelo }");
}

/** Variáveis de ambiente que sobrescrevem uma chave: PRAEKO_STUDIO_KEY_<REF> (REF em maiúsculas, "/" vira "_") e, para a principal, ELEVENLABS_API_KEY. */
export const envDe = (ref) => [`PRAEKO_STUDIO_KEY_${ref.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`, ...(ref === "elevenlabs/principal" ? ["ELEVENLABS_API_KEY"] : []), ...(ref === "praeko/principal" ? ["PRAEKO_KEY"] : [])];
/** A chave do Praeko é a MESMA da `praeko` CLI (conta `praeko/chave`, variável PRAEKO_KEY): o Studio a lê e a grava lá. */
const canonica = (ref) => (ref === "praeko/principal" ? "praeko/chave" : ref);

const lerSegredos = () => { try { return existsSync(arquivoSegredos()) ? JSON.parse(readFileSync(arquivoSegredos(), "utf8")) : {}; } catch { return {}; } };

/** Chave de API de uma conta (`ref`: "elevenlabs/principal"). Ordem: ambiente, cofre do macOS (só no darwin), arquivo de segredos. Devolve null se não achar. */
export function obterChave(ref) {
  for (const n of envDe(ref)) if (process.env[n]) return process.env[n];
  const refs = [...new Set([canonica(ref), ref])];
  if (chaveiroAtivo()) for (const r of refs) {
    try {
      const k = execFileSync("security", ["find-generic-password", "-s", SERVICO_CHAVEIRO, "-a", r, "-w"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
      if (k) return k;
    } catch { /* não está no cofre */ }
  }
  const seg = lerSegredos();
  for (const r of refs) if (seg[r]) return seg[r];
  return null;
}

/** Contas conhecidas (nomes de `ref`): as do config/vozes.json e as fixas do Studio. */
export const refsConhecidas = (config = carregarConfig()) => [...new Set([...(Array.isArray(config.contas?.elevenlabs) ? config.contas.elevenlabs : Object.keys(config.contas?.elevenlabs || {})).map((n) => `elevenlabs/${n}`), ...Object.keys(config.contas?.desativadas || {}).map((n) => `elevenlabs/${n}`), "elevenlabs/principal", "buffer/principal", "praeko/principal"])];

/** Guarda uma chave: cofre do macOS no darwin; nos demais sistemas, o arquivo de segredos (permissão 600 onde o sistema respeita; no Windows use variável de ambiente). Devolve onde guardou. */
export function guardarChave(ref, chave) {
  ref = canonica(ref);
  if (chaveiroAtivo()) {
    execFileSync("security", ["add-generic-password", "-U", "-s", SERVICO_CHAVEIRO, "-a", ref, "-w", chave], { stdio: ["ignore", "ignore", "pipe"] });
    return "chaveiro";
  }
  const f = arquivoSegredos();
  mkdirSync(dirname(f), { recursive: true });
  const s = lerSegredos(); s[ref] = chave;
  writeFileSync(f, JSON.stringify(s, null, 2) + "\n", { mode: 0o600 });
  if (process.platform !== "win32") chmodSync(f, 0o600);
  return "arquivo";
}

/** Mascara uma chave para logs. */
export const mascarar = (k) => (k ? `${k.slice(0, 3)}…${k.slice(-2)}` : "(sem chave)");

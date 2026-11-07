// Segredos do Praeko (chaves de API, tokens OAuth). Ordem de leitura: ambiente → Chaveiro do macOS → arquivo 600.
// `ref` é um nome como "buffer/principal" ou "youtube/token". Valores são texto (os tokens são JSON em texto).
//
// Renomeação Arauto → Praeko (docs/renomeacao-praeko.md): o serviço do Chaveiro passa de `arauto` para `praeko` (a conta `arauto/chave` vira `praeko/chave`),
// as variáveis de ambiente de ARAUTO_* para PRAEKO_* e o arquivo de ~/.config/arauto para ~/.config/praeko. LEITURA: o novo e, se não houver, o antigo.
// ESCRITA: só o novo. `migrar()` (praeko keys migrate) copia do antigo para o novo sem mostrar valor algum.
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const SERVICO = "praeko", SERVICO_ANTIGO = "arauto";
/** Refs que o Praeko usa (e que `migrar` copia). O Chaveiro não lista contas sem expor valores, então a lista é fixa. */
export const REFS_CONHECIDAS = ["praeko/chave", "buffer/principal", "youtube/cliente", "youtube/token", "instagram/token", "instagram/meta", "tiktok/cliente", "tiktok/token", "tiktok/pendente"];
/** `praeko/chave` → `arauto/chave` (a única conta que levava o nome do produto); as outras refs não mudaram. */
export const refAntiga = (ref: any) => (ref.startsWith("praeko/") ? "arauto/" + ref.slice("praeko/".length) : ref);

const sufixoEnv = (ref: any) => ref.toUpperCase().replace(/[^A-Z0-9]/g, "_");
export const envDe = (ref: any) => `PRAEKO_KEY_${sufixoEnv(ref)}`;
export const envAntigaDe = (ref: any) => `ARAUTO_KEY_${sufixoEnv(refAntiga(ref))}`;
/** PRAEKO_SEM_CHAVEIRO=1 (ou o antigo ARAUTO_SEM_CHAVEIRO) ignora o Chaveiro: só ambiente e arquivo (testes, Linux). */
export const semChaveiro = (env = process.env) => !!(env.PRAEKO_SEM_CHAVEIRO || env.ARAUTO_SEM_CHAVEIRO);
/** O Chaveiro do macOS (comando `security`). É um objeto para os testes trocarem por um dublê em memória: nada aqui precisa do Mac de verdade. */
export const chaveiro = {
  ativo: () => process.platform === "darwin" && !semChaveiro(),
  ler(servico: any, ref: any) { try { return execFileSync("security", ["find-generic-password", "-s", servico, "-a", ref, "-w"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || null; } catch { return null; /* não está no Chaveiro */ } },
  gravar(servico: any, ref: any, valor: any) { execFileSync("security", ["add-generic-password", "-U", "-s", servico, "-a", ref, "-w", valor], { stdio: ["ignore", "ignore", "pipe"] }); },
};

/** Onde o arquivo mora: PRAEKO_SEGREDOS (ou o antigo ARAUTO_SEGREDOS, que continua indicando o arquivo escolhido) ou ~/.config/praeko/segredos.json. */
export const arquivoSegredos = () => process.env.PRAEKO_SEGREDOS || process.env.ARAUTO_SEGREDOS || join(homedir(), ".config", "praeko", "segredos.json");
export const arquivoSegredosAntigo = () => join(homedir(), ".config", "arauto", "segredos.json");

const lerArquivo = (f = arquivoSegredos()) => { if (!existsSync(f)) return {}; try { return JSON.parse(readFileSync(f, "utf8")); } catch { return {}; } };

/** Só os lugares NOVOS: ambiente PRAEKO_KEY_*, Chaveiro (serviço praeko) e arquivo novo. */
export function obterNovo(ref: any) {
  if (process.env[envDe(ref)]) return process.env[envDe(ref)];
  if (chaveiro.ativo()) { const k = chaveiro.ler(SERVICO, ref); if (k) return k; }
  return lerArquivo()[ref] ?? null;
}
/** Só o que estava guardado ANTES (Chaveiro do serviço arauto, conta `arauto/…`, e ~/.config/arauto). Variável de ambiente não entra: é decisão de quem a definiu. */
export function obterAntigoGuardado(ref: any) {
  const velha = refAntiga(ref);
  if (chaveiro.ativo()) { const k = chaveiro.ler(SERVICO_ANTIGO, velha); if (k) return k; }
  return lerArquivo(arquivoSegredos())[velha] ?? lerArquivo(arquivoSegredosAntigo())[velha] ?? null;
}
/** Todos os lugares ANTIGOS (de antes da renomeação): ambiente ARAUTO_KEY_* e o guardado. */
export const obterAntigo = (ref: any) => process.env[envAntigaDe(ref)] || obterAntigoGuardado(ref);
/** O novo vence; se não houver, o antigo. */
export const obter = (ref: any) => obterNovo(ref) ?? obterAntigo(ref);

/** Grava SÓ no lugar novo (serviço `praeko` do Chaveiro, ou o arquivo). Devolve onde guardou. */
export function guardar(ref: any, valor: any) {
  if (chaveiro.ativo()) { chaveiro.gravar(SERVICO, ref, valor); return "chaveiro"; }
  const f = arquivoSegredos();
  mkdirSync(dirname(f), { recursive: true });
  const s = lerArquivo(); s[ref] = valor;
  writeFileSync(f, JSON.stringify(s, null, 2) + "\n", { mode: 0o600 });
  chmodSync(f, 0o600);
  return "arquivo";
}
export const segredos = { obter, guardar, obterNovo, obterAntigo, obterAntigoGuardado };

/**
 * Copia do Chaveiro/arquivo antigo para o novo o que ainda não existe no novo. NUNCA devolve nem imprime valor: só os nomes das refs.
 * `loja`: qualquer objeto com { obterNovo(ref), obterAntigoGuardado(ref), guardar(ref, valor) } (o padrão é `segredos`; os testes passam um dublê).
 * Devolve { copiados, jaNoNovo, ausentes } (listas de refs). Idempotente. O antigo não é apagado.
 */
export function migrar(loja: any = segredos, refs: readonly string[] = REFS_CONHECIDAS) {
  const r: { copiados: string[]; jaNoNovo: string[]; ausentes: string[] } = { copiados: [], jaNoNovo: [], ausentes: [] };
  for (const ref of refs) {
    if (loja.obterNovo(ref)) { r.jaNoNovo.push(ref); continue; }
    const v = loja.obterAntigoGuardado(ref);
    if (!v) { r.ausentes.push(ref); continue; }
    loja.guardar(ref, v); r.copiados.push(ref);
  }
  return r;
}
export const mascarar = (k: any) => (k ? `${k.slice(0, 3)}…${k.slice(-2)}` : "(sem chave)");

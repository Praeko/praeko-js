// Mastodon (docs/mastodon.md): descoberta da instância, registro do app por instância e OAuth authorization code (PKCE S256 quando a instância suporta). SEM Node: só fetch.
// Fontes oficiais lidas em 21/11/2026 (docs.joinmastodon.org: methods/oauth, methods/apps, methods/instance, api/oauth-scopes). Nada aqui grava nada: quem chama (servidor) guarda segredos e tokens.
// Toda busca para uma instância passa por `buscar`: só https, sem IP literal, sem porta, sem credenciais na URL, sem localhost/host interno, redirecionamento revalidado, tempo e tamanho limitados.
import { hostPermitido } from "./bluesky-oauth.ts";
export { aleatorioB64, desafioPkce } from "./bluesky-oauth.ts";

export const NOME_APP = "Praeko";
const LIMITE_CORPO = 1024 * 1024, TEMPO_MS = 8000, MAX_REDIRECIONAMENTOS = 3;
/** Escopos mínimos: criar/apagar status e subir mídia, mais ler a PRÓPRIA conta (`profile` desde o 4.3.0; `read:accounts` antes). */
export const ESCOPOS_NOVOS = "profile write:statuses write:media", ESCOPOS_ANTIGOS = "read:accounts write:statuses write:media";

/** Erro tipado: `status` (HTTP a devolver) e `codigo` estável (mastodon_*; `rede_nao_suporta_kind` é o código geral do contrato). */
export const falha = (status: number, codigo: string, mensagem: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(mensagem), { status, codigo, ...extra });

// ---------- domínio informado pela pessoa ----------
/** "mastodon.social", "@ana@mastodon.social", "ana@mastodon.social", "https://mastodon.social/@ana" -> "mastodon.social" (minúsculo, sem porta). Recusa IP, localhost, porta, credenciais e hosts internos (422). */
export function normalizarDominio(bruto: unknown): string {
  let s = String(bruto ?? "").trim();
  if (!s || s.length > 300) throw falha(422, "mastodon_invalid_domain", "informe o domínio da sua instância (ex.: mastodon.social)");
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, (m) => (/^https:\/\//i.test(m) ? "" : "\u0000")); // só https (ou sem esquema); http e outros esquemas viram lixo e caem abaixo
  if (s.includes("\u0000")) throw falha(422, "mastodon_invalid_domain", "só https é aceito: informe só o domínio (ex.: mastodon.social)");
  s = s.split(/[/?#]/, 1)[0]!; // tira caminho, consulta e fragmento
  if (s.includes("@")) { // @usuario@dominio ou usuario@dominio: vale o que vem depois do último @; "usuario:senha@host" tem ":" antes e é recusado abaixo
    const antes = s.slice(0, s.lastIndexOf("@"));
    if (antes.includes(":")) throw falha(422, "mastodon_invalid_domain", "o domínio não pode levar usuário e senha");
    s = s.slice(s.lastIndexOf("@") + 1);
  }
  if (!s || /[\s\\]/.test(s)) throw falha(422, "mastodon_invalid_domain", "domínio inválido");
  if (s.includes(":") || s.startsWith("[")) throw falha(422, "mastodon_invalid_domain", "o domínio não pode ter porta nem ser um endereço IP");
  let host: string;
  try { host = new URL(`https://${s}`).hostname.toLowerCase().replace(/\.$/, ""); } catch { throw falha(422, "mastodon_invalid_domain", "domínio inválido"); }
  if (!hostPermitido(host)) throw falha(422, "mastodon_invalid_domain", `domínio não aceito: ${host.slice(0, 80)} (use o nome público da instância)`);
  return host;
}
/** URL https:// da instância. Revalida o host (defesa em profundidade: o domínio vem do D1 ou do usuário). */
export function urlDaInstancia(dominio: string, caminho = ""): URL {
  const host = normalizarDominio(dominio);
  if (host !== dominio) throw falha(422, "mastodon_invalid_domain", "domínio fora do formato normalizado");
  return new URL(`https://${host}${caminho}`);
}
function urlPermitida(u: string | URL): URL {
  let url: URL;
  try { url = new URL(String(u)); } catch { throw falha(502, "mastodon_discovery_failed", `URL inválida: ${String(u).slice(0, 80)}`); }
  if (url.protocol !== "https:") throw falha(502, "mastodon_discovery_failed", `só https é aceito (${url.protocol})`);
  if (url.username || url.password || (url.port && url.port !== "443")) throw falha(502, "mastodon_discovery_failed", "a URL não pode ter credenciais nem porta");
  if (!hostPermitido(url.hostname)) throw falha(502, "mastodon_discovery_failed", `host recusado: ${url.hostname}`);
  return url;
}
/** URL de mídia (avatar) vinda da instância: só https, host público, sem porta e sem credenciais; senão null (o servidor busca esta URL depois, então ela passa pela mesma regra de SSRF). */
export function urlPublicaOuNula(u: unknown): string | null {
  try { const x = new URL(String(u)); return x.protocol === "https:" && !x.username && !x.password && (!x.port || x.port === "443") && hostPermitido(x.hostname) ? x.href : null; } catch { return null; }
}
async function lerLimitado(r: Response): Promise<string> {
  if (Number(r.headers.get("content-length") || 0) > LIMITE_CORPO) throw falha(502, "mastodon_discovery_failed", "resposta grande demais");
  if (!r.body) return await r.text();
  const leitor = r.body.getReader(), partes: Uint8Array[] = []; let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.length;
    if (total > LIMITE_CORPO) { try { await leitor.cancel(); } catch { /* já encerrou */ } throw falha(502, "mastodon_discovery_failed", "resposta grande demais"); }
    partes.push(value);
  }
  const todo = new Uint8Array(total); let o = 0; for (const p of partes) { todo.set(p, o); o += p.length; }
  return new TextDecoder().decode(todo);
}
/** fetch para a instância: valida a URL, segue até 3 redirecionamentos revalidando cada um (só https, mesmo critério de host), tempo 8 s e corpo até 1 MB. Nunca devolve o corpo em erro de rede. */
export async function buscar(fetchFn: typeof fetch, url: string, init: RequestInit = {}): Promise<{ status: number; headers: Headers; texto: string; ok: boolean }> {
  let atual = urlPermitida(url);
  for (let i = 0; i <= MAX_REDIRECIONAMENTOS; i++) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), TEMPO_MS);
    try {
      const r = await fetchFn(atual.href, { ...init, redirect: "manual", signal: ac.signal });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
        if (i === MAX_REDIRECIONAMENTOS) throw falha(502, "mastodon_discovery_failed", "redirecionamentos demais");
        atual = urlPermitida(new URL(r.headers.get("location")!, atual));
        continue; // 307/308 repetiriam o corpo: a descoberta só usa GET; chamadas com corpo não seguem (ver `chamar`)
      }
      return { status: r.status, headers: r.headers, texto: await lerLimitado(r), ok: r.ok };
    } catch (e) {
      if (e?.codigo) throw e;
      throw falha(502, "mastodon_discovery_failed", e?.name === "AbortError" ? `tempo esgotado falando com ${atual.hostname}` : `não consegui falar com ${atual.hostname}`);
    } finally { clearTimeout(t); }
  }
  throw falha(502, "mastodon_discovery_failed", "redirecionamentos demais");
}
const jsonDe = (t: string): any => { try { return JSON.parse(t); } catch { return null; } };

// ---------- instância ----------
export type Limites = { maxCaracteres: number; maxMidias: number; caracteresPorUrl: number; descricaoMax: number; imagemBytes: number; mimesImagem: string[] };
export type Instancia = { dominio: string; versao: string; limites: Limites; lidoEm: number };
const PADRAO: Limites = { maxCaracteres: 500, maxMidias: 4, caracteresPorUrl: 23, descricaoMax: 1500, imagemBytes: 16 * 1024 * 1024, mimesImagem: ["image/jpeg", "image/png", "image/gif", "image/webp"] };
const inteiro = (x: unknown, padrao: number, min = 1): number => (Number.isFinite(Number(x)) && Number(x) >= min ? Math.floor(Number(x)) : padrao);

/** Forks que imitam parte da API (escopo de suporte: só Mastodon). O `version` deles costuma trazer "compatible;" ou o nome do software. */
const FORKS = /compatible;|pleroma|akkoma|misskey|firefish|iceshrimp|sharkey|catodon|gotosocial|pixelfed|friendica|calckey|foundkey|honk/i;
/** "4.3.0", "4.4.0-alpha.1", "4.3.2+glitch" -> [4,3,2]; senão null. */
export const versaoNumerica = (v: string): [number, number, number] | null => { const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v).trim()); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null; };
export const versaoAtLeast = (v: string, minimo: [number, number, number]): boolean => {
  const n = versaoNumerica(v); if (!n) return false;
  for (let i = 0; i < 3; i++) { if (n[i]! !== minimo[i]!) return n[i]! > minimo[i]!; }
  return true;
};
/** PKCE existe desde o 4.3.0 (só S256). */
export const suportaPkce = (versao: string): boolean => versaoAtLeast(versao, [4, 3, 0]);
export const escoposPara = (versao: string): string => (versaoAtLeast(versao, [4, 3, 0]) ? ESCOPOS_NOVOS : ESCOPOS_ANTIGOS);

/** Lê limites e versão do corpo de /api/v2/instance (ou /api/v1/instance). Lança 422 `mastodon_not_a_mastodon_instance` se não parece uma instância Mastodon. */
export function interpretarInstancia(dominio: string, j: any, agora: number): Instancia {
  const versao = typeof j?.version === "string" ? j.version : "";
  if (!j || typeof j !== "object" || !versao || !versaoNumerica(versao)) throw falha(422, "mastodon_not_a_mastodon_instance", `${dominio} não respondeu como uma instância Mastodon (sem versão reconhecível)`);
  if (FORKS.test(versao)) throw falha(422, "mastodon_not_a_mastodon_instance", `${dominio} parece ser um servidor compatível, não Mastodon (${versao.slice(0, 60)}): o Praeko só suporta Mastodon`);
  const st = j.configuration?.statuses || {}, md = j.configuration?.media_attachments || {};
  const mimes = Array.isArray(md.supported_mime_types) ? md.supported_mime_types.filter((m: unknown) => typeof m === "string" && m.startsWith("image/")) : PADRAO.mimesImagem;
  return { dominio, versao: versao.slice(0, 60), lidoEm: agora, limites: {
    maxCaracteres: inteiro(st.max_characters ?? j.max_toot_chars, PADRAO.maxCaracteres), maxMidias: inteiro(st.max_media_attachments, PADRAO.maxMidias),
    caracteresPorUrl: inteiro(st.characters_reserved_per_url, PADRAO.caracteresPorUrl, 0), descricaoMax: inteiro(md.description_limit, PADRAO.descricaoMax),
    imagemBytes: inteiro(md.image_size_limit, PADRAO.imagemBytes), mimesImagem: mimes.length ? mimes : PADRAO.mimesImagem,
  } };
}
/** GET /api/v2/instance (cai em /api/v1/instance se a v2 não existir, instância antiga). */
export async function lerInstancia(f: typeof fetch, dominio: string, agora = Date.now()): Promise<Instancia> {
  const base = urlDaInstancia(dominio);
  let r = await buscar(f, new URL("/api/v2/instance", base).href, { headers: { accept: "application/json" } });
  if (r.status === 404) r = await buscar(f, new URL("/api/v1/instance", base).href, { headers: { accept: "application/json" } });
  const j = r.ok ? jsonDe(r.texto) : null;
  if (!j) throw falha(422, "mastodon_not_a_mastodon_instance", `${dominio} não respondeu como uma instância Mastodon (HTTP ${r.status})`);
  return interpretarInstancia(dominio, j, agora);
}
/** PKCE S256 declarado pela instância (`/.well-known/oauth-authorization-server`, 4.3.0+) ou implícito pela versão. Melhor esforço: falha de rede cai na regra da versão. */
export async function pkceDisponivel(f: typeof fetch, dominio: string, versao: string): Promise<boolean> {
  if (!suportaPkce(versao)) return false;
  try {
    const r = await buscar(f, urlDaInstancia(dominio, "/.well-known/oauth-authorization-server").href, { headers: { accept: "application/json" } });
    const m = r.ok ? jsonDe(r.texto)?.code_challenge_methods_supported : null;
    return Array.isArray(m) ? m.includes("S256") : true;
  } catch { return true; }
}

// ---------- app e OAuth ----------
const formulario = (o: Record<string, string>) => new URLSearchParams(o).toString();
const HFORM = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
/** Erro de um corpo de resposta do Mastodon (`{error, error_description}`), sem eco de segredo. */
const msgDe = (texto: string): string => { const j = jsonDe(texto); return String(j?.error_description || j?.error || texto || "").slice(0, 200); };

/** POST /api/v1/apps: registra o app NESTA instância. Devolve client_id e client_secret (o chamador guarda o segredo cifrado). */
export async function registrarApp(f: typeof fetch, { dominio, redirect, escopos, site }: { dominio: string; redirect: string; escopos: string; site: string }): Promise<{ clientId: string; clientSecret: string }> {
  const r = await buscar(f, urlDaInstancia(dominio, "/api/v1/apps").href, { method: "POST", headers: HFORM, body: formulario({ client_name: NOME_APP, redirect_uris: redirect, scopes: escopos, website: site }) });
  const j = r.ok ? jsonDe(r.texto) : null;
  if (!j?.client_id || !j?.client_secret) throw falha(r.status === 429 ? 429 : 502, r.status === 429 ? "mastodon_rate_limited" : "mastodon_app_registration_failed", `a instância ${dominio} não registrou o app do Praeko (HTTP ${r.status}): ${msgDe(r.texto)}`);
  return { clientId: String(j.client_id), clientSecret: String(j.client_secret) };
}
export function urlAutorizacao({ dominio, clientId, redirect, escopos, estado, desafio }: { dominio: string; clientId: string; redirect: string; escopos: string; estado: string; desafio: string | null }): string {
  const u = urlDaInstancia(dominio, "/oauth/authorize");
  u.searchParams.set("client_id", clientId); u.searchParams.set("redirect_uri", redirect); u.searchParams.set("response_type", "code"); u.searchParams.set("scope", escopos); u.searchParams.set("state", estado);
  if (desafio) { u.searchParams.set("code_challenge", desafio); u.searchParams.set("code_challenge_method", "S256"); }
  return u.href;
}
/** POST /oauth/token (authorization_code). Confere token_type Bearer e que os escopos de escrita vieram. Não loga nada. */
export async function trocarCodigo(f: typeof fetch, { dominio, clientId, clientSecret, redirect, codigo, verificador, escopos }: { dominio: string; clientId: string; clientSecret: string; redirect: string; codigo: string; verificador: string | null; escopos: string }): Promise<{ accessToken: string; scope: string }> {
  const corpo: Record<string, string> = { grant_type: "authorization_code", code: codigo, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, scope: escopos };
  if (verificador) corpo.code_verifier = verificador;
  const r = await buscar(f, urlDaInstancia(dominio, "/oauth/token").href, { method: "POST", headers: HFORM, body: formulario(corpo) });
  const j = r.ok ? jsonDe(r.texto) : null;
  if (!j?.access_token) throw falha(r.status === 400 || r.status === 401 ? 400 : 502, "mastodon_oauth_failed", `a instância recusou o código de autorização (HTTP ${r.status}): ${msgDe(r.texto)}`);
  if (j.token_type && String(j.token_type).toLowerCase() !== "bearer") throw falha(502, "mastodon_oauth_failed", "a instância devolveu um tipo de token inesperado");
  const scope = String(j.scope || escopos);
  const tem = new Set(scope.split(/\s+/));
  if (!tem.has("write:statuses") && !tem.has("write")) throw falha(422, "mastodon_scope_missing", "a instância não concedeu a permissão de publicar (write:statuses)");
  return { accessToken: String(j.access_token), scope };
}
/** GET /api/v1/accounts/verify_credentials: a conta dona do token (id, username, acct, nome, avatar, url). */
export async function contaDoToken(f: typeof fetch, dominio: string, token: string): Promise<{ id: string; username: string; acct: string; nome: string | null; avatar: string | null; url: string | null }> {
  const r = await buscar(f, urlDaInstancia(dominio, "/api/v1/accounts/verify_credentials").href, { headers: { accept: "application/json", authorization: `Bearer ${token}` } });
  const j = r.ok ? jsonDe(r.texto) : null;
  if (!j?.id || !j?.username) throw falha(r.status === 401 || r.status === 403 ? 401 : 502, r.status === 401 || r.status === 403 ? "mastodon_reconnect_required" : "mastodon_error", `não consegui ler a conta na instância (HTTP ${r.status})`);
  return { id: String(j.id), username: String(j.username), acct: String(j.acct || j.username), nome: j.display_name ? String(j.display_name).slice(0, 120) : null, avatar: urlPublicaOuNula(j.avatar), url: typeof j.url === "string" ? j.url : null };
}
/** POST /oauth/revoke (melhor esforço; nunca lança). */
export async function revogarToken(f: typeof fetch, { dominio, clientId, clientSecret, token }: { dominio: string; clientId: string; clientSecret: string; token: string }): Promise<boolean> {
  try {
    const r = await buscar(f, urlDaInstancia(dominio, "/oauth/revoke").href, { method: "POST", headers: HFORM, body: formulario({ client_id: clientId, client_secret: clientSecret, token }) });
    return r.ok;
  } catch { return false; }
}

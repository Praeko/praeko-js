// OAuth do atproto (Bluesky) SEM Node: só fetch e WebCrypto. Cliente CONFIDENCIAL (private_key_jwt, ES256) com PKCE S256, PAR e DPoP com nonce.
// Especificação lida em 21/11/2026: atproto.com/specs/oauth e atproto.com/guides/sdk-auth. Nada aqui grava nada: quem chama (servidor) guarda os tokens.
// Toda busca de rede da descoberta passa por `buscarSeguro`: só https, sem IP literal, sem localhost/host interno, redirecionamento revalidado, tempo e tamanho limitados.
export const ESCOPO = "atproto transition:generic";
export const TIPO_ASSERTION = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
const LIMITE_CORPO = 1024 * 1024, TEMPO_MS = 8000, MAX_REDIRECIONAMENTOS = 3;

/** Erro de OAuth/descoberta com código estável (o servidor o traduz em HTTP). */
export const erroOauth = (codigo: string, mensagem: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(mensagem), { codigo, ...extra });

// ---------- utilidades ----------
export const b64url = (bytes: any): string => { const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); let s = ""; for (const b of u) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const b64urlTexto = (s: string) => b64url(new TextEncoder().encode(s));
export const aleatorioB64 = (n: number) => b64url(crypto.getRandomValues(new Uint8Array(n)));
export const desafioPkce = async (verificador: string) => b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verificador)));

// ---------- proteção SSRF ----------
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
/** Host aceito para buscas de saída: nome DNS público. Recusa IP literal (v4 e v6), localhost e sufixos internos. (O Worker não vê o DNS: um nome que resolva para IP privado não é detectável aqui; a Cloudflare também bloqueia saída para a rede dela.) */
export function hostPermitido(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (!h || h.includes(":") || h.startsWith("[") || IPV4.test(h) || /^\d+$/.test(h) || /^0x[0-9a-f]+$/i.test(h)) return false; // IP literal em qualquer forma
  if (h === "localhost" || !h.includes(".")) return false;
  return !/\.(localhost|local|internal|intranet|lan|home|corp|private|test|invalid|example)$/.test(h);
}
export function urlPermitida(u: string | URL): URL {
  let url: URL;
  try { url = new URL(String(u)); } catch { throw erroOauth("bluesky_discovery_failed", `URL inválida na descoberta: ${String(u).slice(0, 80)}`); }
  if (url.protocol !== "https:") throw erroOauth("bluesky_discovery_failed", `só https é aceito na descoberta (${url.protocol})`);
  if (url.username || url.password || (url.port && url.port !== "443")) throw erroOauth("bluesky_discovery_failed", "a descoberta recusa credenciais e porta na URL");
  if (!hostPermitido(url.hostname)) throw erroOauth("bluesky_discovery_failed", `host recusado na descoberta: ${url.hostname}`);
  return url;
}

async function lerLimitado(r: Response, limite = LIMITE_CORPO): Promise<string> {
  const decl = Number(r.headers.get("content-length") || 0);
  if (decl > limite) throw erroOauth("bluesky_discovery_failed", "resposta grande demais na descoberta");
  if (!r.body) return await r.text();
  const leitor = r.body.getReader(), partes: Uint8Array[] = []; let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.length;
    if (total > limite) { try { await leitor.cancel(); } catch { /* já encerrou */ } throw erroOauth("bluesky_discovery_failed", "resposta grande demais na descoberta"); }
    partes.push(value);
  }
  const todo = new Uint8Array(total); let o = 0; for (const p of partes) { todo.set(p, o); o += p.length; }
  return new TextDecoder().decode(todo);
}

/** fetch de descoberta/OAuth: valida a URL, segue até 3 redirecionamentos revalidando cada um, com tempo e tamanho limitados. Devolve { status, headers, texto }. */
export async function buscarSeguro(fetchFn: typeof fetch, url: string, init: RequestInit = {}): Promise<{ status: number; headers: Headers; texto: string; ok: boolean }> {
  let atual = urlPermitida(url);
  for (let i = 0; i <= MAX_REDIRECIONAMENTOS; i++) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), TEMPO_MS);
    try {
      const r = await fetchFn(atual.href, { ...init, redirect: "manual", signal: ac.signal });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
        if (i === MAX_REDIRECIONAMENTOS) throw erroOauth("bluesky_discovery_failed", "redirecionamentos demais na descoberta");
        atual = urlPermitida(new URL(r.headers.get("location")!, atual)); // o destino do redirecionamento passa pela mesma regra
        continue;
      }
      return { status: r.status, headers: r.headers, texto: await lerLimitado(r), ok: r.ok };
    } catch (e) {
      if (e?.codigo) throw e;
      throw erroOauth("bluesky_discovery_failed", e?.name === "AbortError" ? `tempo esgotado falando com ${atual.hostname}` : `não consegui falar com ${atual.hostname}`);
    } finally { clearTimeout(t); }
  }
  throw erroOauth("bluesky_discovery_failed", "redirecionamentos demais na descoberta");
}
const jsonDe = (texto: string): any => { try { return JSON.parse(texto); } catch { return null; } };
const buscarJson = async (fetchFn: typeof fetch, url: string): Promise<any> => {
  const r = await buscarSeguro(fetchFn, url, { headers: { accept: "application/json" } });
  const j = r.ok ? jsonDe(r.texto) : null;
  if (!j || typeof j !== "object") throw erroOauth("bluesky_discovery_failed", `resposta inesperada de ${new URL(url).hostname} (${r.status})`);
  return j;
};

// ---------- descoberta: handle/DID -> documento -> PDS -> servidor de autorização ----------
const RE_HANDLE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const RE_DID = /^did:(plc:[a-z2-7]{24}|web:[a-z0-9.-]+)$/i;
/** O que a pessoa digitou -> { handle } ou { did }. Aceita "@ana.bsky.social", "at://ana.bsky.social" e o DID (did:plc ou did:web sem caminho). */
export function normalizarEntrada(bruto: unknown): { handle?: string; did?: string } {
  let s = typeof bruto === "string" ? bruto.trim() : "";
  s = s.replace(/^at:\/\//i, "").replace(/^@+/, "");
  if (/^did:/i.test(s)) { if (!RE_DID.test(s)) throw erroOauth("bluesky_invalid_handle", "DID não suportado (use did:plc ou did:web)"); return { did: s.replace(/^DID:/, "did:") }; }
  s = s.toLowerCase();
  if (!RE_HANDLE.test(s)) throw erroOauth("bluesky_invalid_handle", "handle inválido: use algo como ana.bsky.social");
  return { handle: s };
}

const COM_DID = (r: string | null | undefined) => (r && RE_DID.test(r.trim()) ? r.trim() : null);
export async function resolverHandle(fetchFn: typeof fetch, handle: string): Promise<string> {
  const viaApi = async () => {
    const r = await buscarSeguro(fetchFn, `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`, { headers: { accept: "application/json" } });
    return r.ok ? COM_DID(jsonDe(r.texto)?.did) : null;
  };
  const viaWellKnown = async () => {
    const r = await buscarSeguro(fetchFn, `https://${handle}/.well-known/atproto-did`);
    return r.ok ? COM_DID(r.texto.split(/\r?\n/)[0]) : null;
  };
  const ordem = handle.endsWith(".bsky.social") ? [viaApi, viaWellKnown] : [viaWellKnown, viaApi]; // DNS TXT não existe no Worker: a API pública cobre os handles que só têm TXT
  for (const f of ordem) { try { const did = await f(); if (did) return did; } catch (e) { if (e?.codigo !== "bluesky_discovery_failed") throw e; } }
  throw erroOauth("bluesky_handle_not_found", `não achei o handle ${handle} no Bluesky`);
}

export async function documentoDid(fetchFn: typeof fetch, did: string): Promise<any> {
  const url = did.startsWith("did:plc:") ? `https://plc.directory/${did}` : `https://${did.slice("did:web:".length)}/.well-known/did.json`;
  const doc = await buscarJson(fetchFn, url);
  if (doc.id !== did) throw erroOauth("bluesky_discovery_failed", "o documento do DID não é do DID pedido");
  return doc;
}
/** serviceEndpoint do serviço `#atproto_pds` (https, só origem). */
export function pdsDoDocumento(doc: any): string {
  const s = (doc.service || []).find((x: any) => (x.id === "#atproto_pds" || x.id === `${doc.id}#atproto_pds`) && x.type === "AtprotoPersonalDataServer");
  if (!s || typeof s.serviceEndpoint !== "string") throw erroOauth("bluesky_discovery_failed", "o documento do DID não tem servidor de dados (PDS)");
  const u = urlPermitida(s.serviceEndpoint);
  return u.origin;
}
export type Servidor = { issuer: string; par: string; autorizacao: string; token: string; revogacao: string | null };
/** PDS -> /.well-known/oauth-protected-resource -> servidor de autorização -> metadados (validados). */
export async function servidorDeAutorizacao(fetchFn: typeof fetch, pds: string): Promise<Servidor> {
  const recurso = await buscarJson(fetchFn, `${pds}/.well-known/oauth-protected-resource`);
  const issuer = Array.isArray(recurso.authorization_servers) ? recurso.authorization_servers[0] : null;
  if (typeof issuer !== "string") throw erroOauth("bluesky_discovery_failed", "o PDS não informou o servidor de autorização");
  return metadadosDoServidor(fetchFn, issuer);
}
/** Metadados (validados) de um servidor de autorização, a partir do issuer. */
export async function metadadosDoServidor(fetchFn: typeof fetch, issuer: string): Promise<Servidor> {
  const base = urlPermitida(issuer);
  const m = await buscarJson(fetchFn, `${base.origin}/.well-known/oauth-authorization-server`);
  if (m.issuer !== base.origin && m.issuer !== issuer) throw erroOauth("bluesky_discovery_failed", "o issuer do servidor de autorização não bate com o anunciado pelo PDS");
  const exigidos = ["pushed_authorization_request_endpoint", "authorization_endpoint", "token_endpoint"];
  for (const k of exigidos) if (typeof m[k] !== "string") throw erroOauth("bluesky_discovery_failed", `o servidor de autorização não anunciou ${k}`);
  if (Array.isArray(m.dpop_signing_alg_values_supported) && !m.dpop_signing_alg_values_supported.includes("ES256")) throw erroOauth("bluesky_discovery_failed", "o servidor de autorização não aceita DPoP ES256");
  if (Array.isArray(m.code_challenge_methods_supported) && !m.code_challenge_methods_supported.includes("S256")) throw erroOauth("bluesky_discovery_failed", "o servidor de autorização não aceita PKCE S256");
  for (const k of [...exigidos, "revocation_endpoint"]) if (typeof m[k] === "string") urlPermitida(m[k]);
  return { issuer: m.issuer, par: m.pushed_authorization_request_endpoint, autorizacao: m.authorization_endpoint, token: m.token_endpoint, revogacao: typeof m.revocation_endpoint === "string" ? m.revocation_endpoint : null };
}
/** Sem handle: entra pelo servidor da Bluesky (bsky.social), que pergunta quem é a pessoa na própria tela. O DID só aparece no retorno (`sub`) e é verificado lá (ver `conferirSub`). */
export async function descobrirEntryway(fetchFn: typeof fetch, issuer = "https://bsky.social"): Promise<Identidade> {
  // o bsky.social é o próprio servidor de autorização (não tem /oauth-protected-resource): lê os metadados dele direto
  return { did: "", handle: null, pds: issuer, servidor: await metadadosDoServidor(fetchFn, issuer) };
}
/** Retorno sem handle: o `sub` vira identidade (documento do DID) e o servidor de autorização dela PRECISA ser o mesmo que a pessoa usou; senão qualquer servidor poderia afirmar ser outra conta. */
export async function conferirSub(fetchFn: typeof fetch, sub: string, servidorUsado: Servidor): Promise<Identidade> {
  const id = await descobrir(fetchFn, sub);
  if (id.servidor.issuer !== servidorUsado.issuer) throw erroOauth("bluesky_sub_mismatch", "o servidor que autorizou não é o servidor desta conta (o DID devolvido pertence a outro servidor)");
  return id;
}
export type Identidade = { did: string; handle: string | null; pds: string; servidor: Servidor };
/** Entrada (handle ou DID) -> identidade verificada. Com handle: o documento do DID precisa listar `at://{handle}` (verificação nos dois sentidos). */
export async function descobrir(fetchFn: typeof fetch, entrada: unknown): Promise<Identidade> {
  const e = normalizarEntrada(entrada);
  const did = e.did || await resolverHandle(fetchFn, e.handle!);
  const doc = await documentoDid(fetchFn, did);
  let handle = e.handle || null;
  const nomes: string[] = (doc.alsoKnownAs || []).filter((x: unknown) => typeof x === "string" && x.startsWith("at://")).map((x: string) => x.slice(5).toLowerCase());
  if (handle && !nomes.includes(handle)) throw erroOauth("bluesky_handle_mismatch", `o DID ${did} não confirma o handle ${handle}`);
  if (!handle) handle = nomes[0] || null;
  const pds = pdsDoDocumento(doc);
  return { did, handle, pds, servidor: await servidorDeAutorizacao(fetchFn, pds) };
}

// ---------- chaves: cliente (private_key_jwt) e DPoP ----------
const ALG = { name: "ECDSA", namedCurve: "P-256" } as const;
export const publicaDe = (jwk: any) => ({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y });
export async function gerarChaveEs256(): Promise<any> {
  const par = await crypto.subtle.generateKey(ALG, true, ["sign", "verify"]) as CryptoKeyPair;
  return await crypto.subtle.exportKey("jwk", par.privateKey);
}
async function assinar(jwk: any, cabecalho: object, corpo: object): Promise<string> {
  const chave = await crypto.subtle.importKey("jwk", { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d }, ALG, false, ["sign"]);
  const dados = `${b64urlTexto(JSON.stringify(cabecalho))}.${b64urlTexto(JSON.stringify(corpo))}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, chave, new TextEncoder().encode(dados))); // WebCrypto devolve r||s: o formato do JWS ES256
  return `${dados}.${b64url(sig)}`;
}
/** O JWK privado do cliente (secret BLUESKY_CLIENT_JWK): ES256 com kid. Lança com código estável se faltar ou estiver malformado. */
export function chaveDoCliente(texto: string | undefined | null): any {
  let j: any = null; try { j = texto ? JSON.parse(texto) : null; } catch { j = null; }
  if (!j || j.kty !== "EC" || j.crv !== "P-256" || !j.d || !j.x || !j.y || !j.kid) throw erroOauth("bluesky_not_configured", "defina o secret BLUESKY_CLIENT_JWK do Worker (JWK ES256 com kid; scripts/bluesky-gerar-chave.mjs)");
  return j;
}
export const jwksPublico = (jwk: any) => ({ keys: [{ ...publicaDe(jwk), kid: jwk.kid, use: "sig", alg: "ES256" }] });
/** client_assertion do private_key_jwt (válido por 60 s). */
export const assertionDoCliente = (jwk: any, clientId: string, issuer: string, agora = Date.now()) =>
  assinar(jwk, { alg: "ES256", kid: jwk.kid, typ: "JWT" }, { iss: clientId, sub: clientId, aud: issuer, jti: aleatorioB64(16), iat: Math.floor(agora / 1000), exp: Math.floor(agora / 1000) + 60 });

/** URL sem consulta nem fragmento (o `htu` do DPoP). */
export const htu = (u: string) => { const x = new URL(u); x.search = ""; x.hash = ""; return x.href; };
/** Prova DPoP (RFC 9449). `ath` = SHA-256 do access token quando a chamada o leva. */
export async function provaDpop(jwk: any, { metodo, url, nonce, token, agora = Date.now() }: { metodo: string; url: string; nonce?: string | null; token?: string | null; agora?: number }): Promise<string> {
  const corpo: Record<string, unknown> = { jti: aleatorioB64(16), htm: metodo.toUpperCase(), htu: htu(url), iat: Math.floor(agora / 1000) };
  if (nonce) corpo.nonce = nonce;
  if (token) corpo.ath = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return assinar(jwk, { typ: "dpop+jwt", alg: "ES256", jwk: publicaDe(jwk) }, corpo);
}

/** Nonces do servidor por origem (o mais recente de cada um). `mudou` indica se algum mudou desde que o objeto nasceu (para quem quiser persistir). */
export type Nonces = Record<string, string>;
const precisaNonce = (r: { status: number; headers: Headers; texto: string }) => {
  if (r.status !== 400 && r.status !== 401) return false;
  if (!r.headers.get("dpop-nonce")) return false;
  const www = r.headers.get("www-authenticate") || "";
  return /use_dpop_nonce/i.test(www) || jsonDe(r.texto)?.error === "use_dpop_nonce";
};
/**
 * Pedido com DPoP: manda a prova com o nonce que já conhecemos para a origem; se o servidor responder `use_dpop_nonce` (400 do servidor de autorização, 401 do PDS)
 * com o cabeçalho `DPoP-Nonce`, guarda o nonce e REPETE UMA vez. O nonce de TODA resposta é guardado. `buscar` = fetch cru (o de descoberta valida a URL; o do PDS não).
 */
export async function fetchDpop(buscar: (url: string, init: RequestInit) => Promise<{ status: number; headers: Headers; texto: string; ok: boolean }>, { url, init = {}, jwk, nonces, token = null, agora = () => Date.now() }: { url: string; init?: RequestInit; jwk: any; nonces: Nonces; token?: string | null; agora?: () => number }) {
  const origem = new URL(url).origin;
  for (let tentativa = 0; ; tentativa++) {
    const headers = new Headers(init.headers);
    headers.set("dpop", await provaDpop(jwk, { metodo: String(init.method || "GET"), url, nonce: nonces[origem], token, agora: agora() }));
    if (token) headers.set("authorization", `DPoP ${token}`);
    const r = await buscar(url, { ...init, headers });
    const novo = r.headers.get("dpop-nonce");
    if (novo) nonces[origem] = novo;
    if (tentativa === 0 && precisaNonce(r)) continue;
    return r;
  }
}

// ---------- PAR, token, refresh, revogação ----------
const formulario = (o: Record<string, string>) => new URLSearchParams(o).toString();
const FORM = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
async function postAutenticado(fetchFn: typeof fetch, { url, campos, cliente, servidor, dpopJwk, nonces, agora }: { url: string; campos: Record<string, string>; cliente: { clientId: string; jwk: any }; servidor: Servidor; dpopJwk: any; nonces: Nonces; agora?: () => number }) {
  const assertion = await assertionDoCliente(cliente.jwk, cliente.clientId, servidor.issuer, agora ? agora() : Date.now());
  const corpo = formulario({ ...campos, client_id: cliente.clientId, client_assertion_type: TIPO_ASSERTION, client_assertion: assertion });
  return fetchDpop((u, i) => buscarSeguro(fetchFn, u, i), { url, init: { method: "POST", headers: FORM, body: corpo }, jwk: dpopJwk, nonces, agora });
}
const falhaOauth = (etapa: string, r: { status: number; texto: string }) => {
  const j = jsonDe(r.texto) || {};
  return erroOauth(j.error === "invalid_grant" ? "bluesky_invalid_grant" : "bluesky_oauth_failed", `o Bluesky recusou ${etapa} (${r.status}${j.error ? ` ${String(j.error).slice(0, 40)}` : ""}${j.error_description ? `: ${String(j.error_description).slice(0, 120)}` : ""})`, { status: r.status, oauth: j.error || null });
};

/** PAR: devolve o `request_uri`. O DPoP vai na chamada (o servidor pode pedir nonce). */
export async function enviarPar(fetchFn: typeof fetch, { cliente, servidor, dpopJwk, nonces, redirect, desafio, estado, handleOuDid, agora }: { cliente: { clientId: string; jwk: any }; servidor: Servidor; dpopJwk: any; nonces: Nonces; redirect: string; desafio: string; estado: string; handleOuDid?: string | null; agora?: () => number }): Promise<string> {
  const campos: Record<string, string> = { response_type: "code", code_challenge: desafio, code_challenge_method: "S256", state: estado, redirect_uri: redirect, scope: ESCOPO, ...(handleOuDid ? { login_hint: handleOuDid } : {}) };
  const r = await postAutenticado(fetchFn, { url: servidor.par, campos, cliente, servidor, dpopJwk, nonces, agora });
  const j = jsonDe(r.texto);
  if (!r.ok || typeof j?.request_uri !== "string") throw falhaOauth("o pedido de autorização (PAR)", r);
  return j.request_uri;
}
export const urlAutorizacao = (servidor: Servidor, clientId: string, requestUri: string) => { const u = new URL(servidor.autorizacao); u.search = new URLSearchParams({ client_id: clientId, request_uri: requestUri }).toString(); return u.href; };

export type TokensBluesky = { accessToken: string; refreshToken: string; expiry: number; scope: string; sub: string };
const lerTokens = (r: { texto: string; ok: boolean; status: number }, etapa: string, agora: number): TokensBluesky => {
  const j = jsonDe(r.texto);
  if (!r.ok || !j) throw falhaOauth(etapa, r);
  if (typeof j.access_token !== "string" || typeof j.refresh_token !== "string") throw erroOauth("bluesky_oauth_failed", `o Bluesky não devolveu os tokens em ${etapa}`);
  if (String(j.token_type).toLowerCase() !== "dpop") throw erroOauth("bluesky_oauth_failed", "o Bluesky devolveu um token que não é DPoP");
  return { accessToken: j.access_token, refreshToken: j.refresh_token, expiry: agora + (Number(j.expires_in) || 1800) * 1000, scope: String(j.scope || ""), sub: String(j.sub || "") };
};
/** Troca o código. Valida `sub` (precisa ser o DID descoberto) e o escopo `atproto`. */
export async function trocarCodigo(fetchFn: typeof fetch, { cliente, servidor, dpopJwk, nonces, codigo, verificador, redirect, did, agora = () => Date.now() }: { cliente: { clientId: string; jwk: any }; servidor: Servidor; dpopJwk: any; nonces: Nonces; codigo: string; verificador: string; redirect: string; did: string; agora?: () => number }): Promise<TokensBluesky> {
  const r = await postAutenticado(fetchFn, { url: servidor.token, campos: { grant_type: "authorization_code", code: codigo, redirect_uri: redirect, code_verifier: verificador }, cliente, servidor, dpopJwk, nonces, agora });
  const t = lerTokens(r, "a troca do código", agora());
  if (did && t.sub !== did) throw erroOauth("bluesky_sub_mismatch", "a conta que autorizou não é a conta informada (o DID devolvido é outro)"); // did vazio = entrada sem handle: quem chama confere o sub com conferirSub
  if (!did && !RE_DID.test(t.sub)) throw erroOauth("bluesky_sub_mismatch", "o Bluesky devolveu um DID inválido");
  if (!t.scope.split(" ").includes("atproto")) throw erroOauth("bluesky_oauth_failed", "o Bluesky não concedeu o escopo atproto");
  return t;
}
export async function renovarTokens(fetchFn: typeof fetch, { cliente, servidor, dpopJwk, nonces, refreshToken, did, agora = () => Date.now() }: { cliente: { clientId: string; jwk: any }; servidor: Servidor; dpopJwk: any; nonces: Nonces; refreshToken: string; did: string; agora?: () => number }): Promise<TokensBluesky> {
  const r = await postAutenticado(fetchFn, { url: servidor.token, campos: { grant_type: "refresh_token", refresh_token: refreshToken }, cliente, servidor, dpopJwk, nonces, agora });
  const t = lerTokens(r, "a renovação", agora());
  if (t.sub && t.sub !== did) throw erroOauth("bluesky_sub_mismatch", "a renovação devolveu outro DID");
  return { ...t, sub: did };
}
/** Revoga o refresh token no servidor (melhor esforço: nunca lança). `true` só se o servidor confirmou. */
export async function revogarToken(fetchFn: typeof fetch, { cliente, servidor, dpopJwk, nonces, token, agora }: { cliente: { clientId: string; jwk: any }; servidor: Servidor; dpopJwk: any; nonces: Nonces; token: string; agora?: () => number }): Promise<boolean> {
  try {
    if (!servidor.revogacao) return false;
    const r = await postAutenticado(fetchFn, { url: servidor.revogacao, campos: { token, token_type_hint: "refresh_token" }, cliente, servidor, dpopJwk, nonces, agora });
    return r.ok;
  } catch { return false; }
}

// ---------- metadados do cliente (documento servido pelo próprio Praeko) ----------
export function metadadosDoCliente({ origem, clientId, nome }: { origem: string; clientId: string; nome: string }) {
  return {
    client_id: clientId, client_name: nome, client_uri: origem, application_type: "web",
    redirect_uris: [`${origem}/connections/bluesky/callback`], scope: ESCOPO,
    grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
    token_endpoint_auth_method: "private_key_jwt", token_endpoint_auth_signing_alg: "ES256", jwks_uri: `${origem}/connections/bluesky/jwks.json`,
    dpop_bound_access_tokens: true,
  };
}

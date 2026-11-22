// T-041: partes puras do provedor do Bluesky (entrada, SSRF, facets, DPoP). O fluxo completo com rede falsa fica nos testes do servidor.
import test from "node:test";
import assert from "node:assert/strict";
import * as bo from "../src/provedores/bluesky-oauth.ts";
import * as bs from "../src/provedores/bluesky-api.ts";

test("normalizarEntrada: handle (com @, maiúsculas, at://), DID plc/web; o resto é recusado", () => {
  assert.deepEqual(bo.normalizarEntrada(" @Ana.Bsky.Social "), { handle: "ana.bsky.social" });
  assert.deepEqual(bo.normalizarEntrada("at://ana.bsky.social"), { handle: "ana.bsky.social" });
  assert.deepEqual(bo.normalizarEntrada("did:plc:abcdefghijklmnopqrstuvwx"), { did: "did:plc:abcdefghijklmnopqrstuvwx" });
  assert.deepEqual(bo.normalizarEntrada("did:web:exemplo.com.br"), { did: "did:web:exemplo.com.br" });
  for (const ruim of ["", "ana", "ana bsky", "did:key:zzz", "did:web:x.com:caminho", "http://x.com", null, 3]) assert.throws(() => bo.normalizarEntrada(ruim), (e) => e.codigo === "bluesky_invalid_handle", String(ruim));
});

test("buscarSeguro: só https, sem IP, sem porta, sem credenciais; redirecionamento revalidado; tamanho limitado", async () => {
  const f = async () => new Response("x");
  for (const u of ["http://a.com/", "https://127.0.0.1/", "https://localhost/", "https://a.com:8443/", "https://u:p@a.com/", "https://[::1]/", "https://x.internal/"]) await assert.rejects(bo.buscarSeguro(f, u), (e) => e.codigo === "bluesky_discovery_failed", u);
  const redir = async () => new Response("", { status: 302, headers: { location: "https://10.0.0.1/x" } });
  await assert.rejects(bo.buscarSeguro(redir, "https://a.com/"), (e) => e.codigo === "bluesky_discovery_failed");
  const grande = async () => new Response("x".repeat(1024 * 1024 + 5));
  await assert.rejects(bo.buscarSeguro(grande, "https://a.com/"), (e) => e.codigo === "bluesky_discovery_failed");
  assert.equal((await bo.buscarSeguro(f, "https://a.com/")).texto, "x");
});

test("facets: bytes UTF-8 (acento e emoji deslocam), pontuação final fora, hashtag só de número ignorada, links http/https", () => {
  const t = "Á 🎮 veja https://a.com/x?y=1. #Tag, #123 #ção";
  const f = bs.montarFacets(t), b = Buffer.from(t), at = (x) => b.subarray(x.index.byteStart, x.index.byteEnd).toString();
  assert.deepEqual(f.map(at), ["https://a.com/x?y=1", "#Tag", "#ção"]);
  assert.equal(f[0].features[0].uri, "https://a.com/x?y=1");
  assert.deepEqual(bs.montarFacets("sem nada"), []);
});

test("DPoP: a prova leva htm, htu sem consulta, jti, iat, nonce e ath; assinatura ES256 verificável", async () => {
  const jwk = await bo.gerarChaveEs256();
  const prova = await bo.provaDpop(jwk, { metodo: "post", url: "https://pds.exemplo.com/xrpc/x?a=1#f", nonce: "n1", token: "tok" });
  const [h, p, s] = prova.split("."), d = (x) => JSON.parse(Buffer.from(x, "base64url").toString());
  assert.equal(d(h).typ, "dpop+jwt"); assert.equal(d(h).alg, "ES256"); assert.equal(d(h).jwk.d, undefined, "a chave privada nunca vai no cabeçalho");
  assert.equal(d(p).htm, "POST"); assert.equal(d(p).htu, "https://pds.exemplo.com/xrpc/x"); assert.equal(d(p).nonce, "n1"); assert.ok(d(p).jti && d(p).iat && d(p).ath);
  const k = await crypto.subtle.importKey("jwk", bo.publicaDe(jwk), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  assert.equal(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k, Buffer.from(s, "base64url"), new TextEncoder().encode(`${h}.${p}`)), true);
});

test("chaveDoCliente: exige JWK ES256 privado com kid", () => {
  assert.throws(() => bo.chaveDoCliente(undefined), (e) => e.codigo === "bluesky_not_configured");
  assert.throws(() => bo.chaveDoCliente("{}"), (e) => e.codigo === "bluesky_not_configured");
});

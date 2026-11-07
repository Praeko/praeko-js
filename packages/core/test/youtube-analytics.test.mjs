// YouTube Analytics (retenção) e o escopo yt-analytics.readonly: URL de autorização, token antigo sem o escopo, erros que pedem reautorização. Sem rede.
import test from "node:test";
import assert from "node:assert/strict";
import { ESCOPOS, ESCOPOS_BASE, ESCOPO_ANALYTICS, REF_TOKEN, registroToken, urlAutorizacao } from "../src/provedores/youtube-api.mjs";
import { temEscopoAnalytics, retencaoDoVideo, baixarRelatorioAlcance, garantirJobAlcance } from "../src/provedores/youtube-analytics.mjs";

const R = (status, corpo) => new Response(JSON.stringify(corpo), { status });
const ctxCom = (token, fetchFn = async () => R(200, {})) => ({ segredos: { obter: async (ref) => (ref === REF_TOKEN && token ? JSON.stringify(token) : null), guardar: async () => {} }, fetchFn, deps: { agora: () => 1e12 } });
const valido = (extra = {}) => ({ access_token: "AT", refresh_token: "RT", expiry: 2e12, ...extra });

test("a conexão normal pede upload + force-ssl + yt-analytics.readonly (não sensível); `analytics` antigo é ignorado", () => {
  const args = { clientId: "c", redirect: "https://x/cb", desafio: "d", estado: "s" };
  const normal = new URL(urlAutorizacao(args)), antigo = new URL(urlAutorizacao({ ...args, analytics: true }));
  assert.deepEqual(normal.searchParams.get("scope").split(" "), ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.force-ssl", ESCOPO_ANALYTICS]);
  assert.deepEqual(antigo.searchParams.get("scope"), normal.searchParams.get("scope"));
  assert.equal(normal.searchParams.get("include_granted_scopes"), null, "não herda escopos antigos da conta (o amplo \"youtube\" não é verificado e dispara o aviso)");
});

test("temEscopoAnalytics: token antigo (sem o campo) e token sem o escopo não têm; o que o Google concedeu vale", async () => {
  assert.equal(await temEscopoAnalytics(ctxCom(null)), false, "sem token");
  assert.equal(await temEscopoAnalytics(ctxCom(valido())), false, "token antigo sem `escopos`");
  assert.equal(await temEscopoAnalytics(ctxCom(valido({ escopos: ESCOPOS_BASE }))), false);
  assert.equal(await temEscopoAnalytics(ctxCom(valido({ escopos: ESCOPOS }))), true);
  // sem `scope` na resposta do Google, só o que é garantido (nunca presume o escopo novo)
  assert.deepEqual(JSON.parse(registroToken({ access_token: "a", refresh_token: "r" }, 0)).escopos, ESCOPOS_BASE);
  assert.deepEqual(JSON.parse(registroToken({ access_token: "a", refresh_token: "r", scope: ESCOPOS.join(" ") }, 0)).escopos, ESCOPOS);
});

test("403 de escopo (Analytics e Reporting) vira erro com `reautorizar`; 403 de API desligada vira `apiDesligada` (outra instrução)", async () => {
  const escopo = async () => R(403, { error: { code: 403, message: "Request had insufficient authentication scopes.", errors: [{ reason: "insufficientPermissions" }] } });
  await assert.rejects(retencaoDoVideo({ ctx: ctxCom(valido(), escopo), videoId: "V", publicadoEm: "2026-11-01T00:00:00Z", agora: 1e12 }), (e) => e.reautorizar === true && e.status === 403 && /reconecte o canal/.test(e.message));
  await assert.rejects(garantirJobAlcance({ ctx: ctxCom(valido(), escopo) }), (e) => e.reautorizar === true);
  await assert.rejects(baixarRelatorioAlcance({ ctx: ctxCom(valido(), escopo), url: "https://youtubereporting.googleapis.com/v1/media/x?alt=media" }), (e) => e.reautorizar === true);
  const desligada = async () => R(403, { error: { code: 403, message: "YouTube Analytics API has not been used in project 1 before or it is disabled.", errors: [{ reason: "accessNotConfigured" }] } });
  await assert.rejects(retencaoDoVideo({ ctx: ctxCom(valido(), desligada), videoId: "V", publicadoEm: "2026-11-01T00:00:00Z", agora: 1e12 }), (e) => e.apiDesligada === true && !e.reautorizar);
  await assert.rejects(retencaoDoVideo({ ctx: ctxCom(valido(), async () => R(401, {})), videoId: "V", publicadoEm: "2026-11-01T00:00:00Z", agora: 1e12 }), (e) => e.reautorizar === true);
  await assert.rejects(retencaoDoVideo({ ctx: ctxCom(valido(), async () => R(500, { error: { message: "x" } })), videoId: "V", publicadoEm: "2026-11-01T00:00:00Z", agora: 1e12 }), (e) => e.status === 500 && !e.reautorizar);
});

test("o download só aceita o host da Reporting API (o downloadUrl vem de fora)", async () => {
  await assert.rejects(baixarRelatorioAlcance({ ctx: ctxCom(valido()), url: "https://evil.example/relatorio.csv" }), /URL de relatório inesperada/);
});

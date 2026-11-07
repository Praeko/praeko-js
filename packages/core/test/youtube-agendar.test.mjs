import test from "node:test";
import assert from "node:assert/strict";
import { agendarPublicacao, removerAgendamento } from "../src/provedores/youtube-api.ts";

const ctxCom = (chamadas, status) => ({
  segredos: { obter: async () => JSON.stringify({ access_token: "T", refresh_token: "R", expiry: Date.now() + 3600e3 }), guardar: async () => {} },
  fetchFn: async (url, o = {}) => {
    chamadas.push({ url: String(url), metodo: o.method || "GET", corpo: o.body && JSON.parse(o.body) });
    if (!o.method) return { ok: true, status: 200, json: async () => ({ items: [{ status }] }), text: async () => "" };
    return { ok: true, status: 200, json: async () => ({}), text: async () => "{}" };
  },
});

test("agendarPublicacao: mantém o resto do status e põe privado + publishAt", async () => {
  const ch = [];
  const r = await agendarPublicacao({ item: { videoId: "abc", quando: "2026-11-07T13:00:00Z" }, ctx: ctxCom(ch, { privacyStatus: "private", embeddable: false, license: "creativeCommon", publicStatsViewable: false, selfDeclaredMadeForKids: false, uploadStatus: "processed" }), agora: Date.parse("2026-11-05T00:00:00Z") });
  assert.equal(r.publishAt, "2026-11-07T13:00:00.000Z");
  const put = ch.find((c) => c.metodo === "PUT");
  assert.ok(put.url.includes("part=status"));
  assert.deepEqual(put.corpo, { id: "abc", status: { privacyStatus: "private", publishAt: "2026-11-07T13:00:00.000Z", embeddable: false, license: "creativeCommon", publicStatsViewable: false, selfDeclaredMadeForKids: false } });
});
test("agendarPublicacao: recusa horário próximo demais ou inválido", async () => {
  const ctx = ctxCom([], {});
  await assert.rejects(agendarPublicacao({ item: { videoId: "a", quando: "2026-11-05T00:02:00Z" }, ctx, agora: Date.parse("2026-11-05T00:00:00Z") }), /5 minutos/);
  await assert.rejects(agendarPublicacao({ item: { videoId: "a", quando: "lixo" }, ctx }), /inválido/);
});
test("agendarPublicacao: nunca mexe em vídeo público e não escreve quando o horário já é esse", async () => {
  const agora = Date.parse("2026-11-05T00:00:00Z");
  const ch = [];
  await assert.rejects(agendarPublicacao({ item: { videoId: "a", quando: "2026-11-07T13:00:00Z" }, ctx: ctxCom(ch, { privacyStatus: "public" }), agora }), (e) => e.videoPublicado === true);
  assert.ok(!ch.some((c) => c.metodo === "PUT"));
  const ch2 = [];
  const r = await agendarPublicacao({ item: { videoId: "a", quando: "2026-11-07T13:00:00Z" }, ctx: ctxCom(ch2, { privacyStatus: "private", publishAt: "2026-11-07T13:00:00Z" }), agora });
  assert.equal(r.alterado, false); assert.ok(!ch2.some((c) => c.metodo === "PUT"));
});
test("removerAgendamento: reenvia o status sem publishAt (privado); público é recusado; sem horário não escreve", async () => {
  const ch = [];
  const r = await removerAgendamento({ item: { videoId: "abc" }, ctx: ctxCom(ch, { privacyStatus: "private", publishAt: "2026-11-07T13:00:00Z", embeddable: false, license: "youtube", publicStatsViewable: true, selfDeclaredMadeForKids: true }) });
  assert.equal(r.alterado, true);
  assert.deepEqual(ch.find((c) => c.metodo === "PUT").corpo, { id: "abc", status: { privacyStatus: "private", embeddable: false, license: "youtube", publicStatsViewable: true, selfDeclaredMadeForKids: true } });
  await assert.rejects(removerAgendamento({ item: { videoId: "a" }, ctx: ctxCom([], { privacyStatus: "public" }) }), (e) => e.videoPublicado === true);
  const ch3 = []; assert.equal((await removerAgendamento({ item: { videoId: "a" }, ctx: ctxCom(ch3, { privacyStatus: "private" }) })).alterado, false); assert.ok(!ch3.some((c) => c.metodo === "PUT"));
});

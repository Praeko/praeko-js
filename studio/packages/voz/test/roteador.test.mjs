// node --test packages/voz/test
import test from "node:test";
import assert from "node:assert/strict";
import { gerarComFailover } from "../src/roteador.mjs";
import { resolverVoz } from "../src/config.mjs";

const CONFIG = { contas: { elevenlabs: ["a", "b", "c"] }, vozes: { v: { provedor: "elevenlabs", modelo: "eleven_v4", ids: { a: "IDA", b: "IDB", c: "IDC" } } }, estrategia: {} };
const erro = (statusCode, body) => Object.assign(new Error("x"), { statusCode, body });
process.env.PRAEKO_STUDIO_KEY_ELEVENLABS_A = "ka"; process.env.PRAEKO_STUDIO_KEY_ELEVENLABS_B = "kb"; process.env.PRAEKO_STUDIO_KEY_ELEVENLABS_C = "kc";
const esperas = [];
const base = { config: CONFIG, voz: "v", texto: "ola mundo", esperar: async (ms) => { esperas.push(ms); } };
const fab = (mapa) => (conta) => mapa[conta];
const ok = (rest = 1e6) => ({ saldo: async () => ({ restantes: rest, limite: 1e6 }), gerar: async ({ id }) => Buffer.from("audio-" + id) });

test("usa a primeira conta quando tudo está bem", async () => {
  const r = await gerarComFailover({ ...base, criar: fab({ a: ok(), b: ok(), c: ok() }) });
  assert.equal(r.conta, "a"); assert.equal(r.buffer.toString(), "audio-IDA");
});
test("pula a conta sem saldo suficiente", async () => {
  const r = await gerarComFailover({ ...base, criar: fab({ a: ok(3), b: ok(), c: ok() }) });
  assert.equal(r.conta, "b"); assert.match(r.tentativas[0].motivo, /saldo insuficiente/);
});
test("cota esgotada (401 quota_exceeded) passa para a próxima conta", async () => {
  const a = { saldo: async () => ({ restantes: 1e6 }), gerar: async () => { throw erro(401, { detail: { status: "quota_exceeded" } }); } };
  const r = await gerarComFailover({ ...base, criar: fab({ a, b: ok(), c: ok() }) });
  assert.equal(r.conta, "b"); assert.equal(r.tentativas[0].motivo, "cota");
});
test("chave inválida (401) passa para a próxima conta", async () => {
  const a = { saldo: async () => { throw erro(401, "invalid_api_key"); }, gerar: async () => { throw erro(401, "invalid_api_key"); } };
  const r = await gerarComFailover({ ...base, criar: fab({ a, b: ok(), c: ok() }) });
  assert.equal(r.conta, "b"); assert.equal(r.tentativas[0].motivo, "auth");
});
test("429 espera e repete na mesma conta antes de trocar", async () => {
  let n = 0; esperas.length = 0;
  const a = { saldo: async () => ({ restantes: 1e6 }), gerar: async ({ id }) => { if (n++ < 1) throw erro(429, "too_many_concurrent_requests"); return Buffer.from("audio-" + id); } };
  const r = await gerarComFailover({ ...base, criar: fab({ a, b: ok(), c: ok() }) });
  assert.equal(r.conta, "a"); assert.equal(n, 2); assert.deepEqual(esperas, [5000]);
});
test("429 persistente troca de conta depois das repetições", async () => {
  const a = { saldo: async () => ({ restantes: 1e6 }), gerar: async () => { throw erro(429, "system_busy"); } };
  const r = await gerarComFailover({ ...base, criar: fab({ a, b: ok(), c: ok() }) });
  assert.equal(r.conta, "b"); assert.equal(r.tentativas[0].motivo, "limite");
});
test("erro de texto (400) para sem tentar outra conta", async () => {
  const a = { saldo: async () => ({ restantes: 1e6 }), gerar: async () => { throw erro(400, "invalid text"); } };
  await assert.rejects(gerarComFailover({ ...base, criar: fab({ a, b: ok(), c: ok() }) }), /texto recusado/);
});
test("sem chave a conta é pulada; se nenhuma serve, o erro lista os motivos", async () => {
  delete process.env.PRAEKO_STUDIO_KEY_ELEVENLABS_A;
  const r = await gerarComFailover({ ...base, criar: fab({ b: ok(), c: ok() }) });
  assert.equal(r.conta, "b"); assert.equal(r.tentativas[0].motivo, "sem chave");
  const falha = { saldo: async () => ({ restantes: 1e6 }), gerar: async () => { throw erro(402, "payment_required"); } };
  await assert.rejects(gerarComFailover({ ...base, criar: fab({ b: falha, c: falha }) }), /nenhuma conta conseguiu.*b: cota.*c: cota/);
  process.env.PRAEKO_STUDIO_KEY_ELEVENLABS_A = "ka";
});
test("--sem-failover usa só a primeira conta", async () => {
  const falha = { saldo: async () => ({ restantes: 1e6 }), gerar: async () => { throw erro(401, { detail: { status: "quota_exceeded" } }); } };
  await assert.rejects(gerarComFailover({ ...base, semFailover: true, criar: fab({ a: falha, b: ok(), c: ok() }) }), /nenhuma conta conseguiu/);
});
test("resolverVoz: apelido, formato antigo e erro claro", () => {
  assert.equal(resolverVoz("v", CONFIG).ids.b, "IDB");
  process.env.X_ID = "ABC";
  assert.equal(resolverVoz({ provedor: "elevenlabs", idEnv: "X_ID", modelo: "m" }, CONFIG).ids.principal, "ABC");
  assert.throws(() => resolverVoz("nada", CONFIG), /não existe/);
});

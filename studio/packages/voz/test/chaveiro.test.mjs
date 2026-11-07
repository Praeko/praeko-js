import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { carregarConfig, guardarChave, obterChave, refsConhecidas, resolverVoz } from "../src/config.mjs";

const sandbox = () => {
  const d = mkdtempSync(join(tmpdir(), "voz-cfg-"));
  process.env.PRAEKO_STUDIO_CONFIG = join(d, "usuario"); process.env.PRAEKO_SEGREDOS = join(d, "segredos.json"); process.env.PRAEKO_SEM_CHAVEIRO = "1";
  delete process.env.ELEVENLABS_API_KEY; delete process.env.ELEVENLABS_VOICE_ID; delete process.env.PRAEKO_STUDIO_KEY_ELEVENLABS_PRINCIPAL;
  return d;
};

test("refsConhecidas inclui as contas do config e as fixas", () => {
  const l = refsConhecidas({ contas: { elevenlabs: ["principal", "reserva"], desativadas: { "principal-ws2": "motivo" } } });
  assert.deepEqual(l.sort(), ["buffer/principal", "elevenlabs/principal", "elevenlabs/principal-ws2", "elevenlabs/reserva", "praeko/principal"]);
});
test("configuração padrão: sem ids de ninguém, rascunho mudo e voz do usuário vazia", () => {
  sandbox();
  const c = carregarConfig(), txt = JSON.stringify(c);
  assert.equal(c.qualidade.rascunho, "rascunho-mudo");
  assert.deepEqual(c.vozes["minha-voz"].ids, {});
  assert.doesNotMatch(txt, /marcone/i);
  assert.doesNotMatch(txt, /"voice_?id"\s*:\s*"[A-Za-z0-9]{18,}"/i); // nenhum id de voz de verdade no padrão
});
test("camadas: projeto vence usuário, que vence o padrão; ELEVENLABS_VOICE_ID vale quando não há ids", () => {
  const d = sandbox();
  mkdirSync(join(d, "usuario"), { recursive: true });
  writeFileSync(join(d, "usuario", "vozes.json"), JSON.stringify({ vozes: { "minha-voz": { provedor: "elevenlabs", modelo: "do-usuario", ids: { principal: "U" } } } }));
  assert.equal(resolverVoz("minha-voz", carregarConfig()).modelo, "do-usuario");
  const proj = join(d, "proj"); mkdirSync(proj); writeFileSync(join(proj, "marca.json"), "{}"); writeFileSync(join(proj, "vozes.json"), JSON.stringify({ vozes: { "minha-voz": { provedor: "elevenlabs", modelo: "do-projeto", ids: { principal: "P" } } } }));
  const antes = process.cwd(); process.chdir(proj);
  try { const v = resolverVoz("minha-voz", carregarConfig()); assert.equal(v.modelo, "do-projeto"); assert.equal(v.ids.principal, "P"); } finally { process.chdir(antes); }
  sandbox(); process.env.ELEVENLABS_VOICE_ID = "VOZ123";
  assert.equal(resolverVoz("minha-voz", carregarConfig()).ids.principal, "VOZ123");
});
test("chaves fora do macOS: ambiente vence, senão arquivo de segredos com permissão 600; nada de `security`", () => {
  const d = sandbox();
  assert.equal(obterChave("elevenlabs/principal"), null);
  assert.equal(guardarChave("elevenlabs/principal", "CHAVE-X"), "arquivo");
  assert.equal(obterChave("elevenlabs/principal"), "CHAVE-X");
  assert.equal(JSON.parse(readFileSync(join(d, "segredos.json"), "utf8"))["elevenlabs/principal"], "CHAVE-X");
  if (process.platform !== "win32") assert.equal(statSync(join(d, "segredos.json")).mode & 0o777, 0o600);
  process.env.ELEVENLABS_API_KEY = "DO-AMBIENTE";
  assert.equal(obterChave("elevenlabs/principal"), "DO-AMBIENTE");
  delete process.env.ELEVENLABS_API_KEY;
});
test("chave do Praeko: PRAEKO_KEY vale e a gravação usa a conta da `praeko` CLI (praeko/chave)", () => {
  const d = sandbox();
  guardarChave("praeko/principal", "praeko_X");
  assert.equal(JSON.parse(readFileSync(join(d, "segredos.json"), "utf8"))["praeko/chave"], "praeko_X");
  assert.equal(obterChave("praeko/principal"), "praeko_X");
  process.env.PRAEKO_KEY = "praeko_ENV"; assert.equal(obterChave("praeko/principal"), "praeko_ENV"); delete process.env.PRAEKO_KEY;
});

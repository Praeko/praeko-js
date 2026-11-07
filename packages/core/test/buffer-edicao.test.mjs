import test from "node:test";
import assert from "node:assert/strict";
import { montarEdicaoPost, editarNoLugar, editarPost } from "../src/buffer-api.ts";

const R = (corpo, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(corpo) });
const AG = Date.parse("2026-11-05T12:00:00Z");

test("montarEdicaoPost: só manda o que mudou; shareNow, customScheduled e saveToDraft; valida legenda e horário", () => {
  const ass = [{ video: { url: "https://x/v.mp4" } }], meta = { instagram: { type: "reel", shouldShareToFeed: true } };
  assert.deepEqual(montarEdicaoPost({ id: "P", texto: "Oi #a", assets: ass, metadata: meta }), { id: "P", text: "Oi #a", assets: ass, metadata: meta });
  assert.deepEqual(montarEdicaoPost({ id: "P", agoraMesmo: true }), { id: "P", mode: "shareNow" });
  assert.deepEqual(montarEdicaoPost({ id: "P", quando: "2026-12-01T10:00:00Z", agora: AG }), { id: "P", mode: "customScheduled", dueAt: "2026-12-01T10:00:00.000Z" });
  assert.deepEqual(montarEdicaoPost({ id: "P", rascunho: true }), { id: "P", saveToDraft: true });
  assert.deepEqual(montarEdicaoPost({ id: "P", rascunho: false, quando: "2026-12-01T10:00:00Z", agora: AG }), { id: "P", saveToDraft: false, mode: "customScheduled", dueAt: "2026-12-01T10:00:00.000Z" });
  assert.throws(() => montarEdicaoPost({ id: "P" }), /nada para mudar/);
  assert.throws(() => montarEdicaoPost({ id: "P", agoraMesmo: true, quando: "2026-12-01T10:00:00Z" }), /não combina/);
  assert.throws(() => montarEdicaoPost({ id: "P", quando: "2026-11-05T12:02:00Z", agora: AG }), /5 minutos/);
  assert.throws(() => montarEdicaoPost({ id: "P", texto: "x".repeat(2300) }), /caracteres/);
  assert.throws(() => montarEdicaoPost({ texto: "oi" }), /falta o id/);
});

test("editarNoLugar: lê a mídia e o tipo atuais do post e reenvia no editPost (sem createPost/deletePost)", async () => {
  const chamadas = [];
  const fetchFn = async (_u, o) => {
    const { query, variables } = JSON.parse(o.body); chamadas.push(query.includes("editPost") ? "edit" : query.includes("createPost") ? "create" : query.includes("deletePost") ? "delete" : "ler");
    if (query.includes("assets { type source }")) return R({ data: { post: { id: variables.id, assets: [{ type: "video", source: "https://x/v.mp4" }], metadata: { type: "reel", shouldShareToFeed: false } } } });
    if (query.includes("editPost")) { chamadas.input = variables.input; return R({ data: { editPost: { post: { id: variables.input.id, status: "scheduled", dueAt: variables.input.dueAt ?? null, text: variables.input.text ?? "" } } } }); }
    throw new Error("inesperado");
  };
  const r = await editarNoLugar({ id: "BUF1", texto: "Nova #a", agora: AG }, { chave: "k", fetchFn });
  assert.deepEqual(chamadas.slice(0, 2), ["ler", "edit"]);
  assert.deepEqual(chamadas.input, { id: "BUF1", text: "Nova #a", assets: [{ video: { url: "https://x/v.mp4" } }], metadata: { instagram: { type: "reel", shouldShareToFeed: false } } });
  assert.equal(r.id, "BUF1");
  assert.ok(!chamadas.includes("create") && !chamadas.includes("delete"));
});

test("editarNoLugar/editarPost: post sem mídia e MutationError viram erro com a mensagem", async () => {
  const semMidia = async () => R({ data: { post: { id: "P", assets: [], metadata: {} } } });
  await assert.rejects(editarNoLugar({ id: "P", texto: "oi" }, { chave: "k", fetchFn: semMidia }), /não tem mídia/);
  const recusa = async () => R({ data: { editPost: { message: "Invalid post: x" } } });
  await assert.rejects(editarPost({ id: "P", text: "oi" }, { chave: "k", fetchFn: recusa }), /Buffer recusou a edição: Invalid post: x/);
});

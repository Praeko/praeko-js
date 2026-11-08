import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { maskDeep, maskOne, maskSecrets } from "../src/mask.ts";
import { assertSlug, openProject, resolveInside, writeInside } from "../src/paths.ts";
import { validateBrand } from "../src/server.ts";
import "./helpers.ts";
import { SECRETS, fakeProject, tmp } from "./helpers.ts";

test("mask: known shapes and environment values, keeping only prefix and last two characters", () => {
  assert.equal(maskOne("sk_abcdefghijkl3e"), "sk_…3e");
  assert.equal(maskOne("short"), "…");
  const t = maskSecrets(`a ${SECRETS[0]} b ${SECRETS[1]} c ghp_${"a".repeat(36)} d Bearer abcdefghijklmnopqrstuv e AKIA${"A".repeat(16)}`);
  assert.doesNotMatch(t, /FAKE|ghp_a|abcdefghijklmnop|AKIAAAAA/);
  assert.deepEqual(maskDeep({ a: [SECRETS[0]], b: { c: 1 } }), { a: ["sk_…3e"], b: { c: 1 } });
  process.env.MY_CUSTOM_TOKEN = "weird-format-value-12345";
  assert.doesNotMatch(maskSecrets("x weird-format-value-12345 y"), /weird-format/);
  delete process.env.MY_CUSTOM_TOKEN;
});
test("paths: slug allowlist, traversal, absolute, backslash, NUL and symlinks", () => {
  for (const ok of ["a", "my-video-2", "0day"]) assert.equal(assertSlug(ok), ok);
  for (const bad of ["", "-x", "A", "a_b", "a.b", "..", "a/b", "a b", 5, null]) assert.throws(() => assertSlug(bad), /episode name/);
  const root = openProject(fakeProject());
  assert.equal(resolveInside(root, "episodes", "quick"), join(root, "episodes", "quick"));
  for (const bad of ["..", "../x", "a/../../x", "/etc/passwd", "a\\b", "a\0b", "", "a//b"]) assert.throws(() => resolveInside(root, bad), /outside the project/, JSON.stringify(bad));
  const out = tmp("out"); symlinkSync(out, join(root, "link"));
  assert.throws(() => resolveInside(root, "link", "file.txt"), /symlink/);
  assert.throws(() => writeInside(root, "x", "link", "file.txt"), /symlink|outside/);
  writeFileSync(join(out, "t.txt"), "t"); symlinkSync(join(out, "t.txt"), join(root, "brief.md"));
  assert.throws(() => writeInside(root, "x", "brief.md"), /symlink/);
  symlinkSync(join(root, "nowhere"), join(root, "dangling"));
  assert.throws(() => resolveInside(root, "dangling"), /outside the project/);
});
test("openProject needs brand.json; a symlinked project folder resolves to its real path", () => {
  const empty = mkdtempSync(join(tmpdir(), "mcp-e-"));
  assert.throws(() => openProject(empty), /brand\.json/);
  const real = fakeProject(), via = join(tmp("via"), "link"); symlinkSync(real, via);
  assert.equal(openProject(via), openProject(real));
});
test("validateBrand accepts the init shape and unknown keys", () => {
  validateBrand(JSON.stringify({ name: "X", handle: "@x", colors: { accent: "#fff" }, links: {}, bannedNames: [], publishing: { provider: "praeko" }, extra: { any: 1 } }));
  assert.throws(() => validateBrand('{"name":"  "}'), /name/);
  mkdirSync(tmp("noop"), { recursive: true });
});

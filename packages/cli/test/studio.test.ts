// `praeko studio` hands over to the separately installed @praeko/studio: project, next to the CLI, global or PATH; without it, help and (if accepted) npx.
import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { findStudio, delegateToStudio, MISSING_MESSAGE } from "../src/studio.ts";

const tmp = () => realpathSync(mkdtempSync(join(tmpdir(), "praeko-studio-deleg-")));
/** Creates node_modules/@praeko/studio with the bin pointed to in package.json. */
function install(base: string) {
  const dir = join(base, "node_modules", "@praeko", "studio");
  mkdirSync(join(dir, "dist"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "@praeko/studio", version: "0.1.0", bin: { "praeko-studio": "dist/praeko-studio.mjs" } }));
  writeFileSync(join(dir, "dist", "praeko-studio.mjs"), "console.log('studio')");
  return join(dir, "dist", "praeko-studio.mjs");
}
const nothing = { npmRootGlobal: () => null, here: tmp(), env: { PATH: "" } };

test("finds Studio installed in the current project", () => {
  const proj = tmp(), bin = install(proj);
  const r = findStudio({ ...nothing, cwd: join(proj) })!;
  assert.deepEqual([r.kind, r.path, r.where], ["node", bin, "in this project"]);
});
test("finds Studio installed globally (npm root -g), even outside the project", () => {
  const glob = tmp(), bin = install(glob);
  const r = findStudio({ ...nothing, cwd: tmp(), npmRootGlobal: () => join(glob, "node_modules") })!;
  assert.deepEqual([r.path, r.where], [bin, "global npm install"]);
});
test("finds a praeko-studio on the PATH (its own binary)", () => {
  const dir = tmp(), f = join(dir, "praeko-studio");
  writeFileSync(f, "#!/bin/sh\n"); chmodSync(f, 0o755);
  const r = findStudio({ ...nothing, cwd: tmp(), env: { PATH: ["/does/not/exist", dir].join(delimiter) }, platform: "linux" })!;
  assert.deepEqual([r.kind, r.path], ["binary", f]);
});
test("the project wins over the global install", () => {
  const proj = tmp(), glob = tmp(), bin = install(proj); install(glob);
  assert.equal(findStudio({ ...nothing, cwd: proj, npmRootGlobal: () => join(glob, "node_modules") })!.path, bin);
});
test("delegate: runs the Studio bin with the arguments and PRAEKO_STUDIO=1, returning the exit code", () => {
  const proj = tmp(), bin = install(proj); let call: any;
  const code = delegateToStudio(["doctor", "--json"], { ...nothing, cwd: proj, run: (cmd, a, env) => { call = { cmd, a, env }; return 7; } });
  assert.equal(code, 7);
  assert.equal(call.cmd, process.execPath); assert.deepEqual(call.a, [bin, "doctor", "--json"]); assert.equal(call.env.PRAEKO_STUDIO, "1");
});
test("without Studio: a useful message (npm install, npx) and code 1, running nothing", () => {
  let msg = "", ran = false;
  const code = delegateToStudio(["init", "x"], { ...nothing, cwd: tmp(), error: (m) => { msg += m; }, run: () => { ran = true; return 0; }, ask: () => false });
  assert.equal(code, 1); assert.equal(ran, false);
  assert.match(msg, /npm install -D @praeko\/studio/); assert.match(msg, /npx @praeko\/studio/); assert.equal(msg, MISSING_MESSAGE);
  assert.match(msg, /^praeko studio: Praeko Studio \(videos with your own agent\)/);
});
test("without Studio and with the user's 'yes': runs npx --yes @praeko/studio with the arguments", () => {
  let call: any;
  const code = delegateToStudio(["init", "x"], { ...nothing, cwd: tmp(), platform: "linux", error: () => {}, ask: () => true, run: (cmd, a) => { call = [cmd, a]; return 0; } });
  assert.equal(code, 0); assert.deepEqual(call, ["npx", ["--yes", "@praeko/studio", "init", "x"]]);
});

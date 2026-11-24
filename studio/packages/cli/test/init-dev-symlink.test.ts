// `init --dev` points the project at the Studio packages with `file:` links. Before the fix the relative path mixed a logical folder (under a symlink such as macOS /var -> /private/var)
// with the real one, and the links pointed at nothing. This test creates the project through a symlinked folder and checks that the links resolve.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(new URL("../bin/praeko-studio.ts", import.meta.url)), STUDIO = fileURLToPath(new URL("../../..", import.meta.url));

test("init --dev through a symlinked folder writes file: links that resolve to the Studio packages", () => {
  const base = mkdtempSync(join(tmpdir(), "studio-dev-link-")), real = join(base, "real"), link = join(base, "link");
  assert.equal(spawnSync("mkdir", [real]).status, 0);
  symlinkSync(real, link);
  const env = { ...process.env, HOME: base, PRAEKO_NO_KEYCHAIN: "1", PRAEKO_STUDIO_CONFIG: join(base, "cfg"), PRAEKO_SECRETS: join(base, "s.json") } as NodeJS.ProcessEnv;
  delete env.PRAEKO_LANG;
  const dir = join(link, "channel");
  const r = spawnSync(process.execPath, [BIN, "init", dir, "--yes", "--name", "Link", "--dev", STUDIO, "--no-install"], { cwd: base, encoding: "utf8", env, timeout: 120_000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  for (const k of ["@praeko/studio-core", "@praeko/studio-kit"]) {
    const target = String(pkg.dependencies[k]).replace(/^file:/, "");
    assert.ok(existsSync(resolve(realpathSync(dir), target, "package.json")), `${k} -> ${target} does not resolve from the real project folder`);
  }
});

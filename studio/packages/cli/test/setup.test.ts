// `praeko studio setup`: plan without writes, detection, apply with backups and manifest, idempotency, uninstall of only what setup added,
// .praeko/config.json (profile) and .gitignore (append only, git check-ignore), and the key rules (TTY only, hidden, never printed, 0600, per profile).
// Everything runs on a fake HOME and a temporary working folder; the real Keychain is never touched (PRAEKO_NO_KEYCHAIN + an injected store).
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { PassThrough } from "node:stream";
import type { SetupEnv } from "../src/setup.ts";
import { DEVICE_KEY, fakeDevice, virtualClock } from "./device-fake.ts";
import type { Answer } from "./device-fake.ts";

const base = mkdtempSync(join(tmpdir(), "studio-setup-"));
// before importing: every store of the Studio points into the temporary folder
process.env.PRAEKO_NO_KEYCHAIN = "1";
process.env.PRAEKO_SECRETS = join(base, "global-secrets.json");
process.env.PRAEKO_STUDIO_CONFIG = join(base, "global-cfg");
process.env.PRAEKO_STUDIO_NO_NOTICE = "1";
delete process.env.PRAEKO_KEY; delete process.env.PRAEKO_STUDIO_KEY_PRAEKO_MAIN;
const S = await import("../src/setup.ts");
const V = await import("@praeko/studio-voice");

const KEY = "praeko_" + "Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4zAb7cDe0fGh1";
const OK_REQ = async () => [{ id: "node", level: "ok" as const, msg: "Node 22" }, { id: "ffmpeg", level: "ok" as const, msg: "ffmpeg" }, { id: "licenses", level: "ok" as const, msg: "license notice recorded" }];

let n = 0;
/** A fresh fake machine: HOME, a working folder, a config dir, a fake `claude` that edits ~/.claude.json, and captured output. */
/** The sign-in by code goes to an in-process fake Praeko (no network) that approves unless `device` scripts otherwise; the browser is never opened. */
function machine(o: { claude?: boolean; tty?: boolean; secrets?: string; env?: Record<string, string>; whichGit?: boolean; device?: Answer[] } = {}) {
  const root = join(base, `m${++n}`), home = join(root, "home"), cwd = join(root, "work"), configDir = join(home, ".config", "praeko", "studio");
  mkdirSync(home, { recursive: true }); mkdirSync(cwd, { recursive: true });
  const out: string[] = [], err: string[] = [], calls: string[][] = [], stored: Record<string, string> = {}, opened: string[] = [];
  const device = fakeDevice({ script: o.device }), clock = virtualClock();
  const claudeJson = join(home, ".claude.json");
  const exec = (cmd: string, args: string[]) => {
    calls.push([cmd, ...args]);
    if (cmd.endsWith("claude")) {
      const j = existsSync(claudeJson) ? JSON.parse(readFileSync(claudeJson, "utf8")) : {};
      j.mcpServers ||= {};
      if (args[1] === "add") j.mcpServers[args[6]!] = { type: "http", url: args[7] };
      if (args[1] === "remove") delete j.mcpServers[args[2]!];
      writeFileSync(claudeJson, JSON.stringify(j)); return { status: 0, stdout: "", stderr: "" };
    }
    const r = spawnSync(cmd, args, { encoding: "utf8" }); return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  };
  const env: SetupEnv = {
    home, cwd, configDir, platform: "darwin", applications: [join(root, "Applications")], env: { PATH: "", ...(o.env || {}) },
    which: (c) => (c === "claude" && o.claude ? "/fake/bin/claude" : c === "git" && o.whichGit ? "git" : c === "npm" ? "/fake/bin/npm" : null),
    exec, isTTY: !!o.tty, requirements: OK_REQ, npmInstall: () => 0, nodePath: join(root, "node", "bin", "node"),
    getKey: (ref) => stored[ref] ?? null, storeKey: (ref, k) => { stored[ref] = k; return "file"; }, secretsPath: o.secrets ?? join(home, ".config", "praeko", "secrets.json"), usesKeychain: false,
    now: () => new Date("2026-11-12T15:30:00Z"), out: (s) => out.push(s), err: (s) => err.push(s),
    ask: async () => "n", readSecret: async () => { throw new Error("must not read a secret"); },
    fetchFn: device.fetchFn, login: { hostname: () => "Test-Mac.local", openBrowser: async (u) => { opened.push(u); return true; }, sleep: clock.sleep, now: clock.now },
  };
  return { root, home, cwd, configDir, out, err, calls, stored, env, claudeJson, device, opened, clock, text: () => out.join("\n") + "\n" + err.join("\n") };
}
/** Every file under a folder with its content (to prove nothing changed). */
function snapshot(dir: string): Record<string, string> {
  const r: Record<string, string> = {};
  const walk = (d: string) => { if (!existsSync(d)) return; for (const e of readdirSync(d, { withFileTypes: true })) { const f = join(d, e.name); if (e.isDirectory()) walk(f); else r[relative(dir, f)] = readFileSync(f, "utf8"); } };
  walk(dir); return r;
}

test("detection: binaries, configuration folders and apps; --agent overrides and is validated", () => {
  const m = machine({ claude: true });
  mkdirSync(join(m.home, ".codex")); mkdirSync(join(m.home, ".cursor")); mkdirSync(join(m.root, "Applications", "Claude.app"), { recursive: true });
  const ctx = { home: m.home, platform: "darwin" as const, env: {}, which: m.env.which!, applications: m.env.applications! };
  const found = Object.fromEntries(S.detectSetupAgents(ctx).map((a) => [a.id, a]));
  assert.ok(found.claude!.detected && found.claude!.evidence.includes("claude on the PATH"));
  assert.ok(found.codex!.detected && found["claude-desktop"]!.detected && found.cursor!.detected);
  assert.equal(found.gemini!.detected, false); assert.equal(found.windsurf!.detected, false);
  assert.deepEqual(S.parseAgentList("claude-code,codex-cli"), ["claude", "codex"]);
  assert.equal(S.parseAgentList("all").length, S.SETUP_AGENTS.length);
  assert.throws(() => S.parseAgentList("vim"), /--agent vim/);
});

test("--plan (and no TTY without --yes) changes nothing anywhere: HOME, the working folder and the config dir stay identical", async () => {
  const m = machine({ claude: true });
  mkdirSync(join(m.home, ".codex")); writeFileSync(join(m.home, ".codex", "config.toml"), 'model = "x"\n');
  const before = snapshot(m.root);
  assert.equal(await S.setupCommand(["--plan", "--agent", "claude,codex,cursor,claude-desktop"], m.env), 0);
  assert.equal(await S.setupCommand(["--agent", "claude,codex"], m.env), 0, "no TTY, no --yes: plan only");
  assert.equal(await S.setupCommand(["--json", "--agent", "claude"], m.env), 0);
  assert.deepEqual(snapshot(m.root), before);
  assert.equal(m.calls.length, 0, "no command was run");
  assert.match(m.text(), /Nothing was changed/);
  const j = JSON.parse(m.out.at(-1)!);
  assert.equal(j.applied, false); assert.equal(j.schema, "praeko-studio-setup/1");
  assert.ok(j.steps.some((s: any) => s.kind === "claude-mcp" && s.action === "add"));
  assert.equal(j.project.profile, "praeko-studio");
});

test("--yes applies: Claude Code (user scope), Codex block, Cursor entry, Claude Desktop local server, project, profile file; backups 600 and a manifest", async () => {
  const m = machine({ claude: true });
  mkdirSync(join(m.home, ".cursor")); writeFileSync(join(m.home, ".cursor", "mcp.json"), JSON.stringify({ mcpServers: { other: { url: "https://x" } } }));
  writeFileSync(m.claudeJson, JSON.stringify({ numStartups: 3 }));
  const code = await S.setupCommand(["--yes", "--agent", "claude,codex,cursor,claude-desktop", "--profile", "my-channel"], m.env);
  assert.equal(code, 0, m.text());
  const proj = join(m.cwd, "praeko-studio");
  assert.deepEqual(m.calls.find((c) => c[0].endsWith("claude")), ["/fake/bin/claude", "mcp", "add", "--transport", "http", "--scope", "user", "praeko", "https://praeko.app/mcp"]);
  const toml = readFileSync(join(m.home, ".codex", "config.toml"), "utf8");
  assert.match(toml, /\[mcp_servers\.praeko\]\nurl = "https:\/\/praeko\.app\/mcp"\nbearer_token_env_var = "PRAEKO_KEY"/);
  const cursor = JSON.parse(readFileSync(join(m.home, ".cursor", "mcp.json"), "utf8"));
  assert.deepEqual(cursor.mcpServers.other, { url: "https://x" }, "the other server stays");
  assert.deepEqual(cursor.mcpServers.praeko, { url: "https://praeko.app/mcp", headers: { Authorization: "Bearer ${env:PRAEKO_KEY}" } });
  const desk = JSON.parse(readFileSync(join(m.home, "Library", "Application Support", "Claude", "claude_desktop_config.json"), "utf8"));
  assert.deepEqual(desk.mcpServers["praeko-studio"].args, ["-y", "@praeko/studio-mcp", "--project", proj]);
  assert.ok(existsSync(join(proj, "brand.json")) && existsSync(join(proj, "AGENTS.md")) && existsSync(join(proj, ".cursor", "rules", "praeko-studio.mdc")));
  assert.deepEqual(JSON.parse(readFileSync(join(proj, ".praeko", "config.json"), "utf8")), { profile: "my-channel" });
  assert.ok(readFileSync(join(proj, ".gitignore"), "utf8").includes(".praeko/cache/"));
  // backups: the files that existed (Cursor's and Claude's), dated, mode 600
  const bdir = join(m.configDir, "setup-backups", "2026-11-12T15-30-00Z");
  const cursorBackup = join(bdir, join(m.home, ".cursor", "mcp.json").slice(1));
  assert.equal(JSON.parse(readFileSync(cursorBackup, "utf8")).mcpServers.praeko, undefined, "the backup is the file before");
  assert.equal(statSync(cursorBackup).mode & 0o777, 0o600);
  assert.equal(JSON.parse(readFileSync(join(bdir, m.claudeJson.slice(1)), "utf8")).numStartups, 3);
  const man = S.readManifest({ configDir: m.configDir });
  assert.deepEqual(man.entries.map((e) => e.kind).sort(), ["claude-mcp", "file-created", "json-entry", "json-entry", "project-created", "toml-block"]);
  assert.match(m.text(), /Sign in to Praeko \(profile "my-channel"\)[\s\S]*type the code: BCDF-GHJK[\s\S]*approved in workspace "Chan"[\s\S]*What only you do:[\s\S]*\/mcp[\s\S]*claude mcp login praeko[\s\S]*Add custom connector/);
  assert.deepEqual(m.stored, { "praeko/profile/my-channel": DEVICE_KEY }, "signed in by code: the key went to the profile's store");
  assert.ok(!m.text().includes(DEVICE_KEY) && !/setup --key/.test(m.text().split("What only you do:")[1]!), "nothing left to store by hand");
  assert.match(m.text(), /Done:[\s\S]*project created/);
});

test("idempotent: a second --yes registers nothing twice and adds no manifest entry", async () => {
  const m = machine({ claude: true });
  const args = ["--yes", "--agent", "claude,codex,cursor,claude-desktop"];
  assert.equal(await S.setupCommand(args, m.env), 0, m.text());
  const files = [join(m.home, ".codex", "config.toml"), join(m.home, ".cursor", "mcp.json"), join(m.home, "Library", "Application Support", "Claude", "claude_desktop_config.json"), join(m.cwd, "praeko-studio", ".gitignore"), join(m.cwd, "praeko-studio", ".praeko", "config.json")];
  const first = files.map((f) => readFileSync(f, "utf8")), entries = S.readManifest({ configDir: m.configDir }).entries.length, adds = m.calls.length;
  assert.equal(await S.setupCommand(args, m.env), 0, m.text());
  assert.deepEqual(files.map((f) => readFileSync(f, "utf8")), first);
  assert.equal(S.readManifest({ configDir: m.configDir }).entries.length, entries);
  assert.equal(m.calls.length, adds, "claude mcp add not called again");
  assert.equal((first[0]!.match(/\[mcp_servers\.praeko\]/g) || []).length, 1);
  assert.match(m.text(), /already registered/);
});

test("a Codex config that already has [mcp_servers.praeko], or a broken Cursor JSON, is left alone", async () => {
  const m = machine();
  mkdirSync(join(m.home, ".codex")); writeFileSync(join(m.home, ".codex", "config.toml"), '[mcp_servers.praeko]\nurl = "https://praeko.app/mcp"\n');
  mkdirSync(join(m.home, ".cursor")); writeFileSync(join(m.home, ".cursor", "mcp.json"), "{ // comment\n}");
  const before = snapshot(m.home);
  assert.equal(await S.setupCommand(["--yes", "--agent", "codex,cursor", "--no-install"], m.env), 0, m.text());
  assert.equal(snapshot(m.home)[".codex/config.toml"], before[".codex/config.toml"]);
  assert.equal(snapshot(m.home)[".cursor/mcp.json"], before[".cursor/mcp.json"]);
  assert.match(m.text(), /invalid JSON[\s\S]*by hand/);
});

test("uninstall: --plan changes nothing; --yes removes only what setup added (files created go, other servers stay, the project stays)", async () => {
  const m = machine({ claude: true });
  mkdirSync(join(m.home, ".cursor")); writeFileSync(join(m.home, ".cursor", "mcp.json"), JSON.stringify({ mcpServers: { other: { url: "https://x" } } }, null, 2) + "\n");
  assert.equal(await S.setupCommand(["--yes", "--agent", "claude,codex,cursor,claude-desktop"], m.env), 0, m.text());
  const proj = join(m.cwd, "praeko-studio"), before = snapshot(m.root);
  assert.equal(await S.setupCommand(["uninstall", "--plan"], m.env), 0);
  assert.equal(await S.setupCommand(["uninstall"], m.env), 0, "no TTY: plan only");
  assert.deepEqual(snapshot(m.root), before);
  assert.equal(await S.setupCommand(["uninstall", "--yes"], m.env), 0, m.text());
  assert.ok(!existsSync(join(m.home, ".codex", "config.toml")), "created by setup: removed");
  assert.deepEqual(JSON.parse(readFileSync(join(m.home, ".cursor", "mcp.json"), "utf8")), { mcpServers: { other: { url: "https://x" } } });
  assert.ok(!existsSync(join(m.home, "Library", "Application Support", "Claude", "claude_desktop_config.json")));
  assert.equal(JSON.parse(readFileSync(m.claudeJson, "utf8")).mcpServers.praeko, undefined);
  assert.deepEqual(m.calls.at(-1), ["/fake/bin/claude", "mcp", "remove", "praeko", "--scope", "user"]);
  assert.ok(existsSync(join(proj, "brand.json")), "the project stays");
  assert.ok(!existsSync(join(proj, ".praeko", "config.json")), "the profile file setup created goes");
  assert.ok(!existsSync(join(m.configDir, "setup-manifest.json")), "empty manifest removed");
  assert.equal(await S.setupCommand(["uninstall", "--yes"], m.env), 0);
  assert.match(m.text(), /Nothing to undo/);
});

test("uninstall keeps an entry the person changed after setup", async () => {
  const m = machine();
  assert.equal(await S.setupCommand(["--yes", "--agent", "cursor", "--no-install"], m.env), 0, m.text());
  const f = join(m.home, ".cursor", "mcp.json"), j = JSON.parse(readFileSync(f, "utf8"));
  j.mcpServers.praeko.url = "https://praeko.app/mcp?mine"; writeFileSync(f, JSON.stringify(j));
  assert.equal(await S.setupCommand(["uninstall", "--yes"], m.env), 0);
  assert.equal(JSON.parse(readFileSync(f, "utf8")).mcpServers.praeko.url, "https://praeko.app/mcp?mine");
  assert.match(m.text(), /changed after setup: kept/);
});

test(".gitignore of an existing project in a Git repository: plan shows the diff, apply only appends, git check-ignore agrees, uninstall removes only those lines", async () => {
  const m = machine({ whichGit: true });
  const proj = join(m.cwd, "chan");
  mkdirSync(join(proj, "src"), { recursive: true });
  writeFileSync(join(proj, "brand.json"), '{"name":"Chan"}'); writeFileSync(join(proj, "src", "index.ts"), "");
  const mine = "# mine\nnode_modules\n/out\nsecret.txt\n";
  writeFileSync(join(proj, ".gitignore"), mine);
  assert.equal(spawnSync("git", ["init", "-q", proj]).status, 0);
  assert.equal(await S.setupCommand(["--plan", "--json", "--agent", "claude"], { ...m.env, cwd: proj }), 0);
  const plan = JSON.parse(m.out.at(-1)!), gi = plan.steps.find((s: any) => s.kind === "gitignore");
  assert.equal(gi.action, "update");
  assert.ok(gi.diff.includes("+.praeko/cache/") && gi.diff.includes("+.env") && !gi.diff.includes("+node_modules/") && !gi.diff.includes("+out/"), JSON.stringify(gi.diff));
  assert.ok(!gi.diff.some((d: string) => d.includes("config.json")));
  assert.equal(plan.project.profile, "chan");
  assert.equal(readFileSync(join(proj, ".gitignore"), "utf8"), mine, "plan wrote nothing");
  assert.equal(await S.setupCommand(["--yes", "--agent", "claude"], { ...m.env, cwd: proj }), 0, m.text());
  const after = readFileSync(join(proj, ".gitignore"), "utf8");
  assert.ok(after.startsWith(mine), "only appended");
  assert.equal(spawnSync("git", ["-C", proj, "check-ignore", "-q", "--no-index", ".praeko/cache/x"]).status, 0);
  assert.equal(spawnSync("git", ["-C", proj, "check-ignore", "-q", "--no-index", ".env"]).status, 0);
  assert.notEqual(spawnSync("git", ["-C", proj, "check-ignore", "-q", "--no-index", ".praeko/config.json"]).status, 0, "config.json is not ignored");
  assert.equal(await S.setupCommand(["--yes", "--agent", "claude"], { ...m.env, cwd: proj }), 0);
  assert.equal(readFileSync(join(proj, ".gitignore"), "utf8"), after, "no duplicate lines");
  const man = S.readManifest({ configDir: m.configDir }).entries.find((e) => e.kind === "gitignore-lines") as any;
  assert.ok(man.lines.includes(".praeko/cache/") && !man.lines.includes("node_modules/"));
  assert.equal(await S.setupCommand(["uninstall", "--yes"], { ...m.env, cwd: proj }), 0, m.text());
  assert.equal(readFileSync(join(proj, ".gitignore"), "utf8"), mine, "back to the person's own lines");
  assert.ok(!existsSync(join(proj, "CLAUDE.md")) && !existsSync(join(proj, ".claude", "skills", "praeko-studio", "SKILL.md")), "instruction files setup created are removed");
});

test(".gitignore outside Git: created when missing, textual check, and an existing CLAUDE.md only loses the block setup appended", async () => {
  const m = machine();
  const proj = join(m.cwd, "p2");
  mkdirSync(join(proj, "src"), { recursive: true });
  writeFileSync(join(proj, "brand.json"), '{"name":"P"}'); writeFileSync(join(proj, "src", "index.ts"), "");
  writeFileSync(join(proj, "CLAUDE.md"), "# My notes\n");
  assert.equal(await S.setupCommand(["p2", "--yes", "--agent", "claude"], m.env), 0, m.text());
  const gi = readFileSync(join(proj, ".gitignore"), "utf8");
  assert.ok(gi.includes("node_modules/") && gi.includes(".praeko/cache/") && !gi.includes("config.json"));
  assert.match(readFileSync(join(proj, "CLAUDE.md"), "utf8"), /# My notes[\s\S]*praeko-studio:start/);
  assert.equal(await S.setupCommand(["uninstall", "--yes"], m.env), 0);
  assert.ok(!existsSync(join(proj, ".gitignore")), "created by setup, removed");
  assert.equal(readFileSync(join(proj, "CLAUDE.md"), "utf8"), "# My notes\n");
});

test("the key: without a TTY it refuses and prints the command for the person; never as an argument", async () => {
  const m = machine();
  let read = false;
  assert.equal(await S.setupCommand(["--key"], { ...m.env, readSecret: async () => { read = true; return KEY; } }), 1);
  assert.equal(read, false); assert.deepEqual(m.stored, {});
  assert.match(m.text(), /no terminal of your own[\s\S]*npx @praeko\/studio@\d+\.\d+\.\d+ setup --key/);
  await assert.rejects(S.setupCommand([`--key=${KEY}`], m.env), /never passed as an argument/);
  await assert.rejects(S.setupCommand(["--key", KEY], m.env), /never an argument/);
  assert.ok(!m.text().includes(KEY));
});

test("the key in a TTY: hidden reader, format check, stored for the profile, never printed; a secrets file in the project is refused", async () => {
  const m = machine({ tty: true });
  const proj = join(m.cwd, "chan"); mkdirSync(join(proj, "src", ".."), { recursive: true }); mkdirSync(join(proj, "src")); mkdirSync(join(proj, ".praeko"));
  writeFileSync(join(proj, "brand.json"), "{}"); writeFileSync(join(proj, "src", "index.ts"), ""); writeFileSync(join(proj, ".praeko", "config.json"), '{"profile":"chan"}');
  assert.equal(await S.setupCommand(["--key"], { ...m.env, cwd: proj, readSecret: async () => "not-a-key" }), 1);
  assert.deepEqual(m.stored, {});
  assert.equal(await S.setupCommand(["--key"], { ...m.env, cwd: proj, readSecret: async () => KEY }), 0, m.text());
  assert.deepEqual(m.stored, { "praeko/profile/chan": KEY }, "the project's profile");
  assert.ok(!m.text().includes(KEY)); assert.match(m.text(), /profile "chan"/);
  const m2 = machine({ tty: true, secrets: join(proj, "inside") });
  assert.equal(await S.setupCommand(["--key"], { ...m2.env, cwd: proj, readSecret: async () => KEY }), 1);
  assert.match(m2.text(), /inside this project folder/); assert.deepEqual(m2.stored, {});
  // a plain folder (the home directory, say) is not a project: the secrets file under it is fine (e2e of 12/11/2026: setup run from ~ refused the sign-in)
  const casa = join(base, "casa-sem-projeto"); mkdirSync(casa, { recursive: true });
  const m3 = machine({ tty: true, secrets: join(casa, ".config", "praeko", "secrets.json") });
  assert.equal(await S.setupCommand(["--key"], { ...m3.env, cwd: casa, readSecret: async () => KEY }), 0, m3.text());
  assert.doesNotMatch(m3.text(), /inside this project folder/);
});

test("the key from PRAEKO_KEY (no prompt, no TTY needed) is stored and never shown; --check-key: a rejected key is not stored and goes only to praeko.app", async () => {
  const m = machine({ env: { PRAEKO_KEY: KEY } });
  assert.equal(await S.setupCommand(["--key", "--profile", "work"], m.env), 0, m.text());
  assert.deepEqual(m.stored, { "praeko/profile/work": KEY });
  assert.ok(!m.text().includes(KEY));
  const urls: string[] = [];
  const m2 = machine({ env: { PRAEKO_KEY: KEY } });
  assert.equal(await S.setupCommand(["--key", "--check-key"], { ...m2.env, fetchFn: (async (u: string) => { urls.push(u); return new Response(null, { status: 401 }); }) as any }), 1);
  assert.deepEqual(m2.stored, {}); assert.deepEqual(urls, ["https://praeko.app/v1/api-keys"]);
  assert.ok(!m2.text().includes(KEY));
});

test("the plan and --json show only the profile and the source of the key, never the key", async () => {
  const m = machine({ env: { PRAEKO_KEY: KEY } });
  assert.equal(await S.setupCommand(["--json", "--agent", "codex"], m.env), 0);
  const j = JSON.parse(m.out.at(-1)!);
  assert.deepEqual(j.key, { present: true, source: "env", profile: "praeko-studio" });
  assert.equal(await S.setupCommand(["--plan", "--agent", "codex"], m.env), 0);
  assert.ok(!m.text().includes(KEY));
  const m2 = machine(); m2.stored["praeko/main"] = KEY;
  assert.equal(await S.setupCommand(["--json", "--agent", "codex"], m2.env), 0);
  assert.deepEqual(JSON.parse(m2.out.at(-1)!).key, { present: true, source: "global", profile: "praeko-studio" });
  assert.ok(!m2.text().includes(KEY));
});

test("key resolution and the reusable per-profile writer: PRAEKO_KEY > profile > global; the default profile is the old global key; real secrets file is 600", () => {
  const dir = join(base, "res"); mkdirSync(join(dir, ".praeko"), { recursive: true });
  writeFileSync(join(dir, ".praeko", "config.json"), '{"profile":"chan"}');
  const store: Record<string, string> = {}, get = (r: string) => store[r] ?? null;
  assert.deepEqual(V.resolvePraekoKey({ projectDir: dir, get, env: {} }), { key: null, source: null, profile: "chan" });
  store["praeko/main"] = "praeko_global_global_global_global";
  assert.equal(V.resolvePraekoKey({ projectDir: dir, get, env: {} }).source, "global");
  store["praeko/profile/chan"] = "praeko_profile_profile_profile_pro";
  assert.deepEqual(V.resolvePraekoKey({ projectDir: dir, get, env: {} }), { key: "praeko_profile_profile_profile_pro", source: "profile", profile: "chan" });
  assert.equal(V.resolvePraekoKey({ projectDir: dir, get, env: { PRAEKO_KEY: "praeko_env_env_env_env_env_env_env" } }).source, "env");
  assert.equal(V.readProjectProfile(join(base, "nothing")), null);
  assert.equal(V.profileFromName("Meu Canal Ótimo!"), "meu-canal-otimo");
  assert.throws(() => V.storePraekoKey("Bad Name", "x", () => "file"), /invalid profile/);
  // the real store (secrets file, no Keychain): mode 600, and the default profile is readable by the old getKey("praeko/main")
  assert.equal(V.storePraekoKey("default", KEY), "file");
  assert.equal(V.storePraekoKey("chan", KEY + "2"), "file");
  assert.equal(statSync(process.env.PRAEKO_SECRETS!).mode & 0o777, 0o600);
  assert.equal(V.getKey("praeko/main"), KEY);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(process.env.PRAEKO_SECRETS!, "utf8"))).sort(), ["praeko/chave", "praeko/profile/chan"]);
  assert.equal(V.resolvePraekoKey({ projectDir: dir, env: {} }).key, KEY + "2");
});

test("readHidden: raw mode, no echo, Backspace erases, Enter ends; Ctrl-C cancels", async () => {
  const mk = () => { const input = new PassThrough() as any; input.isTTY = true; const modes: boolean[] = []; input.setRawMode = (b: boolean) => { modes.push(b); }; const output = new PassThrough(); let shown = ""; output.on("data", (d) => (shown += d)); return { input, output, modes, shown: () => shown }; };
  const a = mk(), p = S.readHidden("key: ", a.input, a.output);
  a.input.write("praeko_x"); a.input.write("\u007f"); a.input.write("abc\r");
  assert.equal(await p, "praeko_abc");
  assert.equal(a.shown(), "key: \n"); assert.deepEqual(a.modes, [true, false]);
  const b = mk(), q = S.readHidden("key: ", b.input, b.output);
  b.input.write("praeko_\u0003");
  await assert.rejects(q, /cancelled/);
  const notty = new PassThrough() as any;
  await assert.rejects(S.readHidden("k", notty, new PassThrough()), /no terminal/);
});

test("the CLI: `setup --plan --json` through the bin writes nothing; `setup --key` without a terminal refuses", () => {
  const home = mkdtempSync(join(tmpdir(), "studio-setup-bin-")), work = join(home, "work"); mkdirSync(work);
  const BIN = new URL("../bin/praeko-studio.ts", import.meta.url).pathname;
  const env = { ...process.env, HOME: home, PRAEKO_NO_KEYCHAIN: "1", PRAEKO_SECRETS: join(home, "s.json"), PRAEKO_STUDIO_CONFIG: join(home, "cfg"), PATH: process.env.PATH, PRAEKO_KEY: "" };
  const before = snapshot(home);
  const r = spawnSync(process.execPath, [BIN, "setup", "--plan", "--json", "--agent", "codex,cursor"], { cwd: work, env, encoding: "utf8", input: "" });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.applied, false); assert.ok(j.steps.length > 0);
  assert.deepEqual(snapshot(home), before);
  const k = spawnSync(process.execPath, [BIN, "setup", "--key"], { cwd: work, env, encoding: "utf8", input: KEY + "\n" });
  assert.equal(k.status, 1); assert.match(k.stderr, /no terminal of your own/);
  assert.ok(!existsSync(join(home, "s.json")));
  assert.ok(!(k.stdout + k.stderr).includes(KEY));
});

// ---------- the sign-in by code inside setup ----------
/** Every file under a folder whose content contains `needle` (the key must be in none: project, config dir, backups, manifest). */
const filesWith = (dir: string, needle: string): string[] => Object.entries(snapshot(dir)).filter(([, t]) => t.includes(needle)).map(([f]) => f);

test("setup and the sign-in by code: --plan only announces it (no request); --yes without a key signs in, stores for the profile, never shows the key anywhere", async () => {
  const m = machine({ claude: true });
  assert.equal(await S.setupCommand(["--plan", "--agent", "claude"], m.env), 0);
  assert.match(m.text(), /\+ sign in to Praeko by code for profile "praeko-studio" \(npx @praeko\/studio@[\d.]+ login --profile praeko-studio\)/);
  assert.match(m.text(), /What only you do:[\s\S]*Approve Praeko Studio in the browser \(code shown in the terminal\)/);
  assert.equal(m.device.codeBodies.length, 0, "the plan asks Praeko for nothing");
  m.out.length = 0; m.err.length = 0;
  assert.equal(await S.setupCommand(["--yes", "--agent", "claude,codex"], m.env), 0, m.text());
  assert.deepEqual(m.device.codeBodies, [{ computerName: "Test-Mac", os: "macOS" }]);
  assert.deepEqual(m.stored, { "praeko/profile/praeko-studio": DEVICE_KEY });
  assert.deepEqual(m.opened, ["https://praeko.app/device?code=BCDF-GHJK"]);
  assert.match(m.text(), /Done:[\s\S]*Sign in to Praeko[\s\S]*type the code: BCDF-GHJK[\s\S]*approved[\s\S]*What only you do:/);
  assert.ok(!/Approve Praeko Studio/.test(m.text().split("What only you do:")[1]!), "approved: nothing left about the key");
  assert.ok(!m.text().includes(DEVICE_KEY));
  assert.deepEqual(filesWith(m.root, DEVICE_KEY), [], "not in the project, the config dir, the backups or the manifest");
  // idempotent: the key now resolves (profile), so a second run skips the sign-in and says where the key came from
  m.out.length = 0;
  assert.equal(await S.setupCommand(["--yes", "--agent", "claude,codex"], m.env), 0, m.text());
  assert.equal(m.device.codeBodies.length, 1, "no second sign-in");
  assert.match(m.text(), /Praeko key already found \(profile; never shown\): no sign-in needed/);
});

test("setup with a key already resolved (PRAEKO_KEY or the global key) never offers the sign-in", async () => {
  const m = machine({ env: { PRAEKO_KEY: KEY } });
  assert.equal(await S.setupCommand(["--yes", "--agent", "codex"], m.env), 0, m.text());
  assert.equal(m.device.codeBodies.length, 0);
  assert.match(m.text(), /= Praeko key already found \(env; never shown\)/);
  const m2 = machine(); m2.stored["praeko/main"] = KEY;
  assert.equal(await S.setupCommand(["--json", "--yes", "--agent", "codex"], m2.env), 0);
  const j = JSON.parse(m2.out.at(-1)!);
  assert.equal(j.steps.find((s: any) => s.kind === "login").action, "skip"); assert.equal(j.login, undefined); assert.equal(j.key.source, "global");
  assert.equal(m2.device.codeBodies.length, 0);
  assert.ok(!m.text().includes(KEY) && !m2.text().includes(KEY));
});

test("setup --json --yes (an agent, no TTY): stdout is ONE JSON document with the login result; the code goes to stderr as a JSON line; never the key", async () => {
  const m = machine({ device: ["pending"] });
  assert.equal(await S.setupCommand(["--json", "--yes", "--agent", "claude"], m.env), 0, m.text());
  assert.equal(m.out.length, 1);
  const j = JSON.parse(m.out[0]!);
  assert.deepEqual({ status: j.login.status, profile: j.login.profile, keyName: j.login.keyName }, { status: "authorized", profile: "praeko-studio", keyName: "Studio · Test-Mac" });
  assert.equal(j.login.key, undefined); assert.deepEqual(j.key, { present: true, source: "profile", profile: "praeko-studio" });
  const waiting = m.err.map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((x) => x?.status === "waiting_for_approval");
  assert.equal(waiting.userCode, "BCDF-GHJK"); assert.equal(waiting.verificationUrl, "https://praeko.app/device");
  assert.ok(!m.text().includes(DEVICE_KEY));
});

test("setup: a denied or expired sign-in leaves the files applied, exits 1 and lists the login command and the paste-a-key plan B; a TTY can decline", async () => {
  const m = machine({ device: ["denied"] });
  assert.equal(await S.setupCommand(["--yes", "--agent", "codex", "--profile", "chan"], m.env), 1);
  assert.ok(existsSync(join(m.cwd, "praeko-studio", ".praeko", "config.json")));
  assert.match(m.text(), /you denied it[\s\S]*Approve Praeko Studio in the browser \(code shown in the terminal\): run npx @praeko\/studio@[\d.]+ login --profile chan[\s\S]*setup --key --profile chan[\s\S]*sign-in did not finish/);
  assert.deepEqual(m.stored, {});
  // a person in their own terminal: the plan is accepted, the sign-in declined, the paste declined too
  const asked: string[] = [];
  const t = machine({ tty: true });
  assert.equal(await S.setupCommand(["--agent", "codex"], { ...t.env, ask: async (q) => { asked.push(q); return q.includes("Apply this plan") ? "y" : "n"; } }), 0, t.text());
  assert.ok(asked.some((q) => /Sign in to Praeko now\?/.test(q)) && asked.some((q) => /Paste a Praeko write key instead/.test(q)));
  assert.equal(t.device.codeBodies.length, 0); assert.deepEqual(t.stored, {});
  assert.match(t.text(), /What only you do:[\s\S]*login --profile praeko-studio/);
  // expired in a terminal: offers a new code
  const e = machine({ tty: true, device: ["expired"] });
  assert.equal(await S.setupCommand(["--agent", "codex", "--no-browser"], { ...e.env, ask: async () => "y" }), 0, e.text());
  assert.match(e.text(), /expired before it was approved[\s\S]*approved/); assert.equal(e.device.codeBodies.length, 2); assert.deepEqual(e.opened, []);
  assert.equal(e.stored["praeko/profile/praeko-studio"], DEVICE_KEY);
  // uninstall never removes the key
  assert.equal(await S.setupCommand(["uninstall", "--yes"], e.env), 0);
  assert.equal(e.stored["praeko/profile/praeko-studio"], DEVICE_KEY); assert.match(e.text(), /The Praeko key stays where it is/);
});

// ---------- 0.3.2: --no-login and commands that work without @praeko/cli ----------
test("setup --no-login: --plan and --yes neither offer nor run the sign-in; the summary says it is optional and how to do it later", async () => {
  const m = machine({ claude: true, tty: true });
  m.env.ask = async () => { throw new Error("no question about the sign-in with --no-login"); };
  assert.equal(await S.setupCommand(["--plan", "--no-login", "--agent", "claude"], m.env), 0, m.text());
  assert.match(m.text(), /= sign-in by code skipped \(--no-login\): it is optional/);
  assert.doesNotMatch(m.text(), /\+ sign in to Praeko by code/);
  assert.match(m.text(), /What only you do:[\s\S]*Optional, not needed for your first video: authorize Praeko Studio[\s\S]*npx @praeko\/studio@[\d.]+ login in the project folder/);
  assert.doesNotMatch(m.text().split("What only you do:")[1]!, /Approve Praeko Studio in the browser/);
  m.out.length = 0; m.err.length = 0;
  assert.equal(await S.setupCommand(["--yes", "--no-login", "--agent", "claude"], m.env), 0, m.text());
  assert.equal(m.device.codeBodies.length, 0, "no request to Praeko");
  assert.deepEqual(m.stored, {}); assert.deepEqual(m.opened, []);
  assert.match(m.text(), /Optional, not needed for your first video/);
  assert.match(m.text(), /Next: in the project folder \([^)]*praeko-studio\), ask your agent to follow `npx @praeko\/studio@[\d.]+ docs first-video`/);
  // --json: one document, noLogin true, no login outcome
  const j0 = machine();
  assert.equal(await S.setupCommand(["--json", "--yes", "--no-login", "--agent", "codex"], j0.env), 0);
  const j = JSON.parse(j0.out.at(-1)!);
  assert.equal(j.noLogin, true); assert.equal(j.login, undefined);
  assert.equal(j.steps.find((s: any) => s.kind === "login").reason, "--no-login");
  assert.equal(j0.device.codeBodies.length, 0);
  // without the flag nothing changes: the sign-in is still offered
  const w = machine();
  assert.equal(await S.setupCommand(["--plan", "--agent", "codex"], w.env), 0);
  assert.match(w.text(), /\+ sign in to Praeko by code/);
});

test("every command the CLI tells you to run is the scoped package at this version: never the unscoped npx praeko-studio / npx praeko, never a bare praeko studio", async () => {
  const { VERSION } = await import("../src/version.ts");
  const BIN = new URL("../bin/praeko-studio.ts", import.meta.url).pathname;
  const home = mkdtempSync(join(tmpdir(), "studio-npx-")), work = join(home, "work"); mkdirSync(work);
  // a PATH with only the folder of node: no `praeko` (from @praeko/cli) and no `praeko-studio` anywhere
  const nodeDir = join(process.execPath, "..");
  const env = { HOME: home, PATH: nodeDir, PRAEKO_NO_KEYCHAIN: "1", PRAEKO_SECRETS: join(home, "s.json"), PRAEKO_STUDIO_CONFIG: join(home, "cfg"), PRAEKO_KEY: "", PRAEKO_STUDIO_NO_NOTICE: "1" };
  const found = spawnSync("/bin/sh", ["-c", "command -v praeko"], { env, encoding: "utf8" }); // not found: status 1 in bash, 127 in dash (Ubuntu's /bin/sh)
  assert.ok(found.status !== 0 && found.stdout.trim() === "", "the test PATH has no praeko");
  const proibido = /npx praeko(?:-studio|@| )/, bare = /(?<![\w@/-])praeko studio (?!<command> also works)/;
  const scoped = (txt: string) => [...txt.matchAll(/npx @praeko\/studio@([^\s`'"),;]+)/g)].map((m) => m[1]);
  const confere = (name: string, txt: string) => {
    for (const l of txt.split("\n")) { assert.ok(!proibido.test(l), `${name}: ${l}`); assert.ok(!bare.test(l) || /@praeko\/cli/.test(l), `${name}: ${l}`); }
    for (const v of scoped(txt)) assert.equal(v, VERSION, `${name}: npx @praeko/studio@${v}`);
    assert.ok(!txt.includes("@praeko/studio@<version>") || name.startsWith("skill"), `${name}: marker left`);
  };
  const runs: [string, string[]][] = [["help", []], ["unknown", ["nothing-here"]], ["setup --help", ["setup", "--help"]], ["login --help", ["login", "--help"]], ["setup --plan", ["setup", "--plan", "--agent", "codex"]], ["setup --plan --no-login", ["setup", "--plan", "--no-login", "--agent", "codex"]],
    ["doctor --offline", ["doctor", "--offline"]], ["docs", ["docs"]], ["new outside a project", ["new", "x"]], ["skill install usage", ["skill"]]];
  for (const t of ["first-video", "episode-yaml", "long-yaml", "publish", "review", "voice", "hyperframes"]) runs.push([`docs ${t}`, ["docs", t]]);
  for (const lang of ["en", "pt"]) for (const [name, args] of runs) {
    const r = spawnSync(process.execPath, [BIN, ...args, "--lang", lang], { cwd: work, env, encoding: "utf8", input: "" });
    confere(`${name} (${lang})`, r.stdout + "\n" + r.stderr);
  }
  const r = spawnSync(process.execPath, [BIN, "docs", "first-video"], { cwd: work, env, encoding: "utf8" });
  assert.ok(r.stdout.includes(`npx @praeko/studio@${VERSION} doctor`)); assert.match(r.stdout, /no Praeko key and no sign-in/);
  // the agent instructions the CLI writes into a project (every agent, en and pt)
  for (const lang of ["en", "pt"]) {
    const dir = join(home, "skill-" + lang); mkdirSync(dir);
    const s = spawnSync(process.execPath, [BIN, "skill", "install", "--agent", "all", "--lang", lang, "--dir", dir], { cwd: work, env, encoding: "utf8" });
    assert.equal(s.status, 0, s.stderr);
    const files = (readdirSync(dir, { recursive: true }) as string[]).filter((f) => statSync(join(dir, f)).isFile());
    assert.ok(files.length >= 7, files.join(", "));
    for (const f of files) { const txt = readFileSync(join(dir, f), "utf8"); confere(`skill ${lang} ${f}`, txt); assert.ok(scoped(txt).length > 0 || !/npx/.test(txt), `${f}: no scoped command`); }
  }
});

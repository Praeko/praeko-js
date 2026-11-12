// `praeko studio login`: sign-in by code (device authorization, docs/device-login.md) against a fake Praeko (a local HTTP server on 127.0.0.1 or an in-process fetch).
// Covers the happy path, --json without a TTY, expired_token, access_denied, slow_down, network failures with back-off, Ctrl+C, the profile of the project,
// the browser (opened, --no-browser, failing) and that the key never appears in any output. Fake HOME and an injected store: the real Keychain and praeko.app are never touched.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LoginEnv } from "../src/login.ts";
import { DEVICE_KEY, fakeDevice, virtualClock } from "./device-fake.ts";
import type { Answer } from "./device-fake.ts";

const base = mkdtempSync(join(tmpdir(), "studio-login-"));
process.env.PRAEKO_NO_KEYCHAIN = "1";
process.env.PRAEKO_SECRETS = join(base, "global-secrets.json");
process.env.PRAEKO_STUDIO_CONFIG = join(base, "global-cfg");
delete process.env.PRAEKO_KEY; delete process.env.PRAEKO_URL; delete process.env.PRAEKO_STUDIO_KEY_PRAEKO_MAIN;
const L = await import("../src/login.ts");

let n = 0;
function box(o: { script?: Answer[]; slowDownTo?: number; expiresIn?: number; codeStatus?: number; env?: Record<string, string>; browser?: boolean; secrets?: string; storeFails?: boolean } = {}) {
  const root = join(base, `b${++n}`), cwd = join(root, "work"); mkdirSync(cwd, { recursive: true });
  const out: string[] = [], err: string[] = [], stored: Record<string, string> = {}, opened: string[] = [];
  const device = fakeDevice({ script: o.script, slowDownTo: o.slowDownTo, expiresIn: o.expiresIn, codeStatus: o.codeStatus }), clock = virtualClock();
  const env: LoginEnv = {
    env: { ...(o.env || {}) }, platform: "darwin", cwd, fetchFn: device.fetchFn,
    storeKey: (ref, k) => { if (o.storeFails) throw new Error("security: refused " + k); stored[ref] = k; return "file"; }, getKey: (ref) => stored[ref] ?? null,
    secretsPath: o.secrets ?? join(root, "home", ".config", "praeko", "secrets.json"), usesKeychain: false,
    hostname: () => "Test-Mac.local", openBrowser: async (u) => { opened.push(u); return o.browser ?? true; }, sleep: clock.sleep, now: clock.now,
    out: (s) => out.push(s), err: (s) => err.push(s), isTTY: false, ask: async () => { throw new Error("must not ask"); },
  };
  return { root, cwd, out, err, stored, opened, device, clock, env, text: () => out.join("\n") + "\n" + err.join("\n") };
}
const noKey = (b: { text: () => string }) => { assert.ok(!b.text().includes(DEVICE_KEY), "the key never appears"); assert.ok(!b.text().includes("pkdc_"), "nor the device code"); };

test("happy path against a local HTTP server: prints the address and the code, opens the browser, stores the key for the profile, never shows it", async () => {
  const b = box({ script: ["pending", "pending"] });
  const srv = await b.device.serve();
  try {
    assert.equal(await L.loginCommand(["--server", srv.url], b.env), 0, b.text());
  } finally { await srv.close(); }
  assert.match(b.out.join("\n"), new RegExp(`Open ${srv.url.replace(/\./g, "\\.")}/device and type the code: BCDF-GHJK`));
  assert.deepEqual(b.opened, [`${srv.url}/device?code=BCDF-GHJK`]);
  assert.deepEqual(b.device.codeBodies, [{ computerName: "Test-Mac", os: "macOS" }]);
  assert.equal(b.device.polls, 3);
  assert.deepEqual(b.clock.waits, [5000, 5000, 5000], "respects the interval");
  assert.deepEqual(b.stored, { "praeko/main": DEVICE_KEY }, "no project, no --profile: the global (default) profile");
  assert.match(b.text(), /approved in workspace "Chan": key "Studio · Test-Mac" \(praeko_DevI…\) stored in .*secrets\.json \(permission 600\), profile "default"/);
  noKey(b);
});

test("--json without a TTY: one JSON line when waiting, one when authorized; never the key; human lines on stderr", async () => {
  const b = box({ script: ["pending"] });
  assert.equal(await L.loginCommand(["--json", "--profile", "work"], b.env), 0, b.text());
  assert.equal(b.out.length, 2, b.out.join("\n"));
  const [w, a] = b.out.map((l) => JSON.parse(l));
  assert.equal(w.status, "waiting_for_approval"); assert.equal(w.userCode, "BCDF-GHJK"); assert.equal(w.verificationUrl, "https://praeko.app/device"); assert.equal(w.expiresAt, "2026-11-12T15:40:00.000Z");
  assert.equal(w.verificationUrlComplete, "https://praeko.app/device?code=BCDF-GHJK"); assert.equal(w.deviceCode, undefined);
  assert.deepEqual(Object.keys(a).sort(), ["keyName", "prefix", "profile", "status", "storage", "workspace"]);
  assert.deepEqual({ status: a.status, profile: a.profile, keyName: a.keyName }, { status: "authorized", profile: "work", keyName: "Studio · Test-Mac" });
  assert.match(b.err.join("\n"), /type the code: BCDF-GHJK/);
  assert.deepEqual(b.stored, { "praeko/profile/work": DEVICE_KEY });
  noKey(b);
});

test("expired_token (from the server, or the clock passing expiresIn): nothing stored, says to run it again", async () => {
  const b = box({ script: ["pending", "expired"] });
  assert.equal(await L.loginCommand(["--json"], b.env), 1);
  assert.equal(JSON.parse(b.out.at(-1)!).status, "expired");
  assert.match(b.text(), /expired before it was approved[\s\S]*npx @praeko\/studio@\d+\.\d+\.\d+ login/);
  assert.deepEqual(b.stored, {});
  const c = box({ script: Array(50).fill("pending"), expiresIn: 12 });
  assert.equal(await L.loginCommand([], c.env), 1);
  assert.match(c.text(), /expired/); assert.ok(c.device.polls <= 3, `stopped at the deadline (${c.device.polls} polls)`); assert.deepEqual(c.stored, {});
  noKey(b); noKey(c);
});

test("access_denied: a clear message, nothing stored", async () => {
  const b = box({ script: ["pending", "denied"] });
  assert.equal(await L.loginCommand([], b.env), 1);
  assert.match(b.text(), /you denied it, or the code was blocked/);
  assert.deepEqual(b.stored, {});
  const j = box({ script: ["denied"] });
  assert.equal(await L.loginCommand(["--json"], j.env), 1);
  assert.equal(JSON.parse(j.out.at(-1)!).status, "denied");
  const g = box({ script: ["invalid"] });
  assert.equal(await L.loginCommand([], g.env), 1); assert.match(g.text(), /no longer valid/);
});

test("slow_down raises the interval (the server's new value) and keeps it", async () => {
  const b = box({ script: ["slow_down", "pending", "pending"], slowDownTo: 10 });
  assert.equal(await L.loginCommand([], b.env), 0, b.text());
  assert.deepEqual(b.clock.waits, [5000, 10000, 10000, 10000]);
});

test("network failures while polling: backs off, says so without details, then resumes and stores the key (real HTTP server dropping connections)", async () => {
  const b = box({ script: ["drop", "drop", "500", "pending"] });
  const srv = await b.device.serve();
  try { assert.equal(await L.loginCommand(["--server", srv.url], b.env), 0, b.text()); } finally { await srv.close(); }
  assert.deepEqual(b.clock.waits, [5000, 10000, 20000, 40000, 5000], "doubles after each failure, back to the interval once Praeko answers");
  assert.match(b.text(), /no answer from Praeko \(network\?\): trying again more slowly[\s\S]*connected to Praeko again/);
  assert.equal(b.stored["praeko/main"], DEVICE_KEY);
  assert.ok(!/fetch failed|ECONN|socket/i.test(b.text()), "no raw network error");
  noKey(b);
  // no network at all when asking for the code: a short error, nothing stored
  const c = box(); c.env.fetchFn = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
  assert.equal(await L.loginCommand([], c.env), 1); assert.match(c.text(), /could not reach Praeko at https:\/\/praeko\.app/); assert.deepEqual(c.stored, {});
  const d = box({ codeStatus: 429 });
  assert.equal(await L.loginCommand([], d.env), 1); assert.match(d.text(), /limiting sign-in requests/);
});

test("Ctrl+C while waiting: cancels cleanly (exit 130), nothing stored; also through the SIGINT handler", async () => {
  const b = box({ script: Array(10).fill("pending") });
  const ac = new AbortController(); let k = 0;
  const sleep = b.env.sleep!;
  b.env.signal = ac.signal; b.env.sleep = async (ms, s) => { if (++k === 3) ac.abort(); return sleep(ms, s); };
  assert.equal(await L.loginCommand([], b.env), 130);
  assert.match(b.text(), /cancelled: nothing was stored/); assert.deepEqual(b.stored, {});
  const c = box({ script: Array(10).fill("pending") });
  let j = 0; const sleep2 = c.env.sleep!;
  c.env.sleep = async (ms, s) => { if (++j === 2) process.emit("SIGINT" as any); return sleep2(ms, s); };
  const before = process.listenerCount("SIGINT");
  assert.equal(await L.loginCommand(["--json"], c.env), 130);
  assert.equal(JSON.parse(c.out.at(-1)!).status, "cancelled"); assert.deepEqual(c.stored, {});
  assert.equal(process.listenerCount("SIGINT"), before, "the handler is removed");
});

test("the profile: the project's .praeko/config.json, --profile wins; invalid names, bad servers and --logout are refused", async () => {
  const b = box();
  const proj = join(b.cwd, "chan"); mkdirSync(join(proj, ".praeko"), { recursive: true }); mkdirSync(join(proj, "src"));
  writeFileSync(join(proj, "brand.json"), "{}"); writeFileSync(join(proj, "src", "index.ts"), ""); writeFileSync(join(proj, ".praeko", "config.json"), '{"profile":"chan"}');
  assert.equal(await L.loginCommand([], { ...b.env, cwd: join(proj, "src") }), 0, b.text());
  assert.deepEqual(Object.keys(b.stored), ["praeko/profile/chan"]);
  assert.equal(await L.loginCommand(["--profile", "other"], { ...b.env, cwd: proj }), 0);
  assert.deepEqual(Object.keys(b.stored).sort(), ["praeko/profile/chan", "praeko/profile/other"]);
  assert.ok(!existsSync(join(proj, ".praeko", "secrets.json")) && readFileSync(join(proj, ".praeko", "config.json"), "utf8") === '{"profile":"chan"}', "nothing written into the project");
  await assert.rejects(L.loginCommand(["--profile", "Bad Name"], b.env), /--profile takes a name/);
  await assert.rejects(L.loginCommand(["--logout"], b.env), /does not exist yet/);
  await assert.rejects(L.loginCommand([DEVICE_KEY], b.env), /takes no argument/);
  assert.equal(await L.loginCommand(["--server", "http://example.com"], b.env), 1);
  assert.match(b.text(), /https:\/\/… \(http only for localhost\)/);
  // a secrets file inside the project: refused BEFORE asking Praeko for a code (no key is created)
  const c = box({ secrets: join(proj, "secrets.json") }); const before = c.device.codeBodies.length;
  assert.equal(await L.loginCommand([], { ...c.env, cwd: proj }), 1);
  assert.match(c.text(), /inside this project folder/); assert.equal(c.device.codeBodies.length, before); assert.deepEqual(c.stored, {});
});

test("the browser: --no-browser never opens it; a failing open only prints the address", async () => {
  const b = box();
  assert.equal(await L.loginCommand(["--no-browser"], b.env), 0);
  assert.deepEqual(b.opened, []); assert.match(b.text(), /type the code: BCDF-GHJK/); assert.ok(!/opened the browser/.test(b.text()));
  const c = box({ browser: false });
  assert.equal(await L.loginCommand([], c.env), 0);
  assert.equal(c.opened.length, 1); assert.match(c.text(), /could not open the browser: open the address above yourself/);
  const d = box(); d.env.openBrowser = async () => { throw new Error("spawn xdg-open ENOENT"); };
  assert.equal(await L.loginCommand([], d.env), 0); assert.match(d.text(), /could not open the browser/);
  assert.deepEqual(L.browserCommand("darwin", "https://praeko.app/device?code=A"), ["open", ["https://praeko.app/device?code=A"]]);
  assert.deepEqual(L.browserCommand("linux", "https://x/device"), ["xdg-open", ["https://x/device"]]);
  assert.equal(L.browserCommand("win32", "https://x/device")[0], "cmd");
});

test("a store that refuses: no key printed (not even from the error), tells to revoke it; PRAEKO_KEY in the environment is flagged", async () => {
  const b = box({ storeFails: true });
  assert.equal(await L.loginCommand(["--json"], b.env), 1);
  assert.match(b.text(), /could not store the key[\s\S]*Revoke "Studio · Test-Mac"/); assert.equal(JSON.parse(b.out.at(-1)!).status, "error");
  noKey(b);
  const c = box({ env: { PRAEKO_KEY: "praeko_env-fake-key" } });
  assert.equal(await L.loginCommand([], c.env), 0);
  assert.match(c.text(), /PRAEKO_KEY is set in this environment and wins/); assert.ok(!c.text().includes("praeko_env-fake"));
});

test("computer name and system sent to Praeko: no domain suffix, safe characters, at most 40", () => {
  assert.equal(L.computerName("Ana-MacBook-Pro.local"), "Ana-MacBook-Pro");
  assert.equal(L.computerName("pc\u202Eevil\n<script>"), "pc-evil-script");
  assert.equal(L.computerName(""), "computer");
  assert.equal(L.computerName("x".repeat(80)).length, 40);
  assert.equal(L.osName("darwin"), "macOS"); assert.equal(L.osName("linux"), "Linux"); assert.equal(L.osName("win32"), "Windows");
});

test("the CLI through the bin, no TTY, --json, against a local server: the agent sees only the code; the key lands in the secrets file (600), never on stdout/stderr", async () => {
  const home = mkdtempSync(join(tmpdir(), "studio-login-bin-")), work = join(home, "work"); mkdirSync(work);
  const device = fakeDevice({ interval: 1 }); const srv = await device.serve();
  const BIN = new URL("../bin/praeko-studio.ts", import.meta.url).pathname, secrets = join(home, "s.json");
  const env = { ...process.env, HOME: home, PRAEKO_NO_KEYCHAIN: "1", PRAEKO_SECRETS: secrets, PRAEKO_STUDIO_CONFIG: join(home, "cfg"), PRAEKO_KEY: "", PRAEKO_URL: srv.url };
  const r = await new Promise<{ code: number | null; stdout: string; stderr: string }>((ok) => {
    const p = spawn(process.execPath, [BIN, "login", "--json", "--no-browser", "--profile", "bin"], { cwd: work, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = ""; p.stdout.on("data", (d) => (stdout += d)); p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (code) => ok({ code, stdout, stderr }));
  });
  await srv.close();
  assert.equal(r.code, 0, r.stderr);
  const lines = r.stdout.trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => l.status), ["waiting_for_approval", "authorized"]);
  assert.equal(lines[0].userCode, "BCDF-GHJK");
  assert.ok(!(r.stdout + r.stderr).includes(DEVICE_KEY));
  assert.equal(JSON.parse(readFileSync(secrets, "utf8"))["praeko/profile/bin"], DEVICE_KEY);
  const { statSync } = await import("node:fs");
  assert.equal(statSync(secrets).mode & 0o777, 0o600);
});

test("the profile already has a key: in a terminal it asks first (default: keep, nothing requested); with --yes, --json or no terminal it replaces it and says so", async () => {
  const OLD = "praeko_old-fake-key";
  // a terminal, answer Enter: kept, no request to Praeko, the old key untouched and never shown
  const b = box(); b.stored["praeko/profile/chan"] = OLD;
  const asked: string[] = [];
  assert.equal(await L.loginCommand(["--profile", "chan"], { ...b.env, isTTY: true, ask: async (q) => { asked.push(q); return ""; } }), 0);
  assert.match(asked[0]!, /Profile "chan" already has a Praeko key \(in the secrets file; not shown\)\. Replace it[\s\S]*\[y\/N\]/);
  assert.equal(b.device.codeBodies.length, 0); assert.equal(b.stored["praeko/profile/chan"], OLD);
  assert.match(b.text(), /Kept the current key of profile "chan"/);
  // a terminal, answer yes: replaced
  assert.equal(await L.loginCommand(["--profile", "chan"], { ...b.env, isTTY: true, ask: async () => "y" }), 0);
  assert.equal(b.stored["praeko/profile/chan"], DEVICE_KEY); assert.match(b.text(), /already had a key: it was replaced by "Studio · Test-Mac"/);
  // a terminal with --yes: no question
  b.stored["praeko/profile/chan"] = OLD;
  assert.equal(await L.loginCommand(["--profile", "chan", "--yes"], { ...b.env, isTTY: true }), 0);
  assert.equal(b.stored["praeko/profile/chan"], DEVICE_KEY);
  assert.ok(!b.text().includes(OLD) && !b.text().includes(DEVICE_KEY));
  // no terminal, --json (an agent): replaces and says so in the final JSON line
  const c = box(); c.stored["praeko/main"] = OLD;
  assert.equal(await L.loginCommand(["--json"], c.env), 0);
  const last = JSON.parse(c.out.at(-1)!);
  assert.equal(last.status, "authorized"); assert.equal(last.replaced, true); assert.equal(c.stored["praeko/main"], DEVICE_KEY);
  assert.equal(c.out.length, 2, "stdout stays JSON lines only"); assert.match(c.err.join("\n"), /already has a Praeko key[\s\S]*will be replaced/);
  // no terminal, no --json: replaces with a warning; a profile without a key gets no "replaced"
  const d = box(); d.stored["praeko/profile/work"] = OLD;
  assert.equal(await L.loginCommand(["--profile", "work"], d.env), 0); assert.match(d.text(), /was replaced/);
  const e = box(); e.stored["praeko/main"] = OLD; // the global key is not the key of profile "fresh"
  assert.equal(await L.loginCommand(["--profile", "fresh", "--json"], e.env), 0);
  assert.equal(JSON.parse(e.out.at(-1)!).replaced, undefined); assert.equal(e.stored["praeko/main"], OLD);
  for (const x of [c, d, e]) assert.ok(!x.text().includes(OLD) && !x.text().includes(DEVICE_KEY));
});

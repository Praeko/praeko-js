// `praeko studio setup [folder] [--plan] [--yes] [--agent …] [--json] [--no-install]`, `setup --key [--check-key]` and `setup uninstall [--plan] [--yes] [--json]`.
// Connects the person's AI agents to Praeko on this machine:
//   1. checks the machine (the doctor's Node, npm, ffmpeg, ffprobe, Chrome and license lines) and proposes the install command for the system (it never installs system packages);
//   2. detects agents by their binaries and configuration folders;
//   3. registers the REMOTE MCP server (https://praeko.app/mcp) in each agent's own format, never with a key in the file (sign-in, or the PRAEKO_KEY variable),
//      and the LOCAL Studio MCP (@praeko/studio-mcp) where there is no terminal (Claude Desktop);
//   4. creates the Studio project with `init --agent` (or updates the instructions of an existing one) so the agent knows how to work;
//   5. when no Praeko key resolves for the project's profile, signs in by code (`praeko studio login`, login.ts): a short code, approved by the person at
//      praeko.app/device; the key comes back once and goes straight to the profile's store (it also works without a TTY: an agent only sees the code);
//   6. ends with the list of what only the person does.
// The plan comes first and changes nothing. Every file it touches is backed up (dated folder under the Studio config dir) and recorded in a manifest;
// `setup uninstall` removes only what that manifest says setup added, and only while it is still exactly what setup wrote.
// The Praeko key: by sign-in with a code (the main path), or pasted with `setup --key` (plan B: only with a terminal of the person's own (TTY), hidden input);
// both store it with the same mechanism as `schedule --key` (macOS Keychain, elsewhere ~/.config/praeko/secrets.json with mode 600).
// Never an argument, never in the project, never printed, logged or in --json.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, delimiter, dirname, join, relative, resolve, sep } from "node:path";
import { DEFAULT_PROFILE, PROJECT_CONFIG, getKey as realGetKey, keychainActive, praekoKeyRef, profileFromName, readProjectProfile, resolvePraekoKey, secretsFile, storeKey as realStoreKey, storePraekoKey, userConfigDir, validProfile } from "@praeko/studio-voice";
import type { PraekoKeySource } from "@praeko/studio-voice";
import { PROJECT_GITIGNORE } from "./templates.ts";
import { diagnose, ffmpegHint, nodeHint, praekoScopeItems } from "./doctor.ts";
import type { DoctorItem } from "./doctor.ts";
import { findProjectRoot, insideAny, isLegacyLayout, projectFoldersFor } from "./project.ts";
import { BLOCK_END, BLOCK_START, TARGETS, installSkill } from "./skill.ts";
import type { Agent as SkillAgent } from "./skill.ts";
import { lang } from "./i18n.ts";
import { loginCommandFor, normalizeServer, runLogin } from "./login.ts";
import type { LoginEnv, LoginOutcome } from "./login.ts";
import { VERSION } from "./version.ts";

export const REMOTE_MCP_URL = "https://praeko.app/mcp";
export const SERVER_NAME = "praeko", LOCAL_SERVER_NAME = "praeko-studio";
export const SETUP_AGENTS = ["claude", "claude-desktop", "codex", "cursor", "gemini", "opencode", "cline", "windsurf"] as const;
export type SetupAgent = (typeof SETUP_AGENTS)[number];
export const AGENT_NAMES: Record<SetupAgent, string> = { claude: "Claude Code", "claude-desktop": "Claude Desktop", codex: "Codex CLI", cursor: "Cursor", gemini: "Gemini CLI", opencode: "opencode", cline: "Cline", windsurf: "Windsurf" };
/** Page of each agent in the public docs (https://praeko.app/docs/agents/<slug>). */
const DOC_SLUG: Record<SetupAgent, string> = { claude: "claude-code", "claude-desktop": "claude-desktop", codex: "codex-cli", cursor: "cursor", gemini: "gemini-cli", opencode: "opencode", cline: "cline", windsurf: "windsurf" };
/** Which `skill install` agent writes the instructions each one reads (Claude Desktop reads no file from a folder). */
const SKILL_OF: Partial<Record<SetupAgent, SkillAgent>> = { claude: "claude", codex: "codex", cursor: "cursor", gemini: "gemini", opencode: "opencode", cline: "cline", windsurf: "windsurf" };
/** The command the PERSON runs in their own terminal to store the key (pinned to this version: the same code they just ran). */
export const KEY_COMMAND = `npx @praeko/studio@${VERSION} setup --key`;
export const keyCommand = (profile: string): string => (profile === DEFAULT_PROFILE ? KEY_COMMAND : `${KEY_COMMAND} --profile ${profile}`);
/** Lines setup makes sure the project's .gitignore has: only what stays on this machine. `.praeko/config.json` is never among them (no secret in it). */
export const GITIGNORE_WANTED = PROJECT_GITIGNORE.split("\n").filter((l) => l && l !== ".DS_Store");
const GITIGNORE_HEADER = "# Praeko Studio: local files (added by `praeko studio setup`)";
export const MANIFEST_SCHEMA = "praeko-studio-setup-manifest/1";
const TOML_START = "# >>> praeko-studio setup (added by `praeko studio setup`; `praeko studio setup uninstall` removes it)", TOML_END = "# <<< praeko-studio setup";
const CODEX_BLOCK = `${TOML_START}\n[mcp_servers.${SERVER_NAME}]\nurl = "${REMOTE_MCP_URL}"\nbearer_token_env_var = "PRAEKO_KEY"\n${TOML_END}\n`;
/** Cursor's sign-in returns through `cursor://`, which Praeko's OAuth does not accept (docs/mcp-oauth.md): the key goes in the header, read from the environment by Cursor. */
const CURSOR_ENTRY = { url: REMOTE_MCP_URL, headers: { Authorization: "Bearer ${env:PRAEKO_KEY}" } };

// ---------- environment (everything a test replaces) ----------
export type ExecResult = { status: number | null; stdout: string; stderr: string };
export type SetupEnv = {
  home?: string; platform?: NodeJS.Platform; cwd?: string; configDir?: string; env?: NodeJS.ProcessEnv;
  /** Folders where macOS apps live (detection of Claude.app, Cursor.app, Windsurf.app). */
  applications?: string[];
  which?: (cmd: string) => string | null;
  exec?: (cmd: string, args: string[]) => ExecResult;
  isTTY?: boolean;
  ask?: (question: string) => Promise<string>;
  readSecret?: (prompt: string) => Promise<string>;
  storeKey?: (ref: string, key: string) => "keychain" | "file";
  getKey?: (ref: string) => string | null;
  /** Where storeKey puts a key outside the Keychain (to refuse a secrets file inside the project). */
  secretsPath?: string;
  usesKeychain?: boolean;
  fetchFn?: typeof fetch;
  requirements?: (cwd: string) => Promise<DoctorItem[]>;
  init?: (a: string[]) => Promise<number>;
  npmInstall?: (dir: string, quiet: boolean) => number;
  nodePath?: string;
  now?: () => Date;
  out?: (s: string) => void;
  err?: (s: string) => void;
  /** Sign-in by code (login.ts): the computer name, the browser, the clock and Ctrl+C (tests replace them; fetchFn above is the network). */
  login?: Pick<LoginEnv, "hostname" | "openBrowser" | "sleep" | "now" | "signal">;
};
type Ctx = Required<Omit<SetupEnv, "init" | "npmInstall" | "requirements" | "ask" | "readSecret" | "login">> & Pick<SetupEnv, "init" | "npmInstall" | "requirements" | "ask" | "readSecret" | "login">;

function context(e: SetupEnv): Ctx {
  const env = e.env ?? process.env, home = e.home ?? homedir(), platform = e.platform ?? process.platform;
  const which = e.which ?? ((cmd: string) => {
    const exts = platform === "win32" ? ["", ".cmd", ".exe"] : [""];
    for (const d of (env.PATH || "").split(delimiter).filter(Boolean)) for (const x of exts) { const f = join(d, cmd + x); if (existsSync(f)) return f; }
    return null;
  });
  return {
    home, platform, env, which, cwd: resolve(e.cwd ?? process.cwd()), configDir: e.configDir ?? userConfigDir(),
    applications: e.applications ?? (platform === "darwin" ? ["/Applications", join(home, "Applications")] : []),
    exec: e.exec ?? ((cmd, args) => { const r = spawnSync(cmd, args, { encoding: "utf8", shell: false, env, timeout: 60000 }); return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || (r.error ? r.error.message : "") }; }),
    isTTY: e.isTTY ?? (!!process.stdin.isTTY && !!process.stdout.isTTY),
    storeKey: e.storeKey ?? realStoreKey, getKey: e.getKey ?? realGetKey, secretsPath: e.secretsPath ?? secretsFile(), usesKeychain: e.usesKeychain ?? keychainActive(),
    fetchFn: e.fetchFn ?? fetch, nodePath: e.nodePath ?? process.execPath, now: e.now ?? (() => new Date()),
    out: e.out ?? ((s) => console.log(s)), err: e.err ?? ((s) => console.error(s)),
    init: e.init, npmInstall: e.npmInstall, requirements: e.requirements, ask: e.ask, readSecret: e.readSecret, login: e.login,
  };
}

// ---------- paths of each agent ----------
export function agentPaths(c: Pick<Ctx, "home" | "platform" | "env">) {
  const claudeDir = c.env.CLAUDE_CONFIG_DIR;
  const desktopDir = c.platform === "darwin" ? join(c.home, "Library", "Application Support", "Claude")
    : c.platform === "win32" ? join(c.env.APPDATA || join(c.home, "AppData", "Roaming"), "Claude") : join(c.home, ".config", "Claude");
  const codexHome = c.env.CODEX_HOME || join(c.home, ".codex");
  const vscodeStorage = c.platform === "darwin" ? join(c.home, "Library", "Application Support", "Code", "User", "globalStorage") : c.platform === "win32" ? join(c.env.APPDATA || join(c.home, "AppData", "Roaming"), "Code", "User", "globalStorage") : join(c.home, ".config", "Code", "User", "globalStorage");
  return {
    claudeJson: claudeDir ? join(claudeDir, ".claude.json") : join(c.home, ".claude.json"), claudeDir: claudeDir || join(c.home, ".claude"),
    desktopDir, desktopJson: join(desktopDir, "claude_desktop_config.json"),
    codexHome, codexToml: join(codexHome, "config.toml"),
    cursorDir: join(c.home, ".cursor"), cursorJson: join(c.home, ".cursor", "mcp.json"),
    geminiDir: join(c.home, ".gemini"), opencodeDir: join(c.home, ".config", "opencode"), windsurfDir: join(c.home, ".codeium", "windsurf"),
    clineDir: join(vscodeStorage, "saoudrizwan.claude-dev"),
  };
}

const tilde = (c: Pick<Ctx, "home">, p: string): string => (p === c.home || p.startsWith(c.home + sep) ? "~" + p.slice(c.home.length) : p);

export type AgentFound = { id: SetupAgent; name: string; detected: boolean; evidence: string[]; selected: boolean };
/** Agents on this machine: a binary on the PATH, a configuration folder or an installed app. Nothing is read beyond existence. */
export function detectSetupAgents(c: Pick<Ctx, "home" | "platform" | "env" | "which" | "applications">): AgentFound[] {
  const p = agentPaths(c), r: AgentFound[] = [];
  const bin = (cmd: string): string[] => (c.which(cmd) ? [`${cmd} on the PATH`] : []);
  const dir = (f: string): string[] => (existsSync(f) ? [tilde(c as Ctx, f)] : []);
  const app = (name: string): string[] => c.applications.filter((d) => existsSync(join(d, name))).map((d) => tilde(c as Ctx, join(d, name)));
  const ev: Record<SetupAgent, string[]> = {
    claude: [...bin("claude"), ...dir(p.claudeDir), ...dir(p.claudeJson)],
    "claude-desktop": [...dir(p.desktopDir), ...app("Claude.app")],
    codex: [...bin("codex"), ...dir(p.codexHome)],
    cursor: [...bin("cursor"), ...dir(p.cursorDir), ...app("Cursor.app")],
    gemini: [...bin("gemini"), ...dir(p.geminiDir)],
    opencode: [...bin("opencode"), ...dir(p.opencodeDir)],
    cline: [...dir(p.clineDir)],
    windsurf: [...bin("windsurf"), ...dir(p.windsurfDir), ...app("Windsurf.app")],
  };
  for (const id of SETUP_AGENTS) r.push({ id, name: AGENT_NAMES[id], detected: ev[id].length > 0, evidence: ev[id], selected: false });
  return r;
}

export function parseAgentList(v: string): SetupAgent[] {
  const l = v.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).map((x) => (x === "claude-code" ? "claude" : x === "codex-cli" ? "codex" : x === "gemini-cli" ? "gemini" : x));
  if (l.includes("all")) return [...SETUP_AGENTS];
  const bad = l.filter((x) => !(SETUP_AGENTS as readonly string[]).includes(x));
  if (!l.length || bad.length) throw new Error(`--agent ${v}: use ${SETUP_AGENTS.join(", ")} or all`);
  return [...new Set(l)] as SetupAgent[];
}

// ---------- small file helpers ----------
const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
const readText = (f: string): string | null => { try { return readFileSync(f, "utf8"); } catch { return null; } };
type JsonRead = { ok: true; data: any; existed: boolean } | { ok: false; reason: string };
function readJsonFile(f: string): JsonRead {
  const t = readText(f);
  if (t === null) return existsSync(f) ? { ok: false, reason: "unreadable" } : { ok: true, data: {}, existed: false };
  if (!t.trim()) return { ok: true, data: {}, existed: true };
  try { const d = JSON.parse(t); return d && typeof d === "object" && !Array.isArray(d) ? { ok: true, data: d, existed: true } : { ok: false, reason: "not a JSON object" }; } catch { return { ok: false, reason: "invalid JSON (comments or a typo?)" }; }
}
const deepEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const isProject = (d: string): boolean => existsSync(join(d, "brand.json")) && existsSync(join(d, "src", "index.ts"));

// ---------- the plan ----------
export type StepKind = "project" | "npm-install" | "skill" | "praeko-config" | "gitignore" | "claude-mcp" | "codex-mcp" | "cursor-mcp" | "desktop-mcp" | "login" | "manual";
export type Step = { id: string; kind: StepKind; agent?: SetupAgent; action: "add" | "update" | "skip" | "manual"; summary: string; file?: string; command?: string[]; reason?: string; diff?: string[] };
export type Plan = {
  schema: "praeko-studio-setup/1"; mode: "plan" | "apply"; version: string;
  system: { os: string; arch: string; node: string };
  project: { dir: string; state: "create" | "existing" | "blocked"; reason?: string; profile: string };
  requirements: DoctorItem[];
  agents: AgentFound[];
  steps: Step[];
  /** Never the key: whether one is found, where from (env | profile | global) and the profile name. */
  key: { present: boolean; source: PraekoKeySource | null; profile: string };
  /** The sign-in by code, once it ran (never the key): authorized, expired, denied, cancelled, error; "declined" when the person said no. */
  login?: LoginOutcome | { status: "declined"; profile: string };
  onlyYou: string[];
};

const npmItem = (c: Ctx): DoctorItem => (c.which("npm") ? { id: "npm", level: "ok", msg: "npm found" } : { id: "npm", level: "error", msg: "npm not found on the PATH", fix: `npm comes with Node: ${nodeHint(c.platform)}` });
async function requirements(c: Ctx, cwd: string): Promise<DoctorItem[]> {
  if (c.requirements) return c.requirements(cwd);
  const items = await diagnose({ offline: true, cwd });
  const keep = ["node", "ffmpeg", "ffprobe", "chromium", "licenses"];
  const r = items.filter((i) => keep.includes(i.id));
  r.splice(1, 0, npmItem(c));
  return r;
}

function keyStatus(c: Ctx, profile: string): Plan["key"] {
  try { const r = resolvePraekoKey({ profile, get: c.getKey, env: c.env }); return { present: !!r.key, source: r.source, profile }; }
  catch { return { present: false, source: null, profile }; } // unreadable store: treated as absent
}

type ProjectBase = Omit<Plan["project"], "profile">;
function locateProject(c: Ctx, folder: string | undefined): ProjectBase {
  if (folder) {
    const dir = resolve(c.cwd, folder);
    if (!existsSync(dir) || !readdirSync(dir).length) return { dir, state: "create" };
    if (isProject(dir)) return isLegacyLayout(dir) ? { dir, state: "blocked", reason: "old Portuguese layout: run `praeko studio migrate` there first" } : { dir, state: "existing" };
    return { dir, state: "blocked", reason: "the folder exists, has files and is not a Studio project (no brand.json + src/index.ts): pass another folder" };
  }
  const root = findProjectRoot(c.cwd);
  if (root && !isLegacyLayout(root)) return { dir: root, state: "existing" };
  return locateProject(c, join(c.cwd, "praeko-studio"));
}
/** The project and its key profile: --profile, else the one already in .praeko/config.json, else the folder name (normalized). */
function resolveProject(c: Ctx, folder: string | undefined, profileFlag?: string): Plan["project"] {
  const p = locateProject(c, folder);
  const profile = profileFlag ?? (p.state === "existing" ? readProjectProfile(p.dir) : null) ?? profileFromName(basename(p.dir));
  return { ...p, profile };
}

// ---------- .gitignore ----------
const normIgnore = (l: string): string => l.trim().replace(/^\//, "").replace(/\/$/, "");
/** A path inside each wanted pattern, to ask `git check-ignore` (a file inside an ignored folder is ignored). */
const probeOf = (line: string): string => (line.endsWith("/") ? line + ".praeko-probe" : line === ".env.*" ? ".env.local" : line);
function gitRepo(c: Ctx, dir: string): boolean {
  if (!c.which("git") || !existsSync(dir)) return false;
  const r = c.exec(c.which("git")!, ["-C", dir, "rev-parse", "--is-inside-work-tree"]);
  return r.status === 0 && r.stdout.trim() === "true";
}
/** Lines of GITIGNORE_WANTED the project still lacks: textually absent, and (in a Git repository) not ignored by any rule Git applies. `config.json` is checked the other way. */
export function gitignoreAdditions(c: Ctx, dir: string, current: string | null): { add: string[]; configIgnored: boolean; git: boolean } {
  const have = new Set((current ?? "").split(/\r?\n/).map(normIgnore).filter((l) => l && !l.startsWith("#")));
  const git = gitRepo(c, dir);
  const ignored = (path: string): boolean => git && c.exec(c.which("git")!, ["-C", dir, "check-ignore", "-q", "--no-index", path]).status === 0;
  const add = GITIGNORE_WANTED.filter((l) => !have.has(normIgnore(l)) && !ignored(probeOf(l)));
  return { add, configIgnored: ignored(PROJECT_CONFIG.split(sep).join("/")), git };
}
function gitignoreText(current: string | null, add: string[]): string {
  const base = current ?? "";
  return (base.trim() ? base.replace(/\s*$/, "\n\n") : "") + [GITIGNORE_HEADER, ...add].join("\n") + "\n";
}

const claudeRegistered = (c: Ctx): boolean => { const r = readJsonFile(agentPaths(c).claudeJson); return r.ok && !!r.data?.mcpServers?.[SERVER_NAME]; };
export const claudeAddArgs = (): string[] => ["mcp", "add", "--transport", "http", "--scope", "user", SERVER_NAME, REMOTE_MCP_URL];

/** The local Studio MCP entry for Claude Desktop. Absolute npx and a PATH with Node's folder: apps opened from the Dock do not see the shell's PATH (nvm, Homebrew). */
export function desktopEntry(c: Pick<Ctx, "platform" | "nodePath">, projectDir: string): Record<string, unknown> {
  const args = ["-y", "@praeko/studio-mcp", "--project", projectDir];
  if (c.platform === "win32") return { command: "npx", args };
  const nodeDir = dirname(c.nodePath), npx = join(nodeDir, "npx");
  const path = [...new Set([nodeDir, "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"])].join(":");
  return { command: existsSync(npx) ? npx : "npx", args, env: { PATH: path } };
}

function onlyYouList(c: Ctx, plan: Omit<Plan, "onlyYou">): string[] {
  const sel = new Set(plan.agents.filter((a) => a.selected).map((a) => a.id)), l: string[] = [];
  for (const r of plan.requirements) if (r.level === "error" || (r.level === "warning" && r.id !== "licenses")) l.push(`Install ${r.id === "chromium" ? "Chrome for Remotion" : r.id}: ${r.fix || r.msg} (your agent may run it, only with your yes)`);
  if (sel.has("claude")) l.push("Claude Code: sign in to Praeko in the browser: open `claude`, run `/mcp` and choose praeko (or run `claude mcp login praeko`). No key needed.");
  if (sel.has("claude-desktop")) l.push(`Claude Desktop: add the remote server by hand: Customize > Connectors > Add custom connector, name Praeko, URL ${REMOTE_MCP_URL}, then Connect and sign in. Quit Claude Desktop completely and open it again (it loads ${LOCAL_SERVER_NAME}).`);
  const prof = plan.key.profile;
  if (!plan.key.present && plan.project.state !== "blocked") {
    const uses = sel.has("claude-desktop") ? " studio_upload (Claude Desktop) reads the key from there." : "";
    if (plan.steps.some((s) => s.kind === "login" && s.action === "add") && !plan.login) l.push(`Approve Praeko Studio in the browser (code shown in the terminal): after applying, setup signs in by code; check the code and the computer name at https://praeko.app/device and approve. The key goes to your Keychain or secrets file for profile "${prof}", never to the screen or the agent. No browser? Paste a write key in YOUR own terminal instead: ${keyCommand(prof)} (hidden input).${uses}`);
    else l.push(`Approve Praeko Studio in the browser (code shown in the terminal): run ${loginCommandFor(prof)} and approve the code at https://praeko.app/device (profile "${prof}"). No browser? Paste a write key in YOUR own terminal instead: ${keyCommand(prof)} (hidden input).${uses}`);
  }
  if (sel.has("codex") || sel.has("cursor")) {
    const account = prof === DEFAULT_PROFILE ? "praeko/chave" : praekoKeyRef(prof);
    const line = c.platform === "darwin" ? `export PRAEKO_KEY="$(security find-generic-password -s praeko -a ${account} -w)"` : `export PRAEKO_KEY="$(node -p 'require(process.env.HOME + "/.config/praeko/secrets.json")["${account}"]')"`;
    l.push(`${[sel.has("codex") ? "Codex" : "", sel.has("cursor") ? "Cursor" : ""].filter(Boolean).join(" and ")} read the key from the PRAEKO_KEY variable: add this line to your shell profile (it reads the stored key; nothing in plain text): ${line}`);
  }
  for (const s of plan.steps) if (s.action === "manual" && s.kind === "manual" && s.agent && !["claude", "claude-desktop"].includes(s.agent)) l.push(`${AGENT_NAMES[s.agent]}: ${s.summary}`);
  const lic = plan.requirements.find((r) => r.id === "licenses");
  if (!lic || lic.level !== "ok") l.push("Read the license notice (Remotion is not MIT) and accept it: praeko studio licenses --accept (or npx praeko-studio licenses --accept in the project).");
  l.push("Connect a channel (YouTube, Instagram or TikTok) under Channels in the Praeko dashboard.");
  return l;
}

export async function buildPlan(c: Ctx, o: { folder?: string; agents?: SetupAgent[]; noInstall?: boolean; profile?: string }): Promise<Plan> {
  const project = resolveProject(c, o.folder, o.profile);
  const agents = detectSetupAgents(c);
  for (const a of agents) a.selected = o.agents ? o.agents.includes(a.id) : a.detected;
  const sel = agents.filter((a) => a.selected).map((a) => a.id), p = agentPaths(c), steps: Step[] = [];
  const skillAgents = [...new Set(sel.map((a) => SKILL_OF[a]).filter(Boolean))] as SkillAgent[];
  // project and instructions
  if (project.state === "create") {
    steps.push({ id: "project", kind: "project", action: "add", file: project.dir, summary: `create the Studio project in ${tilde(c, project.dir)} (praeko studio init --yes${skillAgents.length ? ` --agent ${skillAgents.join(",")}` : ""}: brand.json, src/, instructions for ${skillAgents.length ? skillAgents.join(", ") : "claude, codex"})` });
    if (!o.noInstall) steps.push({ id: "npm-install", kind: "npm-install", action: "add", file: project.dir, summary: `npm install in ${tilde(c, project.dir)} (Remotion and the Studio packages; needs internet)` });
  } else if (project.state === "existing") {
    if (skillAgents.length) steps.push({ id: "skill", kind: "skill", action: "update", file: project.dir, summary: `write or refresh the agent instructions in ${tilde(c, project.dir)} (praeko studio skill install --agent ${skillAgents.join(",")})` });
  } else steps.push({ id: "project", kind: "manual", action: "manual", file: project.dir, summary: `no project: ${tilde(c, project.dir)}: ${project.reason}`, reason: project.reason });
  if (project.state !== "blocked") {
    // the key profile, in a file with no secret (it may go to Git)
    const cfg = join(project.dir, PROJECT_CONFIG), cur = project.state === "existing" ? readProjectProfile(project.dir) : null;
    if (cur === project.profile) steps.push({ id: "praeko-config", kind: "praeko-config", action: "skip", file: cfg, summary: `key profile "${project.profile}" already in ${PROJECT_CONFIG}`, reason: "already set" });
    else steps.push({ id: "praeko-config", kind: "praeko-config", action: existsSync(cfg) ? "update" : "add", file: cfg, summary: `${existsSync(cfg) ? "set" : "write"} ${PROJECT_CONFIG} = { "profile": "${project.profile}" } (no secret: it may go to Git; the key stays in your Keychain or secrets file)` });
    // .gitignore: only appended lines, for what stays on this machine
    const gi = join(project.dir, ".gitignore"), current = project.state === "create" ? PROJECT_GITIGNORE : readText(gi);
    const g = project.state === "create" ? { add: GITIGNORE_WANTED.filter((l) => !PROJECT_GITIGNORE.split("\n").includes(l)), configIgnored: false, git: false } : gitignoreAdditions(c, project.dir, current);
    if (g.add.length) steps.push({ id: "gitignore", kind: "gitignore", action: current === null ? "add" : "update", file: gi, diff: [GITIGNORE_HEADER, ...g.add].map((l) => "+" + l), summary: `${current === null ? "create" : "append to"} ${tilde(c, gi)} (only adds lines${g.git ? "; checked with git check-ignore" : ""}): ${g.add.join(" ")}` });
    else steps.push({ id: "gitignore", kind: "gitignore", action: "skip", file: gi, summary: `.gitignore already ignores Studio's local files${g.git ? " (git check-ignore)" : ""}`, reason: "already ignored" });
    if (g.configIgnored) steps.push({ id: "gitignore-config", kind: "manual", action: "manual", file: gi, summary: `${PROJECT_CONFIG} is ignored by a rule of yours: it holds no secret (only the profile name) and may be committed; setup never removes your lines` });
  }
  // remote MCP per agent
  for (const a of sel) {
    const docs = `https://praeko.app/docs/agents/${DOC_SLUG[a]}`;
    if (a === "claude") {
      if (claudeRegistered(c)) steps.push({ id: "claude-mcp", kind: "claude-mcp", agent: a, action: "skip", file: p.claudeJson, summary: `Claude Code: the "${SERVER_NAME}" server is already registered (user scope)`, reason: "already registered" });
      else if (c.which("claude")) steps.push({ id: "claude-mcp", kind: "claude-mcp", agent: a, action: "add", file: p.claudeJson, command: ["claude", ...claudeAddArgs()], summary: `Claude Code: register the remote MCP for every folder: claude ${claudeAddArgs().join(" ")} (sign-in later; no key)` });
      else steps.push({ id: "claude-mcp", kind: "manual", agent: a, action: "manual", command: ["claude", ...claudeAddArgs()], summary: `the claude command is not on the PATH: after installing Claude Code, run: claude ${claudeAddArgs().join(" ")}` });
    } else if (a === "codex") {
      const t = readText(p.codexToml);
      if (t === null && existsSync(p.codexToml)) steps.push({ id: "codex-mcp", kind: "manual", agent: a, action: "manual", file: p.codexToml, summary: `${tilde(c, p.codexToml)} is unreadable: add [mcp_servers.${SERVER_NAME}] by hand (${docs})` });
      else if (t !== null && new RegExp(`^\\s*\\[mcp_servers\\.(?:"${SERVER_NAME}"|${SERVER_NAME})\\]`, "m").test(t)) steps.push({ id: "codex-mcp", kind: "codex-mcp", agent: a, action: "skip", file: p.codexToml, summary: `Codex: [mcp_servers.${SERVER_NAME}] already exists in ${tilde(c, p.codexToml)}`, reason: "already registered" });
      else steps.push({ id: "codex-mcp", kind: "codex-mcp", agent: a, action: "add", file: p.codexToml, summary: `Codex: add [mcp_servers.${SERVER_NAME}] (url ${REMOTE_MCP_URL}, bearer_token_env_var = "PRAEKO_KEY") to ${tilde(c, p.codexToml)}` });
    } else if (a === "cursor") {
      const r = readJsonFile(p.cursorJson);
      if (!r.ok) steps.push({ id: "cursor-mcp", kind: "manual", agent: a, action: "manual", file: p.cursorJson, summary: `${tilde(c, p.cursorJson)}: ${r.reason}; I will not rewrite it. Add the server by hand (${docs})` });
      else if (r.data?.mcpServers?.[SERVER_NAME]) steps.push({ id: "cursor-mcp", kind: "cursor-mcp", agent: a, action: "skip", file: p.cursorJson, summary: `Cursor: "${SERVER_NAME}" already exists in ${tilde(c, p.cursorJson)}`, reason: "already registered" });
      else steps.push({ id: "cursor-mcp", kind: "cursor-mcp", agent: a, action: "add", file: p.cursorJson, summary: `Cursor: add "${SERVER_NAME}" to ${tilde(c, p.cursorJson)} (url ${REMOTE_MCP_URL}, header Authorization: Bearer \${env:PRAEKO_KEY}; Cursor's sign-in does not work with Praeko today)` });
    } else if (a === "claude-desktop") {
      const r = readJsonFile(p.desktopJson);
      if (project.state === "blocked") steps.push({ id: "desktop-mcp", kind: "manual", agent: a, action: "manual", file: p.desktopJson, summary: `Claude Desktop: the local Studio server needs a project folder (${project.reason})` });
      else if (!r.ok) steps.push({ id: "desktop-mcp", kind: "manual", agent: a, action: "manual", file: p.desktopJson, summary: `${tilde(c, p.desktopJson)}: ${r.reason}; I will not rewrite it. Add "${LOCAL_SERVER_NAME}" by hand (https://praeko.app/docs/studio/mcp)` });
      else if (r.data?.mcpServers?.[LOCAL_SERVER_NAME]) steps.push({ id: "desktop-mcp", kind: "desktop-mcp", agent: a, action: "skip", file: p.desktopJson, summary: `Claude Desktop: "${LOCAL_SERVER_NAME}" already exists in ${tilde(c, p.desktopJson)}`, reason: "already registered" });
      else steps.push({ id: "desktop-mcp", kind: "desktop-mcp", agent: a, action: "add", file: p.desktopJson, summary: `Claude Desktop: add the local Studio server "${LOCAL_SERVER_NAME}" (npx -y @praeko/studio-mcp --project ${tilde(c, project.dir)}) to ${tilde(c, p.desktopJson)}; it never publishes` });
    } else steps.push({ id: `${a}-mcp`, kind: "manual", agent: a, action: "manual", summary: `connect the remote MCP by hand with the block on ${docs} (setup does not edit this agent's files yet)` });
  }
  // the Praeko key: sign in by code only when none resolves for the profile (PRAEKO_KEY > profile > global)
  const key = keyStatus(c, project.profile);
  if (project.state !== "blocked") {
    if (key.present) steps.push({ id: "login", kind: "login", action: "skip", summary: `Praeko key already found (${key.source}; never shown): no sign-in needed`, reason: `key from ${key.source}` });
    else steps.push({ id: "login", kind: "login", action: "add", command: ["praeko", "studio", "login", ...(project.profile === DEFAULT_PROFILE ? [] : ["--profile", project.profile])], summary: `sign in to Praeko by code for profile "${project.profile}" (praeko studio login): shows a short code and https://praeko.app/device; you approve in the browser and the write key goes to your Keychain or secrets file (never to the project, the screen or the agent). No browser? ${keyCommand(project.profile)} in your own terminal` });
  }
  const base = { schema: "praeko-studio-setup/1" as const, mode: "plan" as const, version: VERSION, system: { os: c.platform, arch: process.arch, node: process.versions.node }, project, requirements: await requirements(c, project.state === "existing" ? project.dir : c.cwd), agents, steps, key };
  return { ...base, onlyYou: onlyYouList(c, base) };
}

// ---------- backups and manifest ----------
export type Entry =
  | { kind: "project-created"; dir: string; at: string }
  | { kind: "file-created"; file: string; sha256: string; at: string }
  | { kind: "block-added"; file: string; at: string }
  | { kind: "gitignore-lines"; file: string; lines: string[]; created: boolean; backup?: string; at: string }
  | { kind: "claude-mcp"; file: string; name: string; url: string; backup?: string; at: string }
  | { kind: "toml-block"; file: string; created: boolean; backup?: string; at: string }
  | { kind: "json-entry"; file: string; name: string; value: unknown; created: boolean; backup?: string; at: string };
type Manifest = { schema: string; entries: Entry[] };
const manifestFile = (c: Ctx): string => join(c.configDir, "setup-manifest.json");
export function readManifest(c: Pick<Ctx, "configDir">): Manifest {
  try { const m = JSON.parse(readFileSync(join(c.configDir, "setup-manifest.json"), "utf8")); if (Array.isArray(m.entries)) return m; } catch { /* none yet */ }
  return { schema: MANIFEST_SCHEMA, entries: [] };
}
function writeManifest(c: Ctx, m: Manifest): void {
  const f = manifestFile(c);
  if (!m.entries.length) { rmSync(f, { force: true }); return; }
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(m, null, 2) + "\n", { mode: 0o600 });
}
const stamp = (d: Date): string => d.toISOString().replace(/\.\d+Z$/, "Z").replace(/:/g, "-");
/** Copies a file that is about to change to <config>/setup-backups/<date>/<its absolute path>, mode 600. Returns the copy (or undefined when the file does not exist yet). */
function makeBackup(c: Ctx, file: string, when: string, contents?: string): string | undefined {
  if (contents === undefined && !existsSync(file)) return undefined;
  const dest = join(c.configDir, "setup-backups", when, file.replace(/^[A-Za-z]:/, "").replace(/^[\\/]+/, ""));
  mkdirSync(dirname(dest), { recursive: true, mode: 0o700 });
  if (contents === undefined) copyFileSync(file, dest); else writeFileSync(dest, contents);
  if (c.platform !== "win32") chmodSync(dest, 0o600);
  return dest;
}
function writeJson(file: string, data: unknown): void { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(data, null, 2) + "\n"); }

// ---------- apply ----------
export type Result = { step: string; ok: boolean; msg: string; backup?: string };
function defaultNpmInstall(dir: string, quiet: boolean, platform: NodeJS.Platform): number {
  const stdio: any = ["ignore", quiet ? 2 : "inherit", "inherit"];
  const r = platform === "win32" ? spawnSync(process.execPath, [join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"), "install", "--loglevel=error"], { cwd: dir, stdio }) : spawnSync("npm", ["install", "--loglevel=error"], { cwd: dir, stdio, shell: false });
  return r.status ?? 1;
}
/** Runs `init` with its console.log captured: setup prints its own summary (and --json keeps stdout clean). Returns the captured lines. */
async function captured<T>(f: () => Promise<T>): Promise<{ value: T; lines: string[] }> {
  const orig = console.log, lines: string[] = []; console.log = (...a: unknown[]) => { lines.push(a.map(String).join(" ")); };
  try { return { value: await f(), lines }; } finally { console.log = orig; }
}

export async function applyPlan(c: Ctx, plan: Plan, o: { json: boolean }): Promise<Result[]> {
  const when = stamp(c.now()), at = c.now().toISOString(), m = readManifest(c), res: Result[] = [];
  const record = (e: Entry) => { m.entries.push(e); writeManifest(c, m); };
  const skillAgents = [...new Set(plan.agents.filter((a) => a.selected).map((a) => SKILL_OF[a.id]).filter(Boolean))] as SkillAgent[];
  for (const s of plan.steps) {
    if (s.action === "skip") { res.push({ step: s.id, ok: true, msg: `skipped: ${s.summary}` }); continue; }
    if (s.action === "manual" || s.kind === "login") continue; // the sign-in runs after the files (setupCommand), never inside the plan
    try {
      if (s.kind === "project") {
        const run = c.init ?? (async (a: string[]) => (await import("./commands.ts")).init(a, { interactive: false }));
        const { value: code, lines } = await captured(() => run([plan.project.dir, "--yes", "--no-install", "--lang", lang(), ...(skillAgents.length ? ["--agent", skillAgents.join(",")] : [])]));
        if (code) throw new Error(`init exited with ${code}`);
        record({ kind: "project-created", dir: plan.project.dir, at });
        const made = lines.flatMap((l) => l.split("\n")).filter((l) => /^\s+instructions for /.test(l)).map((l) => l.trim().replace(/^instructions for \w+: /, ""));
        res.push({ step: s.id, ok: true, msg: `project created in ${tilde(c, plan.project.dir)}${made.length ? ` (instructions: ${made.join(", ")})` : ""}` });
      } else if (s.kind === "npm-install") {
        const code = c.npmInstall ? c.npmInstall(plan.project.dir, o.json) : defaultNpmInstall(plan.project.dir, o.json, c.platform);
        res.push({ step: s.id, ok: !code, msg: code ? `npm install failed (exit ${code}): run it again in ${plan.project.dir}` : "npm install done" });
      } else if (s.kind === "skill") {
        const dir = plan.project.dir, targets = [...new Map(skillAgents.flatMap((a) => TARGETS[a]).map((t) => [t.path, t])).values()];
        const before = new Map(targets.map((t) => [t.path, readText(join(dir, t.path))]));
        installSkill({ dir, agents: skillAgents, lang: lang() });
        let changed = 0;
        for (const t of targets) {
          const file = join(dir, t.path), old = before.get(t.path) ?? null, now = readText(file);
          if (now === null || now === old) continue;
          changed++;
          if (old === null) { record({ kind: "file-created", file, sha256: sha(now), at }); continue; }
          const backup = makeBackup(c, file, when, old);
          if (t.kind === "block" && !old.includes(BLOCK_END)) record({ kind: "block-added", file, at });
          res.push({ step: s.id, ok: true, msg: `updated ${relative(dir, file)}`, ...(backup ? { backup } : {}) });
        }
        res.push({ step: s.id, ok: true, msg: changed ? `agent instructions written (${changed} file(s))` : "agent instructions already up to date" });
      } else if (s.kind === "praeko-config") {
        const file = s.file!, old = readText(file), next = JSON.stringify({ ...(() => { try { return old ? JSON.parse(old) : {}; } catch { return {}; } })(), profile: plan.project.profile }, null, 2) + "\n";
        if (old === next) { res.push({ step: s.id, ok: true, msg: "skipped: profile already set" }); continue; }
        const backup = makeBackup(c, file, when);
        mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, next);
        if (old === null) record({ kind: "file-created", file, sha256: sha(next), at });
        res.push({ step: s.id, ok: true, msg: `key profile "${plan.project.profile}" written to ${PROJECT_CONFIG}`, ...(backup ? { backup } : {}) });
      } else if (s.kind === "gitignore") {
        const file = s.file!, old = readText(file), g = gitignoreAdditions(c, plan.project.dir, old); // recomputed: the plan may be old, and rerunning must not duplicate
        if (!g.add.length) { res.push({ step: s.id, ok: true, msg: "skipped: .gitignore already ignores Studio's local files" }); continue; }
        const backup = makeBackup(c, file, when), lines = [GITIGNORE_HEADER, ...g.add];
        writeFileSync(file, gitignoreText(old, g.add));
        record({ kind: "gitignore-lines", file, lines, created: old === null, ...(backup ? { backup } : {}), at });
        res.push({ step: s.id, ok: true, msg: `.gitignore: added ${g.add.join(" ")}`, ...(backup ? { backup } : {}) });
      } else if (s.kind === "claude-mcp") {
        const claude = c.which("claude");
        if (!claude) throw new Error("the claude command is not on the PATH");
        if (claudeRegistered(c)) { res.push({ step: s.id, ok: true, msg: "skipped: already registered" }); continue; }
        const backup = makeBackup(c, s.file!, when);
        const r = c.exec(claude, claudeAddArgs());
        if (r.status !== 0) throw new Error(`claude mcp add failed (exit ${r.status}): ${(r.stderr || r.stdout).trim().split("\n")[0]}`);
        record({ kind: "claude-mcp", file: s.file!, name: SERVER_NAME, url: REMOTE_MCP_URL, ...(backup ? { backup } : {}), at });
        res.push({ step: s.id, ok: true, msg: "Claude Code: praeko registered (user scope)", ...(backup ? { backup } : {}) });
      } else if (s.kind === "codex-mcp") {
        const file = s.file!, old = readText(file), backup = makeBackup(c, file, when);
        if (old !== null && new RegExp(`^\\s*\\[mcp_servers\\.(?:"${SERVER_NAME}"|${SERVER_NAME})\\]`, "m").test(old)) { res.push({ step: s.id, ok: true, msg: "skipped: already registered" }); continue; }
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, (old && old.trim() ? old.replace(/\s*$/, "\n\n") : "") + CODEX_BLOCK);
        record({ kind: "toml-block", file, created: old === null, ...(backup ? { backup } : {}), at });
        res.push({ step: s.id, ok: true, msg: `Codex: [mcp_servers.${SERVER_NAME}] added to ${tilde(c, file)}`, ...(backup ? { backup } : {}) });
      } else if (s.kind === "cursor-mcp" || s.kind === "desktop-mcp") {
        const file = s.file!, r = readJsonFile(file);
        if (!r.ok) throw new Error(`${tilde(c, file)}: ${r.reason}`);
        const name = s.kind === "cursor-mcp" ? SERVER_NAME : LOCAL_SERVER_NAME, value = s.kind === "cursor-mcp" ? CURSOR_ENTRY : desktopEntry(c, plan.project.dir);
        if (r.data.mcpServers?.[name]) { res.push({ step: s.id, ok: true, msg: "skipped: already registered" }); continue; }
        const backup = makeBackup(c, file, when);
        if (!r.data.mcpServers || typeof r.data.mcpServers !== "object") r.data.mcpServers = {};
        r.data.mcpServers[name] = value;
        writeJson(file, r.data);
        record({ kind: "json-entry", file, name, value, created: !r.existed, ...(backup ? { backup } : {}), at });
        res.push({ step: s.id, ok: true, msg: `${s.kind === "cursor-mcp" ? "Cursor" : "Claude Desktop"}: "${name}" added to ${tilde(c, file)}`, ...(backup ? { backup } : {}) });
      }
    } catch (e: any) { res.push({ step: s.id, ok: false, msg: e.message }); }
  }
  return res;
}

// ---------- uninstall ----------
export type UndoStep = { entry: Entry; action: "remove" | "keep"; summary: string };
function stripBetween(text: string, start: string, end: string): string | null {
  const i = text.indexOf(start), j = text.indexOf(end, i < 0 ? 0 : i);
  if (i < 0 || j < 0) return null;
  let a = i; while (a > 0 && (text[a - 1] === "\n" || text[a - 1] === " ")) a--;
  let b = j + end.length; if (text[b] === "\n") b++;
  const out = text.slice(0, a) + (a > 0 && b < text.length ? "\n\n" : a > 0 ? "\n" : "") + text.slice(b);
  return out;
}
export function planUninstall(c: Ctx): UndoStep[] {
  const m = readManifest(c), r: UndoStep[] = [];
  for (const e of [...m.entries].reverse()) {
    if (e.kind === "project-created") r.push({ entry: e, action: "keep", summary: `project ${tilde(c, e.dir)} stays (your videos live there): delete the folder yourself if you want` });
    else if (e.kind === "file-created") { const t = readText(e.file); r.push(t === null ? { entry: e, action: "keep", summary: `${tilde(c, e.file)} is already gone` } : sha(t) === e.sha256 ? { entry: e, action: "remove", summary: `delete ${tilde(c, e.file)} (created by setup, unchanged)` } : { entry: e, action: "keep", summary: `${tilde(c, e.file)} was edited after setup: kept` }); }
    else if (e.kind === "gitignore-lines") { const t = readText(e.file), have = t === null ? [] : t.split(/\r?\n/); const left = e.lines.filter((l) => have.includes(l)); r.push(left.length ? { entry: e, action: "remove", summary: `remove from ${tilde(c, e.file)} only the lines setup added: ${left.filter((l) => l !== GITIGNORE_HEADER).join(" ") || "(header)"}` } : { entry: e, action: "keep", summary: `${tilde(c, e.file)} no longer has the lines setup added` }); }
    else if (e.kind === "block-added") { const t = readText(e.file); r.push(t !== null && t.includes(BLOCK_END) ? { entry: e, action: "remove", summary: `remove the Praeko Studio block from ${tilde(c, e.file)} (the rest stays)` } : { entry: e, action: "keep", summary: `${tilde(c, e.file)} has no Praeko Studio block any more` }); }
    else if (e.kind === "claude-mcp") { const j = readJsonFile(e.file), cur = j.ok ? j.data?.mcpServers?.[e.name] : undefined; r.push(cur && cur.url === e.url ? { entry: e, action: "remove", summary: `Claude Code: claude mcp remove ${e.name} --scope user` } : { entry: e, action: "keep", summary: `Claude Code: "${e.name}" is not registered as setup left it: kept as it is` }); }
    else if (e.kind === "toml-block") { const t = readText(e.file); r.push(t !== null && t.includes(TOML_START) && t.includes(TOML_END) ? { entry: e, action: "remove", summary: `remove the praeko block from ${tilde(c, e.file)}` } : { entry: e, action: "keep", summary: `${tilde(c, e.file)} no longer has the setup block` }); }
    else if (e.kind === "json-entry") { const j = readJsonFile(e.file), cur = j.ok ? j.data?.mcpServers?.[e.name] : undefined; r.push(cur !== undefined && deepEqual(cur, e.value) ? { entry: e, action: "remove", summary: `remove "${e.name}" from ${tilde(c, e.file)}` } : { entry: e, action: "keep", summary: `"${e.name}" in ${tilde(c, e.file)} ${cur === undefined ? "is already gone" : "was changed after setup: kept"}` }); }
  }
  return r;
}
export function applyUninstall(c: Ctx, steps: UndoStep[]): Result[] {
  const when = stamp(c.now()), res: Result[] = [];
  for (const s of steps) {
    const e = s.entry;
    if (s.action === "keep") { res.push({ step: e.kind, ok: true, msg: s.summary }); continue; }
    try {
      if (e.kind === "file-created") { rmSync(e.file); }
      else if (e.kind === "gitignore-lines") {
        const t = readFileSync(e.file, "utf8"), backup = makeBackup(c, e.file, when), tail = e.lines.join("\n") + "\n";
        let out: string;
        if (t.endsWith(tail)) out = t.slice(0, t.length - tail.length).replace(/\n\n$/, "\n"); // still the last thing in the file: cut it and the blank line setup put before it
        else { const lines = t.split("\n"); for (const l of e.lines) { const i = lines.lastIndexOf(l); if (i >= 0) lines.splice(i, 1); } out = lines.join("\n"); } // lines moved around: only those lines, the last copy of each
        if (e.created && !out.trim()) rmSync(e.file); else writeFileSync(e.file, out.trim() ? out : "");
        res.push({ step: e.kind, ok: true, msg: s.summary, ...(backup ? { backup } : {}) }); continue;
      }
      else if (e.kind === "block-added") { const t = readFileSync(e.file, "utf8"), backup = makeBackup(c, e.file, when); const i = t.indexOf(BLOCK_START.slice(0, 26)), j = t.indexOf(BLOCK_END); writeFileSync(e.file, (t.slice(0, i).replace(/\s*$/, "\n") + t.slice(j + BLOCK_END.length).replace(/^\s*/, "")).replace(/^\n+$/, "")); res.push({ step: e.kind, ok: true, msg: s.summary, ...(backup ? { backup } : {}) }); continue; }
      else if (e.kind === "claude-mcp") {
        const claude = c.which("claude");
        if (!claude) throw new Error(`the claude command is not on the PATH: run claude mcp remove ${e.name} --scope user yourself`);
        const backup = makeBackup(c, e.file, when), r = c.exec(claude, ["mcp", "remove", e.name, "--scope", "user"]);
        if (r.status !== 0) throw new Error(`claude mcp remove failed (exit ${r.status})`);
        res.push({ step: e.kind, ok: true, msg: s.summary, ...(backup ? { backup } : {}) }); continue;
      } else if (e.kind === "toml-block") {
        const t = readFileSync(e.file, "utf8"), backup = makeBackup(c, e.file, when), out = stripBetween(t, TOML_START, TOML_END) ?? t;
        if (e.created && !out.trim()) rmSync(e.file); else writeFileSync(e.file, out);
        res.push({ step: e.kind, ok: true, msg: s.summary, ...(backup ? { backup } : {}) }); continue;
      } else if (e.kind === "json-entry") {
        const j = readJsonFile(e.file); if (!j.ok) throw new Error(`${e.file}: ${j.reason}`);
        const backup = makeBackup(c, e.file, when);
        delete j.data.mcpServers[e.name];
        if (e.created && !Object.keys(j.data.mcpServers).length && Object.keys(j.data).length === 1) rmSync(e.file); else writeJson(e.file, j.data);
        res.push({ step: e.kind, ok: true, msg: s.summary, ...(backup ? { backup } : {}) }); continue;
      }
      res.push({ step: e.kind, ok: true, msg: s.summary });
    } catch (err: any) { res.push({ step: e.kind, ok: false, msg: err.message }); }
  }
  return res;
}

// ---------- the key ----------
/** Format only (nothing is sent): praeko_ + 20 to 128 base64url characters (issued keys carry 43); the old arauto_ keys still work. */
export const validKeyFormat = (k: string): boolean => /^(praeko|arauto)_[A-Za-z0-9_-]{20,128}$/.test(k);

/** Reads one line from a TTY without echo (raw mode). Ctrl-C cancels; Backspace erases. Nothing typed is written anywhere. */
export function readHidden(prompt: string, input: NodeJS.ReadStream = process.stdin, output: NodeJS.WritableStream = process.stderr): Promise<string> {
  return new Promise((ok, fail) => {
    if (!input.isTTY || typeof input.setRawMode !== "function") { fail(new Error("no terminal to read the key from")); return; }
    output.write(prompt);
    let buf = "";
    const done = (err?: Error) => { input.removeListener("data", onData); try { input.setRawMode(false); } catch { /* closed */ } input.pause(); output.write("\n"); if (err) fail(err); else ok(buf); };
    const onData = (d: Buffer | string) => {
      for (const ch of String(d)) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") return done();
        if (ch === "\u0003") { buf = ""; return done(new Error("cancelled: nothing was stored")); }
        if (ch === "\u007f" || ch === "\b") { buf = buf.slice(0, -1); continue; }
        if (ch >= " ") buf += ch;
      }
    };
    input.setRawMode(true); input.resume(); input.on("data", onData);
  });
}
const yes = (v: string, def: boolean): boolean => (v.trim() ? /^(y|yes|s|sim)$/i.test(v.trim()) : def);
function defaultAsk(q: string): Promise<string> {
  return new Promise((ok) => { process.stderr.write(q + " "); let s = ""; const on = (d: Buffer) => { s += String(d); const i = s.indexOf("\n"); if (i >= 0) { process.stdin.removeListener("data", on); process.stdin.pause(); ok(s.slice(0, i).replace(/\r$/, "")); } }; process.stdin.resume(); process.stdin.on("data", on); });
}

/** `setup --key`: stores the Praeko write key. Source: PRAEKO_KEY in the environment (never shown), else the hidden prompt, and only in a terminal of the person's own. */
export async function keyFlow(c: Ctx, o: { checkKey: boolean; profile: string }): Promise<number> {
  const fromEnv = c.env.PRAEKO_KEY?.trim();
  if (!fromEnv && !c.isTTY) {
    c.err(`I will not ask for the key here: there is no terminal of your own (this looks like an agent, a pipe or CI), and a key must never pass through a chat or a command argument.\nRun this in YOUR terminal (it asks with hidden input):\n  ${keyCommand(o.profile)}`);
    return 1;
  }
  let k = "";
  const redact = (s: string): string => (k ? s.split(k).join("[key]") : s);
  const say = (s: string) => c.out(redact(s)), warn = (s: string) => c.err(redact(s));
  try {
    k = fromEnv || (await (c.readSecret ?? ((p: string) => readHidden(p)))("Praeko key with the write scope (input hidden, Enter to finish): ")).trim();
    if (!k) { warn("no key typed: nothing was stored"); return 1; }
    if (!validKeyFormat(k)) { warn("that does not look like a Praeko key (they start with praeko_, from the dashboard: Developers > API keys). Nothing was stored."); return 1; }
    if (fromEnv) say("using the key in the PRAEKO_KEY variable (not shown)");
    const store = c.usesKeychain ? null : resolve(c.secretsPath);
    if (store && insideAny(store, projectFoldersFor(c.cwd))) { warn(`the secrets file (${store}) is inside this project folder: a key never goes into a project. Unset PRAEKO_SECRETS or run from another folder. Nothing was stored.`); return 1; }
    let check = o.checkKey;
    if (!check && c.isTTY && !fromEnv) check = yes(await (c.ask ?? defaultAsk)("Check the key now with one read-only request to praeko.app (it sends only the key, to Praeko)? [Y/n]"), true);
    if (check) {
      const items = await praekoScopeItems({ key: k, fetchFn: c.fetchFn });
      const it = items[0];
      if (!it) say("· could not check the key (no network?): storing it anyway");
      else if (/did not accept/.test(it.msg)) { warn("✗ Praeko did not accept this key (invalid, revoked or expired). Nothing was stored: create another one in the dashboard."); return 1; }
      else say(`${it.level === "ok" ? "✓" : "⚠"} ${it.msg}${it.level === "ok" ? "" : ": a write key is enough for Studio"}`);
    }
    let where: "keychain" | "file";
    try { where = storePraekoKey(o.profile, k, c.storeKey); } catch { warn("✗ could not store the key (the system keychain or the secrets file refused). Nothing was printed."); return 1; }
    const account = o.profile === DEFAULT_PROFILE ? "praeko/chave" : praekoKeyRef(o.profile);
    say(`${where === "keychain" ? `✓ Praeko key stored in the macOS Keychain (service praeko, account ${account})` : `✓ Praeko key stored in ${c.secretsPath} (permission 600)`}, profile "${o.profile}"${o.profile === DEFAULT_PROFILE ? " (the global key: every project without a profile key uses it)" : ""}`);
    return 0;
  } catch (e: any) { warn(`✗ ${e.message}`); return 1; } finally { k = ""; }
}

// ---------- printing ----------
const ICON: Record<string, string> = { ok: "✓", warning: "⚠", error: "✗", info: "·", add: "+", update: "~", skip: "=", manual: "!" };
function printPlan(c: Ctx, plan: Plan): void {
  const o = c.out;
  o(`Praeko Studio setup ${plan.version} (${plan.system.os} ${plan.system.arch}, Node ${plan.system.node})\n`);
  o("Machine:");
  for (const r of plan.requirements) o(`  ${ICON[r.level]} ${r.msg}${r.fix && r.level !== "ok" ? `\n      → ${r.fix}` : ""}`);
  o("\nAgents:");
  for (const a of plan.agents) if (a.detected || a.selected) o(`  ${a.selected ? "●" : "○"} ${a.name}${a.detected ? ` (found: ${a.evidence.join(", ")})` : " (not found; chosen with --agent)"}${a.selected ? "" : " (not selected)"}`);
  if (!plan.agents.some((a) => a.detected || a.selected)) o("  none found: pass --agent claude,codex,cursor,claude-desktop,… to choose");
  o("\nPlan:");
  if (!plan.steps.length) o("  nothing to do");
  for (const s of plan.steps) { o(`  ${ICON[s.action]} ${s.summary}`); if (s.diff && s.action !== "skip") { o(`      --- ${tilde(c, s.file!)}\n      +++ ${tilde(c, s.file!)}`); for (const d of s.diff) o(`      ${d}`); } }
  const src = plan.key.source === "env" ? "PRAEKO_KEY in the environment" : plan.key.source === "profile" ? `the key of profile "${plan.key.profile}"` : "the global key";
  o(`\nPraeko key: profile "${plan.key.profile}"; ${plan.key.present ? `found (${src}; never shown)` : "none found"}. Order: PRAEKO_KEY > the project's profile > the global key.`);
  o(`Backups of every file touched go to ${tilde(c, join(c.configDir, "setup-backups"))}; \`praeko studio setup uninstall\` removes only what setup added.`);
}
function printOnlyYou(c: Ctx, l: string[]): void {
  c.out("\nWhat only you do:");
  l.forEach((x, i) => c.out(`  ${i + 1}. ${x}`));
}

// ---------- the command ----------
const WITH_VALUE = new Set(["agent", "lang", "profile", "server"]);
const flagValue = (a: string[], k: string): string | undefined => { const i = a.indexOf("--" + k); return i >= 0 && a[i + 1] !== undefined && !a[i + 1]!.startsWith("--") ? a[i + 1] : undefined; };
export const SETUP_USAGE = "usage: praeko studio setup [folder] [--plan] [--yes] [--agent claude,claude-desktop,codex,cursor,gemini,opencode,cline,windsurf|all] [--profile <name>] [--json] [--no-install] [--no-browser]\n       (with no Praeko key for the profile, setup ends by signing in with a code: you approve it at praeko.app/device)\n       praeko studio setup --key [--profile <name>] [--check-key]      (in your own terminal: asks for the Praeko key with hidden input)\n       praeko studio setup uninstall [--plan] [--yes] [--json]";

export async function setupCommand(a: string[], e: SetupEnv = {}): Promise<number> {
  const c = context(e);
  const known = new Set(["plan", "yes", "agent", "json", "no-install", "key", "check-key", "lang", "help", "profile", "no-browser", "server"]);
  for (const x of a) if (x.startsWith("--")) {
    const name = x.slice(2).split("=")[0]!;
    if (name === "key" && x.includes("=")) throw new Error("the key is never passed as an argument (it would stay in the shell history). Run `" + KEY_COMMAND + "` and type it at the hidden prompt, or set PRAEKO_KEY in your own terminal first.");
    if (!known.has(name)) throw new Error(`unknown option ${x}\n${SETUP_USAGE}`);
  }
  if (a.includes("--help")) { c.out(SETUP_USAGE); return 0; }
  const positional: string[] = [];
  for (let i = 0; i < a.length; i++) { const x = a[i]!; if (x.startsWith("--")) { if (WITH_VALUE.has(x.slice(2))) i++; continue; } positional.push(x); }
  const json = a.includes("--json"), planOnly = a.includes("--plan"), assumeYes = a.includes("--yes");
  const profileFlag = flagValue(a, "profile");
  if (a.includes("--profile") && (!profileFlag || !validProfile(profileFlag))) throw new Error("--profile takes a name: lowercase letters, digits and hyphens (for example my-channel)");
  const server = flagValue(a, "server");
  if (a.includes("--server") && !server) throw new Error("--server takes a URL (https://…; http only for localhost)");
  if (server) normalizeServer(server);
  if (a.includes("--key")) {
    if (positional.length) throw new Error("--key takes no value: the key is never an argument (shell history). Type it at the hidden prompt, or set PRAEKO_KEY in your own terminal first.");
    if (json) throw new Error("--key does not go with --json");
    // the profile: --profile, else the one of the project this folder is in, else the global key ("default")
    return keyFlow(c, { checkKey: a.includes("--check-key"), profile: profileFlag ?? readProjectProfile(findProjectRoot(c.cwd)) ?? DEFAULT_PROFILE });
  }
  if (positional[0] === "uninstall") return uninstallCommand(c, { json, planOnly, assumeYes });
  if (positional.length > 1) throw new Error(SETUP_USAGE);
  const ag = flagValue(a, "agent");
  if (a.includes("--agent") && !ag) throw new Error("--agent needs a list: " + SETUP_AGENTS.join(","));
  const plan = await buildPlan(c, { folder: positional[0], agents: ag ? parseAgentList(ag) : undefined, noInstall: a.includes("--no-install"), profile: profileFlag });
  const pending = plan.steps.some((s) => s.action === "add" || s.action === "update");
  let go = assumeYes && !planOnly;
  if (!json) printPlan(c, plan);
  if (!go && !planOnly && !json && pending && c.isTTY) go = yes(await (c.ask ?? defaultAsk)("\nApply this plan? [y/N]"), false);
  if (!go) {
    if (json) c.out(JSON.stringify({ ...plan, applied: false }, null, 2));
    else { c.out(`\n${pending ? "Nothing was changed. To apply: run it again with --yes (or answer yes in your own terminal)." : "Nothing to change."}`); printOnlyYou(c, plan.onlyYou); }
    return 0;
  }
  const results = await applyPlan(c, plan, { json });
  const failed = results.filter((r) => !r.ok);
  const after: Plan = { ...plan, mode: "apply" as const, key: keyStatus(c, plan.project.profile) };
  if (!json) {
    c.out("\nDone:");
    for (const r of results) c.out(`  ${r.ok ? "✓" : "✗"} ${r.msg}${r.backup ? ` (backup: ${tilde(c, r.backup)})` : ""}`);
  }
  // the key: sign in by code when none resolves for the profile (with --yes it runs; in a terminal it asks; never inside the plan)
  if (plan.steps.some((s) => s.kind === "login" && s.action === "add") && !after.key.present) {
    const profile = plan.project.profile;
    let doIt = assumeYes;
    if (!doIt && c.isTTY) doIt = yes(await (c.ask ?? defaultAsk)(`\nSign in to Praeko now? It shows a code; you approve it in the browser and the write key is stored for profile "${profile}" (never shown). [Y/n]`), true);
    if (doIt) {
      if (!json) c.out("\nSign in to Praeko (profile \"" + profile + "\"):");
      // in --json the sign-in lines (and its one-line JSON states) go to stderr: stdout stays ONE JSON document
      after.login = await runLogin({ ...(c.login ?? {}), env: c.env, platform: c.platform, cwd: c.cwd, fetchFn: c.fetchFn, storeKey: c.storeKey, getKey: c.getKey, secretsPath: c.secretsPath, usesKeychain: c.usesKeychain, out: c.out, err: c.err },
        { profile, json, noBrowser: a.includes("--no-browser"), server, jsonOut: c.err, say: json ? c.err : c.out, projectDir: plan.project.dir });
      if (after.login.status === "expired" && c.isTTY && !json) {
        for (let i = 0; i < 2 && after.login.status === "expired"; i++) {
          if (!yes(await (c.ask ?? defaultAsk)("Get a new code and try again? [Y/n]"), true)) break;
          after.login = await runLogin({ ...(c.login ?? {}), env: c.env, platform: c.platform, cwd: c.cwd, fetchFn: c.fetchFn, storeKey: c.storeKey, getKey: c.getKey, secretsPath: c.secretsPath, usesKeychain: c.usesKeychain, out: c.out, err: c.err }, { profile, noBrowser: a.includes("--no-browser"), server, say: c.out, projectDir: plan.project.dir });
        }
      }
    } else {
      after.login = { status: "declined", profile };
      // plan B, only in the person's own terminal: paste a key with hidden input
      if (c.isTTY && !json && yes(await (c.ask ?? defaultAsk)("\nPaste a Praeko write key instead (hidden input; it goes to the Keychain or the secrets file, never to the project)? [y/N]"), false)) await keyFlow(c, { checkKey: false, profile });
    }
    after.key = keyStatus(c, profile);
  }
  after.onlyYou = onlyYouList(c, after);
  const loginFailed = !!after.login && !["authorized", "declined"].includes(after.login.status);
  const code = after.login?.status === "cancelled" ? 130 : failed.length || loginFailed ? 1 : 0;
  if (json) { c.out(JSON.stringify({ ...after, applied: true, results }, null, 2)); return code; }
  printOnlyYou(c, after.onlyYou);
  if (failed.length) c.out(`\n${failed.length} step(s) failed: see the ✗ lines above.`);
  if (loginFailed) c.out(`\nThe files are in place, but the sign-in did not finish: run ${loginCommandFor(plan.project.profile)} (or ${keyCommand(plan.project.profile)} in your own terminal).`);
  c.out("\nNext: open your agent in the project folder and ask it to follow `praeko studio docs first-video`.");
  return code;
}

async function uninstallCommand(c: Ctx, o: { json: boolean; planOnly: boolean; assumeYes: boolean }): Promise<number> {
  const steps = planUninstall(c), pending = steps.some((s) => s.action === "remove");
  const view = steps.map((s) => ({ kind: s.entry.kind, action: s.action, summary: s.summary }));
  if (!o.json) {
    c.out(steps.length ? "Setup uninstall plan (nothing has changed yet):" : "Nothing to undo: no setup manifest (setup never changed anything here, or it was undone already).");
    for (const s of steps) c.out(`  ${s.action === "remove" ? "-" : "="} ${s.summary}`);
    c.out("The Praeko key stays where it is (it is shared with the praeko CLI); remove it with your keychain or the secrets file if you want.");
  }
  let go = o.assumeYes && !o.planOnly;
  if (!go && !o.planOnly && !o.json && pending && c.isTTY) go = yes(await (c.ask ?? defaultAsk)("\nUndo these? [y/N]"), false);
  if (!go) {
    if (o.json) c.out(JSON.stringify({ schema: "praeko-studio-setup-uninstall/1", applied: false, steps: view }, null, 2));
    else if (pending) c.out("\nNothing was changed. To undo: run it again with --yes.");
    return 0;
  }
  const results = applyUninstall(c, steps), failed = results.filter((r) => !r.ok);
  // handled entries leave the manifest (removed, or left in place on purpose); a failed one stays, to try again
  const m = readManifest(c), key = (x: Entry) => JSON.stringify(x), handled = new Set(steps.map((s) => key(s.entry)));
  const failedEntries = new Set(steps.filter((_, i) => !results[i]!.ok).map((s) => key(s.entry)));
  m.entries = m.entries.filter((x) => !handled.has(key(x)) || failedEntries.has(key(x)));
  writeManifest(c, m);
  if (o.json) { c.out(JSON.stringify({ schema: "praeko-studio-setup-uninstall/1", applied: true, steps: view, results }, null, 2)); return failed.length ? 1 : 0; }
  c.out("\nDone:");
  for (const r of results) c.out(`  ${r.ok ? "✓" : "✗"} ${r.msg}${r.backup ? ` (backup: ${tilde(c, r.backup)})` : ""}`);
  return failed.length ? 1 : 0;
}

/** For tests and the docs: the agents setup can register automatically (the others get the docs link). */
export const AUTOMATIC_AGENTS: SetupAgent[] = ["claude", "claude-desktop", "codex", "cursor"];

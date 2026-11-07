// Covers through HyperFrames: engine routing, command construction, the TSX-component error, doctor and license wording. The npx call is faked (no network, no Chrome).
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { COVER_AT, HfError, generateCovers, snapshotArgs, snapshotFile } from "@praeko/studio-hyperframes";
import { coverHyperframes, engineOf } from "../src/engine.ts";
import { NOTICE } from "../src/licenses.ts";
import { remotionNeeded } from "../src/doctor.ts";
import { episodeOf } from "../src/project.ts";

const BIN = new URL("../bin/praeko-studio.ts", import.meta.url).pathname;
const base = mkdtempSync(join(tmpdir(), "studio-cover-"));

function project(brand: any, episodes: Record<string, { spec: any; yaml?: string }>) {
  const root = mkdtempSync(join(base, "p-"));
  mkdirSync(join(root, "src"), { recursive: true }); writeFileSync(join(root, "src", "index.ts"), "");
  writeFileSync(join(root, "brand.json"), JSON.stringify({ name: "X", handle: "@x", ...brand }));
  for (const [slug, e] of Object.entries(episodes)) {
    const f = join(root, "episodes", slug); mkdirSync(f, { recursive: true });
    writeFileSync(join(f, "episode.spec.json"), JSON.stringify(e.spec)); writeFileSync(join(f, "episode.json"), JSON.stringify({ id: "E", cover: "CoverE" }));
    if (e.yaml) writeFileSync(join(f, "episode.yaml"), e.yaml);
  }
  return root;
}
const SHORT = { id: "E", durS: 12, outro: { a: 9, cta: "X" }, scenes: [{ start: 0, items: [] }], cover: { id: "CoverE", title: ["ONE", "TWO"], color: "accent", items: [{ type: "box", text: "hello", color: "ok", size: 60 }] } };
const LONG = { id: "L", durS: 60, scenes: [{ n: 1, title: "A", start: 0, items: [] }], cover: { id: "CoverL", title: ["TWO CLICKS", "ONE ITEM"], mascot: "happy", code: { title: "a.mjs", lines: [{ s: "UPDATE x" }, { s: "AND y", hl: true }] }, chips: [{ text: "ok", color: "ok" }] } };

test("engine for covers: --engine > episode.yaml engine > brand engine > remotion", () => {
  const root = project({ engine: "hyperframes" }, { a: { spec: SHORT }, b: { spec: { ...SHORT, engine: "remotion" } } });
  const p = { root, brand: { engine: "hyperframes" } as any };
  assert.equal(engineOf(p, episodeOf(p, "a")), "hyperframes");
  assert.equal(engineOf(p, episodeOf(p, "b")), "remotion", "the episode's engine wins over the brand's");
  assert.equal(engineOf(p, episodeOf(p, "b"), "hyperframes"), "hyperframes", "the flag wins over everything");
  assert.equal(engineOf({ root, brand: {} as any }, episodeOf(p, "a")), "remotion", "Remotion is the default");
});
test("command construction: hyperframes snapshot, validated against hyperframes@0.9.13", () => {
  assert.deepEqual(snapshotArgs("/p/dir", "/p/dir/.snapshot"), ["--yes", "hyperframes@0.9.13", "snapshot", "/p/dir", "--at", String(COVER_AT), "--output", "/p/dir/.snapshot", "--keep", "--no-end"]);
  assert.equal(snapshotFile("/o"), join("/o", `at-${COVER_AT}s.png`));
});
test("short cover: one 1080x1920 project with the title, the colored second line, the items and the handle", () => {
  const root = project({ handle: "@chan" }, { a: { spec: SHORT } });
  const g = generateCovers({ root, slug: "a" });
  assert.equal(g.projects.length, 1); assert.equal(g.projects[0]!.png, "a-cover.png"); assert.equal(g.projects[0]!.width, 1080); assert.equal(g.projects[0]!.height, 1920);
  const html = readFileSync(join(g.projects[0]!.dir, "index.html"), "utf8");
  assert.match(html, /data-width="1080" data-height="1920"/); assert.match(html, /ONE<br><span style="color:#f4b942">TWO<\/span>/); assert.match(html, />hello</); assert.match(html, /@chan/);
  assert.ok(existsSync(join(g.projects[0]!.dir, "hyperframes.json")));
});
test("long cover: the 16:9 and the vertical projects, named like the Remotion path", () => {
  const root = project({ mascotPath: "gatos/gato-{name}.png" }, { l: { spec: LONG } });
  mkdirSync(join(root, "public", "gatos"), { recursive: true }); writeFileSync(join(root, "public", "gatos", "gato-happy.png"), "png");
  const g = generateCovers({ root, slug: "l" });
  assert.deepEqual(g.projects.map((x) => [x.png, x.width, x.height]), [["l-cover-1280x720.png", 1280, 720], ["l-cover-vertical-1080x1920.png", 1080, 1920]]);
  const wide = readFileSync(join(g.projects[0]!.dir, "index.html"), "utf8");
  assert.match(wide, /TWO CLICKS/); assert.match(wide, /a\.mjs/); assert.match(wide, /assets\/gatos\/gato-happy\.png/);
  assert.ok(existsSync(join(g.projects[0]!.dir, "assets", "gatos", "gato-happy.png")), "the mascot asset is copied");
});
test("a cover written as a TSX component cannot render in HyperFrames: clear error", () => {
  const root = project({}, { a: { spec: { ...SHORT, cover: { id: "CoverE", component: "CoverE" } } } });
  assert.throws(() => generateCovers({ root, slug: "a" }), (e: any) => e instanceof HfError && /uses `component: CoverE` \(TSX\).*cannot render/.test(e.message) && /--engine remotion/.test(e.message));
});
test("coverHyperframes copies the snapshot to out/ (fake runner) and reports a failed snapshot", async () => {
  const root = project({ engine: "hyperframes" }, { a: { spec: SHORT } });
  const p = { root, brand: { engine: "hyperframes" } as any }, ep = episodeOf(p, "a");
  const log = console.log; let out = ""; console.log = (m: string) => { out += m + "\n"; };
  try {
    const calls: string[][] = [];
    const ok = await coverHyperframes(p, ep, (async (cmd: string, args: string[]) => { calls.push([cmd, ...args]); const o = args[args.indexOf("--output") + 1]!; mkdirSync(o, { recursive: true }); writeFileSync(join(o, `at-${COVER_AT}s.png`), "PNG"); return { code: 0, out: "" }; }) as any);
    assert.equal(ok, 0); assert.equal(calls.length, 1); assert.equal(calls[0]![0], "npx"); assert.equal(calls[0]![3], "snapshot");
    assert.equal(readFileSync(join(root, "out", "a-cover.png"), "utf8"), "PNG"); assert.match(out, /cover \(hyperframes\): out\/a-cover\.png|a-cover\.png/);
    out = "";
    const bad = await coverHyperframes(p, ep, (async () => ({ code: 0, out: "" })) as any);
    assert.equal(bad, 1); assert.match(out, /did not produce the cover/);
  } finally { console.log = log; }
});
test("CLI `cover` follows the engine: hyperframes runs snapshot (fake npx on PATH) and Remotion is not needed", { skip: process.platform === "win32" && "needs a POSIX shell" }, () => {
  const root = project({ engine: "hyperframes" }, { a: { spec: SHORT, yaml: "id: E\nduration: 12\nvoice: x\noutro: { start: 9, cta: X }\ncover: { id: CoverE, title: [\"ONE\", \"TWO\"], color: accent }\nscenes:\n  - start: 0\n    items:\n      - { type: big, text: hi }\n" } });
  const fake = mkdtempSync(join(base, "bin-")); const npx = join(fake, "npx");
  writeFileSync(npx, `#!/bin/sh\necho "$@" >> "${join(fake, "calls.txt")}"\nout=""\nwhile [ $# -gt 0 ]; do if [ "$1" = "--output" ]; then out="$2"; fi; shift; done\nmkdir -p "$out" && echo PNG > "$out/at-${COVER_AT}s.png"\n`); chmodSync(npx, 0o755);
  const env = { ...process.env, PATH: fake + delimiter + process.env.PATH, HOME: base, PRAEKO_NO_KEYCHAIN: "1", PRAEKO_STUDIO_CONFIG: join(base, "cfg") } as NodeJS.ProcessEnv;
  const r = spawnSync(process.execPath, [BIN, "cover", "a"], { cwd: root, encoding: "utf8", env });
  assert.equal(r.status, 0, r.stderr + r.stdout); assert.match(r.stdout, /cover \(hyperframes\)/);
  assert.match(readFileSync(join(fake, "calls.txt"), "utf8"), /--yes hyperframes@0\.9\.13 snapshot .* --at 60 --output .* --keep --no-end/);
  assert.ok(existsSync(join(root, "out", "a-cover.png")));
  assert.doesNotMatch(r.stderr, /Remotion/, "no Remotion notice with the hyperframes engine");
  // a Remotion project (no engine) does not touch HyperFrames: it asks for @remotion/cli instead
  const r2 = spawnSync(process.execPath, [BIN, "cover", "a", "--engine", "remotion"], { cwd: root, encoding: "utf8", env });
  assert.notEqual(r2.status, 0); assert.match(r2.stderr, /@remotion\/cli is not installed/);
});
test("doctor: with the hyperframes engine for everything it says Remotion is not needed; otherwise it does not", () => {
  const hf = project({ engine: "hyperframes" }, { a: { spec: SHORT, yaml: "id: E\n" } });
  assert.equal(remotionNeeded(hf, { engine: "hyperframes" }), false);
  assert.equal(remotionNeeded(project({}, { a: { spec: SHORT, yaml: "id: E\n" } }), {}), true);
  assert.equal(remotionNeeded(project({ engine: "hyperframes" }, { a: { spec: SHORT, yaml: "id: E\nengine: remotion\n" } }), { engine: "hyperframes" }), true, "one episode on Remotion is enough");
  const env = { ...process.env, HOME: base, PRAEKO_NO_KEYCHAIN: "1", PRAEKO_STUDIO_CONFIG: join(base, "cfg"), PRAEKO_SECRETS: join(base, "s.json") } as NodeJS.ProcessEnv;
  const j = JSON.parse(spawnSync(process.execPath, [BIN, "doctor", "--json", "--offline"], { cwd: hf, encoding: "utf8", env }).stdout);
  assert.equal(j.items.find((i: any) => i.id === "engine").msg, "engine: hyperframes (Remotion not needed)");
  assert.notEqual(j.items.find((i: any) => i.id === "chromium").level, "warning");
  assert.equal(j.items.find((i: any) => i.id === "licenses").level, "info");
  const pt = spawnSync(process.execPath, [BIN, "doctor", "--offline", "--lang", "pt"], { cwd: hf, encoding: "utf8", env }).stdout;
  assert.match(pt, /motor: hyperframes \(Remotion não é necessário\)/);
});
test("license notice wording: Remotion is the default for videos AND covers; with --engine hyperframes nothing from Remotion is used", () => {
  assert.match(NOTICE.en, /Remotion is the default engine for videos AND covers; with --engine hyperframes nothing from Remotion is used/);
  assert.match(NOTICE.pt, /Remotion é o motor padrão para vídeos E capas; com --engine hyperframes nada do Remotion é usado/);
  assert.doesNotMatch(NOTICE.en, /Covers still use Remotion|required for covers/);
});

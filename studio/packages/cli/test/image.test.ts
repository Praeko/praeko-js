// Image pieces (`format: image`): compile, `new --image`, `slides` (the Remotion still is faked: flags checked, a real JPEG header written), check, package and the commands that refuse an image.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileEpisode, isImagePiece } from "../src/compile.ts";
import { IMAGE_LIMITS, checkJpeg, jpegSize } from "../src/image.ts";

const BIN = new URL("../bin/praeko-studio.ts", import.meta.url).pathname;
const base = mkdtempSync(join(tmpdir(), "studio-image-"));
const env = { ...process.env, HOME: join(base, "home"), PRAEKO_NO_KEYCHAIN: "1", PRAEKO_STUDIO_CONFIG: join(base, "cfg") };
const studio = (args: string[], cwd: string) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", env });

/** A JPEG with a real SOF0 header of width x height (no actual picture), padded to `size` bytes. */
export const jpeg = (width: number, height: number, size = 3000): Buffer => {
  const head = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0, 0x11, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
  return Buffer.concat([head, Buffer.alloc(Math.max(0, size - head.length))]);
};
/** A project whose `node_modules/@remotion/cli` is a fake: it logs its arguments and writes a JPEG of the size the test chose to the output path. */
function project(opts: { width?: number; height?: number; size?: number; failOn?: string; hangOn?: string } = {}): string {
  const root = mkdtempSync(join(base, "p-"));
  mkdirSync(join(root, "src"), { recursive: true }); writeFileSync(join(root, "src", "index.ts"), "");
  writeFileSync(join(root, "brand.json"), JSON.stringify({ name: "Canal", handle: "@canal", publishing: { hashtags: { allowed: [], banned: [] } } }));
  writeFileSync(join(root, "src", "Root.tsx"), "// praeko-studio:imports\n// praeko-studio:/imports\n{/* praeko-studio:compositions */}\n{/* praeko-studio:/compositions */}\n");
  const cli = join(root, "node_modules", "@remotion", "cli"); mkdirSync(cli, { recursive: true });
  writeFileSync(join(cli, "package.json"), JSON.stringify({ name: "@remotion/cli", version: "0.0.0" }));
  writeFileSync(join(cli, "remotion-cli.js"), `const fs=require("fs");const a=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(join(root, "remotion.log"))},JSON.stringify(a)+"\\n");if(a[2]===${JSON.stringify(opts.failOn ?? "")}){console.error("boom on "+a[2]);process.exit(3);}if(a[2]===${JSON.stringify(opts.hangOn ?? "")}){setTimeout(()=>{},60000);return;}fs.writeFileSync(a[3],Buffer.from(${JSON.stringify(jpeg(opts.width ?? 1080, opts.height ?? 1350, opts.size).toString("base64"))},"base64"));`);
  return root;
}
const log = (root: string): string[][] => (existsSync(join(root, "remotion.log")) ? readFileSync(join(root, "remotion.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []);
const YAML_OK = `format: image\nid: Dica\nsize: 4x5\nslides:\n  - alt: "Slide com o título da dica"\n    title: ["PRS", "PEQUENOS"]\n    items:\n      - { type: text, size: 52, color: muted, text: "Um PR, uma ideia" }\n`;
function episodeDir(yaml: string): string { const d = join(mkdtempSync(join(base, "e-")), "x"); mkdirSync(d, { recursive: true }); writeFileSync(join(d, "episode.yaml"), yaml); writeFileSync(join(d, "episode.json"), JSON.stringify({ id: "X" })); return d; }

test("compile: format image writes a spec with one slide of 1080x1350, an id per slide and the alt text; no voice, scenes or outro are needed", () => {
  const d = episodeDir(YAML_OK), r = compileEpisode(d);
  assert.deepEqual(r.errors, []);
  assert.deepEqual([r.spec.format, r.spec.size, r.spec.width, r.spec.height, r.spec.id], ["image", "4x5", 1080, 1350, "Dica"]);
  assert.deepEqual([r.spec.slides.length, r.spec.slides[0].id, r.spec.slides[0].alt, r.spec.slides[0].title], [1, "DicaSlide01", "Slide com o título da dica", ["PRS", "PEQUENOS"]]);
  assert.equal(JSON.parse(readFileSync(join(d, "episode.spec.json"), "utf8")).slides[0].items[0].text, "Um PR, uma ideia");
  assert.equal(isImagePiece(d), true);
});
test("compile: refuses more than one slide in format image (it points to carousel), HyperFrames, another size, unknown keys, empty slides and bad colors", () => {
  const erros = (yaml: string) => compileEpisode(episodeDir(yaml), { write: false }).errors.join(" | ");
  const slide = '  - alt: "a"\n    items:\n      - { type: text, text: "x" }\n';
  assert.match(erros(`format: image\nid: A\nslides:\n${slide}${slide}`), /2 slides: an image piece has exactly one slide \(use `format: carousel` for 2 to 20\)/);
  assert.match(erros(`format: image\nid: A\nengine: hyperframes\nslides:\n${slide}`), /render only with Remotion/);
  assert.match(erros(`format: image\nid: A\nsize: 1x1\nslides:\n${slide}`), /only 4x5 \(1080x1350\) exists for now/);
  assert.match(erros(`format: image\nid: A\nduration: 10\nslides:\n${slide}`), /unknown key "duration"/);
  assert.match(erros(`format: image\nid: A\nslides:\n  - alt: "a"\n`), /no items/);
  assert.match(erros(`format: image\nid: A\nslides: []\n`), /"slides" must be a list/);
  assert.match(erros(`format: image\nid: A\nslides:\n  - alt: "a"\n    color: roxo\n    items:\n      - { type: text, text: "x" }\n`), /color "roxo" does not exist/);
  assert.match(erros(`format: image\nid: A\nslides:\n  - alt: "a"\n    title: "uma linha"\n    items:\n      - { type: text, text: "x" }\n`), /"title" is a list of 1 to 3 lines/);
  assert.match(erros(`format: image\nid: A\nslides:\n  - alt: "a"\n    items:\n      - { type: nada, text: "x" }\n`), /unknown type "nada"/);
});
test("jpegSize e checkJpeg: leem as dimensões do cabeçalho; recusam PNG, tamanho errado e mais de 8 MB", () => {
  assert.deepEqual(jpegSize(jpeg(1080, 1350)), { width: 1080, height: 1350 });
  assert.equal(jpegSize(Buffer.from("\x89PNG\r\n\x1a\n")), null);
  const d = mkdtempSync(join(base, "j-"));
  const f = (name: string, b: Buffer) => { const p = join(d, name); writeFileSync(p, b); return p; };
  assert.deepEqual(checkJpeg(f("ok.jpg", jpeg(1080, 1350))).errors, []);
  assert.match(checkJpeg(f("png.jpg", Buffer.from("\x89PNG\r\n\x1a\n" + "x".repeat(50)))).errors[0]!, /is not a JPEG/);
  assert.match(checkJpeg(f("sq.jpg", jpeg(1080, 1080))).errors[0]!, /is 1080x1080, expected 1080x1350/);
  assert.match(checkJpeg(f("big.jpg", jpeg(1080, 1350, IMAGE_LIMITS.bytesMax + 1))).errors[0]!, /Instagram accepts up to 8 MB/);
  assert.match(checkJpeg(join(d, "nao-existe.jpg")).errors[0]!, /does not exist/);
});
test("new --image creates the piece (yaml, publication.json of an image, registered in Root); it has no script, voice or words", () => {
  const root = project();
  const r = studio(["new", "dica-pr", "--title", "Dica de PR", "--image"], root);
  assert.equal(r.status, 0, r.stderr);
  const f = (n: string) => join(root, "episodes", "dica-pr", n);
  for (const n of ["episode.yaml", "episode.spec.json", "episode.tsx", "scenes.tsx", "publication.json", "episode.json"]) assert.ok(existsSync(f(n)), n);
  for (const n of ["script.txt", "words.ts"]) assert.ok(!existsSync(f(n)), `${n} does not exist for an image`);
  const pub = JSON.parse(readFileSync(f("publication.json"), "utf8"));
  assert.deepEqual([pub.format, pub.kind, pub.images, pub.yt, pub.tiktok], ["image", "image", [], undefined, undefined]);
  assert.match(readFileSync(join(root, "src", "Root.tsx"), "utf8"), /DicaPrComposition/);
  assert.match(readFileSync(f("episode.tsx"), "utf8"), /ImageDecl/);
  assert.notEqual(studio(["new", "x", "--long", "--image"], root).status, 0, "--long and --image do not go together");
  assert.match(studio(["voice", "dica-pr"], root).stderr, /image piece.*no voice/);
  assert.match(studio(["render", "dica-pr"], root).stderr, /image piece.*no video.*slides dica-pr/);
  assert.match(studio(["cover", "dica-pr"], root).stderr, /image piece.*no cover/);
});
test("slides: runs `remotion still` with the JPEG flags per slide, writes out/<slug>-slide-01.jpg and verifies it; HyperFrames and non-image episodes are refused", () => {
  const root = project();
  assert.equal(studio(["new", "dica", "--title", "Dica", "--image"], root).status, 0);
  const r = studio(["slides", "dica"], root);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const calls = log(root);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.slice(0, 3), ["still", "src/index.ts", "DicaSlide01"]);
  assert.ok(calls[0]![3]!.endsWith("out/dica-slide-01.jpg"));
  assert.deepEqual(calls[0]!.slice(4), ["--image-format=jpeg", "--jpeg-quality=92"]);
  assert.deepEqual(jpegSize(readFileSync(join(root, "out", "dica-slide-01.jpg"))), { width: 1080, height: 1350 });
  assert.match(r.stdout, /slide 1: out\/dica-slide-01\.jpg \(1080x1350/);
  const hf = studio(["slides", "dica", "--engine", "hyperframes"], root);
  assert.notEqual(hf.status, 0); assert.match(hf.stderr, /render only with Remotion: HyperFrames has no image mode yet/);
  assert.equal(log(root).length, 1, "the engine was never called for hyperframes");
  studio(["new", "video", "--title", "V"], root);
  assert.match(studio(["slides", "video"], root).stderr, /is not an image piece/);
});
test("slides: a render with the wrong size fails the command (and the check names it)", () => {
  const root = project({ width: 1080, height: 1080 });
  studio(["new", "dica", "--image"], root);
  const r = studio(["slides", "dica"], root);
  assert.equal(r.status, 1); assert.match(r.stdout, /expected 1080x1350/);
  assert.equal(studio(["check", "dica"], root).status, 1);
});
test("check: needs the alt text (error), warns that the slide is not rendered yet, then passes after slides; package writes images (file + alt) and texts.md", () => {
  const root = project();
  studio(["new", "dica", "--title", "Dica", "--image"], root);
  const y = join(root, "episodes", "dica", "episode.yaml"), orig = readFileSync(y, "utf8");
  writeFileSync(y, orig.replace(/^  - alt: .*$/m, "  - alt: \"\""));
  const semAlt = studio(["check", "dica"], root);
  assert.equal(semAlt.status, 1); assert.match(semAlt.stdout, /alt text is required/);
  writeFileSync(y, orig.replace(/^  - alt: .*$/m, `  - alt: "${"x".repeat(1001)}"`));
  assert.match(studio(["check", "dica"], root).stdout, /alt text has 1001 characters \(limit 1000\)/);
  writeFileSync(y, orig);
  const pj = join(root, "episodes", "dica", "publication.json"), pub = JSON.parse(readFileSync(pj, "utf8"));
  pub.ig.caption = "Um PR, uma ideia."; pub.hashtags.instagram = ["#devbrasil"]; writeFileSync(pj, JSON.stringify(pub));
  const antes = studio(["check", "dica"], root);
  assert.equal(antes.status, 0, antes.stdout); assert.match(antes.stdout, /not rendered yet/);
  assert.equal(studio(["slides", "dica"], root).status, 0);
  const depois = studio(["check", "dica"], root);
  assert.equal(depois.status, 0, depois.stdout); assert.doesNotMatch(depois.stdout, /not rendered yet/);
  const p = studio(["package", "dica"], root);
  assert.equal(p.status, 0, p.stdout + p.stderr);
  const out = JSON.parse(readFileSync(pj, "utf8"));
  assert.deepEqual([out.kind, out.format, out.images.length, out.images[0].file, out.images[0].alt.length > 0], ["image", "image", 1, join("out", "dica-slide-01.jpg"), true]);
  const md = readFileSync(join(root, "episodes", "dica", "texts.md"), "utf8");
  assert.match(md, /## Instagram \(photo\): caption/); assert.match(md, /Um PR, uma ideia\. #devbrasil/); assert.match(md, /## Alt text/);
  assert.match(md, /YouTube and TikTok do not take image posts yet/); assert.doesNotMatch(md, /## TikTok|YouTube Shorts/);
});
test("schedule and post: an image goes only through `schedule --via praeko`; Buffer's own path and the direct providers refuse it", () => {
  const root = project();
  studio(["new", "dica", "--title", "Dica", "--image"], root);
  const pj = join(root, "episodes", "dica", "publication.json"), pub = JSON.parse(readFileSync(pj, "utf8")); pub.ig.caption = "Legenda"; writeFileSync(pj, JSON.stringify(pub));
  assert.match(studio(["post", "dica", "--when", "10/12 17:30"], root).stderr, /image posts do not go through the direct providers/);
  assert.match(studio(["schedule", "dica", "--via", "buffer", "--when", "10/12 17:30"], root).stderr, /image posts are scheduled through Praeko only/);
  const yt = studio(["schedule", "dica", "--via", "praeko", "--networks", "yt", "--when", "10/12 17:30"], root);
  assert.notEqual(yt.status, 0); assert.match(yt.stderr + yt.stdout, /image and carousel posts go only to Instagram for now/);
});

// ---------------------------------------------------------------------------------------------------------------- carousel
const slideYaml = (n: number, extra = "") => Array.from({ length: n }, (_, i) => `  - alt: "Slide ${i + 1}: descrição"\n    items:\n      - { type: text, text: "Ponto ${i + 1}" }\n`).join("") + extra;
const CAROUSEL = (n: number) => `format: carousel\nid: Dica\nsize: 4x5\nslides:\n${slideYaml(n)}`;
test("compile: format carousel takes 2 to 20 slides (ids in order, alt per slide, spec format carousel); 1 and 21 are refused with a hint; alt over 1000 characters is an error", () => {
  const ok = compileEpisode(episodeDir(CAROUSEL(4)));
  assert.deepEqual(ok.errors, []);
  assert.deepEqual([ok.spec.format, ok.spec.width, ok.spec.height, ok.spec.slides.length], ["carousel", 1080, 1350, 4]);
  assert.deepEqual(ok.spec.slides.map((s: any) => s.id), ["DicaSlide01", "DicaSlide02", "DicaSlide03", "DicaSlide04"]);
  assert.deepEqual(ok.spec.slides.map((s: any) => s.alt), [1, 2, 3, 4].map((n) => `Slide ${n}: descrição`));
  assert.deepEqual(compileEpisode(episodeDir(CAROUSEL(20)), { write: false }).errors, []);
  const erros = (yaml: string) => compileEpisode(episodeDir(yaml), { write: false }).errors.join(" | ");
  assert.match(erros(CAROUSEL(1)), /1 slide: a carousel takes 2 to 20 \(for a single image use `format: image`\)/);
  assert.match(erros(CAROUSEL(21)), /21 slides: a carousel takes 2 to 20/);
  assert.match(erros(`format: carousel\nid: A\nslides: []\n`), /"slides" must be a list with 2 to 20 slides/);
  assert.match(erros(`format: carousel\nid: A\nengine: hyperframes\nslides:\n${slideYaml(2)}`), /render only with Remotion/);
  assert.match(erros(`format: carousel\nid: A\nduration: 3\nslides:\n${slideYaml(2)}`), /carousel episode: unknown key "duration"/);
  assert.match(erros(`format: carousel\nid: A\nslides:\n${slideYaml(1)}  - alt: "${"x".repeat(1001)}"\n    items:\n      - { type: text, text: "x" }\n`), /slide 2: alt text has 1001 characters \(limit 1000\)/);
  assert.match(erros(`format: carousel\nid: A\nslides:\n${slideYaml(1)}  - alt: "b"\n`), /slide 2: no items/);
  assert.equal(isImagePiece(episodeDir(CAROUSEL(2))), true);
});
test("new --carousel creates a carousel piece with 2 slides to edit, a carousel publication.json and the Root registration; --long/--image/--carousel do not mix", () => {
  const root = project();
  const r = studio(["new", "dicas", "--title", "Dicas de PR", "--carousel"], root);
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /carousel created: episodes\/dicas\/ \(id Dicas\)\. Next: edit the slides in episode.yaml/);
  const f = (n: string) => join(root, "episodes", "dicas", n);
  const spec = JSON.parse(readFileSync(f("episode.spec.json"), "utf8"));
  assert.deepEqual([spec.format, spec.slides.length], ["carousel", 2]);
  const pub = JSON.parse(readFileSync(f("publication.json"), "utf8"));
  assert.deepEqual([pub.format, pub.kind, pub.images, pub.yt, pub.tiktok], ["carousel", "carousel", [], undefined, undefined]);
  assert.match(readFileSync(join(root, "src", "Root.tsx"), "utf8"), /DicasComposition/);
  assert.notEqual(studio(["new", "x", "--image", "--carousel"], root).status, 0);
  assert.notEqual(studio(["new", "y", "--long", "--carousel"], root).status, 0);
  assert.match(studio(["render", "dicas"], root).stderr, /image piece \(format: carousel\).*no video.*slides dicas/);
});
test("slides (carousel): one `remotion still` per slide in the order of slides:, files out/<slug>-slide-01.jpg … NN, every one checked; the 20-slide carousel is accepted", () => {
  const root = project();
  fs_write(root, "dicas", CAROUSEL(5));
  const r = studio(["slides", "dicas"], root);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const calls = log(root);
  assert.deepEqual(calls.map((c) => c[2]), ["DicaSlide01", "DicaSlide02", "DicaSlide03", "DicaSlide04", "DicaSlide05"], "stable order, one still per slide");
  assert.deepEqual(calls.map((c) => c[3]!.split("/").pop()), [1, 2, 3, 4, 5].map((n) => `dicas-slide-0${n}.jpg`));
  for (const c of calls) assert.deepEqual(c.slice(4), ["--image-format=jpeg", "--jpeg-quality=92"]);
  for (let n = 1; n <= 5; n++) assert.deepEqual(jpegSize(readFileSync(join(root, "out", `dicas-slide-0${n}.jpg`))), { width: 1080, height: 1350 });
  assert.match(r.stdout, /slide 5: out\/dicas-slide-05\.jpg \(1080x1350/); assert.match(r.stdout, /next: `npx @praeko\/studio@[\d.]+ check dicas`/);
  const big = project(); fs_write(big, "grande", CAROUSEL(20).replace("id: Dica", "id: Grande"));
  const rb = studio(["slides", "grande"], big);
  assert.equal(rb.status, 0, rb.stderr + rb.stdout); assert.equal(log(big).length, 20); assert.ok(existsSync(join(big, "out", "grande-slide-20.jpg")));
});
test("slides (carousel): a slide that fails is NAMED, the others still render, the command exits 1 and the stale file of the failed slide is removed", () => {
  const root = project({ failOn: "DicaSlide02" });
  fs_write(root, "dicas", CAROUSEL(3)); fs_json(root, "dicas", { title: "Dicas", format: "carousel", kind: "carousel", images: [], ai: { synthetic: false }, ig: { caption: "Três dicas." }, hashtags: { instagram: ["#dev"] } });
  mkdirSync(join(root, "out"), { recursive: true }); writeFileSync(join(root, "out", "dicas-slide-02.jpg"), jpeg(1080, 1350)); // an older render
  const r = studio(["slides", "dicas"], root);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /slide 2 of 3 \(DicaSlide02\) failed to render \(exit 3; limit 180 s per slide\)/); assert.match(r.stdout, /1 of 3 slide\(s\) failed: 2/);
  assert.equal(log(root).length, 3, "slide 3 was still tried"); assert.ok(!existsSync(join(root, "out", "dicas-slide-02.jpg")), "no stale file stands in for the failed slide");
  assert.ok(existsSync(join(root, "out", "dicas-slide-01.jpg")) && existsSync(join(root, "out", "dicas-slide-03.jpg")));
  assert.equal(studio(["check", "dicas"], root).status, 0, "check only warns that slide 2 is not rendered");
  assert.match(studio(["check", "dicas"], root).stdout, /slide 2 is not rendered yet/);
});
test("slides (carousel): a slide that hangs is stopped at --timeout and named", () => {
  const root = project({ hangOn: "DicaSlide02" });
  fs_write(root, "dicas", CAROUSEL(2));
  const t0 = Date.now(), r = studio(["slides", "dicas", "--timeout", "1"], root);
  assert.equal(r.status, 1); assert.ok(Date.now() - t0 < 20000);
  assert.match(r.stderr + r.stdout, /did not finish in 1 s: stopped/); assert.match(r.stdout, /slide 2 of 2 \(DicaSlide02\) failed to render \(exit .*limit 1 s per slide\)/);
  assert.match(studio(["slides", "dicas", "--timeout", "abc"], root).stderr, /--timeout takes a number of seconds/);
});
test("check and package (carousel): alt per slide, JPEG per slide, images in order in publication.json (kind carousel), texts.md says carousel", () => {
  const root = project();
  fs_write(root, "dicas", CAROUSEL(3)); fs_json(root, "dicas", { title: "Dicas", format: "carousel", kind: "carousel", images: [], ai: { synthetic: false }, ig: { caption: "Três dicas." }, hashtags: { instagram: ["#dev"] } });
  const antes = studio(["check", "dicas"], root);
  assert.equal(antes.status, 0, antes.stdout); assert.match(antes.stdout, /slide 1 is not rendered yet/); assert.match(antes.stdout, /slide 3 is not rendered yet/);
  assert.equal(studio(["slides", "dicas"], root).status, 0);
  const depois = studio(["check", "dicas"], root);
  assert.equal(depois.status, 0, depois.stdout); assert.doesNotMatch(depois.stdout, /not rendered yet/);
  writeFileSync(join(root, "out", "dicas-slide-02.jpg"), jpeg(1080, 1080));
  const torto = studio(["check", "dicas"], root);
  assert.equal(torto.status, 1); assert.match(torto.stdout, /is 1080x1080, expected 1080x1350/);
  assert.equal(studio(["slides", "dicas"], root).status, 0);
  const p = studio(["package", "dicas"], root);
  assert.equal(p.status, 0, p.stdout + p.stderr);
  const out = JSON.parse(readFileSync(join(root, "episodes", "dicas", "publication.json"), "utf8"));
  assert.deepEqual([out.kind, out.format], ["carousel", "carousel"]);
  assert.deepEqual(out.images, [1, 2, 3].map((n) => ({ file: join("out", `dicas-slide-0${n}.jpg`), alt: `Slide ${n}: descrição` })));
  const md = readFileSync(join(root, "episodes", "dicas", "texts.md"), "utf8");
  assert.match(md, /\(carousel, publishing package\)/); assert.match(md, /## Instagram \(carousel\): caption/); assert.match(md, /Slide 3\. Slide 3: descrição/);
});
function fs_write(root: string, slug: string, yaml: string): void {
  const d = join(root, "episodes", slug); mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "episode.yaml"), yaml); writeFileSync(join(d, "episode.json"), JSON.stringify({ id: "Dica", title: slug }));
  const id = /id: (\w+)/.exec(yaml)![1]; writeFileSync(join(d, "episode.json"), JSON.stringify({ id, title: slug }));
}
function fs_json(root: string, slug: string, pub: any): void { writeFileSync(join(root, "episodes", slug, "publication.json"), JSON.stringify(pub)); }

test("compile command on an image piece and on a carousel piece prints the slide count and exits 0 (it used to read spec.scenes and crash)", () => {
  const root = project();
  assert.equal(studio(["new", "foto", "--title", "Foto", "--image"], root).status, 0);
  const a = studio(["compile", "foto"], root);
  assert.equal(a.status, 0, a.stdout + a.stderr); assert.match(a.stdout, /episode\.spec\.json \(1 slide\)/); assert.doesNotMatch(a.stderr, /Cannot read properties/);
  assert.equal(studio(["new", "serie", "--title", "Serie", "--carousel"], root).status, 0);
  const b = studio(["compile", "serie"], root);
  assert.equal(b.status, 0, b.stdout + b.stderr); assert.match(b.stdout, /episode\.spec\.json \(\d+ slides\)/);
});

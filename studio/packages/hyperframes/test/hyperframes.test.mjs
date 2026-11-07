import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ErroHF, agrupar, componentesDoSpec, escolherMotor, fontes, gerarProjeto, resumirCheck, temaDaMarca } from "../src/index.mjs";

const palavras = (txt, passo = 0.4) => txt.split(" ").map((t, i) => ({ t, a: +(i * passo + 0.2).toFixed(2), b: +(i * passo + 0.55).toFixed(2) }));
const FRASE = "cinco radiantes voltaram em oito segundos. depois fiz a conta. e o servidor soma tudo. ócio produtivo.";

function projeto(slug, spec, { blocos, pal = palavras(FRASE) } = {}) {
  const raiz = mkdtempSync(join(tmpdir(), "praeko-studio-hf-"));
  const ep = join(raiz, "episodios", slug), pub = join(raiz, "public");
  mkdirSync(ep, { recursive: true });
  for (const f of ["audio/v.mp3", "sfx/whoosh.wav", "sfx/pop.wav", "sfx/ding.wav", "capa/avatar.png", "jogo/clip.mp4", "gatos/gato-feliz.png"]) { mkdirSync(join(pub, f, ".."), { recursive: true }); writeFileSync(join(pub, f), "x"); }
  writeFileSync(join(raiz, "marca.json"), JSON.stringify({ handle: "@teste", avatar: "capa/avatar.png", assinatura: "Ócio produtivo." }));
  writeFileSync(join(ep, "episodio.spec.json"), JSON.stringify(spec));
  writeFileSync(join(ep, "palavras.json"), JSON.stringify(pal));
  if (blocos) writeFileSync(join(ep, "blocos.json"), JSON.stringify(blocos));
  return raiz;
}
const short = (extra = {}) => ({
  id: "T", durS: 12, voz: "audio/v.mp3", fundoLinhas: ["a", "b", "c"], fechamento: { a: 9, cta: "LINK NA BIO" },
  cenas: [
    { inicio: 0, rotulo: "UM", titulo: "UM", itens: [{ tipo: "texto", em: 0.2, texto: "Oi", tamanho: 70 }, { tipo: "janela", em: 0, src: "jogo/clip.mp4", duracaoClipe: 6, de: 1, pos: { left: 40, top: 330, w: 1000 } }] },
    { inicio: 4, rotulo: "DOIS", titulo: "DOIS", itens: [{ tipo: "caixa", quando: "a conta", texto: "conta" }, { tipo: "pilha", itens: [{ tipo: "big", quando: ["conta", 0], deslocar: 1, texto: "8 s", tamanho: 100 }] }] },
  ], ...extra,
});

test("Short: gera index, uma composição por cena, fundo, legenda, fecho e copia só os assets usados", () => {
  const raiz = projeto("t", short());
  const r = gerarProjeto({ raiz, slug: "t" });
  assert.equal(r.formato, "short"); assert.equal(r.cenas, 2); assert.equal(r.durS, 12);
  for (const f of ["index.html", "compositions/s1.html", "compositions/s2.html", "compositions/bg.html", "compositions/legenda.html", "compositions/fecho.html", "compositions/chrome.html", "hyperframes.json"]) assert.ok(existsSync(join(r.dir, f)), f);
  const idx = readFileSync(join(r.dir, "index.html"), "utf8");
  assert.match(idx, /data-width="1080" data-height="1920"/);
  assert.equal((idx.match(/data-composition-src="compositions\/s\d\.html"/g) ?? []).length, 2);
  assert.match(idx, /data-start="4" data-duration="4.9"/); // cena 2: de 4 s até a cena seguinte (fecho em 9) menos 0,1
  for (const a of ["audio/v.mp3", "jogo/clip.mp4", "sfx/pop.wav", "capa/avatar.png"]) assert.ok(existsSync(join(r.dir, "assets", a)), a);
  assert.ok(!existsSync(join(r.dir, "assets", "gatos/gato-feliz.png")), "asset não usado não é copiado");
});

test("Short: `quando` vira tempo local da cena (frase − início da cena + deslocar)", () => {
  const raiz = projeto("t", short());
  const r = gerarProjeto({ raiz, slug: "t" });
  const pal = palavras(FRASE), conta = pal[pal.findIndex((p, i) => p.t === "a" && pal[i + 1]?.t === "conta.")]; // "a conta."
  const s2 = readFileSync(join(r.dir, "compositions/s2.html"), "utf8");
  const local = +(conta.a - 4).toFixed(2);
  assert.ok(s2.includes(`},${local});`), `esperava entrada da caixa em ${local} s`);
  const big = pal.find((p) => p.t === "conta.");
  assert.ok(s2.includes(`${+(big.a - 4 + 1).toFixed(2)}`), "deslocar soma 1 s ao instante da frase");
});

test("Short: janela repete o trecho do clipe até o fim da cena (vários <video> encadeados)", () => {
  const raiz = projeto("t", short());
  const s1 = readFileSync(join(gerarProjeto({ raiz, slug: "t" }).dir, "compositions/s1.html"), "utf8");
  const videos = s1.match(/<video /g) ?? [];
  assert.equal(videos.length, 1); // cena de 3,9 s, clipe de 5 s: um só
  assert.match(s1, /data-media-start="1"/);
});

test("Short: `componente` falha com mensagem que lista slug e cena", () => {
  const spec = short(); spec.cenas[1] = { inicio: 4, rotulo: "X", titulo: "Painel TSX", componente: "MinhaCena" };
  const raiz = projeto("meu-ep", spec);
  assert.throws(() => gerarProjeto({ raiz, slug: "meu-ep" }), (e) => e instanceof ErroHF && /meu-ep/.test(e.message) && /Painel TSX/.test(e.message) && /MinhaCena/.test(e.message));
  assert.deepEqual(componentesDoSpec(spec).map((x) => x.componente), ["MinhaCena"]);
});

test("Short: frase que não existe na voz falha dizendo qual", () => {
  const spec = short(); spec.cenas[1].itens[0].quando = "frase que ninguem disse";
  const raiz = projeto("t", spec);
  assert.throws(() => gerarProjeto({ raiz, slug: "t" }), /frase que ninguem disse/);
});

test("Short: golpes viram `tl.set` quadro a quadro (função só do tempo) e geram o clarão", () => {
  const raiz = projeto("t", short({ golpes: [{ at: 1, tipo: "shake" }, { at: 5, tipo: "flash" }] }));
  const r = gerarProjeto({ raiz, slug: "t" });
  assert.match(readFileSync(join(r.dir, "compositions/bg.html"), "utf8"), /tl\.set\("#bgw",\{x:/);
  assert.ok(existsSync(join(r.dir, "compositions/fx.html")));
});

test("legenda: agrupar segue a regra do motor Remotion (até 3 palavras, quebra em pontuação e pausa)", () => {
  const g = agrupar(palavras("um dois três quatro cinco. seis"));
  assert.deepEqual(g.map((x) => x.palavras.map((p) => p.t).join(" ")), ["um dois três", "quatro cinco.", "seis"].map((x) => x));
});

test("longo: cenas, capítulos, transições pela borda dos blocos, mascote e fecho", () => {
  const spec = {
    id: "L", durS: 14, voz: "audio/v.mp3",
    cenas: [
      { titulo: "UM", inicio: 0, itens: [{ tipo: "contador", quando: "cinco radiantes", pos: { left: 100, top: 150, w: 800 }, ate: 8, sufixo: " s" }, { tipo: "video", quando: "oito segundos", src: "jogo/clip.mp4", duracaoClipe: 6, de: 1, pos: { left: 900, top: 150, w: 800 } }] },
      { titulo: "DOIS", inicio: 6.5, itens: [{ tipo: "codigo", quando: "depois fiz", titulo: "x.js", pos: { left: 100, top: 150, w: 900 }, linhas: [{ s: "const a = 1", hl: ["depois fiz", "e o servidor"] }] }] },
    ],
    fecho: { inicio: 12, texto: "Ócio produtivo", link: "exemplo.com", imagem: "gatos/gato-feliz.png" },
    mascote: [{ quando: "e o servidor", gato: "feliz" }],
  };
  const blocos = [{ n: 1, titulo: "UM", a: 0, b: 5.9 }, { n: 2, titulo: "DOIS", a: 6.5, b: 13 }];
  const raiz = projeto("l", spec, { blocos, pal: palavras(FRASE, 0.7) });
  const r = gerarProjeto({ raiz, slug: "l" });
  assert.equal(r.formato, "longo"); assert.equal(r.cenas, 2);
  const idx = readFileSync(join(r.dir, "index.html"), "utf8");
  assert.match(idx, /data-width="1920" data-height="1080"/);
  assert.match(idx, /id="fecho"/);
  const chrome = readFileSync(join(r.dir, "compositions/chrome.html"), "utf8");
  assert.match(chrome, /5\.65/); // transição começa 0,25 s antes do fim do bloco 1 (5,9)
  const s2 = readFileSync(join(r.dir, "compositions/s2.html"), "utf8");
  assert.match(s2, /gato-feliz\.png/); // mascote cai na cena em que a frase é falada
  assert.match(s2, /backgroundColor/); // linha de código acende e apaga (hl = [início, fim])
  assert.ok(existsSync(join(r.dir, "assets/gatos/gato-feliz.png")));
  const s1 = readFileSync(join(r.dir, "compositions/s1.html"), "utf8");
  assert.match(s1, /toFixed\(0\)/); // contador sem casas decimais
});

test("longo: `componente` na cena também é recusado", () => {
  const spec = { id: "L", durS: 8, voz: "audio/v.mp3", cenas: [{ titulo: "A", inicio: 0, componente: "S1" }] };
  const raiz = projeto("l", spec);
  assert.throws(() => gerarProjeto({ raiz, slug: "l" }), /S1/);
});

test("motor: --motor > yaml (spec) > marca > remotion", () => {
  assert.equal(escolherMotor({}), "remotion");
  assert.equal(escolherMotor({ marca: { motor: "hyperframes" } }), "hyperframes");
  assert.equal(escolherMotor({ spec: { motor: "remotion" }, marca: { motor: "hyperframes" } }), "remotion");
  assert.equal(escolherMotor({ flag: "hyperframes", spec: { motor: "remotion" } }), "hyperframes");
  assert.throws(() => escolherMotor({ flag: "after-effects" }), /não existe/);
});

test("fontes: Arial Black → Montserrat 900 e Menlo → JetBrains Mono; fontesLocais usa local() com reserva", () => {
  const T = temaDaMarca({});
  const f = fontes({}, T);
  assert.match(f.titulo, /Montserrat/); assert.match(f.mono, /JetBrains Mono/); assert.equal(f.peso, 900); assert.equal(f.faces, "");
  assert.ok(!/"/.test(f.titulo + f.mono), "aspas simples: a pilha vai dentro de style=\"…\"");
  const l = fontes({ hyperframes: { fontesLocais: true } }, T);
  assert.match(l.faces, /local\("Arial Black"\)/); assert.match(l.titulo, /Studio Montserrat/);
});

test("resumirCheck: separa erros de avisos e conta por código", () => {
  const r = resumirCheck({ lint: { findings: [{ severity: "error", code: "x", message: "ruim" }] }, craft: { findings: [{ severity: "warning", code: "a" }, { severity: "warning", code: "a" }, { severity: "info", code: "i" }] } });
  assert.equal(r.ok, false); assert.equal(r.erros.length, 1); assert.deepEqual(r.porCodigo, { a: 2 });
  assert.equal(resumirCheck({ lint: { findings: [] } }).ok, true);
});

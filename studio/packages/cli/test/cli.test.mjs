import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BARDO = new URL("../bin/praeko-studio.mjs", import.meta.url).pathname;
const bardo = (args, cwd) => spawnSync(process.execPath, [BARDO, ...args], { cwd, encoding: "utf8" });
const base = mkdtempSync(join(tmpdir(), "bardo-cli-"));
const proj = join(base, "canal");

test("init cria o projeto (sem instalar) com marca, Root com marcadores, sfx e instruções do agente", () => {
  const r = bardo(["init", proj, "--nome", "Canal X", "--handle", "@canalx", "--sem-instalar"], base);
  assert.equal(r.status, 0, r.stderr);
  for (const f of ["package.json", "marca.json", "remotion.config.ts", "src/index.ts", "src/Root.tsx", "CLAUDE.md", "AGENTS.md", ".claude/skills/praeko-studio/SKILL.md", "public/sfx/pop.wav", "public/capa/avatar.png"]) assert.ok(existsSync(join(proj, f)), f);
  assert.equal(JSON.parse(readFileSync(join(proj, "marca.json"), "utf8")).handle, "@canalx");
  const pj = JSON.parse(readFileSync(join(proj, "package.json"), "utf8"));
  assert.match(pj.dependencies["@praeko/studio-core"], /^\^\d+\.\d+\.\d+$/, "semver publicado, não file:");
  assert.match(pj.devDependencies["@praeko/studio"], /^\^\d/);
});
test("init recusa pasta que já tem arquivos", () => {
  assert.notEqual(bardo(["init", proj, "--sem-instalar"], base).status, 0);
});
test("novo cria o episódio e registra no Root; repetir falha", () => {
  const r = bardo(["novo", "meu-video", "--titulo", "Um título de teste"], proj);
  assert.equal(r.status, 0, r.stderr);
  for (const f of ["roteiro.txt", "publicacao.json", "episodio.json", "episodio.yaml", "episodio.spec.json", "cenas.tsx", "episodio.tsx", "palavras.ts"]) assert.ok(existsSync(join(proj, "episodios/meu-video", f)), f);
  const root = readFileSync(join(proj, "src/Root.tsx"), "utf8");
  assert.match(root, /import \{ MeuVideoComposition \} from "\.\.\/episodios\/meu-video\/episodio";/);
  assert.match(root, /<MeuVideoComposition \/>/);
  assert.equal(JSON.parse(readFileSync(join(proj, "episodios/meu-video/episodio.json"), "utf8")).id, "MeuVideo");
  assert.notEqual(bardo(["novo", "meu-video"], proj).status, 0);
  assert.notEqual(bardo(["novo", "Slug Ruim"], proj).status, 0);
});
test("checar roda no episódio novo e avisa o que falta", () => {
  const r = bardo(["checar", "meu-video"], proj);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /sem palavras\.json|ainda sem palavras/);
  assert.match(r.stdout, /publicacao\.json ainda sem/);
});
test("fora de um projeto, o erro é claro", () => {
  const r = bardo(["checar", "x"], base);
  assert.notEqual(r.status, 0); assert.match(r.stderr, /não achei um projeto do Praeko Studio/);
});
test("ajuda lista os comandos", () => {
  assert.match(bardo(["ajuda"], base).stdout, /novo <slug>/);
});

// ---- F4: episódio declarativo (YAML) ----
import { mkdirSync, writeFileSync } from "node:fs";
import { compilarEpisodio } from "../src/compilar.mjs";
const PAL = [["Fui", 1], ["conferir", 1.4], ["aqui", 2], ["o", 2.4], ["milissegundo", 2.6], ["acabou", 6]].map(([t, a]) => ({ t, a, b: a + 0.3 }));
function ep(yaml, palavras = PAL) {
  const d = join(mkdtempSync(join(tmpdir(), "bardo-yaml-")), "x");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "episodio.yaml"), yaml);
  writeFileSync(join(d, "palavras.json"), JSON.stringify(palavras));
  writeFileSync(join(d, "episodio.json"), JSON.stringify({ id: "X", capa: "CapaX" }));
  return d;
}
const CAB = "duracao: 12\nvoz: audio/x.mp3\nfechamento: { inicio: 9, cta: FIM }\n";
test("compilar: episódio válido gera o spec e resolve nomes em português (pos, cor)", () => {
  const d = ep(CAB + `cenas:\n  - inicio: 0\n    titulo: T\n    itens:\n      - { tipo: caixa, quando: Fui conferir, cor: ok, texto: oi, pos: { esquerda: 10, topo: 20, largura: 300 } }\n`);
  const r = compilarEpisodio(d);
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.spec.cenas[0].itens[0].pos, { left: 10, top: 20, w: 300 });
  assert.equal(JSON.parse(readFileSync(join(d, "episodio.spec.json"), "utf8")).id, "X");
});
test("compilar: frase que não está na voz é erro e não grava o spec", () => {
  const d = ep(CAB + `cenas:\n  - inicio: 0\n    itens:\n      - { tipo: caixa, quando: frase inexistente, texto: oi }\n`);
  const r = compilarEpisodio(d);
  assert.match(r.erros.join("\n"), /frase inexistente.*não aparece na voz/);
  assert.equal(existsSync(join(d, "episodio.spec.json")), false);
});
test("compilar: vírgula sem aspas dentro de { } vira erro explicado", () => {
  const d = ep(CAB + `cenas:\n  - inicio: 0\n    itens:\n      - { tipo: texto, texto: conta em golpes, não em poder }\n`);
  assert.match(compilarEpisodio(d).erros.join("\n"), /vírgula no texto separa os campos/);
});
test("compilar: tipo e cor desconhecidos, cenas fora de ordem e âncora fora da cena", () => {
  const d = ep(CAB + `cenas:\n  - inicio: 0\n    fim: 1.5\n    itens:\n      - { tipo: foguete, texto: a }\n      - { tipo: caixa, cor: rosa, texto: b }\n      - { tipo: caixa, quando: acabou, texto: c }\n  - inicio: 0\n    itens:\n      - { tipo: caixa, texto: d }\n`);
  const r = compilarEpisodio(d, { gravar: false }), t = r.erros.join("\n") + r.avisos.join("\n");
  assert.match(t, /tipo "foguete" desconhecido/);
  assert.match(t, /cor "rosa" não existe/);
  assert.match(t, /não vem depois da cena anterior/);
  assert.match(t, /"acabou" fala em 6\.00 s, fora da cena/);
});
test("compilar: avisa itens que estouram o painel e posições absolutas que se sobrepõem", () => {
  const muitos = Array.from({ length: 9 }, (_, i) => `      - { tipo: caixa, texto: item ${i}, tamanho: 50 }`).join("\n");
  const d = ep(CAB + `cenas:\n  - inicio: 0\n    itens:\n${muitos}\n  - inicio: 5\n    layout: livre\n    itens:\n      - { tipo: caixa, texto: a, pos: { esquerda: 0, topo: 0, largura: 300, altura: 200 } }\n      - { tipo: caixa, texto: b, pos: { esquerda: 100, topo: 100, largura: 300, altura: 200 } }\n`);
  const r = compilarEpisodio(d, { gravar: false });
  assert.deepEqual(r.erros, []);
  assert.match(r.avisos.join("\n"), /vai estourar ou se sobrepor/);
  assert.match(r.avisos.join("\n"), /se sobrepõem na tela/);
});
test("compilar: avisa se a duração corta a voz (o fechamento pode cobrir o fim da voz)", () => {
  const d = ep(CAB.replace("duracao: 12", "duracao: 6.8").replace("inicio: 9", "inicio: 5") + `cenas:\n  - inicio: 0\n    itens:\n      - { tipo: caixa, texto: a }\n`);
  const r = compilarEpisodio(d, { gravar: false });
  assert.deepEqual(r.erros, []);
  assert.match(r.avisos.join("\n"), /menos de 1 s depois do fim da voz \(6\.30 s\)/);
  assert.doesNotMatch(r.avisos.join("\n"), /depois do início do fechamento/);
});

// ---- L1: longo (YAML + blocos de voz) ----
test("novo --longo cria yaml de longo, episódio e spec compilado", () => {
  assert.equal(bardo(["novo", "meu-longo", "--titulo", "Meu longo", "--longo"], proj).status, 0);
  const pasta = join(proj, "episodios/meu-longo");
  assert.match(readFileSync(join(pasta, "episodio.yaml"), "utf8"), /formato: longo/);
  assert.match(readFileSync(join(pasta, "episodio.tsx"), "utf8"), /LongoDecl/);
  assert.ok(existsSync(join(pasta, "episodio.spec.json")));
});
test("compilar longo: bloco inexistente, frase fora da voz, chave desconhecida e sobreposição", () => {
  const d = ep(`formato: longo\nduracao: 20\nvoz: audio/x.mp3\ncenas:\n  - titulo: A\n    inicio: { bloco: 3 }\n    itens:\n      - { tipo: chip, quando: Fui conferir, pos: { esquerda: 0, topo: 0 }, texto: oi }\n  - titulo: B, com vírgula\n    inicio: 5\n    itens:\n      - { tipo: chip, quando: frase que nao existe, pos: { esquerda: 0, topo: 0 }, texto: a }\n      - { tipo: chip, quando: Fui conferir, pos: { esquerda: 10, topo: 5 }, texto: b }\n      - { tipo: foguete, quando: Fui conferir, texto: c }\n`);
  const r = compilarEpisodio(d, { gravar: false }), t = r.erros.join("\n") + "\n" + r.avisos.join("\n");
  assert.match(t, /bloco 3 não existe/);
  assert.match(t, /frase que nao existe.*não aparece na voz/);
  assert.match(t, /tipo "foguete" desconhecido/);
  assert.match(t, /se sobrepõem/);
});

// ---- L3: cortes derivados do longo ----
import { acharFrase, fatiar, resolverPonto } from "../src/corte.mjs";
const PL = [["Um", 0.2], ["dois", 0.6], ["três.", 1.0], ["Quatro", 2.0], ["cinco", 2.4], ["seis.", 2.8]].map(([t, a]) => ({ t, a, b: a + 0.3 }));
const BL = [{ n: 1, a: 0.2, b: 1.3 }, { n: 2, a: 2.0, b: 3.1 }];
test("corte: resolverPonto (segundos, bloco, frase) e fatiar re-ancora com respiro", () => {
  assert.equal(resolverPonto(3, "de", { palavras: PL, blocos: BL }), 3);
  assert.equal(resolverPonto("bloco:2", "de", { palavras: PL, blocos: BL }), 2.0);
  assert.equal(resolverPonto("bloco:2", "ate", { palavras: PL, blocos: BL }), 3.1);
  assert.equal(resolverPonto("quatro cinco", "de", { palavras: PL, blocos: BL }), 2.0);
  assert.equal(resolverPonto("quatro cinco", "ate", { palavras: PL, blocos: BL }), 2.7);
  assert.throws(() => resolverPonto("bloco:9", "de", { palavras: PL, blocos: BL }), /bloco 9 não existe/);
  assert.throws(() => resolverPonto("não existe", "de", { palavras: PL, blocos: BL }), /não aparece/);
  assert.equal(acharFrase(PL, "três"), 2);
  const f = fatiar(PL, 2.0, 3.1);
  assert.deepEqual(f.palavras.map((p) => p.t), ["Quatro", "cinco", "seis."]);
  assert.equal(f.palavras[0].a, 0.2); // 0,2 s de respiro antes da 1ª palavra
  assert.equal(f.duracao, 1.1 + 0.2 + 0.3);
});
test("bardo corte: fatia a voz do longo, cria o Short, registra e protege `voz`; --refazer refatia", () => {
  assert.equal(bardo(["voz", "meu-longo", "--qualidade", "rascunho"], proj).status, 0);
  const r = bardo(["corte", "meu-longo", "meu-corte", "--de", "bloco:2", "--ate", "bloco:2", "--titulo", "Meu corte"], proj);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const pasta = join(proj, "episodios/meu-corte");
  for (const f of ["voz.mp3", "palavras.json", "corte.json", "roteiro.txt", "episodio.yaml", "episodio.spec.json"]) assert.ok(existsSync(join(pasta, f)), f);
  const pal = JSON.parse(readFileSync(join(pasta, "palavras.json"), "utf8"));
  assert.ok(pal[0].a >= 0.2 && pal[0].a < 0.8, "começa com respiro antes da 1ª palavra");
  assert.match(readFileSync(join(pasta, "episodio.yaml"), "utf8"), /VÍDEO COMPLETO NO YOUTUBE/);
  assert.equal(JSON.parse(readFileSync(join(pasta, "publicacao.json"), "utf8")).videoCompleto, "[LINK_DO_LONGO]");
  assert.ok(existsSync(join(pasta, "voz.estimada")), "voz estimada é herdada");
  assert.match(readFileSync(join(proj, "src/Root.tsx"), "utf8"), /MeuCorteComposition/);
  const v = bardo(["voz", "meu-corte"], proj);
  assert.notEqual(v.status, 0); assert.match(v.stderr, /corte derivado de um longo/);
  assert.equal(bardo(["corte", "meu-corte", "--refazer"], proj).status, 0);
  assert.notEqual(bardo(["corte", "meu-longo", "outro", "--de", "bloco:9", "--ate", "bloco:9"], proj).status, 0);
});

// ---- cortes: abertura própria, soltar, tempos por frase ----
test("compilar: inicio e fechamento por frase e { voz: N } acompanham a voz", () => {
  const d = ep(`duracao: { voz: 2.5 }\nvoz: audio/x.mp3\nfechamento: { inicio: { voz: -2 }, cta: FIM }\ngolpes: [{ em: "conferir", tipo: flash }]\ncenas:\n  - inicio: 0\n    itens:\n      - { tipo: caixa, texto: a }\n  - inicio: { quando: aqui, mais: -0.1 }\n    itens:\n      - { tipo: caixa, texto: b }\n`);
  const r = compilarEpisodio(d);
  assert.deepEqual(r.erros, []);
  assert.equal(r.spec.cenas[1].inicio, 1.9);        // "aqui" fala em 2,0 − 0,1
  assert.equal(r.spec.durS, 6.3 + 2.5);             // fim da voz + 2,5
  assert.equal(r.spec.fechamento.a, 4.3);           // fim da voz − 2
  assert.equal(r.spec.golpes[0].at, 1.4);
  const ruim = compilarEpisodio(ep(`duracao: 12\nvoz: x\nfechamento: { inicio: 9, cta: FIM }\ncenas:\n  - inicio: { quando: frase que nao existe }\n    itens:\n      - { tipo: caixa, texto: a }\n`), { gravar: false });
  assert.match(ruim.erros.join("\n"), /frase que nao existe.*não aparece na voz/);
});
test("corte --abertura: voz própria antes do trecho (cache, refazer mantém), --sem-abertura e --soltar liberam o `voz`", () => {
  const r = bardo(["corte", "meu-longo", "corte-gancho", "--de", "bloco:2", "--ate", "bloco:2", "--abertura", "Você já clicou duas vezes?"], proj);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const pasta = join(proj, "episodios/corte-gancho");
  const pal = JSON.parse(readFileSync(join(pasta, "palavras.json"), "utf8"));
  assert.deepEqual(pal.slice(0, 4).map((p) => p.t), ["Você", "já", "clicou", "duas"]);
  const ab = pal.findIndex((p) => p.t === "clicou?" || p.t === "vezes?");
  assert.ok(ab > 0 && pal[ab + 1].a > pal[ab].b, "o trecho do longo vem depois da abertura");
  assert.match(readFileSync(join(pasta, "roteiro.txt"), "utf8"), /^Você já clicou duas vezes\?\n/);
  assert.equal(JSON.parse(readFileSync(join(pasta, "corte.json"), "utf8")).abertura.texto, "Você já clicou duas vezes?");
  assert.match(bardo(["corte", "corte-gancho", "--refazer"], proj).stdout, /abertura: reaproveitada do cache/);
  assert.equal(bardo(["corte", "corte-gancho", "--refazer", "--sem-abertura"], proj).status, 0);
  assert.ok(!("abertura" in JSON.parse(readFileSync(join(pasta, "corte.json"), "utf8"))));
  assert.notEqual(bardo(["voz", "corte-gancho", "--qualidade", "rascunho"], proj).status, 0);
  assert.equal(bardo(["corte", "corte-gancho", "--soltar"], proj).status, 0);
  assert.ok(!existsSync(join(pasta, "corte.json")));
  assert.equal(bardo(["voz", "corte-gancho", "--qualidade", "rascunho"], proj).status, 0); // agora é um Short comum
});

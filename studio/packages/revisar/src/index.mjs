// @praeko/studio-revisar: conferências baratas antes do render caro: roteiro, voz, vídeo (duração, volume, quadros vazios) e mosaico de quadros.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { PADRAO, validar } from "@praeko/studio-publicar";

const ff = (args, opts = {}) => spawnSync("ffmpeg", ["-hide_banner", ...args], { encoding: "utf8", maxBuffer: 1 << 28, ...opts });
export function duracao(arq) {
  return +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", arq]).toString().trim();
}
export function infoVideo(arq) {
  const [w, h, fps] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "csv=p=0", arq]).toString().trim().split(",");
  const [n, d] = fps.split("/").map(Number);
  return { largura: +w, altura: +h, fps: n / (d || 1), duracao: duracao(arq) };
}

/** Mosaico de quadros igualmente espaçados: `folha({ video, saida, n = 12, colunas = 6, largura = 270 })`. */
export function folha({ video, saida, n = 12, colunas = 6, largura = 270 }) {
  const d = duracao(video), linhas = Math.ceil(n / colunas);
  mkdirSync(dirname(saida), { recursive: true });
  const r = ff(["-v", "error", "-y", "-i", video, "-vf", `fps=${n}/${d.toFixed(3)},scale=${largura}:-1,tile=${colunas}x${linhas}`, "-frames:v", "1", saida]);
  if (r.status !== 0) throw new Error("folha: " + r.stderr.slice(0, 200));
  return { saida, n, duracao: d };
}

/** Volume integrado (LUFS) e pico verdadeiro (dBTP). */
export function volume(arq) {
  const r = ff(["-nostats", "-i", arq, "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const t = r.stderr;
  const I = t.match(/\n\s*I:\s+(-?[\d.]+) LUFS/g), P = t.match(/\n\s*Peak:\s+(-?[\d.]+) dBFS/g);
  return { lufs: I ? +I[I.length - 1].match(/-?[\d.]+(?= LUFS)/)[0] : null, pico: P ? +P[P.length - 1].match(/-?[\d.]+(?= dBFS)/)[0] : null };
}

/**
 * Quadros "vazios": 1 quadro por segundo, ignora a faixa da legenda (18% de baixo) e o rótulo do capítulo (canto superior esquerdo);
 * vazio = menos de 1,2% dos pixels claros. Devolve `{ total, vazios, trechos: [[ini, fim]] }` (trechos de 3 s ou mais).
 */
export function vazio(video, { limiar = 0.012, minimo = 3 } = {}) {
  const { largura, altura } = infoVideo(video), w = 108, h = Math.round((altura * w) / largura);
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", video, "-vf", `fps=1,scale=${w}:${h},format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 1 << 28 });
  const buf = r.stdout, nq = Math.floor(buf.length / (w * h)), fracs = [];
  for (let q = 0; q < nq; q++) {
    let claro = 0, tot = 0;
    for (let y = 0; y < Math.floor(h * 0.82); y++) for (let x = 0; x < w; x++) {
      if (y < h * 0.12 && x < w * 0.4) continue;
      tot++; if (buf[q * w * h + y * w + x] > 50) claro++;
    }
    fracs.push(claro / tot);
  }
  const v = fracs.map((f) => f < limiar), trechos = [];
  let ini = null;
  [...v, false].forEach((x, i) => { if (x && ini === null) ini = i; if (!x && ini !== null) { if (i - ini >= minimo) trechos.push([ini, i]); ini = null; } });
  return { total: nq, vazios: v.filter(Boolean).length, trechos };
}

const TAGS_OK = new Set(["curious", "thoughtful", "confident", "sarcastic", "excited", "short pause"]);
/** Confere o roteiro (texto falado). Devolve `[{ nivel: "erro"|"aviso"|"ok", msg }]`. */
export function checarRoteiro(texto, marca = {}) {
  const r = [];
  texto = texto.replace(/^##[^\n]*$/gm, ""); // cabeçalhos de bloco (longos) não são texto falado
  const tags = [...texto.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].toLowerCase());
  const estranhas = [...new Set(tags.filter((t) => !TAGS_OK.has(t)))];
  if (estranhas.length) r.push({ nivel: "aviso", msg: `tags fora da lista usada até agora: ${estranhas.map((t) => `[${t}]`).join(", ")}` });
  const limpo = texto.replace(/\[[^\]]*\]/g, " ");
  const digitos = limpo.match(/\d[\d.,]*/g);
  if (digitos) r.push({ nivel: "aviso", msg: `números em dígitos no texto falado (escreva por extenso): ${[...new Set(digitos)].slice(0, 6).join(", ")}` });
  if (marca.publicacao?.tiquesDeIA !== false) for (const m of PADRAO.marcasDeIA) if (m.re.test(texto)) r.push({ nivel: "aviso", msg: `tique de texto de IA: ${m.aviso}` });
  if (/https?:\/\/|\.com\b|\.br\b/i.test(limpo)) r.push({ nivel: "aviso", msg: "endereço no texto falado: escreva como se fala (ex.: “meu site ponto com ponto br”) ou use `pronuncia` da marca" });
  const palavras = limpo.split(/\s+/).filter(Boolean).length;
  r.push({ nivel: "ok", msg: `${palavras} palavras, ~${Math.round((palavras / 190) * 60)} s de fala (190 palavras/min)` });
  for (const nome of marca.nomesProibidos || []) if (new RegExp(`\\b${nome}\\b`, "i").test(limpo)) r.push({ nivel: "erro", msg: `nome proibido no roteiro: ${nome}` });
  return r;
}

/**
 * Confere um episódio: roteiro, voz/palavras, publicação e (se `video` existir) duração, volume e quadros vazios.
 * `pasta`: episodios/<slug>; `video`: caminho do mp4 (opcional).
 */
export function checarEpisodio({ pasta, marca, video }) {
  const r = [], add = (nivel, msg) => r.push({ nivel, msg });
  const arq = (n) => join(pasta, n);
  if (existsSync(arq("roteiro.txt"))) r.push(...checarRoteiro(readFileSync(arq("roteiro.txt"), "utf8"), marca)); else add("erro", "falta roteiro.txt");
  let fimFala = null;
  if (existsSync(arq("palavras.json"))) {
    const p = JSON.parse(readFileSync(arq("palavras.json"), "utf8"));
    fimFala = p[p.length - 1]?.b ?? null;
    const buracos = p.slice(1).filter((x, i) => x.a - p[i].b > 2.5).length;
    add(buracos ? "aviso" : "ok", buracos ? `${buracos} pausa(s) de mais de 2,5 s entre palavras` : `${p.length} palavras com tempo`);
    if (existsSync(arq("voz.mp3"))) { const d = duracao(arq("voz.mp3")); add(Math.abs(d - fimFala) > 2 ? "aviso" : "ok", `voz.mp3 ${d.toFixed(1)} s; última palavra em ${fimFala.toFixed(1)} s`); }
  } else add("aviso", "ainda sem palavras.json (rode `praeko studio voz`)");
  if (existsSync(arq("publicacao.json"))) {
    const ep = JSON.parse(readFileSync(arq("publicacao.json"), "utf8")), v = validar({ marca, ep });
    v.erros.forEach((e) => add("erro", "publicação: " + e)); v.avisos.forEach((e) => add("aviso", "publicação: " + e));
    const vazios = [!ep.yt?.descricao && "descrição do YouTube", !ep.ig?.legenda && "legenda do Instagram", !ep.tiktok?.legenda && "legenda do TikTok", !(ep.hashtags?.youtube || []).length && "hashtags"].filter(Boolean);
    if (vazios.length) add("aviso", `publicacao.json ainda sem: ${vazios.join(", ")}`);
    else if (!v.erros.length && !v.avisos.length) add("ok", "publicação sem erros nem avisos");
  } else add("aviso", "sem publicacao.json");
  if (video && existsSync(video)) {
    const i = infoVideo(video);
    add(i.largura === 1080 && i.altura === 1920 ? "ok" : "aviso", `vídeo ${i.largura}x${i.altura} a ${i.fps} fps, ${i.duracao.toFixed(1)} s`);
    if (fimFala && i.duracao < fimFala + 1) add("erro", `vídeo (${i.duracao.toFixed(1)} s) termina antes do fim da fala (${fimFala.toFixed(1)} s)`);
    const vol = volume(video);
    if (vol.lufs !== null) add(vol.lufs < -19 || vol.lufs > -11 ? "aviso" : "ok", `volume ${vol.lufs} LUFS (alvo ≈ −15), pico ${vol.pico} dBFS`);
    const vz = vazio(video);
    add(vz.trechos.length ? "aviso" : "ok", vz.trechos.length ? `quadros quase vazios por ${vz.trechos.map(([a, b]) => `${a}-${b}s`).join(", ")} (${vz.vazios}/${vz.total} s)` : `sem trechos vazios (${vz.vazios}/${vz.total} s quase vazios)`);
  } else add("ok", "vídeo ainda não renderizado (conferência de volume e quadros vazios fica para depois do render)");
  return r;
}

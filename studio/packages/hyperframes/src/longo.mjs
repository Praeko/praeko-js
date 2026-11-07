// Gerador do longo (1920×1080, tempo global por frase). Cada cena do spec vira uma sub-composição `compositions/sN.html`.
// Edição própria do motor: barra de capítulos, transições entre capítulos (4 tipos), número fantasma, legenda palavra a palavra,
// mascote opcional (`mascote:` no yaml) e tela final.
import { ErroHF, ARQUIVOS_HF, cor, esc, f2, resolvedor } from "./comum.mjs";

const ACENTOS = ["destaque", "info", "erro", "ok", "extra"];
const TIPOS_SEAM = ["h", "d", "v", "i"];

function cssCena(T, F) {
  return `${F.faces}
#root{position:absolute;inset:0;font-family:${F.titulo};font-weight:700;color:${T.texto}}
.stage{position:absolute;inset:0}
.it{position:absolute;opacity:0}
.ghost{position:absolute;right:60px;bottom:40px;font:900 420px/1 ${F.titulo};color:${T.texto};opacity:0;z-index:0}
.txt{font-weight:800;line-height:1.15}
.txt .w{display:inline-block;opacity:0}
.cnt{font-weight:900;line-height:1;white-space:nowrap}
.chip{display:inline-block;white-space:nowrap;border:2px solid;border-radius:999px;padding:.28em .8em;font-weight:800}
.bar .lab{color:${T.suave};font-weight:700;margin-bottom:8px}
.bar .track{position:relative;background:rgba(243,236,224,.09);border-radius:12px;overflow:hidden}
.bar .fill{position:absolute;inset:0;transform-origin:left center;transform:scaleX(0);border-radius:12px}
.bar .val{position:absolute;right:18px;top:0;bottom:0;display:flex;align-items:center;font-weight:900;color:${T.fundo};opacity:0}
.vid{border-radius:22px;overflow:hidden}
.vframe{width:100%;height:100%;background:#0c0a08;border:2px solid rgba(243,236,224,.18);border-radius:22px;box-shadow:0 24px 60px rgba(0,0,0,.55)}
.vframe video{display:block;border-radius:14px;object-fit:cover}
.cel .vframe{border-radius:42px;border-width:3px}
.cel .vframe video{border-radius:32px}
.vtag{position:absolute;left:18px;bottom:16px;background:rgba(20,17,15,.88);border:1px solid ${T.destaque}99;color:${T.destaque};font:800 28px ${F.titulo};padding:6px 14px;border-radius:10px;opacity:0}
.code{background:${T.codigo};border:2px solid rgba(243,236,224,.14);border-radius:18px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.5)}
.code .bar3{display:flex;align-items:center;gap:8px;padding:12px 18px;background:#241d16;font:700 28px ${F.mono};color:${T.suave}}
.code .bar3 b{width:13px;height:13px;border-radius:50%;background:#4a3f33;display:inline-block}
.code .bar3 span{margin-left:12px}
.code .body{padding:14px 0 18px;font-family:${F.mono};font-weight:600}
.code .ln{position:relative;padding:3px 24px 3px 30px;white-space:pre;line-height:1.5;opacity:0}
.code .mk{position:absolute;left:0;top:0;bottom:0;width:6px;background:${T.destaque};opacity:0}
.code .red .mk{background:${T.erro}}
.code i{font-style:normal}
.card{background:${T.caixaLongo ?? T.caixa};border-radius:18px;padding:26px 32px;display:flex;flex-direction:column;gap:14px;justify-content:center;box-shadow:0 20px 50px rgba(0,0,0,.45)}
.card .cl{line-height:1.2;opacity:0}
.flow{display:flex;align-items:center;justify-content:space-between;gap:16px}
.flow .node{flex:1;text-align:center;border:3px solid;border-radius:18px;padding:22px 14px;background:${T.caixaLongo ?? T.caixa}e6;font-weight:800;line-height:1.25;opacity:0}
.flow .arr{font-size:54px;color:${T.suave};opacity:0}
.gato{position:absolute;right:70px;bottom:20px;width:150px;height:150px;opacity:0;z-index:5}`;
}

// mesma regra de cores do `colorize` do kit (SQL/JS): comentário, string, palavra-chave, número e função
const KW = /^(UPDATE|SET|WHERE|AND|INSERT|INTO|SELECT|FROM|CASE|WHEN|THEN|END|AS|VALUES|IS|NOT|NULL|const|await|if)$/;
const FN = /^(changes|abs|json_set|json_remove|json_extract)$/;
function colorize(s, T) {
  return s.split(/(--.*$|\/\/.*$|'[^']*'|\b\w+\b)/).map((p) => {
    if (!p) return "";
    let c = null;
    if (/^(--|\/\/)/.test(p)) c = T.suave; else if (/^'/.test(p)) c = T.ok; else if (KW.test(p)) c = T.destaque; else if (/^\d+$/.test(p)) c = "#7fb4ff"; else if (FN.test(p)) c = T.info;
    return c ? `<i style="color:${c}">${esc(p)}</i>` : esc(p);
  }).join("");
}

const ENTR = [
  (id, t) => `tl.fromTo("${id}",{opacity:0,y:22,filter:"blur(10px)"},{opacity:1,y:0,filter:"blur(0px)",duration:.5,ease:"expo.out"},${t});`,
  (id, t) => `tl.fromTo("${id}",{opacity:0,x:-70,filter:"blur(10px)"},{opacity:1,x:0,filter:"blur(0px)",duration:.45,ease:"power4.out"},${t});`,
  (id, t) => `tl.fromTo("${id}",{opacity:0,scale:.94,filter:"blur(8px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:.5,ease:"back.out(1.4)"},${t});`,
];
const pos = (p = {}) => `left:${p.left}px;top:${p.top}px;${p.w ? `width:${p.w}px;` : ""}${p.h ? `min-height:${p.h}px;` : ""}`;

function itemLongo(it, k, t0, fimCena, c) {
  const { T, Tm, entr } = c;
  const id = `s${k}i${c.uid++}`;
  const t = f2(Tm(it.quando, t0) - t0);
  const p = it.pos ?? {};
  const snap = k === 1 && t < 0.4 && (it.tipo === "txt" || it.tipo === "contador");
  const partes = (x) => (x.partes ? x.partes.map((q) => `<span style="${q.cor ? `color:${cor(T, q.cor)};` : ""}${q.mono ? `font-family:${c.F.mono};` : ""}">${esc(q.texto)}</span>`).join("") : esc(x.texto ?? ""));
  switch (it.tipo) {
    case "txt": {
      const palavrasTxt = it.partes ? null : String(it.texto).split(" ").map((w, i) => `<span class="w" id="${id}w${i}">${esc(w)}</span>`).join(" ");
      const al = it.alinhar === "centro" ? "text-align:center;" : "";
      const html = `<div class="it txt" id="${id}" style="${pos(p)}font-size:${it.tamanho ?? 48}px;color:${cor(T, it.cor) ?? T.texto};${al}${it.mono ? `font-family:${c.F.mono};` : ""}">${palavrasTxt ?? partes(it)}</div>`;
      const js = !palavrasTxt ? entr("#" + id, t)
        : snap ? `tl.set("#${id}",{opacity:1},0);tl.set("#${id} .w",{opacity:1},0);`
          : `tl.set("#${id}",{opacity:1},${t});tl.fromTo("#${id} .w",{opacity:0,filter:"blur(7px)"},{opacity:1,filter:"blur(0px)",duration:.14,stagger:.075,ease:"power2.out"},${t});`;
      return { html, js };
    }
    case "contador": {
      const d = it.duracao ?? 1.6, casas = it.casas ?? 0, a = it.de ?? 0;
      const html = `<div class="it cnt" id="${id}" style="${pos(p)}font-size:${it.tamanho ?? 96}px;color:${cor(T, it.cor) ?? T.destaque};${it.alinhar === "centro" ? "text-align:center;" : ""}${it.mono ? `font-family:${c.F.mono};` : ""}">${esc(it.prefixo ?? "")}<span id="${id}n">${a}</span>${esc(it.sufixo ?? "")}</div>`;
      const js = `${snap ? `tl.set("#${id}",{opacity:1},0);` : entr("#" + id, t)}{const o={v:${a}};const fm=v=>v.toFixed(${casas}).replace(".",",").replace(/\\B(?=(\\d{3})+(?!\\d))/g,".");tl.to(o,{v:${it.ate ?? 0},duration:${d},ease:"power2.out",onUpdate:()=>{document.getElementById("${id}n").textContent=fm(o.v)}},${snap ? 0.1 : t});tl.to("#${id}",{scale:1.06,duration:.12,yoyo:true,repeat:1,ease:"power2.out"},${f2(t + d)});}`;
      return { html, js };
    }
    case "chip": {
      const cc = cor(T, it.cor) ?? T.suave;
      return { html: `<div class="it chip" id="${id}" style="${pos(p)}font-size:${it.tamanho ?? 34}px;color:${cc};border-color:${cc};background:${cc}22">${esc(it.texto)}</div>`, js: entr("#" + id, t) };
    }
    case "barra": {
      const h = it.altura ?? 46, cc = cor(T, it.cor) ?? T.destaque, v = it.valor ?? 1, d = it.duracao ?? 1.4;
      const html = `<div class="it bar" id="${id}" style="${pos(p)}">${it.rotulo ? `<div class="lab" style="font-size:${Math.max(28, it.tamanho ?? 30)}px">${esc(it.rotulo)}</div>` : ""}<div class="track" style="height:${h}px"><div class="fill" id="${id}f" style="background:${cc}"></div>${it.texto ? `<span class="val" style="font-size:${Math.max(28, Math.round(h * 0.56))}px;${v < 0.5 ? `left:calc(${v * 100}% + 18px);right:auto;color:${cc}` : ""}">${esc(it.texto)}</span>` : ""}</div></div>`;
      const js = `tl.fromTo("#${id}",{opacity:0,y:14},{opacity:1,y:0,duration:.35,ease:"power3.out"},${t});tl.fromTo("#${id}f",{scaleX:0},{scaleX:${v},duration:${d},ease:"power3.out"},${f2(t + 0.15)});${it.texto ? `tl.fromTo("#${id} .val",{opacity:0},{opacity:1,duration:.25},${f2(t + 0.15 + d * 0.6)});` : ""}`;
      return { html, js };
    }
    case "video": case "celular": {
      const cel = it.tipo === "celular", reg = it.reg ?? [0, 0, 1920, 1080];
      const w = p.w, pad = cel ? 10 : 6, iw = w - pad * 2, s = iw / reg[2];
      const h = cel ? Math.round((w * 1920) / 1080) : Math.round(reg[3] * s) + pad * 2, ih = h - pad * 2;
      const seg = Math.max(0.5, (it.duracaoClipe ?? 10) - (it.de ?? 0));
      const play = Math.max(1, Math.min(seg, fimCena - 0.4 - (t0 + t)));
      const vstyle = cel ? `width:${iw}px;height:${ih}px;` : `position:relative;left:${-reg[0] * s}px;top:${-reg[1] * s}px;width:${1920 * s}px;height:${1080 * s}px;`;
      const html = `<div class="it vid ${cel ? "cel" : ""}" id="${id}" style="left:${p.left}px;top:${p.top}px;width:${w}px;height:${h}px;"><div class="vframe" style="padding:${pad}px;box-sizing:border-box;${cel ? "" : "overflow:hidden;"}"><video class="clip" id="${id}v" src="assets/${it.src}" muted playsinline data-start="${t}" data-duration="${f2(play)}" data-media-start="${it.de ?? 0}" data-track-index="2" style="${vstyle}"></video></div>${cel || it.tag === "" ? "" : `<div class="vtag" id="${id}g">${esc(it.tag ?? "jogo")}</div>`}</div>`;
      const js = `tl.fromTo("#${id}",{opacity:0,clipPath:"inset(0 100% 0 0 round 22px)",filter:"blur(8px)"},{opacity:1,clipPath:"inset(0 0% 0 0 round 22px)",filter:"blur(0px)",duration:.6,ease:"power3.out"},${t});` +
        (!cel && it.tag !== "" ? `tl.fromTo("#${id}g",{opacity:0,y:10},{opacity:1,y:0,duration:.3,ease:"power2.out"},${f2(t + 0.5)});` : "") +
        `tl.to("#${id}",{opacity:0,filter:"blur(8px)",duration:.3,ease:"power2.in"},${f2(t + play - 0.1)});`;
      return { html, js, assets: [it.src] };
    }
    case "codigo": {
      const linhas = it.linhas.map((l) => ({ s: l.s, hl: Array.isArray(l.hl) ? [Tm(l.hl[0]), Tm(l.hl[1])] : null, red: l.vermelho }));
      const rows = linhas.map((l, i) => `<div class="ln${l.red ? " red" : ""}" id="${id}l${i}"><span class="mk"></span>${colorize(l.s, T) || "&nbsp;"}</div>`).join("");
      const html = `<div class="it code" id="${id}" style="${pos(p)}font-size:${it.tamanho ?? 32}px"><div class="bar3"><b></b><b></b><b></b><span>${esc(it.titulo ?? "")}</span></div><div class="body">${rows}</div></div>`;
      const js = `${entr("#" + id, t)}` + linhas.map((l, i) => {
        if (!l.hl) return "";
        const on = f2(l.hl[0] - t0), off = f2(l.hl[1] - t0), bg = l.red ? "rgba(255,107,94,.22)" : "rgba(244,185,66,.20)";
        return `tl.to("#${id}l${i}",{backgroundColor:"${bg}",duration:.3},${on});tl.to("#${id}l${i} .mk",{opacity:1,duration:.2},${on});tl.to("#${id}l${i}",{backgroundColor:"rgba(0,0,0,0)",duration:.3},${off});tl.to("#${id}l${i} .mk",{opacity:0,duration:.2},${off});`;
      }).join("") + `tl.fromTo("#${id} .ln",{opacity:0,x:-14},{opacity:1,x:0,duration:.25,stagger:.09,ease:"power2.out"},${f2(t + 0.2)});`;
      return { html, js };
    }
    case "cartao": {
      const cc = cor(T, it.cor) ?? T.destaque;
      const rows = it.itens.map((x, i) => {
        const tx = x.quando !== undefined ? f2(Tm(x.quando) - t0) : t;
        return { tx, h: `<div class="cl" id="${id}c${i}" style="font-size:${x.tamanho ?? 36}px;color:${cor(T, x.cor) ?? T.texto};letter-spacing:${x.espacar ?? 0}px;font-weight:${x.espacar ? 800 : 700}">${partes(x)}</div>` };
      });
      const html = `<div class="it card" id="${id}" style="${pos(p)}border-left:10px solid ${cc}">${rows.map((r) => r.h).join("")}</div>`;
      const js = `tl.fromTo("#${id}",{opacity:0,y:26,filter:"blur(8px)"},{opacity:1,y:0,filter:"blur(0px)",duration:.5,ease:"expo.out"},${t});` +
        rows.map((r, i) => `tl.fromTo("#${id}c${i}",{opacity:0,x:-22,filter:"blur(6px)"},{opacity:1,x:0,filter:"blur(0px)",duration:.4,ease:"power3.out"},${f2(Math.max(r.tx, t + 0.1))});`).join("");
      return { html, js };
    }
    case "fluxo": {
      const nos = it.nos ?? [], n = nos.length;
      const nodes = nos.map((x, i) => `<div class="node" id="${id}n${i}" style="font-size:${it.tamanho ?? 34}px;border-color:${cor(T, x.cor) ?? cor(T, it.cor) ?? T.destaque};color:${cor(T, x.cor) ?? cor(T, it.cor) ?? T.destaque}">${esc(x.texto).replace(/\n/g, "<br>")}</div>${i < n - 1 ? `<div class="arr" id="${id}a${i}">→</div>` : ""}`).join("");
      const js = `tl.set("#${id}",{opacity:1},${t});` + nos.map((x, i) => {
        const tx = f2(Tm(x.quando) - t0);
        return `tl.fromTo("#${id}n${i}",{opacity:0,scale:.9,filter:"blur(6px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:.4,ease:"back.out(1.5)"},${tx});` + (i > 0 ? `tl.fromTo("#${id}a${i - 1}",{opacity:0,x:-16},{opacity:1,x:0,duration:.3,ease:"power2.out"},${f2(tx - 0.2)});` : "");
      }).join("");
      return { html: `<div class="it flow" id="${id}" style="${pos(p)}">${nodes}</div>`, js };
    }
    default: throw new ErroHF(`tipo de item "${it.tipo}" não existe no longo (use codigo, cartao, texto, chip, txt, video, celular, barra, contador, fluxo)`);
  }
}

/** Mascote opcional: `mascote: [{ quando, gato, mais }]` no yaml (arquivo gatos/gato-<nome>.png no publicDir). */
function mascotes(spec, Tm, inicios, fins) {
  return (spec.mascote ?? []).map((m) => {
    const t = f2(Tm(m.quando) + (m.mais ?? 0));
    const k = inicios.findIndex((a, i) => t >= a && t < fins[i]);
    return k < 0 ? null : { k, gato: m.gato, local: f2(t - inicios[k]), arq: `gatos/gato-${m.gato}.png` };
  }).filter(Boolean);
}

export function gerarLongo({ spec, palavras, blocos = [], marca = {}, T, F, slug }) {
  const Tm = resolvedor(palavras);
  const acc = spec.cenas.map((_, k) => cor(T, ACENTOS[k % ACENTOS.length]));
  const fimVoz = palavras.at(-1)?.b ?? 0;
  const TOTAL = spec.durS;
  const FECHO = spec.fecho ? Math.min(TOTAL - 1, f2(Math.max(spec.fecho.inicio ?? 0, fimVoz + 0.25))) : null;
  const FIM_CENAS = FECHO ?? TOTAL;
  const inicios = spec.cenas.map((c) => c.inicio);
  const fins = inicios.map((s, i) => (i + 1 < inicios.length ? inicios[i + 1] : FIM_CENAS));
  const arquivos = {}, assets = [spec.voz];
  const css = cssCena(T, F);
  const gatos = mascotes(spec, Tm, inicios, fins);
  gatos.forEach((g) => assets.push(g.arq));
  if (spec.fecho?.imagem) assets.push(spec.fecho.imagem);

  spec.cenas.forEach((cena, k) => {
    const a = inicios[k], dur = f2(fins[k] - a);
    const c = { T, F, Tm, uid: 0, ei: k, entr: (id, t) => ENTR[c.ei++ % ENTR.length](id, t) };
    const its = (cena.itens ?? []).map((x) => itemLongo(x, k + 1, a, fins[k], c));
    its.forEach((x) => (x.assets ?? []).forEach((s) => assets.push(s)));
    const g = gatos.find((x) => x.k === k);
    const html = `<template>
<style>${css}</style>
<div id="root" data-composition-id="s${k + 1}" data-width="1920" data-height="1080">
  <div class="ghost" data-layout-ignore id="s${k + 1}gh">${esc(String(cena.n ?? k + 1).padStart(2, "0"))}</div>
  <div class="stage" id="s${k + 1}st">
${its.map((x) => x.html).join("\n")}
  </div>
  ${g ? `<img class="gato" id="s${k + 1}gato" src="assets/${g.arq}" alt="">` : ""}
</div>
<script>
const tl = gsap.timeline({ paused: true });
tl.fromTo("#s${k + 1}gh",{opacity:0,x:60},{opacity:.04,x:0,duration:.8,ease:"power3.out"},.25);
${its.map((x) => x.js).join("\n")}
${g ? `tl.fromTo("#s${k + 1}gato",{opacity:0,y:40,scale:.7,rotate:-8},{opacity:1,y:0,scale:1,rotate:0,duration:.5,ease:"back.out(1.8)"},${g.local});tl.to("#s${k + 1}gato",{opacity:0,y:20,duration:.3,ease:"power2.in"},${f2(Math.min(g.local + 3.2, dur - 0.7))});` : ""}
tl.to("#s${k + 1}st",{opacity:0,filter:"blur(10px)",duration:.3,ease:"power2.in"},${f2(dur - 0.5)});
window.__timelines["s${k + 1}"] = tl;
</script>
</template>`;
    arquivos[`compositions/s${k + 1}.html`] = html;
  });

  // fundo com brilho que muda de cor a cada capítulo
  const gl = spec.cenas.map((_, k) => `<div class="glow" id="gl${k}" style="background:radial-gradient(60% 70% at ${k % 2 ? 78 : 22}% 30%, ${acc[k]}33, transparent 70%)"></div>`).join("");
  arquivos["compositions/bg.html"] = `<template>
<style>
#root{position:absolute;inset:0;background:${T.fundo};overflow:hidden}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(243,236,224,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(243,236,224,.035) 1px,transparent 1px);background-size:80px 80px}
.glow{position:absolute;inset:0;opacity:0}
.vig{position:absolute;inset:0;background:radial-gradient(120% 100% at 50% 40%,transparent 55%,rgba(0,0,0,.55) 100%)}
</style>
<div id="root" data-composition-id="bg" data-width="1920" data-height="1080"><div class="grid"></div>${gl}<div class="vig"></div></div>
<script>
const tl=gsap.timeline({paused:true});
${spec.cenas.map((_, k) => `tl.fromTo("#gl${k}",{opacity:0},{opacity:1,duration:.6,ease:"power2.inOut"},${f2(Math.max(0, inicios[k] - 0.2))});tl.to("#gl${k}",{opacity:0,duration:.6,ease:"power2.inOut"},${f2(fins[k] - 0.1)});`).join("\n")}
window.__timelines["bg"]=tl;
</script></template>`;

  // barra de capítulos + transições
  const n = spec.cenas.length, segW = (1720 - (n - 1) * 10) / n;
  const segs = spec.cenas.map((_, k) => `<div class="seg" style="left:${f2(100 + k * (segW + 10))}px;width:${f2(segW)}px"><div class="sf" id="sf${k}" style="background:${acc[k]}"></div></div>`).join("");
  const tits = spec.cenas.map((c, k) => `<div class="ct" id="ct${k}" style="color:${acc[k]}">${esc(c.titulo)}</div>`).join("");
  const seams = spec.cenas.slice(1).map((c, i) => {
    const k = i + 1, kd = TIPOS_SEAM[i % TIPOS_SEAM.length];
    const antes = blocos.filter((b) => b.b <= inicios[k] + 0.01).map((b) => b.b);
    const tbBloco = antes.length ? Math.max(...antes) : null;
    const tb = tbBloco !== null && inicios[k] - tbBloco <= 2 ? f2(tbBloco) : f2(inicios[k] - 0.6);
    return { kd, k, tb, ta: inicios[k], el: `<div class="seam ${kd}" id="sm${k}" style="${kd === "d" ? "opacity:0;" : ""}background:${kd === "d" ? "#0c0a08" : acc[k]}"><div class="sn" style="color:${kd === "d" ? acc[k] : T.fundo}">${esc(String(c.n ?? k + 1).padStart(2, "0"))}</div><div class="stt" style="color:${kd === "d" ? T.texto : T.fundo}">${esc(c.titulo)}</div></div>` };
  });
  const seamJs = seams.map((s) => {
    const t0 = f2(s.tb - 0.25), mid = f2(s.ta + 0.3), id = "#sm" + s.k;
    if (s.kd === "h") return `tl.fromTo("${id}",{clipPath:"inset(0 100% 0 0)"},{clipPath:"inset(0 0% 0 0)",duration:.34,ease:"power3.inOut"},${t0});tl.to("${id}",{clipPath:"inset(0 0 0 100%)",duration:.34,ease:"power3.inOut"},${mid});`;
    if (s.kd === "v") return `tl.fromTo("${id}",{clipPath:"inset(100% 0 0 0)"},{clipPath:"inset(0% 0 0 0)",duration:.34,ease:"power3.inOut"},${t0});tl.to("${id}",{clipPath:"inset(0 0 100% 0)",duration:.34,ease:"power3.inOut"},${mid});`;
    if (s.kd === "i") return `tl.fromTo("${id}",{clipPath:"circle(0% at 50% 50%)"},{clipPath:"circle(75% at 50% 50%)",duration:.4,ease:"power2.in"},${t0});tl.to("${id}",{opacity:0,duration:.3,ease:"power2.out"},${mid});`;
    return `tl.fromTo("${id}",{opacity:0},{opacity:1,duration:.22,ease:"power2.in"},${t0});tl.to("${id}",{opacity:0,duration:.3,ease:"power2.out"},${mid});`;
  }).join("\n");
  const segJs = spec.cenas.map((_, k) => `tl.fromTo("#sf${k}",{scaleX:0},{scaleX:1,duration:${f2(fins[k] - inicios[k])},ease:"none"},${inicios[k]});tl.fromTo("#ct${k}",{opacity:0,y:8},{opacity:1,y:0,duration:.3,ease:"power2.out"},${f2(inicios[k] + (k ? 0.45 : 0.05))});` + (k < n - 1 ? `tl.to("#ct${k}",{opacity:0,duration:.15},${f2(fins[k] - 0.2)});` : "")).join("\n");
  arquivos["compositions/chrome.html"] = `<template>
<style>
${F.faces}
#root{position:absolute;inset:0}
.seg{position:absolute;top:44px;height:6px;border-radius:3px;background:rgba(243,236,224,.14);overflow:hidden}
.sf{position:absolute;inset:0;transform-origin:left center;transform:scaleX(0)}
.ct{position:absolute;left:100px;top:62px;font:800 28px ${F.titulo};letter-spacing:5px;opacity:0}
.seam{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding-left:140px;opacity:1;clip-path:inset(0 100% 0 0)}
.seam.d,.seam.i{clip-path:none;opacity:0}
.seam.i{clip-path:circle(0% at 50% 50%);opacity:1}
.sn{font:900 340px/0.9 ${F.titulo};opacity:.9}
.stt{font:900 76px/1.05 ${F.titulo};max-width:1500px}
</style>
<div id="root" data-composition-id="chrome" data-width="1920" data-height="1080">${segs}${tits}${seams.map((s) => s.el).join("")}</div>
<script>
const tl=gsap.timeline({paused:true});
${segJs}
${seamJs}
window.__timelines["chrome"]=tl;
</script></template>`;

  // legenda palavra a palavra
  const grupos = []; let cur = [];
  palavras.forEach((w, i) => {
    cur.push(w);
    const nx = palavras[i + 1];
    if (!nx || /[.?!…]$/.test(w.t) || nx.a - w.b >= 0.3 || (/[,;:]$/.test(w.t) && cur.length >= 4) || cur.length >= 6) { grupos.push(cur); cur = []; }
  });
  const capHtml = grupos.map((g, gi) => `<div class="g" id="g${gi}">${g.map((w, wi) => `<span id="g${gi}w${wi}">${esc(w.t)}</span>`).join(" ")}</div>`).join("");
  const capJs = grupos.map((g, gi) => {
    const a = f2(Math.max(0.1, g[0].a - 0.04)), nx = grupos[gi + 1], e = f2(Math.min(g.at(-1).b + 0.12, nx ? nx[0].a - 0.02 : 1e9));
    return `tl.set("#g${gi}",{opacity:1},${a});` + g.map((w, wi) => `tl.set("#g${gi}w${wi}",{color:"${T.destaque}"},${f2(w.a)});tl.set("#g${gi}w${wi}",{color:"${T.texto}"},${f2(w.b)});`).join("") + `tl.set("#g${gi}",{opacity:0},${e});`;
  }).join("\n");
  arquivos["compositions/captions.html"] = `<template>
<style>
${F.faces}
#root{position:absolute;inset:0}
.g{position:absolute;left:160px;width:1540px;top:966px;text-align:center;font:800 46px/1.2 ${F.titulo};color:${T.texto};opacity:0;text-shadow:0 2px 14px rgba(0,0,0,.9),0 0 3px rgba(0,0,0,.9)}
.g span{padding:0 2px}
</style>
<div id="root" data-composition-id="captions" data-width="1920" data-height="1080">${capHtml}</div>
<script>
const tl=gsap.timeline({paused:true});
${capJs}
window.__timelines["captions"]=tl;
</script></template>`;

  const fecho = spec.fecho;
  if (fecho) {
    const texto = fecho.texto ?? marca.assinatura ?? "";
    const link = fecho.link ?? "";
    arquivos["compositions/fecho.html"] = `<template>
<style>
${F.faces}
#root{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;font-family:${F.titulo}}
#fg{width:330px;height:330px;opacity:0;image-rendering:pixelated}
#ft{font-weight:900;font-size:120px;color:${T.texto};opacity:0}
#fl{font:700 46px ${F.mono};color:${T.destaque};opacity:0}
#fh{font-weight:800;font-size:30px;color:${T.suave};opacity:0;letter-spacing:4px}
</style>
<div id="root" data-composition-id="fecho" data-width="1920" data-height="1080">
${fecho.imagem ? `<img id="fg" src="assets/${fecho.imagem}" alt="">` : ""}<div id="ft">${esc(texto)}</div>${link ? `<div id="fl">${esc(link)}</div>` : ""}<div id="fh">${esc(T.handle)}</div></div>
<script>
const tl=gsap.timeline({paused:true});
${fecho.imagem ? `tl.fromTo("#fg",{opacity:0,scale:.6,y:30},{opacity:1,scale:1,y:0,duration:.7,ease:"back.out(1.6)"},0.1);` : ""}
tl.fromTo("#ft",{opacity:0,filter:"blur(12px)"},{opacity:1,filter:"blur(0px)",duration:.6,ease:"expo.out"},0.4);
${link ? `tl.fromTo("#fl",{opacity:0,y:14},{opacity:1,y:0,duration:.5,ease:"power3.out"},1.0);` : ""}
tl.fromTo("#fh",{opacity:0},{opacity:1,duration:.5},1.5);
window.__timelines["fecho"]=tl;
</script></template>`;
  }

  const hosts = spec.cenas.map((_, k) => `  <div id="s${k + 1}" data-composition-id="s${k + 1}" data-composition-src="compositions/s${k + 1}.html" data-start="${inicios[k]}" data-duration="${f2(fins[k] - inicios[k])}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index:${10 + k}"></div>`).join("\n");
  const sfx = seams.map((s) => `  <audio id="wh${s.k}" src="assets/sfx/whoosh.wav" data-start="${f2(s.tb - 0.25)}" data-duration="0.55" data-volume="0.35" data-track-index="6"></audio>`).join("\n");
  if (seams.length) assets.push("sfx/whoosh.wav");
  if (fecho) assets.push("sfx/ding.wav");
  arquivos["index.html"] = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1920, height=1080" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:1920px;height:1080px;overflow:hidden;background:${T.fundo}}#root{position:relative;width:1920px;height:1080px}</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${TOTAL}" data-width="1920" data-height="1080">
  <div id="bg" data-composition-id="bg" data-composition-src="compositions/bg.html" data-start="0" data-duration="${TOTAL}" data-track-index="0" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index:0"></div>
${hosts}
${fecho ? `  <div id="fecho" data-composition-id="fecho" data-composition-src="compositions/fecho.html" data-start="${FECHO}" data-duration="${f2(TOTAL - FECHO)}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index:30"></div>` : ""}
  <div id="chrome" data-composition-id="chrome" data-composition-src="compositions/chrome.html" data-start="0" data-duration="${FIM_CENAS}" data-track-index="3" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index:50"></div>
  <div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="${f2(Math.min(TOTAL, fimVoz + 0.3))}" data-track-index="4" data-track-kind="captions" data-width="1920" data-height="1080" style="z-index:60"></div>
  <audio id="voz" src="assets/${spec.voz}" data-start="0" data-duration="${f2(Math.min(TOTAL, fimVoz + 0.05))}" data-volume="1" data-track-index="5"></audio>
${sfx}
${fecho ? `  <audio id="ding" src="assets/sfx/ding.wav" data-start="${f2(FECHO + 0.5)}" data-duration="0.9" data-volume="0.3" data-track-index="6"></audio>` : ""}
</div>
<script>
window.__timelines = window.__timelines || {};
window.__timelines["main"] = gsap.timeline({ paused: true });
</script>
</body>
</html>`;
  return { arquivos, assets, durS: TOTAL, largura: 1920, altura: 1080, cenas: spec.cenas.length };
}

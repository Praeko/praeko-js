// Gerador do Short (1080×1920, 30 fps): os itens declarativos do `EpisodioDecl` viram HTML + GSAP.
// Paridade com o motor Remotion: mesmas medidas do PainelD, das peças do kit, da legenda e do fechamento.
import { ErroHF, cor, esc, f2, achar, exigirSemComponentes } from "./comum.mjs";

const W = 1080, H = 1920;
const DUR_SOM = { pop: 0.16, ding: 0.9, thump: 0.4, whoosh: 0.55 };
const VOL_SOM = { pop: 0.22, ding: 0.26, thump: 0.33, whoosh: 0.28 };

const rgba = (hex, a) => { const n = parseInt(String(hex).slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const posCss = (p) => (p ? `position:absolute;${["left", "right", "top", "bottom"].filter((k) => p[k] !== undefined).map((k) => `${k}:${p[k]}px;`).join("")}${p.w !== undefined ? `width:${p.w}px;` : ""}${p.h !== undefined ? `height:${p.h}px;` : ""}` : "");
const ALINHAR = { centro: "center", inicio: "flex-start", fim: "flex-end", esticar: "stretch" };
const linhas = (t) => String(t).split("\n").map(esc).join("<br>");

/** Troca `quando` ("frase" ou ["frase", n]) por `em` (s locais da cena), recursivamente, como o kit. */
function resolverItem(it, at, onde) {
  const o = { ...it };
  if (it.quando !== undefined) {
    const [fr, n] = Array.isArray(it.quando) ? it.quando : [it.quando, 0];
    const t = at(fr, n);
    if (t === null) throw new ErroHF(`${onde}: frase "${fr}" não aparece na voz (palavras.json)`);
    o.em = f2(t + (it.deslocar ?? 0)); delete o.quando;
  }
  if (it.itens) o.itens = it.itens.map((f) => resolverItem(f, at, onde));
  return o;
}

const EO = "expo.out";
const surge = (sel, q, { x = 0, y = 0, d = 0.35 } = {}) => `tl.fromTo("${sel}",{opacity:0,x:${x},y:${y}},{opacity:1,x:0,y:0,duration:${d},ease:"${EO}"},${f2(q)});`;
const popJs = (sel, q) => `tl.fromTo("${sel}",{scale:.6},{scale:1.14,duration:.18,ease:"power3.out"},${f2(q)});tl.to("${sel}",{scale:1,duration:.22,ease:"power3.out"},${f2(q + 0.18)});`;

function item(it, ctx) {
  const { T, F, c } = ctx;
  const id = `s${ctx.k}i${ctx.uid++}`;
  const q = it.em ?? 0.3, cc = (x) => cor(T, x);
  const filhos = () => (it.itens ?? []).map((f) => item(f, ctx));
  const fam = (mono) => (mono ? `font-family:${F.mono};font-weight:400;` : `font-family:${F.titulo};font-weight:${F.peso};`);
  switch (it.tipo) {
    case "texto": {
      const f = it.fonte ? fam(it.fonte === "mono") : "";
      const html = `<div id="${id}" style="opacity:0;${posCss(it.pos)}${f}font-size:${it.tamanho ?? 40}px;color:${cc(it.cor) ?? T.texto};text-align:${it.alinhar === "esquerda" ? "left" : "center"};${it.altura ? `line-height:${it.altura};` : ""}${it.peso ? `font-weight:${it.peso};` : ""}${it.semQuebra ? "white-space:nowrap;" : ""}">${linhas(it.texto)}</div>`;
      return { html, js: (it.semFade ? `tl.set("#${id}",{opacity:1},0);` : surge("#" + id, q)) + (it.pop ? popJs("#" + id, q) : "") };
    }
    case "big": {
      const inner = `<div id="${id}" style="opacity:0;${fam(it.mono)}font-size:${it.tamanho}px;color:${cc(it.cor) ?? T.texto};text-align:center;line-height:1.05;white-space:nowrap;font-weight:900">${esc(it.texto)}</div>`;
      return { html: it.pos ? `<div style="${posCss(it.pos)}display:flex;justify-content:center">${inner}</div>` : inner, js: surge("#" + id, q, { d: 0.25 }) + popJs("#" + id, q) };
    }
    case "caixa": {
      const html = `<div id="${id}" style="opacity:0;background:${T.caixa};border:4px ${it.tracejada ? "dashed" : "solid"} ${cc(it.cor) ?? T.destaque};border-radius:22px;padding:18px 28px;${fam(it.mono)}font-size:${it.tamanho ?? 48}px;text-align:center;white-space:nowrap;color:${T.texto}">${esc(it.texto)}</div>`;
      return { html, js: it.apagada ? `tl.fromTo("#${id}",{opacity:0,y:30},{opacity:.55,y:0,duration:.35,ease:"${EO}"},${f2(q)});` : surge("#" + id, q, { y: 30 }) };
    }
    case "linha": {
      const partes = it.partes.map((p) => `<span style="${p.mono ? `font-family:${F.mono};font-weight:400;` : ""}${p.cor ? `color:${cc(p.cor)};` : ""}${p.peso ? `font-weight:${p.peso};` : ""}">${esc(p.texto)}</span>`).join("");
      const html = `<div id="${id}" style="opacity:0;background:${T.caixa};border:4px solid ${cc(it.cor) ?? T.destaque};border-radius:24px;padding:22px 30px;font-size:${it.tamanho ?? 46}px;white-space:nowrap;display:flex;align-items:center;gap:22px;${fam(false)}color:${T.texto}">${partes}</div>`;
      return { html, js: surge("#" + id, q, { x: 70 }) };
    }
    case "balao": {
      const co = cc(it.cor) ?? T.info;
      const html = `<div id="${id}" style="opacity:0;position:relative;background:${T.caixa};border:4px solid ${co};border-radius:28px;padding:28px 34px;${fam(false)}font-size:46px;line-height:1.25;color:${T.texto};text-align:center"><span style="position:absolute;left:24px;top:-34px;font-size:90px;color:${co};line-height:1">“</span>${esc(it.texto)}<div style="font-family:${F.mono};font-weight:400;font-size:26px;color:${T.suave};margin-top:16px">${esc(it.autor ?? "— um jogador, no chat")}</div></div>`;
      return { html, js: surge("#" + id, q, { y: 30 }) };
    }
    case "codigo": {
      const co = cc(it.cor) ?? T.erro;
      const rows = it.linhas.map((l) => { const lc = cc(l.cor); return `<div style="white-space:pre;padding:0 26px;color:${lc || T.texto};background:${l.marca ? `${lc}26` : "transparent"};border-left:6px solid ${l.marca ? lc : "transparent"}">${esc(l.s)}</div>`; }).join("");
      const html = `<div id="${id}" style="opacity:0;background:${T.caixa};border-radius:24px;overflow:hidden;border:4px solid ${co}"><div style="background:#1c1830;padding:12px 26px;font-family:${F.mono};font-weight:400;font-size:26px;color:#8b86a8;white-space:nowrap">${esc(it.titulo ?? "")}</div><div style="font-family:${F.mono};font-weight:400;font-size:30px;line-height:1.6;padding:20px 0">${rows}</div></div>`;
      return { html, js: surge("#" + id, q, { y: 30 }) };
    }
    case "janela": case "celular": {
      const cel = it.tipo === "celular", p = it.pos ?? {}, reg = it.reg ?? [0, 0, 1920, 1080];
      if (p.left === undefined || p.top === undefined || p.w === undefined) throw new ErroHF(`${ctx.onde}: "${it.tipo}" precisa de pos.esquerda, pos.topo e pos.largura`);
      const dur = c.painelDur ?? c.dur, de = it.de ?? 0, seg = Math.max(0.5, (it.duracaoClipe ?? 10) - de);
      const s = p.w / reg[2], h = cel ? (p.w * 1920) / 1080 : (p.w * reg[3]) / reg[2];
      const n = Math.max(1, Math.ceil((c.dur - q) / seg));
      const clipes = Array.from({ length: n }, (_, i) => { const ini = f2(q + i * seg), d = f2(Math.min(seg, c.dur - ini)); return d > 0.05 ? `<video class="clip" id="${id}v${i}" src="assets/${it.src}" muted playsinline data-start="${ini}" data-duration="${d}" data-media-start="${de}" data-track-index="2" style="${cel ? "width:100%;height:100%;object-fit:cover" : `position:absolute;left:${-reg[0] * s}px;top:${-reg[1] * s}px;width:${1920 * s}px;height:${1080 * s}px`};display:block"></video>` : ""; }).join("");
      const frame = cel ? `border-radius:46px;border:10px solid #0b0b10;outline:3px solid ${T.destaque}` : `border-radius:26px;border:4px solid ${T.destaque}`;
      const sombra = `0 0 70px ${rgba(T.destaque, cel ? 0.22 : 0.25)}, 0 24px 60px rgba(0,0,0,.6)`;
      const tag = cel ? "" : `<div style="position:absolute;left:14px;bottom:12px;background:rgba(10,8,6,.78);color:${T.texto};font-family:${F.mono};font-weight:400;font-size:22px;padding:4px 14px;border-radius:10px;display:flex;gap:10px;align-items:center"><span style="width:12px;height:12px;border-radius:6px;background:${T.erro};opacity:.75;display:inline-block"></span>${esc(it.tag ?? "CENA REAL DO JOGO")}</div>`;
      const html = `<div id="${id}" style="opacity:0;position:absolute;left:${p.left}px;top:${p.top}px;width:${p.w}px;height:${h}px;${frame};overflow:hidden;box-shadow:${sombra};background:#0b0b10"><div id="${id}p" style="position:absolute;inset:0;transform-origin:50% 60%">${clipes}</div>${tag}</div>`;
      const js = cel
        ? `tl.set("#${id}",{scale:.96},0);tl.fromTo("#${id}",{opacity:0,y:50},{opacity:1,y:0,duration:.5,ease:"${EO}"},${f2(q)});tl.to("#${id}",{scale:1,duration:${f2(dur)},ease:"power3.out"},${f2(q)});`
        : `tl.fromTo("#${id}",{opacity:0,y:40},{opacity:1,y:0,duration:.5,ease:"${EO}"},${f2(q)});tl.fromTo("#${id}p",{scale:1},{scale:1.07,duration:${f2(dur)},ease:"power3.out"},${f2(q)});`;
      return { html, js, assets: [it.src] };
    }
    case "barra": {
      const pr = it.preenche ?? {}, de = pr.de ?? 0, ate = pr.ate ?? 1;
      const g = (it.gradiente ?? [T.erro, T.erro]).map((x) => { const [nm, ...r] = String(x).split(" "); return [cc(nm), ...r].join(" "); });
      const fundo = it.gradienteAngulo === false ? g[0] : `linear-gradient(90deg, ${g.join(", ")})`;
      const html = `<div id="${id}" style="opacity:0;${posCss(it.pos)}height:${it.altura ?? 40}px;border-radius:${it.raio ?? 14}px;background:${it.fundo ?? "#1d1812"};${it.borda === false ? "" : `border:${it.borda ?? 3}px solid #3a2f22;`}overflow:hidden"><div id="${id}f" style="width:100%;height:100%;background:${fundo};transform-origin:left center;transform:scaleX(${ate})"></div></div>`;
      let js = it.semFade ? `tl.set("#${id}",{opacity:1},0);` : surge("#" + id, q);
      if (pr.duracao) { const ini = pr.inicio ?? q; js += `tl.fromTo("#${id}f",{scaleX:${de}},{scaleX:${ate},duration:${pr.duracao},ease:"power3.out"},${f2(ini)});`; }
      if (it.brilhoAoFim) js += `tl.to("#${id}",{boxShadow:"0 0 40px ${cc(it.brilhoAoFim)}",duration:.1},${f2((pr.inicio ?? q) + (pr.duracao ?? 0) * 0.97)});`;
      return { html, js };
    }
    case "barras": {
      const q0 = it.em ?? 0.3, co = cc(it.cor) ?? T.erro;
      const rows = it.linhas.map((l, i) => `<div id="${id}r${i}" style="opacity:0;display:flex;align-items:center;gap:18px"><div style="width:${it.larguraRotulo ?? 190}px;font-family:${F.mono};font-weight:400;font-size:30px;color:${T.suave};white-space:nowrap">${esc(l.rotulo)}</div><div id="${id}b${i}" style="height:34px;width:${(it.larguraMax ?? 640) * (l.valor / it.max)}px;border-radius:10px;background:linear-gradient(90deg, #b9453a, ${co});transform-origin:left center;transform:scaleX(0)"></div><div style="font-family:${F.mono};font-size:30px;color:${co};font-weight:900">${esc(l.texto)}</div></div>`).join("");
      const js = it.linhas.map((l, i) => { const qq = q0 + i * (it.passo ?? 0.5); return surge(`#${id}r${i}`, qq) + `tl.fromTo("#${id}b${i}",{scaleX:0},{scaleX:1,duration:.9,ease:"power3.out"},${f2(qq)});`; }).join("");
      return { html: `<div style="${posCss(it.pos)}display:flex;flex-direction:column;gap:${it.gap ?? 16}px">${rows}</div>`, js };
    }
    case "pilha": {
      const fs = filhos();
      return { html: `<div style="${posCss(it.pos)}display:flex;flex-direction:column;gap:${it.gap ?? 20}px;align-items:${ALINHAR[it.alinhar ?? "esticar"]}">${fs.map((x) => x.html).join("")}</div>`, js: fs.map((x) => x.js).join(""), assets: fs.flatMap((x) => x.assets ?? []) };
    }
    case "fila": {
      const fs = filhos();
      const estilo = it.espalhar ? "display:flex;justify-content:space-between" : it.centrar === false ? `display:flex;gap:${it.gap ?? 20}px` : `display:flex;justify-content:center;align-items:center;gap:${it.gap ?? 20}px;white-space:nowrap`;
      return { html: `<div style="${posCss(it.pos)}${estilo}">${fs.map((x) => x.html).join("")}</div>`, js: fs.map((x) => x.js).join(""), assets: fs.flatMap((x) => x.assets ?? []) };
    }
    case "cartao": {
      const rows = it.linhas.map((l) => l.map((p) => `<span style="${p.cor ? `color:${cc(p.cor)};` : ""}${p.peso ? `font-weight:${p.peso};` : ""}">${esc(p.texto)}</span>`).join("")).join("<br>");
      const html = `<div id="${id}" style="opacity:0;${posCss(it.pos)}background:${T.caixa};border:4px solid ${cc(it.cor) ?? T.destaque};border-radius:24px;padding:20px 24px;font-family:${F.mono};font-weight:400;font-size:${it.tamanho ?? 40}px;color:${T.texto}">${rows}</div>`;
      return { html, js: surge("#" + id, q, { x: 60 }) };
    }
    default: throw new ErroHF(`${ctx.onde}: tipo de item "${it.tipo}" não existe no motor HyperFrames`);
  }
}

/** Mesma regra de agrupamento da legenda do motor Remotion (`agrupar`). */
export function agrupar(ps) {
  const g = []; let cur = [];
  const fecha = () => { if (cur.length) g.push({ palavras: cur, a: cur[0].a, b: cur.at(-1).b }); cur = []; };
  ps.forEach((p, i) => {
    cur.push(p);
    const gap = i < ps.length - 1 ? ps[i + 1].a - p.b : 1;
    const letras = cur.reduce((n, x) => n + x.t.length, 0), prox = ps[i + 1]?.t.length ?? 0;
    if (/[.,?!:]$/.test(p.t) || cur.length >= 3 || letras + prox > 15 || gap > 0.3) fecha();
  });
  fecha();
  return g;
}

/** Tremor/zoom/clarão: amostrado quadro a quadro com `tl.set`, que é função só do tempo. */
function golpesJs(golpes, a, dur, { alvo, flash }) {
  let js = "";
  for (const g of golpes ?? []) {
    if (g.at + 0.45 < a || g.at > a + dur) continue;
    for (let n = 0; n <= 14; n++) {
      const dt = n / 30, t = f2(g.at + dt - a);
      if (t < 0 || t > dur) continue;
      const k = n === 14 ? 0 : (1 - dt / 0.45) ** 2;
      let sx = 0, sy = 0, z = 1, fl = 0;
      if (g.tipo === "shake" || g.tipo === "tudo") { sx = Math.sin(dt * 95) * 16 * k; sy = Math.cos(dt * 120) * 9 * k; }
      if (g.tipo === "zoom" || g.tipo === "tudo") z = 1 + 0.055 * k;
      if (g.tipo === "flash" || g.tipo === "tudo") fl = 0.33 * k;
      js += flash ? `tl.set("#fl",{opacity:${f2(fl)}},${t});` : `tl.set("${alvo}",{x:${f2(sx)},y:${f2(sy)},scale:${+z.toFixed(4)}},${t});`;
    }
  }
  return js;
}

export function gerarShort({ spec, palavras, marca = {}, T, F, slug }) {
  exigirSemComponentes(slug, spec);
  const P = palavras, D = spec.durS, fechaA = spec.fechamento.a;
  const S = spec.cenas.map((c) => c.inicio);
  const fimDe = (i) => spec.cenas[i].fim ?? (i + 1 < S.length ? S[i + 1] : fechaA);
  const arquivos = {}, assets = [spec.voz, "sfx/whoosh.wav", "sfx/pop.wav", "sfx/ding.wav", T.avatar];
  const atGlobal = (fr, n = 0) => { const t = achar(P, fr, n, 0); return t < 0 ? null : t; };
  const cssBase = `${F.faces}\n#root{position:absolute;inset:0;font-family:${F.titulo};font-weight:${F.peso};color:${T.texto}}`;

  // ---- cenas ----
  const hfs = [];
  const sons = [{ f: "whoosh", at: 0, v: VOL_SOM.whoosh }];
  spec.cenas.forEach((cena, i) => {
    const a = cena.inicio, b = f2((i + 1 < S.length ? S[i + 1] : fimDe(i)) - 0.1), dur = f2(b - a), painelDur = f2(fimDe(i) - a);
    const onde = `${slug} › cena ${i + 1}${cena.titulo ? ` (${cena.titulo})` : ""}`;
    const at = (fr, n = 0) => { const t = atGlobal(fr, n); return t === null ? null : t - a; };
    const ctx = { T, F, k: i + 1, uid: 0, onde, c: { dur, painelDur } };
    const its = (cena.itens ?? []).map((x) => item(resolverItem(x, at, onde), ctx));
    const dentro = its.map((x) => x.html).join("");
    (its.flatMap((x) => x.assets ?? [])).forEach((s) => assets.push(s));
    const livre = (cena.layout ?? "painel") === "livre";
    const corpo = livre ? dentro : `<div id="s${i + 1}p" style="position:absolute;left:70px;right:70px;top:330px;height:1000px;display:flex;flex-direction:column;background:rgba(20,17,15,.94);border:4px solid ${T.destaque};border-radius:36px;box-shadow:0 24px 60px rgba(0,0,0,.6);padding:40px 48px;font-family:${F.titulo};font-weight:${F.peso};color:${T.texto};overflow:hidden;box-sizing:border-box;opacity:0"><div style="font-size:38px;letter-spacing:5px;color:${T.destaque};white-space:nowrap">${esc(cena.titulo ?? "")}</div><div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:40px;min-height:0">${dentro}</div></div>`;
    const rotulo = cena.rotulo ? `<div style="position:absolute;top:70px;left:0;right:0;display:flex;justify-content:center"><div id="s${i + 1}r" style="opacity:0;background:${T.destaque};color:${T.fundo};font-size:62px;font-weight:900;letter-spacing:1px;padding:14px 36px;border-radius:22px;box-shadow:0 10px 30px rgba(0,0,0,.55);white-space:nowrap">${esc(cena.rotulo)}</div></div>` : "";
    const painelJs = livre ? "" : `tl.fromTo("#s${i + 1}p",{opacity:0,y:60,scale:.82},{opacity:1,y:0,scale:1,duration:.5,ease:"back.out(1.3)"},0);` + (painelDur - 0.2 < dur ? `tl.to("#s${i + 1}p",{opacity:0,duration:.2,ease:"none"},${f2(painelDur - 0.2)});` : "");
    const rotuloJs = cena.rotulo ? `tl.fromTo("#s${i + 1}r",{opacity:0,scale:.6,rotation:-4},{opacity:1,scale:1,rotation:0,duration:.4,ease:"back.out(1.7)"},0.1);` : "";
    arquivos[`compositions/s${i + 1}.html`] = `<template>
<style>${cssBase}</style>
<div id="root" data-composition-id="s${i + 1}" data-width="${W}" data-height="${H}">
  <div id="s${i + 1}shk" style="position:absolute;inset:0">${corpo}${rotulo}</div>
</div>
<script>
const tl = gsap.timeline({ paused: true });
${painelJs}${rotuloJs}
${its.map((x) => x.js).join("\n")}
${golpesJs(spec.golpes, a, dur, { alvo: `#s${i + 1}shk` })}
window.__timelines["s${i + 1}"] = tl;
</script>
</template>`;
    sons.push({ f: "pop", at: a, v: VOL_SOM.pop });
    (cena.sons ?? []).forEach((s) => { sons.push({ f: s.f, at: f2(a + s.at), v: s.v ?? VOL_SOM[s.f] }); assets.push(`sfx/${s.f}.wav`); });
    hfs.push({ a, dur });
  });

  // ---- fundo: terminal de duas colunas subindo, pontos e brilho ----
  const linhasF = spec.fundoLinhas?.length ? spec.fundoLinhas : ["✓ ok"], nL = linhasF.length, passo = 64, ciclo = 34 * passo;
  const sobe = (y0, v, fim, wrapY, minY) => { // posições (y) de uma linha que sobe a v px/s e reaparece embaixo em wrapY
    const kf = []; let y = y0, t = 0;
    while (t < D - 1e-6) {
      const dist = y - minY;
      if (dist <= 1e-6) { kf.push(`{y:${f2(wrapY)},duration:0}`); y = wrapY; continue; }
      const dt = Math.min(D - t, dist / v);
      kf.push(`{y:${f2(y - dt * v)},duration:${f2(dt)},ease:"none"}`); y -= dt * v; t += dt;
    }
    return `tl.set("#${fim}",{y:${f2(y0)}},0);tl.to("#${fim}",{keyframes:[${kf.join(",")}]},0);`;
  };
  const term = Array.from({ length: 34 }, (_, i) => {
    const col = (i + Math.floor(i / nL)) % 2, y0 = (((i * passo) % ciclo) + ciclo) % ciclo - 160;
    return { html: `<div id="tm${i}" data-layout-ignore style="position:absolute;left:${30 + col * 420}px;top:0;font-family:${F.mono};font-weight:400;font-size:28px;color:${i % 4 === 0 ? T.destaque : T.ok};white-space:nowrap">${esc(linhasF[i % nL])}</div>`, js: sobe(y0, 24, `tm${i}`, ciclo - 160, -160) };
  });
  const dots = Array.from({ length: 26 }, (_, i) => {
    const x = (i * 137) % W, vel = (0.35 + (i % 5) * 0.18) * 30, r = 3 + (i % 4) * 2, y0 = (i * 251) % H;
    return { html: `<div id="dt${i}" data-layout-ignore style="position:absolute;left:${x}px;top:0;width:${r}px;height:${r}px;border-radius:${r}px;background:${T.destaque};opacity:${f2(0.1 + (i % 4) * 0.05)}"></div>`, js: sobe(y0, vel, `dt${i}`, H, -r) };
  });
  let pulso = ""; for (let t = 0, n = 0; t < D; t += 2.3, n++) pulso += `tl.to("#gl",{opacity:${n % 2 ? 0.16 : 0.21},duration:2.3,ease:"sine.inOut"},${f2(t)});`;
  arquivos["compositions/bg.html"] = `<template>
<style>${F.faces}
#root{position:absolute;inset:0;background:${T.fundo};overflow:hidden}</style>
<div id="root" data-composition-id="bg" data-width="${W}" data-height="${H}"><div id="bgw" style="position:absolute;inset:0;overflow:hidden">
<div id="gl" style="position:absolute;inset:0;opacity:.16;background:radial-gradient(ellipse at 50% 20%, ${T.destaque} 0%, rgba(0,0,0,0) 55%)"></div>
<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 100%, rgba(80,60,120,.22) 0%, rgba(0,0,0,0) 60%)"></div>
<div data-layout-ignore style="position:absolute;inset:0;opacity:.09;filter:blur(1.2px)">${term.map((x) => x.html).join("")}</div>
${dots.map((x) => x.html).join("")}</div></div>
<script>
const tl=gsap.timeline({paused:true});
${pulso}${term.map((x) => x.js).join("")}${dots.map((x) => x.js).join("")}
${golpesJs(spec.golpes, 0, D, { alvo: "#bgw" })}
window.__timelines["bg"]=tl;
</script></template>`;

  // ---- clarão dos golpes, barra de progresso ----
  const temFlash = (spec.golpes ?? []).some((g) => g.tipo === "flash" || g.tipo === "tudo");
  if (temFlash) arquivos["compositions/fx.html"] = `<template><style>#root{position:absolute;inset:0}</style><div id="root" data-composition-id="fx" data-width="${W}" data-height="${H}"><div id="fl" style="position:absolute;inset:0;background:rgb(255,244,214);opacity:0"></div></div>
<script>const tl=gsap.timeline({paused:true});
${golpesJs(spec.golpes, 0, D, { flash: true })}
window.__timelines["fx"]=tl;</script></template>`;
  arquivos["compositions/chrome.html"] = `<template><style>#root{position:absolute;inset:0}</style><div id="root" data-composition-id="chrome" data-width="${W}" data-height="${H}"><div style="position:absolute;top:0;left:0;right:0;height:10px;background:rgba(0,0,0,.4)"><div id="pg" style="width:100%;height:100%;background:${T.destaque};transform-origin:left center;transform:scaleX(0)"></div></div></div>
<script>const tl=gsap.timeline({paused:true});
tl.fromTo("#pg",{scaleX:0},{scaleX:1,duration:${D},ease:"none"},0);
window.__timelines["chrome"]=tl;</script></template>`;

  // ---- legenda palavra a palavra ----
  const px = spec.legendaPx ?? 90, grupos = agrupar(P);
  let livreDesde = 0;
  const lgHtml = [], lgJs = [];
  grupos.forEach((g, gi) => {
    const prox = grupos[gi + 1]?.a ?? g.b + 0.4;
    const ini = Math.max(g.a - 0.05, livreDesde), fim = Math.max(g.b + 0.15, Math.min(prox, g.b + 0.5));
    livreDesde = fim;
    if (fim <= ini) return;
    lgHtml.push(`<div id="lg${gi}" style="position:absolute;left:${px < 90 ? 70 : 40}px;right:${px < 90 ? 70 : 40}px;bottom:190px;display:flex;justify-content:center;gap:${px < 90 ? 64 : 44}px;flex-wrap:wrap;opacity:0">${g.palavras.map((p, wi) => `<span id="lg${gi}w${wi}" style="display:inline-block;font-family:${F.titulo};font-weight:900;font-size:${px}px;line-height:1.05;text-transform:uppercase;color:${rgba(T.texto, 0.55)};text-shadow:0 6px 0 #000, 0 0 24px rgba(0,0,0,.85), 4px 0 0 #000, -4px 0 0 #000">${esc(p.t)}</span>`).join("")}</div>`);
    const ini2 = f2(ini), e = f2(fim);
    lgJs.push(`tl.fromTo("#lg${gi}",{opacity:0,y:24},{opacity:1,y:0,duration:.2,ease:"none"},${ini2});` + g.palavras.map((p, wi) => {
      const nx = g.palavras[wi + 1], fimP = f2(Math.min(p.b + 0.05, nx ? nx.a : 1e9));
      return `tl.set("#lg${gi}w${wi}",{color:"${T.destaque}",scale:1.12},${f2(p.a)});tl.set("#lg${gi}w${wi}",{color:"${T.texto}",scale:1},${fimP});`;
    }).join("") + `tl.set("#lg${gi}",{opacity:0},${e});`);
  });
  arquivos["compositions/legenda.html"] = `<template><style>${F.faces}#root{position:absolute;inset:0}</style><div id="root" data-composition-id="legenda" data-width="${W}" data-height="${H}">${lgHtml.join("")}</div>
<script>const tl=gsap.timeline({paused:true});
${lgJs.join("\n")}
window.__timelines["legenda"]=tl;</script></template>`;

  // ---- fechamento ----
  const cta = spec.fechamento.cta;
  arquivos["compositions/fecho.html"] = `<template><style>${F.faces}#root{position:absolute;inset:0;background:radial-gradient(circle at 50% 40%, ${T.caixa} 0%, ${T.fundo} 72%);display:flex;flex-direction:column;justify-content:center;align-items:center;font-family:${F.titulo};font-weight:900;text-align:center}</style>
<div id="root" data-composition-id="fecho" data-width="${W}" data-height="${H}">
<div id="fa" style="width:420px;height:420px;border-radius:210px;overflow:hidden;border:12px solid ${T.destaque};box-shadow:0 0 80px ${rgba(T.destaque, 0.45)};opacity:0"><img src="assets/${T.avatar}" alt="" style="width:420px;height:420px;image-rendering:pixelated;display:block"></div>
<div id="fn" style="margin-top:46px;font-size:92px;font-weight:900;color:${T.destaque};opacity:0">${esc(T.handle)}</div>
<div id="fc" style="margin-top:50px;background:${T.destaque};color:${T.fundo};font-size:${cta.length > 18 ? 54 : 64}px;font-weight:900;padding:20px 44px;border-radius:28px;opacity:0">${esc(cta)}</div></div>
<script>const tl=gsap.timeline({paused:true});
tl.fromTo("#fa",{opacity:0,scale:.6},{opacity:1,scale:1,duration:.5,ease:"back.out(1.5)"},0);
tl.fromTo("#fn",{opacity:0,y:30},{opacity:1,y:0,duration:.5,ease:"power2.out"},.27);
tl.fromTo("#fc",{opacity:0,scale:.6},{opacity:1,scale:1,duration:.45,ease:"back.out(1.6)"},.67);
window.__timelines["fecho"]=tl;</script></template>`;

  // ---- index ----
  const host = (id, ini, dur, z, trilha, tipo = "graphics") => `  <div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${f2(ini)}" data-duration="${f2(dur)}" data-track-index="${trilha}" data-track-kind="${tipo}" data-width="${W}" data-height="${H}" style="z-index:${z}"></div>`;
  const hosts = [
    host("bg", 0, D, 0, 0),
    ...spec.cenas.map((_, i) => host(`s${i + 1}`, hfs[i].a, hfs[i].dur, 10 + i, 1)),
    ...(temFlash ? [host("fx", 0, D, 35, 2)] : []),
    host("fecho", fechaA, D - fechaA, 40, 3),
    host("legenda", 0, D, 50, 4, "captions"),
    host("chrome", 0, D, 60, 5),
  ];
  const fimVoz = P.at(-1)?.b ?? D;
  const audios = [`  <audio id="voz" src="assets/${spec.voz}" data-start="0" data-duration="${f2(Math.min(D, fimVoz + 0.3))}" data-volume="1" data-track-index="9"></audio>`];
  sons.forEach((s, n) => audios.push(`  <audio id="sfx${n}" src="assets/sfx/${s.f}.wav" data-start="${f2(s.at)}" data-duration="${DUR_SOM[s.f]}" data-volume="${s.v}" data-track-index="${10 + (n % 3)}"></audio>`));
  audios.push(`  <audio id="sfxd" src="assets/sfx/ding.wav" data-start="${f2(fechaA)}" data-duration="${DUR_SOM.ding}" data-volume="0.22" data-track-index="14"></audio>`);
  arquivos["index.html"] = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
<style>*{margin:0;padding:0}html,body{width:${W}px;height:${H}px;overflow:hidden;background:${T.fundo}}#root{position:relative;width:${W}px;height:${H}px}</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${D}" data-width="${W}" data-height="${H}">
${hosts.join("\n")}
${audios.join("\n")}
</div>
<script>
window.__timelines = window.__timelines || {};
window.__timelines["main"] = gsap.timeline({ paused: true });
</script>
</body>
</html>`;
  return { arquivos, assets, durS: D, largura: W, altura: H, cenas: spec.cenas.length };
}

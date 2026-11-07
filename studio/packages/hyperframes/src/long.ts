// Long-video generator (1920×1080, global phrase timing). Each scene of the spec becomes a sub-composition `compositions/sN.html`.
// The engine's own editing: chapter bar, transitions between chapters (4 types), ghost number, word-by-word captions,
// optional mascot (`mascot:` in the yaml) and end card.
import { HfError, color, esc, f2, mascotFile, timeResolver } from "./common.ts";
import type { Block, Brand, Files, Fonts, Generated, Spec, Theme, Word } from "./common.ts";

const ACCENTS = ["accent", "info", "error", "ok", "extra"];
const SEAM_TYPES = ["h", "d", "v", "i"];

function sceneCss(T: Theme, F: Fonts): string {
  return `${F.faces}
#root{position:absolute;inset:0;font-family:${F.title};font-weight:700;color:${T.text}}
.stage{position:absolute;inset:0}
.it{position:absolute;opacity:0}
.ghost{position:absolute;right:60px;bottom:40px;font:900 420px/1 ${F.title};color:${T.text};opacity:0;z-index:0}
.txt{font-weight:800;line-height:1.15}
.txt .w{display:inline-block;opacity:0}
.cnt{font-weight:900;line-height:1;white-space:nowrap}
.chip{display:inline-block;white-space:nowrap;border:2px solid;border-radius:999px;padding:.28em .8em;font-weight:800}
.bar .lab{color:${T.muted};font-weight:700;margin-bottom:8px}
.bar .track{position:relative;background:rgba(243,236,224,.09);border-radius:12px;overflow:hidden}
.bar .fill{position:absolute;inset:0;transform-origin:left center;transform:scaleX(0);border-radius:12px}
.bar .val{position:absolute;right:18px;top:0;bottom:0;display:flex;align-items:center;font-weight:900;color:${T.background};opacity:0}
.vid{border-radius:22px;overflow:hidden}
.vframe{width:100%;height:100%;background:#0c0a08;border:2px solid rgba(243,236,224,.18);border-radius:22px;box-shadow:0 24px 60px rgba(0,0,0,.55)}
.vframe video{display:block;border-radius:14px;object-fit:cover}
.cel .vframe{border-radius:42px;border-width:3px}
.cel .vframe video{border-radius:32px}
.vtag{position:absolute;left:18px;bottom:16px;background:rgba(20,17,15,.88);border:1px solid ${T.accent}99;color:${T.accent};font:800 28px ${F.title};padding:6px 14px;border-radius:10px;opacity:0}
.code{background:${T.code};border:2px solid rgba(243,236,224,.14);border-radius:18px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.5)}
.code .bar3{display:flex;align-items:center;gap:8px;padding:12px 18px;background:#241d16;font:700 28px ${F.mono};color:${T.muted}}
.code .bar3 b{width:13px;height:13px;border-radius:50%;background:#4a3f33;display:inline-block}
.code .bar3 span{margin-left:12px}
.code .body{padding:14px 0 18px;font-family:${F.mono};font-weight:600}
.code .ln{position:relative;padding:3px 24px 3px 30px;white-space:pre;line-height:1.5;opacity:0}
.code .mk{position:absolute;left:0;top:0;bottom:0;width:6px;background:${T.accent};opacity:0}
.code .red .mk{background:${T.error}}
.code i{font-style:normal}
.card{background:${T.longBox ?? T.box};border-radius:18px;padding:26px 32px;display:flex;flex-direction:column;gap:14px;justify-content:center;box-shadow:0 20px 50px rgba(0,0,0,.45)}
.card .cl{line-height:1.2;opacity:0}
.flow{display:flex;align-items:center;justify-content:space-between;gap:16px}
.flow .node{flex:1;text-align:center;border:3px solid;border-radius:18px;padding:22px 14px;background:${T.longBox ?? T.box}e6;font-weight:800;line-height:1.25;opacity:0}
.flow .arr{font-size:54px;color:${T.muted};opacity:0}
.mascot{position:absolute;right:70px;bottom:20px;width:150px;height:150px;opacity:0;z-index:5}`;
}

// same color rule as the kit's `colorize` (SQL/JS): comment, string, keyword, number and function
const KW = /^(UPDATE|SET|WHERE|AND|INSERT|INTO|SELECT|FROM|CASE|WHEN|THEN|END|AS|VALUES|IS|NOT|NULL|const|await|if)$/;
const FN = /^(changes|abs|json_set|json_remove|json_extract)$/;
function colorize(s: string, T: Theme): string {
  return s.split(/(--.*$|\/\/.*$|'[^']*'|\b\w+\b)/).map((p) => {
    if (!p) return "";
    let c = null;
    if (/^(--|\/\/)/.test(p)) c = T.muted; else if (/^'/.test(p)) c = T.ok; else if (KW.test(p)) c = T.accent; else if (/^\d+$/.test(p)) c = "#7fb4ff"; else if (FN.test(p)) c = T.info;
    return c ? `<i style="color:${c}">${esc(p)}</i>` : esc(p);
  }).join("");
}

const ENTRANCES: ((id: string, t: number) => string)[] = [
  (id, t) => `tl.fromTo("${id}",{opacity:0,y:22,filter:"blur(10px)"},{opacity:1,y:0,filter:"blur(0px)",duration:.5,ease:"expo.out"},${t});`,
  (id, t) => `tl.fromTo("${id}",{opacity:0,x:-70,filter:"blur(10px)"},{opacity:1,x:0,filter:"blur(0px)",duration:.45,ease:"power4.out"},${t});`,
  (id, t) => `tl.fromTo("${id}",{opacity:0,scale:.94,filter:"blur(8px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:.5,ease:"back.out(1.4)"},${t});`,
];
const pos = (p: any = {}) => `left:${p.left}px;top:${p.top}px;${p.w ? `width:${p.w}px;` : ""}${p.h ? `min-height:${p.h}px;` : ""}`;

function longItem(it: any, k: number, t0: number, sceneEnd: number, c: any): { html: string; js: string; assets?: string[] } {
  const { T, Tm, entr } = c;
  const id = `s${k}i${c.uid++}`;
  const t = f2(Tm(it.when, t0) - t0);
  const p = it.pos ?? {};
  const snap = k === 1 && t < 0.4 && (it.type === "freetext" || it.type === "counter");
  const parts = (x: any) => (x.parts ? x.parts.map((q: any) => `<span style="${q.color ? `color:${color(T, q.color)};` : ""}${q.mono ? `font-family:${c.F.mono};` : ""}">${esc(q.text)}</span>`).join("") : esc(x.text ?? ""));
  switch (it.type) {
    case "freetext": {
      const wordSpans = it.parts ? null : String(it.text).split(" ").map((w, i) => `<span class="w" id="${id}w${i}">${esc(w)}</span>`).join(" ");
      const alignCss = it.align === "center" ? "text-align:center;" : "";
      const html = `<div class="it txt" id="${id}" style="${pos(p)}font-size:${it.size ?? 48}px;color:${color(T, it.color) ?? T.text};${alignCss}${it.mono ? `font-family:${c.F.mono};` : ""}">${wordSpans ?? parts(it)}</div>`;
      const js = !wordSpans ? entr("#" + id, t)
        : snap ? `tl.set("#${id}",{opacity:1},0);tl.set("#${id} .w",{opacity:1},0);`
          : `tl.set("#${id}",{opacity:1},${t});tl.fromTo("#${id} .w",{opacity:0,filter:"blur(7px)"},{opacity:1,filter:"blur(0px)",duration:.14,stagger:.075,ease:"power2.out"},${t});`;
      return { html, js };
    }
    case "counter": {
      const d = it.duration ?? 1.6, casas = it.decimals ?? 0, a = it.from ?? 0;
      const html = `<div class="it cnt" id="${id}" style="${pos(p)}font-size:${it.size ?? 96}px;color:${color(T, it.color) ?? T.accent};${it.align === "center" ? "text-align:center;" : ""}${it.mono ? `font-family:${c.F.mono};` : ""}">${esc(it.prefix ?? "")}<span id="${id}n">${a}</span>${esc(it.suffix ?? "")}</div>`;
      const js = `${snap ? `tl.set("#${id}",{opacity:1},0);` : entr("#" + id, t)}{const o={v:${a}};const fm=v=>v.toFixed(${casas}).replace(".",",").replace(/\\B(?=(\\d{3})+(?!\\d))/g,".");tl.to(o,{v:${it.to ?? 0},duration:${d},ease:"power2.out",onUpdate:()=>{document.getElementById("${id}n").textContent=fm(o.v)}},${snap ? 0.1 : t});tl.to("#${id}",{scale:1.06,duration:.12,yoyo:true,repeat:1,ease:"power2.out"},${f2(t + d)});}`;
      return { html, js };
    }
    case "chip": {
      const cc = color(T, it.color) ?? T.muted;
      return { html: `<div class="it chip" id="${id}" style="${pos(p)}font-size:${it.size ?? 34}px;color:${cc};border-color:${cc};background:${cc}22">${esc(it.text)}</div>`, js: entr("#" + id, t) };
    }
    case "bar": {
      const h = it.height ?? 46, cc = color(T, it.color) ?? T.accent, v = it.value ?? 1, d = it.duration ?? 1.4;
      const html = `<div class="it bar" id="${id}" style="${pos(p)}">${it.label ? `<div class="lab" style="font-size:${Math.max(28, it.size ?? 30)}px">${esc(it.label)}</div>` : ""}<div class="track" style="height:${h}px"><div class="fill" id="${id}f" style="background:${cc}"></div>${it.text ? `<span class="val" style="font-size:${Math.max(28, Math.round(h * 0.56))}px;${v < 0.5 ? `left:calc(${v * 100}% + 18px);right:auto;color:${cc}` : ""}">${esc(it.text)}</span>` : ""}</div></div>`;
      const js = `tl.fromTo("#${id}",{opacity:0,y:14},{opacity:1,y:0,duration:.35,ease:"power3.out"},${t});tl.fromTo("#${id}f",{scaleX:0},{scaleX:${v},duration:${d},ease:"power3.out"},${f2(t + 0.15)});${it.text ? `tl.fromTo("#${id} .val",{opacity:0},{opacity:1,duration:.25},${f2(t + 0.15 + d * 0.6)});` : ""}`;
      return { html, js };
    }
    case "video": case "phone": {
      const cel = it.type === "phone", reg = it.reg ?? [0, 0, 1920, 1080];
      const w = p.w, pad = cel ? 10 : 6, iw = w - pad * 2, s = iw / reg[2];
      const h = cel ? Math.round((w * 1920) / 1080) : Math.round(reg[3] * s) + pad * 2, ih = h - pad * 2;
      const clipSeconds = Math.max(0.5, (it.clipDuration ?? 10) - (it.from ?? 0));
      const play = Math.max(1, Math.min(clipSeconds, sceneEnd - 0.4 - (t0 + t)));
      const vstyle = cel ? `width:${iw}px;height:${ih}px;` : `position:relative;left:${-reg[0] * s}px;top:${-reg[1] * s}px;width:${1920 * s}px;height:${1080 * s}px;`;
      const html = `<div class="it vid ${cel ? "cel" : ""}" id="${id}" style="left:${p.left}px;top:${p.top}px;width:${w}px;height:${h}px;"><div class="vframe" style="padding:${pad}px;box-sizing:border-box;${cel ? "" : "overflow:hidden;"}"><video class="clip" id="${id}v" src="assets/${it.src}" muted playsinline data-start="${t}" data-duration="${f2(play)}" data-media-start="${it.from ?? 0}" data-track-index="2" style="${vstyle}"></video></div>${cel || it.tag === "" ? "" : `<div class="vtag" id="${id}g">${esc(it.tag ?? "footage")}</div>`}</div>`;
      const js = `tl.fromTo("#${id}",{opacity:0,clipPath:"inset(0 100% 0 0 round 22px)",filter:"blur(8px)"},{opacity:1,clipPath:"inset(0 0% 0 0 round 22px)",filter:"blur(0px)",duration:.6,ease:"power3.out"},${t});` +
        (!cel && it.tag !== "" ? `tl.fromTo("#${id}g",{opacity:0,y:10},{opacity:1,y:0,duration:.3,ease:"power2.out"},${f2(t + 0.5)});` : "") +
        `tl.to("#${id}",{opacity:0,filter:"blur(8px)",duration:.3,ease:"power2.in"},${f2(t + play - 0.1)});`;
      return { html, js, assets: [it.src] };
    }
    case "code": {
      const lines = it.lines.map((l: any) => ({ s: l.s, hl: Array.isArray(l.hl) ? [Tm(l.hl[0]), Tm(l.hl[1])] : null, red: l.red }));
      const rows = lines.map((l: any, i: any) => `<div class="ln${l.red ? " red" : ""}" id="${id}l${i}"><span class="mk"></span>${colorize(l.s, T) || "&nbsp;"}</div>`).join("");
      const html = `<div class="it code" id="${id}" style="${pos(p)}font-size:${it.size ?? 32}px"><div class="bar3"><b></b><b></b><b></b><span>${esc(it.title ?? "")}</span></div><div class="body">${rows}</div></div>`;
      const js = `${entr("#" + id, t)}` + lines.map((l: any, i: any) => {
        if (!l.hl) return "";
        const on = f2(l.hl[0] - t0), off = f2(l.hl[1] - t0), bg = l.red ? "rgba(255,107,94,.22)" : "rgba(244,185,66,.20)";
        return `tl.to("#${id}l${i}",{backgroundColor:"${bg}",duration:.3},${on});tl.to("#${id}l${i} .mk",{opacity:1,duration:.2},${on});tl.to("#${id}l${i}",{backgroundColor:"rgba(0,0,0,0)",duration:.3},${off});tl.to("#${id}l${i} .mk",{opacity:0,duration:.2},${off});`;
      }).join("") + `tl.fromTo("#${id} .ln",{opacity:0,x:-14},{opacity:1,x:0,duration:.25,stagger:.09,ease:"power2.out"},${f2(t + 0.2)});`;
      return { html, js };
    }
    case "card": {
      const cc = color(T, it.color) ?? T.accent;
      const rows = it.items.map((x: any, i: any) => {
        const tx = x.when !== undefined ? f2(Tm(x.when) - t0) : t;
        return { tx, h: `<div class="cl" id="${id}c${i}" style="font-size:${x.size ?? 36}px;color:${color(T, x.color) ?? T.text};letter-spacing:${x.spacing ?? 0}px;font-weight:${x.spacing ? 800 : 700}">${parts(x)}</div>` };
      });
      const html = `<div class="it card" id="${id}" style="${pos(p)}border-left:10px solid ${cc}">${rows.map((r: any) => r.h).join("")}</div>`;
      const js = `tl.fromTo("#${id}",{opacity:0,y:26,filter:"blur(8px)"},{opacity:1,y:0,filter:"blur(0px)",duration:.5,ease:"expo.out"},${t});` +
        rows.map((r: any, i: any) => `tl.fromTo("#${id}c${i}",{opacity:0,x:-22,filter:"blur(6px)"},{opacity:1,x:0,filter:"blur(0px)",duration:.4,ease:"power3.out"},${f2(Math.max(r.tx, t + 0.1))});`).join("");
      return { html, js };
    }
    case "flow": {
      const nos = it.nodes ?? [], n = nos.length;
      const nodes = nos.map((x: any, i: any) => `<div class="node" id="${id}n${i}" style="font-size:${it.size ?? 34}px;border-color:${color(T, x.color) ?? color(T, it.color) ?? T.accent};color:${color(T, x.color) ?? color(T, it.color) ?? T.accent}">${esc(x.text).replace(/\n/g, "<br>")}</div>${i < n - 1 ? `<div class="arr" id="${id}a${i}">→</div>` : ""}`).join("");
      const js = `tl.set("#${id}",{opacity:1},${t});` + nos.map((x: any, i: any) => {
        const tx = f2(Tm(x.when) - t0);
        return `tl.fromTo("#${id}n${i}",{opacity:0,scale:.9,filter:"blur(6px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:.4,ease:"back.out(1.5)"},${tx});` + (i > 0 ? `tl.fromTo("#${id}a${i - 1}",{opacity:0,x:-16},{opacity:1,x:0,duration:.3,ease:"power2.out"},${f2(tx - 0.2)});` : "");
      }).join("");
      return { html: `<div class="it flow" id="${id}" style="${pos(p)}">${nodes}</div>`, js };
    }
    default: throw new HfError(`item type "${it.type}" does not exist in the long video (use code, card, text, chip, freetext, video, phone, bar, counter, flow)`);
  }
}

/** Optional mascot: `mascot: [{ when, name, plus }]` in the yaml (image from `brand.mascotPath`, default mascots/{name}.png in publicDir). */
function mascotsList(spec: Spec, Tm: ReturnType<typeof timeResolver>, starts: number[], ends: number[], brand: Brand) {
  return (spec.mascot ?? []).map((m: any) => {
    const t = f2(Tm(m.when) + (m.plus ?? 0));
    const k = starts.findIndex((a, i) => t >= a && t < (ends[i] as number));
    return k < 0 ? null : { k, name: m.name as string, local: f2(t - starts[k]!), file: mascotFile(brand, m.name) };
  }).filter(Boolean);
}

export function generateLong({ spec, words, blocks = [], brand = {}, T, F }: { spec: Spec; words: Word[]; blocks?: Block[]; brand?: Brand; T: Theme; F: Fonts; slug: string }): Generated {
  const Tm = timeResolver(words);
  const acc = spec.scenes.map((_: any, k: any) => color(T, ACCENTS[k % ACCENTS.length]));
  const speechEnd = words.at(-1)?.b ?? 0;
  const TOTAL = spec.durS;
  const ENDCARD = spec.endcard ? Math.min(TOTAL - 1, f2(Math.max(spec.endcard.start ?? 0, speechEnd + 0.25))) : null;
  const SCENES_END = ENDCARD ?? TOTAL;
  const starts = spec.scenes.map((c: any) => c.start);
  const ends = starts.map((s: any, i: any) => (i + 1 < starts.length ? starts[i + 1] : SCENES_END));
  const files: Files = {}, assets: string[] = [spec.voice];
  const css = sceneCss(T, F);
  const mascots = mascotsList(spec, Tm, starts, ends, brand);
  mascots.forEach((g: any) => assets.push(g.file));
  if (spec.endcard?.image) assets.push(spec.endcard.image);

  spec.scenes.forEach((scene: any, k: any) => {
    const a = starts[k], dur = f2(ends[k] - a);
    const c = { T, F, Tm, uid: 0, ei: k, entr: (id: any, t: any) => (ENTRANCES[c.ei++ % ENTRANCES.length] as (id: string, t: number) => string)(id, t) };
    const rendered = (scene.items ?? []).map((x: any) => longItem(x, k + 1, a, ends[k], c));
    rendered.forEach((x: any) => (x.assets ?? []).forEach((s: any) => assets.push(s)));
    const g = mascots.find((x: any) => x.k === k);
    const html = `<template>
<style>${css}</style>
<div id="root" data-composition-id="s${k + 1}" data-width="1920" data-height="1080">
  <div class="ghost" data-layout-ignore id="s${k + 1}gh">${esc(String(scene.n ?? k + 1).padStart(2, "0"))}</div>
  <div class="stage" id="s${k + 1}st">
${rendered.map((x: any) => x.html).join("\n")}
  </div>
  ${g ? `<img class="mascot" id="s${k + 1}mascot" src="assets/${g.file}" alt="">` : ""}
</div>
<script>
const tl = gsap.timeline({ paused: true });
tl.fromTo("#s${k + 1}gh",{opacity:0,x:60},{opacity:.04,x:0,duration:.8,ease:"power3.out"},.25);
${rendered.map((x: any) => x.js).join("\n")}
${g ? `tl.fromTo("#s${k + 1}mascot",{opacity:0,y:40,scale:.7,rotate:-8},{opacity:1,y:0,scale:1,rotate:0,duration:.5,ease:"back.out(1.8)"},${g.local});tl.to("#s${k + 1}mascot",{opacity:0,y:20,duration:.3,ease:"power2.in"},${f2(Math.min(g.local + 3.2, dur - 0.7))});` : ""}
tl.to("#s${k + 1}st",{opacity:0,filter:"blur(10px)",duration:.3,ease:"power2.in"},${f2(dur - 0.5)});
window.__timelines["s${k + 1}"] = tl;
</script>
</template>`;
    files[`compositions/s${k + 1}.html`] = html;
  });

  // background with a glow that changes color at each chapter
  const glowHtml = spec.scenes.map((_: any, k: any) => `<div class="glow" id="gl${k}" style="background:radial-gradient(60% 70% at ${k % 2 ? 78 : 22}% 30%, ${acc[k]}33, transparent 70%)"></div>`).join("");
  files["compositions/bg.html"] = `<template>
<style>
#root{position:absolute;inset:0;background:${T.background};overflow:hidden}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(243,236,224,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(243,236,224,.035) 1px,transparent 1px);background-size:80px 80px}
.glow{position:absolute;inset:0;opacity:0}
.vig{position:absolute;inset:0;background:radial-gradient(120% 100% at 50% 40%,transparent 55%,rgba(0,0,0,.55) 100%)}
</style>
<div id="root" data-composition-id="bg" data-width="1920" data-height="1080"><div class="grid"></div>${glowHtml}<div class="vig"></div></div>
<script>
const tl=gsap.timeline({paused:true});
${spec.scenes.map((_: any, k: any) => `tl.fromTo("#gl${k}",{opacity:0},{opacity:1,duration:.6,ease:"power2.inOut"},${f2(Math.max(0, starts[k] - 0.2))});tl.to("#gl${k}",{opacity:0,duration:.6,ease:"power2.inOut"},${f2(ends[k] - 0.1)});`).join("\n")}
window.__timelines["bg"]=tl;
</script></template>`;

  // chapter bar + transitions
  const n = spec.scenes.length, segW = (1720 - (n - 1) * 10) / n;
  const segs = spec.scenes.map((_: any, k: any) => `<div class="seg" style="left:${f2(100 + k * (segW + 10))}px;width:${f2(segW)}px"><div class="sf" id="sf${k}" style="background:${acc[k]}"></div></div>`).join("");
  const tits = spec.scenes.map((c: any, k: any) => `<div class="ct" id="ct${k}" style="color:${acc[k]}">${esc(c.title)}</div>`).join("");
  const seams = spec.scenes.slice(1).map((c: any, i: any) => {
    const k = i + 1, kd = SEAM_TYPES[i % SEAM_TYPES.length];
    const before = blocks.filter((b) => b.b <= starts[k] + 0.01).map((b) => b.b);
    const blockEdge = before.length ? Math.max(...before) : null;
    const tIn = blockEdge !== null && starts[k] - blockEdge <= 2 ? f2(blockEdge) : f2(starts[k] - 0.6);
    return { kd, k, tIn, tOut: starts[k], el: `<div class="seam ${kd}" id="sm${k}" style="${kd === "d" ? "opacity:0;" : ""}background:${kd === "d" ? "#0c0a08" : acc[k]}"><div class="sn" style="color:${kd === "d" ? acc[k] : T.background}">${esc(String(c.n ?? k + 1).padStart(2, "0"))}</div><div class="stt" style="color:${kd === "d" ? T.text : T.background}">${esc(c.title)}</div></div>` };
  });
  const seamJs = seams.map((s: any) => {
    const t0 = f2(s.tIn - 0.25), mid = f2(s.tOut + 0.3), id = "#sm" + s.k;
    if (s.kd === "h") return `tl.fromTo("${id}",{clipPath:"inset(0 100% 0 0)"},{clipPath:"inset(0 0% 0 0)",duration:.34,ease:"power3.inOut"},${t0});tl.to("${id}",{clipPath:"inset(0 0 0 100%)",duration:.34,ease:"power3.inOut"},${mid});`;
    if (s.kd === "v") return `tl.fromTo("${id}",{clipPath:"inset(100% 0 0 0)"},{clipPath:"inset(0% 0 0 0)",duration:.34,ease:"power3.inOut"},${t0});tl.to("${id}",{clipPath:"inset(0 0 100% 0)",duration:.34,ease:"power3.inOut"},${mid});`;
    if (s.kd === "i") return `tl.fromTo("${id}",{clipPath:"circle(0% at 50% 50%)"},{clipPath:"circle(75% at 50% 50%)",duration:.4,ease:"power2.in"},${t0});tl.to("${id}",{opacity:0,duration:.3,ease:"power2.out"},${mid});`;
    return `tl.fromTo("${id}",{opacity:0},{opacity:1,duration:.22,ease:"power2.in"},${t0});tl.to("${id}",{opacity:0,duration:.3,ease:"power2.out"},${mid});`;
  }).join("\n");
  const segJs = spec.scenes.map((_: any, k: any) => `tl.fromTo("#sf${k}",{scaleX:0},{scaleX:1,duration:${f2(ends[k] - starts[k])},ease:"none"},${starts[k]});tl.fromTo("#ct${k}",{opacity:0,y:8},{opacity:1,y:0,duration:.3,ease:"power2.out"},${f2(starts[k] + (k ? 0.45 : 0.05))});` + (k < n - 1 ? `tl.to("#ct${k}",{opacity:0,duration:.15},${f2(ends[k] - 0.2)});` : "")).join("\n");
  files["compositions/chrome.html"] = `<template>
<style>
${F.faces}
#root{position:absolute;inset:0}
.seg{position:absolute;top:44px;height:6px;border-radius:3px;background:rgba(243,236,224,.14);overflow:hidden}
.sf{position:absolute;inset:0;transform-origin:left center;transform:scaleX(0)}
.ct{position:absolute;left:100px;top:62px;font:800 28px ${F.title};letter-spacing:5px;opacity:0}
.seam{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding-left:140px;opacity:1;clip-path:inset(0 100% 0 0)}
.seam.d,.seam.i{clip-path:none;opacity:0}
.seam.i{clip-path:circle(0% at 50% 50%);opacity:1}
.sn{font:900 340px/0.9 ${F.title};opacity:.9}
.stt{font:900 76px/1.05 ${F.title};max-width:1500px}
</style>
<div id="root" data-composition-id="chrome" data-width="1920" data-height="1080">${segs}${tits}${seams.map((s: any) => s.el).join("")}</div>
<script>
const tl=gsap.timeline({paused:true});
${segJs}
${seamJs}
window.__timelines["chrome"]=tl;
</script></template>`;

  // word-by-word captions
  const groups: Word[][] = []; let cur: Word[] = [];
  words.forEach((w, i) => {
    cur.push(w);
    const nx = words[i + 1];
    if (!nx || /[.?!…]$/.test(w.t) || nx.a - w.b >= 0.3 || (/[,;:]$/.test(w.t) && cur.length >= 4) || cur.length >= 6) { groups.push(cur); cur = []; }
  });
  const capHtml = groups.map((g, gi) => `<div class="g" id="g${gi}">${g.map((w: any, wi: any) => `<span id="g${gi}w${wi}">${esc(w.t)}</span>`).join(" ")}</div>`).join("");
  const capJs = groups.map((g, gi) => {
    const a = f2(Math.max(0.1, (g[0] as Word).a - 0.04)), nx = groups[gi + 1], e = f2(Math.min((g.at(-1) as Word).b + 0.12, nx ? (nx[0] as Word).a - 0.02 : 1e9));
    return `tl.set("#g${gi}",{opacity:1},${a});` + g.map((w: any, wi: any) => `tl.set("#g${gi}w${wi}",{color:"${T.accent}"},${f2(w.a)});tl.set("#g${gi}w${wi}",{color:"${T.text}"},${f2(w.b)});`).join("") + `tl.set("#g${gi}",{opacity:0},${e});`;
  }).join("\n");
  files["compositions/captions.html"] = `<template>
<style>
${F.faces}
#root{position:absolute;inset:0}
.g{position:absolute;left:160px;width:1540px;top:966px;text-align:center;font:800 46px/1.2 ${F.title};color:${T.text};opacity:0;text-shadow:0 2px 14px rgba(0,0,0,.9),0 0 3px rgba(0,0,0,.9)}
.g span{padding:0 2px}
</style>
<div id="root" data-composition-id="captions" data-width="1920" data-height="1080">${capHtml}</div>
<script>
const tl=gsap.timeline({paused:true});
${capJs}
window.__timelines["captions"]=tl;
</script></template>`;

  const endcard = spec.endcard;
  if (endcard) {
    const text = endcard.text ?? brand.signature ?? "";
    const link = endcard.link ?? "";
    files["compositions/endcard.html"] = `<template>
<style>
${F.faces}
#root{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;font-family:${F.title}}
#fg{width:330px;height:330px;opacity:0;image-rendering:pixelated}
#ft{font-weight:900;font-size:120px;color:${T.text};opacity:0}
#fl{font:700 46px ${F.mono};color:${T.accent};opacity:0}
#fh{font-weight:800;font-size:30px;color:${T.muted};opacity:0;letter-spacing:4px}
</style>
<div id="root" data-composition-id="endcard" data-width="1920" data-height="1080">
${endcard.image ? `<img id="fg" src="assets/${endcard.image}" alt="">` : ""}<div id="ft">${esc(text)}</div>${link ? `<div id="fl">${esc(link)}</div>` : ""}<div id="fh">${esc(T.handle)}</div></div>
<script>
const tl=gsap.timeline({paused:true});
${endcard.image ? `tl.fromTo("#fg",{opacity:0,scale:.6,y:30},{opacity:1,scale:1,y:0,duration:.7,ease:"back.out(1.6)"},0.1);` : ""}
tl.fromTo("#ft",{opacity:0,filter:"blur(12px)"},{opacity:1,filter:"blur(0px)",duration:.6,ease:"expo.out"},0.4);
${link ? `tl.fromTo("#fl",{opacity:0,y:14},{opacity:1,y:0,duration:.5,ease:"power3.out"},1.0);` : ""}
tl.fromTo("#fh",{opacity:0},{opacity:1,duration:.5},1.5);
window.__timelines["endcard"]=tl;
</script></template>`;
  }

  const hosts = spec.scenes.map((_: any, k: any) => `  <div id="s${k + 1}" data-composition-id="s${k + 1}" data-composition-src="compositions/s${k + 1}.html" data-start="${starts[k]}" data-duration="${f2(ends[k] - starts[k])}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index:${10 + k}"></div>`).join("\n");
  const sfx = seams.map((s: any) => `  <audio id="wh${s.k}" src="assets/sfx/whoosh.wav" data-start="${f2(s.tIn - 0.25)}" data-duration="0.55" data-volume="0.35" data-track-index="6"></audio>`).join("\n");
  if (seams.length) assets.push("sfx/whoosh.wav");
  if (endcard) assets.push("sfx/ding.wav");
  files["index.html"] = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1920, height=1080" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:1920px;height:1080px;overflow:hidden;background:${T.background}}#root{position:relative;width:1920px;height:1080px}</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${TOTAL}" data-width="1920" data-height="1080">
  <div id="bg" data-composition-id="bg" data-composition-src="compositions/bg.html" data-start="0" data-duration="${TOTAL}" data-track-index="0" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index:0"></div>
${hosts}
${endcard ? `  <div id="endcard" data-composition-id="endcard" data-composition-src="compositions/endcard.html" data-start="${ENDCARD}" data-duration="${f2(TOTAL - (ENDCARD as number))}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index:30"></div>` : ""}
  <div id="chrome" data-composition-id="chrome" data-composition-src="compositions/chrome.html" data-start="0" data-duration="${SCENES_END}" data-track-index="3" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index:50"></div>
  <div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="${f2(Math.min(TOTAL, speechEnd + 0.3))}" data-track-index="4" data-track-kind="captions" data-width="1920" data-height="1080" style="z-index:60"></div>
  <audio id="voz" src="assets/${spec.voice}" data-start="0" data-duration="${f2(Math.min(TOTAL, speechEnd + 0.05))}" data-volume="1" data-track-index="5"></audio>
${sfx}
${endcard ? `  <audio id="ding" src="assets/sfx/ding.wav" data-start="${f2((ENDCARD as number) + 0.5)}" data-duration="0.9" data-volume="0.3" data-track-index="6"></audio>` : ""}
</div>
<script>
window.__timelines = window.__timelines || {};
window.__timelines["main"] = gsap.timeline({ paused: true });
</script>
</body>
</html>`;
  return { files, assets, durS: TOTAL, width: 1920, height: 1080, scenes: spec.scenes.length };
}

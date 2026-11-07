// Short generator (1080×1920, 30 fps): the declarative items of the kit's `EpisodeDecl` become HTML + GSAP.
// Parity with the Remotion engine: same measures as the kit's Panel, pieces, caption and outro.
import { HfError, color, esc, f2, findPhrase, requireNoComponents } from "./common.ts";
import type { Brand, Files, Fonts, Generated, Spec, Theme, Word } from "./common.ts";

const W = 1080, H = 1920;
const SOUND_DUR: Record<string, number> = { pop: 0.16, ding: 0.9, thump: 0.4, whoosh: 0.55 };
const SOUND_VOL: Record<string, number> = { pop: 0.22, ding: 0.26, thump: 0.33, whoosh: 0.28 };

const rgba = (hex: string, a: number) => { const n = parseInt(String(hex).slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const positionCss = (p: any) => (p ? `position:absolute;${["left", "right", "top", "bottom"].filter((k) => p[k] !== undefined).map((k) => `${k}:${p[k]}px;`).join("")}${p.w !== undefined ? `width:${p.w}px;` : ""}${p.h !== undefined ? `height:${p.h}px;` : ""}` : "");
const ALIGN: Record<string, string> = { center: "center", start: "flex-start", end: "flex-end", stretch: "stretch" };
const lines = (t: unknown) => String(t).split("\n").map(esc).join("<br>");

/** Swaps `when` ("phrase" or ["phrase", n]) for `at` (scene-local seconds), recursively, like the kit. */
function resolveItem(it: any, at: (f: string, n?: number) => number | null, where: string): any {
  const o = { ...it };
  if (it.when !== undefined) {
    const [fr, n] = Array.isArray(it.when) ? it.when : [it.when, 0];
    const t = at(fr, n);
    if (t === null) throw new HfError(`${where}: phrase "${fr}" does not appear in the voice (words.json)`);
    o.at = f2(t + (it.offset ?? 0)); delete o.when;
  }
  if (it.items) o.items = it.items.map((f: any) => resolveItem(f, at, where));
  return o;
}

const EO = "expo.out";
const appear = (sel: string, q: number, { x = 0, y = 0, d = 0.35 }: { x?: number; y?: number; d?: number } = {}) => `tl.fromTo("${sel}",{opacity:0,x:${x},y:${y}},{opacity:1,x:0,y:0,duration:${d},ease:"${EO}"},${f2(q)});`;
const popJs = (sel: string, q: number) => `tl.fromTo("${sel}",{scale:.6},{scale:1.14,duration:.18,ease:"power3.out"},${f2(q)});tl.to("${sel}",{scale:1,duration:.22,ease:"power3.out"},${f2(q + 0.18)});`;

export function renderItem(it: any, ctx: any): { html: string; js: string; assets?: string[] } {
  const { T, F, c } = ctx;
  const id = `s${ctx.k}i${ctx.uid++}`;
  const q = it.at ?? 0.3, cc = (x: string | undefined) => color(T, x);
  const children = () => (it.items ?? []).map((f: any) => renderItem(f, ctx));
  const fam = (mono: any) => (mono ? `font-family:${F.mono};font-weight:400;` : `font-family:${F.title};font-weight:${F.weight};`);
  switch (it.type) {
    case "text": {
      const f = it.font ? fam(it.font === "mono") : "";
      const html = `<div id="${id}" style="opacity:0;${positionCss(it.pos)}${f}font-size:${it.size ?? 40}px;color:${cc(it.color) ?? T.text};text-align:${it.align === "left" ? "left" : "center"};${it.lineHeight ? `line-height:${it.lineHeight};` : ""}${it.weight ? `font-weight:${it.weight};` : ""}${it.noWrap ? "white-space:nowrap;" : ""}">${lines(it.text)}</div>`;
      return { html, js: (it.noFade ? `tl.set("#${id}",{opacity:1},0);` : appear("#" + id, q)) + (it.pop ? popJs("#" + id, q) : "") };
    }
    case "big": {
      const inner = `<div id="${id}" style="opacity:0;${fam(it.mono)}font-size:${it.size}px;color:${cc(it.color) ?? T.text};text-align:center;line-height:1.05;white-space:nowrap;font-weight:900">${esc(it.text)}</div>`;
      return { html: it.pos ? `<div style="${positionCss(it.pos)}display:flex;justify-content:center">${inner}</div>` : inner, js: appear("#" + id, q, { d: 0.25 }) + popJs("#" + id, q) };
    }
    case "box": {
      const html = `<div id="${id}" style="opacity:0;background:${T.box};border:4px ${it.dashed ? "dashed" : "solid"} ${cc(it.color) ?? T.accent};border-radius:22px;padding:18px 28px;${fam(it.mono)}font-size:${it.size ?? 48}px;text-align:center;white-space:nowrap;color:${T.text}">${esc(it.text)}</div>`;
      return { html, js: it.dim ? `tl.fromTo("#${id}",{opacity:0,y:30},{opacity:.55,y:0,duration:.35,ease:"${EO}"},${f2(q)});` : appear("#" + id, q, { y: 30 }) };
    }
    case "line": {
      const parts = it.parts.map((p: any) => `<span style="${p.mono ? `font-family:${F.mono};font-weight:400;` : ""}${p.color ? `color:${cc(p.color)};` : ""}${p.weight ? `font-weight:${p.weight};` : ""}">${esc(p.text)}</span>`).join("");
      const html = `<div id="${id}" style="opacity:0;background:${T.box};border:4px solid ${cc(it.color) ?? T.accent};border-radius:24px;padding:22px 30px;font-size:${it.size ?? 46}px;white-space:nowrap;display:flex;align-items:center;gap:22px;${fam(false)}color:${T.text}">${parts}</div>`;
      return { html, js: appear("#" + id, q, { x: 70 }) };
    }
    case "bubble": {
      const accent = cc(it.color) ?? T.info;
      const html = `<div id="${id}" style="opacity:0;position:relative;background:${T.box};border:4px solid ${accent};border-radius:28px;padding:28px 34px;${fam(false)}font-size:46px;line-height:1.25;color:${T.text};text-align:center"><span style="position:absolute;left:24px;top:-34px;font-size:90px;color:${accent};line-height:1">“</span>${esc(it.text)}<div style="font-family:${F.mono};font-weight:400;font-size:26px;color:${T.muted};margin-top:16px">${esc(it.author ?? "— a viewer, in the chat")}</div></div>`;
      return { html, js: appear("#" + id, q, { y: 30 }) };
    }
    case "code": {
      const accent = cc(it.color) ?? T.error;
      const rows = it.lines.map((l: any) => { const lc = cc(l.color); return `<div style="white-space:pre;padding:0 26px;color:${lc || T.text};background:${l.mark ? `${lc}26` : "transparent"};border-left:6px solid ${l.mark ? lc : "transparent"}">${esc(l.s)}</div>`; }).join("");
      const html = `<div id="${id}" style="opacity:0;background:${T.box};border-radius:24px;overflow:hidden;border:4px solid ${accent}"><div style="background:#1c1830;padding:12px 26px;font-family:${F.mono};font-weight:400;font-size:26px;color:#8b86a8;white-space:nowrap">${esc(it.title ?? "")}</div><div style="font-family:${F.mono};font-weight:400;font-size:30px;line-height:1.6;padding:20px 0">${rows}</div></div>`;
      return { html, js: appear("#" + id, q, { y: 30 }) };
    }
    case "window": case "phone": {
      const isPhone = it.type === "phone", p = it.pos ?? {}, reg = it.reg ?? [0, 0, 1920, 1080];
      if (p.left === undefined || p.top === undefined || p.w === undefined) throw new HfError(`${ctx.where}: "${it.type}" needs pos.left, pos.top and pos.width`);
      const dur = c.panelDur ?? c.dur, mediaFrom = it.from ?? 0, clipSeconds = Math.max(0.5, (it.clipDuration ?? 10) - mediaFrom);
      const s = p.w / reg[2], h = isPhone ? (p.w * 1920) / 1080 : (p.w * reg[3]) / reg[2];
      const n = Math.max(1, Math.ceil((c.dur - q) / clipSeconds));
      const clips = Array.from({ length: n }, (_, i) => { const begin = f2(q + i * clipSeconds), d = f2(Math.min(clipSeconds, c.dur - begin)); return d > 0.05 ? `<video class="clip" id="${id}v${i}" src="assets/${it.src}" muted playsinline data-start="${begin}" data-duration="${d}" data-media-start="${mediaFrom}" data-track-index="2" style="${isPhone ? "width:100%;height:100%;object-fit:cover" : `position:absolute;left:${-reg[0] * s}px;top:${-reg[1] * s}px;width:${1920 * s}px;height:${1080 * s}px`};display:block"></video>` : ""; }).join("");
      const frame = isPhone ? `border-radius:46px;border:10px solid #0b0b10;outline:3px solid ${T.accent}` : `border-radius:26px;border:4px solid ${T.accent}`;
      const shadow = `0 0 70px ${rgba(T.accent, isPhone ? 0.22 : 0.25)}, 0 24px 60px rgba(0,0,0,.6)`;
      const tag = isPhone ? "" : `<div style="position:absolute;left:14px;bottom:12px;background:rgba(10,8,6,.78);color:${T.text};font-family:${F.mono};font-weight:400;font-size:22px;padding:4px 14px;border-radius:10px;display:flex;gap:10px;align-items:center"><span style="width:12px;height:12px;border-radius:6px;background:${T.error};opacity:.75;display:inline-block"></span>${esc(it.tag ?? "LIVE FOOTAGE")}</div>`;
      const html = `<div id="${id}" style="opacity:0;position:absolute;left:${p.left}px;top:${p.top}px;width:${p.w}px;height:${h}px;${frame};overflow:hidden;box-shadow:${shadow};background:#0b0b10"><div id="${id}p" style="position:absolute;inset:0;transform-origin:50% 60%">${clips}</div>${tag}</div>`;
      const js = isPhone
        ? `tl.set("#${id}",{scale:.96},0);tl.fromTo("#${id}",{opacity:0,y:50},{opacity:1,y:0,duration:.5,ease:"${EO}"},${f2(q)});tl.to("#${id}",{scale:1,duration:${f2(dur)},ease:"power3.out"},${f2(q)});`
        : `tl.fromTo("#${id}",{opacity:0,y:40},{opacity:1,y:0,duration:.5,ease:"${EO}"},${f2(q)});tl.fromTo("#${id}p",{scale:1},{scale:1.07,duration:${f2(dur)},ease:"power3.out"},${f2(q)});`;
      return { html, js, assets: [it.src] };
    }
    case "bar": {
      const fillSpec = it.fill ?? {}, mediaFrom = fillSpec.from ?? 0, toV = fillSpec.to ?? 1;
      const g = (it.gradient ?? [T.error, T.error]).map((x: any) => { const [nm, ...r] = String(x).split(" "); return [cc(nm), ...r].join(" "); });
      const bg = it.gradientAngle === false ? g[0] : `linear-gradient(90deg, ${g.join(", ")})`;
      const html = `<div id="${id}" style="opacity:0;${positionCss(it.pos)}height:${it.height ?? 40}px;border-radius:${it.radius ?? 14}px;background:${it.background ?? "#1d1812"};${it.border === false ? "" : `border:${it.border ?? 3}px solid #3a2f22;`}overflow:hidden"><div id="${id}f" style="width:100%;height:100%;background:${bg};transform-origin:left center;transform:scaleX(${toV})"></div></div>`;
      let js = it.noFade ? `tl.set("#${id}",{opacity:1},0);` : appear("#" + id, q);
      if (fillSpec.duration) { const begin = fillSpec.start ?? q; js += `tl.fromTo("#${id}f",{scaleX:${mediaFrom}},{scaleX:${toV},duration:${fillSpec.duration},ease:"power3.out"},${f2(begin)});`; }
      if (it.glowAtEnd) js += `tl.to("#${id}",{boxShadow:"0 0 40px ${cc(it.glowAtEnd)}",duration:.1},${f2((fillSpec.start ?? q) + (fillSpec.duration ?? 0) * 0.97)});`;
      return { html, js };
    }
    case "bars": {
      const q0 = it.at ?? 0.3, accent = cc(it.color) ?? T.error;
      const rows = it.lines.map((l: any, i: any) => `<div id="${id}r${i}" style="opacity:0;display:flex;align-items:center;gap:18px"><div style="width:${it.labelWidth ?? 190}px;font-family:${F.mono};font-weight:400;font-size:30px;color:${T.muted};white-space:nowrap">${esc(l.label)}</div><div id="${id}b${i}" style="height:34px;width:${(it.maxWidth ?? 640) * (l.value / it.max)}px;border-radius:10px;background:linear-gradient(90deg, #b9453a, ${accent});transform-origin:left center;transform:scaleX(0)"></div><div style="font-family:${F.mono};font-size:30px;color:${accent};font-weight:900">${esc(l.text)}</div></div>`).join("");
      const js = it.lines.map((l: any, i: any) => { const qEach = q0 + i * (it.step ?? 0.5); return appear(`#${id}r${i}`, qEach) + `tl.fromTo("#${id}b${i}",{scaleX:0},{scaleX:1,duration:.9,ease:"power3.out"},${f2(qEach)});`; }).join("");
      return { html: `<div style="${positionCss(it.pos)}display:flex;flex-direction:column;gap:${it.gap ?? 16}px">${rows}</div>`, js };
    }
    case "stack": {
      const kids = children();
      return { html: `<div style="${positionCss(it.pos)}display:flex;flex-direction:column;gap:${it.gap ?? 20}px;align-items:${ALIGN[it.align ?? "stretch"]}">${kids.map((x: any) => x.html).join("")}</div>`, js: kids.map((x: any) => x.js).join(""), assets: kids.flatMap((x: any) => x.assets ?? []) };
    }
    case "row": {
      const kids = children();
      const style = it.spread ? "display:flex;justify-content:space-between" : it.center === false ? `display:flex;gap:${it.gap ?? 20}px` : `display:flex;justify-content:center;align-items:center;gap:${it.gap ?? 20}px;white-space:nowrap`;
      return { html: `<div style="${positionCss(it.pos)}${style}">${kids.map((x: any) => x.html).join("")}</div>`, js: kids.map((x: any) => x.js).join(""), assets: kids.flatMap((x: any) => x.assets ?? []) };
    }
    case "card": {
      const rows = it.lines.map((l: any) => l.map((p: any) => `<span style="${p.color ? `color:${cc(p.color)};` : ""}${p.weight ? `font-weight:${p.weight};` : ""}">${esc(p.text)}</span>`).join("")).join("<br>");
      const html = `<div id="${id}" style="opacity:0;${positionCss(it.pos)}background:${T.box};border:4px solid ${cc(it.color) ?? T.accent};border-radius:24px;padding:20px 24px;font-family:${F.mono};font-weight:400;font-size:${it.size ?? 40}px;color:${T.text}">${rows}</div>`;
      return { html, js: appear("#" + id, q, { x: 60 }) };
    }
    default: throw new HfError(`${ctx.where}: item type "${it.type}" does not exist in the HyperFrames engine`);
  }
}

/** Same grouping rule as the Remotion engine's captions (`groupWords`). */
export function groupWords(ws: Word[]): { words: Word[]; a: number; b: number }[] {
  const g: { words: Word[]; a: number; b: number }[] = []; let cur: Word[] = [];
  const close = () => { if (cur.length) g.push({ words: cur, a: (cur[0] as Word).a, b: (cur.at(-1) as Word).b }); cur = []; };
  ws.forEach((p, i) => {
    cur.push(p);
    const gap = i < ws.length - 1 ? (ws[i + 1] as Word).a - p.b : 1;
    const letters = cur.reduce((n, x) => n + x.t.length, 0), nextLen = ws[i + 1]?.t.length ?? 0;
    if (/[.,?!:]$/.test(p.t) || cur.length >= 3 || letters + nextLen > 15 || gap > 0.3) close();
  });
  close();
  return g;
}

/** Shake/zoom/flash: sampled frame by frame with `tl.set`, which is a function of time only. */
function hitsJs(hits: any[] | undefined, a: number, dur: number, { target, flash }: { target?: string; flash?: boolean }): string {
  let js = "";
  for (const g of hits ?? []) {
    if (g.at + 0.45 < a || g.at > a + dur) continue;
    for (let n = 0; n <= 14; n++) {
      const dt = n / 30, t = f2(g.at + dt - a);
      if (t < 0 || t > dur) continue;
      const k = n === 14 ? 0 : (1 - dt / 0.45) ** 2;
      let sx = 0, sy = 0, z = 1, fl = 0;
      if (g.type === "shake" || g.type === "all") { sx = Math.sin(dt * 95) * 16 * k; sy = Math.cos(dt * 120) * 9 * k; }
      if (g.type === "zoom" || g.type === "all") z = 1 + 0.055 * k;
      if (g.type === "flash" || g.type === "all") fl = 0.33 * k;
      js += flash ? `tl.set("#fl",{opacity:${f2(fl)}},${t});` : `tl.set("${target}",{x:${f2(sx)},y:${f2(sy)},scale:${+z.toFixed(4)}},${t});`;
    }
  }
  return js;
}

export function generateShort({ spec, words, T, F, slug }: { spec: Spec; words: Word[]; brand?: Brand; T: Theme; F: Fonts; slug: string }): Generated {
  requireNoComponents(slug, spec);
  const P = words, D = spec.durS, outroAt = spec.outro.a;
  const S = spec.scenes.map((c: any) => c.start);
  const endOf = (i: any) => spec.scenes[i].end ?? (i + 1 < S.length ? S[i + 1] : outroAt);
  const files: Files = {}, assets: string[] = [spec.voice, "sfx/whoosh.wav", "sfx/pop.wav", "sfx/ding.wav", T.avatar];
  const atGlobal = (fr: any, n = 0) => { const t = findPhrase(P, fr, n, 0); return t < 0 ? null : t; };
  const cssBase = `${F.faces}\n#root{position:absolute;inset:0;font-family:${F.title};font-weight:${F.weight};color:${T.text}}`;

  // ---- scenes ----
  const timings: { a: number; dur: number }[] = [];
  const sounds = [{ f: "whoosh", at: 0, v: SOUND_VOL.whoosh }];
  spec.scenes.forEach((scene: any, i: any) => {
    const a = scene.start, b = f2((i + 1 < S.length ? S[i + 1] : endOf(i)) - 0.1), dur = f2(b - a), panelDur = f2(endOf(i) - a);
    const where = `${slug} › scene ${i + 1}${scene.title ? ` (${scene.title})` : ""}`;
    const at = (fr: any, n = 0) => { const t = atGlobal(fr, n); return t === null ? null : t - a; };
    const ctx = { T, F, k: i + 1, uid: 0, where, c: { dur, panelDur } };
    const rendered = (scene.items ?? []).map((x: any) => renderItem(resolveItem(x, at, where), ctx));
    const inside = rendered.map((x: any) => x.html).join("");
    (rendered.flatMap((x: any) => x.assets ?? [])).forEach((s: any) => assets.push(s));
    const free = (scene.layout ?? "panel") === "free";
    const body = free ? inside : `<div id="s${i + 1}p" style="position:absolute;left:70px;right:70px;top:330px;height:1000px;display:flex;flex-direction:column;background:rgba(20,17,15,.94);border:4px solid ${T.accent};border-radius:36px;box-shadow:0 24px 60px rgba(0,0,0,.6);padding:40px 48px;font-family:${F.title};font-weight:${F.weight};color:${T.text};overflow:hidden;box-sizing:border-box;opacity:0"><div style="font-size:38px;letter-spacing:5px;color:${T.accent};white-space:nowrap">${esc(scene.title ?? "")}</div><div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:40px;min-height:0">${inside}</div></div>`;
    const label = scene.label ? `<div style="position:absolute;top:70px;left:0;right:0;display:flex;justify-content:center"><div id="s${i + 1}r" style="opacity:0;background:${T.accent};color:${T.background};font-size:62px;font-weight:900;letter-spacing:1px;padding:14px 36px;border-radius:22px;box-shadow:0 10px 30px rgba(0,0,0,.55);white-space:nowrap">${esc(scene.label)}</div></div>` : "";
    const panelJs = free ? "" : `tl.fromTo("#s${i + 1}p",{opacity:0,y:60,scale:.82},{opacity:1,y:0,scale:1,duration:.5,ease:"back.out(1.3)"},0);` + (panelDur - 0.2 < dur ? `tl.to("#s${i + 1}p",{opacity:0,duration:.2,ease:"none"},${f2(panelDur - 0.2)});` : "");
    const labelJs = scene.label ? `tl.fromTo("#s${i + 1}r",{opacity:0,scale:.6,rotation:-4},{opacity:1,scale:1,rotation:0,duration:.4,ease:"back.out(1.7)"},0.1);` : "";
    files[`compositions/s${i + 1}.html`] = `<template>
<style>${cssBase}</style>
<div id="root" data-composition-id="s${i + 1}" data-width="${W}" data-height="${H}">
  <div id="s${i + 1}shk" style="position:absolute;inset:0">${body}${label}</div>
</div>
<script>
const tl = gsap.timeline({ paused: true });
${panelJs}${labelJs}
${rendered.map((x: any) => x.js).join("\n")}
${hitsJs(spec.hits, a, dur, { target: `#s${i + 1}shk` })}
window.__timelines["s${i + 1}"] = tl;
</script>
</template>`;
    sounds.push({ f: "pop", at: a, v: SOUND_VOL.pop });
    (scene.sounds ?? []).forEach((s: any) => { sounds.push({ f: s.f, at: f2(a + s.at), v: s.v ?? SOUND_VOL[s.f] }); assets.push(`sfx/${s.f}.wav`); });
    timings.push({ a, dur });
  });

  // ---- background: two-column terminal rising, dots and glow ----
  const bgLines = spec.backgroundLines?.length ? spec.backgroundLines : ["✓ ok"], nL = bgLines.length, stepPx = 64, cycle = 34 * stepPx;
  const rise = (y0: any, v: any, finish: any, wrapY: any, minY: any) => { // y positions of a line that rises at v px/s and reappears at the bottom at wrapY
    const keyframes = []; let y = y0, t = 0;
    while (t < D - 1e-6) {
      const distance = y - minY;
      if (distance <= 1e-6) { keyframes.push(`{y:${f2(wrapY)},duration:0}`); y = wrapY; continue; }
      const dt = Math.min(D - t, distance / v);
      keyframes.push(`{y:${f2(y - dt * v)},duration:${f2(dt)},ease:"none"}`); y -= dt * v; t += dt;
    }
    return `tl.set("#${finish}",{y:${f2(y0)}},0);tl.to("#${finish}",{keyframes:[${keyframes.join(",")}]},0);`;
  };
  const term = Array.from({ length: 34 }, (_, i) => {
    const column = (i + Math.floor(i / nL)) % 2, y0 = (((i * stepPx) % cycle) + cycle) % cycle - 160;
    return { html: `<div id="tm${i}" data-layout-ignore style="position:absolute;left:${30 + column * 420}px;top:0;font-family:${F.mono};font-weight:400;font-size:28px;color:${i % 4 === 0 ? T.accent : T.ok};white-space:nowrap">${esc(bgLines[i % nL])}</div>`, js: rise(y0, 24, `tm${i}`, cycle - 160, -160) };
  });
  const dots = Array.from({ length: 26 }, (_, i) => {
    const x = (i * 137) % W, speed = (0.35 + (i % 5) * 0.18) * 30, r = 3 + (i % 4) * 2, y0 = (i * 251) % H;
    return { html: `<div id="dt${i}" data-layout-ignore style="position:absolute;left:${x}px;top:0;width:${r}px;height:${r}px;border-radius:${r}px;background:${T.accent};opacity:${f2(0.1 + (i % 4) * 0.05)}"></div>`, js: rise(y0, speed, `dt${i}`, H, -r) };
  });
  let pulse = ""; for (let t = 0, n = 0; t < D; t += 2.3, n++) pulse += `tl.to("#gl",{opacity:${n % 2 ? 0.16 : 0.21},duration:2.3,ease:"sine.inOut"},${f2(t)});`;
  files["compositions/bg.html"] = `<template>
<style>${F.faces}
#root{position:absolute;inset:0;background:${T.background};overflow:hidden}</style>
<div id="root" data-composition-id="bg" data-width="${W}" data-height="${H}"><div id="bgw" style="position:absolute;inset:0;overflow:hidden">
<div id="gl" style="position:absolute;inset:0;opacity:.16;background:radial-gradient(ellipse at 50% 20%, ${T.accent} 0%, rgba(0,0,0,0) 55%)"></div>
<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 100%, rgba(80,60,120,.22) 0%, rgba(0,0,0,0) 60%)"></div>
<div data-layout-ignore style="position:absolute;inset:0;opacity:.09;filter:blur(1.2px)">${term.map((x) => x.html).join("")}</div>
${dots.map((x) => x.html).join("")}</div></div>
<script>
const tl=gsap.timeline({paused:true});
${pulse}${term.map((x) => x.js).join("")}${dots.map((x) => x.js).join("")}
${hitsJs(spec.hits, 0, D, { target: "#bgw" })}
window.__timelines["bg"]=tl;
</script></template>`;

  // ---- hit flash, progress bar ----
  const hasFlash = (spec.hits ?? []).some((g: any) => g.type === "flash" || g.type === "all");
  if (hasFlash) files["compositions/fx.html"] = `<template><style>#root{position:absolute;inset:0}</style><div id="root" data-composition-id="fx" data-width="${W}" data-height="${H}"><div id="fl" style="position:absolute;inset:0;background:rgb(255,244,214);opacity:0"></div></div>
<script>const tl=gsap.timeline({paused:true});
${hitsJs(spec.hits, 0, D, { flash: true })}
window.__timelines["fx"]=tl;</script></template>`;
  files["compositions/chrome.html"] = `<template><style>#root{position:absolute;inset:0}</style><div id="root" data-composition-id="chrome" data-width="${W}" data-height="${H}"><div style="position:absolute;top:0;left:0;right:0;height:10px;background:rgba(0,0,0,.4)"><div id="pg" style="width:100%;height:100%;background:${T.accent};transform-origin:left center;transform:scaleX(0)"></div></div></div>
<script>const tl=gsap.timeline({paused:true});
tl.fromTo("#pg",{scaleX:0},{scaleX:1,duration:${D},ease:"none"},0);
window.__timelines["chrome"]=tl;</script></template>`;

  // ---- word-by-word captions ----
  const px = spec.captionPx ?? 90, groups = groupWords(P);
  let freeSince = 0;
  const captionHtml: string[] = [], captionJs: string[] = [];
  groups.forEach((g, gi) => {
    const nextLen = groups[gi + 1]?.a ?? g.b + 0.4;
    const begin = Math.max(g.a - 0.05, freeSince), finish = Math.max(g.b + 0.15, Math.min(nextLen, g.b + 0.5));
    freeSince = finish;
    if (finish <= begin) return;
    captionHtml.push(`<div id="lg${gi}" style="position:absolute;left:${px < 90 ? 70 : 40}px;right:${px < 90 ? 70 : 40}px;bottom:190px;display:flex;justify-content:center;gap:${px < 90 ? 64 : 44}px;flex-wrap:wrap;opacity:0">${g.words.map((p: any, wi: any) => `<span id="lg${gi}w${wi}" style="display:inline-block;font-family:${F.title};font-weight:900;font-size:${px}px;line-height:1.05;text-transform:uppercase;color:${rgba(T.text, 0.55)};text-shadow:0 6px 0 #000, 0 0 24px rgba(0,0,0,.85), 4px 0 0 #000, -4px 0 0 #000">${esc(p.t)}</span>`).join("")}</div>`);
    const ini2 = f2(begin), e = f2(finish);
    captionJs.push(`tl.fromTo("#lg${gi}",{opacity:0,y:24},{opacity:1,y:0,duration:.2,ease:"none"},${ini2});` + g.words.map((p: any, wi: any) => {
      const next = g.words[wi + 1], wordEnd = f2(Math.min(p.b + 0.05, next ? next.a : 1e9));
      return `tl.set("#lg${gi}w${wi}",{color:"${T.accent}",scale:1.12},${f2(p.a)});tl.set("#lg${gi}w${wi}",{color:"${T.text}",scale:1},${wordEnd});`;
    }).join("") + `tl.set("#lg${gi}",{opacity:0},${e});`);
  });
  files["compositions/captions.html"] = `<template><style>${F.faces}#root{position:absolute;inset:0}</style><div id="root" data-composition-id="captions" data-width="${W}" data-height="${H}">${captionHtml.join("")}</div>
<script>const tl=gsap.timeline({paused:true});
${captionJs.join("\n")}
window.__timelines["captions"]=tl;</script></template>`;

  // ---- outro ----
  const cta = spec.outro.cta;
  files["compositions/endcard.html"] = `<template><style>${F.faces}#root{position:absolute;inset:0;background:radial-gradient(circle at 50% 40%, ${T.box} 0%, ${T.background} 72%);display:flex;flex-direction:column;justify-content:center;align-items:center;font-family:${F.title};font-weight:900;text-align:center}</style>
<div id="root" data-composition-id="endcard" data-width="${W}" data-height="${H}">
<div id="fa" style="width:420px;height:420px;border-radius:210px;overflow:hidden;border:12px solid ${T.accent};box-shadow:0 0 80px ${rgba(T.accent, 0.45)};opacity:0"><img src="assets/${T.avatar}" alt="" style="width:420px;height:420px;image-rendering:pixelated;display:block"></div>
<div id="fn" style="margin-top:46px;font-size:92px;font-weight:900;color:${T.accent};opacity:0">${esc(T.handle)}</div>
<div id="fc" style="margin-top:50px;background:${T.accent};color:${T.background};font-size:${cta.length > 18 ? 54 : 64}px;font-weight:900;padding:20px 44px;border-radius:28px;opacity:0">${esc(cta)}</div></div>
<script>const tl=gsap.timeline({paused:true});
tl.fromTo("#fa",{opacity:0,scale:.6},{opacity:1,scale:1,duration:.5,ease:"back.out(1.5)"},0);
tl.fromTo("#fn",{opacity:0,y:30},{opacity:1,y:0,duration:.5,ease:"power2.out"},.27);
tl.fromTo("#fc",{opacity:0,scale:.6},{opacity:1,scale:1,duration:.45,ease:"back.out(1.6)"},.67);
window.__timelines["endcard"]=tl;</script></template>`;

  // ---- index ----
  const host = (id: any, begin: any, dur: any, z: any, track: any, tipo = "graphics") => `  <div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${f2(begin)}" data-duration="${f2(dur)}" data-track-index="${track}" data-track-kind="${tipo}" data-width="${W}" data-height="${H}" style="z-index:${z}"></div>`;
  const hostTags = [
    host("bg", 0, D, 0, 0),
    ...spec.scenes.map((_: any, i: any) => host(`s${i + 1}`, (timings[i] as { a: number; dur: number }).a, (timings[i] as { a: number; dur: number }).dur, 10 + i, 1)),
    ...(hasFlash ? [host("fx", 0, D, 35, 2)] : []),
    host("endcard", outroAt, D - outroAt, 40, 3),
    host("captions", 0, D, 50, 4, "captions"),
    host("chrome", 0, D, 60, 5),
  ];
  const speechEnd = P.at(-1)?.b ?? D;
  const audioTags = [`  <audio id="voz" src="assets/${spec.voice}" data-start="0" data-duration="${f2(Math.min(D, speechEnd + 0.3))}" data-volume="1" data-track-index="9"></audio>`];
  sounds.forEach((s, n) => audioTags.push(`  <audio id="sfx${n}" src="assets/sfx/${s.f}.wav" data-start="${f2(s.at)}" data-duration="${SOUND_DUR[s.f]}" data-volume="${s.v}" data-track-index="${10 + (n % 3)}"></audio>`));
  audioTags.push(`  <audio id="sfxd" src="assets/sfx/ding.wav" data-start="${f2(outroAt)}" data-duration="${SOUND_DUR.ding}" data-volume="0.22" data-track-index="14"></audio>`);
  files["index.html"] = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
<style>*{margin:0;padding:0}html,body{width:${W}px;height:${H}px;overflow:hidden;background:${T.background}}#root{position:relative;width:${W}px;height:${H}px}</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${D}" data-width="${W}" data-height="${H}">
${hostTags.join("\n")}
${audioTags.join("\n")}
</div>
<script>
window.__timelines = window.__timelines || {};
window.__timelines["main"] = gsap.timeline({ paused: true });
</script>
</body>
</html>`;
  return { files, assets, durS: D, width: W, height: H, scenes: spec.scenes.length };
}

import { useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, Sequence, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS, fontFilesOf, useSkin, useTheme } from "@praeko/studio-core";
import type { EpisodeData, SceneStage, SkinStage, Theme } from "@praeko/studio-core";
import type * as Three from "three";

/* ============ 3D stage of the 3D skins (path A').
   The scene panel (the SAME kit DOM: the items of the YAML) is rasterized every frame (SVG foreignObject → image → canvas) and used as the
   texture of the front face of a slab, inside a three.js stage: floor, wall, generic props, studio light, soft shadow, a camera shot per scene.
   Everything is a function of (scene index, t): no clock, no unseeded randomness. Materials, light, floor and props come from `skin.stage`.
   three.js is loaded on demand (dynamic import), so projects that never use a 3D skin do not load it. ============ */

type THREE = typeof Three;
let threeModule: Promise<THREE> | null = null;
const loadThree = (): Promise<THREE> => (threeModule ??= import("three"));

const PANEL_W = 940, PANEL_H = 1000;          // px of the kit's panel (the face texture)
const SLAB_W = 4.7, SLAB_H = 5.0, SLAB_D = 0.55; // world units (0.005 per px)
const FLOOR_Y = -3.4;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const easeInOut = (x: number) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const backOut = (x: number, c1 = 1.9) => { const c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const hash = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const deg = (d: number) => (d * Math.PI) / 180;

/** Camera shots per scene, cycled by scene index: azimuth, elevation (deg), distance, drift (deg over the scene). */
const SHOTS = [
  { az: 0, el: 10, r: 14.2, drift: 5 },
  { az: -24, el: 6, r: 14.6, drift: 6 },
  { az: 20, el: 16, r: 14.4, drift: -6 },
  { az: -12, el: -3, r: 14.8, drift: 7 },
  { az: 26, el: 5, r: 14.6, drift: -5 },
  { az: 0, el: 20, r: 14.3, drift: 4 },
];

function roundedBox(T3: THREE, w: number, h: number, d: number, r: number): Three.BufferGeometry {
  const s = new T3.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const bev = Math.min(0.18, d * 0.4);
  const g = new T3.ExtrudeGeometry(s, { depth: d - 2 * bev, bevelEnabled: true, bevelSize: bev, bevelThickness: bev, bevelSegments: 6, curveSegments: 10 });
  g.center(); g.computeVertexNormals();
  return g;
}

type World = { render: (t: number, scenes: { a: number; b: number }[]) => void; dispose: () => void };

function makeWorld(T3: THREE, canvas: HTMLCanvasElement, face: HTMLCanvasElement, width: number, height: number, T: Theme, st: SkinStage): World {
  const disposables: { dispose: () => void }[] = [];
  const keep = <X extends { dispose: () => void }>(x: X): X => { disposables.push(x); return x; };
  const renderer = new T3.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.setPixelRatio(1); renderer.setSize(width, height, false);
  renderer.outputColorSpace = T3.SRGBColorSpace;
  renderer.toneMapping = T3.ACESFilmicToneMapping; renderer.toneMappingExposure = st.exposure;
  renderer.shadowMap.enabled = st.shadows; renderer.shadowMap.type = T3.PCFSoftShadowMap;

  const scene = new T3.Scene();
  const bg = new T3.Color(T.background);
  scene.background = bg;
  if (st.fog) scene.fog = new T3.Fog(bg, st.fog[0], st.fog[1]);
  const camera = new T3.PerspectiveCamera(40, width / height, 0.1, 200);

  // seeded bump noise (clay)
  const N = 128, data = new Uint8Array(N * N * 4);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < N * N; i++) { const n = Math.floor((0.5 + 0.5 * rnd()) * 255); data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = n; data[i * 4 + 3] = 255; }
  const noise = keep(new T3.DataTexture(data, N, N, T3.RGBAFormat)); noise.wrapS = noise.wrapT = T3.RepeatWrapping; noise.repeat.set(4, 4); noise.needsUpdate = true;

  /** The skin's material in a color: clay (matte, bumpy), plastic (glossy), neon (unlit dark body; edges glow) or pbr (cinema). */
  const material = (color: string, surface = false): Three.Material => keep(
    st.material === "clay" ? new T3.MeshStandardMaterial({ color, roughness: surface ? 1 : 0.9, metalness: 0, bumpMap: noise, bumpScale: surface ? 0.3 : 0.6 })
      : st.material === "plastic" ? new T3.MeshPhysicalMaterial({ color, roughness: surface ? 0.8 : 0.32, metalness: 0, clearcoat: surface ? 0 : 0.6, clearcoatRoughness: 0.25 })
        : st.material === "neon" ? new T3.MeshBasicMaterial({ color: surface ? T.background : T.box })
          : new T3.MeshStandardMaterial({ color, roughness: surface ? 0.95 : 0.55, metalness: surface ? 0 : 0.1 }),
  );
  const mesh = (g: Three.BufferGeometry, m: Three.Material, glowEdges?: string): Three.Mesh => {
    keep(g);
    const o = new T3.Mesh(g, m); o.castShadow = st.shadows; o.receiveShadow = st.shadows;
    if (glowEdges) { const e = keep(new T3.EdgesGeometry(g, 30)); o.add(new T3.LineSegments(e, keep(new T3.LineBasicMaterial({ color: glowEdges })))); }
    return o;
  };

  // light: hemisphere + key with soft shadow + fill + rim
  const L = st.lights;
  scene.add(new T3.HemisphereLight(L.hemiSky, L.hemiGround, L.hemi));
  const key = new T3.DirectionalLight(L.keyColor, L.key);
  key.position.set(5, 11, 9); key.castShadow = st.shadows; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 0.5, far: 40 });
  key.shadow.radius = 8; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
  scene.add(key);
  const fill = new T3.DirectionalLight(L.fillColor, L.fill); fill.position.set(-8, 3, 6); scene.add(fill);
  const rim = new T3.DirectionalLight(L.rimColor, L.rim); rim.position.set(-4, 6, -9); scene.add(rim);

  // floor
  if (st.floor === "sweep") {
    const floor = mesh(new T3.PlaneGeometry(200, 200), material(T.background, true));
    floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y; floor.castShadow = false; scene.add(floor);
    const wall = mesh(new T3.PlaneGeometry(200, 60), material(T.background, true));
    wall.position.set(0, 20, -9); wall.castShadow = false; scene.add(wall);
  } else if (st.floor === "grid") {
    const grid = new T3.GridHelper(240, 120, T.accent, T.info);
    grid.position.y = FLOOR_Y; (grid.material as Three.Material).transparent = true; (grid.material as Three.Material).opacity = 0.8; keep(grid.geometry); keep(grid.material as Three.Material); scene.add(grid);
    const base = mesh(new T3.PlaneGeometry(240, 240), keep(new T3.MeshBasicMaterial({ color: "#05010f" })));
    base.rotation.x = -Math.PI / 2; base.position.y = FLOOR_Y - 0.01; scene.add(base);
  }
  if (st.sun) { // striped synthwave sun on the horizon (canvas texture: a gradient disc with horizontal gaps)
    const c = document.createElement("canvas"); c.width = c.height = 512;
    const g = c.getContext("2d")!, grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, T.extra); grad.addColorStop(0.55, T.accent); grad.addColorStop(1, "#7a1fa2");
    g.fillStyle = grad; g.beginPath(); g.arc(256, 256, 250, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = "destination-out";
    for (let k = 0; k < 7; k++) { const y = 300 + k * 30, h = 4 + k * 3; g.fillRect(0, y, 512, h); }
    const tex = keep(new T3.CanvasTexture(c)); tex.colorSpace = T3.SRGBColorSpace;
    const sun = new T3.Mesh(keep(new T3.PlaneGeometry(26, 26)), keep(new T3.MeshBasicMaterial({ map: tex, transparent: true, fog: false })));
    sun.position.set(0, 4, -60); scene.add(sun);
  }

  // the slab: the kit's panel lives on its front face
  const slab = new T3.Group(); scene.add(slab);
  const edge = st.material === "neon" ? T.info : undefined;
  slab.add(mesh(roundedBox(T3, SLAB_W, SLAB_H, SLAB_D, 0.32), material(T.box), edge));
  const faceTex = keep(new T3.CanvasTexture(face)); faceTex.colorSpace = T3.SRGBColorSpace; faceTex.anisotropy = 8;
  // the face is lit by the stage; `faceLight` adds the panel's own light (the texture as emissive) so text stays readable in low-key light
  const faceMat = keep(st.material === "neon" ? new T3.MeshBasicMaterial({ map: faceTex, transparent: true })
    : new T3.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: 0.85, ...(st.faceLight ? { emissive: new T3.Color("#ffffff"), emissiveMap: faceTex, emissiveIntensity: st.faceLight } : {}) }));
  const faceMesh = new T3.Mesh(keep(new T3.PlaneGeometry(SLAB_W, SLAB_H)), faceMat); faceMesh.receiveShadow = st.shadows; faceMesh.position.z = SLAB_D / 2 + 0.004; slab.add(faceMesh);
  if (st.studs) { // building-block studs on top of the slab
    const stud = keep(new T3.CylinderGeometry(0.17, 0.17, 0.14, 24));
    for (let k = 0; k < 8; k++) for (const z of [-0.12, 0.12]) { const s = new T3.Mesh(stud, material(T.box)); s.position.set(-SLAB_W / 2 + 0.3 + k * ((SLAB_W - 0.6) / 7), SLAB_H / 2 + 0.07, z); s.castShadow = st.shadows; slab.add(s); }
  }

  // generic props (deterministic per scene), in the palette, beside and behind the slab
  const palette = [T.accent, T.ok, T.info, T.extra, T.error];
  const geos: Three.BufferGeometry[] = st.studs
    ? [new T3.BoxGeometry(1.2, 0.5, 0.6), new T3.BoxGeometry(0.6, 0.5, 0.6), new T3.BoxGeometry(1.8, 0.5, 0.6)]
    : [new T3.SphereGeometry(0.55, 32, 20), new T3.TorusGeometry(0.5, 0.2, 20, 40), new T3.CapsuleGeometry(0.35, 0.8, 10, 24), new T3.ConeGeometry(0.55, 1.1, 32), new T3.BoxGeometry(0.9, 0.9, 0.9)];
  geos.forEach(keep);
  const mats = palette.map((c) => (st.material === "neon" ? keep(new T3.MeshBasicMaterial({ color: "#0a0216" })) : material(c)));
  const props = Array.from({ length: st.props }, (_, k) => {
    const g = geos[k % geos.length]!, o = new T3.Mesh(g, mats[k % mats.length]!); o.castShadow = o.receiveShadow = st.shadows;
    if (st.material === "neon") o.add(new T3.LineSegments(keep(new T3.EdgesGeometry(g, 30)), keep(new T3.LineBasicMaterial({ color: palette[k % palette.length] }))));
    if (st.studs) { const p = (g as Three.BoxGeometry).parameters, stud = keep(new T3.CylinderGeometry(0.15, 0.15, 0.12, 20)); for (let x = -p.width / 2 + 0.3; x < p.width / 2; x += 0.6) { const s = new T3.Mesh(stud, mats[k % mats.length]!); s.position.set(x, p.height / 2 + 0.06, 0); s.castShadow = st.shadows; o.add(s); } }
    scene.add(o); return o;
  });
  const propSlot = (sceneIdx: number, k: number) => {
    const h = (n: number) => hash(sceneIdx * 31 + k * 7 + n), side = k % 2 ? 1 : -1, behind = k >= 4;
    // the 9:16 frame is narrow (about ±2.9 units at the slab): side props peek out from behind the slab's edges, the others float higher behind it
    return { x: behind ? (h(1) - 0.5) * 5 : side * (2.3 + h(2) * 0.7), y: behind ? 2.2 + h(3) * 2.2 : FLOOR_Y + 0.7 + h(4) * 5, z: behind ? -2.5 - h(5) * 3 : -1.0 - h(6) * 1.2, s: 0.6 + h(7) * 0.7, rot: h(8) * 6.28 };
  };
  const bouncy = st.material === "clay" || st.material === "plastic";

  function render(t: number, scenes: { a: number; b: number }[]) {
    let i = 0;
    for (let k = 0; k < scenes.length; k++) if (t >= scenes[k]!.a) i = k;
    const sc = scenes[i] ?? { a: 0, b: 1 }, local = t - sc.a;
    // slab: in with a bounce (clay, plastic) or a smooth push (neon, cinema); out with a squash
    const inK = bouncy ? backOut(clamp01(local / 0.5)) : easeInOut(clamp01(local / 0.6)), outK = smooth(sc.b - 0.25, sc.b + 0.05, t);
    const sx = 0.6 + 0.4 * inK + 0.06 * outK, sy = (0.6 + 0.4 * inK) * (1 - 0.5 * outK);
    slab.scale.set(sx, sy, 1);
    slab.position.set(0, 0.2 - 1.2 * outK + 0.06 * Math.sin(t * 1.3), 0);
    slab.rotation.set(deg(-3 * (1 - inK)), deg(8 * (1 - inK)) + deg(1.2 * Math.sin(t * 0.9)), 0);
    props.forEach((o, k) => {
      const p = propSlot(i, k), pin = (bouncy ? backOut(clamp01((local - 0.15 - k * 0.07) / 0.5)) : easeInOut(clamp01((local - 0.15 - k * 0.07) / 0.6))) * (1 - outK);
      o.position.set(p.x, p.y + 0.12 * Math.sin(t * 1.6 + k), p.z);
      o.rotation.set(p.rot + t * 0.3, p.rot * 0.5 + t * 0.4, 0);
      o.scale.setScalar(Math.max(0.0001, p.s * pin));
    });
    // camera: the scene's shot plus a drift, blended at the cut
    const shotAt = (j: number, tt: number) => {
      const S = SHOTS[j % SHOTS.length]!, w = scenes[j] ?? sc, k = clamp01((tt - w.a) / Math.max(1, w.b - w.a));
      const az = deg(S.az + S.drift * k), el = deg(S.el), r = S.r - 0.6 * k, Tg = new T3.Vector3(0, -0.55, 0);
      return { pos: new T3.Vector3(Tg.x + Math.sin(az) * Math.cos(el) * r, Tg.y + Math.sin(el) * r, Tg.z + Math.cos(az) * Math.cos(el) * r), T: Tg };
    };
    let cam = shotAt(i, t);
    const BL = 0.7;
    if (i > 0 && local < BL) { const prev = shotAt(i - 1, t), k = easeInOut(local / BL); cam = { pos: prev.pos.clone().lerp(cam.pos, k), T: prev.T.clone().lerp(cam.T, k) }; }
    camera.position.copy(cam.pos); camera.lookAt(cam.T); camera.updateMatrixWorld(true);
    scene.updateMatrixWorld(true);
    faceTex.needsUpdate = true;
    renderer.render(scene, camera);
  }
  return { render, dispose: () => { disposables.forEach((d) => d.dispose()); renderer.dispose(); } };
}

/**
 * The panel DOM as an image (SVG foreignObject). An SVG image cannot load external files, so every <img> in the panel (the frames of
 * `window`/`phone` videos, which Remotion draws as images, and any picture) is waited for and inlined as a data URL first, at twice its
 * displayed size (the face texture is 2x). Fonts are embedded through `fontCss`.
 */
async function rasterize(root: HTMLElement, fontCss: string): Promise<HTMLImageElement> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(imgs.map((im) => (im.complete && im.naturalWidth ? null : new Promise<void>((ok) => { im.addEventListener("load", () => ok(), { once: true }); im.addEventListener("error", () => ok(), { once: true }); }))));
  const clone = root.cloneNode(true) as HTMLElement, copies = Array.from(clone.querySelectorAll("img"));
  imgs.forEach((im, k) => {
    const c = copies[k];
    if (!c || !im.naturalWidth) return;
    const w = Math.max(1, Math.round((im.offsetWidth || im.naturalWidth) * 2)), h = Math.max(1, Math.round((im.offsetHeight || im.naturalHeight) * 2));
    const cv = document.createElement("canvas"); cv.width = Math.min(w, im.naturalWidth); cv.height = Math.min(h, im.naturalHeight);
    try { cv.getContext("2d")!.drawImage(im, 0, 0, cv.width, cv.height); c.setAttribute("src", cv.toDataURL(cv.width * cv.height > 400_000 ? "image/jpeg" : "image/png", 0.9)); }
    catch (e) { console.warn("[3d stage] an image could not be copied into the panel", e); }
  });
  const xml = new XMLSerializer().serializeToString(clone);
  const out = new Image();
  await new Promise<void>((ok, ko) => { out.onload = () => ok(); out.onerror = (e) => ko(e); out.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${PANEL_W}" height="${PANEL_H}">${fontCss ? `<style>${fontCss}</style>` : ""}<foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`); });
  return out;
}

const NOISE = `url("data:image/svg+xml;utf8,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='220' height='220' filter='url(#n)'/></svg>")}")`;

/** The stage of 3D skins: replaces the flat background and scenes; label, captions and progress bar stay flat on top (drawn by the Episode). */
export const SlabStage: SceneStage = ({ d }: { d: EpisodeData }) => {
  const T = useTheme(), st = useSkin().stage!;
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const domRef = useRef<HTMLDivElement>(null);
  const [face] = useState(() => { const c = document.createElement("canvas"); c.width = PANEL_W * 2; c.height = PANEL_H * 2; return c; });
  const [three, setThree] = useState<THREE | null>(null);
  const [loading] = useState(() => delayRender("three.js"));
  const skin = useSkin();
  // fonts loaded with FontFace do not reach an SVG image: embed the files (base64) in the rasterized panel
  const [fontCss, setFontCss] = useState<string | null>(null);
  useLayoutEffect(() => {
    const files = fontFilesOf(skin, T);
    Promise.all(files.map(async (x) => {
      const buf = new Uint8Array(await (await fetch(staticFile(x.src))).arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return `@font-face{font-family:"${x.family}";src:url(data:font/${/\.otf$/i.test(x.src) ? "otf" : /\.woff2$/i.test(x.src) ? "woff2" : "ttf"};base64,${btoa(bin)})}`;
    })).then((css) => setFontCss(css.join(""))).catch((e) => { console.error("[3d stage] font files", e); setFontCss(""); });
  }, [skin, T]);
  const world = useRef<World | null>(null);
  const loaded = useRef(false);
  /** The load handle is released only once a frame handle exists (or loading failed), so Remotion never shoots an empty stage. */
  const releaseLoading = () => { if (!loaded.current) { loaded.current = true; continueRender(loading); } };
  useLayoutEffect(() => { loadThree().then(setThree).catch((e) => { console.error("[3d stage] three.js did not load", e); releaseLoading(); }); }, [loading]);
  const ready = three !== null && fontCss !== null;
  useLayoutEffect(() => {
    if (!three || !canvasRef.current) return;
    world.current = makeWorld(three, canvasRef.current, face, width, height, T, st);
    return () => { world.current?.dispose(); world.current = null; };
  }, [three, width, height, T, st, face]);
  // The face is rasterized again whenever the panel DOM changes: on each frame (this component re-renders) AND when a part changes on its own
  // (a text that shrinks to fit, the frame image of a `window` video that arrives later). A MutationObserver catches the latter. One render
  // handle is held while any rasterization is pending; only the newest run draws, and it releases the handle.
  const latest = useRef({ frame, scenes: d.scenes, fontCss: fontCss ?? "" });
  latest.current = { frame, scenes: d.scenes, fontCss: fontCss ?? "" };
  const run = useRef(0), pending = useRef<number | null>(null);
  const schedule = () => {
    const root = domRef.current;
    if (!root) return;
    const my = ++run.current;
    if (pending.current === null) pending.current = delayRender("3d stage frame");
    releaseLoading();
    const finish = () => { if (my !== run.current) return; const h = pending.current; pending.current = null; if (h !== null) continueRender(h); };
    rasterize(root, latest.current.fontCss).then((img) => {
      if (my !== run.current) return;
      const ctx = face.getContext("2d")!;
      ctx.clearRect(0, 0, face.width, face.height);
      ctx.drawImage(img, 0, 0, face.width, face.height);
      world.current?.render(latest.current.frame / FPS, latest.current.scenes);
      finish();
    }).catch((e) => { console.error("[3d stage] the panel could not be rasterized", e); world.current?.render(latest.current.frame / FPS, latest.current.scenes); finish(); });
  };
  useLayoutEffect(() => { if (ready) schedule(); });
  useLayoutEffect(() => {
    if (!ready || !domRef.current) return;
    const mo = new MutationObserver(() => schedule());
    mo.observe(domRef.current, { subtree: true, childList: true, attributes: true, characterData: true });
    return () => { mo.disconnect(); run.current++; if (pending.current !== null) { continueRender(pending.current); pending.current = null; } };
  }, [ready]);
  const f = (s: number) => Math.round(s * FPS);
  const o = st.overlay;
  return (
    <AbsoluteFill>
      {/* the panel DOM, laid out but invisible: only its rasterized copy shows, on the slab */}
      <div style={{ position: "absolute", left: 0, top: 0, width: PANEL_W, height: PANEL_H, opacity: 0, pointerEvents: "none" }}>
        <div ref={domRef} style={{ width: PANEL_W, height: PANEL_H, position: "relative", fontFamily: T.font, color: T.text }}>
          {d.scenes.map((c, i) => (
            <Sequence key={i} from={f(c.a)} durationInFrames={f(c.b - c.a)} layout="none"><c.C dur={c.b - c.a} /></Sequence>
          ))}
        </div>
      </div>
      <canvas ref={canvasRef} width={width} height={height} style={{ position: "absolute", inset: 0, width, height }} />
      {o?.vignette ? <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, rgba(0,0,0,${o.vignette}) 100%)` }} /> : null}
      {o?.grain ? <AbsoluteFill style={{ backgroundImage: NOISE, opacity: o.grain * 4, mixBlendMode: "overlay", backgroundPosition: `${Math.floor(hash(frame) * 220)}px ${Math.floor(hash(frame + 0.5) * 220)}px` }} /> : null}
    </AbsoluteFill>
  );
};

import { AbsoluteFill, Audio, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Word } from "./word.ts";
import { rgba } from "./theme.ts";
import { useTheme } from "./theme-context.tsx";
import { FPS, norm } from "./util.ts";

/**
 * LONG ENGINE (16:9, several minutes). A long video is a list of scenes in GLOBAL time: each scene receives `t` (s since the start of the video)
 * and ties itself to the voice with `makeAtGlobal(WORDS)(phrase, nth, from)`. The engine handles the background, the voice, the scene header (number + title),
 * grouped captions and the progress bar. Scenes are project TSX, built with the parts of `@praeko/studio-kit`.
 */
export type LongScene = { n: string; title: string; a: number; b: number; C: React.FC<{ t: number }> };
/** Optional end card: avatar, text (e.g. the signature), brand handle and link. Starts at `a` (s) and stays until the end. */
export type LongEndcard = { a: number; text?: string; link?: string; image?: string };
export type LongData = { id: string; durS: number; voice: string; words: Word[]; scenes: LongScene[]; width?: number; height?: number; endcard?: LongEndcard };

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
/** Fades in and out over `d` s at the ends of the window [a, b]. */
export const fadeWindow = (t: number, a: number, b: number, d = 0.4) => interpolate(t, [a, a + d, b - d, b], [0, 1, 1, 0], clamp);

/** Global anchor: `at("phrase", nth, from)` = instant (s) at which the phrase starts; `from` ignores occurrences before `from` s. Fails loudly if not found. */
export const makeAtGlobal = (P: Word[]) => {
  const W = P.map((p) => norm(p.t));
  return (phrase: string, nth = 0, from = 0): number => {
    const f = phrase.split(/\s+/).map(norm).filter(Boolean);
    let c = 0;
    for (let i = 0; i <= W.length - f.length; i++) {
      if (P[i].a < from) continue;
      if (f.every((w, k) => W[i + k] === w)) { if (c === nth) return P[i].a; c++; }
    }
    throw new Error("phrase not found: " + phrase);
  };
};

const SceneFrame: React.FC<{ t: number; a: number; b: number; n: string; title: string; children: React.ReactNode }> = ({ t, a, b, n, title, children }) => {
  const T = useTheme();
  if (t < a - 0.1 || t > b + 0.1) return null;
  return (
    <AbsoluteFill style={{ opacity: fadeWindow(t, a, b) }}>
      <div style={{ position: "absolute", left: 100, top: 46, display: "flex", alignItems: "center", gap: 18, fontFamily: T.font, fontSize: 30, letterSpacing: 4, color: T.accent, whiteSpace: "nowrap" }}>
        <span style={{ background: T.accent, color: T.background, borderRadius: 12, padding: "4px 16px" }}>{n}</span>
        {title}
      </div>
      {children}
    </AbsoluteFill>
  );
};

const splitGroups = (P: Word[]) => {
  const g: Word[][] = [];
  let cur: Word[] = [];
  P.forEach((p) => {
    cur.push(p);
    if (/[.!?:]$/.test(p.t) || cur.length >= 8 || (/[,;]$/.test(p.t) && cur.length >= 5)) { g.push(cur); cur = []; }
  });
  if (cur.length) g.push(cur);
  return g;
};

const Captions: React.FC<{ t: number; G: Word[][] }> = ({ t, G }) => {
  const T = useTheme();
  let group: Word[] | null = null;
  for (const g of G) if (t >= g[0].a - 0.05 && t <= g[g.length - 1].b + 0.4) group = g;
  if (!group) return null;
  return (
    <div style={{ position: "absolute", left: 160, right: 160, bottom: 56, textAlign: "center", fontFamily: T.font, fontSize: 46, lineHeight: 1.2, textShadow: "0 3px 12px rgba(0,0,0,.9)" }}>
      {group.map((p, i) => (
        <span key={i} style={{ color: t >= p.a && t < p.b + 0.05 ? T.accent : T.text }}>{p.t}{i < group!.length - 1 ? " " : ""}</span>
      ))}
    </div>
  );
};

const EndcardScreen: React.FC<{ f: LongEndcard; t: number }> = ({ f, t }) => {
  const T = useTheme();
  const { fps } = useVideoConfig();
  const k = (delay: number) => spring({ frame: (t - f.a - delay) * fps, fps, config: { damping: 14, stiffness: 140 } });
  const op = interpolate(t, [f.a, f.a + 0.5], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ opacity: op, background: `radial-gradient(circle at 50% 40%, ${T.box} 0%, ${T.background} 75%)`, alignItems: "center", justifyContent: "center", fontFamily: T.font, textAlign: "center", paddingBottom: 90 }}>
      <div style={{ width: 230, height: 230, borderRadius: 44, overflow: "hidden", border: `8px solid ${f.image ? "#3a3566" : T.accent}`, background: f.image ? "#1c1a33" : undefined, boxShadow: `0 0 70px ${rgba(T.accent, 0.3)}`, transform: `scale(${0.6 + 0.4 * k(0)})`, opacity: Math.min(1, k(0) * 1.5) }}>
        <Img src={staticFile(f.image ?? T.avatar)} style={{ width: 230, height: 230, imageRendering: "pixelated", objectFit: "contain" }} />
      </div>
      {f.text ? <div style={{ marginTop: 44, fontSize: 104, fontWeight: 900, color: T.accent, opacity: Math.max(0, k(0.15)), transform: `translateY(${(1 - Math.max(0, k(0.15))) * 24}px)` }}>{f.text}</div> : null}
      <div style={{ marginTop: 28, fontSize: 54, fontWeight: 900, color: T.text, opacity: Math.max(0, k(0.3)) }}>{T.handle}</div>
      {f.link ? <div style={{ marginTop: 18, fontSize: 38, fontFamily: T.mono, color: T.muted, opacity: Math.max(0, k(0.45)) }}>{f.link}</div> : null}
    </AbsoluteFill>
  );
};

export const Long: React.FC<{ d: LongData }> = ({ d }) => {
  const T = useTheme();
  const t = useCurrentFrame() / FPS;
  const G = splitGroups(d.words);
  return (
    <AbsoluteFill style={{ background: T.background, color: T.text, fontFamily: T.font }}>
      <AbsoluteFill style={{ background: `radial-gradient(1200px 700px at 70% 20%, ${rgba(T.accent, 0.07)}, transparent 70%)` }} />
      <Audio src={staticFile(d.voice)} />
      {d.scenes.map((c) => (
        <SceneFrame key={c.n} t={t} a={c.a} b={c.b} n={c.n} title={c.title}>
          <c.C t={t} />
        </SceneFrame>
      ))}
      {d.endcard && t >= d.endcard.a ? <EndcardScreen f={d.endcard} t={t} /> : null}
      <Captions t={t} G={G} />
      <div style={{ position: "absolute", left: 0, top: 0, height: 8, width: `${(t / d.durS) * 100}%`, background: T.accent }} />
    </AbsoluteFill>
  );
};

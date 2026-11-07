import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Word } from "./word.ts";
import { rgba } from "./theme.ts";
import { useTheme } from "./theme-context.tsx";
import { FPS } from "./util.ts";

/**
 * PRAEKO STUDIO ENGINE.
 * An episode is just data (EpisodeData): voice, timed words, scenes (card + label + sounds) and outro.
 * The rest (background, captions, progress bar, outro, effects) is shared and uses the brand theme.
 */

export type Sound = { at: number; sound: "pop" | "ding" | "thump" | "whoosh"; v?: number };

export type Hit = { at: number; type: "shake" | "zoom" | "flash" | "all" };

export type EpisodeScene = {
  a: number;
  b: number;
  C: React.FC<{ dur: number }>;
  label?: string;
  /** sounds relative to the start of the scene (s) */
  sounds?: Sound[];
};

export type EpisodeData = {
  id: string;
  durS: number;
  voice: string;
  words: Word[];
  scenes: EpisodeScene[];
  outro: { a: number; cta: string };
  /** blurred "terminal" lines in the background */
  backgroundLines?: string[];
  /** caption size (default 90) */
  captionPx?: number;
  /** editing hits: quick shake, flash and zoom at instants (s) of the narration */
  hits?: Hit[];
};


const f = (s: number) => Math.round(s * FPS);
const DUR_SOM: Record<Sound["sound"], number> = { pop: 0.16, ding: 0.9, thump: 0.4, whoosh: 0.55 };
const VOL_SOM: Record<Sound["sound"], number> = { pop: 0.22, ding: 0.26, thump: 0.33, whoosh: 0.28 };


export const Label: React.FC<{ text: string }> = ({ text }) => {
  const { accent: LAMP, background: BG, text: INK, font: FONT, ok: OK, box: BOX } = useTheme();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - 3, fps, config: { damping: 11, stiffness: 200 } });
  return (
    <div
      style={{
        position: "absolute",
        top: 70,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        transform: `scale(${0.6 + 0.4 * pop}) rotate(${(1 - pop) * -4}deg)`,
        opacity: Math.min(1, pop * 1.5),
      }}
    >
      <div
        style={{
          background: LAMP,
          color: BG,
          fontFamily: FONT,
          fontSize: 62,
          fontWeight: 900,
          letterSpacing: 1,
          padding: "14px 36px",
          borderRadius: 22,
          boxShadow: "0 10px 30px rgba(0,0,0,.55)",
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
    </div>
  );
};


/** Clean background: dark, a pulsing amber glow and dots drifting up slowly. */
export const Background: React.FC = () => {
  const { accent: LAMP, background: BG, text: INK, font: FONT, ok: OK, box: BOX } = useTheme();
  const frame = useCurrentFrame();
  const pulse = 0.16 + 0.05 * Math.sin(frame / 22);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 20%, ${rgba(LAMP, pulse)} 0%, ${rgba(LAMP, 0)} 55%), radial-gradient(ellipse at 50% 100%, rgba(80,60,120,.22) 0%, rgba(0,0,0,0) 60%), ${BG}`,
      }}
    >
      {Array.from({ length: 26 }).map((_, i) => {
        const x = (i * 137) % 1080;
        const vel = 0.35 + (i % 5) * 0.18;
        const y = (((i * 251) % 1920) - frame * vel + 1920 * 4) % 1920;
        const r = 3 + (i % 4) * 2;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: r,
              height: r,
              borderRadius: r,
              background: LAMP,
              opacity: 0.1 + (i % 4) * 0.05,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};


export type Group = { words: Word[]; a: number; b: number };

export const groupWords = (ps: Word[]): Group[] => {
  const g: Group[] = [];
  let cur: Word[] = [];
  const close = () => {
    if (cur.length) g.push({ words: cur, a: cur[0].a, b: cur[cur.length - 1].b });
    cur = [];
  };
  ps.forEach((p, i) => {
    cur.push(p);
    const gap = i < ps.length - 1 ? ps[i + 1].a - p.b : 1;
    const letters = cur.reduce((n, x) => n + x.t.length, 0);
    const next = ps[i + 1]?.t.length ?? 0;
    if (/[.,?!:]$/.test(p.t) || cur.length >= 3 || letters + next > 15 || gap > 0.3) close();
  });
  close();
  return g;
};


const TerminalBackground: React.FC<{ lines: string[] }> = ({ lines }) => {
  const { accent: LAMP, ok: OK } = useTheme();
  const frame = useCurrentFrame();
  // 34 lines of code in small mono, two columns, rising slowly.
  // With few lines the list repeats, switching column on each loop, so no pattern forms.
  const n = Math.max(1, lines.length);
  const step = 64, cycle = 34 * step + 0;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Background />
      <div style={{ position: "absolute", inset: 0, opacity: 0.09, filter: "blur(1.2px)" }}>
        {Array.from({ length: 34 }).map((_, i) => {
          const y = ((((i * step - frame * 0.8) % cycle) + cycle) % cycle) - 160;
          const col = (i + Math.floor(i / n)) % 2;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 30 + col * 420,
                top: y,
                fontFamily: "Menlo, 'Courier New', monospace",
                fontSize: 28,
                color: i % 4 === 0 ? LAMP : OK,
                whiteSpace: "nowrap",
              }}
            >
              {lines[i % n]}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const CaptionEp: React.FC<{ words: Word[]; bottom: number; px?: number }> = ({ words, bottom, px = 90 }) => {
  const { accent: LAMP, background: BG, text: INK, font: FONT, ok: OK, box: BOX } = useTheme();
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const groups = groupWords(words);
  const idx = groups.findIndex((g, i) => {
    const next = groups[i + 1]?.a ?? g.b + 0.4;
    return t >= g.a - 0.05 && t < Math.max(g.b + 0.15, Math.min(next, g.b + 0.5));
  });
  if (idx < 0) return null;
  const g = groups[idx];
  const inside = frame - f(g.a);
  const enter = interpolate(inside, [-2, 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: px < 90 ? 70 : 40,
        right: px < 90 ? 70 : 40,
        bottom,
        display: "flex",
        justifyContent: "center",
        gap: px < 90 ? 64 : 44,
        flexWrap: "wrap",
        opacity: enter,
        transform: `translateY(${(1 - enter) * 24}px)`,
      }}
    >
      {g.words.map((p, i) => {
        const active = t >= p.a && t < p.b + 0.05;
        const spoken = t >= p.a;
        return (
          <span
            key={i}
            style={{
              fontFamily: FONT,
              fontWeight: 900,
              fontSize: px,
              lineHeight: 1.05,
              textTransform: "uppercase",
              color: active ? LAMP : spoken ? INK : rgba(INK, 0.55),
              transform: `scale(${active ? 1.12 : 1})`,
              textShadow: "0 6px 0 #000, 0 0 24px rgba(0,0,0,.85), 4px 0 0 #000, -4px 0 0 #000",
            }}
          >
            {p.t}
          </span>
        );
      })}
    </div>
  );
};

const OutroEp: React.FC<{ cta: string }> = ({ cta }) => {
  const theme = useTheme();
  const { accent: LAMP, background: BG, text: INK, font: FONT, ok: OK, box: BOX } = useTheme();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame, fps, config: { damping: 10, stiffness: 150 } });
  const handleSpring = spring({ frame: frame - 8, fps, config: { damping: 200 } });
  const pill = spring({ frame: frame - 20, fps, config: { damping: 12, stiffness: 160 } });
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 40%, ${BOX} 0%, ${BG} 72%)`,
        justifyContent: "center",
        alignItems: "center",
        fontFamily: FONT,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 420,
          height: 420,
          borderRadius: 210,
          overflow: "hidden",
          border: `12px solid ${LAMP}`,
          boxShadow: `0 0 80px ${rgba(LAMP, 0.45)}`,
          transform: `scale(${0.6 + 0.4 * logo})`,
          opacity: Math.min(1, logo * 1.5),
        }}
      >
        <Img src={staticFile(theme.avatar)} style={{ width: 420, height: 420, imageRendering: "pixelated" }} />
      </div>
      <div
        style={{
          marginTop: 46,
          fontSize: 92,
          fontWeight: 900,
          color: LAMP,
          opacity: Math.max(0, handleSpring),
          transform: `translateY(${(1 - Math.max(0, handleSpring)) * 30}px)`,
        }}
      >
        {theme.handle}
      </div>
      <div
        style={{
          marginTop: 50,
          background: LAMP,
          color: BG,
          fontSize: cta.length > 18 ? 54 : 64,
          fontWeight: 900,
          padding: "20px 44px",
          borderRadius: 28,
          opacity: Math.max(0, pill),
          transform: `scale(${0.6 + 0.4 * Math.max(0, pill)})`,
        }}
      >
        {cta}
      </div>
    </AbsoluteFill>
  );
};

const ProgressBar: React.FC<{ durS: number }> = ({ durS }) => {
  const { accent: LAMP, background: BG, text: INK, font: FONT, ok: OK, box: BOX } = useTheme();
  const frame = useCurrentFrame();
  const w = Math.min(100, (frame / f(durS)) * 100);
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 10, background: "rgba(0,0,0,.4)" }}>
      <div style={{ width: `${w}%`, height: "100%", background: LAMP }} />
    </div>
  );
};

/** Short shake, zoom and flash (0.45 s) at the marked instants; moves only the background and scenes, never the captions. */
const Hits: React.FC<{ hits: Hit[]; children: React.ReactNode }> = ({ hits, children }) => {
  const t = useCurrentFrame() / FPS;
  let sx = 0, sy = 0, zoom = 1, flash = 0;
  for (const g of hits) {
    const dt = t - g.at;
    if (dt < 0 || dt > 0.45) continue;
    const k = (1 - dt / 0.45) ** 2;
    if (g.type === "shake" || g.type === "all") { sx += Math.sin(dt * 95) * 16 * k; sy += Math.cos(dt * 120) * 9 * k; }
    if (g.type === "zoom" || g.type === "all") zoom = Math.max(zoom, 1 + 0.055 * k);
    if (g.type === "flash" || g.type === "all") flash = Math.max(flash, 0.33 * k);
  }
  return (
    <>
      <AbsoluteFill style={{ transform: `translate(${sx}px, ${sy}px) scale(${zoom})` }}>{children}</AbsoluteFill>
      {flash > 0.01 ? <AbsoluteFill style={{ background: `rgba(255,244,214,${flash})`, pointerEvents: "none" }} /> : null}
    </>
  );
};

export const Episode: React.FC<{ d: EpisodeData }> = ({ d }) => {
  const { background: BG } = useTheme();
  return (
  <AbsoluteFill style={{ backgroundColor: BG }}>
    <Audio src={staticFile(d.voice)} />
    <Hits hits={d.hits ?? []}>
    <TerminalBackground lines={d.backgroundLines ?? ["✓ ok"]} />

    {/* sounds: whoosh at the start, pop in every scene and each scene's own sounds */}
    <Sequence from={0} durationInFrames={f(DUR_SOM.whoosh) + 2}>
      <Audio src={staticFile("sfx/whoosh.wav")} volume={VOL_SOM.whoosh} />
    </Sequence>
    {d.scenes.flatMap((c, i) => {
      const sounds: Sound[] = [{ at: 0, sound: "pop" }, ...(c.sounds ?? [])];
      return sounds.map((s, k) => (
        <Sequence key={`s${i}-${k}`} from={f(c.a + s.at)} durationInFrames={f(DUR_SOM[s.sound]) + 2}>
          <Audio src={staticFile(`sfx/${s.sound}.wav`)} volume={s.v ?? VOL_SOM[s.sound]} />
        </Sequence>
      ));
    })}

    {d.scenes.map((c, i) => (
      <Sequence key={"c" + i} from={f(c.a)} durationInFrames={f(c.b - c.a)} premountFor={10}>
        <c.C dur={c.b - c.a} />
      </Sequence>
    ))}
    {d.scenes.map((c, i) =>
      c.label ? (
        <Sequence key={"r" + i} from={f(c.a)} durationInFrames={f(c.b - c.a)}>
          <Label text={c.label} />
        </Sequence>
      ) : null,
    )}

    </Hits>
    <Sequence from={f(d.outro.a)} durationInFrames={f(d.durS - d.outro.a)}>
      <OutroEp cta={d.outro.cta} />
    </Sequence>
    <Sequence from={0} durationInFrames={f(d.durS)}>
      <CaptionEp words={d.words} bottom={190} px={d.captionPx} />
    </Sequence>
    <Sequence from={f(d.outro.a)} durationInFrames={2}>
      <Audio src={staticFile("sfx/ding.wav")} volume={0.22} />
    </Sequence>
    <ProgressBar durS={d.durS} />
  </AbsoluteFill>
);
};

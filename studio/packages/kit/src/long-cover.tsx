import { Still } from "remotion";
import { ThemeProvider, rgba, useTheme } from "@praeko/studio-core";
import type { Theme } from "@praeko/studio-core";
import { Frame, Mascot } from "./parts.tsx";
import { colorize } from "./long-parts.tsx";
import { resolveColor } from "./color.ts";

/* ============ Long-video covers, from one `cover:` of episode.yaml: 16:9 (YouTube, 1280x720) and vertical (Instagram, 1080x1920) ============ */
export type LongCoverSpec = {
  id: string; title: [string, string]; mascot?: string;
  code?: { title: string; lines: { s: string; hl?: boolean }[] };
  chips?: { text: string; color?: string }[];
  color?: string; glow?: string;
};
const color = resolveColor;

const CodeCard: React.FC<{ spec: LongCoverSpec; w: number; scale?: number }> = ({ spec, w, scale = 1 }) => {
  const T = useTheme();
  if (!spec.code) return null;
  const px = (n: number) => n * scale;
  return (
    <div style={{ width: w, background: T.code, border: `${px(5)}px solid ${T.accent}`, borderRadius: px(24), overflow: "hidden", textAlign: "left" }}>
      <div style={{ background: "#262034", padding: `${px(8)}px ${px(22)}px`, fontFamily: T.mono, fontSize: px(24), color: "#9a95b8" }}>{spec.code.title}</div>
      <div style={{ padding: `${px(18)}px ${px(24)}px`, fontFamily: T.mono, fontSize: px(30), lineHeight: 1.5, whiteSpace: "pre" }}>
        {spec.code.lines.map((l, i) => l.hl
          ? <div key={i} style={{ background: rgba(T.accent, 0.2), borderLeft: `${px(6)}px solid ${T.accent}`, marginLeft: -px(24), paddingLeft: px(18) }}>{colorize(l.s, T)}</div>
          : <div key={i}>{colorize(l.s, T)}</div>)}
      </div>
    </div>
  );
};
const Chips: React.FC<{ spec: LongCoverSpec; scale?: number; column?: boolean }> = ({ spec, scale = 1, column }) => {
  const T = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: column ? "column" : "row", alignItems: column ? "flex-start" : undefined, gap: 24 * scale }}>
      {(spec.chips ?? []).map((c, i) => <div key={i} style={{ background: color(T, c.color) ?? T.accent, color: T.background, fontSize: 48 * scale, padding: `${10 * scale}px ${34 * scale}px`, borderRadius: 18 * scale }}>{c.text}</div>)}
    </div>
  );
};

export const LongCover16x9: React.FC<{ spec: LongCoverSpec }> = ({ spec }) => {
  const T = useTheme();
  return (
    <div style={{ width: 1280, height: 720, background: `radial-gradient(900px 500px at 75% 30%, ${rgba(T.accent, 0.16)}, ${T.background} 70%)`, position: "relative", fontFamily: T.font, color: T.text, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 70, top: 70, fontSize: 92, lineHeight: 1.05, color: T.text }}>
        {spec.title[0]}<br /><span style={{ color: color(T, spec.color) ?? T.accent }}>{spec.title[1]}</span>
      </div>
      <div style={{ position: "absolute", left: 70, top: 310 }}><CodeCard spec={spec} w={700} /></div>
      <div style={{ position: "absolute", left: 70, top: 560 }}><Chips spec={spec} scale={0.9} /></div>
      {spec.mascot ? <div style={{ position: "absolute", right: 70, top: 150 }}><Mascot name={spec.mascot} size={380} /></div> : null}
      <div style={{ position: "absolute", right: 70, bottom: 50, fontSize: 34, color: T.accent, letterSpacing: 2 }}>{T.handle}</div>
    </div>
  );
};

/** Vertical (Instagram): two-line title, code card, chips and the mascot, inside the Shorts cover `Frame`. */
export const LongCoverVertical: React.FC<{ spec: LongCoverSpec }> = ({ spec }) => {
  const T = useTheme();
  return (
    <Frame glow={spec.glow ?? rgba(T.accent, 0.16)} title={[spec.title[0], spec.title[1]]} color={color(T, spec.color) ?? T.accent} size={spec.title.some((l) => l.length > 11) ? 104 : 130}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 34 }}>
        <CodeCard spec={spec} w={780} scale={1} />
        <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
          {spec.mascot ? <Mascot name={spec.mascot} size={210} /> : null}
          <Chips spec={spec} scale={0.7} column />
        </div>
      </div>
    </Frame>
  );
};

/** The two Stills of a long-video cover: `<id>` (1280x720) and `<id>Vertical` (1080x1920). */
export const LongCovers: React.FC<{ spec: LongCoverSpec; theme: Theme }> = ({ spec, theme }) => (
  <>
    <Still id={spec.id} component={() => <ThemeProvider theme={theme}><LongCover16x9 spec={spec} /></ThemeProvider>} width={1280} height={720} />
    <Still id={`${spec.id}Vertical`} component={() => <ThemeProvider theme={theme}><LongCoverVertical spec={spec} /></ThemeProvider>} width={1080} height={1920} />
  </>
);

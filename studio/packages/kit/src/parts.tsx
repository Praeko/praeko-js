import { Loop, OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Img, AbsoluteFill } from "remotion";
import { FPS, appear, pop, ramp, rgba, useTheme } from "@praeko/studio-core";

/* ============ Praeko Studio kit: visual parts that read the brand theme ============ */

/** Central panel of a Short: always the same size and place (70 px margin, clear of the label and the captions). */
export const Panel: React.FC<{ title: string; dur: number; children: React.ReactNode }> = ({ title, dur, children }) => {
  const { accent: LAMP, text: INK, font: FONT } = useTheme();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 13, stiffness: 190 } });
  const out = interpolate(frame, [dur * FPS - 6, dur * FPS], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: 70,
        right: 70,
        top: 330,
        height: 1000,
        display: "flex",
        flexDirection: "column",
        background: "rgba(20,17,15,.94)",
        border: `4px solid ${LAMP}`,
        borderRadius: 36,
        boxShadow: "0 24px 60px rgba(0,0,0,.6)",
        padding: "40px 48px",
        fontFamily: FONT,
        color: INK,
        transform: `scale(${0.82 + 0.18 * pop}) translateY(${(1 - pop) * 60}px)`,
        opacity: Math.min(1, pop * 1.6) * out,
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontSize: 38, letterSpacing: 5, color: LAMP, whiteSpace: "nowrap" }}>{title}</div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 40, minHeight: 0 }}>{children}</div>
    </div>
  );
};

export const Box: React.FC<{ t: number; q: number; color: string; children: React.ReactNode; mono?: boolean; size?: number; dim?: boolean; dash?: boolean }> = ({ t, q, color, children, mono, size = 48, dim, dash }) => {
  const { box: BOX, text: INK, font: FONT, mono: MONO } = useTheme();
  return (
    <div style={{ background: BOX, border: `4px ${dash ? "dashed" : "solid"} ${color}`, borderRadius: 22, padding: "18px 28px", fontFamily: mono ? MONO : FONT, fontSize: size, textAlign: "center", whiteSpace: "nowrap", color: INK, opacity: appear(t, q) * (dim ? 0.55 : 1), translate: `0px ${(1 - appear(t, q)) * 30}px` }}>{children}</div>
  );
};

export const Line: React.FC<{ t: number; q: number; color?: string; size?: number; children: React.ReactNode }> = ({ t, q, color, size = 46, children }) => {
  const { box: BOX, text: INK, font: FONT, accent: LAMP } = useTheme();
  return (
    <div style={{ background: BOX, border: `4px solid ${color ?? LAMP}`, borderRadius: 24, padding: "22px 30px", fontSize: size, opacity: appear(t, q), translate: `${(1 - appear(t, q)) * 70}px 0px`, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 22, fontFamily: FONT, color: INK }}>{children}</div>
  );
};

export const Big: React.FC<{ t: number; q: number; color?: string; size: number; mono?: boolean; children: React.ReactNode }> = ({ t, q, color, size, mono, children }) => {
  const { text: INK, font: FONT, mono: MONO } = useTheme();
  return (
    <div style={{ fontFamily: mono ? MONO : FONT, fontSize: size, fontWeight: 900, color: color ?? INK, textAlign: "center", lineHeight: 1.05, opacity: appear(t, q, 0.25), scale: String(pop(t, q)), whiteSpace: "nowrap" }}>{children}</div>
  );
};

export const Bubble: React.FC<{ t: number; q: number; color: string; children: React.ReactNode; author?: string }> = ({ t, q, color, children, author = "— someone, in the chat" }) => {
  const { box: BOX, text: INK, font: FONT, mono: MONO, muted: MUTED } = useTheme();
  return (
    <div style={{ position: "relative", background: BOX, border: `4px solid ${color}`, borderRadius: 28, padding: "28px 34px", fontFamily: FONT, fontSize: 46, lineHeight: 1.25, color: INK, textAlign: "center", opacity: appear(t, q), translate: `0px ${(1 - appear(t, q)) * 30}px` }}>
      <span style={{ position: "absolute", left: 24, top: -34, fontSize: 90, color: color, lineHeight: 1 }}>“</span>
      {children}
      <div style={{ fontFamily: MONO, fontSize: 26, color: MUTED, marginTop: 16 }}>{author}</div>
    </div>
  );
};

/** Code block with marked lines (the marked line color comes in `color`). */
export const Code: React.FC<{ t: number; q: number; title: string; color: string; lines: { s: string; color?: string; mark?: boolean }[] }> = ({ t, q, title, color, lines }) => {
  const { box: BOX, text: INK, mono: MONO } = useTheme();
  return (
    <div style={{ background: BOX, borderRadius: 24, overflow: "hidden", border: `4px solid ${color}`, opacity: appear(t, q), translate: `0px ${(1 - appear(t, q)) * 30}px` }}>
      <div style={{ background: "#1c1830", padding: "12px 26px", fontFamily: MONO, fontSize: 26, color: "#8b86a8", whiteSpace: "nowrap" }}>{title}</div>
      <div style={{ fontFamily: MONO, fontSize: 30, lineHeight: 1.6, padding: "20px 0" }}>
        {lines.map((l, i) => (
          <div key={i} style={{ whiteSpace: "pre", padding: "0 26px", color: l.color || INK, background: l.mark ? `${l.color}26` : "transparent", borderLeft: `6px solid ${l.mark ? l.color : "transparent"}` }}>{l.s}</div>
        ))}
      </div>
    </div>
  );
};

/** Real footage (of the game, or any recorded app) in a framed window, with optional crop and a slow camera push. */
export const Window: React.FC<{ t: number; q: number; src: string; clipDuration: number; from: number; left: number; top: number; w: number; reg?: [number, number, number, number]; tag?: string; dur: number }> = ({ t, q, src, clipDuration, from, left, top, w, reg = [0, 0, 1920, 1080], tag = "REAL FOOTAGE", dur }) => {
  const { accent: LAMP, text: INK, error: BAD, mono: MONO } = useTheme();
  const s = w / reg[2], h = (w * reg[3]) / reg[2], o = appear(t, q, 0.5);
  const push = 1 + 0.07 * ramp(t, q, q + dur);
  const total = clipDuration - from;
  return (
    <div style={{ position: "absolute", left, top, width: w, height: h, borderRadius: 26, overflow: "hidden", border: `4px solid ${LAMP}`, boxShadow: `0 0 70px ${rgba(LAMP, 0.25)}, 0 24px 60px rgba(0,0,0,.6)`, opacity: o, translate: `0px ${(1 - o) * 40}px`, background: "#0b0b10" }}>
      <div style={{ position: "absolute", inset: 0, scale: String(push), transformOrigin: "50% 60%" }}>
        <Loop durationInFrames={Math.round(total * FPS)}>
          <OffthreadVideo src={staticFile(src)} startFrom={Math.round(from * FPS)} muted style={{ position: "absolute", left: -reg[0] * s, top: -reg[1] * s, width: 1920 * s, height: 1080 * s, imageRendering: "pixelated" }} />
        </Loop>
      </div>
      <div style={{ position: "absolute", left: 14, bottom: 12, background: "rgba(10,8,6,.78)", color: INK, fontFamily: MONO, fontSize: 22, padding: "4px 14px", borderRadius: 10, display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ width: 12, height: 12, borderRadius: 6, background: BAD, opacity: 0.5 + 0.5 * Math.abs(Math.sin(t * 4)) }} />{tag}
      </div>
    </div>
  );
};

/** Vertical recording (phone) in a device frame. */
export const Phone: React.FC<{ t: number; q: number; src: string; clipDuration: number; from: number; left: number; top: number; w: number; dur: number }> = ({ t, q, src, clipDuration, from, left, top, w, dur }) => {
  const { accent: LAMP } = useTheme();
  const h = (w * 1920) / 1080, o = appear(t, q, 0.5);
  return (
    <div style={{ position: "absolute", left, top, width: w, height: h, borderRadius: 46, border: "10px solid #0b0b10", outline: `3px solid ${LAMP}`, overflow: "hidden", boxShadow: `0 0 70px ${rgba(LAMP, 0.22)}, 0 24px 60px rgba(0,0,0,.6)`, opacity: o, translate: `0px ${(1 - o) * 50}px`, background: "#0b0b10", scale: String(0.96 + 0.04 * ramp(t, q, q + dur)) }}>
      <Loop durationInFrames={Math.round((clipDuration - from) * FPS)}>
        <OffthreadVideo src={staticFile(src)} startFrom={Math.round(from * FPS)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </Loop>
    </div>
  );
};

/** Pixel-art mascot on a card. The image path comes from the theme (`mascotPath`, default `mascots/{name}.png`); `path` overrides it. */
export const Mascot: React.FC<{ name: string; size?: number; path?: string }> = ({ name, size = 220, path }) => {
  const { mascotPath } = useTheme();
  return (
    <div style={{ background: "#1c1830", border: "6px solid #3a3358", borderRadius: 30, padding: 12 }}>
      <Img src={staticFile(path ?? (mascotPath ?? "mascots/{name}.png").replace("{name}", name))} style={{ width: size, height: size, imageRendering: "pixelated" }} />
    </div>
  );
};

/** Frame of the vertical covers (content between y=260 and y=1660, the 3:4 crop of the Instagram grid). */
export const Frame: React.FC<{ glow: string; title: [string, string, string?]; color: string; children: React.ReactNode; size?: number }> = ({ glow, title, color, children, size = 130 }) => {
  const { coverBackground: BG, text: INK, accent: LAMP, font: FONT, handle } = useTheme();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 44%, ${glow} 0%, rgba(0,0,0,0) 56%), ${BG}`, alignItems: "center", fontFamily: FONT, textAlign: "center" }}>
      <div style={{ marginTop: 350, fontSize: size, fontWeight: 900, color: INK, lineHeight: 1.02, textShadow: "0 8px 0 #000", whiteSpace: "nowrap" }}>
        {title[0]}
        <br />
        <span style={{ color: color }}>{title[1]}</span>
        {title[2] ? (<><br />{title[2]}</>) : null}
      </div>
      <div style={{ marginTop: 130, display: "flex", flexDirection: "column", alignItems: "center", width: 1000, transform: "scale(1.16)", transformOrigin: "top center" }}>{children}</div>
      <div style={{ position: "absolute", bottom: 400, fontSize: 52, color: LAMP, letterSpacing: 2 }}>{handle}</div>
    </AbsoluteFill>
  );
};

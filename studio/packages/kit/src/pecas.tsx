import { Loop, OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Img, AbsoluteFill } from "remotion";
import { FPS, pop, ramp, rgba, surge, useTema } from "@praeko/studio-core";

/* ============ Kit do Praeko Studio: peças visuais que leem o tema da marca ============ */

/** Painel central de um Short: mesmo tamanho e lugar sempre (margem de 70 px, longe do rótulo e da legenda). */
export const PainelD: React.FC<{ titulo: string; dur: number; children: React.ReactNode }> = ({ titulo, dur, children }) => {
  const { destaque: LAMP, texto: INK, fonte: FONT } = useTema();
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
      <div style={{ fontSize: 38, letterSpacing: 5, color: LAMP, whiteSpace: "nowrap" }}>{titulo}</div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 40, minHeight: 0 }}>{children}</div>
    </div>
  );
};

export const Caixa: React.FC<{ t: number; q: number; cor: string; children: React.ReactNode; mono?: boolean; size?: number; dim?: boolean; dash?: boolean }> = ({ t, q, cor, children, mono, size = 48, dim, dash }) => {
  const { caixa: CAIXA, texto: INK, fonte: FONT, mono: MONO } = useTema();
  return (
    <div style={{ background: CAIXA, border: `4px ${dash ? "dashed" : "solid"} ${cor}`, borderRadius: 22, padding: "18px 28px", fontFamily: mono ? MONO : FONT, fontSize: size, textAlign: "center", whiteSpace: "nowrap", color: INK, opacity: surge(t, q) * (dim ? 0.55 : 1), translate: `0px ${(1 - surge(t, q)) * 30}px` }}>{children}</div>
  );
};

export const Linha: React.FC<{ t: number; q: number; cor?: string; size?: number; children: React.ReactNode }> = ({ t, q, cor, size = 46, children }) => {
  const { caixa: CAIXA, texto: INK, fonte: FONT, destaque: LAMP } = useTema();
  return (
    <div style={{ background: CAIXA, border: `4px solid ${cor ?? LAMP}`, borderRadius: 24, padding: "22px 30px", fontSize: size, opacity: surge(t, q), translate: `${(1 - surge(t, q)) * 70}px 0px`, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 22, fontFamily: FONT, color: INK }}>{children}</div>
  );
};

export const Big: React.FC<{ t: number; q: number; cor?: string; size: number; mono?: boolean; children: React.ReactNode }> = ({ t, q, cor, size, mono, children }) => {
  const { texto: INK, fonte: FONT, mono: MONO } = useTema();
  return (
    <div style={{ fontFamily: mono ? MONO : FONT, fontSize: size, fontWeight: 900, color: cor ?? INK, textAlign: "center", lineHeight: 1.05, opacity: surge(t, q, 0.25), scale: String(pop(t, q)), whiteSpace: "nowrap" }}>{children}</div>
  );
};

export const Balao: React.FC<{ t: number; q: number; cor: string; children: React.ReactNode; autor?: string }> = ({ t, q, cor, children, autor = "— um jogador, no chat" }) => {
  const { caixa: CAIXA, texto: INK, fonte: FONT, mono: MONO, suave: MUTED } = useTema();
  return (
    <div style={{ position: "relative", background: CAIXA, border: `4px solid ${cor}`, borderRadius: 28, padding: "28px 34px", fontFamily: FONT, fontSize: 46, lineHeight: 1.25, color: INK, textAlign: "center", opacity: surge(t, q), translate: `0px ${(1 - surge(t, q)) * 30}px` }}>
      <span style={{ position: "absolute", left: 24, top: -34, fontSize: 90, color: cor, lineHeight: 1 }}>“</span>
      {children}
      <div style={{ fontFamily: MONO, fontSize: 26, color: MUTED, marginTop: 16 }}>{autor}</div>
    </div>
  );
};

/** Bloco de código com linhas marcadas (a cor da linha marcada vem em `cor`). */
export const Codigo: React.FC<{ t: number; q: number; titulo: string; cor: string; linhas: { s: string; cor?: string; marca?: boolean }[] }> = ({ t, q, titulo, cor, linhas }) => {
  const { caixa: CAIXA, texto: INK, mono: MONO } = useTema();
  return (
    <div style={{ background: CAIXA, borderRadius: 24, overflow: "hidden", border: `4px solid ${cor}`, opacity: surge(t, q), translate: `0px ${(1 - surge(t, q)) * 30}px` }}>
      <div style={{ background: "#1c1830", padding: "12px 26px", fontFamily: MONO, fontSize: 26, color: "#8b86a8", whiteSpace: "nowrap" }}>{titulo}</div>
      <div style={{ fontFamily: MONO, fontSize: 30, lineHeight: 1.6, padding: "20px 0" }}>
        {linhas.map((l, i) => (
          <div key={i} style={{ whiteSpace: "pre", padding: "0 26px", color: l.cor || INK, background: l.marca ? `${l.cor}26` : "transparent", borderLeft: `6px solid ${l.marca ? l.cor : "transparent"}` }}>{l.s}</div>
        ))}
      </div>
    </div>
  );
};

/** Cena real do jogo (ou de qualquer app gravado) numa janela com moldura, recorte opcional e empurrão lento de câmera. */
export const Janela: React.FC<{ t: number; q: number; src: string; duracao: number; de: number; left: number; top: number; w: number; reg?: [number, number, number, number]; tag?: string; dur: number }> = ({ t, q, src, duracao, de, left, top, w, reg = [0, 0, 1920, 1080], tag = "CENA REAL DO JOGO", dur }) => {
  const { destaque: LAMP, texto: INK, erro: RUIM, mono: MONO } = useTema();
  const s = w / reg[2], h = (w * reg[3]) / reg[2], o = surge(t, q, 0.5);
  const push = 1 + 0.07 * ramp(t, q, q + dur);
  const total = duracao - de;
  return (
    <div style={{ position: "absolute", left, top, width: w, height: h, borderRadius: 26, overflow: "hidden", border: `4px solid ${LAMP}`, boxShadow: `0 0 70px ${rgba(LAMP, 0.25)}, 0 24px 60px rgba(0,0,0,.6)`, opacity: o, translate: `0px ${(1 - o) * 40}px`, background: "#0b0b10" }}>
      <div style={{ position: "absolute", inset: 0, scale: String(push), transformOrigin: "50% 60%" }}>
        <Loop durationInFrames={Math.round(total * FPS)}>
          <OffthreadVideo src={staticFile(src)} startFrom={Math.round(de * FPS)} muted style={{ position: "absolute", left: -reg[0] * s, top: -reg[1] * s, width: 1920 * s, height: 1080 * s, imageRendering: "pixelated" }} />
        </Loop>
      </div>
      <div style={{ position: "absolute", left: 14, bottom: 12, background: "rgba(10,8,6,.78)", color: INK, fontFamily: MONO, fontSize: 22, padding: "4px 14px", borderRadius: 10, display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ width: 12, height: 12, borderRadius: 6, background: RUIM, opacity: 0.5 + 0.5 * Math.abs(Math.sin(t * 4)) }} />{tag}
      </div>
    </div>
  );
};

/** Gravação vertical (celular) com moldura de aparelho. */
export const Celular: React.FC<{ t: number; q: number; src: string; duracao: number; de: number; left: number; top: number; w: number; dur: number }> = ({ t, q, src, duracao, de, left, top, w, dur }) => {
  const { destaque: LAMP } = useTema();
  const h = (w * 1920) / 1080, o = surge(t, q, 0.5);
  return (
    <div style={{ position: "absolute", left, top, width: w, height: h, borderRadius: 46, border: "10px solid #0b0b10", outline: `3px solid ${LAMP}`, overflow: "hidden", boxShadow: `0 0 70px ${rgba(LAMP, 0.22)}, 0 24px 60px rgba(0,0,0,.6)`, opacity: o, translate: `0px ${(1 - o) * 50}px`, background: "#0b0b10", scale: String(0.96 + 0.04 * ramp(t, q, q + dur)) }}>
      <Loop durationInFrames={Math.round((duracao - de) * FPS)}>
        <OffthreadVideo src={staticFile(src)} startFrom={Math.round(de * FPS)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </Loop>
    </div>
  );
};

/** Mascote em pixel art num cartão (arquivo `gatos/gato-<nome>.png`; troque o prefixo no projeto se o mascote for outro). */
export const Gato: React.FC<{ nome: string; tam?: number }> = ({ nome, tam = 220 }) => (
  <div style={{ background: "#1c1830", border: "6px solid #3a3358", borderRadius: 30, padding: 12 }}>
    <Img src={staticFile(`gatos/gato-${nome}.png`)} style={{ width: tam, height: tam, imageRendering: "pixelated" }} />
  </div>
);

/** Moldura das capas verticais (conteúdo entre y=260 e y=1660, recorte 3:4 da grade do Instagram). */
export const Moldura: React.FC<{ glow: string; titulo: [string, string, string?]; cor: string; children: React.ReactNode; tam?: number }> = ({ glow, titulo, cor, children, tam = 130 }) => {
  const { fundoCapa: BG, texto: INK, destaque: LAMP, fonte: FONT, handle } = useTema();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 44%, ${glow} 0%, rgba(0,0,0,0) 56%), ${BG}`, alignItems: "center", fontFamily: FONT, textAlign: "center" }}>
      <div style={{ marginTop: 350, fontSize: tam, fontWeight: 900, color: INK, lineHeight: 1.02, textShadow: "0 8px 0 #000", whiteSpace: "nowrap" }}>
        {titulo[0]}
        <br />
        <span style={{ color: cor }}>{titulo[1]}</span>
        {titulo[2] ? (<><br />{titulo[2]}</>) : null}
      </div>
      <div style={{ marginTop: 130, display: "flex", flexDirection: "column", alignItems: "center", width: 1000, transform: "scale(1.16)", transformOrigin: "top center" }}>{children}</div>
      <div style={{ position: "absolute", bottom: 400, fontSize: 52, color: LAMP, letterSpacing: 2 }}>{handle}</div>
    </AbsoluteFill>
  );
};

import { AbsoluteFill, Audio, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Palavra } from "./palavra";
import { rgba, useTema } from "./tema";
import { FPS, norm } from "./util";

/**
 * MOTOR DE LONGO (16:9, vários minutos). Um longo é uma lista de cenas em tempo GLOBAL: cada cena recebe `t` (s desde o início do vídeo)
 * e se liga à voz com `mkAtG(PALAVRAS)(frase, nth, from)`. O motor cuida do fundo, da voz, do cabeçalho da cena (número + título),
 * da legenda por grupos e da barra de progresso. As cenas são TSX do projeto, montadas com as peças de `@praeko/studio-kit/longo`.
 */
export type CenaLongo = { n: string; titulo: string; a: number; b: number; C: React.FC<{ t: number }> };
/** Tela final opcional: avatar, texto (ex.: a assinatura), handle da marca e link. Entra em `a` (s) e fica até o fim. */
export type FechoLongo = { a: number; texto?: string; link?: string; imagem?: string };
export type LongoData = { id: string; durS: number; voz: string; palavras: Palavra[]; cenas: CenaLongo[]; largura?: number; altura?: number; fecho?: FechoLongo };

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
/** Entra e sai com fade de `d` s nas pontas da janela [a, b]. */
export const janela = (t: number, a: number, b: number, d = 0.4) => interpolate(t, [a, a + d, b - d, b], [0, 1, 1, 0], clamp);

/** Âncora global: `at("frase", nth, from)` = instante (s) em que a frase começa; `from` ignora ocorrências antes de `from` s. Falha alto se não achar. */
export const mkAtG = (P: Palavra[]) => {
  const W = P.map((p) => norm(p.t));
  return (frase: string, nth = 0, from = 0): number => {
    const f = frase.split(/\s+/).map(norm).filter(Boolean);
    let c = 0;
    for (let i = 0; i <= W.length - f.length; i++) {
      if (P[i].a < from) continue;
      if (f.every((w, k) => W[i + k] === w)) { if (c === nth) return P[i].a; c++; }
    }
    throw new Error("frase não achada: " + frase);
  };
};

const Cena: React.FC<{ t: number; a: number; b: number; n: string; titulo: string; children: React.ReactNode }> = ({ t, a, b, n, titulo, children }) => {
  const T = useTema();
  if (t < a - 0.1 || t > b + 0.1) return null;
  return (
    <AbsoluteFill style={{ opacity: janela(t, a, b) }}>
      <div style={{ position: "absolute", left: 100, top: 46, display: "flex", alignItems: "center", gap: 18, fontFamily: T.fonte, fontSize: 30, letterSpacing: 4, color: T.destaque, whiteSpace: "nowrap" }}>
        <span style={{ background: T.destaque, color: T.fundo, borderRadius: 12, padding: "4px 16px" }}>{n}</span>
        {titulo}
      </div>
      {children}
    </AbsoluteFill>
  );
};

const grupos = (P: Palavra[]) => {
  const g: Palavra[][] = [];
  let cur: Palavra[] = [];
  P.forEach((p) => {
    cur.push(p);
    if (/[.!?:]$/.test(p.t) || cur.length >= 8 || (/[,;]$/.test(p.t) && cur.length >= 5)) { g.push(cur); cur = []; }
  });
  if (cur.length) g.push(cur);
  return g;
};

const Legenda: React.FC<{ t: number; G: Palavra[][] }> = ({ t, G }) => {
  const T = useTema();
  let grupo: Palavra[] | null = null;
  for (const g of G) if (t >= g[0].a - 0.05 && t <= g[g.length - 1].b + 0.4) grupo = g;
  if (!grupo) return null;
  return (
    <div style={{ position: "absolute", left: 160, right: 160, bottom: 56, textAlign: "center", fontFamily: T.fonte, fontSize: 46, lineHeight: 1.2, textShadow: "0 3px 12px rgba(0,0,0,.9)" }}>
      {grupo.map((p, i) => (
        <span key={i} style={{ color: t >= p.a && t < p.b + 0.05 ? T.destaque : T.texto }}>{p.t}{i < grupo!.length - 1 ? " " : ""}</span>
      ))}
    </div>
  );
};

const FechoTela: React.FC<{ f: FechoLongo; t: number }> = ({ f, t }) => {
  const T = useTema();
  const { fps } = useVideoConfig();
  const k = (atraso: number) => spring({ frame: (t - f.a - atraso) * fps, fps, config: { damping: 14, stiffness: 140 } });
  const op = interpolate(t, [f.a, f.a + 0.5], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ opacity: op, background: `radial-gradient(circle at 50% 40%, ${T.caixa} 0%, ${T.fundo} 75%)`, alignItems: "center", justifyContent: "center", fontFamily: T.fonte, textAlign: "center", paddingBottom: 90 }}>
      <div style={{ width: 230, height: 230, borderRadius: 44, overflow: "hidden", border: `8px solid ${f.imagem ? "#3a3566" : T.destaque}`, background: f.imagem ? "#1c1a33" : undefined, boxShadow: `0 0 70px ${rgba(T.destaque, 0.3)}`, transform: `scale(${0.6 + 0.4 * k(0)})`, opacity: Math.min(1, k(0) * 1.5) }}>
        <Img src={staticFile(f.imagem ?? T.avatar)} style={{ width: 230, height: 230, imageRendering: "pixelated", objectFit: "contain" }} />
      </div>
      {f.texto ? <div style={{ marginTop: 44, fontSize: 104, fontWeight: 900, color: T.destaque, opacity: Math.max(0, k(0.15)), transform: `translateY(${(1 - Math.max(0, k(0.15))) * 24}px)` }}>{f.texto}</div> : null}
      <div style={{ marginTop: 28, fontSize: 54, fontWeight: 900, color: T.texto, opacity: Math.max(0, k(0.3)) }}>{T.handle}</div>
      {f.link ? <div style={{ marginTop: 18, fontSize: 38, fontFamily: T.mono, color: T.suave, opacity: Math.max(0, k(0.45)) }}>{f.link}</div> : null}
    </AbsoluteFill>
  );
};

export const Longo: React.FC<{ d: LongoData }> = ({ d }) => {
  const T = useTema();
  const t = useCurrentFrame() / FPS;
  const G = grupos(d.palavras);
  return (
    <AbsoluteFill style={{ background: T.fundo, color: T.texto, fontFamily: T.fonte }}>
      <AbsoluteFill style={{ background: `radial-gradient(1200px 700px at 70% 20%, ${rgba(T.destaque, 0.07)}, transparent 70%)` }} />
      <Audio src={staticFile(d.voz)} />
      {d.cenas.map((c) => (
        <Cena key={c.n} t={t} a={c.a} b={c.b} n={c.n} titulo={c.titulo}>
          <c.C t={t} />
        </Cena>
      ))}
      {d.fecho && t >= d.fecho.a ? <FechoTela f={d.fecho} t={t} /> : null}
      <Legenda t={t} G={G} />
      <div style={{ position: "absolute", left: 0, top: 0, height: 8, width: `${(t / d.durS) * 100}%`, background: T.destaque }} />
    </AbsoluteFill>
  );
};

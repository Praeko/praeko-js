import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Palavra } from "./palavra";
import { rgba, useTema } from "./tema";
import { FPS } from "./util";

/**
 * NÚCLEO DO PRAEKO STUDIO.
 * Um episódio é só dados (EpData): voz, palavras com tempo, cenas (cartão + rótulo + sons) e fechamento.
 * O resto (fundo, legenda, barra de progresso, fechamento, efeitos) é compartilhado e usa o tema da marca.
 */

export type Som = { at: number; f: "pop" | "ding" | "thump" | "whoosh"; v?: number };

export type Golpe = { at: number; tipo: "shake" | "zoom" | "flash" | "tudo" };

export type EpCena = {
  a: number;
  b: number;
  C: React.FC<{ dur: number }>;
  rotulo?: string;
  /** sons relativos ao início da cena (s) */
  sons?: Som[];
};

export type EpData = {
  id: string;
  durS: number;
  voz: string;
  palavras: Palavra[];
  cenas: EpCena[];
  fechamento: { a: number; cta: string };
  /** linhas de "terminal" desfocadas no fundo */
  fundoLinhas?: string[];
  /** tamanho da legenda (padrão 90) */
  legendaPx?: number;
  /** golpes de edição: tremor, clarão e zoom rápidos em instantes (s) da narração */
  golpes?: Golpe[];
};


const f = (s: number) => Math.round(s * FPS);
const DUR_SOM: Record<Som["f"], number> = { pop: 0.16, ding: 0.9, thump: 0.4, whoosh: 0.55 };
const VOL_SOM: Record<Som["f"], number> = { pop: 0.22, ding: 0.26, thump: 0.33, whoosh: 0.28 };


export const Rotulo: React.FC<{ texto: string }> = ({ texto }) => {
  const { destaque: LAMP, fundo: BG, texto: INK, fonte: FONT, ok: OK, caixa: CAIXA } = useTema();
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
        {texto}
      </div>
    </div>
  );
};


/** Fundo limpo: escuro, brilho âmbar que pulsa e pontinhos que sobem devagar. */
export const Fundo: React.FC = () => {
  const { destaque: LAMP, fundo: BG, texto: INK, fonte: FONT, ok: OK, caixa: CAIXA } = useTema();
  const frame = useCurrentFrame();
  const pulso = 0.16 + 0.05 * Math.sin(frame / 22);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 20%, ${rgba(LAMP, pulso)} 0%, ${rgba(LAMP, 0)} 55%), radial-gradient(ellipse at 50% 100%, rgba(80,60,120,.22) 0%, rgba(0,0,0,0) 60%), ${BG}`,
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


export type Grupo = { palavras: Palavra[]; a: number; b: number };

export const agrupar = (ps: Palavra[]): Grupo[] => {
  const g: Grupo[] = [];
  let cur: Palavra[] = [];
  const fecha = () => {
    if (cur.length) g.push({ palavras: cur, a: cur[0].a, b: cur[cur.length - 1].b });
    cur = [];
  };
  ps.forEach((p, i) => {
    cur.push(p);
    const gap = i < ps.length - 1 ? ps[i + 1].a - p.b : 1;
    const letras = cur.reduce((n, x) => n + x.t.length, 0);
    const prox = ps[i + 1]?.t.length ?? 0;
    if (/[.,?!:]$/.test(p.t) || cur.length >= 3 || letras + prox > 15 || gap > 0.3) fecha();
  });
  fecha();
  return g;
};


const FundoTerminal: React.FC<{ linhas: string[] }> = ({ linhas }) => {
  const { destaque: LAMP, ok: OK } = useTema();
  const frame = useCurrentFrame();
  // mesmo visual dos cortes antigos: 34 linhas de código em mono pequeno, duas colunas, subindo devagar.
  // Com poucas linhas a lista se repete trocando de coluna a cada volta, para não formar um padrão.
  const n = Math.max(1, linhas.length);
  const passo = 64, ciclo = 34 * passo + 0;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Fundo />
      <div style={{ position: "absolute", inset: 0, opacity: 0.09, filter: "blur(1.2px)" }}>
        {Array.from({ length: 34 }).map((_, i) => {
          const y = ((((i * passo - frame * 0.8) % ciclo) + ciclo) % ciclo) - 160;
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
              {linhas[i % n]}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const LegendaEp: React.FC<{ palavras: Palavra[]; bottom: number; px?: number }> = ({ palavras, bottom, px = 90 }) => {
  const { destaque: LAMP, fundo: BG, texto: INK, fonte: FONT, ok: OK, caixa: CAIXA } = useTema();
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const grupos = agrupar(palavras);
  const idx = grupos.findIndex((g, i) => {
    const prox = grupos[i + 1]?.a ?? g.b + 0.4;
    return t >= g.a - 0.05 && t < Math.max(g.b + 0.15, Math.min(prox, g.b + 0.5));
  });
  if (idx < 0) return null;
  const g = grupos[idx];
  const dentro = frame - f(g.a);
  const entra = interpolate(dentro, [-2, 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
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
        opacity: entra,
        transform: `translateY(${(1 - entra) * 24}px)`,
      }}
    >
      {g.palavras.map((p, i) => {
        const ativa = t >= p.a && t < p.b + 0.05;
        const ja = t >= p.a;
        return (
          <span
            key={i}
            style={{
              fontFamily: FONT,
              fontWeight: 900,
              fontSize: px,
              lineHeight: 1.05,
              textTransform: "uppercase",
              color: ativa ? LAMP : ja ? INK : rgba(INK, 0.55),
              transform: `scale(${ativa ? 1.12 : 1})`,
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

const FechamentoEp: React.FC<{ cta: string }> = ({ cta }) => {
  const tema = useTema();
  const { destaque: LAMP, fundo: BG, texto: INK, fonte: FONT, ok: OK, caixa: CAIXA } = useTema();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame, fps, config: { damping: 10, stiffness: 150 } });
  const nome = spring({ frame: frame - 8, fps, config: { damping: 200 } });
  const pill = spring({ frame: frame - 20, fps, config: { damping: 12, stiffness: 160 } });
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 40%, ${CAIXA} 0%, ${BG} 72%)`,
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
        <Img src={staticFile(tema.avatar)} style={{ width: 420, height: 420, imageRendering: "pixelated" }} />
      </div>
      <div
        style={{
          marginTop: 46,
          fontSize: 92,
          fontWeight: 900,
          color: LAMP,
          opacity: Math.max(0, nome),
          transform: `translateY(${(1 - Math.max(0, nome)) * 30}px)`,
        }}
      >
        {tema.handle}
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

const Barra: React.FC<{ durS: number }> = ({ durS }) => {
  const { destaque: LAMP, fundo: BG, texto: INK, fonte: FONT, ok: OK, caixa: CAIXA } = useTema();
  const frame = useCurrentFrame();
  const w = Math.min(100, (frame / f(durS)) * 100);
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 10, background: "rgba(0,0,0,.4)" }}>
      <div style={{ width: `${w}%`, height: "100%", background: LAMP }} />
    </div>
  );
};

/** Tremor, zoom e clarão curtos (0,45 s) nos instantes marcados; só mexe no fundo e nas cenas, nunca na legenda. */
const Golpes: React.FC<{ golpes: Golpe[]; children: React.ReactNode }> = ({ golpes, children }) => {
  const t = useCurrentFrame() / FPS;
  let sx = 0, sy = 0, zoom = 1, flash = 0;
  for (const g of golpes) {
    const dt = t - g.at;
    if (dt < 0 || dt > 0.45) continue;
    const k = (1 - dt / 0.45) ** 2;
    if (g.tipo === "shake" || g.tipo === "tudo") { sx += Math.sin(dt * 95) * 16 * k; sy += Math.cos(dt * 120) * 9 * k; }
    if (g.tipo === "zoom" || g.tipo === "tudo") zoom = Math.max(zoom, 1 + 0.055 * k);
    if (g.tipo === "flash" || g.tipo === "tudo") flash = Math.max(flash, 0.33 * k);
  }
  return (
    <>
      <AbsoluteFill style={{ transform: `translate(${sx}px, ${sy}px) scale(${zoom})` }}>{children}</AbsoluteFill>
      {flash > 0.01 ? <AbsoluteFill style={{ background: `rgba(255,244,214,${flash})`, pointerEvents: "none" }} /> : null}
    </>
  );
};

export const Episodio: React.FC<{ d: EpData }> = ({ d }) => {
  const { fundo: BG } = useTema();
  return (
  <AbsoluteFill style={{ backgroundColor: BG }}>
    <Audio src={staticFile(d.voz)} />
    <Golpes golpes={d.golpes ?? []}>
    <FundoTerminal linhas={d.fundoLinhas ?? ["✓ ok"]} />

    {/* sons: whoosh no início, pop em cada cena e os sons próprios de cada cena */}
    <Sequence from={0} durationInFrames={f(DUR_SOM.whoosh) + 2}>
      <Audio src={staticFile("sfx/whoosh.wav")} volume={VOL_SOM.whoosh} />
    </Sequence>
    {d.cenas.flatMap((c, i) => {
      const sons: Som[] = [{ at: 0, f: "pop" }, ...(c.sons ?? [])];
      return sons.map((s, k) => (
        <Sequence key={`s${i}-${k}`} from={f(c.a + s.at)} durationInFrames={f(DUR_SOM[s.f]) + 2}>
          <Audio src={staticFile(`sfx/${s.f}.wav`)} volume={s.v ?? VOL_SOM[s.f]} />
        </Sequence>
      ));
    })}

    {d.cenas.map((c, i) => (
      <Sequence key={"c" + i} from={f(c.a)} durationInFrames={f(c.b - c.a)} premountFor={10}>
        <c.C dur={c.b - c.a} />
      </Sequence>
    ))}
    {d.cenas.map((c, i) =>
      c.rotulo ? (
        <Sequence key={"r" + i} from={f(c.a)} durationInFrames={f(c.b - c.a)}>
          <Rotulo texto={c.rotulo} />
        </Sequence>
      ) : null,
    )}

    </Golpes>
    <Sequence from={f(d.fechamento.a)} durationInFrames={f(d.durS - d.fechamento.a)}>
      <FechamentoEp cta={d.fechamento.cta} />
    </Sequence>
    <Sequence from={0} durationInFrames={f(d.durS)}>
      <LegendaEp palavras={d.palavras} bottom={190} px={d.legendaPx} />
    </Sequence>
    <Sequence from={f(d.fechamento.a)} durationInFrames={2}>
      <Audio src={staticFile("sfx/ding.wav")} volume={0.22} />
    </Sequence>
    <Barra durS={d.durS} />
  </AbsoluteFill>
);
};

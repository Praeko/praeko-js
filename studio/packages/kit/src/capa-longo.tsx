import { Still } from "remotion";
import { Tema, TemaProvider, rgba, useTema } from "@praeko/studio-core";
import { Gato, Moldura } from "./pecas";
import { colorize } from "./longo";

/* ============ Capas de longo, de um só `capa:` do episodio.yaml: 16:9 (YouTube, 1280×720) e vertical (Instagram, 1080×1920) ============ */
export type CapaLongoSpec = {
  id: string; titulo: [string, string]; gato?: string;
  codigo?: { titulo: string; linhas: { s: string; hl?: boolean }[] };
  chips?: { texto: string; cor?: string }[];
  cor?: string; glow?: string;
};
const cor = (T: Tema, c?: string) => (c && !c.startsWith("#") && (T as any)[c] ? (T as any)[c] : c);

const Cartao: React.FC<{ spec: CapaLongoSpec; w: number; escala?: number }> = ({ spec, w, escala = 1 }) => {
  const T = useTema();
  if (!spec.codigo) return null;
  const px = (n: number) => n * escala;
  return (
    <div style={{ width: w, background: T.codigo, border: `${px(5)}px solid ${T.destaque}`, borderRadius: px(24), overflow: "hidden", textAlign: "left" }}>
      <div style={{ background: "#262034", padding: `${px(8)}px ${px(22)}px`, fontFamily: T.mono, fontSize: px(24), color: "#9a95b8" }}>{spec.codigo.titulo}</div>
      <div style={{ padding: `${px(18)}px ${px(24)}px`, fontFamily: T.mono, fontSize: px(30), lineHeight: 1.5, whiteSpace: "pre" }}>
        {spec.codigo.linhas.map((l, i) => l.hl
          ? <div key={i} style={{ background: rgba(T.destaque, 0.2), borderLeft: `${px(6)}px solid ${T.destaque}`, marginLeft: -px(24), paddingLeft: px(18) }}>{colorize(l.s, T)}</div>
          : <div key={i}>{colorize(l.s, T)}</div>)}
      </div>
    </div>
  );
};
const Chips: React.FC<{ spec: CapaLongoSpec; escala?: number; coluna?: boolean }> = ({ spec, escala = 1, coluna }) => {
  const T = useTema();
  return (
    <div style={{ display: "flex", flexDirection: coluna ? "column" : "row", alignItems: coluna ? "flex-start" : undefined, gap: 24 * escala }}>
      {(spec.chips ?? []).map((c, i) => <div key={i} style={{ background: cor(T, c.cor) ?? T.destaque, color: T.fundo, fontSize: 48 * escala, padding: `${10 * escala}px ${34 * escala}px`, borderRadius: 18 * escala }}>{c.texto}</div>)}
    </div>
  );
};

export const CapaLongo16x9: React.FC<{ spec: CapaLongoSpec }> = ({ spec }) => {
  const T = useTema();
  return (
    <div style={{ width: 1280, height: 720, background: `radial-gradient(900px 500px at 75% 30%, ${rgba(T.destaque, 0.16)}, ${T.fundo} 70%)`, position: "relative", fontFamily: T.fonte, color: T.texto, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 70, top: 70, fontSize: 92, lineHeight: 1.05, color: T.texto }}>
        {spec.titulo[0]}<br /><span style={{ color: cor(T, spec.cor) ?? T.destaque }}>{spec.titulo[1]}</span>
      </div>
      <div style={{ position: "absolute", left: 70, top: 310 }}><Cartao spec={spec} w={700} /></div>
      <div style={{ position: "absolute", left: 70, top: 560 }}><Chips spec={spec} escala={0.9} /></div>
      {spec.gato ? <div style={{ position: "absolute", right: 70, top: 150 }}><Gato nome={spec.gato} tam={380} /></div> : null}
      <div style={{ position: "absolute", right: 70, bottom: 50, fontSize: 34, color: T.destaque, letterSpacing: 2 }}>{T.handle}</div>
    </div>
  );
};

/** Vertical (Instagram): título em duas linhas, cartão de código, chips e o gato, dentro da `Moldura` das capas dos Shorts. */
export const CapaLongoVertical: React.FC<{ spec: CapaLongoSpec }> = ({ spec }) => {
  const T = useTema();
  return (
    <Moldura glow={spec.glow ?? rgba(T.destaque, 0.16)} titulo={[spec.titulo[0], spec.titulo[1]]} cor={cor(T, spec.cor) ?? T.destaque} tam={spec.titulo.some((l) => l.length > 11) ? 104 : 130}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 34 }}>
        <Cartao spec={spec} w={780} escala={1} />
        <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
          {spec.gato ? <Gato nome={spec.gato} tam={210} /> : null}
          <Chips spec={spec} escala={0.7} coluna />
        </div>
      </div>
    </Moldura>
  );
};

/** As duas Stills de uma capa de longo: `<id>` (1280×720) e `<id>Vertical` (1080×1920). */
export const CapasLongo: React.FC<{ spec: CapaLongoSpec; tema: Tema }> = ({ spec, tema }) => (
  <>
    <Still id={spec.id} component={() => <TemaProvider tema={tema}><CapaLongo16x9 spec={spec} /></TemaProvider>} width={1280} height={720} />
    <Still id={`${spec.id}Vertical`} component={() => <TemaProvider tema={tema}><CapaLongoVertical spec={spec} /></TemaProvider>} width={1080} height={1920} />
  </>
);

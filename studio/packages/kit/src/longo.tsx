import { useTema } from "@praeko/studio-core";
import { interpolate } from "remotion";

/* Peças de longo (16:9): posição absoluta, tempo GLOBAL `t`, entrada `q` (s). Usam o tema da marca. */
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
/** 0 → 1 a partir de `q` (linear, d = 0,3 s), como nos longos. */
export const surgeL = (t: number, q: number, d = 0.3) => interpolate(t, [q, q + d], [0, 1], clamp);

const KW = /^(UPDATE|SET|WHERE|AND|INSERT|INTO|SELECT|FROM|CASE|WHEN|THEN|END|AS|VALUES|IS|NOT|NULL|const|await|if)$/;
const FN = /^(changes|abs|json_set|json_remove|json_extract)$/;

/** Colore uma linha de código/SQL (palavras-chave, funções, números, strings, comentários). */
export const colorize = (s: string, c: { texto: string; suave: string; ok: string; destaque: string; info: string }) =>
  s.split(/(--.*$|\/\/.*$|'[^']*'|\b\w+\b)/).map((p, i) => {
    if (!p) return null;
    let cor = c.texto;
    if (/^(--|\/\/)/.test(p)) cor = c.suave;
    else if (/^'/.test(p)) cor = c.ok;
    else if (KW.test(p)) cor = c.destaque;
    else if (/^\d+$/.test(p)) cor = "#7fb4ff";
    else if (FN.test(p)) cor = c.info;
    return <span key={i} style={{ color: cor }}>{p}</span>;
  });

export type LinhaCodigo = { s: string; hl?: [number, number]; red?: boolean };
/** Bloco de código com linhas que acendem entre `hl[0]` e `hl[1]` (s globais). */
export const CodigoL: React.FC<{ titulo: string; lines: LinhaCodigo[]; t: number; q: number; w: number; size?: number; left: number; top: number }> = ({ titulo, lines, t, q, w, size = 32, left, top }) => {
  const T = useTema();
  const o = surgeL(t, q);
  return (
    <div style={{ position: "absolute", left, top, width: w, background: T.codigo, border: `3px solid #3a2f22`, borderRadius: 22, overflow: "hidden", opacity: o, transform: `translateY(${(1 - o) * 24}px)` }}>
      <div style={{ background: "#262034", padding: "10px 26px", fontFamily: T.mono, fontSize: 26, color: "#9a95b8", whiteSpace: "nowrap" }}>{titulo}</div>
      <div style={{ padding: "18px 0", fontFamily: T.mono, fontSize: size, lineHeight: 1.5 }}>
        {lines.map((l, i) => {
          const on = l.hl ? t >= l.hl[0] && t < l.hl[1] : false;
          return (
            <div key={i} style={{ whiteSpace: "pre", padding: "0 26px", borderLeft: `6px solid ${on ? (l.red ? T.erro : T.destaque) : "transparent"}`, background: on ? (l.red ? "rgba(255,107,94,.16)" : "rgba(244,185,66,.16)") : "transparent" }}>
              {colorize(l.s, T) || " "}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const CartaoL: React.FC<{ t: number; q: number; left: number; top: number; w: number; h?: number; cor?: string; children: React.ReactNode }> = ({ t, q, left, top, w, h, cor, children }) => {
  const T = useTema();
  const o = surgeL(t, q);
  return (
    <div style={{ position: "absolute", left, top, width: w, height: h, boxSizing: "border-box", background: T.caixaLongo ?? T.caixa, border: `4px solid ${cor ?? T.destaque}`, borderRadius: 24, padding: "20px 28px", fontFamily: T.fonte, color: T.texto, opacity: o, transform: `translateY(${(1 - o) * 26}px)`, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
      {children}
    </div>
  );
};

export const ChipL: React.FC<{ t: number; q: number; left: number; top: number; cor?: string; size?: number; children: React.ReactNode }> = ({ t, q, left, top, cor, size = 34, children }) => {
  const T = useTema();
  const o = surgeL(t, q);
  return (
    <div style={{ position: "absolute", left, top, opacity: o, transform: `scale(${1.15 - 0.15 * o})`, transformOrigin: "left center", fontFamily: T.fonte, fontSize: size, color: T.fundo, background: cor ?? T.destaque, borderRadius: 16, padding: "10px 26px", whiteSpace: "nowrap" }}>{children}</div>
  );
};

export const TxtL: React.FC<{ t: number; q: number; left: number; top: number; w?: number; size?: number; cor?: string; align?: "left" | "center"; mono?: boolean; children: React.ReactNode }> = ({ t, q, left, top, w, size = 44, cor, align = "left", mono, children }) => {
  const T = useTema();
  const o = surgeL(t, q);
  return (
    <div style={{ position: "absolute", left, top, width: w, opacity: o, transform: `translateY(${(1 - o) * 18}px)`, fontFamily: mono ? T.mono : T.fonte, fontSize: size, color: cor ?? T.texto, textAlign: align, lineHeight: 1.2 }}>{children}</div>
  );
};

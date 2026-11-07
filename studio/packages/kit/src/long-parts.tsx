import { useTheme } from "@praeko/studio-core";
import { interpolate } from "remotion";

/* Parts for long videos (16:9): absolute position, GLOBAL time `t`, entry `q` (s). They use the brand theme. */
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
/** 0 -> 1 from `q` (linear, d = 0.3 s), as in long videos. */
export const appearL = (t: number, q: number, d = 0.3) => interpolate(t, [q, q + d], [0, 1], clamp);

const KW = /^(UPDATE|SET|WHERE|AND|INSERT|INTO|SELECT|FROM|CASE|WHEN|THEN|END|AS|VALUES|IS|NOT|NULL|const|await|if)$/;
const FN = /^(changes|abs|json_set|json_remove|json_extract)$/;

/** Colors a line of code/SQL (keywords, functions, numbers, strings, comments). */
export const colorize = (s: string, c: { text: string; muted: string; ok: string; accent: string; info: string }) =>
  s.split(/(--.*$|\/\/.*$|'[^']*'|\b\w+\b)/).map((p, i) => {
    if (!p) return null;
    let color = c.text;
    if (/^(--|\/\/)/.test(p)) color = c.muted;
    else if (/^'/.test(p)) color = c.ok;
    else if (KW.test(p)) color = c.accent;
    else if (/^\d+$/.test(p)) color = "#7fb4ff";
    else if (FN.test(p)) color = c.info;
    return <span key={i} style={{ color }}>{p}</span>;
  });

export type CodeLine = { s: string; hl?: [number, number]; red?: boolean };
/** Code block whose lines light up between `hl[0]` and `hl[1]` (global s). */
export const CodeL: React.FC<{ title: string; lines: CodeLine[]; t: number; q: number; w: number; size?: number; left: number; top: number }> = ({ title, lines, t, q, w, size = 32, left, top }) => {
  const T = useTheme();
  const o = appearL(t, q);
  return (
    <div style={{ position: "absolute", left, top, width: w, background: T.code, border: `3px solid #3a2f22`, borderRadius: 22, overflow: "hidden", opacity: o, transform: `translateY(${(1 - o) * 24}px)` }}>
      <div style={{ background: "#262034", padding: "10px 26px", fontFamily: T.mono, fontSize: 26, color: "#9a95b8", whiteSpace: "nowrap" }}>{title}</div>
      <div style={{ padding: "18px 0", fontFamily: T.mono, fontSize: size, lineHeight: 1.5 }}>
        {lines.map((l, i) => {
          const on = l.hl ? t >= l.hl[0] && t < l.hl[1] : false;
          return (
            <div key={i} style={{ whiteSpace: "pre", padding: "0 26px", borderLeft: `6px solid ${on ? (l.red ? T.error : T.accent) : "transparent"}`, background: on ? (l.red ? "rgba(255,107,94,.16)" : "rgba(244,185,66,.16)") : "transparent" }}>
              {colorize(l.s, T) || " "}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const CardL: React.FC<{ t: number; q: number; left: number; top: number; w: number; h?: number; color?: string; children: React.ReactNode }> = ({ t, q, left, top, w, h, color, children }) => {
  const T = useTheme();
  const o = appearL(t, q);
  return (
    <div style={{ position: "absolute", left, top, width: w, height: h, boxSizing: "border-box", background: T.longBox ?? T.box, border: `4px solid ${color ?? T.accent}`, borderRadius: 24, padding: "20px 28px", fontFamily: T.font, color: T.text, opacity: o, transform: `translateY(${(1 - o) * 26}px)`, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
      {children}
    </div>
  );
};

export const ChipL: React.FC<{ t: number; q: number; left: number; top: number; color?: string; size?: number; children: React.ReactNode }> = ({ t, q, left, top, color, size = 34, children }) => {
  const T = useTheme();
  const o = appearL(t, q);
  return (
    <div style={{ position: "absolute", left, top, opacity: o, transform: `scale(${1.15 - 0.15 * o})`, transformOrigin: "left center", fontFamily: T.font, fontSize: size, color: T.background, background: color ?? T.accent, borderRadius: 16, padding: "10px 26px", whiteSpace: "nowrap" }}>{children}</div>
  );
};

export const TextL: React.FC<{ t: number; q: number; left: number; top: number; w?: number; size?: number; color?: string; align?: "left" | "center"; mono?: boolean; children: React.ReactNode }> = ({ t, q, left, top, w, size = 44, color, align = "left", mono, children }) => {
  const T = useTheme();
  const o = appearL(t, q);
  return (
    <div style={{ position: "absolute", left, top, width: w, opacity: o, transform: `translateY(${(1 - o) * 18}px)`, fontFamily: mono ? T.mono : T.font, fontSize: size, color: color ?? T.text, textAlign: align, lineHeight: 1.2 }}>{children}</div>
  );
};

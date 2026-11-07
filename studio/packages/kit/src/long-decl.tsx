import { Composition } from "remotion";
import { FPS, Long, ThemeProvider, makeAtGlobal, useTheme } from "@praeko/studio-core";
import type { LongData, Theme, Word } from "@praeko/studio-core";
import { interpolate, Easing } from "remotion";
import { CardL, ChipL, CodeL, TextL, appearL } from "./long-parts.tsx";
import { Phone, Window } from "./parts.tsx";
import { LongCovers } from "./long-cover.tsx";
import type { LongCoverSpec } from "./long-cover.tsx";
import { resolveColor } from "./color.ts";

/* ============ Declarative long video: `episode.spec.json` (from episode.yaml, `format: long`) becomes a LongData ============ */
export type Time = number | string | { when: string; nth?: number; after?: number; plus?: number };
type Pos = { left?: number; top?: number; w?: number; h?: number };
export type ItemL = { type: string; when?: Time; pos?: Pos; color?: string; size?: number; text?: string; parts?: { text: string; color?: string; mono?: boolean }[]; [k: string]: any };
export type LongSceneSpec = { n?: string; title: string; start: number; items?: ItemL[]; component?: string };
export type LongSpec = {
  id: string; durS: number; voice: string; engine?: string; scenes: LongSceneSpec[]; cover?: LongCoverSpec;
  endcard?: { start: number; text?: string; link?: string; image?: string };
  mascot?: { when: Time; name: string; plus?: number }[];
};


const TextParts: React.FC<{ it: ItemL }> = ({ it }) => {
  const T = useTheme();
  if (!it.parts) return <>{it.text}</>;
  return <>{it.parts.map((p, i) => <span key={i} style={{ ...(p.color ? { color: resolveColor(T, p.color) } : {}), ...(p.mono ? { fontFamily: T.mono } : {}) }}>{p.text}</span>)}</>;
};


const clampL = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const BarL: React.FC<{ it: ItemL; t: number; q: number; T: Theme }> = ({ it, t, q, T }) => {
  const p = it.pos ?? {}, dur = it.duration ?? 1.4, v = it.value ?? 1, h = it.height ?? 46;
  const o = appearL(t, q), f = interpolate(t, [q, q + dur], [0, v], { ...clampL, easing: Easing.out(Easing.cubic) });
  const c = resolveColor(T, it.color) ?? T.accent;
  return (
    <div style={{ position: "absolute", left: p.left, top: p.top, width: p.w, opacity: o, fontFamily: T.font }}>
      {it.label ? <div style={{ fontSize: it.size ?? 30, color: T.muted, marginBottom: 8 }}>{it.label}</div> : null}
      <div style={{ position: "relative", height: h, borderRadius: h / 2, background: "rgba(255,255,255,.07)", border: `3px solid ${c}`, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${f * 100}%`, background: `linear-gradient(90deg, ${c}88, ${c})` }} />
        {it.text ? <div style={{ position: "absolute", right: 22, top: 0, bottom: 0, display: "flex", alignItems: "center", fontSize: Math.round(h * 0.55), color: T.text, fontWeight: 900, textShadow: "0 2px 8px rgba(0,0,0,.8)" }}>{it.text}</div> : null}
      </div>
    </div>
  );
};
const CounterL: React.FC<{ it: ItemL; t: number; q: number; T: Theme }> = ({ it, t, q, T }) => {
  const p = it.pos ?? {}, dur = it.duration ?? 1.6, a = it.from ?? 0, b = it.to ?? 0, decimals = it.decimals ?? 0;
  const o = appearL(t, q), n = interpolate(t, [q, q + dur], [a, b], { ...clampL, easing: Easing.out(Easing.cubic) });
  const s = n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); // pt-BR separators, as in 0.1.0
  return (
    <div style={{ position: "absolute", left: p.left, top: p.top, width: p.w, opacity: o, fontFamily: it.mono ? T.mono : T.font, fontSize: it.size ?? 96, fontWeight: 900, color: resolveColor(T, it.color) ?? T.accent, lineHeight: 1.1, textAlign: it.align === "center" ? "center" : "left" }}>
      {it.prefix ?? ""}{s}{it.suffix ?? ""}
    </div>
  );
};

export function longDataFromSpec(spec: LongSpec, words: Word[], T: Theme, components: Record<string, React.FC<{ t: number }>> = {}): LongData {
  const at = makeAtGlobal(words);
  const q = (x: Time): number => (typeof x === "number" ? x : typeof x === "string" ? at(x) : at(x.when, x.nth ?? 0, x.after ?? 0) + (x.plus ?? 0));
  const Item: React.FC<{ it: ItemL; t: number }> = ({ it, t }) => {
    const p = it.pos ?? {};
    switch (it.type) {
      case "code":
        return <CodeL title={it.title} t={t} q={q(it.when!)} w={p.w!} left={p.left!} top={p.top!} size={it.size}
          lines={(it.lines as any[]).map((l) => ({ s: l.s, ...(l.hl ? { hl: [q(l.hl[0]), q(l.hl[1])] as [number, number] } : {}), ...(l.red ? { red: true } : {}) }))} />;
      case "card":
        return <CardL t={t} q={q(it.when!)} left={p.left!} top={p.top!} w={p.w!} h={p.h} color={resolveColor(T, it.color)}>{(it.items as ItemL[]).map((f, i) => <Item key={i} it={f} t={t} />)}</CardL>;
      case "text": // a line inside a card
        return <div style={{ fontSize: it.size, color: resolveColor(T, it.color), ...(it.spacing ? { letterSpacing: it.spacing } : {}), ...(it.when !== undefined ? { opacity: appearL(t, q(it.when)) } : {}) }}><TextParts it={it} /></div>;
      case "chip":
        return <ChipL t={t} q={q(it.when!)} left={p.left!} top={p.top!} color={resolveColor(T, it.color)} size={it.size}>{it.text}</ChipL>;
      case "freetext":
        return <TextL t={t} q={q(it.when!)} left={p.left!} top={p.top!} w={p.w} size={it.size} color={resolveColor(T, it.color)} align={it.align === "center" ? "center" : "left"} mono={it.mono}><TextParts it={it} /></TextL>;
      case "video":
        return <Window t={t} q={q(it.when!)} src={it.src} clipDuration={it.clipDuration} from={it.from ?? 0} left={p.left!} top={p.top!} w={p.w!} reg={it.reg ?? [0, 0, 1920, 1080]} tag={it.tag ?? "footage"} dur={it.motionDuration ?? 20} />;
      case "phone":
        return <Phone t={t} q={q(it.when!)} src={it.src} clipDuration={it.clipDuration} from={it.from ?? 0} left={p.left!} top={p.top!} w={p.w!} dur={it.motionDuration ?? 20} />;
      case "bar":
        return <BarL it={it} t={t} q={q(it.when!)} T={T} />;
      case "counter":
        return <CounterL it={it} t={t} q={q(it.when!)} T={T} />;
      case "flow": {
        const nodes = (it.nodes as any[]) ?? [], size = it.size ?? 34, c0 = resolveColor(T, it.color) ?? T.accent;
        return (
          <div style={{ position: "absolute", left: p.left, top: p.top, width: p.w, display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: T.font }}>
            {nodes.map((n, i) => {
              const o = appearL(t, q(n.when)), c = resolveColor(T, n.color) ?? c0;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", flex: i < nodes.length - 1 ? 1 : undefined }}>
                  <div style={{ opacity: o, transform: `scale(${0.85 + 0.15 * o})`, background: T.longBox ?? T.box, border: `4px solid ${c}`, borderRadius: 22, padding: "16px 26px", fontSize: size, color: T.text, textAlign: "center", lineHeight: 1.2, whiteSpace: "pre-line" }}>{n.text}</div>
                  {i < nodes.length - 1 ? <div style={{ flex: 1, textAlign: "center", fontSize: size * 1.2, color: T.muted, opacity: appearL(t, q(nodes[i + 1].when)) }}>→</div> : null}
                </div>
              );
            })}
          </div>
        );
      }
      default:
        return <div style={{ color: "#f00", fontSize: 30 }}>unknown type: {it.type}</div>;
    }
  };
  const S = spec.scenes.map((c) => c.start);
  return {
    id: spec.id, durS: spec.durS, voice: spec.voice, words,
    ...(spec.endcard ? { endcard: { a: spec.endcard.start, text: spec.endcard.text, link: spec.endcard.link, image: spec.endcard.image } } : {}),
    scenes: spec.scenes.map((c, i) => ({
      n: c.n ?? String(i + 1), title: c.title, a: c.start, b: i + 1 < S.length ? S[i + 1] : spec.durS,
      C: c.component ? (components[c.component] ?? (() => <div style={{ color: "#f00", fontSize: 40 }}>component "{c.component}" is not registered</div>)) : ({ t }) => <>{(c.items ?? []).map((it, k) => <Item key={k} it={it} t={t} />)}</>,
    })),
  };
}

/** Registers the long video Composition (1920x1080). */
export const LongDecl: React.FC<{ spec: LongSpec; words: Word[]; theme: Theme; components?: Record<string, React.FC<{ t: number }>> }> = ({ spec, words, theme, components }) => {
  const d = longDataFromSpec(spec, words, theme, components);
  return (
    <>
      <Composition id={spec.id} component={() => <ThemeProvider theme={theme}><Long d={d} /></ThemeProvider>} durationInFrames={Math.round(spec.durS * FPS)} fps={FPS} width={d.width ?? 1920} height={d.height ?? 1080} />
      {spec.cover ? <LongCovers spec={spec.cover} theme={theme} /> : null}
    </>
  );
};

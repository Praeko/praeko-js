import { Composition, Still, useCurrentFrame } from "remotion";
import { Episode, FPS, ThemeProvider, makeAt, pop, ramp, appear, useTheme } from "@praeko/studio-core";
import type { EpisodeData, Theme, Word } from "@praeko/studio-core";
import { Bubble, Big, Box, Code, Frame, Line, Panel, Phone, SlideFrame, Window } from "./parts.tsx";
import { resolveColor } from "./color.ts";

/* ============ Declarative episode: `episode.spec.json` (generated from episode.yaml by `praeko studio compile`) becomes an EpisodeData ============ */

type Color = string; // theme name (accent, text, muted, ok, error, info, extra, box) or #hex
export type Item = { type: string; when?: string | [string, number]; at?: number; offset?: number; pos?: { left?: number; right?: number; top?: number; bottom?: number; w?: number; h?: number }; [k: string]: any };
export type SceneSpec = { start: number; end?: number; label?: string; sounds?: { at: number; sound: "pop" | "ding" | "thump" | "whoosh"; v?: number }[]; layout?: "panel" | "free"; title?: string; items?: Item[]; component?: string };
export type EpisodeSpec = {
  id: string; durS: number; captionPx?: number; voice: string; backgroundLines?: string[]; engine?: string;
  hits?: { at: number; type: "shake" | "zoom" | "flash" | "all" }[];
  outro: { a: number; cta: string };
  scenes: SceneSpec[];
  cover?: { id: string; component?: string; title?: [string, string, string?]; color?: Color; glow?: string; size?: number; items?: Item[] };
};

const style = (it: Item, base: React.CSSProperties = {}): React.CSSProperties => {
  const p = it.pos;
  return p ? { position: "absolute", left: p.left, right: p.right, top: p.top, bottom: p.bottom, width: p.w, height: p.h, ...base } : base;
};
const alignMap = { center: "center", start: "flex-start", end: "flex-end", stretch: "stretch" } as const;

const TextItem: React.FC<{ it: Item; t: number }> = ({ it, t }) => {
  const T = useTheme();
  const q = it.at ?? 0.3, lines = String(it.text).split("\n");
  const base: React.CSSProperties = {
    ...(it.font ? { fontFamily: it.font === "mono" ? T.mono : T.font } : {}), fontSize: it.size ?? 40, color: resolveColor(T, it.color) ?? T.text, ...(it.align === "left" ? { textAlign: "left" as const } : { textAlign: "center" as const }),
    ...(it.noFade ? {} : { opacity: appear(t, q) }), ...(it.lineHeight ? { lineHeight: it.lineHeight } : {}), ...(it.weight ? { fontWeight: it.weight } : {}),
    ...(it.pop ? { scale: String(pop(t, q)) } : {}), ...(it.noWrap ? { whiteSpace: "nowrap" } : {}),
  };
  return <div style={style(it, base)}>{lines.map((l, i) => <span key={i}>{l}{i < lines.length - 1 ? <br /> : null}</span>)}</div>;
};

const BarItem: React.FC<{ it: Item; t: number }> = ({ it, t }) => {
  const T = useTheme();
  const q = it.at ?? 0.3, pr = it.fill ?? {}, from = pr.from ?? 0, to = pr.to ?? 1;
  const p = pr.duration ? from + (to - from) * ramp(t, pr.start ?? q, (pr.start ?? q) + pr.duration) : to;
  const g = (it.gradient ?? [T.error, T.error]).map((c: string) => { const [n, ...r] = String(c).split(" "); return [resolveColor(T, n), ...r].join(" "); });
  const end = it.glowAtEnd && p > 0.98;
  const inner: React.CSSProperties = { width: `${p * 100}%`, height: "100%", background: it.gradientAngle === false ? g[0] : `linear-gradient(90deg, ${g.join(", ")})` };
  return (
    <div style={style(it, { height: it.height ?? 40, borderRadius: it.radius ?? 14, background: it.background ?? "#1d1812", ...(it.border === false ? {} : { border: `${it.border ?? 3}px solid #3a2f22` }), overflow: "hidden", ...(it.noFade ? {} : { opacity: appear(t, q) }), ...(end ? { boxShadow: `0 0 40px ${resolveColor(T, it.glowAtEnd)}` } : {}) })}>
      <div style={inner} />
    </div>
  );
};

/** Rows of bars with label and value (e.g. 3 heroes -> 13,500). */
const BarsItem: React.FC<{ it: Item; t: number }> = ({ it, t }) => {
  const T = useTheme();
  const q0 = it.at ?? 0.3;
  return (
    <div style={style(it, { display: "flex", flexDirection: "column", gap: it.gap ?? 16 })}>
      {(it.lines as any[]).map((l, i) => {
        const q = q0 + i * (it.step ?? 0.5);
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 18, opacity: appear(t, q) }}>
            <div style={{ width: it.labelWidth ?? 190, fontFamily: T.mono, fontSize: 30, color: T.muted, whiteSpace: "nowrap" }}>{l.label}</div>
            <div style={{ height: 34, width: (it.maxWidth ?? 640) * (l.value / it.max) * ramp(t, q, q + 0.9), borderRadius: 10, background: `linear-gradient(90deg, #b9453a, ${resolveColor(T, it.color) ?? T.error})` }} />
            <div style={{ fontFamily: T.mono, fontSize: 30, color: resolveColor(T, it.color) ?? T.error, fontWeight: 900 }}>{l.text}</div>
          </div>
        );
      })}
    </div>
  );
};

const Render: React.FC<{ it: Item; t: number; dur: number }> = ({ it, t, dur }) => {
  const T = useTheme();
  const q = it.at ?? 0.3;
  const children = (it.items as Item[] | undefined)?.map((f, i) => <Render key={i} it={f} t={t} dur={dur} />);
  switch (it.type) {
    case "text": return <TextItem it={it} t={t} />;
    case "big": return <div style={style(it, it.pos ? { display: "flex", justifyContent: "center" } : {})}><Big t={t} q={q} color={resolveColor(T, it.color)} size={it.size} mono={it.mono}>{it.text}</Big></div>;
    case "box": return <Box t={t} q={q} color={resolveColor(T, it.color) ?? T.accent} size={it.size} mono={it.mono} dim={it.dim} dash={it.dashed}>{it.text}</Box>;
    case "line": return <Line t={t} q={q} color={resolveColor(T, it.color)} size={it.size}>{(it.parts as any[]).map((p, i) => <span key={i} style={{ ...(p.mono ? { fontFamily: T.mono } : {}), ...(p.color ? { color: resolveColor(T, p.color) } : {}), ...(p.weight ? { fontWeight: p.weight } : {}) }}>{p.text}</span>)}</Line>;
    case "bubble": return <Bubble t={t} q={q} color={resolveColor(T, it.color) ?? T.info} author={it.author}>{it.text}</Bubble>;
    case "code": return <Code t={t} q={q} title={it.title} color={resolveColor(T, it.color) ?? T.error} lines={(it.lines as any[]).map((l) => ({ ...l, color: resolveColor(T, l.color) }))} />;
    case "window": return <Window t={t} q={q} src={it.src} clipDuration={it.clipDuration} from={it.from ?? 0} left={it.pos!.left!} top={it.pos!.top!} w={it.pos!.w!} reg={it.reg} tag={it.tag} dur={dur} />;
    case "phone": return <Phone t={t} q={q} src={it.src} clipDuration={it.clipDuration} from={it.from ?? 0} left={it.pos!.left!} top={it.pos!.top!} w={it.pos!.w!} dur={dur} />;
    case "bar": return <BarItem it={it} t={t} />;
    case "bars": return <BarsItem it={it} t={t} />;
    case "stack": return <div style={style(it, { display: "flex", flexDirection: "column", gap: it.gap ?? 20, alignItems: alignMap[(it.align as keyof typeof alignMap) ?? "stretch"] })}>{children}</div>;
    case "row": return <div style={style(it, it.spread ? { display: "flex", justifyContent: "space-between" } : it.center === false ? { display: "flex", gap: it.gap ?? 20 } : { display: "flex", justifyContent: "center", alignItems: "center", gap: it.gap ?? 20, whiteSpace: "nowrap" })}>{children}</div>;
    case "card": { const o = appear(t, q); return <div style={style(it, { background: T.box, border: `4px solid ${resolveColor(T, it.color) ?? T.accent}`, borderRadius: 24, padding: "20px 24px", fontFamily: T.mono, fontSize: it.size ?? 40, color: T.text, opacity: o, translate: `${(1 - o) * 60}px 0px` })}>{(it.lines as any[][]).map((l, i) => <span key={i}>{l.map((p, k) => <span key={k} style={{ ...(p.color ? { color: resolveColor(T, p.color) } : {}), ...(p.weight ? { fontWeight: p.weight } : {}) }}>{p.text}</span>)}{i < it.lines.length - 1 ? <br /> : null}</span>)}</div>; }
    default: return <div style={{ color: "#f00", fontSize: 30 }}>unknown type: {it.type}</div>;
  }
};

const SceneDecl: React.FC<{ spec: SceneSpec; panelDur: number; dur: number }> = ({ spec, panelDur, dur }) => {
  const t = useCurrentFrame() / FPS;
  const items = (spec.items ?? []).map((it, i) => <Render key={i} it={it} t={t} dur={dur} />);
  if ((spec.layout ?? "panel") === "free") return <>{items}</>;
  return <Panel title={spec.title ?? ""} dur={panelDur}>{items}</Panel>;
};

/** Replaces `when` ("phrase" or ["phrase", n]) with `at` (local scene seconds) in every item, recursively. */
const resolve = (it: Item, at: (f: string, n?: number) => number): Item => {
  const o: Item = { ...it };
  if (it.when !== undefined) { const [f, n] = Array.isArray(it.when) ? it.when : [it.when, 0]; o.at = at(f, n) + (it.offset ?? 0); delete o.when; }
  if (it.items) o.items = (it.items as Item[]).map((f) => resolve(f, at));
  return o;
};

/** Builds the EpisodeData: each scene becomes a component (declarative or, with `component`, a TSX of the project). */
export function episodeDataFromSpec(spec: EpisodeSpec, words: Word[], components: Record<string, React.FC<any>> = {}): EpisodeData {
  const S = spec.scenes.map((c) => c.start);
  const endOf = (i: number) => spec.scenes[i].end ?? (i + 1 < S.length ? S[i + 1] : spec.outro.a);
  const A = makeAt(words, S);
  return {
    id: spec.id, durS: spec.durS, captionPx: spec.captionPx, voice: spec.voice, words, backgroundLines: spec.backgroundLines, hits: spec.hits, outro: spec.outro,
    scenes: spec.scenes.map((c, i) => {
      const panelDur = endOf(i) - c.start;
      const resolved: SceneSpec = { ...c, items: c.items?.map((it) => resolve(it, (f, n) => A(i)(f, n))) };
      return {
        a: c.start, b: i + 1 < S.length ? S[i + 1] - 0.1 : endOf(i) - 0.1, label: c.label, sounds: c.sounds,
        C: c.component ? (components[c.component] ?? (() => <div style={{ color: "#f00", fontSize: 40 }}>component "{c.component}" is not registered</div>)) : ({ dur }) => <SceneDecl spec={resolved} panelDur={panelDur} dur={dur} />,
      };
    }),
  };
}

const CoverDecl: React.FC<{ spec: NonNullable<EpisodeSpec["cover"]> }> = ({ spec }) => {
  const T = useTheme();
  return <Frame glow={spec.glow ?? "rgba(244,185,66,.16)"} title={spec.title ?? ["", "", ""]} color={resolveColor(T, spec.color) ?? T.accent} size={spec.size}>{(spec.items ?? []).map((it, i) => <Render key={i} it={it} t={99} dur={99} />)}</Frame>;
};

/** `<EpisodeDecl spec words theme components />` registers the episode Composition and the cover Still. */
export const EpisodeDecl: React.FC<{ spec: EpisodeSpec; words: Word[]; theme: Theme; components?: Record<string, React.FC<any>> }> = ({ spec, words, theme, components = {} }) => {
  const d = episodeDataFromSpec(spec, words, components);
  const CoverC = spec.cover?.component ? components[spec.cover.component] : undefined;
  return (
    <>
      <Composition id={spec.id} component={() => <ThemeProvider theme={theme}><Episode d={d} /></ThemeProvider>} durationInFrames={Math.round(spec.durS * FPS)} fps={FPS} width={1080} height={1920} />
      {spec.cover ? <Still id={spec.cover.id} component={() => <ThemeProvider theme={theme}>{CoverC ? <CoverC /> : <CoverDecl spec={spec.cover!} />}</ThemeProvider>} width={1080} height={1920} /> : null}
    </>
  );
};

// ---------- image pieces: `format: image` (one slide) or `format: carousel` (2 to 20) in episode.yaml → one Still per slide (1080x1350, the 4:5 feed size) ----------
export const IMAGE_SIZES = { "4x5": { width: 1080, height: 1350 } } as const;
export type SlideSpec = { id: string; alt?: string; component?: string; title?: [string, string?, string?]; color?: Color; glow?: string; size?: number; items?: Item[] };
export type ImageSpec = { id: string; format: "image" | "carousel"; size?: keyof typeof IMAGE_SIZES; width?: number; height?: number; slides: SlideSpec[] };

const SlideDecl: React.FC<{ spec: SlideSpec }> = ({ spec }) => {
  const T = useTheme();
  return <SlideFrame glow={spec.glow ?? "rgba(244,185,66,.16)"} title={spec.title} color={resolveColor(T, spec.color) ?? T.accent} size={spec.size}>{(spec.items ?? []).map((it, i) => <Render key={i} it={it} t={99} dur={99} />)}</SlideFrame>;
};

/** `<ImageDecl spec theme components />` registers one Still per slide (id = `slides[].id`); there is no video Composition. */
export const ImageDecl: React.FC<{ spec: ImageSpec; theme: Theme; components?: Record<string, React.FC<any>> }> = ({ spec, theme, components = {} }) => {
  const { width, height } = IMAGE_SIZES[spec.size ?? "4x5"];
  return (
    <>
      {spec.slides.map((s) => {
        const C = s.component ? components[s.component] : undefined;
        return <Still key={s.id} id={s.id} component={() => <ThemeProvider theme={theme}>{C ? <C /> : <SlideDecl spec={s} />}</ThemeProvider>} width={width} height={height} />;
      })}
    </>
  );
};

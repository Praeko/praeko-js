import { Composition } from "remotion";
import { FPS, Longo, LongoData, Palavra, Tema, TemaProvider, mkAtG, useTema as useTemaLocal } from "@praeko/studio-core";
import { interpolate, Easing } from "remotion";
import { CartaoL, ChipL, CodigoL, TxtL, surgeL } from "./longo";
import { Celular, Janela } from "./pecas";
import { CapaLongoSpec, CapasLongo } from "./capa-longo";

/* ============ Longo declarativo: `episodio.spec.json` (de episodio.yaml, `formato: longo`) vira um LongoData ============ */
export type Tempo = number | string | { quando: string; nth?: number; depois?: number; mais?: number };
type Pos = { left?: number; top?: number; w?: number; h?: number };
export type ItemL = { tipo: string; quando?: Tempo; pos?: Pos; cor?: string; tamanho?: number; texto?: string; partes?: { texto: string; cor?: string; mono?: boolean }[]; [k: string]: any };
export type CenaLSpec = { n?: string; titulo: string; inicio: number; itens?: ItemL[]; componente?: string };
export type LongoSpec = { id: string; durS: number; voz: string; cenas: CenaLSpec[]; capa?: CapaLongoSpec; fecho?: { inicio: number; texto?: string; link?: string; imagem?: string } };

const cor = (T: Tema, c?: string) => (c && !c.startsWith("#") && (T as any)[c] ? (T as any)[c] : c);

const Partes: React.FC<{ it: ItemL }> = ({ it }) => {
  const T = useTemaLocal();
  if (!it.partes) return <>{it.texto}</>;
  return <>{it.partes.map((p, i) => <span key={i} style={{ ...(p.cor ? { color: cor(T, p.cor) } : {}), ...(p.mono ? { fontFamily: T.mono } : {}) }}>{p.texto}</span>)}</>;
};


const clampL = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const BarraL: React.FC<{ it: ItemL; t: number; q: number; T: Tema }> = ({ it, t, q, T }) => {
  const p = it.pos ?? {}, dur = it.duracao ?? 1.4, v = it.valor ?? 1, h = it.altura ?? 46;
  const o = surgeL(t, q), f = interpolate(t, [q, q + dur], [0, v], { ...clampL, easing: Easing.out(Easing.cubic) });
  const c = cor(T, it.cor) ?? T.destaque;
  return (
    <div style={{ position: "absolute", left: p.left, top: p.top, width: p.w, opacity: o, fontFamily: T.fonte }}>
      {it.rotulo ? <div style={{ fontSize: it.tamanho ?? 30, color: T.suave, marginBottom: 8 }}>{it.rotulo}</div> : null}
      <div style={{ position: "relative", height: h, borderRadius: h / 2, background: "rgba(255,255,255,.07)", border: `3px solid ${c}`, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${f * 100}%`, background: `linear-gradient(90deg, ${c}88, ${c})` }} />
        {it.texto ? <div style={{ position: "absolute", right: 22, top: 0, bottom: 0, display: "flex", alignItems: "center", fontSize: Math.round(h * 0.55), color: T.texto, fontWeight: 900, textShadow: "0 2px 8px rgba(0,0,0,.8)" }}>{it.texto}</div> : null}
      </div>
    </div>
  );
};
const ContadorL: React.FC<{ it: ItemL; t: number; q: number; T: Tema }> = ({ it, t, q, T }) => {
  const p = it.pos ?? {}, dur = it.duracao ?? 1.6, a = it.de ?? 0, b = it.ate ?? 0, casas = it.casas ?? 0;
  const o = surgeL(t, q), n = interpolate(t, [q, q + dur], [a, b], { ...clampL, easing: Easing.out(Easing.cubic) });
  const s = n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return (
    <div style={{ position: "absolute", left: p.left, top: p.top, width: p.w, opacity: o, fontFamily: it.mono ? T.mono : T.fonte, fontSize: it.tamanho ?? 96, fontWeight: 900, color: cor(T, it.cor) ?? T.destaque, lineHeight: 1.1, textAlign: it.alinhar === "centro" ? "center" : "left" }}>
      {it.prefixo ?? ""}{s}{it.sufixo ?? ""}
    </div>
  );
};

export function longoDeSpec(spec: LongoSpec, palavras: Palavra[], T: Tema, pecas: Record<string, React.FC<{ t: number }>> = {}): LongoData {
  const at = mkAtG(palavras);
  const q = (x: Tempo): number => (typeof x === "number" ? x : typeof x === "string" ? at(x) : at(x.quando, x.nth ?? 0, x.depois ?? 0) + (x.mais ?? 0));
  const Item: React.FC<{ it: ItemL; t: number }> = ({ it, t }) => {
    const p = it.pos ?? {};
    switch (it.tipo) {
      case "codigo":
        return <CodigoL titulo={it.titulo} t={t} q={q(it.quando!)} w={p.w!} left={p.left!} top={p.top!} size={it.tamanho}
          lines={(it.linhas as any[]).map((l) => ({ s: l.s, ...(l.hl ? { hl: [q(l.hl[0]), q(l.hl[1])] as [number, number] } : {}), ...(l.vermelho ? { red: true } : {}) }))} />;
      case "cartao":
        return <CartaoL t={t} q={q(it.quando!)} left={p.left!} top={p.top!} w={p.w!} h={p.h} cor={cor(T, it.cor)}>{(it.itens as ItemL[]).map((f, i) => <Item key={i} it={f} t={t} />)}</CartaoL>;
      case "texto": // linha dentro de um cartão
        return <div style={{ fontSize: it.tamanho, color: cor(T, it.cor), ...(it.espacar ? { letterSpacing: it.espacar } : {}), ...(it.quando !== undefined ? { opacity: surgeL(t, q(it.quando)) } : {}) }}><Partes it={it} /></div>;
      case "chip":
        return <ChipL t={t} q={q(it.quando!)} left={p.left!} top={p.top!} cor={cor(T, it.cor)} size={it.tamanho}>{it.texto}</ChipL>;
      case "txt":
        return <TxtL t={t} q={q(it.quando!)} left={p.left!} top={p.top!} w={p.w} size={it.tamanho} cor={cor(T, it.cor)} align={it.alinhar === "centro" ? "center" : "left"} mono={it.mono}><Partes it={it} /></TxtL>;
      case "video":
        return <Janela t={t} q={q(it.quando!)} src={it.src} duracao={it.duracaoClipe} de={it.de ?? 0} left={p.left!} top={p.top!} w={p.w!} reg={it.reg ?? [0, 0, 1920, 1080]} tag={it.tag ?? "jogo"} dur={it.dur ?? 20} />;
      case "celular":
        return <Celular t={t} q={q(it.quando!)} src={it.src} duracao={it.duracaoClipe} de={it.de ?? 0} left={p.left!} top={p.top!} w={p.w!} dur={it.dur ?? 20} />;
      case "barra":
        return <BarraL it={it} t={t} q={q(it.quando!)} T={T} />;
      case "contador":
        return <ContadorL it={it} t={t} q={q(it.quando!)} T={T} />;
      case "fluxo": {
        const nos = (it.nos as any[]) ?? [], tam = it.tamanho ?? 34, c0 = cor(T, it.cor) ?? T.destaque;
        return (
          <div style={{ position: "absolute", left: p.left, top: p.top, width: p.w, display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: T.fonte }}>
            {nos.map((n, i) => {
              const o = surgeL(t, q(n.quando)), c = cor(T, n.cor) ?? c0;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", flex: i < nos.length - 1 ? 1 : undefined }}>
                  <div style={{ opacity: o, transform: `scale(${0.85 + 0.15 * o})`, background: T.caixaLongo ?? T.caixa, border: `4px solid ${c}`, borderRadius: 22, padding: "16px 26px", fontSize: tam, color: T.texto, textAlign: "center", lineHeight: 1.2, whiteSpace: "pre-line" }}>{n.texto}</div>
                  {i < nos.length - 1 ? <div style={{ flex: 1, textAlign: "center", fontSize: tam * 1.2, color: T.suave, opacity: surgeL(t, q(nos[i + 1].quando)) }}>→</div> : null}
                </div>
              );
            })}
          </div>
        );
      }
      default:
        return <div style={{ color: "#f00", fontSize: 30 }}>tipo desconhecido: {it.tipo}</div>;
    }
  };
  const S = spec.cenas.map((c) => c.inicio);
  return {
    id: spec.id, durS: spec.durS, voz: spec.voz, palavras,
    ...(spec.fecho ? { fecho: { a: spec.fecho.inicio, texto: spec.fecho.texto, link: spec.fecho.link, imagem: spec.fecho.imagem } } : {}),
    cenas: spec.cenas.map((c, i) => ({
      n: c.n ?? String(i + 1), titulo: c.titulo, a: c.inicio, b: i + 1 < S.length ? S[i + 1] : spec.durS,
      C: c.componente ? (pecas[c.componente] ?? (() => <div style={{ color: "#f00", fontSize: 40 }}>componente "{c.componente}" não registrado</div>)) : ({ t }) => <>{(c.itens ?? []).map((it, k) => <Item key={k} it={it} t={t} />)}</>,
    })),
  };
}

/** Registra a Composition do longo (1920×1080). */
export const LongoDecl: React.FC<{ spec: LongoSpec; palavras: Palavra[]; tema: Tema; pecas?: Record<string, React.FC<{ t: number }>> }> = ({ spec, palavras, tema, pecas }) => {
  const d = longoDeSpec(spec, palavras, tema, pecas);
  return (
    <>
      <Composition id={spec.id} component={() => <TemaProvider tema={tema}><Longo d={d} /></TemaProvider>} durationInFrames={Math.round(spec.durS * FPS)} fps={FPS} width={d.largura ?? 1920} height={d.altura ?? 1080} />
      {spec.capa ? <CapasLongo spec={spec.capa} tema={tema} /> : null}
    </>
  );
};

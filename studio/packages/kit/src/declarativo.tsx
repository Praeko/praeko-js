import { Composition, Still, useCurrentFrame } from "remotion";
import { EpData, Episodio, FPS, Palavra, TemaProvider, Tema, mkAt, pop, ramp, surge, useTema } from "@praeko/studio-core";
import { Balao, Big, Caixa, Celular, Codigo, Janela, Linha, Moldura, PainelD } from "./pecas";

/* ============ Episódio declarativo: o `episodio.compilado.json` (gerado de episodio.yaml por `praeko studio compilar`) vira um EpData ============ */

type Cor = string; // nome do tema (destaque, ok, erro, info, extra, suave, texto, caixa) ou #hex
export type Item = { tipo: string; quando?: string | [string, number]; em?: number; pos?: { left?: number; right?: number; top?: number; bottom?: number; w?: number; h?: number }; [k: string]: any };
export type CenaSpec = { inicio: number; fim?: number; rotulo?: string; sons?: { at: number; f: "pop" | "ding" | "thump" | "whoosh"; v?: number }[]; layout?: "painel" | "livre"; titulo?: string; itens?: Item[]; componente?: string };
export type EpSpec = {
  id: string; durS: number; legendaPx?: number; voz: string; fundoLinhas?: string[];
  golpes?: { at: number; tipo: "shake" | "zoom" | "flash" | "tudo" }[];
  fechamento: { a: number; cta: string };
  cenas: CenaSpec[];
  capa?: { id: string; componente?: string; titulo?: [string, string, string?]; cor?: Cor; glow?: string; tam?: number; itens?: Item[] };
};

const cor = (T: Tema, c?: Cor): string | undefined => (c ? ((T as any)[c] && !c.startsWith("#") ? (T as any)[c] : c) : undefined);
const estilo = (it: Item, base: React.CSSProperties = {}): React.CSSProperties => {
  const p = it.pos;
  return p ? { position: "absolute", left: p.left, right: p.right, top: p.top, bottom: p.bottom, width: p.w, height: p.h, ...base } : base;
};
const alinhar = { centro: "center", inicio: "flex-start", fim: "flex-end", esticar: "stretch" } as const;

const Texto: React.FC<{ it: Item; t: number }> = ({ it, t }) => {
  const T = useTema();
  const q = it.em ?? 0.3, linhas = String(it.texto).split("\n");
  const base: React.CSSProperties = {
    ...(it.fonte ? { fontFamily: it.fonte === "mono" ? T.mono : T.fonte } : {}), fontSize: it.tamanho ?? 40, color: cor(T, it.cor) ?? T.texto, ...(it.alinhar === "esquerda" ? { textAlign: "left" as const } : { textAlign: "center" as const }),
    ...(it.semFade ? {} : { opacity: surge(t, q) }), ...(it.altura ? { lineHeight: it.altura } : {}), ...(it.peso ? { fontWeight: it.peso } : {}),
    ...(it.pop ? { scale: String(pop(t, q)) } : {}), ...(it.semQuebra ? { whiteSpace: "nowrap" } : {}),
  };
  return <div style={estilo(it, base)}>{linhas.map((l, i) => <span key={i}>{l}{i < linhas.length - 1 ? <br /> : null}</span>)}</div>;
};

const Barra: React.FC<{ it: Item; t: number }> = ({ it, t }) => {
  const T = useTema();
  const q = it.em ?? 0.3, pr = it.preenche ?? {}, de = pr.de ?? 0, ate = pr.ate ?? 1;
  const p = pr.duracao ? de + (ate - de) * ramp(t, pr.inicio ?? q, (pr.inicio ?? q) + pr.duracao) : ate;
  const g = (it.gradiente ?? [T.erro, T.erro]).map((c: string) => { const [n, ...r] = String(c).split(" "); return [cor(T, n), ...r].join(" "); });
  const fim = it.brilhoAoFim && p > 0.98;
  const dentro: React.CSSProperties = { width: `${p * 100}%`, height: "100%", background: it.gradienteAngulo === false ? g[0] : `linear-gradient(90deg, ${g.join(", ")})` };
  return (
    <div style={estilo(it, { height: it.altura ?? 40, borderRadius: it.raio ?? 14, background: it.fundo ?? "#1d1812", ...(it.borda === false ? {} : { border: `${it.borda ?? 3}px solid #3a2f22` }), overflow: "hidden", ...(it.semFade ? {} : { opacity: surge(t, q) }), ...(fim ? { boxShadow: `0 0 40px ${cor(T, it.brilhoAoFim)}` } : {}) })}>
      <div style={dentro} />
    </div>
  );
};

/** Linhas de barras com rótulo e valor (ex.: 3 heróis → 13.500). */
const Barras: React.FC<{ it: Item; t: number }> = ({ it, t }) => {
  const T = useTema();
  const q0 = it.em ?? 0.3;
  return (
    <div style={estilo(it, { display: "flex", flexDirection: "column", gap: it.gap ?? 16 })}>
      {(it.linhas as any[]).map((l, i) => {
        const q = q0 + i * (it.passo ?? 0.5);
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 18, opacity: surge(t, q) }}>
            <div style={{ width: it.larguraRotulo ?? 190, fontFamily: T.mono, fontSize: 30, color: T.suave, whiteSpace: "nowrap" }}>{l.rotulo}</div>
            <div style={{ height: 34, width: (it.larguraMax ?? 640) * (l.valor / it.max) * ramp(t, q, q + 0.9), borderRadius: 10, background: `linear-gradient(90deg, #b9453a, ${cor(T, it.cor) ?? T.erro})` }} />
            <div style={{ fontFamily: T.mono, fontSize: 30, color: cor(T, it.cor) ?? T.erro, fontWeight: 900 }}>{l.texto}</div>
          </div>
        );
      })}
    </div>
  );
};

const Render: React.FC<{ it: Item; t: number; dur: number }> = ({ it, t, dur }) => {
  const T = useTema();
  const q = it.em ?? 0.3;
  const filhos = (it.itens as Item[] | undefined)?.map((f, i) => <Render key={i} it={f} t={t} dur={dur} />);
  switch (it.tipo) {
    case "texto": return <Texto it={it} t={t} />;
    case "big": return <div style={estilo(it, it.pos ? { display: "flex", justifyContent: "center" } : {})}><Big t={t} q={q} cor={cor(T, it.cor)} size={it.tamanho} mono={it.mono}>{it.texto}</Big></div>;
    case "caixa": return <Caixa t={t} q={q} cor={cor(T, it.cor) ?? T.destaque} size={it.tamanho} mono={it.mono} dim={it.apagada} dash={it.tracejada}>{it.texto}</Caixa>;
    case "linha": return <Linha t={t} q={q} cor={cor(T, it.cor)} size={it.tamanho}>{(it.partes as any[]).map((p, i) => <span key={i} style={{ ...(p.mono ? { fontFamily: T.mono } : {}), ...(p.cor ? { color: cor(T, p.cor) } : {}), ...(p.peso ? { fontWeight: p.peso } : {}) }}>{p.texto}</span>)}</Linha>;
    case "balao": return <Balao t={t} q={q} cor={cor(T, it.cor) ?? T.info} autor={it.autor}>{it.texto}</Balao>;
    case "codigo": return <Codigo t={t} q={q} titulo={it.titulo} cor={cor(T, it.cor) ?? T.erro} linhas={(it.linhas as any[]).map((l) => ({ ...l, cor: cor(T, l.cor) }))} />;
    case "janela": return <Janela t={t} q={q} src={it.src} duracao={it.duracaoClipe} de={it.de ?? 0} left={it.pos!.left!} top={it.pos!.top!} w={it.pos!.w!} reg={it.reg} tag={it.tag} dur={dur} />;
    case "celular": return <Celular t={t} q={q} src={it.src} duracao={it.duracaoClipe} de={it.de ?? 0} left={it.pos!.left!} top={it.pos!.top!} w={it.pos!.w!} dur={dur} />;
    case "barra": return <Barra it={it} t={t} />;
    case "barras": return <Barras it={it} t={t} />;
    case "pilha": return <div style={estilo(it, { display: "flex", flexDirection: "column", gap: it.gap ?? 20, alignItems: alinhar[(it.alinhar as keyof typeof alinhar) ?? "esticar"] })}>{filhos}</div>;
    case "fila": return <div style={estilo(it, it.espalhar ? { display: "flex", justifyContent: "space-between" } : it.centrar === false ? { display: "flex", gap: it.gap ?? 20 } : { display: "flex", justifyContent: "center", alignItems: "center", gap: it.gap ?? 20, whiteSpace: "nowrap" })}>{filhos}</div>;
    case "cartao": { const o = surge(t, q); return <div style={estilo(it, { background: T.caixa, border: `4px solid ${cor(T, it.cor) ?? T.destaque}`, borderRadius: 24, padding: "20px 24px", fontFamily: T.mono, fontSize: it.tamanho ?? 40, color: T.texto, opacity: o, translate: `${(1 - o) * 60}px 0px` })}>{(it.linhas as any[][]).map((l, i) => <span key={i}>{l.map((p, k) => <span key={k} style={{ ...(p.cor ? { color: cor(T, p.cor) } : {}), ...(p.peso ? { fontWeight: p.peso } : {}) }}>{p.texto}</span>)}{i < it.linhas.length - 1 ? <br /> : null}</span>)}</div>; }
    default: return <div style={{ color: "#f00", fontSize: 30 }}>tipo desconhecido: {it.tipo}</div>;
  }
};

const CenaDecl: React.FC<{ spec: CenaSpec; painelDur: number; dur: number }> = ({ spec, painelDur, dur }) => {
  const t = useCurrentFrame() / FPS;
  const itens = (spec.itens ?? []).map((it, i) => <Render key={i} it={it} t={t} dur={dur} />);
  if ((spec.layout ?? "painel") === "livre") return <>{itens}</>;
  return <PainelD titulo={spec.titulo ?? ""} dur={painelDur}>{itens}</PainelD>;
};

/** Troca `quando` ("frase" ou ["frase", n]) por `em` (s locais da cena) em todos os itens, recursivamente. */
const resolver = (it: Item, at: (f: string, n?: number) => number): Item => {
  const o: Item = { ...it };
  if (it.quando !== undefined) { const [f, n] = Array.isArray(it.quando) ? it.quando : [it.quando, 0]; o.em = at(f, n) + (it.deslocar ?? 0); delete o.quando; }
  if (it.itens) o.itens = (it.itens as Item[]).map((f) => resolver(f, at));
  return o;
};

/** Monta o EpData: cada cena vira um componente (declarativo ou, com `componente`, um TSX do projeto). */
export function epDataDeSpec(spec: EpSpec, palavras: Palavra[], pecas: Record<string, React.FC<any>> = {}): EpData {
  const S = spec.cenas.map((c) => c.inicio);
  const fimDe = (i: number) => spec.cenas[i].fim ?? (i + 1 < S.length ? S[i + 1] : spec.fechamento.a);
  const A = mkAt(palavras, S);
  return {
    id: spec.id, durS: spec.durS, legendaPx: spec.legendaPx, voz: spec.voz, palavras, fundoLinhas: spec.fundoLinhas, golpes: spec.golpes, fechamento: spec.fechamento,
    cenas: spec.cenas.map((c, i) => {
      const painelDur = fimDe(i) - c.inicio;
      const rs: CenaSpec = { ...c, itens: c.itens?.map((it) => resolver(it, (f, n) => A(i)(f, n))) };
      return {
        a: c.inicio, b: i + 1 < S.length ? S[i + 1] - 0.1 : fimDe(i) - 0.1, rotulo: c.rotulo, sons: c.sons,
        C: c.componente ? (pecas[c.componente] ?? (() => <div style={{ color: "#f00", fontSize: 40 }}>componente "{c.componente}" não registrado</div>)) : ({ dur }) => <CenaDecl spec={rs} painelDur={painelDur} dur={dur} />,
      };
    }),
  };
}

const CapaDecl: React.FC<{ spec: NonNullable<EpSpec["capa"]>; palavras: Palavra[] }> = ({ spec }) => {
  const T = useTema();
  return <Moldura glow={spec.glow ?? "rgba(244,185,66,.16)"} titulo={spec.titulo ?? ["", "", ""]} cor={cor(T, spec.cor) ?? T.destaque} tam={spec.tam}>{(spec.itens ?? []).map((it, i) => <Render key={i} it={it} t={99} dur={99} />)}</Moldura>;
};

/** `<EpisodioDecl spec palavras tema pecas />` registra a Composition do episódio e a Still da capa. */
export const EpisodioDecl: React.FC<{ spec: EpSpec; palavras: Palavra[]; tema: Tema; pecas?: Record<string, React.FC<any>> }> = ({ spec, palavras, tema, pecas = {} }) => {
  const d = epDataDeSpec(spec, palavras, pecas);
  const CapaC = spec.capa?.componente ? pecas[spec.capa.componente] : undefined;
  return (
    <>
      <Composition id={spec.id} component={() => <TemaProvider tema={tema}><Episodio d={d} /></TemaProvider>} durationInFrames={Math.round(spec.durS * FPS)} fps={FPS} width={1080} height={1920} />
      {spec.capa ? <Still id={spec.capa.id} component={() => <TemaProvider tema={tema}>{CapaC ? <CapaC /> : <CapaDecl spec={spec.capa!} palavras={palavras} />}</TemaProvider>} width={1080} height={1920} /> : null}
    </>
  );
};

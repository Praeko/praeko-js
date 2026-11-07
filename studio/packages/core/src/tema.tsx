import { createContext, useContext } from "react";

/** Tokens de marca. Tudo que é cor, fonte, nome e avatar vem daqui; o motor e o kit não conhecem nenhuma marca. */
export type Tema = {
  fundo: string;      // fundo dos episódios
  fundoCapa: string;  // fundo das capas
  destaque: string;   // cor principal (ex.: âmbar)
  texto: string;
  suave: string;      // texto secundário
  ok: string;
  erro: string;
  info: string;
  extra: string;
  caixa: string;      // fundo de cartões
  caixaLongo?: string; // fundo de cartões nos longos (padrão: caixa)
  codigo: string;     // fundo de blocos de código
  fonte: string;      // títulos e legendas
  mono: string;
  handle: string;     // ex.: @meucanal
  avatar: string;     // caminho em public/
};

export const TEMA_PADRAO: Tema = {
  fundo: "#14110f", fundoCapa: "#0e0c14", destaque: "#f4b942", texto: "#f3ece0", suave: "#a89c8a", ok: "#7ee787", erro: "#ff6b5e",
  info: "#7fd7ff", extra: "#a98bff", caixa: "#2a2118", codigo: "#1b1610",
  fonte: "'Arial Black', 'Helvetica Neue', system-ui, sans-serif", mono: "Menlo, 'Courier New', monospace",
  handle: "@seucanal", avatar: "capa/avatar.png",
};

const Ctx = createContext<Tema>(TEMA_PADRAO);
export const TemaProvider: React.FC<{ tema: Tema; children: React.ReactNode }> = ({ tema, children }) => <Ctx.Provider value={tema}>{children}</Ctx.Provider>;
export const useTema = () => useContext(Ctx);

/** Lê o `marca.json` de um projeto (campos que faltarem usam o tema padrão). */
export const temaDaMarca = (m: { cores?: Partial<Tema>; fontes?: { titulo?: string; mono?: string }; handle?: string; avatar?: string }): Tema => ({
  ...TEMA_PADRAO,
  ...(m.cores || {}),
  ...(m.fontes?.titulo ? { fonte: m.fontes.titulo } : {}),
  ...(m.fontes?.mono ? { mono: m.fontes.mono } : {}),
  ...(m.handle ? { handle: m.handle } : {}),
  ...(m.avatar ? { avatar: m.avatar } : {}),
});

/** "#f4b942" + 0.16 → "rgba(244,185,66,0.16)". */
export const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

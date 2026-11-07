// Alinhamento pelo roteiro: usa a GRAFIA do roteiro com os TEMPOS da transcrição.
// A transcrição (Scribe ou Whisper) erra termos técnicos ("Sbuild", "0,40"); o roteiro é o texto certo. Números ficam como a
// transcrição escreveu (dígitos são mais legíveis na legenda) e não entram no pareamento.
const NUM = new Set("zero um uma dois duas três tres quatro cinco seis sete oito nove dez onze doze treze catorze quatorze quinze dezesseis dezessete dezoito dezenove vinte trinta quarenta cinquenta sessenta setenta oitenta noventa cem cento duzentos duzentas trezentos trezentas quatrocentos quatrocentas quinhentos quinhentas seiscentos seiscentas setecentos setecentas oitocentos oitocentas novecentos novecentas mil milhão milhões bilhão bilhões meio meia primeiro primeira".split(" "));
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const ehNumero = (s) => /\d/.test(s);

/** Tira tags [..], quebra em palavras e descarta as corridas de número por extenso ("quatro mil e quinhentos"). */
export function palavrasDoRoteiro(roteiro) {
  const toks = roteiro.replace(/\[[^\]]*\]/g, " ").split(/\s+/).filter(Boolean);
  const isNum = (t) => NUM.has(norm(t));
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], n = norm(t);
    if (isNum(t)) continue;
    // "e" entre dois números por extenso faz parte do número
    if (n === "e" && i > 0 && i < toks.length - 1 && isNum(toks[i - 1]) && isNum(toks[i + 1])) continue;
    out.push(t);
  }
  return out;
}

const lev = (a, b) => {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
};
const pontos = (a, b) => (a === b ? 3 : a.length > 3 && b.length > 3 && lev(a, b) <= Math.max(2, Math.floor(Math.max(a.length, b.length) / 3)) ? 1 : -2);

/** `palavras`: [{ t, a, b }] da transcrição; `roteiro`: texto original. Devolve `{ palavras, trocadas }`. */
export function alinharPeloRoteiro(palavras, roteiro) {
  const S = palavrasDoRoteiro(roteiro), sn = S.map(norm);
  const idxA = palavras.map((p, i) => i).filter((i) => !ehNumero(palavras[i].t));
  const an = idxA.map((i) => norm(palavras[i].t));
  const n = an.length, m = sn.length, GAP = -1;
  const D = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) D[i][0] = i * GAP;
  for (let j = 1; j <= m; j++) D[0][j] = j * GAP;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) D[i][j] = Math.max(D[i - 1][j - 1] + pontos(an[i - 1], sn[j - 1]), D[i - 1][j] + GAP, D[i][j - 1] + GAP);
  const par = new Map();
  for (let i = n, j = m; i > 0 && j > 0;) {
    if (D[i][j] === D[i - 1][j - 1] + pontos(an[i - 1], sn[j - 1])) { if (pontos(an[i - 1], sn[j - 1]) > 0) par.set(idxA[i - 1], S[j - 1]); i--; j--; }
    else if (D[i][j] === D[i - 1][j] + GAP) i--;
    else j--;
  }
  let trocadas = 0;
  const corrigidas = [];
  const out = palavras.map((p, i) => {
    const s = par.get(i);
    if (!s) return p;
    const a = norm(p.t), b = norm(s);
    const limpo0 = s.replace(/^["'(]+|[.,!?:;"')]+$/g, "");
    if (a === b) {                                            // mesma palavra: só corrige acento (ninguem → ninguém); o resto da grafia fica como a transcrição escreveu
      const sem = (x) => x.replace(/^["'(]+|[.,!?:;"')]+$/g, "").toLowerCase();
      if (sem(p.t) === sem(limpo0)) return p;
      const fim0 = (p.t.match(/[.,!?:;"')]+$/) || [""])[0];
      const cap = /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(p.t) ? limpo0[0].toUpperCase() + limpo0.slice(1) : limpo0.toLowerCase();
      trocadas++; corrigidas.push([p.t, cap + fim0, p.a]);
      return { ...p, t: cap + fim0 };
    }
    const d = lev(a, b);
    if (a.length < 5 || d < 1 || d > 2 || /[\d-]/.test(s)) return p; // só corrige quase-acertos (esbuild/Sbuild); o resto fica para `legendaCorrige`
    const fim = (p.t.match(/[.,!?:;"')]+$/) || [""])[0];
    const limpo = s.replace(/^["'(]+|[.,!?:;"')]+$/g, "");
    trocadas++; corrigidas.push([p.t, limpo + fim, p.a]);
    return { ...p, t: limpo + fim, _fix: true, _orig: p.t };
  });
  // fragmento curto sem par antes de uma palavra corrigida ("S" + "-Build" → esbuild): funde na palavra certa
  const fim2 = [];
  out.forEach((p, i) => {
    const ant = fim2[fim2.length - 1];
    if (p._fix && ant && !ant._fix && !par.has(i - 1) && norm(ant.t).length <= 3 && lev(norm(ant.t) + norm(p._orig), norm(p.t)) <= 1) { ant.t = p.t; ant.b = p.b; ant._fix = true; return; }
    fim2.push({ ...p });
  });
  const limpa = fim2.map(({ _fix, _orig, ...r }) => r);
  return { palavras: limpa, trocadas, corrigidas };
}

/** O Whisper às vezes quebra "4.500" em "4" e ".500": junta fragmentos numéricos vizinhos. */
export function juntarNumeros(palavras) {
  const out = [];
  for (const p of palavras) {
    const ant = out[out.length - 1];
    if (ant && /\d$/.test(ant.t) && /^[.,]\d/.test(p.t)) { ant.t += p.t; ant.b = p.b; continue; }
    out.push({ ...p });
  }
  return out;
}

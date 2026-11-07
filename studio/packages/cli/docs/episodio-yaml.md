# Episódio em YAML

`episodios/<slug>/episodio.yaml` descreve o Short; `praeko studio compilar <slug>` (ou `render`/`capa`, que compilam sozinhos) confere e gera `episodio.spec.json`, que o `EpisodioDecl` do `@praeko/studio-kit` lê. O `episodio.tsx` é fixo (criado por `praeko studio novo`). O que o YAML não cobre vai em `cenas.tsx` e é chamado por `componente:`.

## Topo
```yaml
id: ComentarioTimestamp          # nome da Composition (padrão: o de episodio.json)
duracao: 60.2                    # s, vídeo inteiro
legenda: 80                      # px da legenda palavra a palavra
voz: audio/comentario-timestamp.mp3
fundo: ["linhas que flutuam no fundo", "…"]
golpes: [{ em: 31.5, tipo: flash }, { em: 44.9, tipo: zoom }]   # shake | zoom | flash | tudo
fechamento: { inicio: 52.4, cta: ARTIGO NO DEVLOG }
capa: { id: CapaComentario, componente: CapaComentario }          # TSX em cenas.tsx; ou titulo/cor/glow/tam/itens
cenas: [ … ]
```

## Tempos por frase (acompanham a voz)
Em `duracao`, `fechamento.inicio`, `golpes[].em` e no `inicio`/`fim` das cenas vale: número (s) · `"frase"` (início da frase na voz) · `{ quando: "frase", nth: 1, depois: 20, mais: -0.1 }` · `{ voz: 2.5 }` (2,5 s depois do fim da voz; negativo = antes). Resolvido no `praeko studio compilar` com o `palavras.json` atual, então basta recompilar (o `render` já faz) depois de uma voz nova ou de um `praeko studio corte --refazer`. Exemplo: `duracao: { voz: 2.5 }`, `fechamento: { inicio: { voz: -2 }, cta: … }`, `inicio: { quando: "Agora um bug real", mais: -0.1 }`.

## Cena
```yaml
- inicio: 7.05          # s; a cena vai até o inicio da próxima (ou `fim:`, ou o fechamento)
  fim: 52.35            # opcional; muda só a saída do painel
  titulo: FUI CONFERIR  # faixa do PainelD (layout padrão: painel)
  layout: painel | livre   # livre = itens soltos na tela (posição absoluta, vídeos)
  rotulo: FUI CONFERIR  # etiqueta curta da cena
  sons: [{ at: 0.2, f: pop }]      # s locais; pop | ding | thump | whoosh
  itens: [ … ]          # ou `componente: NomeEmCenas` (um dos dois)
```

## Itens
Todo item tem `tipo`. **Quando aparece:** `quando: "frase"` (ou `[frase, n]` para a n-ésima ocorrência, a partir de 0) liga ao instante da voz em que a frase começa; `deslocar: 0.4` soma segundos; `em: 1.2` é em segundos desde o início da cena. Frase não encontrada na voz é erro. Posição absoluta: `pos: { esquerda, direita, topo, base, largura, altura }`. Cores: nomes do tema (`destaque texto suave ok erro info extra caixa`) ou `#hex`. **Dentro de `{ … }`, texto com vírgula vai entre aspas.**

| tipo | campos |
|---|---|
| `texto` | `texto` (`\n` quebra), `tamanho`, `cor`, `fonte` (`padrao`, `mono`; omitido herda), `alinhar: esquerda`, `altura`, `peso`, `pop`, `semFade`, `semQuebra` |
| `big` | `texto`, `tamanho`, `cor`, `mono` |
| `caixa` | `texto`, `tamanho`, `cor`, `mono`, `apagada`, `tracejada` |
| `linha` | `partes: [{texto, mono, cor, peso}]`, `tamanho`, `cor` |
| `balao` | `texto`, `cor`, `autor` |
| `codigo` | `titulo`, `cor`, `linhas: [{s, cor, marca}]` |
| `cartao` | `linhas: [[{texto, cor, peso}]]`, `tamanho`, `cor` (entra deslizando) |
| `barra` | `altura`, `raio`, `gradiente: [cor, "cor 60%", …]`, `borda: false`, `preenche: {de, ate, inicio, duracao}`, `brilhoAoFim`, `semFade` |
| `barras` | `linhas: [{rotulo, valor, texto}]`, `max`, `larguraMax`, `larguraRotulo`, `passo`, `gap`, `cor` |
| `janela` | `src`, `duracaoClipe`, `de`, `reg: [x, y, w, h]`, `tag`, `pos` (esquerda, topo, largura) |
| `celular` | `src`, `duracaoClipe`, `de`, `pos` |
| `pilha` / `fila` | `itens`, `gap`, `alinhar` (`centro`, `inicio`, `fim`, `esticar`); fila: `centrar: false`, `espalhar: true` |

## O que o compilador confere
Erros (não grava o spec): campo obrigatório ausente, `tipo` ou cor desconhecidos, chave desconhecida (inclui a vírgula sem aspas), cenas fora de ordem, frase que não está em `palavras.json`. Avisos (estimativa, não prova): âncora fora da janela da cena, itens que somam mais altura do que o painel (920 px) ou largura maior que 844 px, texto que deve quebrar, itens com posição absoluta que se cruzam, duração com menos de 1 s depois do fim da voz. Sempre olhe também `praeko studio folha <slug>`.

## Equivalência com TSX
`comentario-timestamp` (7 cenas) e `raide-ep1` (6 cenas, vídeos e barras animadas) foram portados do TSX para este formato: o primeiro renderiza **idêntico** (PSNR inf), o segundo dentro do ruído do `OffthreadVideo` (média 54,2 dB, mínimo 47,4). A conferência achou um bug do original do raide: a âncora `"dano"` da cena 5 pegava a primeira ocorrência (18,98 s) e a frase aparecia no início da cena.

## Motor de render
`motor: hyperframes` (ou `remotion`) no topo do YAML escolhe quem renderiza este episódio; `praeko studio render --motor …` tem a palavra final. Cenas com `componente:` só renderizam no Remotion. Ver [`hyperframes.md`](hyperframes.md).

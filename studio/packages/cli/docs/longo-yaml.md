# Longo em YAML (16:9, 1920×1080)

`episodio.yaml` com `formato: longo`. Tempo é **global** (segundos desde o início do vídeo). `praeko studio compilar <slug>` valida e gera `episodio.spec.json`; `praeko studio render <slug>` renderiza (compila antes).

## Roteiro em blocos
```
## 1 · O GANCHO
[curious] texto falado…

## 2 · O PROBLEMA
…
```
`praeko studio voz <slug> [--qualidade rascunho|final|local]` gera um áudio por bloco em `voz-blocos/` (nome com hash do texto, voz e pronúncia: só o bloco editado é regerado, o que poupa crédito do ElevenLabs), junta com 0,6 s de pausa em `voz.mp3` e escreve `palavras.json`, `palavras.ts` e `blocos.json` (`[{n, titulo, a, b}]`). Blocos antigos ficam no cache.

## Topo e cenas
```yaml
formato: longo
id: BancaLongo
duracao: 334
voz: audio/banca-longo-voz.mp3
cenas:
  - { titulo: O GANCHO, inicio: 0, componente: S1 }          # cena em TSX (cenas.tsx exporta S1: React.FC<{t:number}>)
  - titulo: O PROBLEMA
    inicio: 31.0                                              # s; ou { bloco: 2 } (usa blocos.json); `n` opcional (padrão: posição)
    itens: [ … ]
```
Cada cena vai do seu `inicio` ao da próxima (a última, até `duracao`); entra e sai com fade e mostra "n · TÍTULO" no canto.

## Tempo (`quando`, `hl`)
`número` (s) · `"frase"` (início da frase na voz) · `{ quando: "frase", nth: 1, depois: 83, mais: 0.6 }` (`nth` = ocorrência, `depois` = ignora antes de N s, `mais` = soma segundos). Frase que não está em `palavras.json` é erro.

## Itens (todos com `pos: { esquerda, topo, largura, altura }` em px, exceto `texto`)
| tipo | campos |
|---|---|
| `codigo` | `quando`, `titulo`, `tamanho`, `linhas: [{ s, hl: [tempo, tempo], vermelho }]` (a linha acende entre os dois tempos) |
| `cartao` | `quando`, `cor`, `itens: [texto…]` (entra deslizando) |
| `texto` | só dentro de `cartao`: `tamanho`, `cor`, `espacar`, `quando` (fade), `texto` ou `partes` |
| `chip` | `quando`, `cor`, `tamanho`, `texto` |
| `txt` | `quando`, `tamanho`, `cor`, `alinhar: centro`, `mono`, `texto` ou `partes: [{ texto, cor, mono }]` |

Cores: nomes do tema (`destaque texto suave ok erro info extra caixa`) ou `#hex`. **Texto com vírgula dentro de `{ … }` vai entre aspas** (o compilador acusa chave desconhecida).

## Avisos do compilador (estimativa)
Item que passa da borda direita ou invade a legenda (abaixo de ~960 px), itens de posição absoluta que se sobrepõem, item que entra fora da janela da cena, duração com menos de 1 s depois do fim da voz.

## Tela final (opcional)
```yaml
duracao: { voz: 6 }                 # a tela final precisa de uns 5 s depois da voz
fecho: { inicio: { quando: "última frase", depois: 480 }, texto: "Obrigado por assistir", link: meusite.com.br }
```
Mostra avatar, `texto` (a assinatura), o `handle` do tema e o `link`, sobre as cenas, de `inicio` até o fim (a legenda continua). `inicio` aceita número, "frase" ou `{ voz: N }`; `texto`, `link` e `imagem` (arquivo em `public/`, ex.: `gatos/gato-feliz.png`; padrão: o avatar do tema) são opcionais.

## Capa (YouTube 16:9 e Instagram vertical)
```yaml
capa:
  id: CapaBancaLongo                  # padrão: Capa<id>; a vertical é <id>Vertical
  titulo: ["DOIS CLIQUES", "UM ITEM"] # 2 linhas; a 2ª sai em destaque (≤ ~16 letras cada na 16:9)
  gato: chocado                       # gatos/gato-<nome>.png (opcional)
  codigo: { titulo: social.mjs · marketBuy, linhas: [{ s: "UPDATE market ..." }, { s: "AND sold_to IS NULL", hl: true }] }   # até 3 linhas
  chips: [{ texto: "ok ✔", cor: ok }, { texto: vendido, cor: erro }]
```
`praeko studio capa <slug>` gera `out/<slug>-capa-1280x720.png` e `out/<slug>-capa-vertical-1080x1920.png` (a vertical usa a `Moldura` das capas dos Shorts, dentro da grade 3:4 do Instagram). A capa da banca bate com a publicada a 58,4 dB.

## Pacote de publicação do longo
`publicacao.json` com `"formato": "longo"` (campos como no Short, mais `yt.comentarioFixo` e `arquivos.capaVertical`). `praeko studio pacote <slug>` monta o `textos.md`: título e alternativas, descrição **com capítulos**, comentário fixo, legenda do Instagram e a conferência. Os capítulos saem das cenas (`inicio` + título em minúsculas) e valem as regras do YouTube: começar em 0:00, 3 ou mais, 10 s cada um (senão é ERRO). Para outros textos, escreva `capitulos: [{ t, titulo }]` no `publicacao.json`. O UTM do YouTube usa `utm_medium=long`. No longo da banca os 9 capítulos saíram iguais aos publicados à mão.

## Itens de mídia e animação (longo)
Todos com `quando` e `pos`:
| tipo | campos |
|---|---|
| `video` | `src` (em `public/`, 16:9), `duracaoClipe`, `de` (s do clipe), `reg: [x, y, w, h]` (recorte em 1920×1080), `tag`, `pos: { esquerda, topo, largura }` (altura sai do recorte) |
| `celular` | `src` (vertical 1080×1920), `duracaoClipe`, `de`, `pos: { esquerda, topo, largura }` |
| `barra` | `valor` (0–1), `duracao`, `cor`, `rotulo`, `texto` (dentro da barra), `altura`, `pos` |
| `contador` | `de`, `ate`, `duracao`, `casas`, `prefixo`, `sufixo`, `tamanho`, `cor`, `mono`, `alinhar: centro`, `pos` |
| `fluxo` | `nos: [{ texto (\n quebra), cor, quando }]`, `tamanho`, `cor`, `pos: { esquerda, topo, largura }`: caixas ligadas por setas que entram uma a uma |

## Motor e mascote (HyperFrames)
`motor: hyperframes` no topo escolhe o motor de render deste longo (padrão: o da marca, depois `remotion`). `mascote: [{ quando: "frase", gato: chocado, mais: 0.5 }]` faz o gato `gatos/gato-chocado.png` aparecer no canto por ~3 s; só o HyperFrames desenha o mascote (o Remotion ignora). Ver [`hyperframes.md`](hyperframes.md).

# HyperFrames como segundo motor de render

O Praeko Studio renderiza com o **Remotion** (padrão) ou com o **HyperFrames** (HTML + GSAP, render por captura de quadros). O `episodio.yaml`, a voz, a legenda, a capa e o pacote de publicação são os mesmos; só muda quem desenha os quadros.

```
praeko studio render <slug> --motor hyperframes     # out/<slug>.hf.mp4 (não sobrescreve o do Remotion)
praeko studio prever <slug> --motor hyperframes     # abre o preview do HyperFrames no projeto gerado
praeko studio compilar <slug> --motor hyperframes   # avisa as cenas que usam `componente:` (TSX)
```

Qual motor um episódio usa (a primeira que existir): `--motor` na linha de comando → `motor: hyperframes` no topo do `episodio.yaml` → `"motor": "hyperframes"` no `marca.json` → `remotion`. Um canal novo pode usar `"motor": "hyperframes"` na marca e nunca tocar no Remotion (a capa continua sendo um `still` do Remotion: `praeko studio capa`).

## O que acontece

1. Compila o `episodio.yaml` (`episodio.spec.json`), como sempre.
2. `@praeko/studio-hyperframes` gera um projeto em `<projeto>/.hf/<slug>/` (já no `.gitignore` do `praeko studio init`): `index.html`, uma sub-composição por cena em `compositions/`, `assets/` com **só** o que o episódio usa (copiado do `publico` da marca).
3. `npx hyperframes@0.9.13 check --json`: erros param o render; avisos viram uma linha de resumo (código × quantidade).
4. `npx hyperframes@0.9.13 render --output out/<slug>.hf.mp4`.

O projeto gerado é descartável: não edite `.hf/`, edite o YAML e rode de novo. Para editar visualmente, abra `.hf/<slug>` no app do HyperFrames; o que você mexer lá some na próxima geração.

## Short (1080×1920)

Os itens do YAML (`texto`, `big`, `caixa`, `linha`, `balao`, `codigo`, `janela`, `celular`, `barra`, `barras`, `pilha`, `fila`, `cartao`) viram HTML com as mesmas medidas do kit do Remotion: painel de 70 px de margem, rótulo, legenda palavra a palavra (mesmo agrupamento de 3 palavras), barra de progresso, golpes (tremor, zoom, clarão), fundo de terminal de duas colunas, sons (whoosh, pop por cena, ding no fecho) e fechamento com avatar, handle e CTA. `quando` resolve para o tempo local da cena como no Remotion.

Diferenças conhecidas:
- **Fontes:** só as embutidas do HyperFrames resolvem pelo nome. Arial Black vira Montserrat 900 e Menlo vira JetBrains Mono (largura um pouco diferente; texto que quebra em uma pode quebrar na outra). Com `"hyperframes": { "fontesLocais": true }` no `marca.json` a fonte da marca é carregada do sistema (`local()`), com a embutida de reserva: paridade exata, mas só nesta máquina.
- **Vídeos gravados de tela ou de app** (`janela`, `celular`): o trecho `[de, duracaoClipe]` repete até o fim da cena (vários `<video>` em sequência, no lugar do `Loop`).
- **Ponto vermelho** da etiqueta da janela é fixo (no Remotion pisca).
- **Áudio** sai uns 3 dB mais alto (média −16,8 dB contra −19,8 dB no mesmo Short): conferir com `praeko studio checar` antes de publicar.
- **Zona segura vertical:** as posições do YAML valem como estão (o rótulo fica em y=70, a legenda em 190 px da base). O `check` do HyperFrames não reclama, mas as bordas dos apps cobrem o topo.

## Longo (1920×1080)

Reaproveita o plano do `episodio.yaml` (`formato: longo`: `codigo`, `cartao`, `chip`, `txt`, `video`, `celular`, `barra`, `contador`, `fluxo`) e acrescenta uma edição própria do motor:
- barra de capítulos no topo, com o título do capítulo corrente;
- transição entre capítulos (varredura horizontal, vertical, íris e escurecimento, em rodízio) com o número e o nome do capítulo, no silêncio entre os blocos (`blocos.json`) e com whoosh;
- número do capítulo ao fundo, brilho de fundo que muda de cor por capítulo;
- legenda palavra a palavra (a palavra falada fica dourada);
- tela final com `fecho:` (texto, link, imagem).

Mascote opcional, só neste motor: no `episodio.yaml` do longo,

```yaml
mascote:
  - { quando: "cinco radiantes voltaram", gato: chocado }       # gatos/gato-chocado.png
  - { quando: "a trava so fazia", gato: cafe, mais: 0.5 }
```

o gato aparece no canto inferior direito por ~3 s na cena em que a frase é falada.

Linhas de código: `hl: [frase-de-início, frase-de-fim]` acende a linha entre as duas frases (como no Remotion).

## Limites

- **`componente:` (TSX) não existe no HyperFrames.** Cena (ou capa) feita em `cenas.tsx` precisa virar itens no YAML ou o episódio fica no Remotion. O gerador falha com o slug, o número, o título e o componente da cena; `praeko studio compilar --motor hyperframes` avisa antes. A capa de TSX não conta: ela sempre sai do Remotion.
- Os tempos do `check` são de um instante amostrado: avisos de contraste em barras ainda zeradas e de tela vazia no quadro 0 são esperados (o quadro 0 de um Short é só o fundo; a capa é a miniatura).
- O HyperFrames busca o GSAP no CDN (jsdelivr) e as fontes embutidas na primeira vez: precisa de internet no primeiro render.
- Versão fixa: `hyperframes@0.9.13` (`VERSAO_HF` em `packages/hyperframes/src/comum.mjs`). Subir a versão = rodar os testes e comparar quadros.

## Remotion × HyperFrames (medido em 04/11/2026, M4 de 10 núcleos)

| Episódio | Remotion (GL angle) | HyperFrames (render) | HyperFrames (com geração e check) |
|---|---|---|---|
| Short `heranca-corte-cofre` (53 s) | 26 s | 32 s | 38 s |
| Short `raide-ep1` (42 s, janelas, celular, barras) | 43 s | 40 s | 54 s |
| Longo `heranca-longo` (7:47; saída 38 MB contra 56 MB do Remotion) | 7:12 (GL padrão) · 7:53 (GL angle) | 3:29 | 3:54 |

Observações: o `angle` só ajuda nos Shorts (blur, sombras em 1080×1920); no longo ele não ganhou nada (7:12 com o padrão, 7:53 com `angle`; em 1200 quadros, 46 s contra 44 s), então vale medir antes de trocar. O Remotion só ficou rápido nos Shorts depois de `Config.setChromiumOpenGlRenderer("angle")` no `remotion.config.ts` (antes: 102 s para o mesmo Short; PSNR de 48 dB entre os dois renderizadores). O HyperFrames paga ~6 s de compilação por render e ~6 s de `check`. Concorrência do Remotion (5 ou 10) não mudou nada.

## Quando escolher cada um

| Situação | Motor |
|---|---|
| Episódio com cena em TSX (`componente:`) ou capa de peça própria | Remotion |
| Short de rotina do canal atual | Remotion (mesmo tempo, mesma aparência de sempre) |
| Longo, ou qualquer vídeo em que a edição (transições, capítulos, mascote) pesa | HyperFrames |
| Canal novo, sem TSX legado | HyperFrames como padrão (`"motor": "hyperframes"` na marca) |
| Quer mexer no resultado em editor visual | HyperFrames (abre `.hf/<slug>` no app) |

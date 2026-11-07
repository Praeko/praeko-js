# Licenças do Praeko Studio / Licenses

Conferido em 07/11/2026 (verified on 2026-11-07). Este arquivo não é aconselhamento jurídico; vale o texto de cada fornecedor.

## O código do Praeko Studio
Os pacotes `@praeko/studio`, `@praeko/studio-core` e `@praeko/studio-kit` são **MIT** (ver `LICENSE`, Copyright (c) 2026 Marcone Santos), como `@praeko/sdk` e `@praeko/cli`. Os efeitos sonoros (`pop`, `ding`, `thump`, `whoosh`) e o `avatar.png` do modelo de projeto foram criados para o Studio (sons sintetizados por `scripts/gerar-sfx.mjs`, sem amostras de terceiros) e seguem a mesma licença MIT. O pacote não traz fontes, músicas, imagens de banco nem arte de terceiros.

## Aviso que você precisa ver (Remotion NÃO é MIT)
> **Remotion.** O Remotion é *source-available*, não open source. É **grátis** para pessoas físicas, organizações sem fins lucrativos, avaliação e empresas com **até 3 funcionários** (uso comercial incluído). Empresas com **4 ou mais pessoas** precisam da **Company License** (remotion.pro/license). Quem instala e roda o Remotion é **você**: a licença é sua, não do Praeko. O Remotion também vende planos para quem **automatiza renders por programa ou agente** (Creators, Automators); o FAQ deles não diz expressamente se um agente local que roda `remotion render` entra: **pergunte ao Remotion** antes de usar em escala. O Praeko Studio não copia nem modifica código do Remotion: usa-o como dependência (peer) instalada por você.
>
> **Remotion** is source-available, not open source. Free for individuals, non-profits, evaluation and companies of up to 3 employees (commercial use included); companies of 4+ need the Company License (remotion.pro/license). You install and run Remotion, so the license is yours. They also sell plans for programmatic/agent-driven rendering; their FAQ does not say whether a local agent running `remotion render` counts: ask Remotion before using at scale. Praeko Studio does not copy or modify Remotion code; it uses it as a dependency you install.

Este aviso aparece no `README`, na instalação (`praeko studio init`), em `praeko studio doctor` e em `praeko studio licencas` (`--aceitar` registra a leitura em `~/.config/praeko/studio/licencas.json`).

**Capas** são renderizadas com `remotion still`, mesmo com `--motor hyperframes`: hoje não existe projeto 100% livre de Remotion. Uma capa sem Remotion está no roteiro de trabalho (`docs/studio-produto.md`, item 9) e não foi prometida.

**Não prometemos "grátis para sempre":** as condições do Remotion podem mudar (a própria página avisa que a licença muda no Remotion 5.0). Reveja a licença ao subir de versão.

## Dependências de terceiros
| Componente | Onde | Licença | Fonte |
|---|---|---|---|
| `remotion`, `@remotion/cli` (4.0.539) | instalados no **projeto** do usuário (peer de core/kit) | Remotion License (ver acima), não MIT | remotion.pro/license; github.com/remotion-dev/remotion (LICENSE.md) |
| `react`, `react-dom` (19.2.3) | projeto do usuário (peer) | MIT | package.json de cada pacote |
| `@praeko/studio-core`, `-kit` | projeto do usuário | MIT | LICENSE |
| `yaml` (2.9.1) | embutido no bundle de `@praeko/studio` | ISC | package.json |
| `@elevenlabs/elevenlabs-js` (2.x) | dependência de `@praeko/studio` | MIT | package.json |
| `hyperframes` (0.9.13, motor opcional) | baixado por `npx` na primeira vez que você usa `--motor hyperframes` | Apache-2.0 | github.com/heygen-com/hyperframes |
| `typescript`, `esbuild`, `@types/*` | só desenvolvimento/build | Apache-2.0 / MIT | package.json |
| ffmpeg / ffprobe | você instala | LGPL ou GPL, conforme a compilação | ffmpeg.org/legal.html |
| Chrome Headless Shell / Chromium | o Remotion baixa no primeiro render | licenças do Chromium/Google | remotion.dev/docs/miscellaneous/chrome-headless-shell |

## Serviços e modelos (você contrata)
- **ElevenLabs**: seus termos e seu plano (clonagem de voz só com direito sobre a voz). A chave é sua; o Studio nunca a imprime.
- **VoiceStudio local** (opcional): o modelo OmniVoice é **CC-BY-NC (uso não comercial)**. Não é padrão em nenhuma configuração do Studio e **não deve ser usado em conteúdo monetizado**. Confira a licença de qualquer modelo local que usar.
- **YouTube, Instagram, TikTok**: termos e regras de conteúdo sintético de cada rede (veja `praeko studio docs publicar`).

## Fontes e mídia
Nenhuma fonte é distribuída. O modelo de projeto usa fontes do sistema (`Arial Black`, `Menlo`) que o `doctor` confere; troque-as no `marca.json` por fontes abertas (OFL) se quiser que o vídeo saia igual em todos os sistemas. Música, imagens e clipes que você adicionar são responsabilidade sua (direitos e licenças).

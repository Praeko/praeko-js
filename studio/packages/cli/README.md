# @praeko/studio

Praeko Studio faz vídeos curtos (9:16) e longos (16:9) a partir de um roteiro: voz, legenda palavra a palavra, cenas, capa e textos de publicação. Você opera com o **seu próprio agente de código** (Claude Code, Codex, Gemini CLI, Cursor, opencode…) na **sua máquina**: o agente escreve o roteiro e o `episodio.yaml`, roda os comandos e, só depois do seu sim, publica pelo [Praeko](https://praeko.app/docs). Voz, render e agente são por sua conta; o Studio não chama nenhum modelo de linguagem e nenhum roteiro seu sai da máquina até você publicar.

> **Licenças.** O código do Praeko Studio é MIT. O **Remotion** (motor padrão, necessário para capas) **não é MIT**: grátis para pessoas, organizações sem fins lucrativos e empresas de até 3 funcionários; empresas com 4 ou mais pessoas precisam da Company License ([remotion.pro/license](https://www.remotion.pro/license)). A licença é de quem instala e roda o Remotion. O HyperFrames (`--motor hyperframes`) é Apache-2.0. Detalhes: [LICENSES.md](./LICENSES.md) ou `praeko studio licencas`.
>
> **Licenses.** Praeko Studio's own code is MIT. **Remotion** (the default engine, required for covers) is **not MIT**: free for individuals, non-profits and companies of up to 3 employees; companies of 4+ need the Company License. The license is yours as the person installing and running it. HyperFrames (`--motor hyperframes`) is Apache-2.0. See [LICENSES.md](./LICENSES.md).

## Requisitos
Node 22 ou mais novo, `ffmpeg` e `ffprobe` no PATH, e um Chrome (o Remotion baixa o Chrome Headless Shell sozinho no primeiro render; precisa de internet nesse momento). macOS e Linux são suportados; Windows é melhor esforço e não foi testado. `praeko studio doctor` confere tudo.

## Instalar
```sh
# npm
npm install -g @praeko/studio
# yarn
yarn global add @praeko/studio
# pnpm
pnpm add -g @praeko/studio
# bun
bun add -g @praeko/studio
# sem instalar
npx @praeko/studio init meu-canal
```
Também funciona por `praeko studio <comando>` quando o `@praeko/cli` está instalado (ele entrega ao Studio).

## Primeiro vídeo
```sh
praeko-studio init meu-canal --nome "Meu Canal" --agent claude   # projeto + instruções para o seu agente
cd meu-canal
praeko-studio doctor
praeko-studio novo meu-primeiro --titulo "Meu primeiro vídeo"
praeko-studio voz meu-primeiro --qualidade rascunho              # voz estimada e muda: grátis, sem rede
praeko-studio checar meu-primeiro
praeko-studio render meu-primeiro && praeko-studio folha meu-primeiro && praeko-studio capa meu-primeiro && praeko-studio pacote meu-primeiro
```
Abra o seu agente na pasta do projeto e peça o vídeo: as instruções (`CLAUDE.md`/`AGENTS.md`/`GEMINI.md`/`.cursor/rules`…) já estão lá (`praeko studio skill install --agent all` regrava). Documentação da versão instalada: `praeko studio docs`.

## Publicar
`praeko studio agendar <slug> --via praeko --quando "dd/mm hh:mm"` só simula; `--enviar` publica de verdade. Pelo MCP do Praeko o envio do arquivo local usa `create_media_upload` e a publicação é sempre em dois passos (prévia e código de confirmação). Declare conteúdo de IA em `publicacao.json` (`"ia": { "sintetico": true }`). Veja `praeko studio docs publicar`.

## Licença
MIT (o código deste pacote). Veja também [LICENSES.md](./LICENSES.md).

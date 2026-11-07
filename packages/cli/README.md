# @praeko/cli

Linha de comando do [Praeko](https://praeko.app): publica e agenda vídeos curtos no YouTube, Instagram e TikTok, e fala com a API do serviço (posts, fila, canais, chaves, insights). Comando `praeko` (antes chamado `arauto`). Node 22 ou superior; `ffmpeg`/`ffprobe` só para os comandos que mexem em capa e vídeo.

## Instalação

```sh
npm install -g @praeko/cli
yarn global add @praeko/cli
pnpm add -g @praeko/cli
bun add -g @praeko/cli
```

Sem instalar:

```sh
npx @praeko/cli --help
pnpm dlx @praeko/cli --help
bunx @praeko/cli --help
yarn dlx @praeko/cli --help   # yarn 2+
```

## Começando

```sh
praeko --version
praeko --help
export PRAEKO_SERVER=https://praeko.app
export PRAEKO_KEY=praeko_…            # chave criada no painel (ou: echo $CHAVE | praeko key store)
praeko posts                          # lista os posts do serviço
praeko post ./meu-pacote --when "30/12 17:30" --networks yt,ig,tt   # SIMULA (nada é enviado)
praeko post ./meu-pacote --when "30/12 17:30" --networks yt,ig,tt --send
```

Nada é enviado, hospedado ou agendado sem `--send`.

## Autenticação

A chave vem de `PRAEKO_KEY`. Sem ela, a CLI procura no Chaveiro do macOS (só no Mac, item `praeko/chave`) e no arquivo `~/.config/praeko/segredos.json` (modo 600; mude com `PRAEKO_SEGREDOS`). No Linux e no Windows valem a variável e o arquivo. `PRAEKO_SEM_CHAVEIRO=1` ignora o Chaveiro. O endereço do serviço vem de `--server` ou `PRAEKO_SERVER`.

## Erros e códigos de saída

`0` sucesso; `1` erro (mensagem em português no stderr); `2` comando ou argumento inválido (mostra a ajuda).

## Praeko Studio

`praeko studio …` (gerador de vídeos) ainda não é distribuído pelo npm; fora do repositório o comando avisa e sai com `1`. Os demais comandos não dependem dele.

## Versionamento

[SemVer](https://semver.org/lang/pt-BR/); em `0.x` mudanças incompatíveis podem sair em versões menores, sempre no [CHANGELOG](./CHANGELOG.md). A CLI é publicada com o SDK embutido: não há dependências a instalar.

## Links

Documentação: <https://praeko.app/docs> · Código e issues: <https://github.com/Praeko/praeko-js> · SDK: [`@praeko/sdk`](https://www.npmjs.com/package/@praeko/sdk)

## Licença

[MIT](./LICENSE) © 2026 Marcone Santos.

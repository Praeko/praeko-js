# praeko-js

Código-cliente do [Praeko](https://praeko.app): o publicador de vídeos curtos (YouTube, Instagram, TikTok) com fila, agendamento e API com chave.

Este repositório tem **só o cliente**. O servidor do Praeko é fechado; o comportamento da API está documentado em <https://praeko.app/docs>.

| Pacote | O que é | npm |
|---|---|---|
| [`@praeko/sdk`](./packages/sdk) | Cliente JS da API (Node, Workers e navegador), sem dependências, com tipos | [npm](https://www.npmjs.com/package/@praeko/sdk) |
| [`@praeko/cli`](./packages/cli) | Comando `praeko`: posts, fila, canais, chaves, insights | [npm](https://www.npmjs.com/package/@praeko/cli) |
| [`@praeko/studio`](./studio/packages/cli) | Praeko Studio: vídeos curtos e longos para você operar com o seu próprio agente de código (voz, legenda, cenas, capa, textos, publicação pelo Praeko) | [npm](https://www.npmjs.com/package/@praeko/studio) |
| [`@praeko/studio-core`](./studio/packages/core), [`@praeko/studio-kit`](./studio/packages/kit) | Motor e peças de cena (Remotion) usados pelos projetos do Studio | [core](https://www.npmjs.com/package/@praeko/studio-core), [kit](https://www.npmjs.com/package/@praeko/studio-kit) |
| `packages/core`, `studio/packages/{voz,publicar,revisar,hyperframes}` | Lógica compartilhada; **não são publicados**, entram no bundle da CLI e do Studio | |

> **Licenças do Studio.** O código deste repositório é MIT. O **Remotion**, que o Studio usa como motor padrão, **não é MIT**: grátis para pessoas, organizações sem fins lucrativos e empresas de até 3 funcionários; empresas com 4 ou mais pessoas precisam da Company License ([remotion.pro/license](https://www.remotion.pro/license)). Veja [`studio/LICENSES.md`](./studio/LICENSES.md).

## Instalação

SDK:

```sh
npm install @praeko/sdk
yarn add @praeko/sdk
pnpm add @praeko/sdk
bun add @praeko/sdk
```

CLI:

```sh
npm install -g @praeko/cli
yarn global add @praeko/cli
pnpm add -g @praeko/cli
bun add -g @praeko/cli
```

Node 22 ou superior. Guia completo, referência da API e exemplos: <https://praeko.app/docs>.

## Desenvolvimento

```sh
npm ci
npm test               # testes que não dependem do servidor (o Studio precisa de ffmpeg no PATH)
npm run typecheck
npm run release:check  # confere o que iria ao npm
```

## Suporte

Issues e pull requests estão desligados: o desenvolvimento acontece internamente. Para problemas e pedidos, escreva para contato@praeko.app (veja [CONTRIBUTING.md](./CONTRIBUTING.md)). Vulnerabilidades: [SECURITY.md](./SECURITY.md).

## Licença

[MIT](./LICENSE).

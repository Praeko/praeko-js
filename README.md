# praeko-js

Código-cliente do [Praeko](https://praeko.app): o publicador de vídeos curtos (YouTube, Instagram, TikTok) com fila, agendamento e API com chave.

Este repositório tem **só o cliente**. O servidor do Praeko é fechado; o comportamento da API está documentado em <https://praeko.app/docs>.

| Pacote | O que é | npm |
|---|---|---|
| [`@praeko/sdk`](./packages/sdk) | Cliente JS da API (Node, Workers e navegador), sem dependências, com tipos | [npm](https://www.npmjs.com/package/@praeko/sdk) |
| [`@praeko/cli`](./packages/cli) | Comando `praeko`: posts, fila, canais, chaves, insights | [npm](https://www.npmjs.com/package/@praeko/cli) |
| `packages/core` | Lógica compartilhada; **não é publicado**, entra no bundle da CLI | |

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
npm test               # testes que não dependem do servidor
npm run typecheck
npm run release:check  # confere o que iria ao npm
```

## Contribuir e reportar problemas

Issues são bem-vindas: <https://github.com/Praeko/praeko-js/issues>. Veja [CONTRIBUTING.md](./CONTRIBUTING.md). Vulnerabilidades: [SECURITY.md](./SECURITY.md).

## Licença

[MIT](./LICENSE).

# Changelog

Segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e [SemVer](https://semver.org/lang/pt-BR/).

## [0.2.0] - 2026-11-07

Primeira versão escrita em TypeScript. **Sem mudança de comportamento em tempo de execução**: as mesmas exportações, os mesmos métodos e os mesmos aliases deprecados.

- O pacote agora publica `dist/` compilado (JavaScript ESM + declarações `.d.ts` geradas pelo `tsc`, em vez de `src/` com `.d.ts` escritos à mão). Os caminhos de importação (`@praeko/sdk`, `/node`, `/contract`, `/bridge`, `/contract-docs`, `/openapi`) são os mesmos.
- Os tipos passam a sair do código: some o tipo duplicado que podia divergir do JavaScript (o `TS2717` que a 0.1.x dava com `skipLibCheck: false` não tem mais como acontecer). `@praeko/sdk/contract` tipa rotas, campos, valores e códigos de erro a partir da tabela `ROUTES` (`as const`).
- Tipos mais precisos onde o código já aceitava mais: `idempotencyKey` em todas as chamadas que a aceitam (`media.create`, `media.complete`, `posts.update`, `posts.cancel`, `instagram.reply`, `youtube.reply`, `webhooks.redeliver`, `apiKeys.create`…), `apiKeys.create(name, scope, expiresInDays)`, `channels.disconnect` para `youtube` e `instagram` e `uploadFile` devolvendo `Media`.
- Novos tipos exportados: `PraekoOptions`, `CallOptions`, `MediaApi`, `PostsApi`, `ChannelsApi`… (um por recurso).

## [0.1.2] - 2026-11-07

Sem mudança de código. Primeira versão publicada pela publicação confiável (GitHub Actions, OIDC), com proveniência. A 0.1.1 não chegou a ser publicada (o serviço de assinatura do Sigstore falhou duas vezes).

- `bugs.url` aponta para a documentação: as issues do repositório estão desligadas; o suporte é por e-mail.

## [0.1.0] - 2026-11-07

Primeira versão preparada para o npm.
- Pacote `@praeko/sdk`: cliente da API, tipos do contrato (`./contract`), ponte (`./bridge`), envio de arquivo do disco (`./node`).
- Licença MIT (arquivo `LICENSE` no pacote) e repositório público de código-cliente (`Praeko/praeko-js`).

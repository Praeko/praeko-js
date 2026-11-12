# Changelog

Segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e [SemVer](https://semver.org/lang/pt-BR/).

## [Não lançado]

- Login por código (RFC 8628, `docs/device-login.md`), sem chave: `startDeviceLogin({ url, computerName?, os? })` (POST `/v1/device/code`), `pollDeviceToken({ url, deviceCode })` (uma consulta a POST `/v1/device/token`) e `waitForDeviceLogin({ url, deviceCode, interval, expiresIn, signal, onPoll })`, que respeita o `interval`, soma 5 s a cada `slow_down` e devolve `{ key, id, name, scope: "write", prefix, workspace }` uma única vez. Tipos `DeviceCode`, `DeviceToken`, `DevicePollError`. Em `@praeko/sdk/contract`: `DEVICE` (alfabeto, tamanho, validade, intervalo), `normalizeUserCode` e `formatUserCode`, e os códigos de erro `authorization_pending`, `slow_down`, `expired_token`, `access_denied`, `invalid_grant`, `invalid_user_code`, `user_code_used`, `user_code_locked`.
- Acesso antecipado do Instagram e do TikTok (`docs/acesso-antecipado.md`): códigos de erro novos em `@praeko/sdk/contract` (`ERROR_CODES`): `early_access_open`, `early_access_not_needed`, `early_access_not_found`, `early_access_rate_limited` e `panel_session_required` (as rotas `/v1/early-access` exigem a sessão do painel: o cliente não ganhou métodos para elas).
- `Channel.network` aceita `ComingSoonNetwork` (`"facebook"`) e `Channel.comingSoon?: boolean`: `channels.list()` passa a terminar com um item informativo do Facebook (Páginas), `supported: false`, `comingSoon: true`. Ele não conecta nem publica; `Network` (redes de publicação) não muda. Campo novo no contrato: `emBreve` ↔ `comingSoon` (só respostas).

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

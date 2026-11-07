# Changelog

Segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e [SemVer](https://semver.org/lang/pt-BR/).

## [0.2.0] - 2026-11-07

Sem mudança de comportamento: o código da CLI (e do `@praeko/core` que ela embute) agora é TypeScript (`strict`), empacotado pelo esbuild como antes. Mesmo `dist/praeko.mjs`, zero dependências.

## [0.1.1] - 2026-11-07

- Um só comando, `praeko` (o alias `arauto` saiu do pacote). Com dois comandos o `npx @praeko/cli` não sabia qual rodar e falhava com "could not determine executable to run"; agora `npx @praeko/cli --help` funciona. Quem usou a 0.1.0 pode rodar `npx -p @praeko/cli praeko`.

## [0.1.0] - 2026-11-07

Primeira versão preparada para o npm.
- Pacote `@praeko/cli`: comando `praeko`, empacotado em `dist/` com o core e o SDK embutidos (sem dependências); `--version`; `praeko studio` avisa quando o Studio não está instalado.
- Licença MIT (arquivo `LICENSE` no pacote) e repositório público de código-cliente (`Praeko/praeko-js`).

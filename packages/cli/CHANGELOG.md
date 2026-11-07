# Changelog

Segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e [SemVer](https://semver.org/lang/pt-BR/).

## [0.3.0] - 2026-11-07

- `praeko studio <comando>` agora **entrega ao Praeko Studio** (`@praeko/studio`, bin `praeko-studio`) em vez de dizer que ele não é distribuído: procura no projeto atual, ao lado da CLI, na instalação global do npm e no PATH; sem ele, mostra `npm install -D @praeko/studio` / `npx @praeko/studio` e, em terminal interativo, oferece rodar com o `npx`. Corrige o caso do Studio instalado à parte (antes só era achado se estivesse ao lado da CLI).
- Sem mudança nos demais comandos.

## [0.2.0] - 2026-11-07

Sem mudança de comportamento: o código da CLI (e do `@praeko/core` que ela embute) agora é TypeScript (`strict`), empacotado pelo esbuild como antes. Mesmo `dist/praeko.mjs`, zero dependências.

## [0.1.1] - 2026-11-07

- Um só comando, `praeko` (o alias `arauto` saiu do pacote). Com dois comandos o `npx @praeko/cli` não sabia qual rodar e falhava com "could not determine executable to run"; agora `npx @praeko/cli --help` funciona. Quem usou a 0.1.0 pode rodar `npx -p @praeko/cli praeko`.

## [0.1.0] - 2026-11-07

Primeira versão preparada para o npm.
- Pacote `@praeko/cli`: comando `praeko`, empacotado em `dist/` com o core e o SDK embutidos (sem dependências); `--version`; `praeko studio` avisa quando o Studio não está instalado.
- Licença MIT (arquivo `LICENSE` no pacote) e repositório público de código-cliente (`Praeko/praeko-js`).

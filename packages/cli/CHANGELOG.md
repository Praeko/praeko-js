# Changelog

Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [SemVer](https://semver.org/).

## [0.4.0] - unreleased (prepared)

Breaking: the CLI is English only.
- Removed every deprecated Portuguese alias: commands (`postar`, `agendar`, `fila`, `conta`, `canais`, `calendario`, `vagas`, `publicar-agora`, `youtube-agendar`, `adotar-buffer`, `importar`, `conteudo`, `seguidores`, `chave`, `ajuda`), subcommands, flags (`--quando`, `--redes`, `--enviar`, ...) and old value spellings. Use the English names listed in `praeko --help`.
- All output and error messages are English (dates print as `dd/mm/yyyy, hh:mm`; times you pass with `--when` are still `dd/mm hh:mm` in the `timezoneOffset` of `praeko.json`).
- Config and package files are English: `praeko.json` keys (`name`, `timezoneOffset`, `folder`, `hosting`, `hashtags.allowed/banned`, `buffer.channels`, `provider`, `remote`, `packages`, ...) and the package folder file `publication.json` (`title`, `format`, `files.cover`, `yt.description`, `ig.caption`, `hashtags`, `beforePublishing`, ...). `links.main` replaces `links.jogo` and is optional: without it the texts carry no tracked link.
- Only `praeko.json` is read as the project file (`arauto.json` and the `publicacao` section of a `marca.json` are gone).
- Environment: `PRAEKO_SECRETS` (was `PRAEKO_SEGREDOS`), `PRAEKO_NO_KEYCHAIN` (was `PRAEKO_SEM_CHAVEIRO`), `PRAEKO_STUDIO_NO_NPX` (was `PRAEKO_STUDIO_SEM_NPX`); the default secrets file is `~/.config/praeko/secrets.json` (rename your old `segredos.json`).
- `praeko studio` delegation: English messages.

## [0.3.0] - 2026-11-07

- `praeko studio <command>` now **hands over to Praeko Studio** (`@praeko/studio`, bin `praeko-studio`) instead of saying it is not distributed: it looks in the current project, next to the CLI, in the global npm install and on the PATH; without it, it shows `npm install -D @praeko/studio` / `npx @praeko/studio` and, in an interactive terminal, offers to run it with `npx`. Fixes the case of Studio installed separately (it was only found next to the CLI).
- No change to the other commands.

## [0.2.0] - 2026-11-07

No behavior change: the CLI code (and the `@praeko/core` it embeds) is now TypeScript (`strict`), bundled by esbuild as before. Same `dist/praeko.mjs`, zero dependencies.

## [0.1.1] - 2026-11-07

- A single command, `praeko` (the `arauto` alias left the package). With two commands `npx @praeko/cli` could not tell which one to run and failed with "could not determine executable to run"; now `npx @praeko/cli --help` works. Anyone who used 0.1.0 can run `npx -p @praeko/cli praeko`.

## [0.1.0] - 2026-11-07

First version prepared for npm.
- Package `@praeko/cli`: the `praeko` command, bundled into `dist/` with the core and the SDK embedded (no dependencies); `--version`; `praeko studio` warns when Studio is not installed.
- MIT license (`LICENSE` file in the package) and a public client-code repository (`Praeko/praeko-js`).

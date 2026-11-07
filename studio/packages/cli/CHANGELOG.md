# Changelog

Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [SemVer](https://semver.org/). In the 0.x series a breaking change may ship in a minor version, always recorded here.

## [0.2.0] - unreleased

**Breaking: everything is English now.** The 0.1.0 surface was Portuguese; this is day 0 with almost no users, so the rename is done at once. No Portuguese alias is kept.

- **Commands:** `novo→new`, `voz→voice` (`saldo→balance`, `vozes→voices`, `conta listar|adicionar→account list|add`, `config chave→config key`), `compilar→compile`, `corte→cut`, `prever→preview`, `capa→cover`, `folha→contact-sheet`, `checar→check`, `pacote→package`, `agendar→schedule`, `postar→post`, `fila→queue` (`list|run|cancel|install|remove`), `conta→account` (`connect|status`), `licencas→licenses`.
- **Flags:** `--titulo→--title`, `--longo→--long`, `--qualidade→--quality` (`rascunho→draft`), `--voz→--voice`, `--alinhador→--aligner`, `--sem-failover→--no-failover`, `--de/--ate→--from/--to`, `--abertura→--hook`, `--motor→--engine`, `--escala→--scale`, `--quando→--when`, `--redes→--networks`, `--enviar→--send`, `--canais→--channels`, `--chave→--key`, `--aceitar→--accept`, `--sem-instalar→--no-install`, `--de-env→--from-env`, `--simular→--dry-run`, `--voz-id→--voice-id`.
- **Project files:** `marca.json→brand.json`, `vozes.json→voices.json`, `episodios/→episodes/`, `episodio.yaml→episode.yaml`, `roteiro.txt→script.txt`, `palavras.json|ts→words.json|ts`, `voz.mp3→voice.mp3`, `publicacao.json→publication.json`, `textos.md→texts.md`, `agendamento.json→schedule.json`, and every YAML/JSON key (full table: `docs/studio-ingles.md` of the repository).
- **Environment:** `PRAEKO_STUDIO_LANG→PRAEKO_LANG`, `PRAEKO_STUDIO_SEM_AVISO→PRAEKO_STUDIO_NO_NOTICE`, `PRAEKO_SEGREDOS→PRAEKO_SECRETS`, `PRAEKO_SEM_CHAVEIRO→PRAEKO_NO_KEYCHAIN`, `~/.config/praeko/segredos.json→secrets.json`.
- **New:** `praeko studio migrate [--dry-run]` converts a 0.1.0 project in place (renames files and folders, rewrites keys, updates the TSX imports, `package.json` and the agent instruction blocks; backup in `.studio-backup/`, report at the end). It is the only code that still knows the Portuguese names.
- **New:** `--lang pt` / `PRAEKO_LANG=pt` prints the common messages in Brazilian Portuguese; the default is English everywhere (help, errors, `doctor`, the agent skill, the project templates).
- **New:** `--engine hyperframes` renders the video **and** the cover with HyperFrames; nothing from Remotion is used then.
- The agent skill and the `AGENTS.md`/`CLAUDE.md`/`GEMINI.md` blocks are English by default (`--lang pt` available, using the new command names); block markers are `praeko-studio:start`/`end`.
- All packages are TypeScript (strict); `@praeko/studio-core` and `@praeko/studio-kit` ship `.d.ts` files whose import specifiers resolve for consumers.
- Library API renamed in `@praeko/studio-core` and `@praeko/studio-kit` (see their CHANGELOGs); the old names are gone.

## [0.1.0] - 2026-11-07

First published version. Praeko Studio was born inside a promotion project and was extracted for anyone to use with their own coding agent.

- `praeko-studio` command (also through `praeko studio …`, by `@praeko/cli`): `init`, `new`, `voice`, `compile`, `cut`, `preview`, `render`, `cover`, `contact-sheet`, `check`, `package`, `schedule`, plus the new `doctor`, `licenses`, `skill install` and `docs` (named in Portuguese in that release).
- `init` creates projects that depend on published packages by semver (`@praeko/studio-core`, `@praeko/studio-kit`); `--dev <studio>` keeps the local-path mode for contributors.
- `skill install` writes the instructions for Claude Code, Codex, Gemini CLI, Cursor, opencode, Cline and Windsurf (pt-BR and en), with the two-step rule for publishing through MCP, the local file upload (`create_media_upload`) and the AI disclosure.
- Voice: per-project and per-user voices file (no one's ids in the package); keys through an environment variable, the macOS keychain or a secrets file (600 permission); the Praeko key is the same as the `praeko` CLI's.
- Default publishing through Praeko (`--via praeko`); the brand `links` became optional; the publication file gained the AI disclosure (checked by `check` and `package`; sent to YouTube as `containsSyntheticMedia` in direct publishing).
- Remotion is **not MIT**: see `LICENSES.md` and `praeko studio licenses`.
- Removed: the `bardo` alias, the old keychain service and `~/.config/bardo`. `queue install/remove` (launchd) only exists on macOS.

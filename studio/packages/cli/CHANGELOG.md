# Changelog

Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [SemVer](https://semver.org/). In the 0.x series a breaking change may ship in a minor version, always recorded here.

## [Unreleased]

### Added
- `praeko studio review <slug> [--every <seconds>] [--max-frames N] [--engine remotion|hyperframes] [--json]`: builds a **review package for your agent** in `out/<slug>-review/` from a rendered video, or from the slides of an image post or carousel: `frames/` (JPEGs at most 540 px wide with the time in the name: the opening at 0 to 2 s, one per scene change, one every N seconds, the last frame), `manifest.json` (schema `praeko-studio-review/1`: scenes with their on-screen text, speech, loudness, silences, frames and deterministic findings, each with severity, time, code, message and evidence) and `REVIEW.md` (instructions for the reviewing agent; Portuguese with `--lang pt`). Studio calls no language model: it measures and extracts, your agent looks and judges. Exit code 0 when the package is made, even with findings.
- Findings (rules over measured data): empty opening, late first scene, scenes that are too short or too long, too much text for a scene, stopped frames, long silence, loudness and true peak, voice still estimated, speech too fast or starting late, captions that flash, duration and shape of the file, missing cover, text outside the safe area, low contrast of the brand colors (WCAG), forbidden phrases (built-in default, `review.forbiddenPhrases` in `brand.json`, the prohibitions section of `playbook.md`), banned names, AI text tics; for slides: size, alt text (missing, short, generic, repeated, unrelated), dense text, carousel count and caption limits.
- `praeko studio docs review`; the project skill gains the review step (after `package`, before asking for approval).
- `brand.json` may carry `review.forbiddenPhrases` (a list of strings).

## [0.2.3] - 2026-11-08

Version aligned with `@praeko/studio-mcp` 0.1.1; the project templates depend on `@praeko/studio-core` and `@praeko/studio-kit` 0.2.3. No other change.

## [0.2.2] - 2026-11-08

- `init --yes` (or without a terminal) imports the brand tokens (colors, font) from `--brand <folder-or-tokens.json>` or from `../brand/build/tokens.json` / `../brand/tokens.json` when present.
- `doctor` has a voice section: it lists the configured voice accounts (without showing keys) and warns when a voice id is in no account.
- The docs and the agent skill say plainly that the agent needs a terminal to render.

## [0.2.1] - 2026-11-08

- Interactive `init`: in a terminal it interviews you (name, audience, tone, colors, font, up to 3 references; Enter skips each question, flags answer ahead) and writes `brief.md` and a draft `playbook.md` that the agent reads before the first script.
- New `praeko studio brief` command: reopens the interview in an existing project, rewrites `brief.md` (with a `.bak` backup) and keeps an edited `playbook.md`.
- `voice account add` keeps the key even when the voice is not found, and picks the project voice that matches the cloned voice.

## [0.2.0] - 2026-11-07

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

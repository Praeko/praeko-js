# Changelog

Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [SemVer](https://semver.org/). In the 0.x series a breaking change may ship in a minor version, always recorded here.

## [0.3.0] - 2026-11-12

### Added
- `praeko studio setup [folder] [--plan] [--yes] [--agent …] [--profile <name>] [--json] [--no-install]` (also `npx @praeko/studio@<version> setup`): connects your AI agents to Praeko on this machine. It checks Node, npm, ffmpeg, ffprobe and Chrome and proposes the install command for your system (it never installs system packages), detects Claude Code, Claude Desktop, Codex CLI, Cursor, Gemini CLI, opencode, Cline and Windsurf by binaries, configuration folders and apps, registers the remote MCP server `https://praeko.app/mcp` in each one's format with no key in any file (Claude Code: `claude mcp add --transport http --scope user praeko …` and sign-in with `/mcp`; Codex: `[mcp_servers.praeko]` with `bearer_token_env_var = "PRAEKO_KEY"`; Cursor: `~/.cursor/mcp.json` with `Bearer ${env:PRAEKO_KEY}`), the local `@praeko/studio-mcp` for Claude Desktop, creates the project with `init --agent` (or refreshes the instructions of an existing one), writes `.praeko/config.json` (the key profile, no secret) and appends Studio's local paths to `.gitignore` (only appends; checked with `git check-ignore` in a repository). The plan comes first and changes nothing (without a terminal it only plans unless `--yes`); every file it touches is backed up under `~/.config/praeko/studio/setup-backups/<date>/` and recorded in a manifest; it ends with the list of what only you do. Other agents get the link to their docs page.
- `praeko studio login [--profile <name>] [--no-browser] [--json]`: gets the Praeko write key by sign-in with a code, like `gh auth login`. It prints a short code and `https://praeko.app/device`, opens the browser (`--no-browser` only prints), and waits while you check the code and the computer name in the dashboard and approve; the key comes back once and goes straight to the profile's store (macOS Keychain, elsewhere `~/.config/praeko/secrets.json` with mode 600). It never prints the key; `--json` prints one JSON line when waiting (`waiting_for_approval`, `verificationUrl`, `userCode`, `expiresAt`) and one at the end (`authorized`, `profile`, `keyName`). Works without a terminal, so an agent can run it and hand you only the code. Expired code, denial, network failures (backs off and retries) and Ctrl+C store nothing. When the profile already has a key, in a terminal it asks before replacing it (default: keep it, nothing requested); with `--yes`, `--json` or no terminal it replaces it and says so (`"replaced": true` in the last JSON line). `setup` ends with this sign-in when no key resolves for the project's profile (`PRAEKO_KEY` > profile > global); with a key it skips and says where the key came from.
- `praeko studio setup --key [--profile <name>] [--check-key]` (plan B, for when you have no browser): stores the Praeko key for a profile, read with hidden input and only in a terminal of your own (or from `PRAEKO_KEY` in the environment); never as an argument, never in the project, never printed. Without a terminal it refuses and prints the command for you to run.
- `praeko studio setup uninstall [--plan] [--yes] [--json]`: removes only what setup added and only while it is still as setup left it (the project folder and the key stay).
- Key per project profile: `PRAEKO_KEY` > the key of the profile in `.praeko/config.json` > the global key (the old single key is the profile `default`). `schedule --via praeko`, `doctor` and the local MCP use it; `doctor` shows only the profile name and the source.
- `praeko studio docs first-video`: the first test Short, step by step, for your agent after `setup`.
- New projects ignore `.praeko/cache/`.
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

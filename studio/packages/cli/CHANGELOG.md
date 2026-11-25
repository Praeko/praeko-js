# Changelog

Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [SemVer](https://semver.org/). In the 0.x series a breaking change may ship in a minor version, always recorded here.

## [Unreleased]

## [0.4.1] - 2026-11-24

New projects get `@praeko/studio-core` and `@praeko/studio-kit` `^0.4.1`.

### Added
- `check`/`compile` warn when a 3D skin is used over your own video (`base`): the 3D stage is drawn under the video, so the video covers the slab; use a 2D skin (see `docs/from-video.md`).

### Changed
- 3D skins render at CRF 23 (`--crf=23`): `clay-3d` went from about 28 Mbps (123 MB for 43 s) to about 7 Mbps with no visible difference, because its grain moves under the camera and used to eat the bitrate.
- `new --from-video` spreads runs of words the transcription gave no duration (they sat at the same instant, so the captions skipped them) over the time of the words around them, in proportion to their length, and says how many it moved.
- `new --from-video` writes a scene with `layout: free` (loose items over your video) instead of the default opaque panel, which hid the video.
- `retro-crt` is lighter (phosphor-green background, a softer curve and scan lines).

### Fixed
- An episode over your own video no longer warns "less than 1 s after the end of the voice" (it has no voice).

## [0.4.0] - 2026-11-24

New projects get `@praeko/studio-core` and `@praeko/studio-kit` `^0.4.0` (skins, `base` and the optional outro need them; `doctor` warns when an older core/kit is installed).

### Added
- `style` in `episode.yaml` and `style.visual` in `brand.json` (the first slug is the channel skin): `compile` validates the slug against the skin registry (an unknown slug is an error; free text marked `other` is ignored) and writes `style`/`channelStyle` to the spec. See `docs/style.md`.
- `base: { src, volume, fit }` in `episode.yaml` (the person's own video under the scenes, with its audio): validated; `voice` becomes optional with a `base`; warning when both play (doubled audio). HyperFrames renders `base` as an audible `<video>` (no compile warning).
- `outro` is optional (absent or `outro: false`).
- `sounds` accept `when: "phrase"` (or `[phrase, n]`, plus `offset`) besides `at`, resolved against `words.json`; sound names and keys are validated.
- `render` runs the skin post-process (`postprocess.ts`, ffmpeg) after either engine: pixel palette without dithering + nearest-neighbor upscale (`pixel`, `8bit`), CRT (`retro-crt`).
- `check` warns about text/background contrast of the episode's skin and about text a pixel post-process makes unreadable.
- `doctor` warns when episodes use skins, `base` or no outro and the project's `@praeko/studio-core`/`-kit` do not declare support (`praekoStudio.features`).
- `compile --engine hyperframes` says that HyperFrames applies only a skin's palette and fonts.
- `studio/scripts/style-gallery.mjs`: the gallery episode in every skin, with contact sheets and the PSNR regression of `default`.
- Brand interview (`init`, `brief`): new questions, all skippable and all with a flag for `--yes`. **Source** (`--source script,video`; video only skips the voice questions), **formats** (`--format short,long,carousel,image`, the first one is the main one and decides the suggested first episode), **visual style** (`--style`, any number, 1 or 2 advised with a soft warning above 2; 2D `flat`, `minimal`, `neon`, `comic`, `chalkboard`, `pixel`, `8bit`, `retro-crt`; 3D `clay-3d`, `blocks-3d`, `retro-3d`, `cinema-3d`; `--style-other "…"` for another style in your words) and **editing style** (`--pace calm|fast`, `--captions word|phrase|none`, `--effects shake,zoom,flash|none`, `--sound sfx|none`, `--face face|mascot|none`; `face` needs `--source video`). Lists are numbered in the terminal (answer with numbers or names); each option says whether Studio applies it or the agent follows it. Order: language, name, handle, agents, source, about, audience, tone, formats, visual style, editing style, colors, font, references, voice.
- References come after the style, and "what did you like" is a guided answer (pace, opening, look, captions, by number or name; free text still works).
- `brief.md`: sections Format, Visual style and Editing style; the hidden `praeko-brief:` line carries `source`, `format`, `style`, `edit`. `playbook.md`: Pace, Opening and Captions come from the editing style when there is one; a Visual section with the style's look and what never to do in it.
- `brand.json`: a `style` block `{ visual, format, edit, source }` (`visual[0]` is the channel's skin). A visual style suggests colors (accent, background, text, muted, box, code, cover background) and, for some styles, a system font stack; changing the style later only moves the values still at the previous style's (a color or font you changed stays). Projects without `style` are unchanged.
- `brief --only style` reopens formats, visual style and editing style.
- `new <slug> --from-video <file.mp4> [--lang pt|en|auto] [--cloud] [--transcript <file.json>]`: an episode over your own video. Copies it to `public/video/` (the original is never changed), transcribes it on this machine (cloud only with `--cloud`; `--transcript` reuses a transcript), writes `words.json`/`words.ts`, `script.txt` (the transcript), `publication.json` with `ai.synthetic: false`, and `episode.yaml` with `base: { src, volume: 1, fit: cover }`, no `voice:` and no `outro`; warns about words with zero duration and numbers in digits. Needs a `core`/`kit` that know `base`.
- `render <slug> --seconds <n>`: renders only the first n seconds to `out/<slug>-first-<n>s.mp4` (Remotion).
- `transcribe --out <name>.json`: names the three output files.
- `doctor`, and `init` with `--source video`, check the local Whisper used for your own videos and say how to get the model (`transcribe --download-model`, only after your yes).
- Docs topics `from-video` and `transcription` (the transcription page was not listed by `docs`).

### Changed
- The Short spec carries `format: "short"` (a Short without outro is no longer mistaken for a long video by `cover` and HyperFrames).
- The `.gitignore` of a new project ignores `public/video/` (your own videos are heavy).
- `init` pins `@praeko/studio-core` and `@praeko/studio-kit` to `^0.4.0` (was `^0.3.0`).
- In a pt project (`--lang pt` or the brief's language), `new` writes the outro as `SIGA PARA MAIS` (and `cut`, `VÍDEO COMPLETO NO YOUTUBE`), and `init` suggests `new meu-primeiro --title "Meu primeiro vídeo"`.
- `check` on an episode with `base` counts the words of `words.json` (the real speech) instead of the template `script.txt`, and reports the digits of the transcript as a caption note.
- `check` estimates one-line text in the skin's font (`fontAspect`): warns when an item shrinks below ~75% to fit, when it does not fit even at 45%, and when a pixel skin leaves it under ~9 real pixels; warns about `layout: free` scenes in 3D skins (drawn on the 940x1000 slab face).
- Style gallery: the regression of `default` is measured on PNG stills (identical or ≥ 80 dB, `--every`, `--allow`); the MP4 PSNR is informative only. The CRT post-process uses less noise and CRF 21 (about 20 MB for 43 s instead of 118 MB), and its screen curvature is softer (the label at the top is no longer cut).

### Fixed
- HyperFrames: scene sounds were read from a `f` key instead of `sound` (custom sounds played nothing).
- HyperFrames: the `base` video declares `data-has-audio` (required by the HyperFrames 0.9.13 check), so its audio plays.


## [0.3.3] - 2026-11-22

### Removed
- The Buffer provider: `schedule --via buffer`, the Buffer key (`schedule --key` now only stores the Praeko key), `--reminder`, `--url`, `publishing.buffer.*` and the `buffer.ts` module of the internal publish package. Praeko is the only scheduling provider. `--via praeko` and `publishing.provider: "praeko"` still work; `--via buffer`, `--reminder` and `--url` give a clear error, and so does a leftover `schedule.json` from Buffer (cancel those posts in the Buffer app and delete the file).
- Instagram on Praeko now only goes through the Meta API: `publishing.praeko.instagram.via` accepts only `"meta"` (the default, it was `"buffer"`), the cover is no longer pasted into the first frames of a copy (`--no-cover-frame` is ignored), and the Instagram minimum lead time is always 25 minutes.


### Added
- `transcribe` (pilot): `transcribe <file>` writes `transcript.json`, `.srt` and `.txt` on your machine (VoiceStudio, then local Whisper; the cloud engine only with `--cloud`).
- `transcribe --download-model [--yes]`: downloads the local Whisper model `large-v3-turbo-q5_0` (about 547 MB, from Hugging Face ggerganov/whisper.cpp) to `~/.config/praeko/models` only after your explicit yes (prompt or `--yes`; without a terminal and without `--yes` it refuses). Shows size and source, checks SHA-256 and refuses (and deletes) a file with another hash, writes to a `.part` file and renames at the end, resumes an interrupted download.
- The agent skill teaches the transcription: when to use it, read only what is needed, cloud only if asked, nothing goes up to Praeko.

### Changed
- The default local Whisper model is now `large-v3-turbo-q5_0` (was `small`). With a `small` model already in place, set `"transcription": { "model": "small" }` in `voices.json`.

## [0.3.2] - 2026-11-13

### Added
- `setup --no-login` (also with `--yes`): setup neither offers nor runs the sign-in by code. The first video does not need it (you drag the MP4 into the Praeko dashboard); the summary says the sign-in is optional and how to do it later (`npx @praeko/studio@0.3.2 login` in the project folder). `--json` carries `"noLogin": true`. Without the flag nothing changes.

### Changed
- Every message that tells you what to run now names a command that works without the `praeko` CLI (@praeko/cli) installed, always the scoped package at this exact version: `npx @praeko/studio@<version> <command>`, inside or outside the project folder (setup's "Next", its usage and backups line, the doctor's hints, `login --help`, `docs` and its topics, and the generated agent instructions). `praeko studio <command>` still works where @praeko/cli is installed; `help` says both.

### Security
- No message, agent instruction or doc tells you to run the unscoped `npx praeko-studio …` or `npx praeko …`: those names are not ours on npm, and `npx` (even with `--no`/`--no-install`) would look them up and could fetch someone else's package. The `docs` topics write the command as `npx @praeko/studio@<version>`, and `docs` prints it with the running version.

## [0.3.1] - 2026-11-13

### Fixed
- `praeko studio login` (and `setup` when it signs in) ended right after printing the code, with "Detected unsettled top-level await", when it opened the browser: the only thing keeping the process alive was an unref'd timer. The wait now keeps the process running until the approval. Regression test through the bin with a slow `open`/`xdg-open`.
- New projects pin `@praeko/studio-core` and `@praeko/studio-kit` to their own version line (`^0.3.0`), not to the CLI version.

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

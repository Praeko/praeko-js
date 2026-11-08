---
name: praeko-studio
description: Makes vertical Shorts (9:16) and long videos (16:9) with Praeko Studio: script, voice, word-by-word captions, scenes, cover and publishing texts, then publishes through Praeko (API/MCP) only after the person approves. Use when making, adjusting, reviewing or publishing a video in a project that has brand.json and src/index.ts.
---

# Praeko Studio: making a video with your own agent

You (the agent) need a **terminal (shell)** to render: without one (e.g. Claude Desktop with no shell) only publishing and metrics through the remote Praeko MCP work, not rendering; say so to the person instead of improvising. You (the agent) run Praeko Studio **on the person's machine**: you write the script and `episode.yaml`, run the commands and hand over the files. The person pays for the voice, the render and their own agent; Studio never calls a language model. Open the session **in the project folder** (where `brand.json` is). The command is `praeko studio <command>` (or `npx praeko-studio <command>`).

Full docs for the installed version: `praeko studio docs` (list) and `praeko studio docs episode-yaml`, `long-yaml`, `voice`, `publish`, `hyperframes`. When unsure about the YAML format, read it first. `praeko studio doctor` checks the environment (Node, ffmpeg, Chromium, fonts, keys, network).

## First: the brand brief (before the first script)
- If `brief.md` exists in the project, **read it, and `playbook.md`, before writing any script** and follow them. Where the playbook says `TODO`, complete it (below) and tell the person what you filled in.
- If `brief.md` does **not** exist, run the same interview as `praeko studio init`, **by talking**: short questions, **one at a time**, each skippable: channel name and handle, language (pt|en), what the channel is about (one sentence), who it is for, tone of voice (one sentence), colors (accent and background, hex) and font, 0 to 3 references (a URL or a description, plus what the person liked in it), and the voice (name/alias and provider only; **never ask for a key**). If a `brand/` folder sits next to the project (`../brand/build/tokens.json`), read it (never copy it out) and offer its colors and font as the defaults. Then write `brief.md`, `playbook.md` and the `brand.json` fields (name, handle, `colors.accent`, `colors.background`, `fonts.title`), show the person what you wrote and **only then** make the first video. `praeko studio brief` reopens the interview from the terminal (it keeps a `.bak` of brief.md and never overwrites an edited playbook.md).
- References: study each one with the tools **you** already have (open the page, read the transcript or captions, look at frames). Studio does not download or analyze video. Write what you find in `playbook.md` as **rules** (pace, how it opens, caption style, length), never as a copy of someone's video: no reusing their script, structure beat by beat, footage or voice. If you cannot access a reference, say so and leave the `TODO`; never invent an analysis of a video nobody watched.

## Short workflow
1. `praeko studio new <slug> --title "…"` creates `episodes/<slug>/` (script, publication.json, episode.yaml, scenes.tsx, cover) and registers it in `src/Root.tsx`.
2. Check every fact against its source and write `script.txt`. **The person approves the text before any spend** (final voice).
3. `praeko studio voice <slug> --quality draft`: **estimated, silent** voice (free, instant, no network) to assemble scenes. Not publishable: `check` warns while the voice is estimated. When the cut looks right, `--quality final` (ElevenLabs, spends the person's own characters: see `praeko studio voice balance`) and run `compile` again (timings change).
4. Write scenes in `episode.yaml`: each item ties to a spoken phrase with `when: "phrase"`. `praeko studio compile <slug>`: error = phrase not in the voice, invalid type or color, comma without quotes inside `{ }`; warning = item overflowing the panel or overlapping. What YAML cannot express goes in `scenes.tsx` via `component:`.
5. `praeko studio check <slug>`, `praeko studio render <slug> --scale 0.5` (preview) and `praeko studio contact-sheet <slug>` (frame mosaic: **look at the image**, do not trust the code alone).
6. Final `praeko studio render <slug>`, `praeko studio cover <slug>`, fill `publication.json` and run `praeko studio package <slug>` (writes `texts.md`, checks limits and the AI disclosure).
7. Long form (16:9): `praeko studio new <slug> --long`; vertical cuts: `praeko studio cut <long> <slug> --from … --to …`.

## Text rules
- Spoken text: short sentences, numbers spelled out, addresses as spoken (`pronunciation` in `brand.json`), few English emotion tags (`[curious]`, `[confident]`, `[short pause]`), about 190 words per minute.
- No real person's name without consent (`bannedNames` in `brand.json`). Every number has a source; anything unmeasured is called an estimate.
- Brand style rules live in `brand.json`, `brief.md` and the project's `playbook.md`. `package` flags AI writing tics (`publishing.aiTics: false` in `brand.json` turns it off).

## Voice, costs and secrets
- Keys **never** in project files, logs or chat: `echo $KEY | praeko studio voice config key elevenlabs/principal` stores it in the OS keychain (macOS) or in `~/.config/praeko/secrets.json`; `ELEVENLABS_API_KEY` and `PRAEKO_KEY` also work.
- Use **only the person's own voice** or a voice they are authorized to use. Before `--quality final`, show the text and the balance and wait for a yes.

## AI content disclosure (required in the package)
- Fill `"ai": { "synthetic": true|false }` in `publication.json`. A realistic synthetic voice, or generated image/video that looks real, requires the altered/synthetic content label on YouTube, "AI info" on Instagram and the AI-generated label on TikTok. `praeko studio check` and `package` warn when it is missing.
- YouTube receives the field through Studio's direct upload; through Praeko and on Instagram/TikTok **the person sets the label in the network's app** before publishing. Put that in the "before publishing" list.

## Publishing through Praeko (only after the person's yes)
Nothing is published unless the person says so. Two ways:
1. **CLI:** `praeko studio schedule <slug> --via praeko --when "dd/mm hh:mm"` only **simulates**. `--send` really publishes: never use it unless asked.
2. **Praeko MCP** (if connected to your agent): local file, in one step `create_media_upload { type, name, mime, size }` (size in bytes: `wc -c < file`), upload with the returned `curl`, then `complete_media_upload { mediaId }` until `ready`. Then `create_post`/`schedule_post` with **mandatory two steps**: the first call returns only the **preview** and a `confirmation_code`; **show the whole preview to the person** (channels, time in BRT/UTC, media, texts, warnings), wait for explicit approval, and only then repeat the call with the same arguments plus `confirm`. Never confirm on your own.
Praeko key (`write` scope): `echo $KEY | praeko studio schedule --via praeko --key`.

## Render engine
Remotion is the default engine for videos AND covers (and for `scenes.tsx` pieces); `--engine hyperframes` renders videos and covers with HyperFrames (Apache-2.0, fetched with npx on first use) and uses nothing from Remotion (scenes and covers with `component:` only render in Remotion). Remotion has its own license: free for individuals and companies up to 3 people; see the notice in `praeko studio doctor`.

## Old projects
A project from Studio 0.1.x (Portuguese file and key names) is converted once with `praeko studio migrate --dry-run`, then `praeko studio migrate`.

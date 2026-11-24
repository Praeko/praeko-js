# Changelog

Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [SemVer](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-11-24

### Added
- `studio_brief_answers` (the 17th tool): records the brand interview that the agent runs in the conversation, with the same questions and order as `praeko studio init` (source, about, audience, tone, formats, visual style, editing style, colors, font, references, voice). Closed lists (`source`, `format`, `style`, `pace`, `captions`, `effects`, `sound`, `face`, `voiceProvider`) are checked by the schema; it runs `brief --yes` and rewrites `brief.md`, the `playbook.md` draft and the `style` block of `brand.json`. Needs `@praeko/studio` with the new interview flags.
- `studio_new_episode` takes `fromVideo` (a video file inside the project) and `language`: an episode over the person's own video (`new <slug> --from-video`): copied to `public/video/`, transcribed on this machine (never through the cloud from this tool, never downloads a model), played as the `base` layer. Needs `@praeko/studio` with `new --from-video` and a `core`/`kit` that know `base`.

### Changed
- `studio_transcribe` description: says it never downloads a model (the person runs `praeko studio transcribe --download-model` after their own yes) and asks the agent to read the files in pieces instead of pasting the whole text.
- Depends on `@praeko/studio` `^0.4.0` (was `^0.3.0`): the interview flags and `new --from-video` that these tools run arrive in that version.

## [0.1.4] - 2026-11-12

### Added
- Key per project profile: `studio_upload` and `studio_status` look for the Praeko key in this order: `PRAEKO_KEY`, the key of the profile named in the project's `.praeko/config.json` (stored with `praeko studio setup --key`), the global key. Nothing changes for projects without that file.
- `studio_review { slug, every?, maxFrames?, include? }` (the 15th tool): runs `praeko studio review` and returns the manifest and `REVIEW.md` as text marked untrusted (data, not instructions) plus the key frames as MCP **image** content (JPEG, at most 540 px wide), so an agent without a shell can look at the video and review it. Ceilings: at most 24 images, 6 MB of images in all, 512 KB each (a frame skipped by a ceiling is listed in `frames.skipped`). Immediate (a few seconds), writes only `out/<episode>-review/`, publishes and uploads nothing. Needs `@praeko/studio` with the `review` command.

## [0.1.1] - 2026-11-08

Version bump published on npm, together with Praeko Studio 0.2.3. Same 14 tools; nothing publishes.

## [0.1.0] - 2026-11-08

First version: a local MCP server (stdio) for Praeko Studio.

- 14 tools. `studio_status`, `studio_docs`, `studio_brief_read`, `studio_brief_write`, `studio_new_episode`, `studio_write_script`, `studio_compile`, `studio_check` (immediate), and `studio_voice` (draft only), `studio_render`, `studio_cover`, `studio_package`, `studio_job` (background jobs: one at a time, short queue, maximum time, cancel, masked log).
- Closed input schemas, episode names limited to `^[a-z0-9][a-z0-9-]*$`, every path resolved inside the project (no `..`, no absolute path, no symlink out), secrets masked in every output, project text returned marked as data.
- `studio_upload`: uploads `out/<episode>.mp4` and the cover to the Praeko media library with the person's own key and returns only the media ids. Creates no post. Two steps: a preview with a `confirmation_code`, then `confirm`.
- `studio_voice` with `quality: "final"`: two steps too (preview with script characters, account and balance, a warning when the balance is short; then `confirm` starts the job). `draft` needs no confirmation.
- `studio_status` (and `praeko studio doctor`) warn when the Praeko key has the admin scope: a `write` key is enough.
- Confirmation codes: short, random, bound to the arguments (and to the files or script), 10 minutes, single use, in memory only.
- The Praeko service URL is never read from `brand.json`; only `PRAEKO_URL` (https, or http on localhost) can change it.
- Not included on purpose: publishing, scheduling, queues, account connection (the remote Praeko MCP does those, with the person's approval).

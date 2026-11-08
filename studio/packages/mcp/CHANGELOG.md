# Changelog

Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [SemVer](https://semver.org/).

## [0.1.0] - unreleased

First version: a local MCP server (stdio) for Praeko Studio.

- 14 tools. `studio_status`, `studio_docs`, `studio_brief_read`, `studio_brief_write`, `studio_new_episode`, `studio_write_script`, `studio_compile`, `studio_check` (immediate), and `studio_voice` (draft only), `studio_render`, `studio_cover`, `studio_package`, `studio_job` (background jobs: one at a time, short queue, maximum time, cancel, masked log).
- Closed input schemas, episode names limited to `^[a-z0-9][a-z0-9-]*$`, every path resolved inside the project (no `..`, no absolute path, no symlink out), secrets masked in every output, project text returned marked as data.
- `studio_upload`: uploads `out/<episode>.mp4` and the cover to the Praeko media library with the person's own key and returns only the media ids. Creates no post. Two steps: a preview with a `confirmation_code`, then `confirm`.
- `studio_voice` with `quality: "final"`: two steps too (preview with script characters, account and balance, a warning when the balance is short; then `confirm` starts the job). `draft` needs no confirmation.
- `studio_status` (and `praeko studio doctor`) warn when the Praeko key has the admin scope: a `write` key is enough.
- Confirmation codes: short, random, bound to the arguments (and to the files or script), 10 minutes, single use, in memory only.
- The Praeko service URL is never read from `brand.json`; only `PRAEKO_URL` (https, or http on localhost) can change it.
- Not included on purpose: publishing, scheduling, queues, account connection (the remote Praeko MCP does those, with the person's approval).

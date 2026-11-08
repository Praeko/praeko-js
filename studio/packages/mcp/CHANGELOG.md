# Changelog

Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [SemVer](https://semver.org/).

## [0.1.0] - unreleased

First version: a local MCP server (stdio) for Praeko Studio.

- Tools: `studio_status`, `studio_docs`, `studio_brief_read`, `studio_brief_write`, `studio_new_episode`, `studio_write_script`, `studio_compile`, `studio_check` (immediate), and `studio_voice` (draft only), `studio_render`, `studio_cover`, `studio_package`, `studio_job` (background jobs: one at a time, short queue, maximum time, cancel, masked log).
- Closed input schemas, episode names limited to `^[a-z0-9][a-z0-9-]*$`, every path resolved inside the project (no `..`, no absolute path, no symlink out), secrets masked in every output, project text returned marked as data.
- Not included on purpose: publishing, scheduling, queues, account connection (the remote Praeko MCP does those, with the person's approval). `studio_upload` and the final voice (with a two-step confirmation) come in a later version.

# @praeko/studio-mcp

A local [MCP](https://modelcontextprotocol.io) server for [Praeko Studio](https://praeko.app/docs): it lets an agent **without a terminal** (Claude Desktop, for example) write the brief and the script, compile, make the draft voice, render, make the cover and build the publishing texts of a video, on your machine. It runs the Studio CLI (`@praeko/studio`) for you. Stdio only: no port is opened.

It **never publishes** and never shows a key. Publishing, scheduling and insights belong to the remote Praeko MCP, always with your approval.

> **Licenses.** This package is MIT. **Remotion** (the default render engine) is **not MIT**: free for individuals, non-profits and companies of up to 3 employees; larger companies need the Company License ([remotion.pro/license](https://www.remotion.pro/license)). The license belongs to whoever installs and runs Remotion. See [LICENSES.md](./LICENSES.md).

## Use
Create a project first (`npx @praeko/studio init my-channel`), then point the server at it:
```sh
claude mcp add praeko-studio -- npx -y @praeko/studio-mcp --project ~/my-channel
```
For other clients, the equivalent JSON block: `{ "command": "npx", "args": ["-y", "@praeko/studio-mcp", "--project", "<folder>"] }`. `--project` defaults to the current folder and must contain `brand.json`.

## Tools
| Tool | What it does |
|---|---|
| `studio_status` | environment check (`doctor`), no keys |
| `studio_docs` | Studio documentation topics |
| `studio_brief_read` / `studio_brief_write` | `brief.md`, `playbook.md`, `brand.json` (validated) |
| `studio_new_episode` | creates `episodes/<name>/` |
| `studio_write_script` | writes `script.txt` or `episode.yaml` (YAML validated) |
| `studio_compile` / `studio_check` | compile the spec; check the episode |
| `studio_voice` | voice as a background job: `draft` (silent, free) or `final` (spends ElevenLabs characters; **two steps**) |
| `studio_render` / `studio_cover` / `studio_package` | background jobs |
| `studio_review` | the review package of a rendered video or slides: manifest and `REVIEW.md` as data, the key frames as **images** (at most 24, 6 MB in all, 512 KB each); no AI model is called, nothing is published or uploaded |
| `studio_job` | status, log or cancel of a job by `jobId` |
| `studio_upload` | uploads the video and cover to your Praeko media library and returns the media ids; **two steps**; creates no post |

## Two servers, and the flow without a terminal
`praeko-studio` (this one, local) never publishes. `praeko` (the remote MCP at `https://praeko.app/mcp`) publishes, always in two steps. Flow: create the episode, render, `studio_package`, `studio_review` (you look at the frames and write the review for the person before asking for approval), `studio_upload` (returns `mediaId`s), then `create_post` of the remote server with those ids.

## Two-step tools
`studio_upload` and `studio_voice` with `quality: "final"` spend something (storage, ElevenLabs characters). The first call changes nothing: it returns a preview and a `confirmation_code`. Show the preview to the person; after their approval call again with the same arguments plus `confirm: "<code>"`. The code is short, random, bound to the arguments (and to the files or the script), valid for 10 minutes, single use, and kept only in this process's memory.

## Keys
`studio_upload` uses your own Praeko key, found the way Studio finds it: `PRAEKO_KEY` in the server's environment, the macOS Keychain or the secrets file. It is never returned, logged or put in an error. Use a key with the **`write`** scope (not `admin`): `studio_status` and `praeko studio doctor` warn if the key is admin. The service address is never read from `brand.json`; only `PRAEKO_URL` (https, or http on localhost) can change it.

## Other clients
Config blocks for Claude Desktop, Cursor, Codex, Gemini CLI and opencode: <https://praeko.app/docs/studio/mcp>.

## Safety
- Inputs are closed schemas; episode names match `^[a-z0-9][a-z0-9-]*$`; every path is resolved inside the project (no `..`, no absolute path, no symlink leading out).
- The Studio CLI is started with a fixed argument list; nothing the agent writes becomes a command line.
- One job per project at a time, a short queue, a maximum time per job, cancellation; logs are masked.
- Text from the project (script, brief, tool output quoting them) comes back marked `untrusted`: it is data, not instructions.
- Confirmation codes are in memory only; the Praeko key and the ElevenLabs keys never leave the process.
- No telemetry.

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
| `studio_voice` | draft (silent, free) voice, as a background job |
| `studio_render` / `studio_cover` / `studio_package` | background jobs |
| `studio_job` | status, log or cancel of a job by `jobId` |

## Safety
- Inputs are closed schemas; episode names match `^[a-z0-9][a-z0-9-]*$`; every path is resolved inside the project (no `..`, no absolute path, no symlink leading out).
- The Studio CLI is started with a fixed argument list; nothing the agent writes becomes a command line.
- One job per project at a time, a short queue, a maximum time per job, cancellation; logs are masked.
- Text from the project (script, brief, tool output quoting them) comes back marked `untrusted`: it is data, not instructions.
- No telemetry.

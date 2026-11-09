# @praeko/studio

Praeko Studio makes short (9:16) and long (16:9) videos from a script: voice, word-by-word captions, scenes, cover and publishing texts. You operate it with **your own coding agent** (Claude Code, Codex, Gemini CLI, Cursor, opencode…) on **your machine**: the agent writes the script and `episode.yaml`, runs the commands and, only after your yes, publishes through [Praeko](https://praeko.app/docs). Voice, render and agent are at your own cost; Studio calls no language model and none of your scripts leaves the machine until you publish.

> **Licenses.** Praeko Studio's own code is MIT. **Remotion** (the default engine for videos and covers) is **not MIT**: free for individuals, non-profits and companies of up to 3 employees; companies with 4 or more people need the Company License ([remotion.pro/license](https://www.remotion.pro/license)). The license belongs to whoever installs and runs Remotion. HyperFrames (`--engine hyperframes`, which renders the video and the cover with nothing from Remotion) is Apache-2.0. Details: [LICENSES.md](./LICENSES.md) or `praeko studio licenses`.

## Requirements
Node 22 or newer, `ffmpeg` and `ffprobe` on the PATH, and a Chrome (Remotion downloads the Chrome Headless Shell on its own at the first render; it needs internet at that moment). macOS and Linux are supported; Windows is best effort and untested. `praeko studio doctor` checks everything.

The agent needs a terminal. An agent without one (Claude Desktop, for example) can use the local MCP server, [`@praeko/studio-mcp`](https://praeko.app/docs/studio/mcp): it still needs Node, Chrome/Remotion and your own keys on your machine, and it never publishes (publishing is the remote `praeko` MCP).

## Install
```sh
# npm
npm install -g @praeko/studio
# yarn
yarn global add @praeko/studio
# pnpm
pnpm add -g @praeko/studio
# bun
bun add -g @praeko/studio
# without installing
npx @praeko/studio init my-channel
```
It also works as `praeko studio <command>` when `@praeko/cli` is installed (it hands over to Studio).

## First video
```sh
praeko-studio init my-channel --name "My Channel" --agent claude   # project + instructions for your agent
cd my-channel
praeko-studio doctor
praeko-studio new my-first --title "My first video"
praeko-studio voice my-first --quality draft                       # estimated, silent voice: free, no network
praeko-studio check my-first
praeko-studio render my-first && praeko-studio contact-sheet my-first && praeko-studio cover my-first && praeko-studio package my-first
```
In a terminal, `init` first interviews you (name, audience, tone, colors, font, up to 3 references; Enter skips any question) and writes `brief.md` and a draft `playbook.md` that your agent reads before the first script. Everything can also come by flag (`--about`, `--audience`, `--tone`, `--accent`, `--background`, `--font`, `--reference`, `--reference-note`), and `--yes` (or no terminal) asks nothing. Studio does not watch the references: your agent analyzes them. `praeko-studio brief` reopens the interview later (keeps `brief.md.bak`, never overwrites an edited `playbook.md`).

Open your agent in the project folder and ask for the video: the instructions (`CLAUDE.md`/`AGENTS.md`/`GEMINI.md`/`.cursor/rules`…) are already there (`praeko studio skill install --agent all` rewrites them). Docs of the installed version: `praeko studio docs`.

## Publish
`praeko studio schedule <slug> --via praeko --when "dd/mm hh:mm"` only simulates; `--send` really publishes. Through the Praeko MCP the upload of the local file uses `create_media_upload` and publishing is always in two steps (preview and confirmation code). Declare AI content in `publication.json` (`"ai": { "synthetic": true }`). See `praeko studio docs publish`.

## Upgrading from 0.1.0
0.2.0 is English only (commands, flags, files, keys). Convert an existing project once: `praeko studio migrate --dry-run`, then `praeko studio migrate` (backup in `.studio-backup/`, report at the end).

## License
MIT (the code of this package). See also [LICENSES.md](./LICENSES.md).

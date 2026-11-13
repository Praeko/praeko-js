# Publishing through Praeko

Studio **publishes nothing on its own**. `npx @praeko/studio@<version> package <slug>` writes `texts.md` and checks limits, hashtags and the AI disclosure; `npx @praeko/studio@<version> schedule` hands the video, cover and texts to Praeko, which schedules them on the networks connected to your workspace.

## From the CLI (`--via praeko`)
```sh
npx @praeko/studio@<version> login                                            # sign-in by code: you approve it at praeko.app/device; the key is stored for the project's profile
echo $KEY | npx @praeko/studio@<version> schedule --via praeko --key          # or paste a praeko_… key (write scope); the same one as the `praeko` CLI
npx @praeko/studio@<version> schedule --channels --via praeko                 # lists the connected channels
npx @praeko/studio@<version> schedule <slug> --when "06/11 17:30" --via praeko           # SIMULATES (only reads the channels)
npx @praeko/studio@<version> schedule <slug> --when "06/11 17:30" --via praeko --send    # uploads the video and really schedules
npx @praeko/studio@<version> schedule <slug> --status | --cancel | --clear
```
`brand.json` → `publishing.provider: "praeko"` makes Praeko the default (`init` already writes it that way). `publishing.praeko.channels` pins the account when there is more than one per network. YouTube is uploaded as private and scheduled; TikTok goes as a draft (`publishing.praeko.tiktok.mode`); the minimum time is 5 minutes ahead.

## Agent without a terminal (Claude Desktop and others): the local MCP server
`@praeko/studio-mcp` runs on your machine and exposes the Studio steps as tools (`studio_new_episode`, `studio_voice`, `studio_render`, `studio_package`, …). `studio_upload` puts the rendered video and cover in your Praeko media library (two steps: preview and `confirm`) and returns the media ids; publishing is still the remote `praeko` MCP's `create_post`, in two steps. `npx @praeko/studio@<version> init` and `brief` end by printing the install lines for the project.

## Through the Praeko MCP (agent with a shell)
The video file never goes through the MCP. In one step: `create_media_upload { type: "video", name, mime, size }` (`size` in bytes: `wc -c < file`) returns a ready `curl`; upload the file; then `complete_media_upload { mediaId }` until the state is `ready`. Then `create_post`/`schedule_post` in **two steps**: the 1st call returns only the **preview** and a `confirmation_code`; **show the whole preview to the person**, wait for the yes and repeat the call with the same arguments plus `confirm`. The agent never confirms on its own. See the MCP documentation at praeko.app/docs.

## AI disclosure (checked by `check` and `package`)
Fill `"ai": { "synthetic": true|false }` in `publication.json`. A realistic synthetic voice, or a generated image/video that looks real, needs the altered/synthetic content label: YouTube (the `containsSyntheticMedia` field, sent when Studio publishes directly), "AI info" on Instagram and the AI label on TikTok. Through Praeko, **set the label in each network's app before publishing** (Praeko's public API does not carry this field yet). Drafting a script with AI or cloning **your own** voice to narrate does not require the label on YouTube, but the rules change: check each network's current policy.

## Advanced
`post` (direct publishing with your own credentials for each network), `queue` and `account <network>` stay in the package for those who need them; `queue install` uses launchd and only works on macOS. The Buffer provider (`--via buffer`) is legacy.

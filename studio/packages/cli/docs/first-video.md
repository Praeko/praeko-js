# First video (for your agent, after `npx @praeko/studio@<version> setup`)

Read this whole page before you start. You (the agent) run every command in the **project folder** (the one with `brand.json`), as `npx @praeko/studio@<version> <command>`; the person approves. Never ask for, read or print a key.

The first video needs **no Praeko key and no sign-in**: when the MP4 is ready, give the person its full path and they drag the file into the Praeko dashboard. Signing in is optional, only if the person asks you to upload or publish by yourself later:

- Run `npx @praeko/studio@<version> login --json` **in the background** (it waits up to 10 minutes for the approval). Read its first line, `{"status":"waiting_for_approval","verificationUrl":…,"userCode":…}`, and give the person **the address and the code**: "Open https://praeko.app/device and type the code ABCD-EFGH; approve only if the computer name is yours." The person approves in the browser; the last line becomes `{"status":"authorized","profile":…,"keyName":…}`. The key goes straight to the project's profile (Keychain or secrets file): you never see it, and the output never has it.
- `expired`: run it again for a new code. `denied`: the person said no (or the code was blocked); ask before trying again.
- No browser on this machine? Plan B: the person runs `npx @praeko/studio@<version> setup --key` in **their own** terminal (hidden input).

## 0. Check
1. `npx @praeko/studio@<version> doctor`. For every line marked ✗ or ⚠, tell the person what is missing and PROPOSE the command it shows for their system. Install only after their yes, never `sudo` without warning first, then run the doctor again.
2. If `brief.md` does not exist, or `playbook.md` still has `TODO`, run the brand interview **by talking**: one short question at a time, all skippable (name, audience, tone, colors, font, up to 3 references, voice: only the nickname and the provider). Write `brief.md` and `playbook.md`, adjust `brand.json` and tell the person what you filled in.
3. If `npx @praeko/studio@<version> doctor` says the license notice was not recorded, show `npx @praeko/studio@<version> licenses` and ask the person to run `npx @praeko/studio@<version> licenses --accept` themselves.

## 1. A test Short (about 30 seconds, nothing spent)
1. `npx @praeko/studio@<version> docs episode-yaml` (read it before writing YAML).
2. `npx @praeko/studio@<version> new my-test --title "<title>"`, write `episodes/my-test/script.txt` and **show it**. Go on only after the person's yes.
3. `npx @praeko/studio@<version> voice my-test --quality draft`: a silent, estimated voice (free, no network). Never `--quality final` without a yes: it spends the person's voice credit.
4. Write the scenes in `episode.yaml`, then, in this order: `npx @praeko/studio@<version> compile my-test`, `npx @praeko/studio@<version> check my-test`, `npx @praeko/studio@<version> render my-test --scale 0.5`, `npx @praeko/studio@<version> contact-sheet my-test` (look at the image and fix what is wrong), `npx @praeko/studio@<version> cover my-test`, `npx @praeko/studio@<version> package my-test`.
5. `npx @praeko/studio@<version> review my-test`: LOOK at the frames in `out/my-test-review/frames/` in order, read `REVIEW.md` and write the review in its format.
6. Show the person the script, the contact sheet, the cover, `texts.md`, your review and the check warnings (the draft voice is expected). Then give the person the **full path** of the video (`out/my-test.mp4` inside the project folder, as an absolute path) so they can drag it into the Praeko dashboard. **Publish nothing.**

## 2. Publishing (only after the person's yes)
Through the remote `praeko` MCP server, in two steps: the first call of `create_post` or `schedule_post` returns a preview and a `confirmation_code`; show the whole preview, wait for an explicit yes, then repeat with `confirm`. Upload local files with `create_media_upload` and the `curl` it returns (the key comes from `$PRAEKO_KEY` in the environment; never print it). Without a terminal, `studio_upload` on the local Studio server returns the media id. From the command line, `npx @praeko/studio@<version> schedule my-test --via praeko --when "dd/mm hh:mm"` only simulates; `--send` publishes, never without being asked.

# Voice in Praeko Studio

`npx @praeko/studio@<version> voice <slug> --quality draft|final|local` writes `voice.mp3` and the per-word timings (`words.json`/`words.ts`).

| Quality | What it does | Cost |
|---|---|---|
| `draft` | **estimated, silent** voice (~190 words/min), no network | free |
| `final` | ElevenLabs (TTS) + Scribe (per-word timings), **your** account and key | characters of your plan |
| `local` | VoiceStudio (compatible local server, `http://127.0.0.1:3900` by default) | free, must be running |

## Set up your voice
Layers of `voices.json` (the top one wins): **project** (next to `brand.json`) > **user** (`~/.config/praeko/studio/voices.json`, or `PRAEKO_STUDIO_CONFIG`) > package default (no ids).
1. Store the key: `echo $KEY | npx @praeko/studio@<version> voice config key elevenlabs/principal` (system keychain on macOS; file `~/.config/praeko/secrets.json` with 600 permission on Linux; on Windows prefer the `ELEVENLABS_API_KEY` variable).
2. Register the voice: `npx @praeko/studio@<version> voice account add principal --voice my-voice --voice-id <voice id>` (writes the id into the project's `voices.json`) or set `ELEVENLABS_VOICE_ID`.
3. In `brand.json`, `"voice": "my-voice"` applies to `voice` without `--quality`; with `--quality final` the voice in `quality.final` applies. The `init` default is `draft-silent`, so it never spends by accident.
More than one account (failover by balance): `account add <other>`; the router skips an account with no balance or with an invalid key.

## Rules
- Use **only your own voice** or one you are authorized to use (ElevenLabs terms).
- A realistic synthetic voice requires the AI label on the platforms: fill `"ai": { "synthetic": true }` in `publication.json`.
- A key never goes in a project file, in a log or in a chat with an agent. Reading order: environment variable, macOS keychain, secrets file.
- The VoiceStudio OmniVoice model is CC-BY-NC (non-commercial): do not use it in monetized content.

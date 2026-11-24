# Transcription (pilot)

Turns any audio or video file into text with per-word times, on your machine. To make an episode over your own video, `new <slug> --from-video <file.mp4>` runs this for you (see `docs from-video`).

```
npx @praeko/studio@<version> transcribe <file> [--lang pt|en|auto] [--cloud] [--engine voicestudio|whisper-local|scribe] [--out <folder>|<name>.json] [--json]
npx @praeko/studio@<version> transcribe --download-model [--yes]
```

It writes three files next to the file (or in `--out <folder>`; a second run in the same folder overwrites them). With `--out <name>.json` the three files take that name instead (`<name>.json`, `<name>.srt`, `<name>.txt`), so several transcripts can live in one folder:

- `transcript.json`: `engine`, `engineVersion`, `language`, `durationSec`, `words` (`[{ t, a, b }]`, seconds), `text` and `attempts` (engine, ok, reason; never a key or a path).
- `transcript.srt`: cues broken at sentence ends, pauses over 0.8 s, 6 s or 84 characters; long cues take two lines.
- `transcript.txt`: the plain text.

Note: `--lang pt|en` is also the language of Studio's messages; `--lang auto` (the default) lets the engine detect the language.

## How it works

1. `ffmpeg` extracts the audio to 16 kHz mono wav (needed on PATH; the error says how to install it). A corrupt file or one with no audio track stops here, with no engine tried.
2. Engines are tried in order: `voicestudio` (app running at 127.0.0.1:3900) then `whisper-local` then `scribe`. An engine that is down, busy (429), too slow, missing its binary or model, or whose output fails the quality gate hands over to the next one; the reason is in `attempts`.
3. **ElevenLabs Scribe is the cloud** (the audio leaves your machine). It runs only with `--cloud` or `"transcription": { "allowCloud": true }` in `voices.json`, and only with an ElevenLabs key. Without it, nothing is ever sent.
4. Quality gate: words per minute outside 40 to 300 (clips of 5 s or more), more than 30% of words with zero duration, detected language different from the one asked, repeating loops, empty output.
5. Time limit: 3 times the audio duration for local engines, 1 times for the cloud (at least 20 s). Settings in `voices.json` under `transcription`: `engines`, `allowCloud`, `model`, `modelPath`, `localTimeoutFactor`, `cloudTimeoutFactor`, `minTimeoutSec`.

## Local Whisper

`whisper-local` uses, if present on PATH:

- `whisper-cli` (whisper.cpp; `brew install whisper-cpp`) with the model `ggml-large-v3-turbo-q5_0.bin` in `~/.config/praeko/models` (or `transcription.modelPath`; `transcription.model` picks another name, file `ggml-<model>.bin`), or
- Python `faster-whisper` (`pip install faster-whisper`) with the `large-v3-turbo` model already in its cache.

The default model is `large-v3-turbo-q5_0` (whisper.cpp, quantized; tested in Portuguese with very good results).

### Getting the model: `--download-model`

Transcribing never downloads anything. When the model is missing the error says so and names the command:

```
npx @praeko/studio@<version> transcribe --download-model [--yes]
```

- It shows the size (about 547 MB, 574,041,195 bytes), the source (`https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin`, the official whisper.cpp model repository) and the destination, then **asks**. Only a "yes" at the prompt or `--yes` starts the download. Without a terminal and without `--yes` it refuses.
- It writes `ggml-large-v3-turbo-q5_0.bin.part` and renames it at the end. The SHA-256 must be `394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2` (the LFS hash published by that repository, checked on 2026-11-20); any other file is refused and deleted, never installed.
- If the download is interrupted the `.part` stays and the same command resumes it (HTTP Range). If the model is already there it does nothing.
- To remove the model, delete the file in `~/.config/praeko/models`.

If neither engine exists, the error tells you what to install and the next engine runs.

## MCP

`studio_transcribe { file, language?, out? }` runs the same command inside the project and returns the summary, the paths of the three files and a short preview of the text (not the whole text). The MCP tool cannot turn the cloud on (only the person's configuration can) and never downloads a model: the person runs `--download-model` in a terminal.

## Agent skill

The `praeko-studio` skill tells the agent when to transcribe, to read `transcript.txt` and `transcript.json` in pieces (summary and excerpts with times, never the whole text in the conversation), to use `--cloud` only if the person asks, to ask before `--download-model`, and that nothing goes up to Praeko.

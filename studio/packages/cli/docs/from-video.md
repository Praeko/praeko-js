# Your own video (edit a video you recorded)

When the person already has the video (a recording of themselves, a screen capture, a talk) and wants Studio to add captions, labels, effects and the cover, the video becomes the **base layer** of the episode: it plays under every scene, with its own sound. There is no script to voice and no voice to make.

```
npx @praeko/studio@<version> new <slug> --from-video <file.mp4> [--lang pt|en|auto] [--cloud] [--transcript <transcript.json>] [--title "Video title"]
```

What it does, in order (a failure stops before anything is written):

1. Reads the video with `ffprobe` (size, duration, audio). A file without an audio track stops here: there is nothing to transcribe.
2. Extracts the audio with `ffmpeg` (16 kHz mono, in a temporary folder deleted at the end) and **transcribes it on this machine** (VoiceStudio, then local Whisper; see `docs transcription`). The cloud engine (ElevenLabs Scribe, the audio leaves the machine) runs only with `--cloud`. With `--transcript <file.json>` it uses a transcript you already have (the `transcript.json` of `transcribe`, or `[{ t, a, b }]`) and transcribes nothing.
3. Copies the video to `public/video/<slug>.mp4` (same extension as the original). **The original file is never changed.** `public/video/` is in the project's `.gitignore`: videos are heavy, keep them out of git (back them up elsewhere).
4. Writes `episodes/<slug>/`: `words.json` and `words.ts` (the words with their times: they drive the captions and the `when` anchors), `script.txt` (the text of the transcript, for `check` and `review`), `publication.json` (with `"ai": { "synthetic": false }`: a recorded video, not a synthetic voice; change it if the video has a synthetic voice or a generated person), `episode.json`, `scenes.tsx` (the cover) and `episode.yaml`.
5. Compiles the episode and registers it in `src/Root.tsx`, like `new`.

It warns when the transcript has **words with zero duration** (the caption flashes or is skipped: check them in `words.json`) or **numbers written as digits** (the captions show them like that; spell them out with `captionFixes` in `brand.json` if you prefer, and use the digits in `when` phrases).

## The episode.yaml it writes

```yaml
id: MyTalk
duration: 37.9         # s: the length of your video
caption: 80
base: { src: video/my-talk.mp4, volume: 1, fit: cover }
cover: { id: CoverMyTalk, component: CoverMyTalk }
scenes:
  - start: 0
    title: MY TALK
    label: MY TALK
    items:
      - { type: text, at: 0.3, size: 52, color: accent, text: "My talk" }
```

- `base`: the video under every scene. `src` is relative to `public/`; `volume` 1 keeps its sound as it is; `fit: cover` fills the 9:16 frame (a horizontal video is cropped).
- There is **no `voice:`** (the sound is the video's) and **no `outro`** (the video ends as it ends). Add an `outro` only if you want the end card.
- Scenes and items work as in `docs episode-yaml`; `when` accepts phrases of your video (as the transcript wrote them).
- `style:` changes the look of this episode only (see `docs style`).

## Next steps

1. Add scenes and items (labels, `big` words, `hits` for shake/zoom/flash, `sounds`) in `episode.yaml`, then `npx @praeko/studio@<version> compile <slug>`.
2. `npx @praeko/studio@<version> render <slug> --seconds 10`: renders only the first 10 seconds to `out/<slug>-first-10s.mp4`, a quick look at the captions and the framing (Remotion only).
3. `npx @praeko/studio@<version> check <slug>`: for an episode with `base` it counts the words of `words.json` (the real speech), not of a script.
4. `render`, `contact-sheet`, `cover`, `package` and `review`, as in `docs first-video`.

## Notes

- **Privacy:** the video and the transcript stay on this machine. Studio never downloads anyone's video and never uploads yours (only `studio_upload` or `schedule --send`, after the person's yes).
- **The local model:** without local Whisper the command says how to get it: `npx @praeko/studio@<version> transcribe --download-model` (about 547 MB, only after the person's yes; Studio never downloads it by itself). `doctor` checks it when `brand.json` says the channel uses its own videos (`style.source` with `video`).
- **Formats:** tested with vertical 30 fps video. Another frame rate is played by the render at 30 fps; a horizontal video is cropped by `fit: cover`.
- The interview question **source** (`--source video`) records that the channel edits its own videos: it skips the voice questions and offers "you, on camera" in "who appears".

# Episode in YAML

`episodes/<slug>/episode.yaml` describes the Short; `npx @praeko/studio@<version> compile <slug>` (or `render`/`cover`, which compile on their own) checks it and writes `episode.spec.json`, which the `EpisodeDecl` of `@praeko/studio-kit` reads. `episode.tsx` is fixed (created by `npx @praeko/studio@<version> new`). What the YAML cannot express goes in `scenes.tsx` and is called with `component:`.

## Top level
```yaml
id: CommentTimestamp             # Composition name (default: the one in episode.json)
duration: 60.2                   # s, whole video
caption: 80                      # px of the word-by-word caption
voice: audio/comment-timestamp.mp3
background: ["lines that float in the background", "…"]
hits: [{ at: 31.5, type: flash }, { at: 44.9, type: zoom }]   # shake | zoom | flash | all
outro: { start: 52.4, cta: ARTICLE ON THE DEVLOG }
cover: { id: CoverComment, component: CoverComment }          # TSX in scenes.tsx; or title/color/glow/size/items
style: flat                      # optional: the skin of this episode (default: brand.json style.visual[0]); see style.md
scenes: [ … ]
```

`outro` is optional: leave it out (or `outro: false`) for no end card; the last scene then runs to `duration`.

### Your own video under the scenes (`base`)
```yaml
base: { src: video/my-take.mp4, volume: 1, fit: cover }   # file under public/; volume 0–2; fit cover (crops to 9:16) | contain
```
The video plays full screen under every scene, with its own audio, no frame and no loop. With `base`, `voice:` is optional (the audio is the video's; setting both warns that the audio may double, unless `volume: 0`), the terminal background is not drawn, and a scene change no longer clears the screen for 0.1 s: only the scene's panel enters and leaves. Without `base` nothing changes. Works in both engines.

## Times by phrase (they follow the voice)
In `duration`, `outro.start`, `hits[].at` and in the `start`/`end` of scenes you can use: a number (s) · `"phrase"` (start of the phrase in the voice) · `{ when: "phrase", nth: 1, after: 20, plus: -0.1 }` · `{ voice: 2.5 }` (2.5 s after the end of the voice; negative = before). Resolved by `npx @praeko/studio@<version> compile` with the current `words.json`, so just recompile (`render` already does) after a new voice or after `npx @praeko/studio@<version> cut --redo`. Example: `duration: { voice: 2.5 }`, `outro: { start: { voice: -2 }, cta: … }`, `start: { when: "Now a real bug", plus: -0.1 }`.

## Scene
```yaml
- start: 7.05           # s; the scene runs until the start of the next one (or `end:`, or the outro)
  end: 52.35            # optional; only changes when the panel leaves
  title: I WENT TO CHECK # strip of the kit's Panel (default layout: panel)
  layout: panel | free  # free = loose items on the screen (absolute position, videos)
  label: I WENT TO CHECK # short tag of the scene
  sounds: [{ at: 0.2, sound: pop }, { when: "the bug", sound: ding }]   # local s, or a phrase of the voice (+ offset); pop | ding | thump | whoosh; v = volume
  items: [ … ]          # or `component: NameInScenes` (one of the two)
```

## Items
Every item has a `type`. **When it appears:** `when: "phrase"` (or `[phrase, n]` for the n-th occurrence, from 0) ties it to the instant of the voice where the phrase starts; `offset: 0.4` adds seconds; `at: 1.2` is in seconds since the start of the scene. A phrase not found in the voice is an error. Absolute position: `pos: { left, right, top, bottom, width, height }`. Colors: theme names (`accent text muted ok error info extra box`) or `#hex`. **Inside `{ … }`, text with a comma goes in quotes.**

| type | fields |
|---|---|
| `text` | `text` (`\n` breaks), `size`, `color`, `font` (`default`, `mono`; omitted inherits), `align: left`, `lineHeight`, `weight`, `pop`, `noFade`, `noWrap` |
| `big` | `text`, `size`, `color`, `mono` |
| `box` | `text`, `size`, `color`, `mono`, `dim`, `dashed` |
| `line` | `parts: [{text, mono, color, weight}]`, `size`, `color` |
| `bubble` | `text`, `color`, `author` |
| `code` | `title`, `color`, `lines: [{s, color, mark}]` |
| `card` | `lines: [[{text, color, weight}]]`, `size`, `color` (slides in) |
| `bar` | `height`, `radius`, `gradient: [color, "color 60%", …]`, `border: false`, `fill: {from, to, start, duration}`, `glowAtEnd`, `noFade` |
| `bars` | `lines: [{label, value, text}]`, `max`, `maxWidth`, `labelWidth`, `step`, `gap`, `color` |
| `window` | `src`, `clipDuration`, `from`, `reg: [x, y, w, h]`, `tag`, `pos` (left, top, width) |
| `phone` | `src`, `clipDuration`, `from`, `pos` |
| `stack` / `row` | `items`, `gap`, `align` (`center`, `start`, `end`, `stretch`); row: `center: false`, `spread: true` |

## What the compiler checks
Errors (the spec is not written): missing required field, unknown `type` or color, unknown key (this includes the comma without quotes), scenes out of order, phrase that is not in `words.json`. Warnings (an estimate, not a proof): anchor outside the scene window, items that add up to more height than the panel (920 px) or more width than 844 px, text that should wrap, absolutely positioned items that cross, a duration with less than 1 s after the end of the voice. Always look at `npx @praeko/studio@<version> contact-sheet <slug>` too.

## Equivalence with TSX
`comment-timestamp` (7 scenes) and `raid-ep1` (6 scenes, videos and animated bars) were ported from TSX to this format: the first one renders **identically** (PSNR inf), the second within the noise of `OffthreadVideo` (mean 54.2 dB, minimum 47.4). The check found a bug in the raid original: the `"damage"` anchor of scene 5 hit the first occurrence (18.98 s) and the phrase showed up at the start of the scene.

## Render engine
`engine: hyperframes` (or `remotion`) at the top of the YAML chooses who renders this episode; `npx @praeko/studio@<version> render --engine …` has the final word. Scenes with `component:` only render in Remotion. See [`hyperframes.md`](hyperframes.md).

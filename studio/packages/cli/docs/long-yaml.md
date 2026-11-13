# Long form in YAML (16:9, 1920×1080)

`episode.yaml` with `format: long`. Time is **global** (seconds since the start of the video). `npx @praeko/studio@<version> compile <slug>` validates and writes `episode.spec.json`; `npx @praeko/studio@<version> render <slug>` renders (compiling first).

## Script in blocks
```
## 1 · THE HOOK
[curious] spoken text…

## 2 · THE PROBLEM
…
```
`npx @praeko/studio@<version> voice <slug> [--quality draft|final|local]` generates one audio per block in `voice-blocks/` (the name carries a hash of the text, voice and pronunciation: only the edited block is regenerated, which saves ElevenLabs credit), joins them with a 0.6 s pause into `voice.mp3` and writes `words.json`, `words.ts` and `blocks.json` (`[{n, title, a, b}]`). Old blocks stay in the cache.

## Top level and scenes
```yaml
format: long
id: StallLong
duration: 334
voice: audio/stall-long-voice.mp3
scenes:
  - { title: THE HOOK, start: 0, component: S1 }             # TSX scene (scenes.tsx exports S1: React.FC<{t:number}>)
  - title: THE PROBLEM
    start: 31.0                                               # s; or { block: 2 } (uses blocks.json); `n` optional (default: position)
    items: [ … ]
```
Each scene runs from its `start` to the next one's (the last one, until `duration`); it fades in and out and shows "n · TITLE" in the corner.

## Time (`when`, `hl`)
`number` (s) · `"phrase"` (start of the phrase in the voice) · `{ when: "phrase", nth: 1, after: 83, plus: 0.6 }` (`nth` = occurrence, `after` = ignore before N s, `plus` = add seconds). A phrase that is not in `words.json` is an error.

## Items (all with `pos: { left, top, width, height }` in px, except `text`)
| type | fields |
|---|---|
| `code` | `when`, `title`, `size`, `lines: [{ s, hl: [time, time], red }]` (the line lights up between the two times) |
| `card` | `when`, `color`, `items: [text…]` (slides in) |
| `text` | only inside `card`: `size`, `color`, `spacing`, `when` (fade), `text` or `parts` |
| `chip` | `when`, `color`, `size`, `text` |
| `freetext` | `when`, `size`, `color`, `align: center`, `mono`, `text` or `parts: [{ text, color, mono }]` |

Colors: theme names (`accent text muted ok error info extra box`) or `#hex`. **Text with a comma inside `{ … }` goes in quotes** (the compiler reports an unknown key).

## Compiler warnings (estimate)
Item that goes past the right edge or covers the captions (below ~960 px), absolutely positioned items that overlap, item that enters outside the scene window, a duration with less than 1 s after the end of the voice.

## End screen (optional)
```yaml
duration: { voice: 6 }              # the end screen needs about 5 s after the voice
endcard: { start: { when: "productive idle", after: 480 }, text: "Productive idle", link: example.com }
```
Shows the avatar, `text` (the signature), the theme's `handle` and the `link`, over the scenes, from `start` to the end (the captions go on). `start` accepts a number, "phrase" or `{ voice: N }`; `text`, `link` and `image` (a file in `public/`; default: the theme avatar) are optional.

## Cover (YouTube 16:9 and Instagram vertical)
```yaml
cover:
  id: CoverStallLong                  # default: Cover<id>; the vertical one is <id>Vertical
  title: ["TWO CLICKS", "ONE ITEM"]   # 2 lines; the 2nd one is highlighted (≤ ~16 letters each on 16:9)
  mascot: shocked                     # mascot image by name (optional; brand.json mascotPath)
  code: { title: social.mjs · marketBuy, lines: [{ s: "UPDATE market ..." }, { s: "AND sold_to IS NULL", hl: true }] }   # up to 3 lines
  chips: [{ text: "ok ✔", color: ok }, { text: sold, color: error }]
```
`npx @praeko/studio@<version> cover <slug>` writes `out/<slug>-cover-1280x720.png` and `out/<slug>-cover-vertical-1080x1920.png` (the vertical one uses the Short covers' `Frame`, inside Instagram's 3:4 grid).

## Publication package of the long form
`publication.json` with `"format": "long"` (fields as in the Short, plus `yt.pinnedComment` and `files.verticalCover`). `npx @praeko/studio@<version> package <slug>` builds `texts.md`: title and alternatives, description **with chapters**, pinned comment, Instagram caption and the check. Chapters come from the scenes (`start` + title in lowercase) and the YouTube rules apply: start at 0:00, 3 or more, 10 s each (otherwise it is an ERROR). For other texts, write `chapters: [{ t, title }]` in `publication.json`. The YouTube UTM uses `utm_medium=long`.

## Media and animation items (long form)
All with `when` and `pos`:
| type | fields |
|---|---|
| `video` | `src` (in `public/`, 16:9), `clipDuration`, `from` (s of the clip), `reg: [x, y, w, h]` (crop in 1920×1080), `tag`, `pos: { left, top, width }` (height comes from the crop), `motionDuration` |
| `phone` | `src` (vertical 1080×1920), `clipDuration`, `from`, `pos: { left, top, width }`, `motionDuration` |
| `bar` | `value` (0–1), `duration`, `color`, `label`, `text` (inside the bar), `height`, `pos` |
| `counter` | `from`, `to`, `duration`, `decimals`, `prefix`, `suffix`, `size`, `color`, `mono`, `align: center`, `pos` |
| `flow` | `nodes: [{ text (\n breaks), color, when }]`, `size`, `color`, `pos: { left, top, width }`: boxes joined by arrows that enter one by one |

## Engine and mascot (HyperFrames)
`engine: hyperframes` at the top chooses the render engine of this long video (default: the brand's, then `remotion`). `mascot: [{ when: "phrase", name: shocked, plus: 0.5 }]` makes the mascot image (the `brand.json` `mascotPath` template, default `mascots/{name}.png`) appear in the corner for ~3 s; only HyperFrames draws the mascot (Remotion ignores it). See [`hyperframes.md`](hyperframes.md).

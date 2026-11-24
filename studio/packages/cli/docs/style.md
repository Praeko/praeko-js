# Styles (skins)

A **skin** is the whole look of a Short as data: palette, fonts, outlines, radii, shadows, glow, grain, motion curve, caption and label style, sound set, an optional post-process and, for 3D skins, a stage. The same `episode.yaml` renders in any skin without touching the scenes: every item (`text`, `big`, `box`, `line`, `bubble`, `code`, `card`, `bar`, `bars`, `stack`, `row`) reads the skin's tokens, and so do the label, the captions and the progress bar.

Skins apply to Shorts (9:16). Long videos, image posts and carousels keep the default look for now.

## Choosing a skin

The channel's skin is the first slug of `style.visual` in `brand.json` (the interview writes it); an episode overrides it with `style:` in `episode.yaml`.

```json
"style": { "visual": ["clay-3d", "flat"], "format": ["short"], "edit": { "pace": "fast" } }
```

```yaml
style: neon          # this episode only
```

- A slug that is not in the registry is an error of `npx @praeko/studio@<version> compile`.
- Free text for the brief is marked as `other` and is ignored by the engine: `style: { other: "watercolor with ink" }` or `"other: watercolor with ink"` (in `brand.json` too).
- No `style` anywhere: the `default` skin, which is the Studio's original look, pixel for pixel.

**Colors.** The skin brings a palette, but a color the person chose in `brand.json` wins. A brand color still at the Studio default, or equal to the palette of the channel skin (what the interview wrote), counts as "not chosen" and takes the skin's color. Fonts follow the same rule.

## The registry

| slug | look | needs |
|---|---|---|
| `default` | dark, terminal lines, amber accent (the original) | nothing |
| `flat` | light, solid soft colors, no outlines | nothing |
| `minimal` | black on off-white, one accent, thin lines | `Inter` if installed (falls back to Helvetica/Arial) |
| `neon` | black, glowing magenta/cyan, faint grid | nothing |
| `retro-crt` | green phosphor terminal on a curved, noisy CRT | post-process (ffmpeg); `VT323` font optional |
| `chalkboard` | green board, chalk text, hand-drawn outlines that draw themselves | `Cabin Sketch` optional (falls back to Chalkboard SE) |
| `comic` | ink outlines, halftone dots, offset shadows, speech balloons | `Bangers` optional (falls back to Impact) |
| `pixel` | pixel art, DawnBringer 32 palette, stepped motion | post-process; a pixel font (`Silkscreen` or `Press Start 2P`) |
| `8bit` | 8-bit console, PICO-8 palette, stepped motion | post-process; `Press Start 2P` |
| `clay-3d` | modelling clay: pastel slabs, soft studio light | 3D stage (three.js) |
| `blocks-3d` | toy blocks: glossy plastic with studs | 3D stage |
| `retro-3d` | synthwave: neon grid floor, striped sun | 3D stage |
| `cinema-3d` | low-key warm light, cool rim, vignette and grain | 3D stage |

Each skin also carries a one-line `description` and an `avoid` list (what an agent must never do in that style), used by the brief and the playbook.

**Nothing is bundled.** Fonts, sprites and chiptune sounds are provided by the person or the agent (open licenses such as SIL OFL are fine). A skin names its fonts as CSS stacks with system fallbacks. To load font files, put them in `public/` and list them in `brand.json`:

```json
"fonts": { "title": "...", "mono": "...", "files": [{ "family": "Press Start 2P", "src": "fonts/PressStart2P-Regular.ttf" }] }
```

Sounds: a skin may name its own set (`sfxDir`, e.g. `sfx-chip/` for `pixel` and `8bit`, with `pop.wav`, `ding.wav`, `thump.wav`, `whoosh.wav`). If the folder is not in `public/`, the default `sfx/` set plays.

## Post-process (`post`)

Some looks cannot be made with CSS. `npx @praeko/studio@<version> render` runs the skin's post-process with ffmpeg after either engine (Remotion or HyperFrames), on the final MP4:

- `scale` + `palette` (`pixel`, `8bit`): shrink by area averaging (1/3: 360x640 for a Short), map every pixel to the fixed palette **without dithering**, upscale by nearest neighbor back to 1080x1920. Small text does not survive this: `npx @praeko/studio@<version> check` warns about text under ~9 real pixels (for `8bit`, bar labels and the code header are too small; prefer `big`, `text` and `box`).
- `crt` (`retro-crt`): scanlines, chromatic shift, slight curvature, noise and vignette over the whole frame, captions included.

The audio is copied as is. ffmpeg is already a requirement of the Studio (`npx @praeko/studio@<version> doctor`).

## 3D skins

`clay-3d`, `blocks-3d`, `retro-3d` and `cinema-3d` render with a three.js stage (Remotion only). The scene panel — the same DOM of the kit, built from the YAML items — is rasterized every frame (SVG `foreignObject` to an image) and used as the texture of the front face of a slab, so it receives light, perspective and soft shadows. Around it: a floor and back wall (or a glowing grid and a sun), generic props in the palette, studio light and one camera shot per scene, blended at the cut. Everything is a function of the time: no clock, no unseeded randomness. The label, the captions and the progress bar stay flat on top.

What is data in `skin.stage`: material (`clay`, `plastic`, `neon`, `pbr`), studs, the five lights (hemisphere, key with soft shadow, fill, rim), exposure, shadows, fog, floor (`sweep`, `grid`, `none`), sun, number of props and an overlay (vignette, film grain).

Limits:
- `window` and `phone` videos show on the slab: every image of the panel (video frames included) is waited for and copied into the rasterized panel. Use them inside panel scenes (positions from the panel's corner).
- `layout: free` scenes are drawn on the slab face (940x1000), not on the full screen: positions count from the face's corner and anything past 940x1000 is cut. `check` warns about free scenes in a 3D skin.
- `faceLight` (0..1) makes the panel face give off its own light, so text stays readable under low-key lighting (`cinema-3d`).
- Font files are embedded in the rasterized panel, so text on the slab uses the same fonts as the captions.
- three.js is a dependency of `@praeko/studio-kit` and is loaded on demand: projects that never use a 3D skin do not load it.
- HyperFrames applies only the palette and fonts of a skin (and its post-process); `npx @praeko/studio@<version> compile --engine hyperframes` says so.
- Render time measured on an M-series Mac with GPU (`--gl=angle`): see the gallery below. Without a GPU it was not measured.

## Making a skin

A skin is a `Skin` object of `@praeko/studio-core`. `defineSkin` starts from the default and merges only what changes:

```ts
import { defineSkin } from "@praeko/studio-core";

export const SKIN_PAPER = defineSkin({
  id: "paper", name: "Paper", dimension: "2d",
  description: "Cut paper on a kraft background.",
  avoid: ["glow", "neon colors"],
  colors: { background: "#c8a97e", text: "#2b2118", box: "#f4ecd8" },
  panel: { fill: "#f4ecd8", stroke: 0, radius: 6, shadow: "6px 8px 0 rgba(0,0,0,.25)" },
  surface: { fill: "box", stroke: 3, radius: 0.3, shadow: "3px 4px 0 rgba(0,0,0,.2)" },
  motion: { ease: [0.3, 1.4, 0.6, 1], dur: 0.4, pop: [0.7, 1.1, 1], slide: 0.8 },
});
```

Tokens (all in `Skin`): `colors`, `font`, `mono`, `fontFaces`, `background` (`terminal`, `plain`, `css`), `panel`, `surface` (`fill`: `box` | `tint` | `pastel` | a color; `stroke`, `strokeStyle: hand`, `radius` multiplier, `shadow`, `bevel`, `halftone`), `glow`, `grain`, `big`, `bars` (`blocks` for pixel bars), `code`, `bubble.kind` (`quote` | `comic`), `caption` (colors, shadow, uppercase, `box` with an optional balloon `tail`), `label` (fill, text, radius, shadow, `border`, `skew`, `underline`, `prefix`), `progress`, `motion` (bezier, duration, pop, slide, `steps`), `textScale`, `fontAspect`/`monoAspect` (average glyph width in em, for the `check`), `lineHeight`, `sfxDir`, `post`, `stage`. Colors are tokens: a theme name (`accent`), a CSS color, or `name@alpha`.

In a project, pass a custom skin to the episode with the `skin` prop of `EpisodeDecl` (in `episode.tsx`). A skin joins the registry only after the gallery.

## Text that does not fit

Fonts differ a lot in width (a pixel font is about twice as wide as Arial). One-line items (`box`, `line`, `big`, `code`, and a centered `row` as a whole) shrink until they fit the width they have, in any skin: the kit measures the laid-out text before the frame is drawn and only ever shrinks, so the result is deterministic and an item that already fits is untouched. The smallest scale is 45%. `check` estimates the width with the skin's `fontAspect`/`monoAspect` and warns when an item shrinks below ~75%, when it does not fit even at 45%, and, in pixel skins, when the shrunk text ends up under ~9 real pixels.

## Contrast

`npx @praeko/studio@<version> check` measures, for the skin of the episode and the brand colors, the text/background pairs that fall below WCAG AA (4.5:1 for text, 3:1 for large text): panel title and text, muted labels, text on each colored surface, code lines and header, the scene label and the caption box. Gradients have no single color and are skipped.

## The gallery

`node studio/scripts/style-gallery.mjs --out <dir> [--skins a,b] [--fonts <dir>] [--baseline 0.3.0]` renders `studio/scripts/gallery/episode.yaml` (every item type, synthetic words, silent audio, test-pattern videos) in every skin, applies the post-processes, checks each MP4 with ffprobe and writes a contact sheet per skin plus `gallery.jpg` with all skins side by side. `--baseline <version>` is the regression of `default`: PNG stills (`remotion still`) of this tree and of the published packages every `--every` frames (default 50), each identical or ≥ 80 dB (`--allow a-b` names frames an intended fix may change). The PSNR of the two MP4s is printed as information only: it also counts the encoder's noise propagated through the GOP (about 58 dB with identical frames). It is the "done" criterion of a skin: a person looks at the sheets before a skin enters the registry.

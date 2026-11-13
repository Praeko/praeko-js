# HyperFrames as a second render engine

Praeko Studio renders with **Remotion** (default) or with **HyperFrames** (HTML + GSAP, frame-capture rendering). `episode.yaml`, the voice, the captions, the cover and the publication package are the same; only who draws the frames changes.

```
npx @praeko/studio@<version> render <slug> --engine hyperframes     # out/<slug>.hf.mp4 (does not overwrite the Remotion one)
npx @praeko/studio@<version> preview <slug> --engine hyperframes    # opens the HyperFrames preview of the generated project
npx @praeko/studio@<version> compile <slug> --engine hyperframes    # warns about scenes that use `component:` (TSX)
```

Which engine an episode uses (the first one that exists): `--engine` on the command line → `engine: hyperframes` at the top of `episode.yaml` → `"engine": "hyperframes"` in `brand.json` → `remotion`. A new channel can use `"engine": "hyperframes"` in the brand and never touch Remotion (with `--engine hyperframes` the cover is rendered by HyperFrames too: `npx @praeko/studio@<version> cover <slug> --engine hyperframes`; nothing from Remotion is used).

## What happens

1. Compiles `episode.yaml` (`episode.spec.json`), as always.
2. `@praeko/studio-hyperframes` generates a project in `<project>/.hf/<slug>/` (already in the `.gitignore` of `npx @praeko/studio@<version> init`): `index.html`, one sub-composition per scene in `compositions/`, and `assets/` with **only** what the episode uses (copied from the brand's `publicDir`).
3. `npx hyperframes@0.9.13 check --json`: errors stop the render; warnings become one summary line (code × count).
4. `npx hyperframes@0.9.13 render --output out/<slug>.hf.mp4`.

The generated project is disposable: do not edit `.hf/`, edit the YAML and run again. To edit visually, open `.hf/<slug>` in the HyperFrames app; whatever you change there disappears at the next generation.

## Short (1080×1920)

The YAML items (`text`, `big`, `box`, `line`, `bubble`, `code`, `window`, `phone`, `bar`, `bars`, `stack`, `row`, `card`) become HTML with the same measures as the Remotion kit: a panel with 70 px margins, label, word-by-word captions (same 3-word grouping), progress bar, hits (shake, zoom, flash), a two-column terminal background, sounds (whoosh, pop per scene, ding at the outro) and an outro with avatar, handle and CTA. `when` resolves to the local time of the scene as in Remotion.

Known differences:
- **Fonts:** only the fonts bundled with HyperFrames resolve by name. Arial Black becomes Montserrat 900 and Menlo becomes JetBrains Mono (slightly different width; text that wraps in one may wrap in the other). With `"hyperframes": { "localFonts": true }` in `brand.json` the brand font is loaded from the system (`local()`), with the bundled one as a fallback: exact parity, but only on this machine.
- **Game videos** (`window`, `phone`): the segment `[from, clipDuration]` repeats until the end of the scene (several `<video>` elements in sequence, instead of `Loop`).
- **Red dot** of the window label is fixed (it blinks in Remotion).
- **Audio** comes out about 3 dB louder (mean −16.8 dB against −19.8 dB in the same Short): check with `npx @praeko/studio@<version> check` before publishing.
- **Vertical safe zone:** the YAML positions are used as they are (the label sits at y=70, the caption 190 px from the bottom). HyperFrames' `check` does not complain, but the apps' borders cover the top.

## Long form (1920×1080)

Reuses the plan of `episode.yaml` (`format: long`: `code`, `card`, `chip`, `freetext`, `video`, `phone`, `bar`, `counter`, `flow`) and adds an edit of the engine's own:
- a chapter bar at the top, with the title of the current chapter;
- a transition between chapters (horizontal sweep, vertical, iris and fade, in rotation) with the chapter number and name, in the silence between blocks (`blocks.json`) and with a whoosh;
- chapter number in the background, a background glow that changes color per chapter;
- word-by-word captions (the spoken word turns gold);
- an end screen with `endcard:` (text, link, image).

Optional mascot, only in this engine: in the long form's `episode.yaml`,

```yaml
mascot:
  - { when: "five radiants came back", name: shocked }       # mascotPath: mascots/{name}.png
  - { when: "the lock only did", name: coffee, plus: 0.5 }
```

the mascot appears in the bottom right corner for ~3 s in the scene where the phrase is spoken.

Code lines: `hl: [start-phrase, end-phrase]` lights the line between the two phrases (as in Remotion).

## Limits

- **`component:` (TSX) does not exist in HyperFrames.** A scene (or cover) made in `scenes.tsx` has to become YAML items or the episode stays in Remotion. The generator fails with the slug, the number, the title and the component of the scene; `npx @praeko/studio@<version> compile --engine hyperframes` warns before. A cover written as a TSX component (`cover.component`) only exists in Remotion; a declarative cover (title/items) renders in HyperFrames too.
- The `check` times are those of a sampled instant: contrast warnings on still-empty bars and empty-screen warnings on frame 0 are expected (frame 0 of a Short is only the background; the cover is the thumbnail).
- HyperFrames fetches GSAP from the CDN (jsdelivr) and the bundled fonts the first time: it needs internet on the first render.
- Pinned version: `hyperframes@0.9.13` (`HF_VERSION` in `packages/hyperframes/src/common.ts`). Raising the version = running the tests and comparing frames.

## Remotion × HyperFrames (measured on 2026-11-04, 10-core M4)

| Episode | Remotion (GL angle) | HyperFrames (render) | HyperFrames (with generation and check) |
|---|---|---|---|
| Short (53 s) | 26 s | 32 s | 38 s |
| Short (42 s, windows, phone, bars) | 43 s | 40 s | 54 s |
| Long (7:47; output 38 MB against Remotion's 56 MB) | 7:12 (default GL) · 7:53 (GL angle) | 3:29 | 3:54 |

Notes: `angle` only helps the Shorts (blur, shadows at 1080×1920); on the long form it gained nothing (7:12 with the default, 7:53 with `angle`; on 1200 frames, 46 s against 44 s), so it is worth measuring before switching. Remotion only got fast on the Shorts after `Config.setChromiumOpenGlRenderer("angle")` in `remotion.config.ts` (before: 102 s for the same Short; PSNR of 48 dB between the two renderers). HyperFrames pays ~6 s of compilation per render and ~6 s of `check`. Remotion concurrency (5 or 10) changed nothing.

## When to choose each

| Situation | Engine |
|---|---|
| Episode with a TSX scene (`component:`) or a cover of its own | Remotion |
| Routine Short of an existing channel | Remotion (same time, same look as always) |
| Long form, or any video where the edit (transitions, chapters, mascot) matters | HyperFrames |
| New channel, no legacy TSX | HyperFrames as the default (`"engine": "hyperframes"` in the brand) |
| You want to tweak the result in a visual editor | HyperFrames (open `.hf/<slug>` in the app) |

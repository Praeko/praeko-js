# Praeko Studio licenses

Verified on 2026-11-07. This file is not legal advice; each vendor's own text prevails.

## Praeko Studio's code
The packages `@praeko/studio`, `@praeko/studio-core` and `@praeko/studio-kit` are **MIT** (see `LICENSE`, Copyright (c) 2026 Marcone Santos), like `@praeko/sdk` and `@praeko/cli`. The sound effects (`pop`, `ding`, `thump`, `whoosh`) and the `avatar.png` of the project template were created for Studio (sounds synthesized by `scripts/generate-sfx.mjs`, with no third-party samples) and follow the same MIT license. The package ships no fonts, music, stock images or third-party art.

## Notice you need to see (Remotion is NOT MIT)
> **Remotion.** Remotion is *source-available*, not open source. It is **free** for individuals, non-profits, evaluation and companies with **up to 3 employees** (commercial use included). Companies with **4 or more people** need the **Company License** (remotion.pro/license). You install and run Remotion, so the license is **yours**, not Praeko's. Remotion also sells plans for those who **automate renders by program or agent** (Creators, Automators); their FAQ does not expressly say whether a local agent running `remotion render` counts: **ask Remotion** before using at scale. Praeko Studio does not copy or modify Remotion code: it uses it as a dependency (peer) that you install.

This notice appears in the `README`, at install time (`praeko studio init`), in `praeko studio doctor` and in `praeko studio licenses` (`--accept` records that you read it in `~/.config/praeko/studio/licenses.json`).

**Engines.** Remotion is the default engine for videos **and** covers. With `--engine hyperframes` (or `"engine": "hyperframes"` in `brand.json`) the video **and** the cover are rendered by HyperFrames and nothing from Remotion is used, so a project that only uses HyperFrames does not need a Remotion license. Scenes or covers written as TSX (`component:`) only exist in Remotion.

**We do not promise "free forever":** Remotion's conditions may change (their own page warns that the license changes in Remotion 5.0). Review the license when you upgrade.

## Third-party dependencies
| Component | Where | License | Source |
|---|---|---|---|
| `remotion`, `@remotion/cli` (4.0.539) | installed in the user's **project** (peer of core/kit) | Remotion License (see above), not MIT | remotion.pro/license; github.com/remotion-dev/remotion (LICENSE.md) |
| `react`, `react-dom` (19.2.3) | user's project (peer) | MIT | each package's package.json |
| `@praeko/studio-core`, `-kit` | user's project | MIT | LICENSE |
| `yaml` (2.9.1) | embedded in the `@praeko/studio` bundle | ISC | package.json |
| `@elevenlabs/elevenlabs-js` (2.x) | dependency of `@praeko/studio` | MIT | package.json |
| `hyperframes` (0.9.13, optional engine) | downloaded by `npx` the first time you use `--engine hyperframes` | Apache-2.0 | github.com/heygen-com/hyperframes |
| `typescript`, `esbuild`, `@types/*` | development/build only | Apache-2.0 / MIT | package.json |
| ffmpeg / ffprobe | you install | LGPL or GPL, depending on the build | ffmpeg.org/legal.html |
| Chrome Headless Shell / Chromium | Remotion downloads it on the first render | Chromium/Google licenses | remotion.dev/docs/miscellaneous/chrome-headless-shell |

## Services and models (you sign up)
- **ElevenLabs**: its terms and your plan (voice cloning only with rights over the voice). The key is yours; Studio never prints it.
- **Local VoiceStudio** (optional): the OmniVoice model is **CC-BY-NC (non-commercial use)**. It is not the default in any Studio configuration and **must not be used in monetized content**. Check the license of any local model you use.
- **YouTube, Instagram, TikTok**: each network's terms and synthetic-content rules (see `praeko studio docs publish`).

## Fonts and media
No font is distributed. The project template uses system fonts (`Arial Black`, `Menlo`) that `doctor` checks; swap them in `brand.json` for open fonts (OFL) if you want the video to look the same on every system. Music, images and clips you add are your responsibility (rights and licenses).

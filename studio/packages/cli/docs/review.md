# praeko studio review: a review package for your agent

`praeko studio review <slug>` turns a rendered video (or the slides of an image post or carousel) into a **review package** that your own AI agent reads and judges. Studio calls no language model: it measures facts and extracts frames; the agent looks at them (multimodal or not) and writes the critique.

```bash
praeko studio review my-first                     # out/my-first-review/
praeko studio review my-first --every 3 --max-frames 16
praeko studio review my-first --json              # prints manifest.json
praeko studio review my-first --lang pt           # REVIEW.md and the messages in Portuguese
```

Run it after `render` (a video; the `--engine` flag picks the HyperFrames file `out/<slug>.hf.mp4`) or `slides` (an image piece or carousel), and after `package`. Without a rendered file it stops with an error that names the command to run first. Exit code 0 when the package is made, even with findings; 1 on an error.

## What it writes

| File | What |
|---|---|
| `frames/` | JPEGs at most 540 px wide, the time in the name (`0002.0s.jpg`): the opening at 0, 0.5, 1, 1.5 and 2 s, one per scene change, one every `--every` seconds (default 2), the last frame; at most `--max-frames` (default 24, up to 60). For slides: `slide-01.jpg`, `slide-02.jpg`… |
| `manifest.json` | schema `praeko-studio-review/1`: duration, fps, resolution, format, scenes with start, end and on-screen text (from `episode.spec.json`), words per second and speech stretches (from `words.json`), loudness and silences, the frames, the brand, the findings |
| `REVIEW.md` | instructions for the reviewing agent: what to look at in each frame, the opening checklist, pace, legibility, brand, value proposition, closing, promise cautions, what the package cannot see, and the output format (`0:02 — problem — suggestion` plus a verdict with three priorities) |
| `contact-sheet.png` | the mosaic of `praeko studio contact-sheet` (reused when `out/<slug>-contact-sheet.png` exists) |

## Measured findings

Each finding has `severity` (error, warning, info), `time` (s, or null), `code`, `message` and `evidence` (what was measured). They are rules over measured numbers, never a model: `opening_empty`, `opening_scene_late`, `scene_too_short`, `scene_too_long`, `onscreen_reading_speed`, `frames_frozen`, `silence_long`, `loudness_out_of_range`, `true_peak_high`, `audio_missing`, `voice_estimated`, `speech_starts_late`, `speech_too_fast`, `caption_flash`, `duration_unexpected`, `duration_mismatch`, `aspect_unexpected`, `preview_resolution`, `cover_missing`, `spec_missing`, `text_outside_safe_area`, `low_contrast`, `forbidden_phrase`, `banned_name`, `ai_text_tic`; for slides also `slide_missing`, `slide_size`, `slide_too_big`, `slide_nearly_empty`, `alt_missing`, `alt_too_long`, `alt_too_short`, `alt_generic`, `alt_repeated`, `alt_equals_text`, `alt_unrelated_to_text`, `slide_text_dense`, `first_slide_empty`, `slide_text_repeated`, `carousel_count`, `image_count`, `caption_empty`, `caption_too_long`, `hashtags_too_many`. The thresholds are in the table of `studio/docs/review.md` of the repository.

## Brand cautions

Phrases are matched in the script, the captions, the on-screen text, the alt text and `publication.json`: the list is the built-in default (`free forever`), `review.forbiddenPhrases` in `brand.json` and the bullet lines under a prohibitions heading of `playbook.md` (`## Never say`, `## Forbidden phrases`, `## Do not promise`, `## Cautions`, `## Proibido`…; quoted phrases are used as written). Names in `bannedNames` are errors.

## What it cannot see

Movement between frames, fine sync of voice and captions, audio beyond loudness, true peak and silences, and anything that appears and goes away between two frames. It is a review package for your agent, not a model watching the video.

// Text of `praeko studio --help`. In its own module so the public documentation test can check the commands against it (docs-publica-studio.test.mjs).
export const help = (version: string): string => `praeko studio <command>   (version ${version})

  doctor [--json] [--offline]              checks Node, ffmpeg, Chrome, fonts, keys and voice accounts (balance; never the key), network and licenses
  licenses [--accept] [--lang en|pt]       license notice (Remotion is not MIT); --accept records that you read it
  skill install [--agent claude|codex|gemini|cursor|opencode|cline|windsurf|all] [--lang en|pt]
                                           writes Studio's instructions in your coding agent's format
  docs [topic]                             documentation of the installed version (episode-yaml, long-yaml, voice, publish, hyperframes, review, licenses)
  init <folder> [--yes] [--name N] [--handle @x] [--agent …] [--lang en|pt] [--brand <brand folder>] [--dev <studio>] [--no-install]
       [--about "…"] [--audience "…"] [--tone "…"] [--accent #hex] [--background #hex] [--font "Name"]
       [--reference <url|text>]… [--reference-note "…"]… [--voice-alias A] [--voice-provider draft|elevenlabs|voicestudio]
                                           creates a new project (brand, Root, sfx, instructions for the agent). In a terminal it interviews you
                                           (brand, tone, references: Enter skips, flags answer ahead); --yes or no terminal = no questions.
                                           Writes brand.json, brief.md and a draft playbook.md. Ends with the two lines that install the
                                           local MCP server (@praeko/studio-mcp) for this project (Claude Code command and generic JSON)
  brief [--only about,audience,tone,colors,font,references,voice,name,handle,lang] [same answer flags]
                                           reopens the interview in an existing project; rewrites brief.md (backup .bak) and keeps an edited playbook.md (also prints the MCP install lines)
  new <slug> [--title "T"] [--long | --image | --carousel]
                                           creates an episode (script, scene, cover, publication.json) and registers it in Root;
                                           --image = a photo post (format: image, one slide, no voice or video; Instagram only for now)
                                           --carousel = a carousel (format: carousel, 2 to 20 slides in the order of the slides: list, no voice or video; Instagram only for now)
  voice <slug> [--quality draft|final|local] [--voice alias] [--aligner scribe|voicestudio] [--no-failover]
                                           makes the voice and the word timings. draft = silent and estimated (free, no network);
                                           final = ElevenLabs (your key); local = VoiceStudio (must be running)
  voice balance | voices | account <list|add> | config key <ref>
                                           accounts and voices (ElevenLabs, VoiceStudio)
  compile <slug>                           reads episode.yaml, checks anchors and overlap, writes episode.spec.json
  cut <long> <slug> --from <ref> --to <ref> [--hook "phrase" [--quality …]]
                                           vertical Short sliced from a long video's voice (ref: seconds, block:N or "phrase")
  preview [slug] [--engine hyperframes]    opens Remotion Studio (or the HyperFrames preview, with a slug)
  render <slug> [--scale 0.5] [--engine remotion|hyperframes]
                                           renders the video (out/<slug>.mp4; HyperFrames: out/<slug>.hf.mp4); --engine hyperframes needs no Remotion
  cover <slug> [--engine remotion|hyperframes]
                                           renders the cover (out/<slug>-cover.png; long video: -cover-1280x720.png and -cover-vertical-1080x1920.png)
  slides <slug> [--timeout 180]            renders an image piece or a carousel: out/<slug>-slide-01.jpg, -02.jpg… (one per slide, 1080x1350, 4:5, sRGB JPEG; Remotion only),
                                           then checks each one; --timeout = seconds allowed per slide (default 180)
  contact-sheet <slug|file.mp4> [--n 12]   frame mosaic to check by eye
  check <slug>                             script, voice, publication, AI disclosure and (with a video) duration, loudness and empty frames
  review <slug> [--every <seconds>] [--max-frames N] [--engine remotion|hyperframes] [--json]
                                           review package for your agent in out/<slug>-review/: frames (opening, one per scene, one every N s, the last), manifest.json with
                                           measured facts and findings, REVIEW.md with the instructions for the reviewing agent; a video, or the slides of an image piece or carousel.
                                           No AI model is called: it measures and extracts, your agent looks and judges. Exit 0 when the package is made (even with findings)
  package <slug>                           writes texts.md (YouTube, Instagram, TikTok, UTM) from publication.json
  schedule <slug> --when "06/11 17:30" [--networks yt,ig,tt] [--via praeko|buffer] [--send]   (an image piece or carousel goes only to Instagram, --via praeko; a carousel uploads its slides in order)
                                           schedules through Praeko (default); without --send it only simulates. schedule --channels lists the channels;
                                           echo $KEY | praeko studio schedule --via praeko --key stores the Praeko key
  post <slug> --when "06/11 17:30" [--networks yt,ig,tt] [--send]   direct publishing to the networks (advanced)
  queue [list|run|cancel <id>|install|remove]                         the own queue (install/remove: macOS only)
  account <youtube|instagram|tiktok> [connect|status]                 authorizes Studio on a network (advanced)
  migrate [--dry-run]                      converts a Studio 0.1.x project (Portuguese names) to the English layout, with a backup
  help                                     this text (--lang pt for Portuguese messages)
`;

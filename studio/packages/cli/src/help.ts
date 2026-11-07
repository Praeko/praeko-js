// Text of `praeko studio --help`. In its own module so the public documentation test can check the commands against it (docs-publica-studio.test.mjs).
export const help = (version: string): string => `praeko studio <command>   (version ${version})

  doctor [--json] [--offline]              checks Node, ffmpeg, Chrome, fonts, keys (without showing them), network and licenses
  licenses [--accept] [--lang en|pt]       license notice (Remotion is not MIT); --accept records that you read it
  skill install [--agent claude|codex|gemini|cursor|opencode|cline|windsurf|all] [--lang en|pt]
                                           writes Studio's instructions in your coding agent's format
  docs [topic]                             documentation of the installed version (episode-yaml, long-yaml, voice, publish, hyperframes, licenses)
  init <folder> [--name N] [--handle @x] [--agent …] [--lang en|pt] [--dev <studio>] [--no-install]
                                           creates a new project (brand, Root, sfx, instructions for the agent)
  new <slug> [--title "T"] [--long]        creates an episode (script, scene, cover, publication.json) and registers it in Root
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
  contact-sheet <slug|file.mp4> [--n 12]   frame mosaic to check by eye
  check <slug>                             script, voice, publication, AI disclosure and (with a video) duration, loudness and empty frames
  package <slug>                           writes texts.md (YouTube, Instagram, TikTok, UTM) from publication.json
  schedule <slug> --when "06/11 17:30" [--networks yt,ig,tt] [--via praeko|buffer] [--send]
                                           schedules through Praeko (default); without --send it only simulates. schedule --channels lists the channels;
                                           echo $KEY | praeko studio schedule --via praeko --key stores the Praeko key
  post <slug> --when "06/11 17:30" [--networks yt,ig,tt] [--send]   direct publishing to the networks (advanced)
  queue [list|run|cancel <id>|install|remove]                         the own queue (install/remove: macOS only)
  account <youtube|instagram|tiktok> [connect|status]                 authorizes Studio on a network (advanced)
  migrate [--dry-run]                      converts a Studio 0.1.x project (Portuguese names) to the English layout, with a backup
  help                                     this text (--lang pt for Portuguese messages)
`;

// Text of `praeko studio --help`. In its own module so the public documentation test can check the commands against it (docs-publica-studio.test.mjs).
export const help = (version: string): string => `npx @praeko/studio@${version} <command>   (version ${version}; the same inside or outside a project folder.
                               With the praeko CLI (@praeko/cli) installed, praeko studio <command> also works)

  setup [folder] [--plan] [--yes] [--agent claude,claude-desktop,codex,cursor,…|all] [--profile <name>] [--json] [--no-install] [--no-browser] [--no-login]
                                           connects your AI agents to Praeko on this machine: checks it (Node, npm, ffmpeg, ffprobe, Chrome) and proposes
                                           installs, detects agents, registers the remote MCP (praeko.app/mcp) in each one's format (sign-in or PRAEKO_KEY,
                                           never a key in a file) and the local Studio MCP where there is no terminal (Claude Desktop), creates the project
                                           (init --agent), writes .praeko/config.json (key profile, no secret) and appends to .gitignore. Shows the plan first
                                           (--plan changes nothing; without a terminal it only plans unless --yes), backs up every file it touches and ends
                                           with what only you do. With no Praeko key for the profile it ends by signing in with a code (see login);
                                           --no-login skips that sign-in (optional: run login later from the project folder)
  login [--profile <name>] [--no-browser] [--json] [--yes]
                                           gets the Praeko write key by sign-in with a code (like gh auth login): prints a short code and
                                           https://praeko.app/device, opens the browser; you approve in the dashboard and the key goes straight to
                                           the profile's store (macOS Keychain; elsewhere ~/.config/praeko/secrets.json, mode 600), never to the screen.
                                           Works without a terminal (an agent only sees the code); --json prints one JSON line per state.
                                           If the profile already has a key: in a terminal it asks before replacing it (default: keep);
                                           with --yes, --json or no terminal it replaces it and says so ("replaced": true)
  setup --key [--profile <name>] [--check-key]
                                           plan B, in YOUR terminal only: asks for the Praeko write key with hidden input and stores it for the profile
                                           (macOS Keychain; elsewhere ~/.config/praeko/secrets.json, mode 600). Never an argument, never in the project
  setup uninstall [--plan] [--yes] [--json] removes only what setup added (its manifest), with a backup
  doctor [--json] [--offline]              checks Node, ffmpeg, Chrome, fonts, keys and voice accounts (balance; never the key), network and licenses
  licenses [--accept] [--lang en|pt]       license notice (Remotion is not MIT); --accept records that you read it
  skill install [--agent claude|codex|gemini|cursor|opencode|cline|windsurf|all] [--lang en|pt]
                                           writes Studio's instructions in your coding agent's format
  docs [topic]                             documentation of the installed version (first-video, episode-yaml, long-yaml, style, from-video, transcription, voice, publish,
                                           hyperframes, review, licenses)
  init <folder> [--yes] [--name N] [--handle @x] [--agent …] [--lang en|pt] [--brand <brand folder>] [--dev <studio>] [--no-install]
       [--source script,video] [--about "…"] [--audience "…"] [--tone "…"] [--format short,long,carousel,image]
       [--style flat,minimal,neon,comic,chalkboard,pixel,8bit,retro-crt,clay-3d,blocks-3d,retro-3d,cinema-3d] [--style-other "…"]
       [--pace calm|fast] [--captions word|phrase|none] [--effects shake,zoom,flash|none] [--sound sfx|none] [--face face|mascot|none]
       [--accent #hex] [--background #hex] [--font "Name"]
       [--reference <url|text>]… [--reference-note "…"]… [--voice-alias A] [--voice-provider draft|elevenlabs|voicestudio]
                                           creates a new project (brand, Root, sfx, instructions for the agent). In a terminal it interviews you
                                           (source, brand, tone, formats, visual style, editing style, references: Enter skips, flags answer ahead;
                                           lists take numbers or names separated by commas); --yes or no terminal = no questions.
                                           Writes brand.json (with the style block), brief.md and a draft playbook.md. Ends with the two lines that install the
                                           local MCP server (@praeko/studio-mcp) for this project (Claude Code command and generic JSON)
  brief [--only about,audience,tone,source,format,style,edit,colors,font,references,voice,name,handle,lang] [same answer flags]
                                           reopens the interview in an existing project; rewrites brief.md (backup .bak) and keeps an edited playbook.md (also prints the MCP install lines).
                                           --only style reopens format, visual style and editing style; a new visual style moves only the colors still at the old style's value
  new <slug> [--title "T"] [--long | --image | --carousel]
  new <slug> --from-video <file.mp4> [--lang pt|en|auto] [--cloud] [--transcript <transcript.json>] [--title "T"]
                                           creates an episode (script, scene, cover, publication.json) and registers it in Root;
                                           --from-video = an episode over your own video: copies it to public/video/ (the original is never changed), transcribes it
                                           on this machine (cloud only with --cloud) into words.json, and episode.yaml plays it as the base layer (no voice, no outro);
                                           --image = a photo post (format: image, one slide, no voice or video; Instagram only for now)
                                           --carousel = a carousel (format: carousel, 2 to 20 slides in the order of the slides: list, no voice or video; Instagram only for now)
  voice <slug> [--quality draft|final|local] [--voice alias] [--aligner scribe|voicestudio] [--no-failover]
                                           makes the voice and the word timings. draft = silent and estimated (free, no network);
                                           final = ElevenLabs (your key); local = VoiceStudio (must be running)
  transcribe <file> [--lang pt|en|auto] [--cloud] [--engine voicestudio|whisper-local|scribe] [--out <folder>|<name>.json]
                                           transcribes any audio or video file (ffmpeg → 16 kHz) into transcript.json (words with times), .srt and .txt
                                           next to the file (or in --out; --out <name>.json names the three files). Tries VoiceStudio, then local Whisper; ElevenLabs Scribe only with --cloud (audio leaves this machine)
  transcribe --download-model [--yes]      downloads the local Whisper model (large-v3-turbo-q5_0, ~547 MB) only after your yes; SHA-256 checked
  voice balance | voices | account <list|add> | config key <ref>
                                           accounts and voices (ElevenLabs, VoiceStudio)
  compile <slug>                           reads episode.yaml, checks anchors and overlap, writes episode.spec.json
  cut <long> <slug> --from <ref> --to <ref> [--hook "phrase" [--quality …]]
                                           vertical Short sliced from a long video's voice (ref: seconds, block:N or "phrase")
  preview [slug] [--engine hyperframes]    opens Remotion Studio (or the HyperFrames preview, with a slug)
  render <slug> [--scale 0.5] [--seconds <n>] [--engine remotion|hyperframes]
                                           renders the video (out/<slug>.mp4; HyperFrames: out/<slug>.hf.mp4); --engine hyperframes needs no Remotion;
                                           --seconds 10 renders only the first 10 s to out/<slug>-first-10s.mp4 (a quick look; Remotion only)
  cover <slug> [--engine remotion|hyperframes]
                                           renders the cover (out/<slug>-cover.png; long video: -cover-1280x720.png and -cover-vertical-1080x1920.png)
  slides <slug> [--timeout 180]            renders an image piece or a carousel: out/<slug>-slide-01.jpg, -02.jpg… (one per slide, 1080x1350, 4:5, sRGB JPEG; Remotion only),
                                           then checks each one; --timeout = seconds allowed per slide (default 180)
  contact-sheet <slug|file.mp4> [--n 12]   frame mosaic to check by eye
  check <slug>                             script, voice, publication, AI disclosure and (with a video) duration, loudness and empty frames;
                                           over your own video (base) it counts the words of words.json, not of script.txt
  review <slug> [--every <seconds>] [--max-frames N] [--engine remotion|hyperframes] [--json]
                                           review package for your agent in out/<slug>-review/: frames (opening, one per scene, one every N s, the last), manifest.json with
                                           measured facts and findings, REVIEW.md with the instructions for the reviewing agent; a video, or the slides of an image piece or carousel.
                                           No AI model is called: it measures and extracts, your agent looks and judges. Exit 0 when the package is made (even with findings)
  package <slug>                           writes texts.md (YouTube, Instagram, TikTok, UTM) from publication.json
  schedule <slug> --when "06/11 17:30" [--networks yt,ig,tt] [--via praeko] [--send]   (an image piece or carousel goes only to Instagram, --via praeko; a carousel uploads its slides in order)
                                           schedules through Praeko (default); without --send it only simulates. schedule --channels lists the channels;
                                           echo $KEY | npx @praeko/studio@${version} schedule --via praeko --key stores the Praeko key
  post <slug> --when "06/11 17:30" [--networks yt,ig,tt] [--send]   direct publishing to the networks (advanced)
  queue [list|run|cancel <id>|install|remove]                         the own queue (install/remove: macOS only)
  account <youtube|instagram|tiktok> [connect|status]                 authorizes Studio on a network (advanced)
  migrate [--dry-run]                      converts a Studio 0.1.x project (Portuguese names) to the English layout, with a backup
  help                                     this text (--lang pt for Portuguese messages)
`;

# @praeko/cli

Command line for [Praeko](https://praeko.app): publishes and schedules short videos on YouTube, Instagram and TikTok, and talks to the service API (posts, queue, channels, keys, insights). The command is `praeko`. Node 22 or newer; `ffmpeg`/`ffprobe` only for the commands that touch covers and video.

## Install

```sh
npm install -g @praeko/cli
yarn global add @praeko/cli
pnpm add -g @praeko/cli
bun add -g @praeko/cli
```

Without installing:

```sh
npx @praeko/cli --help
pnpm dlx @praeko/cli --help
bunx @praeko/cli --help
yarn dlx @praeko/cli --help   # yarn 2+
```

## Getting started

```sh
praeko --version
praeko --help
export PRAEKO_SERVER=https://praeko.app
export PRAEKO_KEY=praeko_…            # key created in the dashboard (or: echo $KEY | praeko key store)
praeko posts                          # lists the service posts
praeko post ./my-package --when "30/12 17:30" --networks yt,ig,tt   # SIMULATES (nothing is sent)
praeko post ./my-package --when "30/12 17:30" --networks yt,ig,tt --send
```

Nothing is sent, hosted or scheduled without `--send`. A package folder holds `publication.json`, the video and the cover. Project settings live in `praeko.json` (current folder or above); `links.main` is optional.

## Authentication

The key comes from `PRAEKO_KEY`. Without it the CLI looks in the macOS Keychain (Mac only, item `praeko/chave`) and in the file `~/.config/praeko/secrets.json` (mode 600; change it with `PRAEKO_SECRETS`). On Linux and Windows the variable and the file apply. `PRAEKO_NO_KEYCHAIN=1` ignores the Keychain. The service address comes from `--server` or `PRAEKO_SERVER`.

## Errors and exit codes

`0` success; `1` error (message in English on stderr); `2` invalid command or argument (shows the help).

## Praeko Studio

`praeko studio …` hands the command to Praeko Studio (`@praeko/studio`, a separate package). Without it the command shows how to install it (or runs `npx @praeko/studio` if you accept) and exits with `1`. The other commands do not depend on it.

## Versioning

[SemVer](https://semver.org/); in `0.x` breaking changes can ship in minor versions, always listed in the [CHANGELOG](./CHANGELOG.md). The CLI is published with the SDK embedded: there are no dependencies to install.

## Links

Documentation: <https://praeko.app/docs> · Code: <https://github.com/Praeko/praeko-js> · Support: contato@praeko.app · SDK: [`@praeko/sdk`](https://www.npmjs.com/package/@praeko/sdk)

## License

[MIT](./LICENSE) © 2026 Marcone Santos.

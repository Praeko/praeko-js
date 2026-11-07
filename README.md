# praeko-js

Client code of [Praeko](https://praeko.app): the publisher for short videos (YouTube, Instagram, TikTok) with a queue, scheduling and an API with keys.

This repository has **only the client**. The Praeko server is closed; the API behavior is documented at <https://praeko.app/docs>.

| Package | What it is | npm |
|---|---|---|
| [`@praeko/sdk`](./packages/sdk) | JS client for the API (Node, Workers and browser), no dependencies, with types | [npm](https://www.npmjs.com/package/@praeko/sdk) |
| [`@praeko/cli`](./packages/cli) | The `praeko` command: posts, queue, channels, keys, insights | [npm](https://www.npmjs.com/package/@praeko/cli) |
| [`@praeko/studio`](./studio/packages/cli) | Praeko Studio: short and long videos you operate with your own coding agent (voice, captions, scenes, cover, texts, publishing through Praeko) | [npm](https://www.npmjs.com/package/@praeko/studio) |
| [`@praeko/studio-core`](./studio/packages/core), [`@praeko/studio-kit`](./studio/packages/kit) | Engine and scene parts (Remotion) used by Studio projects | [core](https://www.npmjs.com/package/@praeko/studio-core), [kit](https://www.npmjs.com/package/@praeko/studio-kit) |
| `packages/core`, `studio/packages/{voice,publish,review,hyperframes}` | Shared logic; **not published**, they go into the CLI and Studio bundles | |

> **Studio licenses.** The code in this repository is MIT. **Remotion**, which Studio uses as its default engine, is **not MIT**: free for individuals, non-profits and companies of up to 3 employees; companies with 4 or more people need the Company License ([remotion.pro/license](https://www.remotion.pro/license)). See [`studio/LICENSES.md`](./studio/LICENSES.md).

## Install

SDK:

```sh
npm install @praeko/sdk
yarn add @praeko/sdk
pnpm add @praeko/sdk
bun add @praeko/sdk
```

CLI:

```sh
npm install -g @praeko/cli
yarn global add @praeko/cli
pnpm add -g @praeko/cli
bun add -g @praeko/cli
```

Node 22 or newer. Full guide, API reference and examples: <https://praeko.app/docs>.

## Development

```sh
npm ci
npm test               # tests that do not depend on the server (Studio needs ffmpeg on the PATH)
npm run typecheck
npm run release:check  # checks what would go to npm
```

## Support

Issues and pull requests are turned off: development happens internally. For problems and requests, write to contato@praeko.app (see [CONTRIBUTING.md](./CONTRIBUTING.md)). Vulnerabilities: [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE).

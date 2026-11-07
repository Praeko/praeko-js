# Contributing

This repository is the **client code** of Praeko (SDK, CLI and Praeko Studio), open for reading and use under the MIT license. Development happens internally.

- **Issues and pull requests are turned off for now.** To report a problem, ask a question or request a feature, write to **contato@praeko.app** with the version (`praeko --version` or the `@praeko/sdk` one), Node and your system.
- **Vulnerabilities:** see [SECURITY.md](./SECURITY.md). Do not put `praeko_…` keys in e-mails, logs or screenshots.
- **The API behavior lives on the server, which is closed.** This repository does not define business rules, limits or response formats.
- You may fork it for your own use, under the [MIT](./LICENSE) license.

The code is **TypeScript** (`packages/*/src/*.ts`, `studio/packages/*/src/*.ts`): `npm ci` installs and builds the SDK (`npm run build:sdk` writes `packages/sdk/dist` with JavaScript and `.d.ts` declarations produced by `tsc`; the `.d.ts` files are not handwritten). Before any check, run `npm test`, `npm run typecheck` and `npm run release:check`. Part of the code in this repository (the contract and the types) is **mirrored** from the source in the private repository and overwritten on every sync.

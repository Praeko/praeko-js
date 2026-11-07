# @praeko/sdk

Cliente JavaScript da API do [Praeko](https://praeko.app) (publicador de vídeos curtos para YouTube, Instagram e TikTok). Sem dependências; funciona em Node 22+, Cloudflare Workers, Deno/Bun e navegador. Tem tipos TypeScript. Só ESM.

## Instalação

```sh
npm install @praeko/sdk
yarn add @praeko/sdk
pnpm add @praeko/sdk
bun add @praeko/sdk
```

## Começando

Crie uma chave de API no painel (ou com `praeko key create`) e guarde em `PRAEKO_KEY`. Nunca coloque a chave no código nem no navegador.

```js
import { Praeko } from "@praeko/sdk";
import { uploadFile } from "@praeko/sdk/node"; // só Node: envia arquivo do disco em partes

const praeko = new Praeko({ url: "https://praeko.app", key: process.env.PRAEKO_KEY });

const video = await uploadFile(praeko, "./video.mp4", { type: "video", onProgress: (feito, total) => {} });
const post = await praeko.posts.create({
  title: "Meu vídeo",
  media: { video: video.id },
  texts: { youtube: { title: "Meu vídeo", text: "…" } },
  items: [{ network: "youtube", queue: true }],
});
console.log(post.id);
```

Fora do Node (Workers, navegador), passe `Uint8Array`, `Blob` ou `{ size, read(start, n) }` para `praeko.media.upload(source, { type, name, mime })`.

## Autenticação

`key` vai como `Authorization: Bearer praeko_…`. Escopos da chave: `read`, `write`, `admin`. No navegador, na mesma origem do painel, use `{ cookies: true }` (a sessão do painel autentica; sem chave).

## Tentativas e tempo limite

`GET` e o envio de partes de mídia tentam de novo em falha de rede, `429` e `5xx` (padrão: 3 tentativas; mude com `retries`). Criar posts **não** repete sozinho, para não duplicar, a menos que você passe `idempotencyKey` (um texto, ou `true` para gerar um UUID). Com a chave, o SDK repete a chamada em falha de rede, `429` e `5xx` reusando a mesma chave, e o servidor devolve a resposta guardada em vez de criar de novo (veja `docs/idempotencia.md`).

```js
await praeko.posts.create(corpo, { idempotencyKey: true });
```

## Erros

Toda resposta de erro vira `PraekoError` com `status`, `code` (estável, em inglês), `message` e `details`:

```js
import { PraekoError } from "@praeko/sdk";
try { await praeko.posts.get("nao-existe"); }
catch (e) { if (e instanceof PraekoError && e.code === "not_found") { /* … */ } else throw e; }
```

Os códigos e as rotas estão em `@praeko/sdk/contract` (`ROUTES`, `ERROR_CODES`) e estão tipados em `contract.d.mts`.

## Versionamento

[SemVer](https://semver.org/lang/pt-BR/). Enquanto a versão for `0.x`, mudanças incompatíveis podem sair em versões menores; elas sempre constam no [CHANGELOG](./CHANGELOG.md). Os nomes em português (`Arauto`, `chave`, `enviarArquivo`…) são aliases deprecados e serão removidos numa versão futura.

## Links

Documentação e referência da API: <https://praeko.app/docs> · Código e issues: <https://github.com/Praeko/praeko-js>

## Licença

[MIT](./LICENSE) © 2026 Marcone Santos.

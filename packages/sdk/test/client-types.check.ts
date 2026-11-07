// Verificação de TIPOS do cliente (não roda): `npm run typecheck -w packages/sdk`. Os tipos de `new Praeko(...)` saem do código (src/index.ts, src/types.ts), com skipLibCheck desligado.
import { Praeko, PraekoError } from "../src/index.ts";
import type { Post, PostRequest } from "../src/index.ts";
import { uploadFile } from "../src/node.ts";

const praeko = new Praeko({ url: "https://praeko.app", key: "praeko_x" });
const pedido: PostRequest = { title: "t", media: { video: "m" }, texts: { youtube: { text: "x" } }, items: [{ network: "youtube", queue: true }] };
const criado: Promise<{ id: string }> = praeko.posts.create(pedido, { idempotencyKey: true });
const post: Promise<Post> = praeko.posts.update("id", { title: "novo" });
void criado; void post;
void uploadFile(praeko, "./v.mp4", { type: "video" });
// @ts-expect-error `network` fora do vocabulário
praeko.posts.create({ ...pedido, items: [{ network: "facebook" }] });
// @ts-expect-error falta `title`
praeko.posts.create({ media: { video: "m" }, texts: {}, items: [] });
// @ts-expect-error `queue` é boolean
praeko.posts.create({ ...pedido, queue: "sim" });
// @ts-expect-error o id é string
praeko.posts.get(42);
// @ts-expect-error `scope` fora de read | write | admin
praeko.apiKeys.create("nome", "root");
const erro = new PraekoError(404, "post_not_found", "não existe");
const status: number = erro.status;
// @ts-expect-error `status` é number
const errado: string = erro.status;
export { status, errado };

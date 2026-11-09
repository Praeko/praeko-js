// Verificação de TIPOS do cliente (não roda): `npm run typecheck -w packages/sdk`. Os tipos de `new Praeko(...)` saem do código (src/index.ts, src/types.ts), com skipLibCheck desligado.
import { Praeko, PraekoError } from "../src/index.ts";
import type { ImageRef, ItemWarning, Media, MediaType, Post, PostRequest } from "../src/index.ts";
import { uploadFile } from "../src/node.ts";

const praeko = new Praeko({ url: "https://praeko.app", key: "praeko_x" });
const pedido: PostRequest = { title: "t", media: { video: "m" }, texts: { youtube: { text: "x" } }, items: [{ network: "youtube", queue: true }] };
const criado: Promise<{ id: string }> = praeko.posts.create(pedido, { idempotencyKey: true });
const post: Promise<Post> = praeko.posts.update("id", { title: "novo" });
void criado; void post;
void uploadFile(praeko, "./v.mp4", { type: "video" });
// Posts de imagem (foto única): kind image + media.images; uploadFile aceita type image; o post de vídeo continua igual.
const foto: ImageRef = { media: "m", alt: "descrição" };
const pedidoFoto: PostRequest = { kind: "image", title: "t", media: { images: [foto] }, texts: { instagram: { text: "x" } }, items: [{ network: "instagram", via: "meta", queue: true }] };
const tipo: MediaType = "image";
const avisos: ItemWarning[] | undefined = undefined as Post["items"][number]["warnings"];
const lidas: Post["media"]["images"] = [foto];
const semVideo: string | null = undefined as unknown as Post["media"]["video"]; // `video` pode ser null num post de imagem
void praeko.posts.create(pedidoFoto); void tipo; void avisos; void lidas; void semVideo;
void praeko.media.upload(new Uint8Array(1), { type: "image", name: "f.jpg", mime: "image/jpeg" });
void uploadFile(praeko, "./f.jpg", { type: "image" });
const midia: Media = { id: "m", type: "image", name: "f.jpg", mime: "image/jpeg", size: 1, state: "ready", createdAt: "", width: 1080, height: 1350 };
void midia;
// @ts-expect-error uma foto não leva `video`
praeko.posts.create({ ...pedidoFoto, media: { video: "m" } });
// @ts-expect-error kind image pede media.images
praeko.posts.create({ kind: "image", title: "t", media: {}, texts: {}, items: [] });
// um carrossel é `kind: "carousel"` com media.images
praeko.posts.create({ ...pedidoFoto, kind: "carousel", media: { images: [{ media: "a" }, { media: "b", alt: "slide 2" }] } });
// @ts-expect-error `kind` fora de video | image | carousel
praeko.posts.create({ ...pedidoFoto, kind: "slideshow" });
// @ts-expect-error um carrossel não leva `video`
praeko.posts.create({ ...pedidoFoto, kind: "carousel", media: { video: "m" } });
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

// Tipos de cada rota do contrato (em INGLÊS): parâmetros de caminho, query, corpo e resposta, por `key` da tabela `ROUTES` (contract.ts).
// Fonte: as próprias interfaces do cliente (types.ts), para que o SDK, o servidor e a documentação falem do MESMO formato. Só tipos: nada daqui
// existe em tempo de execução. O servidor liga cada handler a esta tabela e o typecheck dele falha quando
// uma rota não tem handler, um handler não existe aqui, ou a resposta (depois da tradução interno → contrato) diverge do que está aqui.
//
// `response: unknown` = o formato ainda não está descrito no SDK (o handler passa por qualquer coisa); `response: RawResponse` = a rota devolve
// HTML, imagem ou bytes (uma Response pronta), nunca JSON.
import type { PathParams, RequestFieldMap, ResponseFieldMap, RouteKey, RouteOf, SCOPED_KEYS } from "./contract.ts";
import type {
  ApiKeysApi, CalendarResponse, ChannelsApi, CommunityApi, ContentApi, IdeasApi, InsightsApi, InstagramApi, MediaApi, NotificationsApi, PostsApi, PreferencesApi,
  RetentionItemResponse, RetentionResponse, TiktokApi, UsageApi, WebhooksApi, YoutubeApi, Network,
} from "./types.ts";

/** A rota devolve uma resposta pronta (HTML, imagem, bytes de mídia), sem JSON. */
export interface RawResponse { readonly raw: true }

/** O que se sabe de uma rota: `query` e `body` (pedido, nomes do contrato) e `response`. */
export interface RouteIO { query?: object; body?: object | "bytes"; response: unknown }

type Res<F> = F extends (...a: never[]) => Promise<infer R> ? R : never;
type Arg<F, I extends number> = F extends (...a: infer A) => unknown ? NonNullable<A[I]> : never;
/** Corpo sem as opções do cliente (`idempotencyKey` vira cabeçalho, não vai no corpo). */
type Body<F, I extends number> = Omit<Arg<F, I>, "idempotencyKey">;
type Q<T> = { [K in keyof T]?: string };
type ChannelQ = { channel?: string };

/** Tabela das rotas (um item por `key` de `ROUTES`). */
export interface RouteTypesTable {
  "health": { response: { ok: boolean; service: string; version: string; time: string } };
  "health.v1": { response: { ok: boolean; service: string; version: string } };
  "connections.callback": { query: { code?: string; state?: string; error?: string }; response: RawResponse };
  "media.public": { response: RawResponse };

  "connections.start": { query: Q<{ replace: 1; add: 1; instagram: 1; instagram_id: 1; probe: 1; analytics: 1 }>; response: Res<ChannelsApi["connect"]> };
  "connections.disconnect": { query: ChannelQ; response: Res<ChannelsApi["disconnect"]> };
  "connections.instagramToken": { body: Arg<ChannelsApi["sendInstagramToken"], 0>; response: Res<ChannelsApi["sendInstagramToken"]> };
  "channels.list": { query: { verify?: string }; response: Res<ChannelsApi["list"]> };
  "channels.default": { response: Res<ChannelsApi["setDefault"]> };
  "channels.remove": { response: Res<ChannelsApi["remove"]> };
  "channels.avatar": { query: ChannelQ; response: RawResponse };
  "tiktok.creator": { query: ChannelQ; response: Res<TiktokApi["creator"]> };
  "channels.slots.get": { query: ChannelQ; response: Res<ChannelsApi["slots"]> };
  "channels.slots.put": { query: ChannelQ; body: { slots: Arg<ChannelsApi["setSlots"], 1>; timezone?: string }; response: Res<ChannelsApi["setSlots"]> };
  "channels.followers.put": { query: ChannelQ; body: { value: number; day?: string }; response: Res<ChannelsApi["setFollowers"]> };
  "channels.followers.get": { query: ChannelQ; response: Res<ChannelsApi["followers"]> };

  "media.create": { body: Arg<MediaApi["create"], 0>; response: Res<MediaApi["create"]> };
  "media.list": { query: { type?: string }; response: Res<MediaApi["list"]> };
  "media.get": { response: Res<MediaApi["get"]> };
  "media.part": { body: "bytes"; response: Res<MediaApi["uploadPart"]> };
  "media.content.put": { body: "bytes"; response: Res<MediaApi["uploadContent"]> };
  "media.content.get": { response: RawResponse };
  "media.content.head": { response: RawResponse };
  "media.complete": { response: Res<MediaApi["complete"]> };
  "media.delete": { response: Res<MediaApi["remove"]> };

  "posts.create": { body: Arg<PostsApi["create"], 0>; response: Res<PostsApi["create"]> };
  "posts.adopt": { body: Arg<PostsApi["adopt"], 0>; response: Res<PostsApi["adopt"]> };
  "posts.list": { query: Q<Arg<PostsApi["list"], 0>>; response: Res<PostsApi["list"]> };
  "posts.get": { response: Res<PostsApi["get"]> };
  "posts.update": { body: Arg<PostsApi["update"], 1>; response: Res<PostsApi["update"]> };
  "posts.cancel": { query: { dismiss?: string; delete_video?: string }; response: Res<PostsApi["cancel"]> };
  "posts.publishNow": { query: { network?: Network }; response: Res<PostsApi["publishNow"]> };
  "posts.youtubeSchedule": { body: { scheduledFor: string }; response: Res<PostsApi["scheduleYoutube"]> };
  "posts.itemComment": { response: Res<PostsApi["comment"]> };
  "posts.itemResend": { response: Res<PostsApi["resend"]> };
  "calendar.get": { query: { from?: string; to?: string; channel?: string; tag?: string }; response: CalendarResponse };

  "insights.get": { query: Q<Arg<InsightsApi["get"], 0>>; response: Res<InsightsApi["get"]> };
  "insights.retention": { query: { from?: string; to?: string; channel?: string; limit?: string }; response: RetentionResponse };
  "insights.retention.item": { response: RetentionItemResponse };
  "insights.import": { query: Q<Arg<InsightsApi["import"], 0> & ChannelQ>; response: Res<InsightsApi["import"]> };
  "content.list": { query: Q<Arg<ContentApi["list"], 0>>; response: Res<ContentApi["list"]> };

  "youtube.videos": { query: Q<Arg<YoutubeApi["listVideos"], 0> & ChannelQ>; response: Res<YoutubeApi["listVideos"]> };
  "youtube.video": { query: ChannelQ; response: Res<YoutubeApi["getVideo"]> };
  "youtube.editVideo": { query: ChannelQ; body: Arg<YoutubeApi["editVideo"], 1>; response: Res<YoutubeApi["editVideo"]> };
  "youtube.comments": { query: Q<Arg<YoutubeApi["comments"], 0> & ChannelQ>; response: Res<YoutubeApi["comments"]> };
  "youtube.reply": { body: { text: string }; response: Res<YoutubeApi["reply"]> };
  "youtube.resolve": { response: Res<YoutubeApi["resolve"]> };
  "youtube.reopen": { response: Res<YoutubeApi["reopen"]> };
  "instagram.media": { query: Q<Arg<InstagramApi["media"], 0>>; response: Res<InstagramApi["media"]> };
  "instagram.comments": { query: Q<Arg<InstagramApi["comments"], 0>>; response: Res<InstagramApi["comments"]> };
  "instagram.reply": { body: { text: string }; response: Res<InstagramApi["reply"]> };
  "instagram.hide": { body: { hide?: boolean }; response: Res<InstagramApi["hide"]> };
  "instagram.resolve": { response: Res<InstagramApi["resolve"]> };
  "instagram.reopen": { response: Res<InstagramApi["reopen"]> };
  "comments.list": { query: Q<Arg<CommunityApi["comments"], 0> & ChannelQ>; response: Res<CommunityApi["comments"]> };
  "mentions.list": { query: { network?: string }; response: { mentions: unknown[]; reason?: string } };

  "apiKeys.list": { response: Res<ApiKeysApi["list"]> };
  "apiKeys.create": { body: { name: string; scope?: string; expiresInDays?: number }; response: Res<ApiKeysApi["create"]> };
  "apiKeys.revoke": { response: Res<ApiKeysApi["revoke"]> };
  "usage.get": { query: Q<Arg<UsageApi["get"], 0>>; response: Res<UsageApi["get"]> };
  "usage.log": { query: Q<Arg<UsageApi["log"], 0>>; response: Res<UsageApi["log"]> };
  "preferences.get": { response: Res<PreferencesApi["get"]> };
  "preferences.put": { body: Arg<PreferencesApi["put"], 0>; response: Res<PreferencesApi["put"]> };
  "notifications.list": { query: Q<Arg<NotificationsApi["list"], 0>>; response: Res<NotificationsApi["list"]> };
  "notifications.read": { body: Arg<NotificationsApi["markRead"], 0>; response: Res<NotificationsApi["markRead"]> };

  "webhooks.list": { response: Res<WebhooksApi["list"]> };
  "webhooks.create": { body: Body<WebhooksApi["create"], 0>; response: Res<WebhooksApi["create"]> };
  "webhooks.get": { response: Res<WebhooksApi["get"]> };
  "webhooks.update": { body: Arg<WebhooksApi["update"], 1>; response: Res<WebhooksApi["update"]> };
  "webhooks.delete": { response: Res<WebhooksApi["remove"]> };
  "webhooks.test": { response: Res<WebhooksApi["test"]> };
  "webhooks.deliveries": { query: Q<Arg<WebhooksApi["deliveries"], 1>>; response: Res<WebhooksApi["deliveries"]> };
  "webhooks.redeliver": { response: Res<WebhooksApi["redeliver"]> };
  "webhooks.rotateSecret": { response: Res<WebhooksApi["rotateSecret"]> };

  "ideas.list": { response: Res<IdeasApi["list"]> };
  "ideas.create": { body: Body<IdeasApi["create"], 0>; response: Res<IdeasApi["create"]> };
  "ideas.import": { body: { ideas: Arg<IdeasApi["import"], 0> }; response: Res<IdeasApi["import"]> };
  "ideas.update": { body: Arg<IdeasApi["update"], 1>; response: Res<IdeasApi["update"]> };
  "ideas.delete": { response: Res<IdeasApi["remove"]> };
}

/** Falha de compilação se a tabela acima e `ROUTES` divergirem (rota sem tipo ou tipo de rota inexistente). */
type Exata<Faltam, Sobram> = [Faltam, Sobram] extends [never, never] ? true : { faltam: Faltam; sobram: Sobram };
type Afirma<T extends true> = T;
export type RouteTypesAreExhaustive = Afirma<Exata<Exclude<RouteKey, keyof RouteTypesTable>, Exclude<keyof RouteTypesTable, RouteKey>>>;

/** Tipos de uma rota. */
export type RouteTypes<K extends RouteKey> = RouteTypesTable[K];
/** Corpo de resposta documentado de uma rota (`RawResponse` nas rotas de HTML/bytes). */
export type RouteResponse<K extends RouteKey> = RouteTypesTable[K]["response"];
/** Corpo de pedido (nomes do contrato); `never` quando a rota não tem corpo; `"bytes"` no envio de mídia. */
export type RouteBody<K extends RouteKey> = RouteTypesTable[K] extends { body: infer B } ? B : never;
/** Query (nomes do contrato; todos opcionais e texto, como chegam na URL). */
export type RouteQuery<K extends RouteKey> = RouteTypesTable[K] extends { query: infer Qy } ? Qy : Record<never, string>;
/** Parâmetros de caminho, pelos nomes do caminho NOVO. */
export type RouteParams<K extends RouteKey> = { [N in PathParams<RouteOf<K>["path"]>]: string };

// ---------------------------------------------------------------------------------------------------------------- tradução em tipos
// O espelho, em tipos, do `toEN(…, "res")` de contract.ts: renomeia as chaves internas (PT) para as do contrato (EN). Valores de vocabulário fechado
// não são traduzidos aqui (o servidor guarda texto livre no banco); por isso a comparação com o contrato afrouxa literais (veja `Loosen`).
/** Chave interna → chave do contrato, na RESPOSTA. As linhas "só pedido" (ex.: `destinos` → `items`) ficam de fora. */
export type ResponseKeyOf<K extends PropertyKey> = K extends keyof ResponseFieldMap ? ResponseFieldMap[K] : K;
type Scoped = { [P in keyof typeof SCOPED_KEYS]: { [R in (typeof SCOPED_KEYS)[P][number] as R[0]]: R[1] } };
type KeyIn<K extends PropertyKey, Pai> = Extract<[Pai] extends [keyof Scoped] ? (K extends keyof Scoped[Pai & keyof Scoped] ? Scoped[Pai & keyof Scoped][K] : ResponseKeyOf<K>) : ResponseKeyOf<K>, PropertyKey>;
type IsAny<T> = 0 extends 1 & T ? true : false;
/** Corpo interno (PT) → corpo do contrato (EN), como `toEN(corpo, "res")` faz em tempo de execução. */
export type InternalToContract<T, Pai = null> = IsAny<T> extends true ? T
  : T extends string | number | boolean | null | undefined | bigint ? T
  : T extends ReadonlyArray<infer E> ? InternalToContract<E, Pai>[]
  : T extends (...a: never[]) => unknown ? T
  : T extends object ? { [K in keyof T as KeyIn<K, Pai>]: InternalToContract<T[K], K> }
  : T;
/** Literais viram o tipo largo (o servidor devolve texto livre do banco onde o contrato lista os valores possíveis). */
export type Loosen<T> = IsAny<T> extends true ? T
  : T extends string ? string : T extends number ? number : T extends boolean ? boolean
  : T extends ReadonlyArray<infer E> ? Loosen<E>[]
  : T extends (...a: never[]) => unknown ? T
  : T extends object ? { [K in keyof T]: Loosen<T[K]> }
  : T;
/** Campo de um PEDIDO no contrato (EN) → nome interno (PT) que o handler lê, como `toPT(…, "req")`. */
export type RequestKeyOf<K extends PropertyKey> = K extends keyof RequestFieldMap ? RequestFieldMap[K] : K;
/** Os campos que um handler pode ler do corpo ou da query de uma rota, com os nomes internos. Os valores vêm do cliente: `unknown`, validados no handler. */
export type InternalFields<T> = [T] extends [never] ? Record<never, unknown> : T extends object ? { [K in keyof T as Extract<RequestKeyOf<K>, PropertyKey>]?: unknown } : Record<never, unknown>;

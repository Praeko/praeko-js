// @praeko/sdk types. The English API is the contract (docs/api-contract.md); the Portuguese members at the bottom are DEPRECATED aliases.
export class PraekoError extends Error { status: number; code: string; details?: unknown; /** @deprecated */ codigo: string; /** @deprecated */ detalhes?: unknown; /** @deprecated */ mensagem: string }
/** @deprecated use PraekoError */
export const ErroArauto: typeof PraekoError;
/** @deprecated use PraekoError */
export const ArautoError: typeof PraekoError;
/** @deprecated use PraekoError */
export type ArautoError = PraekoError;
export type Network = "youtube" | "instagram" | "tiktok";
export type Source = Uint8Array | ArrayBuffer | Blob | { size: number; read(start: number, n: number): Promise<Uint8Array> | Uint8Array } | { tamanho: number; ler(inicio: number, n: number): Promise<Uint8Array> | Uint8Array };
export type Scope = "read" | "write" | "admin";
export type ItemState = "draft" | "scheduled" | "sent" | "private" | "error" | "canceled";
export type PostState = "draft" | "queued" | "sent" | "error" | "canceled";
export interface Media { id: string; type: "video" | "cover"; name: string; mime: string; size: number; state: "uploading" | "ready"; createdAt: string; publicUrl?: string; durationMs?: number; width?: number; height?: number }
export interface ItemRequest { network: Network; channel?: string; scheduledFor?: string | null; queue?: boolean; draft?: boolean; mode?: string; media?: { video?: string; cover?: string }; via?: "meta" | "buffer"; replaces?: { provider: "buffer"; id: string } }
/** `options.tiktok`: mode (draft = app inbox | direct), privacy (default SELF_ONLY until the app is audited), coverFrameMs, disableComments, disableDuet, disableStitch, commercialContent, ownBrand, thirdPartyBrand. */
export interface TiktokOptions { mode?: "draft" | "direct"; privacy?: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "SELF_ONLY"; coverFrameMs?: number; disableComments?: boolean; disableDuet?: boolean; disableStitch?: boolean; commercialContent?: boolean; ownBrand?: boolean; thirdPartyBrand?: boolean; chunkMB?: number }
export interface Texts { youtube?: { title?: string; text: string; pinnedComment?: string }; instagram?: { text: string; pinnedComment?: string }; tiktok?: { text: string } }
export interface PostRequest { id?: string; title: string; media: { video: string; cover?: string }; texts: Texts; items: ItemRequest[]; queue?: boolean; draft?: boolean; tags?: string[]; options?: { format?: "short" | "long"; tiktok?: TiktokOptions; [k: string]: unknown } }
export interface Item { id: string; network: Network; channel?: string; state: ItemState; scheduledFor: string | null; custom: boolean; mode?: string; url?: string; studio?: string; warning?: string; adopted?: boolean; external?: { provider: string; id: string }; runAt?: string; privacy?: string; actions?: Record<string, boolean>; media?: { video?: string; cover?: string } }
export interface Post { id: string; title: string; state: PostState; type: string; origin: string; items: Item[]; tags: string[]; texts: Texts; media: { video: string; cover: string | null }; thumb: string | null; createdAt: string; updatedAt: string }
export interface Slot { weekday: number; day: "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat"; time: string; active: boolean }
export interface Channel { network: Network; supported: boolean; connected: boolean; id?: string; default?: boolean; detail?: string; timezone?: string; slots?: number; name?: string; avatar?: string; meta?: { connected: boolean; username?: string | null; source?: "meta_login" /* absent = system token */; expiresAt?: string; daysLeft?: number; expired?: boolean; reason?: string } }
export interface Page<K extends string, T> { total: number }
export class Praeko {
  constructor(o: { url: string; key?: string; /** browser, same origin: no key; the panel session cookie authenticates */ cookies?: boolean; fetch?: typeof fetch; retries?: number; wait?: (ms: number) => Promise<void>; /** @deprecated */ chave?: string; /** @deprecated */ tentativas?: number; /** @deprecated */ espera?: (ms: number) => Promise<void> });
  url: string;
  media: { create(meta: { type: "video" | "cover"; name: string; mime: string; size: number; simple?: boolean; sha256?: string }): Promise<{ id: string; minPartSize?: number; maxPartSize?: number; suggestedPartSize?: number }>; uploadPart(id: string, n: number, bytes: Uint8Array): Promise<unknown>; uploadContent(id: string, bytes: Uint8Array): Promise<Media>; complete(id: string): Promise<Media>; get(id: string): Promise<Media>; list(type?: string): Promise<{ media: Media[] }>; remove(id: string): Promise<unknown>; upload(source: Source, o: { type: "video" | "cover"; name: string; mime: string; part?: number; onProgress?: (done: number, total: number) => void }): Promise<Media> };
  posts: PostsApi;
  channels: { remove(channel: string): Promise<{ network: Network; channel: string; removed: true }>; setDefault(channel: string): Promise<{ network: Network; channel: string; default: true }>; list(o?: { verify?: boolean }): Promise<{ channels: Channel[] }>; slots(network: Network, o?: { channel?: string }): Promise<{ network: Network; timezone: string; slots: Slot[] }>; setSlots(network: Network, slots: (string | { day: string | number; time: string })[], o?: { timezone?: string; channel?: string }): Promise<{ network: Network; timezone: string; slots: Slot[]; rescheduled: unknown[] }>; setFollowers(network: Network, value: number, o?: { day?: string; channel?: string }): Promise<{ network: Network; day: string; followers: number; source: string }>; followers(network: Network, o?: { channel?: string }): Promise<{ network: Network; records: { day: string; followers: number; source: string }[] }>; connect(network: Network | "meta", o?: { replace?: boolean; add?: boolean; instagram?: string; instagramId?: string; probe?: boolean }): Promise<{ url: string; redirect: string; expiresAt: string; warning?: string }>; disconnect(network: "tiktok", o?: { channel?: string }): Promise<{ network: Network; channel?: string; disconnected: boolean; revokedAtTiktok: boolean }>; sendInstagramToken(body: { token: string; userId: string; username?: string; type?: string; host?: string }): Promise<unknown> };
  tiktok: { creator(o?: { channel?: string }): Promise<unknown> };
  instagram: { media(o?: { max?: number; page?: string }): Promise<unknown>; comments(o?: { media?: string; unanswered?: boolean; sort?: string; max?: number }): Promise<unknown>; reply(id: string, text: string): Promise<unknown>; hide(id: string, hide?: boolean): Promise<unknown>; resolve(id: string): Promise<unknown>; reopen(id: string): Promise<unknown> } & LegacyInstagram;
  community: { comments(o?: { network?: "all" | Network; unanswered?: boolean; sort?: string; max?: number }): Promise<unknown> };
  youtube: { listVideos(o?: { max?: number; page?: string }): Promise<{ videos: unknown[]; next?: string | null }>; getVideo(id: string): Promise<{ video: unknown }>; editVideo(id: string, o?: { title?: string; description?: string; tags?: string[]; dryRun?: boolean }): Promise<{ before: unknown; after: unknown; changed: boolean; written?: boolean }>; comments(o?: { video?: string; unanswered?: boolean; sort?: string; max?: number; page?: string }): Promise<{ comments: unknown[]; next?: string | null; pending: number }>; resolve(threadId: string): Promise<unknown>; reopen(threadId: string): Promise<unknown>; reply(threadId: string, text: string): Promise<unknown> } & LegacyYoutube;
  insights: { get(o?: { from?: string; to?: string; channel?: string; tag?: string; type?: string; compare?: boolean; sort?: string; direction?: string; page?: number; limit?: number }): Promise<Record<string, any>>; import(o?: { network?: "all" | Network; dryRun?: boolean }): Promise<{ imported: Record<string, any>[] }> } & LegacyInsights;
  content: { list(o?: { network?: string; type?: string; from?: string; to?: string; sort?: string; limit?: number; offset?: number }): Promise<{ total: number; items: Record<string, any>[] }> };
  apiKeys: { list(): Promise<{ keys: unknown[] }>; create(name: string, scope?: Scope): Promise<{ id: string; key: string; scope: Scope }>; revoke(id: string): Promise<unknown> };
  usage: {
    get(o?: { days?: number }): Promise<{ days: number; period: { from: string; to: string }; total: number; succeeded: number; errors: number; p95Ms: number | null; peakPerMinute: number; limitPerMinute: number; byDay: { day: string; total: number; errors: number }[]; byHour?: { start: string; total: number; errors: number }[]; byKey: { id: string; name: string; total: number; errors: number; lastAt: string }[] }>;
    log(o?: { key?: string; status?: string | number; route?: string; method?: string; days?: number; limit?: number; cursor?: string }): Promise<{ records: { id: string; method: string; route: string; status: number; durationMs: number; key: string; keyName: string; createdAt: string }[]; next: string | null }>;
  };
  preferences: {
    get(): Promise<Preferences>;
    put(changes: { theme?: PreferenceTheme; language?: PreferenceLanguage; notifications?: { [E in NotificationEvent]?: Partial<NotificationChannels> } }): Promise<Preferences>;
  };
  webhooks: {
    list(): Promise<{ webhooks: Webhook[]; events: WebhookEvent[] }>;
    create(o: { url: string; events?: WebhookEvent[]; active?: boolean }): Promise<Webhook & { secret: string; warning: string }>;
    get(id: string): Promise<Webhook>;
    update(id: string, o: { url?: string; events?: WebhookEvent[]; active?: boolean }): Promise<Webhook>;
    remove(id: string): Promise<{ deleted: string }>;
    test(id: string): Promise<{ delivery: WebhookDelivery }>;
    deliveries(id: string, o?: { limit?: number }): Promise<{ deliveries: WebhookDelivery[] }>;
    redeliver(id: string, deliveryId: string): Promise<{ delivery: WebhookDelivery }>;
    rotateSecret(id: string): Promise<{ id: string; secret: string; secretHint: string; warning: string }>;
  };
  ideas: {
    list(): Promise<{ ideas: Idea[]; total: number }>;
    create(o: { title: string; note?: string; group?: IdeaGroup; tags?: string[] }): Promise<Idea>;
    update(id: string, o: { title?: string; note?: string; group?: IdeaGroup; tags?: string[] }): Promise<Idea>;
    remove(id: string): Promise<{ deleted: string }>;
    import(ideas: { id?: string; title: string; note?: string; group?: IdeaGroup; tags?: string[]; createdAt?: string }[]): Promise<{ imported: number; skippedCount: number }>;
  };
  calendar(o?: { from?: string; to?: string; channel?: string; tag?: string }): Promise<{ from: string; to: string; items: unknown[]; freeSlots: { network: Network; scheduledFor: string }[] }>;
  mentions(o?: { network?: string }): Promise<{ mentions: unknown[]; reason: string }>;
  health(): Promise<{ ok: boolean; service: string; version: string }>;
  // ---- DEPRECATED (Portuguese aliases; they call the legacy routes and return the old Portuguese shapes) ----
  /** @deprecated use media */ midia: { iniciar(meta: Record<string, unknown>): Promise<any>; enviarParte(id: string, n: number, bytes: Uint8Array): Promise<any>; enviarConteudo(id: string, bytes: Uint8Array): Promise<any>; completar(id: string): Promise<any>; obter(id: string): Promise<any>; listar(tipo?: string): Promise<any>; remover(id: string): Promise<any>; enviar(origem: Source, o: { tipo: "video" | "capa"; nome: string; mime: string; parte?: number; aoProgredir?: (feito: number, total: number) => void }): Promise<any> };
  /** @deprecated use channels */ canais: { listar(o?: { verificar?: boolean }): Promise<any>; vagas(rede: Network): Promise<any>; definirVagas(rede: Network, vagas: unknown[], o?: { fuso?: string }): Promise<any>; informarSeguidores(rede: Network, valor: number, o?: { dia?: string }): Promise<any>; seguidores(rede: Network): Promise<any>; conectar(rede: Network): Promise<any>; desconectar(rede: "tiktok"): Promise<any>; enviarTokenInstagram(corpo: Record<string, unknown>): Promise<any> };
  /** @deprecated use apiKeys */ chaves: { listar(): Promise<any>; criar(nome: string, escopo?: "leitura" | "escrita" | "admin"): Promise<any>; revogar(id: string): Promise<any> };
  /** @deprecated use community */ comunidade: { comentarios(o?: Record<string, unknown>): Promise<any> };
  /** @deprecated use content */ conteudo: { listar(o?: Record<string, unknown>): Promise<any> };
  /** @deprecated use calendar */ calendario(o?: { de?: string; ate?: string; canal?: string; etiqueta?: string }): Promise<any>;
  /** @deprecated use mentions */ mencoes(o?: { rede?: string }): Promise<any>;
  /** @deprecated use health */ saude(): Promise<any>;
}
// Deprecated members merged into the English namespaces:
interface LegacyInstagram { /** @deprecated */ midias(o?: Record<string, unknown>): Promise<any>; /** @deprecated */ comentarios(o?: Record<string, unknown>): Promise<any>; /** @deprecated */ responder(id: string, texto: string): Promise<any>; /** @deprecated */ ocultar(id: string, ocultar?: boolean): Promise<any>; /** @deprecated */ resolver(id: string): Promise<any>; /** @deprecated */ reabrir(id: string): Promise<any> }
interface LegacyYoutube { /** @deprecated use listVideos */ videos(o?: { max?: number; pagina?: string }): Promise<any>; /** @deprecated */ lerVideo(id: string): Promise<any>; /** @deprecated */ editarVideo(id: string, o?: Record<string, unknown>): Promise<any>; /** @deprecated */ comentarios(o?: Record<string, unknown>): Promise<any>; /** @deprecated */ resolver(id: string): Promise<any>; /** @deprecated */ reabrir(id: string): Promise<any>; /** @deprecated */ responder(id: string, texto: string): Promise<any> }
interface LegacyInsights { /** @deprecated use get */ obter(o?: Record<string, unknown>): Promise<any>; /** @deprecated use import */ importar(o?: Record<string, unknown>): Promise<any> }
interface PostsApi { create(p: PostRequest): Promise<{ id: string; items: Item[] }>; list(f?: { state?: string; channel?: string; tag?: string; limit?: number; offset?: number }): Promise<{ total: number; posts: Post[] }>; get(id: string): Promise<Post & { actions: unknown[] }>; update(id: string, changes: Record<string, unknown>): Promise<Post>; publishNow(id: string, o?: { network?: Network }): Promise<Post>; cancel(id: string): Promise<{ id: string; canceled: string[]; kept: Item[] }>; adopt(body: Record<string, unknown>): Promise<Post>; scheduleYoutube(id: string, scheduledFor: string): Promise<{ url: string; publishAt: string }>; comment(id: string, itemId: string): Promise<unknown> }
interface PostsApi { /** @deprecated */ criar(p: Record<string, unknown>): Promise<any>; /** @deprecated */ listar(f?: Record<string, unknown>): Promise<any>; /** @deprecated */ obter(id: string): Promise<any>; /** @deprecated */ editar(id: string, m: Record<string, unknown>): Promise<any>; /** @deprecated */ publicarAgora(id: string, o?: { rede?: Network }): Promise<any>; /** @deprecated */ cancelar(id: string): Promise<any>; /** @deprecated */ adotar(corpo: Record<string, unknown>): Promise<any>; /** @deprecated */ agendarYoutube(id: string, quando: string): Promise<any>; /** @deprecated */ comentar(id: string, itemId: string): Promise<any> }
/** @deprecated use Praeko (the class was called Arauto before the rename). */
export const Arauto: typeof Praeko;
/** @deprecated use Praeko */
export type Arauto = Praeko;
export const SIMPLE_MAX: number; export const DEFAULT_PART: number;
/** @deprecated */ export const ATALHO_MAX: number; /** @deprecated */ export const PARTE_PADRAO: number;
export function asSource(x: Source): { size: number; read(start: number, n: number): Promise<Uint8Array> | Uint8Array };
/** @deprecated use asSource */ export function comoFonte(x: Source): { tamanho: number; ler(inicio: number, n: number): Promise<Uint8Array> | Uint8Array; size: number; read(start: number, n: number): Promise<Uint8Array> | Uint8Array };

export type IdeaGroup = "idea" | "scripting" | "ready" | "posted";
export interface Idea { id: string; title: string; note: string; group: IdeaGroup; tags: string[]; createdAt: string; updatedAt: string }

export type PreferenceTheme = "light" | "dark" | "system";
export type PreferenceLanguage = "pt-BR" | "en";
export type NotificationEvent = "postSent" | "postFailed" | "scheduledFail" | "weeklySummary" | "newComment";
export interface NotificationChannels { email: boolean; panel: boolean }
export interface Preferences { theme: PreferenceTheme; language: PreferenceLanguage; notifications: Record<NotificationEvent, NotificationChannels> }
export type WebhookEvent = "post.sent" | "post.failed" | "post.scheduled-fail";
export interface Webhook { id: string; url: string; events: WebhookEvent[]; active: boolean; secretHint: string; consecutiveFailures: number; disabledReason?: string; createdAt: string; updatedAt: string; recentDeliveries?: { total: number; ok: number } }
export interface WebhookDelivery { id: string; event: WebhookEvent | "ping.test"; eventId: string; state: "pending" | "delivered" | "failed" | "discarded"; attempts: number; nextAttemptAt?: string; lastStatus?: number; lastError?: string; durationMs?: number; createdAt: string; deliveredAt?: string }

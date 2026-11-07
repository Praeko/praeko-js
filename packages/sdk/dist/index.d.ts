import type { ApiKeysApi, Network, ChannelsApi, CommunityApi, ContentApi, IdeasApi, InsightsApi, InstagramApi, LegacyCanaisApi, LegacyChavesApi, LegacyComunidadeApi, LegacyConteudoApi, LegacyInsights, LegacyInstagram, LegacyMidiaApi, LegacyPosts, LegacyYoutube, MediaApi, NotificationsApi, PostsApi, PreferencesApi, Source, SourceReader, TiktokApi, UsageApi, WebhooksApi, YoutubeApi } from "./types.js";
export type * from "./types.js";
export declare class PraekoError extends Error {
    status: number;
    code: string;
    details?: unknown;
    constructor(status: number, code: string, message: string, details?: unknown);
    /** @deprecated use `code` */ get codigo(): string;
    /** @deprecated use `details` */ get detalhes(): unknown;
    /** @deprecated use `message` */ get mensagem(): string;
}
/** @deprecated use PraekoError */
export declare const ErroArauto: typeof PraekoError;
/** @deprecated use PraekoError */
export declare const ArautoError: typeof PraekoError;
/** @deprecated use PraekoError */
export type ArautoError = PraekoError;
export declare const SIMPLE_MAX: number;
export declare const DEFAULT_PART: number;
/** @deprecated */ export declare const ATALHO_MAX: number;
/** @deprecated */ export declare const PARTE_PADRAO: number;
/** Turns a Uint8Array, ArrayBuffer or Blob into a source { size, read(start, n) }. Sources in the old shape ({ tamanho, ler }) still work. */
export declare function asSource(x: Source): SourceReader;
/** @deprecated use asSource */
export declare function comoFonte(x: Source): SourceReader & {
    tamanho: number;
    ler(inicio: number, n: number): Promise<Uint8Array> | Uint8Array;
};
/** Options of `new Praeko(...)`. `cookies: true` (browser, same origin): no key; the panel session cookie authenticates. */
export interface PraekoOptions {
    url: string;
    key?: string;
    /** browser, same origin: no key; the panel session cookie authenticates */ cookies?: boolean;
    fetch?: typeof fetch;
    retries?: number;
    wait?: (ms: number) => Promise<void>;
    /** @deprecated use `key` */ chave?: string; /** @deprecated use `retries` */
    tentativas?: number; /** @deprecated use `wait` */
    espera?: (ms: number) => Promise<void>;
}
export declare class Praeko {
    url: string;
    private _key;
    private _cookies;
    private _fetch;
    private _retries;
    private _wait;
    media: MediaApi;
    posts: PostsApi & LegacyPosts;
    channels: ChannelsApi;
    tiktok: TiktokApi;
    /** Instagram through the Meta API: media grid, comments (with replies) and Praeko's "resolved" flag. Replying/hiding writes to Instagram for real. */
    instagram: InstagramApi & LegacyInstagram;
    /** Comments of all networks together: network = all | youtube | instagram. */
    community: CommunityApi;
    youtube: YoutubeApi & LegacyYoutube;
    insights: InsightsApi & LegacyInsights;
    /** Everything already published (Praeko + imported), newest first: { total, items }. */
    content: ContentApi;
    apiKeys: ApiKeysApi;
    /** API usage of this workspace and the request log (30 days, metadata only). */
    usage: UsageApi;
    /** Panel preferences (theme, language, notifications per event). `put` is partial and strict; it returns the full preferences. */
    preferences: PreferencesApi;
    /** In-panel notification center (the bell) of the signed-in user. */
    notifications: NotificationsApi;
    /** (admin) Outgoing webhooks. The `secret` comes back only from create and rotateSecret. Events: post.sent, post.failed, post.scheduled-fail. */
    webhooks: WebhooksApi;
    /** Idea board ("Create" screen). */
    ideas: IdeasApi;
    /** @deprecated use media */ midia: LegacyMidiaApi;
    /** @deprecated use channels */ canais: LegacyCanaisApi;
    /** @deprecated use apiKeys */ chaves: LegacyChavesApi;
    /** @deprecated use community */ comunidade: LegacyComunidadeApi;
    /** @deprecated use content */ conteudo: LegacyConteudoApi;
    /** @deprecated use calendar */ calendario: (o?: {
        de?: string;
        ate?: string;
        canal?: string;
        etiqueta?: string;
    }) => Promise<any>;
    /** @deprecated use mentions */ mencoes: (o?: {
        rede?: string;
    }) => Promise<any>;
    /** @deprecated use health */ saude: () => Promise<any>;
    constructor(o: PraekoOptions);
    calendar({ from, to, channel, tag }?: {
        from?: string;
        to?: string;
        channel?: string;
        tag?: string;
    }): Promise<{
        from: string;
        to: string;
        items: unknown[];
        freeSlots: {
            network: Network;
            scheduledFor: string;
        }[];
    }>;
    mentions({ network }?: {
        network?: string;
    }): Promise<{
        mentions: unknown[];
        reason: string;
    }>;
    health(): Promise<{
        ok: boolean;
        service: string;
        version: string;
    }>;
}
/** @deprecated use Praeko (the class was called Arauto before the rename). */
export { Praeko as Arauto };

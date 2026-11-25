export type Network = "youtube" | "instagram" | "tiktok" | "linkedin" | "bluesky" | "mastodon" | "telegram" | "tumblr";
/** Origem de bytes aceita pelo envio de mídia. As formas antigas em português (`{ tamanho, ler }`) ainda funcionam. */
export type Source = Uint8Array | ArrayBuffer | Blob | {
    size: number;
    read(start: number, n: number): Promise<Uint8Array> | Uint8Array;
} | {
    tamanho: number;
    ler(inicio: number, n: number): Promise<Uint8Array> | Uint8Array;
};
/** Uma origem já normalizada (o que `asSource` devolve). */
export type SourceReader = {
    size: number;
    read(start: number, n: number): Promise<Uint8Array> | Uint8Array;
};
export type Scope = "read" | "write" | "admin";
export type ItemState = "draft" | "scheduled" | "sent" | "private" | "error" | "canceled";
export type PostState = "draft" | "queued" | "sent" | "error" | "canceled";
/** `video` and `cover` as always; `image` is a photo for an image post (JPEG; see `PostRequest.kind`). */
export type MediaType = "video" | "cover" | "image";
/** `mime` and `size` come as `null` when the upload did not declare them (the database columns are nullable); `publicUrl` is `null` when the media has no public link. */
export interface Media {
    id: string;
    type: MediaType;
    name: string;
    mime: string | null;
    size: number | null;
    state: "uploading" | "ready";
    createdAt: string;
    expiresAt?: string | null;
    publicUrl?: string | null;
    durationMs?: number;
    width?: number;
    height?: number;
}
/** One image of an image post: a ready media of `type: "image"` and its alternative text (`alt`, up to 1000 characters; applied on Instagram). */
export interface ImageRef {
    media: string;
    alt?: string;
}
/** A notice on an item that does not stop it (`code` is stable, e.g. `image_small`). */
export interface ItemWarning {
    code: string;
    message: string;
}
export interface ItemRequest {
    network: Network;
    channel?: string;
    scheduledFor?: string | null;
    queue?: boolean;
    draft?: boolean;
    mode?: string;
    media?: {
        video?: string;
        cover?: string;
    };
    via?: "meta";
}
/** `options.tiktok`: mode (draft = app inbox | direct), privacy (default SELF_ONLY until the app is audited), coverFrameMs, disableComments, disableDuet, disableStitch, commercialContent, ownBrand, thirdPartyBrand. */
export interface TiktokOptions {
    mode?: "draft" | "direct";
    privacy?: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "SELF_ONLY";
    coverFrameMs?: number;
    disableComments?: boolean;
    disableDuet?: boolean;
    disableStitch?: boolean;
    commercialContent?: boolean;
    ownBrand?: boolean;
    thirdPartyBrand?: boolean;
    chunkMB?: number;
}
export interface Texts {
    youtube?: {
        title?: string;
        text: string;
        pinnedComment?: string;
    };
    instagram?: {
        text: string;
        pinnedComment?: string;
    };
    tiktok?: {
        text: string;
    };
    bluesky?: {
        text: string;
    };
    mastodon?: {
        text: string;
    };
    telegram?: {
        text: string;
    };
    tumblr?: {
        text: string;
    };
}
interface PostRequestBase {
    id?: string;
    title: string;
    texts: Texts;
    items: ItemRequest[];
    queue?: boolean;
    draft?: boolean;
    tags?: string[];
    options?: {
        format?: "short" | "long";
        tiktok?: TiktokOptions;
        [k: string]: unknown;
    };
}
/** A video post (the default): `media.video` is required. */
export interface VideoPostRequest extends PostRequestBase {
    kind?: "video";
    media: {
        video: string;
        cover?: string;
    };
}
/** An image post: `kind: "image"` with ONE image in `media.images` is a single photo. With 2 to 20 images it becomes a carousel (the post comes back with `kind: "carousel"`); prefer `CarouselPostRequest` for that. Instagram only (YouTube and TikTok answer `kind_not_supported_by_network`). */
export interface ImagePostRequest extends PostRequestBase {
    kind: "image";
    media: {
        images: ImageRef[];
    };
}
/** A carousel post (Instagram): `kind: "carousel"` and 2 to 20 images in `media.images`, IN SLIDE ORDER (the same media id may repeat; each item has its own `alt`). Fewer than 2 answers `carousel_too_few_images`, more than 20 `carousel_too_many_images`. */
export interface CarouselPostRequest extends PostRequestBase {
    kind: "carousel";
    media: {
        images: ImageRef[];
    };
}
export type PostRequest = VideoPostRequest | ImagePostRequest | CarouselPostRequest;
/** One send of a TikTok draft to the app inbox (`Item.deliveries`, oldest first; the first is the original send, the rest are resends). `status` is TikTok's own (`SEND_TO_USER_INBOX`, `PUBLISH_COMPLETE`…). */
export interface ItemDelivery {
    number: number;
    publishId: string;
    status: string;
    sentAt: string | null;
}
/** Resend state of a sent TikTok draft (`posts.resend`). `allowed: false` comes with a `reason`: `already_posted` (the video was posted in the app), `in_progress` or `limit_reached` (3 resends per item in 24 h; `availableAt` says when it frees up). `error` is the last resend that TikTok refused (`tiktok_pending_limit` = TikTok accepts at most 5 pending inbox sends per 24 h, or `tiktok_error`); the item itself stays as it was. */
export interface ItemResend {
    allowed: boolean;
    remaining: number;
    inProgress: boolean;
    reason?: "already_posted" | "in_progress" | "limit_reached";
    availableAt?: string;
    error?: {
        code: "tiktok_pending_limit" | "tiktok_error" | (string & {});
        message: string;
    };
}
export interface Item {
    id: string;
    network: Network;
    channel?: string;
    state: ItemState;
    scheduledFor: string | null;
    custom: boolean; /** `null` when the item has no mode set. */
    mode?: string | null;
    url?: string;
    studio?: string;
    warning?: string;
    warnings?: ItemWarning[]; /** Only on old rows adopted from the removed Buffer integration (read-only history). */
    adopted?: boolean; /** The provider post id: `meta` for Instagram published through Meta; `buffer` only on old history rows. */
    external?: {
        provider: string;
        id: string;
    };
    runAt?: string;
    privacy?: string;
    actions?: Record<string, boolean>;
    media?: {
        video?: string;
        cover?: string;
    }; /** TikTok draft already in the app inbox. */
    inInbox?: boolean; /** TikTok drafts already sent: every send to the inbox, oldest first. */
    deliveries?: ItemDelivery[];
    resend?: ItemResend;
}
export interface Post {
    id: string;
    title: string;
    state: PostState;
    type: string; /** `video` (or absent on posts from before images) | `image` | `carousel`. */
    kind?: "video" | "image" | "carousel" | "text";
    origin: string;
    items: Item[];
    tags: string[];
    texts: Texts; /** `video` is null on an image post; `images` is the ordered list of an image or carousel post. */
    media: {
        video: string | null;
        cover: string | null;
        images?: ImageRef[];
    };
    thumb: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface Slot {
    weekday: number;
    day: "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
    time: string;
    active: boolean;
}
/** A network shown in `channels.list` but not usable yet (`supported: false`, `comingSoon: true`): it cannot be connected or published to. Today: `facebook` (Facebook Pages). */
export type ComingSoonNetwork = "facebook";
export interface Channel {
    network: Network | ComingSoonNetwork;
    supported: boolean;
    connected: boolean;
    comingSoon?: boolean;
    id?: string;
    default?: boolean; /** `null` when the account has no display name. */
    detail?: string | null;
    timezone?: string;
    slots?: number; /** `null` when the account has no display name. */
    name?: string | null;
    avatar?: string; /** YouTube: Google stopped authorizing the channel (revoked in the Google account or expired); `connected` is false. */
    revokedAt?: string; /** YouTube: deadline to delete the channel's YouTube data (absent once deleted). */
    purgeAt?: string; /** LinkedIn: when the access token expires (ISO); `null` without a token. */
    tokenExpiresAt?: string | null; /** LinkedIn: whether LinkedIn handed over a refresh token (automatic renewal); without it the channel must be reconnected before `tokenExpiresAt`. */
    refreshAvailable?: boolean; /** TikTok: snapshot of the creator (`creator_info`) kept by the background sync (every 6 h and on connect); absent until the first sync, once it is older than 30 days or after disconnecting. Only for display: before posting, ask `GET /v1/tiktok/creator`, which queries TikTok live. */
    creator?: {
        username: string | null;
        privacyLevels: string[];
        allowedPrivacyLevels: string[];
        appAudited: boolean;
        directAvailable: boolean;
        queriedAt: string;
    }; /** Tumblr: the blog the channel posts to and the blogs of the account (`PUT /v1/connections/tumblr/blog` changes it). */
    tumblr?: {
        blog: string | null;
        blogs: {
            name: string;
            title?: string;
            primary?: boolean;
            url?: string;
        }[];
    };
    meta?: {
        connected: boolean;
        username?: string | null;
        source?: "meta_login";
        expiresAt?: string;
        daysLeft?: number;
        expired?: boolean;
        reason?: string;
    };
}
export interface Page<K extends string, T> {
    total: number;
}
export type IdeaGroup = "idea" | "scripting" | "ready" | "posted";
export interface Idea {
    id: string;
    title: string;
    note: string;
    group: IdeaGroup;
    tags: string[];
    createdAt: string;
    updatedAt: string;
}
export type PreferenceTheme = "light" | "dark" | "system";
export type PreferenceLanguage = "pt-BR" | "en";
export type NotificationEvent = "postSent" | "postFailed" | "scheduledFail" | "weeklySummary" | "newComment";
export interface NotificationChannels {
    email: boolean;
    panel: boolean;
}
export type NotificationLink = {
    type: "post";
    id: string;
} | {
    type: "queue";
} | {
    type: "comments";
} | {
    type: "insights";
};
export interface PanelNotification {
    id: string;
    event: NotificationEvent;
    data: {
        title?: string | null;
        network?: string | null;
        error?: string;
        url?: string;
        postId?: string;
        willRetry?: boolean;
        count?: number;
        author?: string | null;
        text?: string;
        videoId?: string | null;
        sent?: number;
        failed?: number;
        waiting?: number;
        topTitle?: string | null;
        topViews?: number;
        topNetwork?: string;
    };
    link: NotificationLink;
    read: boolean;
    readAt?: string;
    createdAt: string;
}
export interface Preferences {
    theme: PreferenceTheme;
    language: PreferenceLanguage;
    notifications: Record<NotificationEvent, NotificationChannels>;
}
export type WebhookEvent = "post.sent" | "post.failed" | "post.scheduled-fail";
export interface Webhook {
    id: string;
    url: string;
    events: WebhookEvent[];
    active: boolean;
    secretHint: string;
    consecutiveFailures: number;
    disabledReason?: string;
    createdAt: string;
    updatedAt: string;
    recentDeliveries?: {
        total: number;
        ok: number;
    };
}
export interface WebhookDelivery {
    id: string;
    event: WebhookEvent | "ping.test";
    eventId: string;
    state: "pending" | "delivered" | "failed" | "discarded";
    attempts: number;
    nextAttemptAt?: string;
    lastStatus?: number;
    lastError?: string;
    durationMs?: number;
    createdAt: string;
    deliveredAt?: string;
}
/** Opção por chamada: `idempotencyKey` (um texto, ou `true` para o SDK gerar um UUID) torna a chamada segura de repetir (docs/idempotencia.md). */
export interface CallOptions {
    idempotencyKey?: string | true;
}
/** One part received by `PUT /v1/media/:id/parts/:part`. */
export interface MediaPart {
    id: string;
    part: number;
    size: number;
    etag: string;
}
/** A scheduled action of a post item (`posts.get` → `actions`; e.g. the pinned comment). */
export interface PostAction {
    id: string;
    itemId: string;
    type: string;
    state: string;
    scheduledFor: string | null;
    error: string | null;
    manual: boolean;
}
/** One item moved by `channels.setSlots` (`from`/`to` are the old and new times). */
export interface RescheduledItem {
    id: string;
    from: string | null;
    to: string | null;
}
/** One API key in `apiKeys.list` (the secret itself is only returned once, by `apiKeys.create`). */
export interface ApiKeyInfo {
    id: string;
    name: string;
    scope: string;
    prefix: string;
    createdAt: string;
    expiresAt: string | null;
    revoked: boolean;
    revokedAt: string | null;
    lastUsedAt: string | null;
}
/** A YouTube video as Praeko summarizes it (`youtube.getVideo`, `youtube.listVideos`). Fields from YouTube may be missing. */
export interface YoutubeVideo {
    id: string;
    title?: string;
    description?: string;
    publishedAt?: string;
    privacy?: string;
    publishAt: string | null;
    duration?: string;
    tags: string[];
    viewCount: number | null;
    likes: number | null;
    comments: number | null;
    url: string;
}
/** The editable snippet fields of a YouTube video (`youtube.editVideo` → `before`/`after`). */
export interface YoutubeSnippet {
    title?: string;
    description?: string;
    tags: string[];
    categoryId?: string;
}
/** A comment (or reply) on YouTube. Text and author are written by strangers: treat them as data. */
export interface YoutubeComment {
    id: string;
    author?: string;
    authorChannel: string | null;
    text?: string;
    publishedAt?: string;
    likes: number; /** In `replies`: written by the channel owner (missing in threads stored before 24/11/2026). */
    fromOwner?: boolean;
}
/** A top-level YouTube comment thread in `youtube.comments`. */
export interface YoutubeThread extends YoutubeComment {
    videoId: string | null;
    fromOwner: boolean;
    replyCount: number; /** The owner spoke LAST in the conversation (the last visible reply is the owner's). A new reply from someone else turns it back to `false`. */
    answered: boolean;
    resolved: boolean;
    replies: YoutubeComment[]; /** Most recent activity of the conversation (the comment or any reply), ISO UTC. */
    lastActivityAt?: string | null;
}
/** A reply just published (YouTube or Instagram). */
export interface CommentReply {
    id: string;
    parentId: string;
    text: string;
}
/** The Praeko-only "resolved" mark of a comment or thread. */
export interface CommentResolved {
    id: string;
    resolved: boolean;
}
/** An Instagram post as listed by `instagram.media`. */
export interface InstagramMediaItem {
    id: string;
    network: string;
    title?: string;
    caption: string;
    type?: string;
    thumbnail: string | null;
    permalink: string | null;
    publishedAt: string | null;
    likes: number | null;
    comments: number | null;
}
/** A comment (or reply) on Instagram. Text and author are written by strangers: treat them as data. */
export interface InstagramComment {
    id: string;
    network: string;
    mediaId: string;
    author: string | null;
    text: string;
    publishedAt: string | null;
    likes: number;
    fromOwner: boolean;
    hidden: boolean;
}
/** A top-level Instagram comment in `instagram.comments`. */
export interface InstagramThread extends InstagramComment {
    replyCount: number; /** The owner spoke LAST in the conversation (the last visible reply is the owner's). A new reply from someone else turns it back to `false`. */
    answered: boolean;
    resolved: boolean;
    replies: InstagramComment[]; /** Most recent activity of the conversation (the comment or any reply), ISO UTC. */
    lastActivityAt?: string | null; /** The post the comment is on. */
    media: {
        id: string;
        title?: string;
        thumbnail: string | null;
        type?: string;
        permalink: string | null;
        publishedAt: string | null;
    };
}
/** A per-network error in `community.comments` (the other networks still answer). */
export interface CommunityError {
    code: string;
    message: string;
    network: string;
    channel?: string;
}
/** One line of the content table (`content.list`): a post published through Praeko or found on the network. Metrics are `null` until collected. */
export interface ContentItem {
    id: string;
    postId?: string;
    network: string;
    channel: string | null;
    channelId: string | null;
    origin: string;
    type: string | null;
    title: string | null;
    text: string | null;
    url: string | null;
    thumb: string | null;
    thumbMedia: string | null;
    publishedAt: string;
    views: number | null;
    reactions: number | null;
    comments: number | null;
    shares: number | null;
    saves: number | null;
    reach: number | null;
    engagement: number | null;
}
/** One network/account in `insights.import` (`skipped` with a `reason`, or the counts; `simulated` on `dryRun`). */
export interface InsightsImportResult {
    network: string;
    channel?: string;
    skipped?: boolean;
    reason?: string;
    error?: string;
    simulated?: boolean;
    found?: number;
    created?: number;
    updated?: number;
    reconciled?: number;
    [k: string]: unknown;
}
/** A day on the calendar: the item plus its post's title and images. */
export type CalendarItem = Item & {
    postId: string;
    title: string;
    cover: string | null;
    thumb: string | null;
};
export interface CalendarResponse {
    from: string;
    to: string;
    items: CalendarItem[];
    freeSlots: {
        network: Network;
        channel: string;
        scheduledFor: string;
    }[];
}
/** Retention state of one channel (`insights.retention`). */
export interface RetentionChannel {
    channelId: string;
    network: string;
    name: string | null;
    state: string;
    message: string;
    since?: string;
}
/** Retention, impressions and CTR of one published item; `curve` only when collected (YouTube). */
export interface RetentionItem {
    id: string;
    network: string;
    channelId?: string | null;
    title: string | null;
    type: string | null;
    publishedAt: string;
    url: string | null;
    origin: string;
    views: number | null;
    reach: number | null;
    impressions: number | null;
    ctr: number | null;
    avgViewPercentage: number | null;
    avgWatchTimeSec: number | null;
    watchTimeMin: number | null;
    skipRate?: number | null;
    retention: {
        state: string;
        source: string;
        message?: string;
        collectedAt?: string;
        points?: number;
    };
    curve?: {
        position: number;
        watched: number;
        relative: number;
    }[];
}
export interface RetentionResponse {
    channels: RetentionChannel[];
    collection: {
        last: string | null;
    };
    items: RetentionItem[];
    period: {
        from: string;
        to: string;
    };
    total: number;
}
export interface RetentionItemResponse {
    item?: RetentionItem;
    channels: RetentionChannel[];
}
/** Totals of a period in `insights.get` (`cards` and `cards.previous`). */
export interface InsightsTotals {
    posts: number;
    followers: number | null;
    followersChange: number | null;
    followersGained: number | null;
    reactions: number;
    comments: number;
    engagement: number | null;
    overallEngagement: number | null;
    views: number;
    shares: number | null;
    saves: number | null;
    reach: number | null;
    watchTimeMin: number | null;
    avgWatchTimeSec: number | null;
}
/** One post row in `insights.get` → `posts.items`. */
export interface InsightsPost {
    id: string;
    network: string;
    channelId?: string | null;
    title?: string | null;
    type: string | null;
    publishedAt: string;
    url: string | null;
    thumb: string | null;
    thumbType: string | null;
    reactions: number;
    comments: number;
    views: number;
    shares: number | null;
    saves: number | null;
    reach: number | null;
    watchTimeMin: number | null;
    avgWatchTimeSec: number | null;
    engagement: number | null;
    noMetrics: boolean;
    origin?: string;
}
export interface InsightsPostsPage {
    total: number;
    page: number;
    limit: number;
    sort: string;
    direction: string;
    items: InsightsPost[];
}
export interface InsightsResponse {
    period: {
        from: string;
        to: string;
    };
    previousPeriod: {
        from: string;
        to: string;
    };
    channels: {
        network: string;
        id?: string;
        name: string | null;
        avatar: string;
        posts: number;
        reactions: number;
        comments: number;
        views: number;
        engagement: number | null;
        shares: number | null;
        saves: number | null;
        reach: number | null;
        watchTimeMin: number | null;
        avgWatchTimeSec: number | null;
    }[];
    cards: InsightsTotals & {
        previous: InsightsTotals;
        change: Record<string, {
            absolute: number;
            pct: number | null;
        } | null>;
    };
    collection: {
        last: string | null;
        postsWithMetrics: number;
        postsWithoutMetrics: number;
        collecting: boolean;
        storedReadings: number;
        imported: number;
        lastImport: string | null;
    };
    filters: {
        channel: string | null;
        type: string | null;
        tag: string | null;
    };
    sources: {
        current: Record<string, string>;
        previous: Record<string, string>;
    };
    /** `source`: `current`, `milestone48h` or `no-data`. */
    reading48h: {
        postId?: string;
        itemId: string;
        title: string | null;
        network: string;
        publishedAt: string;
        views: number | null;
        likes: number | null;
        comments: number | null;
        followersGained: number | null;
        source: string;
        url?: string;
    }[];
    reading48hText: string;
    summary: {
        title: string;
        text: string;
        action?: string;
    }[];
    posts?: InsightsPostsPage;
    previousPosts?: InsightsPostsPage;
    topPosts: {
        title?: string | null;
        network: string;
        type: string | null;
        publishedAt: string;
        reactions: number;
        comments: number;
        views: number;
        engagement: number | null;
        url?: string;
        thumb: string | null;
        thumbType: string | null;
        noMetrics: boolean;
    }[];
}
export interface MediaApi {
    create(meta: {
        type: MediaType;
        name: string;
        mime: string;
        size: number;
        simple?: boolean;
        sha256?: string;
    }, o?: CallOptions): Promise<{
        id: string;
        minPartSize?: number;
        maxPartSize?: number;
        suggestedPartSize?: number;
    }>;
    uploadPart(id: string, n: number, bytes: Uint8Array): Promise<MediaPart>;
    uploadContent(id: string, bytes: Uint8Array): Promise<Media>;
    complete(id: string, o?: CallOptions): Promise<Media>;
    get(id: string): Promise<Media>;
    list(type?: string): Promise<{
        media: Media[];
    }>;
    remove(id: string): Promise<{
        removed: string;
    }>;
    /** Uploads a whole file (one PUT or parts, depending on size). Returns the ready media. */
    upload(source: Source, o: {
        type: MediaType;
        name: string;
        mime: string;
        part?: number;
        onProgress?: (done: number, total: number) => void;
    }): Promise<Media>;
}
export interface PostsApi {
    /** `o.idempotencyKey`: a string (or `true` for a fresh UUID) makes the call safe to retry: the server replays the first response instead of creating a second post. */
    create(p: PostRequest, o?: CallOptions): Promise<{
        id: string;
        items: Item[];
    }>;
    list(f?: {
        state?: string;
        channel?: string;
        tag?: string;
        limit?: number;
        offset?: number;
    }): Promise<{
        total: number;
        posts: Post[];
    }>;
    get(id: string): Promise<Post & {
        actions: PostAction[];
    }>;
    update(id: string, changes: Record<string, unknown>, o?: CallOptions): Promise<Post>;
    publishNow(id: string, o?: {
        network?: Network;
        idempotencyKey?: string | true;
    }): Promise<Post>;
    /** `o.dismiss`: also takes off the queue what only waits for the owner (private YouTube video, TikTok draft); `o.deleteVideo` (with `dismiss`): also deletes the PRIVATE YouTube video. `o.deleteRemote`: also deletes the already published post on Bluesky, LinkedIn or Mastodon. Sent as the query `dismiss=true`, `delete_video=true` and `delete_remote=true`. */
    cancel(id: string, o?: CallOptions & {
        dismiss?: boolean;
        deleteVideo?: boolean;
        deleteRemote?: boolean;
    }): Promise<{
        id: string;
        canceled: string[];
        kept: Item[];
    }>;
    scheduleYoutube(id: string, scheduledFor: string, o?: CallOptions): Promise<{
        id: string;
        url: string;
        publishAt: string;
        privacy: "private";
        changed: boolean;
    }>;
    /** Releases the item's saved comment now: `alreadyDone` (it was already published), `inProgress`, or the network's `result`. */
    comment(id: string, itemId: string): Promise<{
        alreadyDone?: boolean;
        inProgress?: boolean;
        result?: unknown;
    }>;
    /** Takes a failed (`error`) or already canceled item off the calendar (it becomes `canceled`; the post becomes `canceled` if no active item is left). Sent, scheduled, in-progress and draft items are refused with `item_not_removable` (409). Returns the post. */
    dismissItem(id: string, itemId: string, o?: CallOptions): Promise<Post>;
    /**
     * Sends a TikTok draft that already reached the app inbox to the inbox AGAIN (a new notification for the same video). Returns the post; the send runs in the background
     * (`item.resend.inProgress`) and every send is listed in `item.deliveries`. Errors: `not_resendable` (422), `already_posted`, `resend_in_progress`, `channel_not_connected` (409),
     * `resend_limit_reached` (429, 3 per item in 24 h). TikTok's own limit (5 pending sends per 24 h) shows up later as `item.resend.error.code = "tiktok_pending_limit"`.
     */
    resend(id: string, itemId: string, o?: CallOptions): Promise<Post>;
}
export interface ChannelsApi {
    /** The server answers `accountRemoved: true` (docs/api-contract.md: `removido` → `accountRemoved`); this type said `removed` until 16/11/2026. */
    remove(channel: string): Promise<{
        network: Network;
        channel: string;
        accountRemoved: true;
    }>;
    setDefault(channel: string): Promise<{
        network: Network;
        channel: string;
        default: true;
    }>;
    list(o?: {
        verify?: boolean;
    }): Promise<{
        channels: Channel[];
    }>;
    slots(network: Network, o?: {
        channel?: string;
    }): Promise<{
        network: Network;
        timezone: string;
        slots: Slot[];
    }>;
    setSlots(network: Network, slots: (string | {
        day: string | number;
        time: string;
    })[], o?: {
        timezone?: string;
        channel?: string;
    }): Promise<{
        network: Network;
        timezone: string;
        slots: Slot[];
        rescheduled: RescheduledItem[];
    }>;
    setFollowers(network: Network, value: number, o?: {
        day?: string;
        channel?: string;
    }): Promise<{
        network: Network;
        day: string;
        followers: number;
        source: string;
    }>;
    followers(network: Network, o?: {
        channel?: string;
    }): Promise<{
        network: Network;
        records: {
            day: string; /** `null` when the day has a record without a value. */
            followers: number | null;
            source: string;
        }[];
    }>;
    connect(network: Network | "meta", o?: {
        replace?: boolean;
        add?: boolean;
        instagram?: string;
        instagramId?: string;
        probe?: boolean;
    }): Promise<{
        url: string;
        redirect: string;
        expiresAt: string;
        warning?: string;
    }>;
    /** `revokedAtTiktok` only comes for TikTok (YouTube: `revokedAtGoogle`); `newDefault` when another account became the default. */
    disconnect(network: Network, o?: {
        channel?: string;
    }): Promise<{
        network: Network;
        channel?: string;
        disconnected: boolean;
        revokedAtTiktok?: boolean;
        revokedAtGoogle?: boolean;
        revocationSkipped?: boolean;
        newDefault?: string; /** YouTube: the data that came from YouTube was deleted. */
        dataDeleted?: boolean;
    }>;
    sendInstagramToken(body: {
        token: string;
        userId: string;
        username?: string;
        type?: string;
        host?: string;
    }): Promise<{
        connected: boolean;
        username: string | null;
        followers: number | null;
        mediaItems: number | null;
        host: string;
    }>;
}
/** What the connected TikTok account accepts now (creator_info). `allowedPrivacyLevels` is only `SELF_ONLY` until TikTok audits the app (`appAudited`). */
export interface TiktokCreator {
    connected: true;
    name: string | null;
    username: string | null;
    avatar?: string;
    privacyLevels: string[];
    allowedPrivacyLevels: string[];
    appAudited: boolean;
    directAvailable: boolean;
    maxDurationSec: number | null;
    commentsDisabled: boolean;
    duetDisabled: boolean;
    stitchDisabled: boolean;
    queriedAt: string;
}
export interface TiktokApi {
    creator(o?: {
        channel?: string;
    }): Promise<TiktokCreator>;
}
export interface InstagramApi {
    media(o?: {
        max?: number;
        page?: string;
    }): Promise<{
        mediaItems: InstagramMediaItem[];
        next: string | null;
    }>;
    comments(o?: {
        media?: string;
        unanswered?: boolean;
        sort?: string;
        max?: number;
        page?: string;
    }): Promise<{
        comments: InstagramThread[];
        mediaItems: {
            id: string;
            pending: number;
            [k: string]: unknown;
        }[];
        sort: string;
        pending: number;
        next?: string | null;
    }>;
    reply(id: string, text: string, o?: CallOptions): Promise<CommentReply>;
    hide(id: string, hide?: boolean): Promise<{
        id: string;
        hidden: boolean;
        ok: boolean;
    }>;
    resolve(id: string): Promise<CommentResolved>;
    reopen(id: string): Promise<CommentResolved>;
}
/** `comments`/`mediaItems` mix YouTube threads and Instagram comments (each with its `network`); `errors` holds the networks that failed, by network or channel. */
export interface CommunityApi {
    comments(o?: {
        network?: "all" | Network;
        unanswered?: boolean;
        sort?: string;
        max?: number;
        refresh?: boolean; /** Only conversations with activity (the comment or any reply) at or after this ISO-8601 time. */
        since?: string;
    }): Promise<{
        comments: (YoutubeThread | InstagramThread | Record<string, unknown>)[];
        mediaItems: Record<string, unknown>[];
        errors: Record<string, CommunityError>;
        pending: number;
        pendingByNetwork: Record<string, number>;
        pendingByChannel: Record<string, number>;
    }>;
}
export interface YoutubeApi {
    listVideos(o?: {
        max?: number;
        page?: string;
    }): Promise<{
        videos: YoutubeVideo[];
        next?: string | null;
    }>;
    getVideo(id: string): Promise<{
        video: YoutubeVideo;
    }>;
    editVideo(id: string, o?: {
        title?: string;
        description?: string;
        tags?: string[];
        dryRun?: boolean;
    }): Promise<{
        id: string;
        before: YoutubeSnippet;
        after: YoutubeSnippet;
        changed: boolean;
        written?: boolean;
        url?: string;
    }>;
    comments(o?: {
        video?: string;
        unanswered?: boolean;
        sort?: string;
        max?: number;
        page?: string;
    }): Promise<{
        comments: YoutubeThread[];
        next?: string | null;
        pending: number;
        sort: string;
    }>;
    resolve(threadId: string): Promise<CommentResolved>;
    reopen(threadId: string): Promise<CommentResolved>;
    reply(threadId: string, text: string, o?: CallOptions): Promise<CommentReply>;
}
export interface InsightsApi {
    get(o?: {
        from?: string;
        to?: string;
        channel?: string;
        tag?: string;
        type?: string;
        compare?: boolean;
        sort?: string;
        direction?: string;
        page?: number;
        limit?: number;
    }): Promise<InsightsResponse>;
    import(o?: {
        network?: "all" | Network;
        dryRun?: boolean;
    }): Promise<{
        imported: InsightsImportResult[];
    }>;
}
export interface ContentApi {
    list(o?: {
        network?: string;
        type?: string;
        from?: string;
        to?: string;
        sort?: string;
        limit?: number;
        offset?: number;
    }): Promise<{
        total: number;
        items: ContentItem[];
    }>;
}
export interface ApiKeysApi {
    list(): Promise<{
        keys: ApiKeyInfo[];
    }>;
    create(name: string, scope?: Scope, expiresInDays?: number, o?: CallOptions): Promise<{
        id: string;
        key: string;
        scope: Scope;
    }>;
    revoke(id: string): Promise<{
        revoked: string;
    }>;
}
export interface UsageApi {
    get(o?: {
        days?: number;
    }): Promise<{
        days: number;
        period: {
            from: string;
            to: string;
        };
        total: number;
        succeeded: number;
        errors: number;
        p95Ms: number | null;
        peakPerMinute: number;
        limitPerMinute: number;
        byDay: {
            day: string;
            total: number;
            errors: number;
        }[];
        byHour?: {
            start: string;
            total: number;
            errors: number;
        }[];
        byKey: {
            id: string;
            name: string;
            total: number;
            errors: number;
            lastAt: string;
        }[];
        youtubeQuota: {
            plan: string;
            day: string;
            resetsInSeconds: number;
            units: {
                used: number;
                limit: number | null;
                remaining: number | null;
            };
            uploads: {
                limitPerChannel: number | null;
            };
            byChannel: {
                channelId: string;
                units: number;
                uploads: number;
            }[];
            bySource: {
                origin: "usuario" | "publicar" | "sync" | "verificar";
                units: number;
                byChannel: {
                    channelId: string;
                    units: number;
                }[];
            }[];
            userReserve: {
                limit: number | null;
                remaining: number | null;
            };
        };
    }>;
    log(o?: {
        key?: string;
        status?: string | number;
        route?: string;
        method?: string;
        days?: number;
        limit?: number;
        cursor?: string;
    }): Promise<{
        records: {
            id: string;
            method: string;
            route: string;
            status: number;
            durationMs: number;
            key: string;
            keyName: string;
            createdAt: string;
        }[];
        next: string | null;
    }>;
}
export interface PreferencesApi {
    get(): Promise<Preferences>;
    put(changes: {
        theme?: PreferenceTheme;
        language?: PreferenceLanguage;
        notifications?: {
            [E in NotificationEvent]?: Partial<NotificationChannels>;
        };
    }): Promise<Preferences>;
}
export interface NotificationsApi {
    list(o?: {
        unread?: boolean;
        limit?: number;
        cursor?: string;
    }): Promise<{
        notifications: PanelNotification[];
        unreadCount: number;
        next?: string;
    }>;
    markRead(o: {
        ids?: string[];
        all?: boolean;
    }): Promise<{
        marked: number;
        unreadCount: number;
    }>;
}
/** Counters by network (`byNetwork`, keyed by network) and by channel (`byChannel`, keyed by channel id). */
export interface BootstrapCount {
    total?: number;
    unanswered?: number;
    byNetwork: Record<string, number>;
    byChannel: Record<string, number>;
}
/** GET /v1/bootstrap: one snapshot to open the dashboard. Each section is the body of its own route; `version` is the ETag without `W/""`. */
export interface BootstrapResponse {
    /** `null` while the server has no version counter (migration 0062 not applied): no ETag, always a full answer. */
    version: string | null;
    /** The body of GET /v1/session; `null` with an API key. */
    session: {
        email: string;
        name: string | null;
        avatar: string | null;
        role: string;
        scope: string;
        workspace: {
            id: string;
            name: string;
        };
        platformAdmin: boolean;
        expiresAt: string;
        language: {
            saved: PreferenceLanguage | null;
            waitlist: PreferenceLanguage | null;
        };
        reviewAccount?: {
            expiresAt: string | null;
            platform: string | null;
        };
    } | null;
    /** The body of GET /v1/workspaces; `null` with an API key. */
    workspaces: {
        workspaces: {
            id: string;
            name: string;
            role: string;
            current: boolean;
        }[];
    } | null;
    /** The body of GET /v1/channels (read from the stored profile, never from the network). */
    channels: {
        channels: Channel[];
    };
    /** The first page (20) of GET /v1/notifications. */
    notifications: {
        notifications: PanelNotification[];
        unreadCount: number;
        next?: string;
    };
    preferences: Preferences;
    /** The plan summary of GET /v1/billing (without usage, slots and the plan catalog). */
    billing: Record<string, unknown>;
    /** The security summary of the signed-in person: the body of GET /v1/account plus `sessions` (only `current`, `createdAt` and `lastUsedAt`; the full list stays in GET /v1/account/sessions). Optional: absent on servers before phase 6b; `null` with an API key. */
    account?: {
        email: string;
        name: string | null;
        avatar: string | null;
        role: string;
        workspace: {
            id: string;
            name: string;
        };
        platformAdmin: boolean;
        createdAt: string;
        deletionRequestedAt: string | null;
        reviewAccount?: {
            expiresAt: string | null;
            platform: string | null;
        };
        mfa: {
            totp: boolean;
            required: boolean;
            recoveryCodesLeft: number;
        };
        passkeys: number;
        sessions: {
            current: boolean;
            createdAt: string;
            lastUsedAt: string | null;
        }[];
    } | null;
    /** The body of GET /v1/account/onboarding; `null` with an API key. */
    onboarding: {
        publishTo: string[] | null;
        updatedAt: string | null;
        guide: Record<string, unknown> | null;
    } | null;
    counters: {
        /** Unanswered comments from the stored copy; `null` while the comment copy is switched off. */
        comments: {
            unanswered: number;
            byNetwork: Record<string, number>;
            byChannel: Record<string, number>;
        } | null;
        /** Destinations scheduled, running or failed (the dashboard queue). */
        queue: {
            total: number;
            byNetwork: Record<string, number>;
            byChannel: Record<string, number>;
        };
    };
}
export interface BootstrapApi {
    get(): Promise<BootstrapResponse>;
}
export interface WebhooksApi {
    list(): Promise<{
        webhooks: Webhook[];
        events: WebhookEvent[];
    }>;
    create(o: {
        url: string;
        events?: WebhookEvent[];
        active?: boolean;
        idempotencyKey?: string | true;
    }): Promise<Webhook & {
        secret: string;
        warning: string;
    }>;
    get(id: string): Promise<Webhook>;
    update(id: string, o: {
        url?: string;
        events?: WebhookEvent[];
        active?: boolean;
    }): Promise<Webhook>;
    remove(id: string): Promise<{
        deleted: string;
    }>;
    /** Sends a ping.test now and returns { delivery }. */
    test(id: string): Promise<{
        delivery: WebhookDelivery;
    }>;
    deliveries(id: string, o?: {
        limit?: number;
    }): Promise<{
        deliveries: WebhookDelivery[];
    }>;
    redeliver(id: string, deliveryId: string, o?: CallOptions): Promise<{
        delivery: WebhookDelivery;
    }>;
    rotateSecret(id: string, o?: CallOptions): Promise<{
        id: string;
        secret: string;
        secretHint: string;
        warning: string;
    }>;
}
export interface IdeasApi {
    list(): Promise<{
        ideas: Idea[];
        total: number;
    }>;
    create(o: {
        title: string;
        note?: string;
        group?: IdeaGroup;
        tags?: string[];
        idempotencyKey?: string | true;
    }): Promise<Idea>;
    update(id: string, o: {
        title?: string;
        note?: string;
        group?: IdeaGroup;
        tags?: string[];
    }): Promise<Idea>;
    remove(id: string): Promise<{
        deleted: string;
    }>;
    import(ideas: {
        id?: string;
        title: string;
        note?: string;
        group?: IdeaGroup;
        tags?: string[];
        createdAt?: string;
    }[], o?: CallOptions): Promise<{
        imported: number;
        skippedCount: number;
    }>;
}
export interface LegacyMidiaApi {
    iniciar(meta: Record<string, unknown>): Promise<any>;
    enviarParte(id: string, n: number, bytes: Uint8Array): Promise<any>;
    enviarConteudo(id: string, bytes: Uint8Array): Promise<any>;
    completar(id: string): Promise<any>;
    obter(id: string): Promise<any>;
    listar(tipo?: string): Promise<any>;
    remover(id: string): Promise<any>;
    enviar(origem: Source, o: {
        tipo: "video" | "capa";
        nome: string;
        mime: string;
        parte?: number;
        aoProgredir?: (feito: number, total: number) => void;
    }): Promise<any>;
}
export interface LegacyCanaisApi {
    listar(o?: {
        verificar?: boolean;
    }): Promise<any>;
    vagas(rede: Network): Promise<any>;
    definirVagas(rede: Network, vagas: unknown[], o?: {
        fuso?: string;
    }): Promise<any>;
    informarSeguidores(rede: Network, valor: number, o?: {
        dia?: string;
    }): Promise<any>;
    seguidores(rede: Network): Promise<any>;
    conectar(rede: Network): Promise<any>;
    desconectar(rede: Network): Promise<any>;
    enviarTokenInstagram(corpo: Record<string, unknown>): Promise<any>;
}
export interface LegacyChavesApi {
    listar(): Promise<any>;
    criar(nome: string, escopo?: "leitura" | "escrita" | "admin"): Promise<any>;
    revogar(id: string): Promise<any>;
}
export interface LegacyComunidadeApi {
    comentarios(o?: Record<string, unknown>): Promise<any>;
}
export interface LegacyConteudoApi {
    listar(o?: Record<string, unknown>): Promise<any>;
}
export interface LegacyInstagram {
    midias(o?: Record<string, unknown>): Promise<any>; /** @deprecated */
    comentarios(o?: Record<string, unknown>): Promise<any>; /** @deprecated */
    responder(id: string, texto: string): Promise<any>; /** @deprecated */
    ocultar(id: string, ocultar?: boolean): Promise<any>; /** @deprecated */
    resolver(id: string): Promise<any>; /** @deprecated */
    reabrir(id: string): Promise<any>;
}
export interface LegacyYoutube {
    videos(o?: {
        max?: number;
        pagina?: string;
    }): Promise<any>; /** @deprecated */
    lerVideo(id: string): Promise<any>; /** @deprecated */
    editarVideo(id: string, o?: Record<string, unknown>): Promise<any>; /** @deprecated */
    comentarios(o?: Record<string, unknown>): Promise<any>; /** @deprecated */
    resolver(id: string): Promise<any>; /** @deprecated */
    reabrir(id: string): Promise<any>; /** @deprecated */
    responder(id: string, texto: string): Promise<any>;
}
export interface LegacyInsights {
    obter(o?: Record<string, unknown>): Promise<any>; /** @deprecated use import */
    importar(o?: Record<string, unknown>): Promise<any>;
}
export interface LegacyPosts {
    criar(p: Record<string, unknown>): Promise<any>; /** @deprecated */
    listar(f?: Record<string, unknown>): Promise<any>; /** @deprecated */
    obter(id: string): Promise<any>; /** @deprecated */
    editar(id: string, m: Record<string, unknown>): Promise<any>; /** @deprecated */
    publicarAgora(id: string, o?: {
        rede?: Network;
    }): Promise<any>; /** @deprecated */
    cancelar(id: string): Promise<any>; /** @deprecated */
    agendarYoutube(id: string, quando: string): Promise<any>; /** @deprecated */
    comentar(id: string, itemId: string): Promise<any>;
}
export {};

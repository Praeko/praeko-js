// Shared shapes. `Brand` is brand.json and `Publication` is an episode's publication.json (English keys only).
export type NetworkName = "youtube" | "instagram" | "tiktok";
export type Hashtags = Partial<Record<NetworkName, string[]>>;

/** Per-network options (brand.publishing.<network>, also copied into queue items as `options`). */
export interface NetworkOptions {
  mode?: string; privacy?: string; categoryId?: string | number; notifySubscribers?: boolean; thumbnailMs?: number; comment?: boolean;
  audited?: boolean; coverMs?: number; disableDuet?: boolean; disableStitch?: boolean; disableComments?: boolean; maxWaitMs?: number;
  intervalMs?: number; version?: string; channels?: Record<string, string>; syntheticContent?: boolean; aiContent?: boolean; ai?: boolean;
  chunkMB?: number; tags?: string[]; via?: string; url?: string; frameMs?: number; firstComment?: boolean; language?: string;
}
export interface Hosting { type?: string; bucket?: string; baseUrl?: string }
export interface PraekoSettings { url?: string; channels?: Partial<Record<NetworkName, string>>; instagram?: NetworkOptions; tiktok?: NetworkOptions }
export interface AiTicPattern { regex: string; message: string }
export interface Brand {
  /** `praeko studio review`: extra phrases the pieces must never contain (the prohibitions section of playbook.md is read too). */
  review?: { forbiddenPhrases?: string[] };
  name?: string; handle?: string; signature?: string; links?: Record<string, string>; linkLabel?: string; bannedNames?: string[];
  pronunciation?: Record<string, string>; captionFixes?: Record<string, string>; voice?: unknown; publicDir?: string; engine?: string;
  publishing?: {
    provider?: string; hashtags?: { allowed?: string[]; banned?: string[] }; limits?: Partial<Limits>; aiTics?: boolean; aiTicPatterns?: AiTicPattern[];
    timezoneOffset?: string; folder?: string; hosting?: Hosting; utm?: Partial<Record<NetworkName, [string, string]>>; labels?: Partial<Labels>;
    youtube?: NetworkOptions; instagram?: NetworkOptions; tiktok?: NetworkOptions; praeko?: PraekoSettings;
    buffer?: NetworkOptions & { channels?: Record<string, string>; youtube?: NetworkOptions };
    networks?: string[]; channels?: Record<string, string>;
  };
}
export interface Limits { youtubeTitle: number; youtubeDescription: number; instagram: number; tiktok: number; hashtagsInstagram: number }
export interface Labels { chapters: string; article: string; fullVideo: string }
/** One image of an image piece: the JPEG file (relative to out/ or absolute) and its alternative text. */
export interface ImageEntry { file: string; alt?: string }
export interface Chapter { t: number; title: string }
export interface Publication {
  name?: string; date?: string; title?: string; alternatives?: string[]; format?: string; files?: { video?: string; cover?: string; verticalCover?: string };
  /** `image` = a photo post (Instagram, one image); `carousel` = 2 to 20 images in order (Instagram); `video` (default) = everything else. Image and carousel pieces also carry `images` (written by `package`, in slide order). */
  kind?: "video" | "image" | "carousel"; images?: ImageEntry[];
  beforePublishing?: string[]; ai?: { synthetic?: boolean }; yt?: { description?: string; pinnedComment?: string };
  ig?: { caption?: string; pinnedComment?: string }; tiktok?: { caption?: string }; hashtags?: Hashtags; facts?: string[]; chapters?: Chapter[];
  fullVideo?: string; article?: string; commentReply?: string; campaign?: string; publishOn?: string;
}
export interface NetworkTexts { title?: string; text: string; pinnedComment?: string }
export type Texts = Record<NetworkName, NetworkTexts>;

/** Context the queue hands to providers. Everything that touches network, disk or clock is injectable. */
export interface Ctx {
  brand?: Brand; root?: string; fetchFn: typeof fetch; log: (...a: any[]) => void; now?: () => Date;
  secrets: { get: (ref: string) => string | null | undefined; set: (ref: string, value: string) => unknown };
  host?: (file: string, slug?: string) => Promise<{ url: string; key: string }>;
  removeHosted?: (key: string) => Promise<unknown>;
  [k: string]: any;
}
export type QueueState = "pending" | "prepared" | "sent" | "error" | "cancelled";
export interface QueueItem {
  id: string; state: QueueState; attempts: number; createdAt: string; slug: string; network: NetworkName; provider: string; when: string;
  video: string; cover?: string | null; texts: NetworkTexts; options?: NetworkOptions & Record<string, any>; prep?: any; result?: any;
  error?: string; sentAt?: string; cancelledAt?: string; title?: string;
}
export interface Queue { items: QueueItem[] }
/** A direct provider module (youtube, instagram, tiktok). */
export interface Provider {
  name: string; network: string; immediate?: boolean; leadMs?: number;
  connect(a: { ctx: Ctx; args?: string[] }): Promise<number | void>;
  status(a: { ctx: Ctx }): Promise<{ connected: boolean; detail?: string }>;
  prepare?(a: { item: QueueItem; ctx: Ctx }): Promise<any>;
  publish(a: { item: QueueItem; ctx: Ctx }): Promise<any>;
  plan?(a: { item: QueueItem; ctx: Ctx }): Promise<string[]>;
}

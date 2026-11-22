// Time parsing and network names shared by the providers.
import type { NetworkName } from "./types.ts";

export const NETWORKS: Record<string, NetworkName> = { yt: "youtube", youtube: "youtube", ig: "instagram", instagram: "instagram", tt: "tiktok", tiktok: "tiktok" };


/** "06/11 17:30" | "06/11/2026 17:30" | "2026-11-06T17:30" | ISO with offset → ISO UTC. `offset` defaults to "-03:00" (Brazil has had no daylight saving time since 2019). */
export function parseWhen(text: string, { offset = "-03:00", now = new Date() }: { offset?: string; now?: Date } = {}): string {
  const s = String(text).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?[ T]+(\d{1,2}):(\d{2})$/);
  let iso: string;
  if (m) {
    const year = m[3] ? +m[3] : now.getFullYear();
    const mk = (y: number) => `${y}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}T${String(m[4]).padStart(2, "0")}:${m[5]}:00${offset}`;
    iso = mk(year);
    if (!m[3] && new Date(iso) < now) iso = mk(year + 1); // no year and already past: next year
  } else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(s)) iso = s.replace(" ", "T") + (s.length === 16 ? ":00" : "") + offset;
  else if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/.test(s)) iso = s;
  else throw new Error(`invalid date: "${text}" (use "06/11 17:30", "06/11/2026 17:30" or "2026-11-06T17:30")`);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid date: "${text}"`);
  return d.toISOString();
}

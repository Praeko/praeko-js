// The publishing queue itself (replaces Buffer step by step). One JSON file per project: <root>/.praeko-studio/queue.json .
// States: pending → (prepared) → sent | error | cancelled.
// Each item has a `provider` (youtube, instagram, tiktok). The runner is idempotent: it runs from time to time (launchd) and only acts on what is due; what was already sent is never sent again.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import type { Ctx, Provider, Queue, QueueItem } from "./types.ts";

export const MAX_ATTEMPTS = 3;
export const queueFile = (root: string): string => join(root, ".praeko-studio", "queue.json");
export function readQueue(root: string): Queue {
  const f = queueFile(root);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : { items: [] };
}
export function saveQueue(root: string, queue: Queue): void {
  const f = queueFile(root);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f + ".tmp", JSON.stringify(queue, null, 2) + "\n");
  renameSync(f + ".tmp", f); // atomic swap: an interrupted runner never leaves a half-written file
}

/** Puts an item in the queue. `item`: { slug, provider, network, when (ISO), video, cover?, texts, options? }. */
export type NewItem = Omit<QueueItem, "id" | "state" | "attempts" | "createdAt"> & Partial<Pick<QueueItem, "id" | "state" | "attempts" | "createdAt">>;
export function enqueue(root: string, item: NewItem): QueueItem {
  const queue = readQueue(root);
  const it: QueueItem = { id: randomBytes(4).toString("hex"), state: "pending", attempts: 0, createdAt: new Date().toISOString(), ...item };
  queue.items.push(it);
  saveQueue(root, queue);
  return it;
}
export function cancelItem(root: string, id: string): QueueItem {
  const queue = readQueue(root), it = queue.items.find((x) => x.id === id || x.id.startsWith(id));
  if (!it) throw new Error(`item ${id} is not in the queue`);
  if (it.state === "sent") throw new Error(`item ${it.id} was already sent; undo it on the network itself`);
  it.state = "cancelled"; it.cancelledAt = new Date().toISOString();
  saveQueue(root, queue);
  return it;
}

/** Action due for an item now: "prepare" | "publish" | null (internal values). `prov.immediate`: acts as soon as it enters the queue. */
export function nextAction(it: QueueItem, prov: Pick<Provider, "immediate" | "leadMs" | "prepare">, now: Date): "prepare" | "publish" | null {
  if (!["pending", "prepared"].includes(it.state) || it.attempts >= MAX_ATTEMPTS) return null;
  const t = Date.parse(it.when), lead = prov.leadMs ?? 0;
  if (prov.immediate) return it.state === "pending" ? "publish" : null;
  if (it.state === "pending" && prov.prepare && +now >= t - lead && +now < t) return "prepare";
  if (+now >= t) return "publish";
  return null;
}

/**
 * Runs what is due. `providers`: { youtube: module, ... } (each with publish() and, optionally, prepare(), immediate, leadMs);
 * `ctx` goes to the provider. `onlyIds`: restricts to these items. `dryRun`: only says what it would do.
 */
export async function run({ root, providers, ctx, now = new Date(), dryRun = false, onlyIds = null, log = console.log }: {
  root: string; providers: Record<string, Provider>; ctx: Ctx; now?: Date; dryRun?: boolean; onlyIds?: string[] | null; log?: (m: string) => void;
}): Promise<{ done: string[]; queue: Queue }> {
  const queue = readQueue(root), done: string[] = [];
  for (const it of queue.items) {
    if (onlyIds && !onlyIds.includes(it.id)) continue;
    const prov = providers[it.provider];
    if (!prov) { if (["pending", "prepared"].includes(it.state)) log(`⚠ ${it.id}: provider "${it.provider}" not installed`); continue; }
    let action: "prepare" | "publish" | null = nextAction(it, prov, now);
    // a pending item whose preparation was already due (runner stopped) prepares and publishes in the same pass if it is due
    while (action) {
      if (dryRun) { log(`• ${it.id} ${it.network} (${it.slug}): ${action}`); break; }
      try {
        if (action === "prepare") { it.prep = await prov.prepare!({ item: it, ctx }); it.state = "prepared"; log(`✓ ${it.id} ${it.network}: prepared`); }
        else { it.result = await prov.publish({ item: it, ctx }); it.state = "sent"; it.sentAt = new Date().toISOString(); log(`✓ ${it.id} ${it.network}: sent${it.result?.url ? " " + it.result.url : ""}`); }
        done.push(it.id);
      } catch (e) {
        it.attempts++; it.error = String(e.message || e).slice(0, 500);
        if (it.attempts >= MAX_ATTEMPTS) it.state = "error";
        log(`✗ ${it.id} ${it.network}: ${it.error}${it.state === "error" ? " (giving up)" : ` (attempt ${it.attempts}/${MAX_ATTEMPTS})`}`);
      }
      saveQueue(root, queue);
      action = it.state === "sent" ? null : (action === "prepare" && it.state === "prepared" ? nextAction(it, prov, now) : null);
    }
  }
  return { done, queue };
}

/** macOS LaunchAgent: runs `praeko studio queue run` every `minutes`. Pure (returns the plist). */
export function launchdPlist({ label = "app.praeko.studio.queue", node, bin, cwd, minutes = 5, log }: { label?: string; node: string; bin: string; cwd: string; minutes?: number; log: string }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${node}</string><string>${bin}</string><string>queue</string><string>run</string></array>
<key>WorkingDirectory</key><string>${cwd}</string>
<key>StartInterval</key><integer>${minutes * 60}</integer>
<key>RunAtLoad</key><true/>
<key>StandardOutPath</key><string>${log}</string><key>StandardErrorPath</key><string>${log}</string>
</dict></plist>
`;
}

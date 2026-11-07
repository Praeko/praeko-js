import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_ATTEMPTS, cancelItem, enqueue, launchdPlist, nextAction, queueFile, readQueue, run } from "../src/queue.ts";
import type { NewItem } from "../src/queue.ts";
import type { Ctx, Provider, QueueItem } from "../src/types.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "praeko-studio-queue-"));
const fx = (o: Partial<NewItem> = {}): NewItem => ({ slug: "s", network: "instagram", provider: "instagram", when: "2026-11-06T20:30:00.000Z", video: "v.mp4", texts: { text: "t" }, ...o });
const log = () => {};
const ctx = {} as Ctx;
const prov = (p: Record<string, unknown>) => p as unknown as Provider;

test("the queue lives in .praeko-studio/queue.json", () => {
  const root = tmp();
  enqueue(root, fx());
  assert.ok(existsSync(join(root, ".praeko-studio", "queue.json")));
  assert.equal(queueFile(root), join(root, ".praeko-studio", "queue.json"));
  assert.equal(readQueue(root).items[0]!.state, "pending");
  rmSync(root, { recursive: true, force: true });
});
test("does not act before the time; prepares in the lead window; publishes on time; never sends twice", async () => {
  const root = tmp(); const calls: string[] = [];
  const p = prov({ leadMs: 10 * 60e3, prepare: async () => { calls.push("p"); return { container: "c1" }; }, publish: async ({ item }: { item: QueueItem }) => { calls.push("pub:" + item.prep.container); return { id: "m1" }; } });
  enqueue(root, fx());
  await run({ root, providers: { instagram: p }, ctx, now: new Date("2026-11-06T19:00:00Z"), log });
  assert.deepEqual(calls, []);
  await run({ root, providers: { instagram: p }, ctx, now: new Date("2026-11-06T20:25:00Z"), log });
  assert.deepEqual(calls, ["p"]); assert.equal(readQueue(root).items[0]!.state, "prepared");
  await run({ root, providers: { instagram: p }, ctx, now: new Date("2026-11-06T20:31:00Z"), log });
  assert.deepEqual(calls, ["p", "pub:c1"]); assert.equal(readQueue(root).items[0]!.state, "sent");
  await run({ root, providers: { instagram: p }, ctx, now: new Date("2026-11-07T00:00:00Z"), log });
  assert.equal(calls.length, 2, "does not send twice");
  rmSync(root, { recursive: true, force: true });
});
test("a stopped runner: an overdue item publishes right away", async () => {
  const root = tmp(); const c: string[] = [];
  const p = prov({ leadMs: 600e3, prepare: async () => { c.push("p"); return {}; }, publish: async () => { c.push("pub"); return { id: "x" }; } });
  enqueue(root, fx());
  await run({ root, providers: { instagram: p }, ctx, now: new Date("2026-11-06T22:00:00Z"), log });
  assert.deepEqual(c, ["pub"]); // overdue: publishes directly (no prepare outside the window)
  rmSync(root, { recursive: true, force: true });
});
test("immediate publishes as it enters the queue, ignoring the time", async () => {
  const root = tmp(); let n = 0;
  const p = prov({ immediate: true, publish: async () => { n++; return { id: "yt1", url: "https://youtu.be/yt1" }; } });
  const it = enqueue(root, fx({ provider: "youtube", network: "youtube" }));
  await run({ root, providers: { youtube: p }, ctx, now: new Date("2026-11-01T00:00:00Z"), onlyIds: [it.id], log });
  await run({ root, providers: { youtube: p }, ctx, now: new Date("2026-11-01T00:05:00Z"), log });
  assert.equal(n, 1); assert.equal(readQueue(root).items[0]!.result.id, "yt1");
  rmSync(root, { recursive: true, force: true });
});
test("error: retries and gives up after MAX_ATTEMPTS; cancelling prevents a run", async () => {
  const root = tmp(); let n = 0;
  const p = prov({ publish: async () => { n++; throw new Error("failed"); } });
  enqueue(root, fx());
  for (let i = 0; i < MAX_ATTEMPTS + 2; i++) await run({ root, providers: { instagram: p }, ctx, now: new Date("2026-11-07T00:00:00Z"), log });
  assert.equal(n, MAX_ATTEMPTS); assert.equal(readQueue(root).items[0]!.state, "error");
  const b = enqueue(root, fx()); cancelItem(root, b.id);
  await run({ root, providers: { instagram: p }, ctx, now: new Date("2026-11-07T00:00:00Z"), log });
  assert.equal(n, MAX_ATTEMPTS);
  assert.throws(() => cancelItem(root, "nope"), /not in the queue/);
  rmSync(root, { recursive: true, force: true });
});
test("dryRun does not call the provider; the plist carries the interval and the English command", async () => {
  const root = tmp(); let n = 0;
  enqueue(root, fx());
  await run({ root, providers: { instagram: prov({ publish: async () => { n++; } }) }, ctx, now: new Date("2026-11-07T00:00:00Z"), dryRun: true, log });
  assert.equal(n, 0);
  const plist = launchdPlist({ node: "/n", bin: "/b", cwd: "/c", minutes: 5, log: "/l" });
  assert.ok(plist.includes("<integer>300</integer>") && plist.includes("<string>queue</string><string>run</string>"));
  assert.equal(nextAction({ state: "sent", attempts: 0, when: "2026-01-01T00:00:00Z" } as QueueItem, {}, new Date()), null);
  rmSync(root, { recursive: true, force: true });
});

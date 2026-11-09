// Long tasks (voice, render, cover, package): one job runs at a time per project, a short queue waits behind it, every job has a maximum time and can be cancelled.
// The log keeps the last lines of output, masked as they arrive. Jobs run the Studio CLI with a fixed argv (see studio-cli.ts).
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { maskSecrets } from "./mask.ts";
import { UserError } from "./paths.ts";
import { startCli } from "./studio-cli.ts";
import type { RunningCli, StudioBin } from "./studio-cli.ts";

export type JobKind = "voice" | "render" | "cover" | "package";
export type JobState = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out";
export const FINAL_STATES: readonly JobState[] = ["succeeded", "failed", "cancelled", "timed_out"];
export const JOB_ID = /^job_[a-f0-9]{16}$/;

export interface Job {
  id: string; kind: JobKind; slug: string; argv: string[]; state: JobState; createdAt: string; startedAt?: string; endedAt?: string; exitCode?: number | null;
  timeoutMs: number; log: string[]; droppedLines: number; artifacts: string[]; hint?: string;
}
export type JobLimits = { maxQueue: number; keep: number; maxLogLines: number; timeoutMs: Record<JobKind, number>; killGraceMs: number };
export const DEFAULT_LIMITS: JobLimits = { maxQueue: 3, keep: 20, maxLogLines: 400, killGraceMs: 3000, timeoutMs: { voice: 10 * 60_000, render: 30 * 60_000, cover: 10 * 60_000, package: 2 * 60_000 } };

export type JobLimitsInput = Partial<Omit<JobLimits, "timeoutMs">> & { timeoutMs?: Partial<Record<JobKind, number>> };

type Internal = { job: Job; run?: RunningCli; cancelRequested?: boolean; waiters: Array<() => void> };

export class JobManager {
  private jobs = new Map<string, Internal>();
  private queue: string[] = [];
  private current: string | null = null;
  readonly limits: JobLimits;
  private readonly o: { cwd: string; bin: StudioBin; limits?: JobLimitsInput };
  constructor(o: { cwd: string; bin: StudioBin; limits?: JobLimitsInput }) {
    this.o = o;
    this.limits = { ...DEFAULT_LIMITS, ...o.limits, timeoutMs: { ...DEFAULT_LIMITS.timeoutMs, ...(o.limits?.timeoutMs ?? {}) } };
  }

  /** True while a queued or running job touches this episode. */
  busyWith(slug: string): Job | undefined { for (const { job } of this.jobs.values()) if (job.slug === slug && !FINAL_STATES.includes(job.state)) return job; }

  submit(kind: JobKind, slug: string, argv: string[], hint?: string): Job {
    const dup = [...this.jobs.values()].find(({ job }) => job.kind === kind && job.slug === slug && !FINAL_STATES.includes(job.state));
    if (dup) throw new UserError(`a ${kind} job for "${slug}" is already ${dup.job.state} (${dup.job.id}); wait for it or cancel it with studio_job`);
    if (this.queue.length >= this.limits.maxQueue) throw new UserError(`the queue is full (${this.limits.maxQueue} waiting): wait for a job to finish or cancel one with studio_job`);
    const job: Job = { id: "job_" + randomBytes(8).toString("hex"), kind, slug, argv, state: "queued", createdAt: new Date().toISOString(), timeoutMs: this.limits.timeoutMs[kind], log: [], droppedLines: 0, artifacts: [], ...(hint ? { hint } : {}) };
    this.jobs.set(job.id, { job, waiters: [] });
    this.queue.push(job.id);
    this.pump();
    return job;
  }

  get(id: string): Job | undefined { return this.jobs.get(id)?.job; }
  list(): Job[] { return [...this.jobs.values()].map((x) => x.job); }
  position(id: string): number { return this.queue.indexOf(id) + 1; }

  private pump(): void {
    if (this.current || !this.queue.length) return;
    const id = this.queue.shift()!, it = this.jobs.get(id)!;
    this.current = id;
    it.job.state = "running"; it.job.startedAt = new Date().toISOString();
    const push = (line: string): void => {
      const l = maskSecrets(line.length > 2000 ? line.slice(0, 2000) + "…" : line);
      it.job.log.push(l);
      if (it.job.log.length > this.limits.maxLogLines) { it.job.log.shift(); it.job.droppedLines++; }
    };
    try {
      it.run = startCli(this.o.bin, it.job.argv, { cwd: this.o.cwd, timeoutMs: it.job.timeoutMs, onLine: (l) => push(l) });
    } catch (e: any) { push(String(e.message)); this.finish(it, "failed", null); return; }
    void it.run.done.then((r) => {
      const state: JobState = it.cancelRequested ? "cancelled" : r.timedOut ? "timed_out" : r.code === 0 ? "succeeded" : "failed";
      if (r.timedOut) push(`stopped: the maximum time of ${Math.round(it.job.timeoutMs / 1000)} s was reached`);
      this.finish(it, state, r.code);
    });
  }

  private finish(it: Internal, state: JobState, code: number | null): void {
    it.job.state = state; it.job.exitCode = code; it.job.endedAt = new Date().toISOString();
    if (state === "succeeded") it.job.artifacts = this.artifacts(it.job);
    if (this.current === it.job.id) this.current = null;
    for (const w of it.waiters.splice(0)) w();
    const done = [...this.jobs.values()].filter((x) => FINAL_STATES.includes(x.job.state));
    for (const old of done.slice(0, Math.max(0, done.length - this.limits.keep))) this.jobs.delete(old.job.id);
    this.pump();
  }

  private artifacts(job: Job): string[] {
    const root = this.o.cwd, rel: string[] = [];
    const add = (p: string): void => { if (existsSync(join(root, p))) rel.push(p); };
    if (job.kind === "voice") { add(`episodes/${job.slug}/voice.mp3`); add(`episodes/${job.slug}/words.json`); }
    if (job.kind === "package") add(`episodes/${job.slug}/texts.md`);
    if (job.kind === "render") { add(`out/${job.slug}.mp4`); add(`out/${job.slug}.hf.mp4`); }
    if (job.kind === "render" && job.argv[0] === "slides" && existsSync(join(root, "out"))) for (const f of readdirSync(join(root, "out")).sort()) if (f.startsWith(job.slug + "-slide-") && f.endsWith(".jpg")) rel.push(`out/${f}`);
    if (job.kind === "cover" && existsSync(join(root, "out"))) for (const f of readdirSync(join(root, "out")).sort()) if (f.startsWith(job.slug + "-cover") && f.endsWith(".png")) rel.push(`out/${f}`);
    return rel;
  }

  /** Cancels a queued job at once, or asks a running one to stop (SIGTERM, then SIGKILL after the grace time). */
  cancel(id: string): Job {
    const it = this.jobs.get(id);
    if (!it) throw new UserError(`unknown job ${id}`);
    if (FINAL_STATES.includes(it.job.state)) return it.job;
    if (it.job.state === "queued") { this.queue = this.queue.filter((x) => x !== id); this.finish(it, "cancelled", null); return it.job; }
    it.cancelRequested = true;
    it.run?.kill();
    setTimeout(() => it.run?.kill(true), this.limits.killGraceMs).unref();
    return it.job;
  }

  /** Resolves when the job is final or after `ms`, whichever comes first. */
  wait(id: string, ms: number): Promise<void> {
    const it = this.jobs.get(id);
    if (!it || FINAL_STATES.includes(it.job.state) || ms <= 0) return Promise.resolve();
    return new Promise((ok) => { const t = setTimeout(ok, ms); it.waiters.push(() => { clearTimeout(t); ok(); }); });
  }

  /** Stops everything (server closing). */
  shutdown(): void {
    this.queue = [];
    for (const it of this.jobs.values()) if (!FINAL_STATES.includes(it.job.state)) { it.cancelRequested = true; it.run?.kill(true); }
  }
}

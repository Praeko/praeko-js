import test from "node:test";
import assert from "node:assert/strict";
import { FAKE_BIN, connect, fakeProject, noSecret } from "./helpers.ts";

const state = async (c: Awaited<ReturnType<typeof connect>>, jobId: string, waitSeconds = 0) => (await c.call("studio_job", { action: "status", jobId, waitSeconds })).body;

test("a job runs, logs, succeeds with a bounded log and is listed", async () => {
  const c = await connect({ project: fakeProject(), studioBin: FAKE_BIN });
  const j = await c.call("studio_package", { slug: "quick" });
  assert.ok(!j.isError, j.text);
  assert.ok(["queued", "running"].includes(j.body.state));
  const done = await state(c, j.body.jobId, 20);
  assert.equal(done.state, "succeeded");
  assert.equal(done.exitCode, 0);
  assert.match(done.log.text, /fake package quick/);
  assert.equal((await c.call("studio_job", { action: "list" })).body.jobs.length, 1);
  await c.close();
});
test("a failing job reports failed with its exit code and message", async () => {
  const c = await connect({ project: fakeProject(), studioBin: FAKE_BIN });
  const j = await c.call("studio_cover", { slug: "fails" });
  const done = await state(c, j.body.jobId, 20);
  assert.equal(done.state, "failed"); assert.equal(done.exitCode, 3); assert.match(done.log.text, /boom/);
  await c.close();
});
test("one job at a time, a short queue, no duplicates, and the queue runs in order", async () => {
  const c = await connect({ project: fakeProject(), studioBin: FAKE_BIN, limits: { maxQueue: 2 } });
  const first = await c.call("studio_render", { slug: "slow", scale: 0.5 });
  assert.equal(first.body.state, "running");
  const dup = await c.call("studio_render", { slug: "slow" });
  assert.ok(dup.isError); assert.match(dup.body.error, /already running/);
  const q1 = await c.call("studio_package", { slug: "quick" }), q2 = await c.call("studio_package", { slug: "other" });
  assert.equal(q1.body.state, "queued"); assert.equal(q1.body.queuePosition, 1); assert.equal(q2.body.queuePosition, 2);
  const full = await c.call("studio_cover", { slug: "quick" });
  assert.ok(full.isError); assert.match(full.body.error, /queue is full/);
  assert.equal(c.jobs.list().filter((j) => j.state === "running").length, 1);
  const busy = await c.call("studio_write_script", { slug: "slow", file: "script.txt", content: "x" });
  assert.ok(busy.isError); assert.match(busy.body.error, /render job running/);
  // cancelling the running one lets the queue move on
  const cancelled = await c.call("studio_job", { action: "cancel", jobId: first.body.jobId, waitSeconds: 10 });
  assert.equal(cancelled.body.state, "cancelled");
  assert.equal((await state(c, q1.body.jobId, 10)).state, "succeeded");
  assert.equal((await state(c, q2.body.jobId, 10)).state, "succeeded");
  await c.close();
});
test("cancelling a queued job removes it without ever running it", async () => {
  const c = await connect({ project: fakeProject(), studioBin: FAKE_BIN });
  const run = await c.call("studio_render", { slug: "slow" });
  const q = await c.call("studio_package", { slug: "quick" });
  const x = await c.call("studio_job", { action: "cancel", jobId: q.body.jobId });
  assert.equal(x.body.state, "cancelled"); assert.equal(x.body.startedAt, undefined);
  await c.call("studio_job", { action: "cancel", jobId: run.body.jobId, waitSeconds: 10 });
  await c.close();
});
test("the maximum time stops a job and the process is gone", async () => {
  const c = await connect({ project: fakeProject(), studioBin: FAKE_BIN, limits: { timeoutMs: { render: 700 }, killGraceMs: 500 } });
  const j = await c.call("studio_render", { slug: "slow" });
  const done = await state(c, j.body.jobId, 15);
  assert.equal(done.state, "timed_out"); assert.match(done.log.text, /maximum time/);
  assert.equal(done.timeoutSeconds, 1);
  // the next job can start: nothing is left running
  const n = await c.call("studio_package", { slug: "quick" });
  assert.equal((await state(c, n.body.jobId, 10)).state, "succeeded");
  await c.close();
});
test("the log is bounded, masked and returns only the tail asked for", async () => {
  const c = await connect({ project: fakeProject(), studioBin: FAKE_BIN, limits: { maxLogLines: 50 } });
  const j = await c.call("studio_voice", { slug: "noisy" });
  const r = await c.call("studio_job", { action: "log", jobId: j.body.jobId, tail: 5, waitSeconds: 20 });
  assert.equal(r.body.log.text.split("\n").length, 5);
  assert.match(r.body.log.text, /line 999$/);
  assert.ok(r.body.droppedLines > 900);
  const l = await c.call("studio_voice", { slug: "leaky" });
  const leaked = await c.call("studio_job", { action: "log", jobId: l.body.jobId, tail: 50, waitSeconds: 20 });
  noSecret("log", leaked.text); assert.doesNotMatch(leaked.text, /abcdefghijklmnop12345/);
  await c.close();
});
test("studio_job rejects bad ids and unknown jobs; final voice needs a preview first", async () => {
  const c = await connect({ project: fakeProject(), studioBin: FAKE_BIN });
  for (const id of ["x", "job_1", "../../etc", "job_0123456789abcdeg"]) assert.ok((await c.call("studio_job", { jobId: id })).isError, id);
  assert.ok((await c.call("studio_job", { jobId: "job_0123456789abcdef" })).isError);
  assert.ok((await c.call("studio_job", { action: "status" })).isError, "jobId required");
  const f = await c.call("studio_voice", { slug: "quick", quality: "final" });
  assert.ok(f.isError); assert.match(f.body.error, /script\.txt does not exist/); assert.equal(c.jobs.list().length, 0, "final never starts a job without a preview and a code");
  assert.ok((await c.call("studio_voice", { slug: "quick", quality: "local" })).isError);
  assert.ok((await c.call("studio_render", { slug: "quick", scale: 5 })).isError);
  assert.ok((await c.call("studio_render", { slug: "quick", engine: "x;rm" })).isError);
  assert.ok((await c.call("studio_package", { slug: "ghost" })).isError, "unknown episode");
  await c.close();
});

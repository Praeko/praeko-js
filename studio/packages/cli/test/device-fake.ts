// A fake Praeko for the sign-in by code (POST /v1/device/code and /v1/device/token, docs/device-login.md), for the login and setup tests.
// Two ways to reach it: `fetchFn` (in-process, no socket) or `serve()` (a real HTTP server on 127.0.0.1, port chosen by the system). Nothing goes to the real network.
// The token answers follow a script, one entry per poll; after the script it approves.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export const DEVICE_KEY = "praeko_" + "DevIcE9kEyNeVeRsHoWn0123456789abcdefGHIJKLm";
export type Answer = "pending" | "slow_down" | "expired" | "denied" | "invalid" | "500" | "drop" | "approve";
export type Fake = {
  codeBodies: any[]; polls: number; tokenBodies: any[];
  fetchFn: typeof fetch;
  serve: () => Promise<{ url: string; close: () => Promise<void> }>;
};

export function fakeDevice(o: { script?: Answer[]; codeStatus?: number; slowDownTo?: number; expiresIn?: number; interval?: number; key?: string } = {}): Fake {
  const script = [...(o.script ?? [])];
  const f: Fake = { codeBodies: [], polls: 0, tokenBodies: [], fetchFn: null as any, serve: null as any };
  const err = (status: number, code: string, details?: unknown) => ({ status, body: { error: { code, message: code, ...(details ? { details } : {}) } } });
  // returns null for "drop" (a network failure)
  const answer = (path: string, body: any, origin: string): { status: number; body: unknown } | null => {
    if (path === "/v1/device/code") {
      f.codeBodies.push(body);
      if (o.codeStatus) return err(o.codeStatus, o.codeStatus === 429 ? "rate_limited" : "server_error");
      return { status: 200, body: { deviceCode: "pkdc_secretdevicecode", userCode: "BCDF-GHJK", verificationUrl: `${origin}/device`, expiresIn: o.expiresIn ?? 600, interval: o.interval ?? 5, expiresAt: "2026-11-12T15:40:00.000Z" } };
    }
    if (path === "/v1/device/token") {
      f.polls++; f.tokenBodies.push(body);
      const a = script.shift() ?? "approve";
      if (a === "pending") return err(400, "authorization_pending");
      if (a === "slow_down") return err(400, "slow_down", { interval: o.slowDownTo ?? 10 });
      if (a === "expired") return err(400, "expired_token");
      if (a === "denied") return err(400, "access_denied");
      if (a === "invalid") return err(400, "invalid_grant");
      if (a === "500") return err(500, "server_error");
      if (a === "drop") return null;
      return { status: 200, body: { key: o.key ?? DEVICE_KEY, id: "key_1", name: "Studio · Test-Mac", scope: "write", prefix: "praeko_DevI", workspace: { id: "ws_1", name: "Chan" }, warning: "store this key now (keychain or a 0600 file): it is never shown again" } };
    }
    return err(404, "not_found");
  };
  f.fetchFn = (async (u: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(u)), body = init?.body ? JSON.parse(String(init.body)) : {};
    const r = answer(url.pathname, body, url.origin);
    if (!r) throw new TypeError("fetch failed");
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  f.serve = () => new Promise((ok) => {
    const srv = createServer((req, res) => {
      let data = ""; req.on("data", (d) => (data += d)); req.on("end", () => {
        const port = (srv.address() as AddressInfo).port;
        const r = req.method === "POST" ? answer(new URL(req.url!, "http://x").pathname, data ? JSON.parse(data) : {}, `http://127.0.0.1:${port}`) : { status: 405, body: {} };
        if (!r) { req.socket.destroy(); return; }
        res.writeHead(r.status, { "content-type": "application/json" }); res.end(JSON.stringify(r.body));
      });
    });
    srv.listen(0, "127.0.0.1", () => ok({ url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`, close: () => new Promise<void>((done) => { srv.closeAllConnections(); srv.close(() => done()); }) }));
  });
  return f;
}

/** A virtual clock: `sleep` advances it at once (and still honors the abort signal); `waits` lists every sleep in ms. */
export function virtualClock(start = Date.parse("2026-11-12T15:30:00Z")) {
  let t = start; const waits: number[] = [];
  return {
    waits, now: () => t,
    sleep: async (ms: number, signal: AbortSignal) => { if (signal.aborted) throw new Error("cancelled"); waits.push(ms); t += ms; await Promise.resolve(); if (signal.aborted) throw new Error("cancelled"); },
  };
}

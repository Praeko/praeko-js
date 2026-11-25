// Login por código (RFC 8628; docs/device-login.md), sem chave: o CLI pede um código, a pessoa aprova em `/device` com o painel logado e o CLI recebe uma
// chave de API de escrita, uma única vez. Funções soltas (não precisam de `new Praeko`, que exige chave) para o `praeko studio login`/`setup` e outros CLIs.
//   const { userCode, verificationUrl } = await startDeviceLogin({ url, computerName: os.hostname(), os: process.platform });
//   const token = await waitForDeviceLogin({ url, deviceCode, interval });   // { key, name, scope: "write", workspace }
// A chave volta só no retorno: não registre, não imprima, não mande para log nem para o agente; guarde no cofre do sistema ou num arquivo 0600.
import { DEVICE } from "./contract.js";
import { PraekoError } from "./index.js";
const base = (url) => { if (!url)
    throw new Error("Praeko: missing service url"); return String(url).replace(/\/+$/, ""); };
async function post(o, path, body) {
    const f = o.fetch ?? globalThis.fetch;
    let r;
    try {
        r = await f(`${base(o.url)}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-praeko-contract": "en" }, body: JSON.stringify(body) });
    }
    catch (e) {
        throw new PraekoError(0, "network", `network failure: ${e.message}`);
    }
    const txt = await r.text();
    let j = null;
    try {
        j = txt ? JSON.parse(txt) : null;
    }
    catch { /* não é JSON */ }
    if (r.ok)
        return j;
    const e = j?.error;
    throw new PraekoError(r.status, e?.code || "http_error", e?.message || `HTTP ${r.status}`, e?.details);
}
const dormir = (ms, signal) => new Promise((ok, nao) => {
    if (signal?.aborted)
        return nao(signal.reason ?? new Error("aborted"));
    const t = setTimeout(() => { signal?.removeEventListener("abort", parar); ok(); }, ms);
    const parar = () => { clearTimeout(t); nao(signal.reason ?? new Error("aborted")); };
    signal?.addEventListener("abort", parar, { once: true });
});
/** POST /v1/device/code: pede um código. Mostre `userCode` e `verificationUrl` à pessoa (nunca o `deviceCode`). */
export function startDeviceLogin({ computerName, os, ...o }) {
    return post(o, "/v1/device/code", { ...(computerName ? { computerName } : {}), ...(os ? { os } : {}) });
}
/** POST /v1/device/token, UMA consulta. Lança PraekoError com `code` = authorization_pending | slow_down | expired_token | access_denied | invalid_grant enquanto não há chave. */
export function pollDeviceToken({ deviceCode, ...o }) {
    return post(o, "/v1/device/token", { deviceCode });
}
/**
 * Consulta até a pessoa decidir, respeitando `interval` (e somando 5 s a cada slow_down). Devolve a chave; lança PraekoError `access_denied`, `expired_token`
 * ou `invalid_grant` quando não há mais o que esperar (e `expired_token` também se `expiresIn` passar sem resposta). Erro de rede ou 5xx: espera e tenta de novo.
 */
export async function waitForDeviceLogin({ deviceCode, interval = DEVICE.INTERVAL, expiresIn = DEVICE.EXPIRES_IN, signal, wait, onPoll, ...o }) {
    const esperar = wait ?? ((ms) => dormir(ms, signal));
    let passo = Math.max(1, interval), gasto = 0;
    for (;;) {
        await esperar(passo * 1000);
        gasto += passo;
        if (signal?.aborted)
            throw signal.reason ?? new Error("aborted");
        try {
            return await pollDeviceToken({ ...o, deviceCode });
        }
        catch (e) {
            const x = e;
            if (x?.code === "slow_down") {
                const d = x.details;
                passo = typeof d?.interval === "number" ? d.interval : passo + DEVICE.SLOW_DOWN_STEP;
                onPoll?.("slow_down", passo);
            }
            else if (x?.code === "authorization_pending")
                onPoll?.("authorization_pending", passo);
            else if (!(x?.status === 0 || x?.status === 429 || x?.status >= 500))
                throw e; // access_denied, expired_token, invalid_grant e outros 4xx: fim
        }
        if (gasto >= expiresIn)
            throw new PraekoError(400, "expired_token", "the code expired before it was approved: run the login again");
    }
}

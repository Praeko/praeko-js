import { DEVICE } from "./contract.js";
/** Resposta de POST /v1/device/code. `deviceCode` é segredo do programa (não mostre); `userCode` é o que a pessoa digita em `verificationUrl`. */
export interface DeviceCode {
    deviceCode: string;
    userCode: string;
    verificationUrl: string;
    expiresIn: number;
    interval: number;
    expiresAt: string;
}
/** Resposta de POST /v1/device/token quando aprovado. `key` aparece UMA vez. */
export interface DeviceToken {
    key: string;
    id: string;
    name: string;
    scope: "write";
    prefix: string;
    workspace: {
        id: string;
        name: string;
    };
    warning?: string;
}
/** Erros esperados do polling (os nomes da RFC 8628) e o resto. */
export type DevicePollError = (typeof DEVICE.POLL_ERRORS)[number];
export interface DeviceBaseOptions {
    url: string;
    fetch?: typeof fetch;
}
export interface StartDeviceLoginOptions extends DeviceBaseOptions {
    computerName?: string;
    os?: string;
}
export interface WaitForDeviceLoginOptions extends DeviceBaseOptions {
    deviceCode: string;
    /** segundos entre consultas (o `interval` de startDeviceLogin; padrão 5); cresce sozinho a cada slow_down */ interval?: number;
    /** segundos até desistir (o `expiresIn`; padrão 600) */ expiresIn?: number;
    signal?: AbortSignal;
    /** dublê do relógio nos testes */ wait?: (ms: number) => Promise<void>;
    /** chamado a cada consulta sem resposta final ("authorization_pending" ou "slow_down") */ onPoll?: (state: "authorization_pending" | "slow_down", interval: number) => void;
}
/** POST /v1/device/code: pede um código. Mostre `userCode` e `verificationUrl` à pessoa (nunca o `deviceCode`). */
export declare function startDeviceLogin({ computerName, os, ...o }: StartDeviceLoginOptions): Promise<DeviceCode>;
/** POST /v1/device/token, UMA consulta. Lança PraekoError com `code` = authorization_pending | slow_down | expired_token | access_denied | invalid_grant enquanto não há chave. */
export declare function pollDeviceToken({ deviceCode, ...o }: DeviceBaseOptions & {
    deviceCode: string;
}): Promise<DeviceToken>;
/**
 * Consulta até a pessoa decidir, respeitando `interval` (e somando 5 s a cada slow_down). Devolve a chave; lança PraekoError `access_denied`, `expired_token`
 * ou `invalid_grant` quando não há mais o que esperar (e `expired_token` também se `expiresIn` passar sem resposta). Erro de rede ou 5xx: espera e tenta de novo.
 */
export declare function waitForDeviceLogin({ deviceCode, interval, expiresIn, signal, wait, onPoll, ...o }: WaitForDeviceLoginOptions): Promise<DeviceToken>;

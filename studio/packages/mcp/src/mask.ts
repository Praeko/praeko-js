// Secret masking for everything that leaves this process (tool results, job logs, error messages). Two layers:
// 1. the exact VALUES of environment variables whose name looks like a secret (so a key is masked even if its format is unknown);
// 2. well-known key shapes (Praeko, ElevenLabs/OpenAI-style, GitHub, npm, AWS, JWT, bearer headers).
// A masked key keeps at most its short prefix and last two characters (`sk_…3e`).

const SECRET_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|COOKIE|SESSION)/i;
const SHAPES: RegExp[] = [
  /\bpraeko_[A-Za-z0-9]{8,}/g, /\bsk[-_][A-Za-z0-9_-]{8,}/g, /\bgh[pousr]_[A-Za-z0-9]{20,}/g, /\bnpm_[A-Za-z0-9]{20,}/g, /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}(?:\.[A-Za-z0-9_-]*)?/g, /\bxi-api-key["':=\s]+[A-Za-z0-9_-]{8,}/gi, /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
];

/** `sk_abcdef123e` -> `sk_…3e`; short values become just `…`. */
export function maskOne(value: string): string {
  if (value.length < 12) return "…";
  const m = /^[A-Za-z]{1,8}[_-]/.exec(value);
  return `${m ? m[0] : ""}…${value.slice(-2)}`;
}

/** Values of the environment (and of `extra`) that must never appear in an output. */
export function secretValues(env: NodeJS.ProcessEnv = process.env, extra: readonly string[] = []): string[] {
  const out = new Set<string>(extra.filter((v) => v.length >= 8));
  for (const [k, v] of Object.entries(env)) if (v && v.length >= 8 && SECRET_NAME.test(k)) out.add(v);
  return [...out].sort((a, b) => b.length - a.length);
}

export function maskSecrets(text: string, extra: readonly string[] = []): string {
  let s = String(text);
  for (const v of secretValues(process.env, extra)) if (s.includes(v)) s = s.split(v).join(maskOne(v));
  for (const re of SHAPES) s = s.replace(re, (m) => maskOne(m));
  return s;
}

/** Masks every string inside a JSON-like value. */
export function maskDeep<T>(value: T, extra: readonly string[] = []): T {
  if (typeof value === "string") return maskSecrets(value, extra) as T;
  if (Array.isArray(value)) return value.map((x) => maskDeep(x, extra)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskDeep(v, extra)])) as T;
  return value;
}

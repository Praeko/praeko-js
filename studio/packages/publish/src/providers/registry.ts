// Loads the direct providers by network name. Each module exports:
//   name, network, immediate?, leadMs?,
//   connect({ ctx, args })            authorization flow; stores tokens in ctx.secrets
//   status({ ctx })                    { connected, detail } (calls nothing that publishes)
//   prepare({ item, ctx })            optional: runs `leadMs` before the time; returns partial state (stored in item.prep)
//   publish({ item, ctx })            returns { id, url?, ... }
//   plan({ item, ctx })            optional: text lines for the dry run
import type { Provider } from "../types.ts";

export const NAMES = ["youtube", "instagram", "tiktok"];
export async function load(name: string): Promise<Provider> {
  if (!NAMES.includes(name)) throw new Error(`unknown provider: ${name}`);
  try { return await import(`./${name}.ts`); }
  catch (e) { if (e.code === "ERR_MODULE_NOT_FOUND" && String(e.message).includes(`${name}.ts`)) throw new Error(`provider "${name}" has not been written yet`); throw e; }
}
export async function loadAll(): Promise<Record<string, Provider>> {
  const o: Record<string, Provider> = {};
  for (const n of NAMES) { try { o[n] = await load(n); } catch (e) { if (!/has not been written yet/.test(e.message)) throw e; } }
  return o;
}

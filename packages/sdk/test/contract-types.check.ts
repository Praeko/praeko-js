// Verificação de TIPOS (não roda): `npm run typecheck -w packages/sdk`. Confere que src/contract.d.mts é válido em modo estrito e diz o que promete.
import type { ContractValues, ErrorCode, ErrorCodeMap, LegacyErrorCode, PathParams, RouteKey, RouteOf, RoutesFor } from "../src/contract.mjs";
import { ROUTES, codeToEN, fillPath } from "../src/contract.mjs";

type Igual<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const ok = <T extends true>(_: T) => _;

ok<Igual<PathParams<"/v1/posts/:id/items/:item/comment">, "id" | "item">>(true);
ok<Igual<PathParams<"/v1/health">, never>>(true);
ok<Igual<RouteOf<"webhooks.test">["path"], "/v1/webhooks/:id/test">>(true);
ok<Igual<RouteOf<"usage.get">["scope"], "read">>(true);
ok<Igual<ErrorCodeMap["webhook_inexistente"], "webhook_not_found">>(true);
ok<Igual<ReturnType<typeof codeToEN<"url_insegura">>, "unsafe_url">>(true);
const estado: ContractValues["state"] = "delivered";
const chave: RouteKey = "posts.create";
const caminho: RoutesFor<"PATCH">["path"] = "/v1/webhooks/:id";
const legado: LegacyErrorCode = "sem_permissao";
const primeira: "health" = ROUTES[0].key;
fillPath(caminho, ["abc"]);
// @ts-expect-error código de erro fora do contrato
const errado: ErrorCode = "nao_existe";
// @ts-expect-error estado que o contrato não tem
const estadoErrado: ContractValues["state"] = "fila";
export { estado, chave, legado, primeira, errado, estadoErrado };

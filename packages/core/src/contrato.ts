// O contrato do Praeko sem dependências de Node: nomes de rede, modos e a validação do pedido. É o que o servidor (Worker),
// o SDK e o CLI compartilham. Veja publicador.ts para a descrição do formato do pedido e da resposta.
export type Rede = "youtube" | "instagram" | "tiktok";
export type EstadoItem = "agendado" | "enviado" | "rascunho" | "privado" | "erro" | "cancelado";
/** Um destino do pedido: rede, horário ISO (ou null) e modo (youtube: privado|agendado|publico; tiktok: rascunho|direto; instagram: agora). */
export interface Destino { rede: Rede; quando?: string | null; modo?: string; fila?: boolean; midia?: { video?: string; capa?: string }; [k: string]: unknown }
/** O pedido que todo Publicador aceita (detalhes em publicador.ts). */
export interface Pedido {
  id?: string; titulo?: string; etiquetas?: string[]; kind?: "video" | "image" | "carousel"; midia: { video?: string; capa?: string | null; images?: { midia: string; alt?: string }[] };
  textos: { youtube?: { titulo?: string; texto: string; comentarioFixo?: string }; instagram?: { texto: string; comentarioFixo?: string }; tiktok?: { texto: string }; [rede: string]: any };
  destinos: Destino[]; opcoes?: { formato?: "short" | "longo"; [k: string]: unknown };
}
export interface ItemResposta { rede: Rede; id: string; estado: EstadoItem; quando: string | null; url?: string; aviso?: string; studio?: string; [k: string]: any }
export interface RespostaPublicacao { id: string; itens: ItemResposta[] }
/** O contrato do Publicador: o mesmo para o Buffer, a fila local e o serviço remoto. */
export interface Publicador {
  publicar(pedido: Pedido, opcoes?: any): Promise<RespostaPublicacao>;
  status(id: string): Promise<RespostaPublicacao>;
  cancelar(id: string, opcoes?: any): Promise<{ cancelados: string[]; mantidos: unknown[] }>;
  canais(): Promise<{ rede: Rede; conectado: boolean; detalhe?: string; id?: string }[]>;
  [k: string]: any;
}
export const REDES: Record<string, Rede> = { yt: "youtube", youtube: "youtube", ig: "instagram", instagram: "instagram", tt: "tiktok", tiktok: "tiktok" };

export const REDES_VALIDAS: readonly Rede[] = ["youtube", "instagram", "tiktok"];
/** Redes "em breve": aparecem na lista de canais (`suportado: false`, `emBreve: true`) e na UI, mas NÃO publicam, não conectam e não entram em `REDES_VALIDAS`
 *  nem nos enums de publicação. Facebook = Páginas do Facebook (docs/facebook-pagina.md); nada aqui pede permissão à Meta. */
export type RedeEmBreve = "facebook";
export const REDES_EM_BREVE: readonly RedeEmBreve[] = ["facebook"];
export const emBreve = (rede: unknown): rede is RedeEmBreve => (REDES_EM_BREVE as readonly unknown[]).includes(rede);
/** Mensagem única de recusa de uma rede em breve (servidor, MCP e validação local usam a mesma). */
export const MSG_EM_BREVE = (rede: string) => `${rede}: coming soon. Praeko does not publish to Facebook Pages yet; use youtube, instagram or tiktok`;
// ---------- Acesso antecipado (Instagram e TikTok; docs/acesso-antecipado.md) ----------
/** Redes que exigem acesso antecipado enquanto os apps da Meta e do TikTok não estão no modo público: só conecta quem a plataforma cadastrou como testador. */
export type RedeAcessoAntecipado = "instagram" | "tiktok";
export const REDES_ACESSO_ANTECIPADO: readonly RedeAcessoAntecipado[] = ["instagram", "tiktok"];
/** Estado interno (banco, português) → estado do contrato (inglês). Abertos: pedido, testador_cadastrado e liberado (1 por usuário e rede). */
export const ESTADOS_ACESSO = { pedido: "requested", testador_cadastrado: "tester_added", liberado: "released", conectado: "connected", recusado: "declined" } as const;
export type EstadoAcesso = keyof typeof ESTADOS_ACESSO;
export const ESTADOS_ACESSO_ABERTOS: readonly EstadoAcesso[] = ["pedido", "testador_cadastrado", "liberado"];
export const HANDLE_MIN = 2, HANDLE_MAX = 30;
/**
 * O @ que a pessoa digitou → o nome de usuário guardado (sem "@", minúsculo), ou null se não serve. Aceita "@perfil", "perfil", "@@perfil" e o link do perfil
 * (instagram.com/perfil, tiktok.com/@perfil). Vale o que as duas redes aceitam: letras, números, ponto e sublinhado, de 2 a 30 caracteres, sem ponto na ponta.
 */
export function normalizarHandle(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  let h = bruto.trim();
  if (h.length > 200) return null;
  const link = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:instagram\.com|tiktok\.com)\/(@?[^/?#\s]+)/i.exec(h);
  if (link) h = link[1] ?? "";
  h = h.replace(/^@+/, "").toLowerCase();
  return h.length >= HANDLE_MIN && h.length <= HANDLE_MAX && /^[a-z0-9._]+$/.test(h) && !/^\.|\.$/.test(h) ? h : null;
}

export const KINDS = ["video", "image", "carousel"] as const;
export const CARROSSEL_MIN = 2, CARROSSEL_MAX = 20; // itens de um carrossel do Instagram (Meta: até 20; Buffer: até 20 pela central de ajuda)
export const ALT_MAX = 1000; // `alt` (texto alternativo): o limite do alt_text da Meta
export const MODOS: Record<string, any> = { youtube: ["privado", "agendado", "publico"], tiktok: ["rascunho", "direto"], instagram: ["agora"] };
export const PROVEDORES = ["buffer", "local", "remoto"];

/** Confere o pedido. Devolve a lista de erros (vazia = ok). */
export function validarPedido(p: any): string[] {
  const e: string[] = [];
  if (!p || typeof p !== "object") return ["pedido vazio"];
  const kind = p.kind ?? "video";
  if (!KINDS.includes(kind)) e.push(`kind "${p.kind}" is invalid (use ${KINDS.join(", ")})`);
  else if (kind === "video") {
    if (!p.midia?.video) e.push("midia.video é obrigatório");
    if (p.midia?.images !== undefined) e.push("media.images only applies to kind image");
  } else {
    const im = p.midia?.images;
    if (!Array.isArray(im) || !im.length) e.push("media.images is required with kind image or carousel ([{ media, alt? }]: one image, or 2 to 20 for a carousel)");
    else for (const [n, x] of im.entries()) {
      if (!x || typeof x !== "object" || typeof x.midia !== "string" || !x.midia) e.push(`media.images[${n}].media must be the id of a media of type image`);
      if (x && x.alt != null && (typeof x.alt !== "string" || x.alt.length > ALT_MAX)) e.push(`media.images[${n}].alt must be a text of up to ${ALT_MAX} characters`);
    }
    if (p.midia?.video != null) e.push("media.video does not apply to kind image or carousel");
    if (p.midia?.capa != null) e.push("media.cover does not apply to kind image (the images are the media itself)");
  }
  if (!p.titulo && !p.textos?.youtube?.titulo) e.push("falta o título");
  if (!Array.isArray(p.destinos) || !p.destinos.length) e.push("destinos vazio");
  for (const d of p.destinos || []) {
    if (emBreve(d.rede)) { e.push(MSG_EM_BREVE(d.rede)); continue; }
    if (!REDES_VALIDAS.includes(d.rede)) { e.push(`rede desconhecida: ${d.rede}`); continue; }
    if (!p.textos?.[d.rede]?.texto) e.push(`falta textos.${d.rede}.texto`);
    if (d.quando != null && Number.isNaN(Date.parse(d.quando))) e.push(`${d.rede}: quando inválido (${d.quando})`);
    if (d.midia != null && (typeof d.midia !== "object" || Array.isArray(d.midia) || ["video", "capa"].some((k) => d.midia[k] != null && typeof d.midia[k] !== "string"))) e.push(`${d.rede}: midia do destino precisa ser { video?: <id>, capa?: <id> }`);
    if (d.midia?.images !== undefined) e.push(`${d.rede}: images per item (items[].media.images) arrive in a later phase; use media.images of the post`);
    if (d.modo && !MODOS[d.rede].includes(d.modo)) e.push(`${d.rede}: modo "${d.modo}" inválido (use ${MODOS[d.rede].join(", ")})`);
  }
  const todos = JSON.stringify(p.textos || {});
  const marc = [...new Set(todos.match(/\[[A-Z][A-Z_]{3,}\]/g) || [])];
  if (marc.length) e.push(`text with an unfilled marker: ${marc.join(", ")}`);
  return e;
}


/**
 * Confere se um módulo cumpre o contrato de provedor (usado nos testes de contrato; vale para o Node e para o servidor).
 * Obrigatório: nome, rede, status(), publicar(). Opcional: conectar, planejar, preparar (funções), imediato (boolean), antecedenciaMs (número).
 */
export function verificarProvedor(mod: any): string[] {
  const e: string[] = [];
  if (typeof mod?.nome !== "string" || !mod.nome) e.push("falta `nome` (texto)");
  if (!REDES_VALIDAS.includes(mod?.rede)) e.push(`\`rede\` precisa ser uma de ${REDES_VALIDAS.join(", ")}`);
  for (const f of ["status", "publicar"]) if (typeof mod?.[f] !== "function") e.push(`falta a função ${f}()`);
  for (const f of ["conectar", "planejar", "preparar", "publicarEmPassos"]) if (mod?.[f] !== undefined && typeof mod[f] !== "function") e.push(`${f} must be a function`);
  if (mod?.imediato !== undefined && typeof mod.imediato !== "boolean") e.push("`imediato` precisa ser true/false");
  if (mod?.antecedenciaMs !== undefined && !(Number.isFinite(mod.antecedenciaMs) && mod.antecedenciaMs >= 0)) e.push("`antecedenciaMs` precisa ser um número ≥ 0");
  if (mod?.preparar && !(mod.antecedenciaMs > 0)) e.push("quem tem preparar() precisa de antecedenciaMs > 0");
  return e;
}

// ---------- Imagens (posts de imagem) ----------
/** Limites da foto no Instagram (docs/imagens-e-carrosseis.md, seção 1.1: Meta, referência de IG User /media; conferidos em 08/11/2026). A proporção usa o mais estrito entre a Meta (4:5) e a ajuda do Buffer (3:4). */
export const LIMITES_IMAGEM_INSTAGRAM = { mimes: ["image/jpeg"], bytesMax: 8 * 1024 * 1024, proporcaoMin: 4 / 5, proporcaoMax: 1.91, larguraMin: 320, larguraMax: 1440, altMax: ALT_MAX } as const;
export interface ProblemaImagem { codigo: string; mensagem: string }
/**
 * Confere uma foto contra o que o Instagram aceita. `erros` (recusam o post): mime que não é JPEG (`invalid_image`), tamanho acima de 8 MB (`image_too_large`),
 * proporção fora de 4:5 a 1,91:1 (`image_aspect_ratio`). `avisos` (não recusam; o que a doc marca como não confirmado ou que a Meta ajusta sozinha):
 * dimensões desconhecidas, largura abaixo de 320 px (a Meta amplia) ou acima de 1440 px (a Meta reduz). Os códigos são os PT internos do contrato (ERROR_CODES).
 */
export function validarImagemInstagram(m: { mime?: string | null; tamanho?: number | null; largura?: number | null; altura?: number | null }): { erros: { codigo: string; mensagem: string }[]; avisos: ProblemaImagem[] } {
  const L = LIMITES_IMAGEM_INSTAGRAM, erros: ProblemaImagem[] = [], avisos: ProblemaImagem[] = [];
  if (m.mime && !(L.mimes as readonly string[]).includes(m.mime)) erros.push({ codigo: "imagem_invalida", mensagem: `the image is ${m.mime}: Instagram only accepts JPEG` });
  if (m.tamanho != null && m.tamanho > L.bytesMax) erros.push({ codigo: "imagem_grande", mensagem: `the image has ${(m.tamanho / 1048576).toFixed(1)} MB: Instagram accepts up to ${L.bytesMax / 1048576} MB` });
  if (m.largura && m.altura) {
    const r = m.largura / m.altura;
    if (r < L.proporcaoMin - 1e-9 || r > L.proporcaoMax + 1e-9) erros.push({ codigo: "imagem_proporcao", mensagem: `the image is ${m.largura}x${m.altura} (ratio ${r.toFixed(2)}): Instagram accepts from 4:5 (0.80) to 1.91:1; use 1080x1350 (4:5)` });
    if (m.largura < L.larguraMin) avisos.push({ codigo: "image_small", mensagem: `the image is ${m.largura} px wide: Meta upscales anything under ${L.larguraMin} px (it loses sharpness)` });
    if (m.largura > L.larguraMax) avisos.push({ codigo: "image_will_be_resized", mensagem: `the image is ${m.largura} px wide: Meta downsizes anything over ${L.larguraMax} px` });
  } else avisos.push({ codigo: "image_dimensions_unknown", mensagem: "could not read the width and height of the image: the aspect ratio (4:5 to 1.91:1) was not checked and Meta may refuse it" });
  return { erros, avisos };
}

// ---------- Carrossel (Instagram) ----------
/** Contêineres que um carrossel de `n` imagens consome na Meta: um por filho mais o pai (a Meta limita a ~400 por 24 h; docs/imagens-e-carrosseis.md, seção 1.1). */
export const contenedoresDoCarrossel = (n: number) => n + 1;
/**
 * Avisos de um carrossel (cada imagem já passou por `validarImagemInstagram`). A Meta corta TODAS as imagens pela proporção da PRIMEIRA (padrão 1:1; documentação da Meta, 08/11/2026),
 * então imagens com proporção diferente da primeira não recusam o post: `carousel_aspect_ratio_mismatch` (o corte pode comer texto). A proporção mínima do Buffer (3:4, central de ajuda,
 * não confirmada) é MENOS estrita que a da Meta (4:5), então não gera aviso extra: o mais estrito já vale.
 */
export function avisosCarrosselInstagram(imagens: { largura?: number | null; altura?: number | null }[]): ProblemaImagem[] {
  const avisos: ProblemaImagem[] = [], dim = (m: any) => (m?.largura && m?.altura ? m.largura / m.altura : null), base = dim(imagens[0]);
  if (base == null) return avisos;
  const fora = imagens.map((m, i) => ({ i, r: dim(m) })).filter((x) => x.i > 0 && x.r != null && Math.abs(x.r! - base) / base > 0.01);
  if (fora.length) avisos.push({ codigo: "carousel_aspect_ratio_mismatch", mensagem: `Instagram crops every slide to the aspect ratio of the FIRST image (${base.toFixed(2)}): slide${fora.length > 1 ? "s" : ""} ${fora.map((x) => x.i + 1).join(", ")} ${fora.length > 1 ? "have" : "has"} a different ratio and will be cropped; export all slides at the same size (1080x1350)` });
  return avisos;
}

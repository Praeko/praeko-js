// Fila de publicação própria (substitui o Buffer aos poucos). Um arquivo JSON por projeto: <raiz>/.praeko/fila.json (antes: .praeko/fila.json, ainda lido).
// Estados: pendente → (preparado) → enviado | erro | cancelado. Cada item tem um `provedor` (youtube, instagram, tiktok).
// O executor é idempotente: roda de tempos em tempos (launchd) e só age no que venceu; o que já foi enviado nunca reenvia.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { caminhoEstado, caminhoLeitura } from "./estado.ts";

export const MAX_TENTATIVAS = 3;
/** Onde a fila é GRAVADA (.praeko/fila.json). A leitura cai em .praeko/fila.json se ainda não houver o novo; a primeira gravação passa tudo para .praeko/. */
export const arquivoFila = (raiz: any) => caminhoEstado(raiz, "fila.json");
export function lerFila(raiz: any) {
  const f = caminhoLeitura(raiz, "fila.json");
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : { itens: [] };
}
export function salvarFila(raiz: any, fila: any) {
  const f = arquivoFila(raiz);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f + ".tmp", JSON.stringify(fila, null, 2) + "\n");
  renameSync(f + ".tmp", f); // troca atômica: um executor interrompido não deixa o arquivo pela metade
}

/** Coloca um item na fila. `item`: { slug, provedor, rede, quando (ISO), video, capa?, textos, opcoes? }. */
export function enfileirar(raiz: any, item: any) {
  const fila = lerFila(raiz);
  const it = { id: randomBytes(4).toString("hex"), estado: "pendente", tentativas: 0, criadoEm: new Date().toISOString(), ...item };
  fila.itens.push(it);
  salvarFila(raiz, fila);
  return it;
}
/** Libera um item "manual" (ex.: o comentário do YouTube depois de publicar no Studio) para o executor rodar agora. */
export function liberarItem(raiz: any, id: any) {
  const fila = lerFila(raiz), it = fila.itens.find((x: any) => x.id === id || x.id.startsWith(id));
  if (!it) throw new Error(`item ${id} não existe na fila`);
  if (!it.manual) throw new Error(`item ${it.id} não é manual`);
  it.manual = false; it.quando = new Date().toISOString(); it.tentativas = 0; it.estado = "pendente";
  salvarFila(raiz, fila);
  return it;
}
export function cancelarItem(raiz: any, id: any) {
  const fila = lerFila(raiz), it = fila.itens.find((x: any) => x.id === id || x.id.startsWith(id));
  if (!it) throw new Error(`item ${id} não existe na fila`);
  if (it.estado === "enviado") throw new Error(`item ${it.id} já foi enviado; desfaça pela própria rede`);
  it.estado = "cancelado"; it.canceladoEm = new Date().toISOString();
  salvarFila(raiz, fila);
  return it;
}

/** Ação devida de um item agora: "preparar" | "publicar" | null. `prov.imediato`: age assim que entra na fila. */
export function proximaAcao(it: any, prov: any, agora: any) {
  if (it.manual) return null; // só roda quando o dono pede (`praeko queue comment <id>`)
  if (!["pendente", "preparado"].includes(it.estado) || it.tentativas >= MAX_TENTATIVAS) return null;
  const t = Date.parse(it.quando), ant = it.acao ? 0 : (prov.antecedenciaMs ?? 0);
  if (prov.imediato && !it.acao) return it.estado === "pendente" ? "publicar" : null;
  if (it.estado === "pendente" && prov.preparar && +agora >= t - ant && +agora < t) return "preparar";
  if (+agora >= t) return "publicar";
  return null;
}

/**
 * Executa o que venceu. `provedores`: { youtube: módulo, ... } (cada um com publicar() e, opcional, preparar(), imediato, antecedenciaMs);
 * `ctx` vai para o provedor. `soIds`: restringe a estes itens. `simular`: só diz o que faria.
 */
export async function executar({ raiz, provedores, ctx, agora = new Date(), simular = false, soIds = null, log = console.log }: any) {
  const fila = lerFila(raiz), feitos = [];
  for (const it of fila.itens) {
    if (soIds && !soIds.includes(it.id)) continue;
    const prov = provedores[it.provedor];
    if (!prov) { if (["pendente", "preparado"].includes(it.estado)) log(`⚠ ${it.id}: provedor "${it.provedor}" não instalado`); continue; }
    let acao = proximaAcao(it, prov, agora);
    // um item pendente cujo preparo já devia ter acontecido (executor parado) prepara e publica na mesma passada se venceu
    while (acao) {
      if (simular) { log(`• ${it.id} ${it.rede} (${it.slug}): ${acao}`); break; }
      try {
        if (acao === "preparar") { it.prep = await prov.preparar({ item: it, ctx }); it.estado = "preparado"; log(`✓ ${it.id} ${it.rede}: preparado`); }
        else {
          it.resultado = await prov.publicar({ item: it, ctx }); it.estado = "enviado"; it.enviadoEm = new Date().toISOString();
          log(`✓ ${it.id} ${it.rede}${it.acao ? " (" + it.acao + ")" : ""}: enviado${it.resultado?.url ? " " + it.resultado.url : ""}`);
          // ações que dependem deste envio (ex.: comentário depois de o vídeo ficar público) entram na fila
          for (const s of it.resultado?.seguinte || []) fila.itens.push({ id: randomBytes(4).toString("hex"), estado: "pendente", tentativas: 0, criadoEm: new Date().toISOString(), origem: it.id, ...s });
          delete it.resultado.seguinte;
        }
        feitos.push(it.id);
      } catch (e) {
        it.tentativas++; it.erro = String(e.message || e).slice(0, 500);
        if (it.tentativas >= MAX_TENTATIVAS) it.estado = "erro";
        log(`✗ ${it.id} ${it.rede}: ${it.erro}${it.estado === "erro" ? " (desisti)" : ` (tentativa ${it.tentativas}/${MAX_TENTATIVAS})`}`);
      }
      salvarFila(raiz, fila);
      acao = it.estado === "enviado" ? null : (acao === "preparar" && it.estado === "preparado" ? proximaAcao(it, prov, agora) : null);
    }
  }
  return { feitos, fila };
}

/** LaunchAgent do macOS: roda `praeko fila executar` a cada `minutos`. Puro (devolve o plist). */
// `praeko` é o caminho do bin (o nome antigo do parâmetro, `arauto`, continua valendo). O rótulo antigo era br.arauto.fila.
export function plistLaunchd({ rotulo = "br.praeko.fila", node, praeko, arauto, cwd, minutos = 5, log }: any) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${rotulo}</string>
<key>ProgramArguments</key><array><string>${node}</string><string>${praeko ?? arauto}</string><string>fila</string><string>executar</string></array>
<key>WorkingDirectory</key><string>${cwd}</string>
<key>StartInterval</key><integer>${minutos * 60}</integer>
<key>RunAtLoad</key><true/>
<key>StandardOutPath</key><string>${log}</string><key>StandardErrorPath</key><string>${log}</string>
</dict></plist>
`;
}

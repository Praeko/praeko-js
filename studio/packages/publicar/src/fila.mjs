// Fila de publicação própria (substitui o Buffer aos poucos). Um arquivo JSON por projeto: <raiz>/.praeko-studio/fila.json.
// Estados: pendente → (preparado) → enviado | erro | cancelado. Cada item tem um `provedor` (youtube, instagram, tiktok).
// O executor é idempotente: roda de tempos em tempos (launchd) e só age no que venceu; o que já foi enviado nunca reenvia.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

export const MAX_TENTATIVAS = 3;
export const arquivoFila = (raiz) => join(raiz, ".praeko-studio", "fila.json");
export function lerFila(raiz) {
  const f = arquivoFila(raiz);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : { itens: [] };
}
export function salvarFila(raiz, fila) {
  const f = arquivoFila(raiz);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f + ".tmp", JSON.stringify(fila, null, 2) + "\n");
  renameSync(f + ".tmp", f); // troca atômica: um executor interrompido não deixa o arquivo pela metade
}

/** Coloca um item na fila. `item`: { slug, provedor, rede, quando (ISO), video, capa?, textos, opcoes? }. */
export function enfileirar(raiz, item) {
  const fila = lerFila(raiz);
  const it = { id: randomBytes(4).toString("hex"), estado: "pendente", tentativas: 0, criadoEm: new Date().toISOString(), ...item };
  fila.itens.push(it);
  salvarFila(raiz, fila);
  return it;
}
export function cancelarItem(raiz, id) {
  const fila = lerFila(raiz), it = fila.itens.find((x) => x.id === id || x.id.startsWith(id));
  if (!it) throw new Error(`item ${id} não existe na fila`);
  if (it.estado === "enviado") throw new Error(`item ${it.id} já foi enviado; desfaça pela própria rede`);
  it.estado = "cancelado"; it.canceladoEm = new Date().toISOString();
  salvarFila(raiz, fila);
  return it;
}

/** Ação devida de um item agora: "preparar" | "publicar" | null. `prov.imediato`: age assim que entra na fila. */
export function proximaAcao(it, prov, agora) {
  if (!["pendente", "preparado"].includes(it.estado) || it.tentativas >= MAX_TENTATIVAS) return null;
  const t = Date.parse(it.quando), ant = prov.antecedenciaMs ?? 0;
  if (prov.imediato) return it.estado === "pendente" ? "publicar" : null;
  if (it.estado === "pendente" && prov.preparar && +agora >= t - ant && +agora < t) return "preparar";
  if (+agora >= t) return "publicar";
  return null;
}

/**
 * Executa o que venceu. `provedores`: { youtube: módulo, ... } (cada um com publicar() e, opcional, preparar(), imediato, antecedenciaMs);
 * `ctx` vai para o provedor. `soIds`: restringe a estes itens. `simular`: só diz o que faria.
 */
export async function executar({ raiz, provedores, ctx, agora = new Date(), simular = false, soIds = null, log = console.log }) {
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
        else { it.resultado = await prov.publicar({ item: it, ctx }); it.estado = "enviado"; it.enviadoEm = new Date().toISOString(); log(`✓ ${it.id} ${it.rede}: enviado${it.resultado?.url ? " " + it.resultado.url : ""}`); }
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

/** LaunchAgent do macOS: roda `praeko studio fila executar` a cada `minutos`. Puro (devolve o plist). */
export function plistLaunchd({ rotulo = "br.praeko.studio.fila", node, bin, cwd, minutos = 5, log }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${rotulo}</string>
<key>ProgramArguments</key><array><string>${node}</string><string>${bin}</string><string>fila</string><string>executar</string></array>
<key>WorkingDirectory</key><string>${cwd}</string>
<key>StartInterval</key><integer>${minutos * 60}</integer>
<key>RunAtLoad</key><true/>
<key>StandardOutPath</key><string>${log}</string><key>StandardErrorPath</key><string>${log}</string>
</dict></plist>
`;
}

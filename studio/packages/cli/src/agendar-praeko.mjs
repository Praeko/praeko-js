// `praeko studio agendar --via praeko`: agenda DIRETO no Praeko (https://praeko.app). O arquivo sobe para o Praeko (sem R2), que cria um post com um item por rede.
// Chamado por agendar.mjs; mantém o mesmo jeito: só simula sem `--enviar`, mesmo agendamento.json (com provedor: "praeko" e postId), mesmas flags.
// Nada aqui imprime a chave. `env` só existe para teste: { fetchFn, obterChave, espera, clienteOpcoes }.
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { obterChave } from "@praeko/studio-voz";
import { REDES, capaQuadro, parseQuando, praeko, textosPorRede, validar } from "@praeko/studio-publicar";
import { NOME, acharNaPasta, acharVideo, flag, lerMeta, local, tem } from "./agendar.mjs";

const SEM_CHAVE = "sem chave do Praeko: echo $CHAVE | praeko studio agendar --via praeko --chave   (chave praeko_… (ou arauto_…) com escopo write, criada no painel; ou a variável PRAEKO_STUDIO_KEY_PRAEKO_PRINCIPAL)";
const SO_BUFFER = "--lembrete não existe no Praeko: ele agenda o post de verdade (o \"só avisa\" é do Buffer). No TikTok o equivalente é o modo rascunho (publicacao.praeko.tiktok.modo = \"rascunho\", o padrão). Para --lembrete use --via buffer.";

const clienteDe = (p, env, chave) => praeko.cliente({ url: praeko.configPraeko(p.marca).url, chave, fetchFn: env.fetchFn || fetch, ...(env.espera ? { espera: env.espera } : {}), ...(env.clienteOpcoes || {}) });
const chaveDe = (env) => (env.obterChave || obterChave)(praeko.REF_CHAVE);
const exigirChave = (env) => chaveDe(env) || (() => { throw new Error(SEM_CHAVE); })();
const idsDoPost = (ag) => [...new Set((ag.posts || []).map((x) => x.postId || ag.postId).filter(Boolean))];
const rotulo = (i) => praeko.ESTADO[i.state] || i.state;

/** `praeko studio agendar --canais --via praeko`: os canais conectados no Praeko (só leitura). */
export async function canaisPraeko(a, { p, env = {} }) {
  const cs = await clienteDe(p, env, exigirChave(env)).canais();
  if (!cs.length) { console.log("nenhum canal no Praeko"); return 1; }
  for (const c of cs) console.log(`${String(c.network).padEnd(10)} ${String(c.id || "-").padEnd(20)} ${c.name || "-"}${c.default ? "  (padrão)" : ""}${c.connected ? "" : "  (não conectado)"}${c.detail ? `  [${c.detail}]` : ""}`);
  console.log('\nSem escolha, o Praeko usa o canal padrão de cada rede. Para fixar uma conta: marca.json → publicacao.praeko.canais = { "youtube": "<id>", "instagram": "<id>", "tiktok": "<id>" }');
  return 0;
}

export async function agendarPraeko(a, { p, ep, slug, ag, arqAg, env = {} }) {
  const cfg = praeko.configPraeko(p.marca);
  if (tem(a, "lembrete")) throw new Error(SO_BUFFER);
  if (tem(a, "url")) throw new Error("--url é do Buffer (ele busca o vídeo numa URL pública). No Praeko o arquivo sobe direto, não precisa de URL.");

  // ----- status
  if (tem(a, "status")) {
    if (!ag) { console.log("nada agendado para este episódio"); return 0; }
    const c = clienteDe(p, env, exigirChave(env));
    for (const id of idsDoPost(ag)) {
      const post = await c.status(id);
      console.log(`Praeko  post ${post.id}${post.title ? `  "${post.title}"` : ""}`);
      for (const i of post.items || []) console.log(`  ${(NOME[i.network] || i.network).padEnd(10)} ${rotulo(i).padEnd(10)} ${i.scheduledFor ? local(i.scheduledFor) : ""}${i.url ? `  ${i.url}` : ""}${i.warning ? `  ⚠ ${i.warning}` : ""}`);
    }
    return 0;
  }

  // ----- cancelar: o Praeko cancela só o que ainda está pendente (o que já saiu fica)
  if (tem(a, "cancelar")) {
    if (!ag) { console.log("nada agendado para este episódio"); return 0; }
    const so = flag(a, "redes") ? flag(a, "redes").split(",").map((x) => REDES[x.trim()]).filter(Boolean) : null;
    const entradas = (ag.posts || []).map((x) => ({ ...x, postId: x.postId || ag.postId }));
    let alvo = idsDoPost(ag);
    if (so) { // o Praeko cancela o post inteiro: só dá para escolher redes que ocupem posts inteiros
      alvo = alvo.filter((id) => entradas.filter((x) => x.postId === id).every((x) => so.includes(x.rede)));
      const fora = entradas.filter((x) => so.includes(x.rede) && !alvo.includes(x.postId));
      if (fora.length) throw new Error(`o Praeko cancela o post inteiro (todas as redes dele): ${[...new Set(fora.map((x) => NOME[x.rede]))].join(", ")} está junto com outras redes. Cancele sem --redes ou pelo painel do Praeko.`);
    }
    const c = clienteDe(p, env, exigirChave(env));
    for (const id of alvo) {
      const r = await c.cancelar(id);
      console.log(`✓ cancelado no Praeko: ${id} (${(r.canceled || []).length} item(ns) pendente(s))`);
      for (const k of r.kept || []) console.log(`  ↳ ${NOME[k.network] || k.network} ficou (${rotulo(k)}): já saiu ou está em andamento, o cancelamento só pega o que ainda está pendente`);
    }
    if (so) { ag.posts = (ag.posts || []).filter((x) => !alvo.includes(x.postId || ag.postId)); writeFileSync(arqAg, JSON.stringify(ag, null, 2) + "\n"); console.log("(as outras redes ficaram)"); return 0; }
    renameSync(arqAg, arqAg.replace(/\.json$/, ".cancelado.json"));
    return 0;
  }

  // ----- limpar: no Praeko não há hospedagem para limpar; só arquiva o agendamento, e só se nada estiver pendente
  if (tem(a, "limpar")) {
    if (!ag) { console.log("nada agendado para este episódio"); return 0; }
    const c = clienteDe(p, env, exigirChave(env));
    for (const id of idsDoPost(ag)) {
      const pend = ((await c.status(id)).items || []).filter((i) => praeko.PENDENTE.has(i.state));
      if (pend.length) throw new Error(`ainda há item(ns) pendente(s) no post ${id} (${pend.map((i) => `${NOME[i.network] || i.network}: ${rotulo(i)}`).join(", ")}). --limpar só arquiva depois de publicado; para desistir use --cancelar`);
    }
    console.log("No Praeko não há vídeo hospedado para limpar (o arquivo fica com o Praeko). Agendamento arquivado.");
    renameSync(arqAg, arqAg.replace(/\.json$/, ".feito.json"));
    return 0;
  }

  // ----- planejar
  const meta = lerMeta(ep);
  const v = validar({ marca: p.marca, ep: meta });
  if (v.erros.length) { v.erros.forEach((e) => console.log("  ✗", e)); console.log("Corrija o publicacao.json (praeko studio pacote) antes de agendar."); return 1; }
  const padrao = cfg.redes || (meta.formato === "longo" ? ["youtube", "instagram"] : ["youtube", "instagram", "tiktok"]);
  const redes = flag(a, "redes") ? flag(a, "redes").split(",").map((x) => REDES[x.trim()] || (() => { throw new Error(`rede desconhecida: ${x}`); })()) : padrao;
  const fuso = p.marca.publicacao?.fusoOffset || "-03:00";
  const geral = flag(a, "quando"), quando = {};
  for (const r of redes) {
    const q = flag(a, { youtube: "yt", instagram: "ig", tiktok: "tt" }[r]) || geral;
    if (!q) throw new Error(`falta o horário de ${NOME[r]}: use --quando "06/11 17:30" (ou --yt/--ig/--tt)`);
    quando[r] = parseQuando(q, { fuso });
    const min = praeko.antecedenciaMin(r, cfg);
    if (new Date(quando[r]) < new Date(Date.now() + min * 60e3)) throw new Error(`${NOME[r]}: ${local(quando[r])} é daqui a menos de ${min} minutos ou já passou`);
  }
  const video = acharVideo(p, ep, meta, a);
  const mb = (statSync(video).size / 1048576).toFixed(1);
  const capaArq = flag(a, "capa") ? resolve(flag(a, "capa")) : (acharNaPasta(p, meta.arquivos?.capa) || (existsSync(ep.png) ? ep.png : null));
  const capa = capaArq && existsSync(capaArq) ? capaArq : null;
  // Instagram pelo Buffer: o Buffer não aceita capa à parte, então o item do Instagram leva uma cópia com a capa colada nos 2 primeiros quadros (como no --via buffer)
  let capaNoQuadro = null; const avisos = [];
  if (redes.includes("instagram") && cfg.instagram.via === "buffer" && !tem(a, "sem-capa-no-quadro")) {
    if (!capa) avisos.push("sem capa: a miniatura do Instagram será um quadro do vídeo");
    else if (meta.formato === "longo") avisos.push("Instagram: capa não colada no vídeo longo (a capa 16:9 não serve de miniatura de Reel)");
    else try { const vd = capaQuadro.sondar(video), cd = capaQuadro.dimensoesImagem(capa); if (capaQuadro.mesmaProporcao(cd, vd)) capaNoQuadro = capa; else avisos.push(`capa ${cd.largura}x${cd.altura} não tem a proporção do vídeo ${vd.largura}x${vd.altura}: não colei no vídeo do Instagram`); } catch (e) { avisos.push(`não consegui conferir a capa (${e.message}): Instagram sem capa nos quadros`); }
  } else if (!capa) avisos.push("capa não encontrada: o post sobe só com o vídeo");
  const enviar = tem(a, "enviar");
  if (ag && enviar && !tem(a, "refazer")) throw new Error("já existe agendamento (agendamento.json). Veja com --status, cancele com --cancelar ou use --refazer");
  const repetidas = redes.filter((r) => (ag?.posts || []).some((x) => x.rede === r));
  if (repetidas.length && enviar) throw new Error(`${repetidas.map((r) => NOME[r]).join(", ")} já agendado(s): cancele com --cancelar antes de refazer (senão duplica)`);

  // canais (só leitura; é uma consulta, não publica nada)
  const chave = chaveDe(env), problemas = [];
  if (!chave) { if (enviar) throw new Error(SEM_CHAVE); }
  else {
    try {
      const cs = await clienteDe(p, env, chave).canais();
      for (const r of redes) {
        const dela = cs.filter((c) => c.network === r), esc = cfg.canais?.[r] ? dela.find((c) => c.id === cfg.canais[r]) : (dela.find((c) => c.default) || dela[0]);
        if (!esc || !esc.connected) problemas.push(`${NOME[r]}: ${cfg.canais?.[r] && !esc ? `canal ${cfg.canais[r]} não encontrado no Praeko (praeko studio agendar --canais --via praeko)` : "não está conectado no Praeko (Canais no painel)"}`);
        else if (r === "instagram" && cfg.instagram.via === "meta" && !esc.meta?.connected) problemas.push("Instagram: via \"meta\", mas a API da Meta não está conectada no Praeko (use publicacao.praeko.instagram.via = \"buffer\")");
      }
    } catch (e) { if (enviar) throw e; console.log(`⚠ não consegui ler os canais do Praeko (${e.message})`); }
  }
  if (problemas.length && enviar) throw new Error(problemas.join("\n"));

  const textos = textosPorRede({ marca: p.marca, ep: meta });
  console.log(`${enviar ? "AGENDANDO NO PRAEKO" : "SIMULAÇÃO NO PRAEKO (nada será enviado; use --enviar)"}: ${meta.titulo}`);
  console.log(`vídeo: ${relative(process.cwd(), video)} (${mb} MB)${capa ? `  capa: ${basename(capa)}` : ""}`);
  const como = { youtube: "agendado (o Praeko sobe privado e agenda)", instagram: `via ${cfg.instagram.via}`, tiktok: cfg.tiktok.modo === "direto" ? `direto (${cfg.tiktok.privacidade || "SELF_ONLY"})` : "rascunho (cai na caixa de entrada do app)" };
  for (const r of redes) console.log(`  ${NOME[r].padEnd(10)} ${local(quando[r])}  ${como[r]}  texto ${textos[r].texto.length} caract.`);
  const marcadores = [...new Set(redes.map((r) => textos[r]).flatMap((t) => `${t.titulo || ""}\n${t.texto}\n${t.comentarioFixo || ""}`.match(/\[[A-Z][A-Z_]{3,}\]/g) || []))];
  if (marcadores.length) { console.log(`  ✗ texto com marcador não preenchido: ${marcadores.join(", ")}`); if (enviar) throw new Error("preencha os marcadores no publicacao.json antes de agendar"); }
  if (capaNoQuadro) console.log(`  Instagram: capa nos 2 primeiros quadros (${basename(capaNoQuadro)}); a cópia é gerada no --enviar`);
  if (redes.includes("tiktok") && cfg.tiktok.modo === "rascunho") console.log("  TikTok: o rascunho não leva legenda nem capa; na hora marcada o vídeo chega ao app e você cola a legenda e escolhe a capa.");
  if (redes.includes("tiktok") && cfg.tiktok.modo === "direto") console.log("  ⚠ TikTok direto: sem a auditoria do app o TikTok só aceita privado (SELF_ONLY); com conta privada/de teste.");
  [...avisos, ...problemas, ...v.avisos].forEach((x) => console.log("  ⚠", x));
  (meta.antesDePublicar || []).forEach((x) => console.log("  ☐", x));
  if (!enviar) { console.log(`\nO arquivo sobe direto para ${cfg.url} (sem hospedagem em R2).`); return 0; }

  // ----- enviar
  const c = clienteDe(p, env, chave), subidos = [];
  const subir = async (arq, tipo, nome) => {
    const f = praeko.fonteDeArquivo(arq);
    try {
      console.log(`  enviando ${nome} (${(f.size / 1048576).toFixed(1)} MB)…`);
      const m = await c.subirMidia(f, { tipo, aoProgredir: (x, t) => { if (x < t) console.log(`    ${Math.round((100 * x) / t)}%`); } });
      subidos.push(m.id); return m.id;
    } finally { f.close(); }
  };
  let r, id = slug;
  try {
    const midia = { video: await subir(video, "video", "o vídeo") };
    if (capa) midia.capa = await subir(capa, "cover", "a capa");
    const midiaRede = {};
    if (capaNoQuadro) {
      const saida = join(p.raiz, "out", `${slug}.capa.mp4`);
      capaQuadro.embutirCapa({ video, capa: capaNoQuadro, saida });
      console.log(`✓ capa colada nos 2 primeiros quadros: ${relative(process.cwd(), saida)}`);
      midiaRede.instagram = { video: await subir(saida, "video", "o vídeo do Instagram (com a capa nos quadros)") };
    }
    for (let n = 1; ; ) { // id determinístico (o slug); se já existe um post cancelado/sem essas redes, usa slug-2, slug-3…
      try { r = await c.criarPost(praeko.montarPost({ marca: p.marca, ep: meta, id, midia, midiaRede, redes, quando, fuso })); break; }
      catch (e) {
        if (e.code !== "id_exists") throw e;
        const vivos = ((await c.status(id)).items || []).filter((i) => redes.includes(i.network) && i.state !== "canceled");
        if (vivos.length) throw new Error(`o post "${id}" já existe no Praeko com ${vivos.map((i) => `${NOME[i.network]} (${rotulo(i)})`).join(", ")}. Veja: praeko studio agendar ${slug} --status`);
        if (++n > 9) throw e;
        id = `${slug}-${n}`;
      }
    }
  } catch (e) {
    for (const m of subidos) { try { await c.removerMidia(m); } catch { /* em uso ou já foi: tudo bem */ } } // não deixa mídia órfã no Praeko
    throw e;
  }
  const feitos = [...(ag?.posts || [])];
  for (const i of r.items || []) feitos.push({ rede: i.network, id: i.id, dueAt: i.scheduledFor || quando[i.network], ...(i.channel ? { canalId: i.channel } : {}), postId: r.id });
  writeFileSync(arqAg, JSON.stringify({ provedor: "praeko", slug, titulo: meta.titulo, postId: r.id, videoUrl: null, criadoEm: new Date().toISOString(), posts: feitos }, null, 2) + "\n");
  let erro = false;
  for (const i of r.items || []) {
    if (i.state === "error") erro = true;
    console.log(`${i.state === "error" ? "✗" : "✓"} ${NOME[i.network] || i.network} ${rotulo(i)}${i.scheduledFor ? ` para ${local(i.scheduledFor)}` : ""} (${i.id})${i.warning ? `  ⚠ ${i.warning}` : ""}`);
  }
  console.log(`\nPost ${r.id} no Praeko. Veja: praeko studio agendar ${slug} --status · desfaz o que ainda está pendente: praeko studio agendar ${slug} --cancelar`);
  return erro ? 1 : 0;
}

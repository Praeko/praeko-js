// `praeko studio agendar`: agenda o vídeo no Buffer (YouTube, Instagram, TikTok) a partir do publicacao.json do episódio.
// Por padrão SÓ SIMULA (mostra o que seria enviado). Nada sobe nem é agendado sem `--enviar`.
import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { guardarChave, obterChave } from "@praeko/studio-voz";
import { REDES, capaQuadro, apagarPost, criarPost, escolherCanais, hospedagem, listarCanais, montarPosts, parseQuando, textosPorRede, validar } from "@praeko/studio-publicar";
import { praeko as praekoProv } from "@praeko/studio-publicar";
import { acharProjeto, episodio } from "./projeto.mjs";

const REF_CHAVE = "buffer/principal";
export const flag = (a, k) => { const i = a.indexOf("--" + k); return i >= 0 && a[i + 1] && !a[i + 1].startsWith("--") ? a[i + 1] : undefined; };
export const tem = (a, k) => a.includes("--" + k);
export const NOME = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok" };

export function acharNaPasta(p, nome) {
  const pasta = p.marca.publicacao?.pasta && resolve(p.raiz, p.marca.publicacao.pasta);
  if (!nome || !pasta || !existsSync(pasta)) return null;
  const busca = (d, n = 0) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isFile() && e.name === nome) return join(d, e.name);
      if (e.isDirectory() && n < 3 && !e.name.startsWith(".")) { const r = busca(join(d, e.name), n + 1); if (r) return r; }
    }
    return null;
  };
  return busca(pasta);
}
export function acharVideo(p, ep, meta, a) {
  const f = flag(a, "video");
  if (f) return resolve(f);
  const r = acharNaPasta(p, meta.arquivos?.video);
  if (r) return r;
  if (existsSync(ep.mp4)) return ep.mp4;
  throw new Error(`não achei o vídeo (${meta.arquivos?.video || ep.mp4}). Use --video <arquivo> ou defina marca.publicacao.pasta`);
}

export function lerMeta(ep) {
  const meta = JSON.parse(readFileSync(join(ep.pasta, "publicacao.json"), "utf8"));
  const specArq = join(ep.pasta, "episodio.spec.json");
  if (meta.formato === "longo" && !meta.capitulos && existsSync(specArq)) {
    const spec = JSON.parse(readFileSync(specArq, "utf8"));
    meta.capitulos = spec.cenas.map((c) => ({ t: c.inicio, titulo: c.titulo.charAt(0) + c.titulo.slice(1).toLowerCase() }));
  }
  return meta;
}

const enviarComAg = (a) => tem(a, "enviar");
export const local = (iso, fuso = "America/Sao_Paulo") => new Date(iso).toLocaleString("pt-BR", { timeZone: fuso, dateStyle: "short", timeStyle: "short" });

/** Provedor do agendamento: --via, senão marca.json → publicacao.provedor, senão "buffer" (o padrão antigo; quem troca é o dono). */
export const PROVEDORES = ["buffer", "praeko"];
export function resolverVia(a, marca) {
  if (tem(a, "via") && !flag(a, "via")) throw new Error("--via precisa de um valor: buffer ou praeko");
  const explicito = flag(a, "via"), via = explicito ?? marca?.publicacao?.provedor ?? "buffer";
  if (!PROVEDORES.includes(via)) throw new Error(`provedor "${via}" desconhecido (${explicito ? "--via" : "marca.json → publicacao.provedor"}): use ${PROVEDORES.join(" ou ")}`);
  return { via, explicito: !!explicito };
}

// `env` só existe para teste: { fetchFn, guardarChave, obterChave }.
export async function agendar(a, env = {}) {
  const guardar = env.guardarChave || guardarChave, obter = env.obterChave || obterChave;
  // ----- chave
  if (tem(a, "chave")) {
    let marca = null; try { marca = acharProjeto().marca; } catch { /* sem projeto: vale só o --via */ }
    const { via } = resolverVia(a, marca), praeko = via === "praeko";
    let k = flag(a, "chave");
    if (!k) { const ch = []; for await (const c of process.stdin) ch.push(c); k = Buffer.concat(ch).toString().trim(); }
    if (!k) throw new Error(praeko ? "uso: echo $CHAVE | praeko studio agendar --via praeko --chave   (a chave praeko_… vem do painel do Praeko, em Chaves de API, com escopo write)" : "uso: echo $CHAVE | praeko studio agendar --chave   (a chave vem de publish.buffer.com/settings/api)");
    if (praeko && !/^(praeko|arauto)_/.test(k)) throw new Error("essa não parece uma chave do Praeko (elas começam com praeko_; as antigas arauto_ também valem). Nada foi guardado.");
    if (praeko) { guardar(praekoProv.REF_CHAVE, k); console.log(`chave do Praeko guardada (cofre do sistema no macOS; arquivo de segredos nos outros sistemas; conta ${praekoProv.REF_CHAVE})`); return 0; }
    guardar(REF_CHAVE, k);
    console.log("chave do Buffer guardada (cofre do sistema no macOS; arquivo de segredos nos outros sistemas; conta buffer/principal)");
    return 0;
  }
  const p = acharProjeto();
  const { via: viaPedido, explicito } = resolverVia(a, p.marca);
  if (viaPedido === "praeko" && tem(a, "canais")) return (await import("./agendar-praeko.mjs")).canaisPraeko(a, { p, env });
  const chave = obter(REF_CHAVE);

  // ----- canais
  if (tem(a, "canais")) {
    const cs = await listarCanais({ chave });
    if (!cs.length) { console.log("nenhum canal conectado no Buffer"); return 1; }
    for (const c of cs) console.log(`${c.servico.padEnd(10)} ${c.id}  ${c.nome}${c.pausado ? "  (fila pausada)" : ""}  [${c.org}]`);
    console.log('\nPara fixar um canal: marca.json → publicacao.buffer.canais = { "youtube": "<id>", "instagram": "<id>", "tiktok": "<id>" }');
    return 0;
  }

  const COM_VALOR = new Set(["quando", "redes", "yt", "ig", "tt", "video", "url", "chave", "capa", "via"]);
  const slug = (() => { for (let i = 0; i < a.length; i++) { if (a[i].startsWith("--")) { if (COM_VALOR.has(a[i].slice(2))) i++; continue; } return a[i]; } })();
  if (!slug) throw new Error('uso: praeko studio agendar <slug> --quando "06/11 17:30" [--redes yt,ig,tt] [--enviar]\n       praeko studio agendar --canais | --chave | <slug> --status | --cancelar | --limpar   (--via praeko|buffer)');
  const ep = episodio(p, slug), arqAg = join(ep.pasta, "agendamento.json");
  const ag = existsSync(arqAg) ? JSON.parse(readFileSync(arqAg, "utf8")) : null;
  const h = () => hospedagem.configHospedagem(p.marca);

  // ----- Praeko: outro provedor, outro arquivo de comandos. Um episódio agendado por um provedor só é mexido por ele.
  const provAg = ag ? (ag.provedor || "buffer") : null; // agendamentos antigos (Buffer) não têm `provedor`
  const operacao = ["status", "cancelar", "limpar"].find((o) => tem(a, o));
  let via = viaPedido;
  if (ag && operacao) {
    if (explicito && viaPedido !== provAg) throw new Error(`este episódio foi agendado pelo ${provAg === "praeko" ? "Praeko" : "Buffer"}: ${operacao === "status" ? "veja" : "faça isso"} com --via ${provAg} (um provedor não mexe no agendamento do outro)`);
    via = provAg; // sem --via explícito, segue o provedor que criou o agendamento
  } else if (ag && enviarComAg(a) && provAg !== viaPedido) throw new Error(`este episódio já foi agendado pelo ${provAg === "praeko" ? "Praeko" : "Buffer"}: cancele por lá antes (praeko studio agendar ${slug} --cancelar --via ${provAg}) e só então agende pelo ${viaPedido === "praeko" ? "Praeko" : "Buffer"}`);
  if (via === "praeko") return (await import("./agendar-praeko.mjs")).agendarPraeko(a, { p, ep, slug, ag, arqAg, env });

  // ----- status / cancelar / limpar
  if (tem(a, "status")) {
    if (!ag) { console.log("nada agendado para este episódio"); return 0; }
    console.log(`vídeo: ${ag.videoUrl}`);
    for (const x of ag.posts) console.log(`${NOME[x.rede].padEnd(10)} ${x.id}  ${local(x.dueAt)}`);
    return 0;
  }
  if (tem(a, "cancelar") || tem(a, "limpar")) {
    if (!ag) { console.log("nada agendado para este episódio"); return 0; }
    const so = flag(a, "redes") ? flag(a, "redes").split(",").map((x) => REDES[x.trim()]).filter(Boolean) : null; // --cancelar --redes yt: só algumas redes
    if (tem(a, "cancelar")) {
      for (const x of ag.posts) if (!so || so.includes(x.rede)) { await apagarPost(x.id, { chave }); console.log(`✓ cancelado ${NOME[x.rede]} (${x.id})`); }
      if (so) { ag.posts = ag.posts.filter((x) => !so.includes(x.rede)); writeFileSync(arqAg, JSON.stringify(ag, null, 2) + "\n"); console.log(`(o vídeo hospedado e as outras redes ficaram)`); return 0; }
    }
    if (!tem(a, "manter") && ag.chaveObjeto) { console.log(hospedagem.apagar({ h: h(), chave: ag.chaveObjeto, cwd: p.raiz }) ? "✓ vídeo removido da hospedagem" : "⚠ não consegui remover o vídeo da hospedagem"); }
    renameSync(arqAg, arqAg.replace(/\.json$/, `.${tem(a, "cancelar") ? "cancelado" : "feito"}.json`));
    return 0;
  }

  // ----- planejar
  const meta = lerMeta(ep);
  const v = validar({ marca: p.marca, ep: meta });
  if (v.erros.length) { v.erros.forEach((e) => console.log("  ✗", e)); console.log("Corrija o publicacao.json (praeko studio pacote) antes de agendar."); return 1; }
  const padrao = p.marca.publicacao?.buffer?.redes || (meta.formato === "longo" ? ["youtube", "instagram"] : ["youtube", "instagram", "tiktok"]);
  const redes = (flag(a, "redes") ? flag(a, "redes").split(",").map((x) => REDES[x.trim()] || (() => { throw new Error(`rede desconhecida: ${x}`); })()) : padrao);
  const fuso = p.marca.publicacao?.fusoOffset || "-03:00";
  const geral = flag(a, "quando");
  const quando = {};
  for (const r of redes) {
    const q = flag(a, { youtube: "yt", instagram: "ig", tiktok: "tt" }[r]) || geral;
    if (!q) throw new Error(`falta o horário de ${NOME[r]}: use --quando "06/11 17:30" (ou --yt/--ig/--tt)`);
    quando[r] = parseQuando(q, { fuso });
    if (new Date(quando[r]) < new Date(Date.now() + 5 * 60e3)) throw new Error(`${NOME[r]}: ${local(quando[r])} é daqui a menos de 5 minutos ou já passou`);
  }
  const video = acharVideo(p, ep, meta, a);
  const mb = (statSync(video).size / 1048576).toFixed(1);
  // capa nos primeiros quadros (as redes não aceitam capa à parte): só para vídeo e capa com a mesma proporção
  const capaArq = tem(a, "sem-capa-no-quadro") ? null : (flag(a, "capa") ? resolve(flag(a, "capa")) : acharNaPasta(p, meta.arquivos?.capa));
  let capaUsada = null, capaAviso = null;
  if (capaArq && existsSync(capaArq)) {
    try { const v = capaQuadro.sondar(video), c = capaQuadro.dimensoesImagem(capaArq); if (capaQuadro.mesmaProporcao(c, v)) capaUsada = capaArq; else capaAviso = `capa ${c.largura}x${c.altura} não tem a proporção do vídeo ${v.largura}x${v.altura}: não colei no vídeo`; } catch (e) { capaAviso = `não consegui conferir a capa (${e.message})`; }
  } else if (!tem(a, "sem-capa-no-quadro")) capaAviso = "capa não encontrada: a miniatura será um quadro do vídeo";
  const enviar = tem(a, "enviar");
  if (ag && enviar && !tem(a, "refazer")) throw new Error(`já existe agendamento (agendamento.json). Veja com --status, cancele com --cancelar ou use --refazer`);
  const repetidas = redes.filter((r) => (ag?.posts || []).some((x) => x.rede === r));
  if (repetidas.length && enviar) throw new Error(`${repetidas.map((r) => NOME[r]).join(", ")} já agendado(s): cancele com --cancelar antes de refazer (senão duplica)`);

  // canais (leitura da API só se houver chave; é uma consulta, não publica nada)
  let canais = {}, faltam = [];
  if (chave) { try { ({ canais, faltam } = escolherCanais({ marca: p.marca, canais: await listarCanais({ chave }), redes })); } catch (e) { if (enviar) throw e; console.log(`⚠ não consegui ler os canais do Buffer (${e.message})`); } }
  else if (enviar) throw new Error("sem chave do Buffer: `echo $CHAVE | praeko studio agendar --chave` (publish.buffer.com/settings/api)");
  if (enviar && faltam.length) throw new Error(faltam.join("\n"));
  for (const r of redes) canais[r] ||= `<canal ${r}>`;

  const textos = textosPorRede({ marca: p.marca, ep: meta });
  console.log(`${enviar ? "AGENDANDO" : "SIMULAÇÃO (nada será enviado; use --enviar)"}: ${meta.titulo}`);
  console.log(`vídeo: ${relative(process.cwd(), video)} (${mb} MB)`);
  for (const r of redes) console.log(`  ${NOME[r].padEnd(10)} ${local(quando[r])}  canal ${canais[r]}  texto ${textos[r].texto.length} caract.`);
  const marcadores = [...new Set(redes.map((r) => textos[r]).flatMap((t) => `${t.titulo || ""}\n${t.texto}\n${t.comentarioFixo || ""}`.match(/\[[A-Z][A-Z_]{3,}\]/g) || []))];
  if (marcadores.length) { console.log(`  ✗ texto com marcador não preenchido: ${marcadores.join(", ")}`); if (enviar) throw new Error("preencha os marcadores no publicacao.json antes de agendar"); }
  if (capaUsada) console.log(`  capa nos 2 primeiros quadros: ${basename(capaUsada)} (miniatura do Instagram/TikTok = quadro 0)`);
  if (capaAviso) console.log(`  ⚠ ${capaAviso}`);
  v.avisos.forEach((x) => console.log("  ⚠", x));
  (meta.antesDePublicar || []).forEach((x) => console.log("  ☐", x));
  if (tem(a, "lembrete")) console.log("modo lembrete: o Buffer só avisa na hora, você publica pelo app");
  if (!enviar) { console.log(`\nURL do vídeo: ${flag(a, "url") || "(será hospedado em " + (p.marca.publicacao?.hospedagem?.urlBase || "?") + ")"}`); return 0; }

  // ----- enviar
  let videoUrl = flag(a, "url"), chaveObjeto;
  if (!videoUrl && ag?.videoUrl) { videoUrl = ag.videoUrl; chaveObjeto = ag.chaveObjeto; console.log(`↻ reaproveitando o vídeo já hospedado: ${videoUrl}`); }
  let arquivoEnvio = video;
  if (!videoUrl && capaUsada) { arquivoEnvio = join(p.raiz, "out", `${slug}.capa.mp4`); capaQuadro.embutirCapa({ video, capa: capaUsada, saida: arquivoEnvio }); console.log(`✓ capa colada nos 2 primeiros quadros: ${relative(process.cwd(), arquivoEnvio)}`); }
  if (!videoUrl) { const s = hospedagem.subir({ h: h(), slug, arquivo: arquivoEnvio, cwd: p.raiz }); videoUrl = s.url; chaveObjeto = s.chave; console.log(`✓ vídeo hospedado: ${videoUrl}`); }
  const posts = montarPosts({ marca: p.marca, ep: meta, canais, videoUrl, quando, redes, lembrete: tem(a, "lembrete"), ...(capaUsada ? { miniaturaMs: 0 } : {}) });
  const feitos = [...(ag?.posts || [])];
  const salvar = () => writeFileSync(arqAg, JSON.stringify({ slug, titulo: meta.titulo, videoUrl, chaveObjeto, criadoEm: new Date().toISOString(), posts: feitos }, null, 2) + "\n");
  for (const x of posts) {
    try {
      const r = await criarPost(x.input, { chave });
      feitos.push({ rede: x.rede, id: r.id, dueAt: x.input.dueAt, canalId: x.input.channelId }); salvar();
      console.log(`✓ ${NOME[x.rede]} agendado para ${local(x.input.dueAt)} (${r.id})`);
    } catch (e) { salvar(); console.log(`✗ ${NOME[x.rede]}: ${e.message}`); console.log(`Já criado: ${feitos.map((f) => NOME[f.rede]).join(", ") || "nada"}. Veja --status; --cancelar desfaz.`); return 1; }
  }
  console.log(`\nO vídeo fica em ${videoUrl} até publicar. Depois de publicado: praeko studio agendar ${slug} --limpar`);
  return 0;
}

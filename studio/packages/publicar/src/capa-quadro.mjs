// Capa nos primeiros quadros: as redes (e o Buffer) não aceitam capa enviada à parte, só um quadro do próprio vídeo.
// Cola a imagem da capa sobre os `n` primeiros quadros (sem mudar duração, áudio nem sincronia) e a miniatura passa a ser o quadro 0.
import { spawnSync } from "node:child_process";

const num = (s) => { const [a, b] = String(s).split("/").map(Number); return b ? a / b : a; };

/** { largura, altura, fps, duracao } de um arquivo de vídeo (ffprobe). */
export function sondar(arq, rodar = spawnSync) {
  const r = rodar("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-show_entries", "format=duration", "-of", "json", arq], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffprobe falhou em ${arq}`);
  const j = JSON.parse(r.stdout), s = j.streams[0];
  return { largura: s.width, altura: s.height, fps: num(s.r_frame_rate), duracao: +j.format.duration };
}
export function dimensoesImagem(arq, rodar = spawnSync) {
  const r = rodar("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "json", arq], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffprobe falhou em ${arq}`);
  const s = JSON.parse(r.stdout).streams[0];
  return { largura: s.width, altura: s.height };
}
/** A capa serve se tiver a mesma proporção do vídeo (±2%). */
export const mesmaProporcao = (a, b) => Math.abs(a.largura / a.altura - b.largura / b.altura) < 0.02 * (b.largura / b.altura);

/** Argumentos do ffmpeg (puro, testável). */
export function argsFfmpeg({ video, capa, saida, largura, altura, quadros = 2, duracao = 3600, fps = 30 }) {
  const filtro = `[1:v]scale=${largura}:${altura}:force_original_aspect_ratio=increase,crop=${largura}:${altura},setsar=1,format=yuv420p[c];[0:v][c]overlay=enable='lt(n,${quadros})':format=auto,format=yuv420p[v]`;
  return ["-v", "error", "-y", "-i", video, "-loop", "1", "-framerate", String(fps), "-t", String(duracao + 1), "-i", capa, "-filter_complex", filtro, "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-c:a", "copy", "-movflags", "+faststart", "-t", String(duracao), saida];
}

/** Gera o vídeo com a capa nos primeiros quadros. Devolve { saida, quadros }. */
export function embutirCapa({ video, capa, saida, quadros = 2, rodar = spawnSync }) {
  const v = sondar(video, rodar), c = dimensoesImagem(capa, rodar);
  if (!mesmaProporcao(c, v)) throw new Error(`a capa (${c.largura}x${c.altura}) não tem a proporção do vídeo (${v.largura}x${v.altura})`);
  const r = rodar("ffmpeg", argsFfmpeg({ video, capa, saida, largura: v.largura, altura: v.altura, quadros, duracao: v.duracao, fps: v.fps }), { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg falhou ao colar a capa");
  const d = sondar(saida, rodar);
  if (Math.abs(d.duracao - v.duracao) > 0.1) throw new Error(`a duração mudou (${v.duracao.toFixed(2)} s → ${d.duracao.toFixed(2)} s); abortei`);
  return { saida, quadros };
}

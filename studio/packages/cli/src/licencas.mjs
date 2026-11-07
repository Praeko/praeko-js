// Aviso de licenças que quem usa o Praeko Studio precisa ver (README, instalação, `init`, `praeko studio doctor` e `praeko studio licencas`).
// Texto conferido nas páginas oficiais em 07/11/2026: remotion.pro/license e github.com/remotion-dev/remotion (LICENSE.md); github.com/heygen-com/hyperframes (Apache-2.0).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pastaConfigUsuario } from "@praeko/studio-voz";

export const VERSAO_AVISO = 1;
export const AVISO = {
  pt: `Licenças (leia antes do primeiro render)
  - O código do Praeko Studio é MIT.
  - O Remotion (motor padrão e necessário para capas) NÃO é MIT: é "source-available". Grátis para pessoas, organizações sem fins lucrativos, evoluir/avaliar, e empresas com até 3 funcionários.
    Empresas maiores precisam da Company License (remotion.pro/license). Quem instala e roda o Remotion é você: a licença é sua, não do Praeko.
    O Remotion também cobra planos para quem automatiza renders por programa ou agente; confirme com eles se o seu uso entra (remotion.pro/license).
  - O HyperFrames (--motor hyperframes) é Apache-2.0 (github.com/heygen-com/hyperframes). As capas ainda usam o Remotion.
  - ffmpeg, Chromium, ElevenLabs e as redes sociais têm termos próprios; o Studio não os redistribui. Fontes e músicas que você adicionar são de sua responsabilidade.
  - Voz: use só a sua própria voz ou uma que você tem autorização para usar.
  Texto completo: LICENSES.md do pacote (praeko studio docs licencas). Confirmar que leu: praeko studio licencas --aceitar`,
  en: `Licenses (read before your first render)
  - Praeko Studio's own code is MIT.
  - Remotion (the default engine, and required for covers) is NOT MIT: it is source-available. Free for individuals, non-profits, evaluation, and companies of up to 3 employees.
    Larger companies need the Company License (remotion.pro/license). You install and run Remotion: the license is yours, not Praeko's.
    Remotion also has paid plans for programmatic/agent-driven rendering; ask them whether your use falls under it (remotion.pro/license).
  - HyperFrames (--motor hyperframes) is Apache-2.0 (github.com/heygen-com/hyperframes). Covers still use Remotion.
  - ffmpeg, Chromium, ElevenLabs and social networks have their own terms; Studio does not redistribute them. Fonts and music you add are your responsibility.
  - Voice: use only your own voice or one you are authorized to use.
  Full text: the package's LICENSES.md (praeko studio docs licencas). To record that you read it: praeko studio licencas --aceitar`,
};
export const idioma = () => (/^en/i.test(process.env.PRAEKO_STUDIO_LANG || process.env.LANG || "") ? "en" : "pt");
export const avisoTexto = (lang = idioma()) => AVISO[lang] || AVISO.pt;

export const arquivoAceite = () => join(pastaConfigUsuario(), "licencas.json");
export function lerAceite() {
  try { const j = JSON.parse(readFileSync(arquivoAceite(), "utf8")); return j.versao === VERSAO_AVISO ? j : null; } catch { return null; }
}
export function gravarAceite(agora = new Date()) {
  const a = arquivoAceite(); mkdirSync(dirname(a), { recursive: true });
  writeFileSync(a, JSON.stringify({ versao: VERSAO_AVISO, aceitoEm: agora.toISOString() }, null, 2) + "\n");
}
/** Aviso curto (uma vez por render sem aceite) no stderr. Não bloqueia. */
export function avisoCurto() {
  if (lerAceite() || process.env.PRAEKO_STUDIO_SEM_AVISO) return;
  console.error(idioma() === "en" ? "(notice) Remotion is not MIT: free up to 3 people, companies of 4+ need a Company License. Details: praeko studio licencas" : "(aviso) o Remotion não é MIT: grátis até 3 pessoas, empresas com 4+ precisam da Company License. Detalhes: praeko studio licencas");
}
export function licencasCmd(a) {
  console.log(avisoTexto(a.includes("--en") ? "en" : a.includes("--pt") ? "pt" : undefined));
  if (a.includes("--aceitar")) { gravarAceite(); console.log("\n✓ registrado em " + arquivoAceite()); }
  else console.log(`\n${lerAceite() ? "✓ você já registrou a leitura" : "· leitura ainda não registrada"} (${arquivoAceite()})`);
  return 0;
}

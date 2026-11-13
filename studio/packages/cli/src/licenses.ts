// License notice that anyone using Praeko Studio needs to see (README, installation, `init`, `praeko studio doctor` and `praeko studio licenses`).
// Text checked against the official pages on 2026-11-07: remotion.pro/license and github.com/remotion-dev/remotion (LICENSE.md); github.com/heygen-com/hyperframes (Apache-2.0).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { userConfigDir } from "@praeko/studio-voice";
import { lang } from "./i18n.ts";
import { STUDIO_NPX } from "./version.ts";

export const NOTICE_VERSION = 1;
export const NOTICE: Record<"en" | "pt", string> = {
  en: `Licenses (read before your first render)
  - Praeko Studio's own code is MIT.
  - Remotion is the default engine for videos AND covers; with --engine hyperframes nothing from Remotion is used. Remotion is NOT MIT: it is source-available. Free for individuals, non-profits, evaluation, and companies of up to 3 employees.
    Larger companies need the Company License (remotion.pro/license). You install and run Remotion: the license is yours, not Praeko's.
    Remotion also has paid plans for programmatic/agent-driven rendering; ask them whether your use falls under it (remotion.pro/license).
  - HyperFrames (--engine hyperframes, for videos and covers) is Apache-2.0 (github.com/heygen-com/hyperframes). Scenes and covers written as TSX (\`component:\`) only render in Remotion.
  - ffmpeg, Chromium, ElevenLabs and social networks have their own terms; Studio does not redistribute them. Fonts and music you add are your responsibility.
  - Voice: use only your own voice or one you are authorized to use.
  Full text: the package's LICENSES.md (${STUDIO_NPX} docs licenses). To record that you read it: ${STUDIO_NPX} licenses --accept`,
  pt: `Licenças (leia antes do primeiro render)
  - O código do Praeko Studio é MIT.
  - O Remotion é o motor padrão para vídeos E capas; com --engine hyperframes nada do Remotion é usado. O Remotion NÃO é MIT: é "source-available". Grátis para pessoas, organizações sem fins lucrativos, evoluir/avaliar, e empresas com até 3 funcionários.
    Empresas maiores precisam da Company License (remotion.pro/license). Quem instala e roda o Remotion é você: a licença é sua, não do Praeko.
    O Remotion também cobra planos para quem automatiza renders por programa ou agente; confirme com eles se o seu uso entra (remotion.pro/license).
  - O HyperFrames (--engine hyperframes, para vídeos e capas) é Apache-2.0 (github.com/heygen-com/hyperframes). Cenas e capas escritas em TSX (\`component:\`) só renderizam no Remotion.
  - ffmpeg, Chromium, ElevenLabs e as redes sociais têm termos próprios; o Studio não os redistribui. Fontes e músicas que você adicionar são de sua responsabilidade.
  - Voz: use só a sua própria voz ou uma que você tem autorização para usar.
  Texto completo: LICENSES.md do pacote (${STUDIO_NPX} docs licenses). Confirmar que leu: ${STUDIO_NPX} licenses --accept`,
};
export const noticeText = (l: "en" | "pt" = lang()): string => NOTICE[l] || NOTICE.en;

export const acceptFile = (): string => join(userConfigDir(), "licenses.json");
export function readAcceptance(): { version: number; acceptedAt: string } | null {
  try { const j = JSON.parse(readFileSync(acceptFile(), "utf8")); return j.version === NOTICE_VERSION ? j : null; } catch { return null; }
}
export function writeAcceptance(now = new Date()): void {
  const a = acceptFile(); mkdirSync(dirname(a), { recursive: true });
  writeFileSync(a, JSON.stringify({ version: NOTICE_VERSION, acceptedAt: now.toISOString() }, null, 2) + "\n");
}
/** Short notice (once per render without acceptance) on stderr. Does not block. */
export function shortNotice(): void {
  if (readAcceptance() || process.env.PRAEKO_STUDIO_NO_NOTICE) return;
  console.error(`(notice) Remotion is not MIT: free up to 3 people, companies of 4+ need a Company License. Details: ${STUDIO_NPX} licenses`);
}
export function licensesCommand(a: string[]): number {
  const i = a.indexOf("--lang");
  console.log(noticeText(i >= 0 && a[i + 1] === "pt" ? "pt" : i >= 0 && a[i + 1] === "en" ? "en" : lang()));
  if (a.includes("--accept")) { writeAcceptance(); console.log("\n✓ recorded in " + acceptFile()); }
  else console.log(`\n${readAcceptance() ? "✓ you already recorded that you read it" : "· reading not recorded yet"} (${acceptFile()})`);
  return 0;
}

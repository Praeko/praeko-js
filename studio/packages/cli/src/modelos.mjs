// Arquivos gerados por `praeko studio init` e `praeko studio novo`.
// Versões que o `init` fixa no projeto novo: Remotion, React e as do próprio Studio (injetadas no build; em desenvolvimento valem as do package.json).
export const VERSOES = { remotion: "4.0.539", react: "19.2.3", tiposReact: "19.2.7", typescript: "5.9.3" };
/** Projeto novo: dependências por versão publicada (semver). Com `dev` (caminho do repositório do Studio), usa `file:` e liga as cópias de remotion/react (modo de quem contribui). */
export const pacoteProjeto = ({ nome, dev = null, versaoStudio = "0.1.0" }) => JSON.stringify({
  name: nome, version: "0.0.1", private: true,
  scripts: { dev: "remotion studio src/index.ts" },
  dependencies: {
    "@praeko/studio-core": dev ? `file:${dev}/packages/core` : `^${versaoStudio}`,
    "@praeko/studio-kit": dev ? `file:${dev}/packages/kit` : `^${versaoStudio}`,
    "@remotion/cli": VERSOES.remotion, react: VERSOES.react, "react-dom": VERSOES.react, remotion: VERSOES.remotion,
  },
  devDependencies: { ...(dev ? {} : { "@praeko/studio": `^${versaoStudio}` }), "@types/react": VERSOES.tiposReact, typescript: VERSOES.typescript },
}, null, 2) + "\n";

export const marcaInicial = ({ nome, handle }) => JSON.stringify({
  nome, handle, avatar: "capa/avatar.png",
  cores: { fundo: "#14110f", fundoCapa: "#0e0c14", destaque: "#f4b942", texto: "#f3ece0", suave: "#a89c8a", ok: "#7ee787", erro: "#ff6b5e", info: "#7fd7ff", extra: "#a98bff", caixa: "#2a2118", codigo: "#1b1610" },
  fontes: { titulo: "'Arial Black', 'Helvetica Neue', system-ui, sans-serif", mono: "Menlo, 'Courier New', monospace" },
  assinatura: "",
  links: {},
  voz: "rascunho-mudo", pronuncia: {}, legendaCorrige: {}, nomesProibidos: [],
  publicacao: { provedor: "praeko", hashtags: { permitidas: [], proibidas: [] } },
}, null, 2) + "\n";

export const remotionConfigBase = `import { Config } from "@remotion/cli/config";

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
// macOS: GPU via ANGLE/Metal é ~1,7x mais rápido nos Shorts (blur, sombras). Nos outros sistemas fica o padrão do Remotion.
if (process.platform === "darwin") Config.setChromiumOpenGlRenderer("angle");
Config.setOverwriteOutput(true);
Config.setDefaultPremountInSeconds(2);
`;
/** Só no modo --dev (Studio ligado por caminho local, link simbólico): força uma única cópia de remotion/react, a deste projeto. */
export const remotionConfigDev = remotionConfigBase.replace('import { Config } from "@remotion/cli/config";\n', 'import { Config } from "@remotion/cli/config";\nimport path from "node:path";\n') + `Config.overrideWebpackConfig((c) => ({
  ...c,
  resolve: {
    ...c.resolve,
    alias: {
      ...(c.resolve?.alias as Record<string, string> | undefined),
      remotion: path.resolve(process.cwd(), "node_modules/remotion"),
      react: path.resolve(process.cwd(), "node_modules/react"),
      "react-dom": path.resolve(process.cwd(), "node_modules/react-dom"),
    },
  },
}));
`;
export const tsconfig = JSON.stringify({ compilerOptions: { target: "ES2018", module: "Preserve", moduleResolution: "Bundler", jsx: "react-jsx", strict: true, noEmit: true, lib: ["es2015", "dom"], esModuleInterop: true, skipLibCheck: true, resolveJsonModule: true }, include: ["src", "episodios"] }, null, 2) + "\n";
export const indexTs = `import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
`;
export const marcaTs = `import { temaDaMarca } from "@praeko/studio-core";
import marca from "../marca.json";

export { marca };
export const tema = temaDaMarca(marca as Parameters<typeof temaDaMarca>[0]);
`;
export const rootTsx = `// Os comentários "praeko-studio:" são usados por \`praeko studio novo\` para registrar episódios: não apague.
// praeko-studio:imports
// praeko-studio:/imports

export const RemotionRoot: React.FC = () => (
  <>
    {/* praeko-studio:composicoes */}
    {/* praeko-studio:/composicoes */}
  </>
);
`;
export const roteiroInicial = `[curious] Escreva aqui o gancho: a primeira frase decide se alguém continua. [short pause]

Conte uma coisa de cada vez. Números por extenso. Frases curtas. [short pause]

[confident] Feche com a ideia que a pessoa leva.
`;
export const publicacaoInicial = ({ titulo }) => JSON.stringify({
  nome: titulo, data: "", titulo, alternativas: [], formato: "short", arquivos: { video: "", capa: "" },
  antesDePublicar: ["Assistir com som."],
  ia: { sintetico: true },
  yt: { descricao: "" }, ig: { legenda: "", comentarioFixo: "" }, tiktok: { legenda: "" },
  hashtags: { youtube: [], instagram: [], tiktok: [] }, fatos: [],
}, null, 2) + "\n";

export const episodioYaml = ({ id, capa, titulo }) => `# ${titulo}
# Edite aqui; \`praeko studio compilar <slug>\` confere as âncoras e gera episodio.spec.json (render e capa já compilam sozinhos).
id: ${id}
duracao: 13          # s. Depois de \`praeko studio voz\`, deixe ~3 s depois do fim da voz
legenda: 80
voz: audio/${id}.mp3
fundo: ["${titulo}"]
fechamento: { inicio: 9.5, cta: SEGUE O PERFIL }   # a voz precisa terminar antes
capa: { id: ${capa}, componente: ${capa} }          # peça de TSX em cenas.tsx
cenas:
  - inicio: 0
    titulo: ${titulo.toUpperCase().slice(0, 28)}
    rotulo: ${titulo.toUpperCase().slice(0, 18)}
    itens:
      # \`quando\` liga o item a uma frase da voz (aparece quando ela é dita). Texto com vírgula vai entre aspas.
      - { tipo: big, em: 0.2, cor: destaque, tamanho: 92, texto: "${titulo.replace(/"/g, "'")}" }
`;

export const cenasTsx = ({ capa, linhas }) => `import { Moldura } from "@praeko/studio-kit";
import { tema } from "../../src/marca";

/** Peças de TSX do episódio (capa e o que o YAML não cobre). Referencie em episodio.yaml por \`componente\`. */
export const ${capa}: React.FC = () => (
  <Moldura glow="rgba(244,185,66,.16)" titulo={${JSON.stringify(linhas)}} cor={tema.destaque} tam={104}>
    <div />
  </Moldura>
);
`;

export const episodioTsx = ({ id, slug }) => `import { EpisodioDecl, EpSpec } from "@praeko/studio-kit";
import { tema } from "../../src/marca";
import * as pecas from "./cenas";
import spec from "./episodio.spec.json";
import { PALAVRAS } from "./palavras";

// episodio.spec.json é gerado de episodio.yaml (\`praeko studio compilar ${slug}\`). Edite o YAML, não este arquivo.
export const ${id}Composition = () => <EpisodioDecl spec={spec as EpSpec} palavras={PALAVRAS} tema={tema} pecas={pecas} />;
`;

export const roteiroLongo = `## 1 · O GANCHO
[curious] Escreva aqui o gancho do vídeo.

## 2 · O PROBLEMA
Cada bloco vira um áudio (com cache): editar um bloco só regera esse bloco.

## 3 · A LIÇÃO
[confident] Fecho com a ideia principal.
`;

export const longoYaml = ({ id, titulo }) => `# Longo (16:9): ${titulo}
# \`praeko studio voz <slug> --qualidade rascunho\` gera blocos.json (início de cada bloco do roteiro); \`inicio: { bloco: N }\` usa esse tempo.
formato: longo
id: ${id}
duracao: 60            # s, vídeo inteiro (deixe ~3 s depois do fim da voz)
voz: audio/${id}.mp3
cenas:
  - titulo: O GANCHO
    inicio: 0
    itens:
      # codigo | cartao (com itens: texto) | chip | txt. Posição absoluta em px (1920×1080); \`quando\` = frase da voz que faz o item entrar.
      - { tipo: txt, quando: { quando: "Escreva aqui", depois: 0 }, pos: { esquerda: 200, topo: 400, largura: 1500 }, tamanho: 80, cor: destaque, texto: "${titulo.replace(/"/g, "'")}" }
`;

export const cenasLongoTsx = `// Cenas de longo que o YAML não cobre: exporte React.FC<{ t: number }> (t = segundos desde o início do vídeo) e use \`componente: Nome\` no episodio.yaml.
// Peças: CodigoL, CartaoL, ChipL, TxtL (@praeko/studio-kit); âncoras: mkAtG(PALAVRAS) (@praeko/studio-core).
export {};
`;

export const longoTsx = ({ id, slug }) => `import { LongoDecl, LongoSpec } from "@praeko/studio-kit";
import { tema } from "../../src/marca";
import * as pecas from "./cenas";
import spec from "./episodio.spec.json";
import { PALAVRAS } from "./palavras";

// episodio.spec.json é gerado de episodio.yaml (\`praeko studio compilar ${slug}\`). Edite o YAML, não este arquivo.
export const ${id}Composition = () => <LongoDecl spec={spec as LongoSpec} palavras={PALAVRAS} tema={tema} pecas={pecas as any} />;
`;

// Texto da skill/instruções do Praeko Studio para o agente do usuário (pt-BR e en). Uma fonte só; `skill.mjs` grava no formato de cada agente.
// Nada aqui é específico de um canal ou de uma pessoa: regras editoriais da marca vêm do `marca.json` e do `playbook.md` do projeto.

export const NOME_SKILL = "praeko-studio";
export const DESCRICAO = {
  pt: "Cria vídeos curtos verticais (9:16) e longos (16:9) com o Praeko Studio: roteiro, voz, legenda palavra a palavra, cenas, capa e textos de publicação, e publica pelo Praeko (API/MCP) depois da aprovação da pessoa. Use ao fazer, ajustar, revisar ou publicar um vídeo num projeto que tenha marca.json e src/index.ts.",
  en: "Makes vertical Shorts (9:16) and long videos (16:9) with Praeko Studio: script, voice, word-by-word captions, scenes, cover and publishing texts, then publishes through Praeko (API/MCP) only after the person approves. Use when making, adjusting, reviewing or publishing a video in a project that has marca.json and src/index.ts.",
};

const PT = `# Praeko Studio: como fazer um vídeo com o seu agente

Você (o agente) opera o Praeko Studio **na máquina da pessoa**: escreve o roteiro e o \`episodio.yaml\`, roda os comandos e entrega os arquivos. A pessoa paga a voz, o render e o seu próprio agente; o Studio não chama nenhum modelo de linguagem. Abra a sessão **na pasta do projeto** (onde está \`marca.json\`). O comando é \`praeko studio <comando>\` (ou \`npx praeko-studio <comando>\`).

Documentação completa da versão instalada: \`praeko studio docs\` (lista) e \`praeko studio docs episodio-yaml\`, \`longo-yaml\`, \`voz\`, \`publicar\`, \`hyperframes\`. Em dúvida sobre o formato do YAML, leia antes de chutar. \`praeko studio doctor\` confere o ambiente (Node, ffmpeg, Chromium, fontes, chaves, rede).

## Fluxo de um Short
1. \`praeko studio novo <slug> --titulo "…"\` cria \`episodios/<slug>/\` (roteiro, publicacao.json, episodio.yaml, cenas.tsx, capa) e registra no \`src/Root.tsx\`.
2. Confira cada fato contra a fonte e escreva \`roteiro.txt\`. **A pessoa aprova o texto antes de qualquer gasto** (voz final).
3. \`praeko studio voz <slug> --qualidade rascunho\`: voz **estimada e muda** (grátis, instantânea, sem rede) para montar as cenas. Não serve para publicar: \`checar\` avisa enquanto a voz for estimada. Quando a montagem estiver boa, \`--qualidade final\` (ElevenLabs, gasta caracteres da conta da pessoa: veja \`praeko studio voz saldo\`) e rode \`compilar\` de novo (os tempos mudam).
4. Escreva as cenas em \`episodio.yaml\`: cada item liga a uma frase da voz com \`quando: "frase"\`. \`praeko studio compilar <slug>\`: erro = frase que não está na voz, tipo ou cor inválidos, vírgula sem aspas dentro de \`{ }\`; aviso = item que estoura o painel ou se sobrepõe. O que o YAML não cobre vai em \`cenas.tsx\` e entra por \`componente:\`.
5. \`praeko studio checar <slug>\`, \`praeko studio render <slug> --escala 0.5\` (prévia) e \`praeko studio folha <slug>\` (mosaico de quadros: **olhe a imagem**, não confie só no código).
6. Render final \`praeko studio render <slug>\`, \`praeko studio capa <slug>\`, preencha \`publicacao.json\` e rode \`praeko studio pacote <slug>\` (gera \`textos.md\`, confere limites e a declaração de IA).
7. Longo (16:9): \`praeko studio novo <slug> --longo\`; cortes verticais: \`praeko studio corte <longo> <slug> --de … --ate …\`.

## Regras do texto
- Texto falado: frases curtas, números por extenso, endereço como se fala (\`pronuncia\` no \`marca.json\`), poucas tags de emoção em inglês (\`[curious]\`, \`[confident]\`, \`[short pause]\`), cerca de 190 palavras por minuto.
- Sem nome de pessoa real sem consentimento (\`nomesProibidos\` no \`marca.json\`). Cada número tem fonte; o que não foi medido é dito como estimativa.
- Regras de estilo da marca ficam no \`marca.json\` e no \`playbook.md\` do projeto, se existir. O \`pacote\` avisa tiques de texto de IA (\`publicacao.tiquesDeIA: false\` desliga).

## Voz, custos e segredos
- Chaves **nunca** em arquivo do projeto, em log ou no chat: \`echo $CHAVE | praeko studio voz config chave elevenlabs/principal\` guarda no cofre do sistema (macOS) ou em \`~/.config/praeko/segredos.json\`; variáveis \`ELEVENLABS_API_KEY\` e \`PRAEKO_KEY\` também valem.
- Use **somente a voz da própria pessoa** ou uma voz que ela tem autorização para usar. Antes de \`--qualidade final\`, mostre o texto e o saldo e espere o sim.

## Declaração de conteúdo de IA (obrigatória no pacote)
- Preencha \`"ia": { "sintetico": true|false }\` no \`publicacao.json\`. Voz sintética realista, ou imagem/vídeo gerado que pareça real, exige o rótulo de conteúdo alterado/sintético no YouTube, o "AI info" no Instagram e o rótulo de conteúdo gerado por IA no TikTok. \`praeko studio checar\` e \`pacote\` avisam se estiver faltando.
- O YouTube recebe o campo pelo envio direto do Studio; no caminho pelo Praeko e no Instagram/TikTok **a pessoa marca o rótulo no app da rede** antes de publicar. Diga isso na lista "antes de publicar".

## Publicar pelo Praeko (só depois do sim da pessoa)
Nada é publicado sem a pessoa mandar. Duas formas:
1. **CLI:** \`praeko studio agendar <slug> --via praeko --quando "dd/mm hh:mm"\` só **simula**. \`--enviar\` publica de verdade: nunca use sem a pessoa pedir.
2. **MCP do Praeko** (se conectado ao seu agente): arquivo local, em um passo \`create_media_upload { type, name, mime, size }\` (tamanho em bytes: \`wc -c < arquivo\`), envie com o \`curl\` devolvido, depois \`complete_media_upload { mediaId }\` até \`ready\`. Aí \`create_post\`/\`schedule_post\` com **dois passos obrigatórios**: a primeira chamada devolve só a **prévia** e um \`confirmation_code\`; **mostre a prévia inteira à pessoa** (canais, horário em BRT/UTC, mídia, textos, avisos), espere a aprovação explícita e só então repita a chamada com os mesmos argumentos mais \`confirm\`. Nunca confirme por conta própria.
Chave do Praeko (escopo \`write\`): \`echo $CHAVE | praeko studio agendar --via praeko --chave\`.

## Motor de render
Remotion é o padrão (necessário para capas e peças em \`cenas.tsx\`); \`--motor hyperframes\` renderiza o vídeo com o HyperFrames (Apache-2.0, baixa por npx no primeiro uso). Remotion tem licença própria: grátis para pessoas e empresas de até 3 pessoas; veja o aviso em \`praeko studio doctor\`.
`;

const EN = `# Praeko Studio: making a video with your own agent

You (the agent) run Praeko Studio **on the person's machine**: you write the script and \`episodio.yaml\`, run the commands and hand over the files. The person pays for the voice, the render and their own agent; Studio never calls a language model. Open the session **in the project folder** (where \`marca.json\` is). The command is \`praeko studio <command>\` (or \`npx praeko-studio <command>\`).

Full docs for the installed version: \`praeko studio docs\` (list) and \`praeko studio docs episodio-yaml\`, \`longo-yaml\`, \`voz\`, \`publicar\`, \`hyperframes\`. When unsure about the YAML format, read it first. \`praeko studio doctor\` checks the environment (Node, ffmpeg, Chromium, fonts, keys, network).

## Short workflow
1. \`praeko studio novo <slug> --titulo "…"\` creates \`episodios/<slug>/\` (script, publicacao.json, episodio.yaml, cenas.tsx, cover) and registers it in \`src/Root.tsx\`.
2. Check every fact against its source and write \`roteiro.txt\`. **The person approves the text before any spend** (final voice).
3. \`praeko studio voz <slug> --qualidade rascunho\`: **estimated, silent** voice (free, instant, no network) to assemble scenes. Not publishable: \`checar\` warns while the voice is estimated. When the cut looks right, \`--qualidade final\` (ElevenLabs, spends the person's own characters: see \`praeko studio voz saldo\`) and run \`compilar\` again (timings change).
4. Write scenes in \`episodio.yaml\`: each item ties to a spoken phrase with \`quando: "phrase"\`. \`praeko studio compilar <slug>\`: error = phrase not in the voice, invalid type or color, comma without quotes inside \`{ }\`; warning = item overflowing the panel or overlapping. What YAML cannot express goes in \`cenas.tsx\` via \`componente:\`.
5. \`praeko studio checar <slug>\`, \`praeko studio render <slug> --escala 0.5\` (preview) and \`praeko studio folha <slug>\` (frame mosaic: **look at the image**, do not trust the code alone).
6. Final \`praeko studio render <slug>\`, \`praeko studio capa <slug>\`, fill \`publicacao.json\` and run \`praeko studio pacote <slug>\` (writes \`textos.md\`, checks limits and the AI disclosure).
7. Long form (16:9): \`praeko studio novo <slug> --longo\`; vertical cuts: \`praeko studio corte <long> <slug> --de … --ate …\`.

## Text rules
- Spoken text: short sentences, numbers spelled out, addresses as spoken (\`pronuncia\` in \`marca.json\`), few English emotion tags (\`[curious]\`, \`[confident]\`, \`[short pause]\`), about 190 words per minute.
- No real person's name without consent (\`nomesProibidos\` in \`marca.json\`). Every number has a source; anything unmeasured is called an estimate.
- Brand style rules live in \`marca.json\` and the project's \`playbook.md\`, if any. \`pacote\` flags AI writing tics (\`publicacao.tiquesDeIA: false\` turns it off).

## Voice, costs and secrets
- Keys **never** in project files, logs or chat: \`echo $KEY | praeko studio voz config chave elevenlabs/principal\` stores it in the OS keychain (macOS) or in \`~/.config/praeko/segredos.json\`; \`ELEVENLABS_API_KEY\` and \`PRAEKO_KEY\` also work.
- Use **only the person's own voice** or a voice they are authorized to use. Before \`--qualidade final\`, show the text and the balance and wait for a yes.

## AI content disclosure (required in the package)
- Fill \`"ia": { "sintetico": true|false }\` in \`publicacao.json\`. A realistic synthetic voice, or generated image/video that looks real, requires the altered/synthetic content label on YouTube, "AI info" on Instagram and the AI-generated label on TikTok. \`praeko studio checar\` and \`pacote\` warn when it is missing.
- YouTube receives the field through Studio's direct upload; through Praeko and on Instagram/TikTok **the person sets the label in the network's app** before publishing. Put that in the "before publishing" list.

## Publishing through Praeko (only after the person's yes)
Nothing is published unless the person says so. Two ways:
1. **CLI:** \`praeko studio agendar <slug> --via praeko --quando "dd/mm hh:mm"\` only **simulates**. \`--enviar\` really publishes: never use it unless asked.
2. **Praeko MCP** (if connected to your agent): local file, in one step \`create_media_upload { type, name, mime, size }\` (size in bytes: \`wc -c < file\`), upload with the returned \`curl\`, then \`complete_media_upload { mediaId }\` until \`ready\`. Then \`create_post\`/\`schedule_post\` with **mandatory two steps**: the first call returns only the **preview** and a \`confirmation_code\`; **show the whole preview to the person** (channels, time in BRT/UTC, media, texts, warnings), wait for explicit approval, and only then repeat the call with the same arguments plus \`confirm\`. Never confirm on your own.
Praeko key (\`write\` scope): \`echo $KEY | praeko studio agendar --via praeko --chave\`.

## Render engine
Remotion is the default (required for covers and \`cenas.tsx\` pieces); \`--motor hyperframes\` renders the video with HyperFrames (Apache-2.0, fetched with npx on first use). Remotion has its own license: free for individuals and companies up to 3 people; see the notice in \`praeko studio doctor\`.
`;

export const CORPO = { pt: PT, en: EN };

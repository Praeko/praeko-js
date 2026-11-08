// Text of Praeko Studio's skill/instructions for the user's agent (English by default, pt-BR on request). One source; `skill.ts` writes it in each agent's format.
// Nothing here is specific to a channel or a person: a brand's editorial rules come from the project's `brand.json` and `playbook.md`.

export type Lang = "en" | "pt";
export const SKILL_NAME = "praeko-studio";
export const DESCRIPTION: Record<Lang, string> = {
  en: "Makes vertical Shorts (9:16) and long videos (16:9) with Praeko Studio: script, voice, word-by-word captions, scenes, cover and publishing texts, then publishes through Praeko (API/MCP) only after the person approves. Use when making, adjusting, reviewing or publishing a video in a project that has brand.json and src/index.ts.",
  pt: "Cria vídeos curtos verticais (9:16) e longos (16:9) com o Praeko Studio: roteiro, voz, legenda palavra a palavra, cenas, capa e textos de publicação, e publica pelo Praeko (API/MCP) depois da aprovação da pessoa. Use ao fazer, ajustar, revisar ou publicar um vídeo num projeto que tenha brand.json e src/index.ts.",
};

const EN = `# Praeko Studio: making a video with your own agent

You (the agent) run Praeko Studio **on the person's machine**: you write the script and \`episode.yaml\`, run the commands and hand over the files. The person pays for the voice, the render and their own agent; Studio never calls a language model. Open the session **in the project folder** (where \`brand.json\` is). The command is \`praeko studio <command>\` (or \`npx praeko-studio <command>\`).

Full docs for the installed version: \`praeko studio docs\` (list) and \`praeko studio docs episode-yaml\`, \`long-yaml\`, \`voice\`, \`publish\`, \`hyperframes\`. When unsure about the YAML format, read it first. \`praeko studio doctor\` checks the environment (Node, ffmpeg, Chromium, fonts, keys, network).

## First: the brand brief (before the first script)
- If \`brief.md\` exists in the project, **read it, and \`playbook.md\`, before writing any script** and follow them. Where the playbook says \`TODO\`, complete it (below) and tell the person what you filled in.
- If \`brief.md\` does **not** exist, run the same interview as \`praeko studio init\`, **by talking**: short questions, **one at a time**, each skippable: channel name and handle, language (pt|en), what the channel is about (one sentence), who it is for, tone of voice (one sentence), colors (accent and background, hex) and font, 0 to 3 references (a URL or a description, plus what the person liked in it), and the voice (name/alias and provider only; **never ask for a key**). If a \`brand/\` folder sits next to the project (\`../brand/build/tokens.json\`), read it (never copy it out) and offer its colors and font as the defaults. Then write \`brief.md\`, \`playbook.md\` and the \`brand.json\` fields (name, handle, \`colors.accent\`, \`colors.background\`, \`fonts.title\`), show the person what you wrote and **only then** make the first video. \`praeko studio brief\` reopens the interview from the terminal (it keeps a \`.bak\` of brief.md and never overwrites an edited playbook.md).
- References: study each one with the tools **you** already have (open the page, read the transcript or captions, look at frames). Studio does not download or analyze video. Write what you find in \`playbook.md\` as **rules** (pace, how it opens, caption style, length), never as a copy of someone's video: no reusing their script, structure beat by beat, footage or voice. If you cannot access a reference, say so and leave the \`TODO\`; never invent an analysis of a video nobody watched.

## Short workflow
1. \`praeko studio new <slug> --title "…"\` creates \`episodes/<slug>/\` (script, publication.json, episode.yaml, scenes.tsx, cover) and registers it in \`src/Root.tsx\`.
2. Check every fact against its source and write \`script.txt\`. **The person approves the text before any spend** (final voice).
3. \`praeko studio voice <slug> --quality draft\`: **estimated, silent** voice (free, instant, no network) to assemble scenes. Not publishable: \`check\` warns while the voice is estimated. When the cut looks right, \`--quality final\` (ElevenLabs, spends the person's own characters: see \`praeko studio voice balance\`) and run \`compile\` again (timings change).
4. Write scenes in \`episode.yaml\`: each item ties to a spoken phrase with \`when: "phrase"\`. \`praeko studio compile <slug>\`: error = phrase not in the voice, invalid type or color, comma without quotes inside \`{ }\`; warning = item overflowing the panel or overlapping. What YAML cannot express goes in \`scenes.tsx\` via \`component:\`.
5. \`praeko studio check <slug>\`, \`praeko studio render <slug> --scale 0.5\` (preview) and \`praeko studio contact-sheet <slug>\` (frame mosaic: **look at the image**, do not trust the code alone).
6. Final \`praeko studio render <slug>\`, \`praeko studio cover <slug>\`, fill \`publication.json\` and run \`praeko studio package <slug>\` (writes \`texts.md\`, checks limits and the AI disclosure).
7. Long form (16:9): \`praeko studio new <slug> --long\`; vertical cuts: \`praeko studio cut <long> <slug> --from … --to …\`.

## Text rules
- Spoken text: short sentences, numbers spelled out, addresses as spoken (\`pronunciation\` in \`brand.json\`), few English emotion tags (\`[curious]\`, \`[confident]\`, \`[short pause]\`), about 190 words per minute.
- No real person's name without consent (\`bannedNames\` in \`brand.json\`). Every number has a source; anything unmeasured is called an estimate.
- Brand style rules live in \`brand.json\`, \`brief.md\` and the project's \`playbook.md\`. \`package\` flags AI writing tics (\`publishing.aiTics: false\` in \`brand.json\` turns it off).

## Voice, costs and secrets
- Keys **never** in project files, logs or chat: \`echo $KEY | praeko studio voice config key elevenlabs/principal\` stores it in the OS keychain (macOS) or in \`~/.config/praeko/secrets.json\`; \`ELEVENLABS_API_KEY\` and \`PRAEKO_KEY\` also work.
- Use **only the person's own voice** or a voice they are authorized to use. Before \`--quality final\`, show the text and the balance and wait for a yes.

## AI content disclosure (required in the package)
- Fill \`"ai": { "synthetic": true|false }\` in \`publication.json\`. A realistic synthetic voice, or generated image/video that looks real, requires the altered/synthetic content label on YouTube, "AI info" on Instagram and the AI-generated label on TikTok. \`praeko studio check\` and \`package\` warn when it is missing.
- YouTube receives the field through Studio's direct upload; through Praeko and on Instagram/TikTok **the person sets the label in the network's app** before publishing. Put that in the "before publishing" list.

## Publishing through Praeko (only after the person's yes)
Nothing is published unless the person says so. Two ways:
1. **CLI:** \`praeko studio schedule <slug> --via praeko --when "dd/mm hh:mm"\` only **simulates**. \`--send\` really publishes: never use it unless asked.
2. **Praeko MCP** (if connected to your agent): local file, in one step \`create_media_upload { type, name, mime, size }\` (size in bytes: \`wc -c < file\`), upload with the returned \`curl\`, then \`complete_media_upload { mediaId }\` until \`ready\`. Then \`create_post\`/\`schedule_post\` with **mandatory two steps**: the first call returns only the **preview** and a \`confirmation_code\`; **show the whole preview to the person** (channels, time in BRT/UTC, media, texts, warnings), wait for explicit approval, and only then repeat the call with the same arguments plus \`confirm\`. Never confirm on your own.
Praeko key (\`write\` scope): \`echo $KEY | praeko studio schedule --via praeko --key\`.

## Render engine
Remotion is the default engine for videos AND covers (and for \`scenes.tsx\` pieces); \`--engine hyperframes\` renders videos and covers with HyperFrames (Apache-2.0, fetched with npx on first use) and uses nothing from Remotion (scenes and covers with \`component:\` only render in Remotion). Remotion has its own license: free for individuals and companies up to 3 people; see the notice in \`praeko studio doctor\`.

## Old projects
A project from Studio 0.1.x (Portuguese file and key names) is converted once with \`praeko studio migrate --dry-run\`, then \`praeko studio migrate\`.
`;

const PT = `# Praeko Studio: como fazer um vídeo com o seu agente

Você (o agente) opera o Praeko Studio **na máquina da pessoa**: escreve o roteiro e o \`episode.yaml\`, roda os comandos e entrega os arquivos. A pessoa paga a voz, o render e o seu próprio agente; o Studio não chama nenhum modelo de linguagem. Abra a sessão **na pasta do projeto** (onde está \`brand.json\`). O comando é \`praeko studio <comando>\` (ou \`npx praeko-studio <comando>\`). Os nomes de comandos, flags, arquivos e chaves são em inglês; só este texto está em português.

Documentação completa da versão instalada: \`praeko studio docs\` (lista) e \`praeko studio docs episode-yaml\`, \`long-yaml\`, \`voice\`, \`publish\`, \`hyperframes\`. Em dúvida sobre o formato do YAML, leia antes de chutar. \`praeko studio doctor\` confere o ambiente (Node, ffmpeg, Chromium, fontes, chaves, rede).

## Primeiro: o brief da marca (antes do primeiro roteiro)
- Se existir \`brief.md\` no projeto, **leia-o, e o \`playbook.md\`, antes de escrever qualquer roteiro** e siga os dois. Onde o playbook diz \`TODO\`, complete (abaixo) e conte à pessoa o que preencheu.
- Se **não** existir \`brief.md\`, faça a mesma entrevista do \`praeko studio init\`, **conversando**: perguntas curtas, **uma de cada vez**, todas puláveis: nome e handle do canal, idioma (pt|en), sobre o que é o canal (uma frase), para quem é, tom de voz (uma frase), cores (destaque e fundo, hex) e fonte, 0 a 3 referências (uma URL ou uma descrição, mais o que a pessoa gostou nela) e a voz (só nome/alias e provedor; **nunca peça uma chave**). Se houver uma pasta \`brand/\` ao lado do projeto (\`../brand/build/tokens.json\`), leia (sem copiar para fora) e ofereça as cores e a fonte dela como padrão. Depois grave \`brief.md\`, \`playbook.md\` e os campos do \`brand.json\` (nome, handle, \`colors.accent\`, \`colors.background\`, \`fonts.title\`), mostre à pessoa o que gravou e **só então** faça o primeiro vídeo. \`praeko studio brief\` reabre a entrevista pelo terminal (guarda um \`.bak\` do brief.md e nunca sobrescreve um playbook.md editado).
- Referências: estude cada uma com as ferramentas que **você** já tem (abrir a página, ler a transcrição ou a legenda, olhar quadros). O Studio não baixa nem analisa vídeo. Escreva o que achar no \`playbook.md\` como **regras** (ritmo, como abre, estilo de legenda, duração), nunca como cópia do vídeo de alguém: nada de reaproveitar roteiro, estrutura batida a batida, imagens ou voz. Se não conseguir acessar uma referência, diga e deixe o \`TODO\`; nunca invente a análise de um vídeo que ninguém assistiu.

## Fluxo de um Short
1. \`praeko studio new <slug> --title "…"\` cria \`episodes/<slug>/\` (script.txt, publication.json, episode.yaml, scenes.tsx, capa) e registra no \`src/Root.tsx\`.
2. Confira cada fato contra a fonte e escreva \`script.txt\`. **A pessoa aprova o texto antes de qualquer gasto** (voz final).
3. \`praeko studio voice <slug> --quality draft\`: voz **estimada e muda** (grátis, instantânea, sem rede) para montar as cenas. Não serve para publicar: \`check\` avisa enquanto a voz for estimada. Quando a montagem estiver boa, \`--quality final\` (ElevenLabs, gasta caracteres da conta da pessoa: veja \`praeko studio voice balance\`) e rode \`compile\` de novo (os tempos mudam).
4. Escreva as cenas em \`episode.yaml\`: cada item liga a uma frase da voz com \`when: "frase"\`. \`praeko studio compile <slug>\`: erro = frase que não está na voz, tipo ou cor inválidos, vírgula sem aspas dentro de \`{ }\`; aviso = item que estoura o painel ou se sobrepõe. O que o YAML não cobre vai em \`scenes.tsx\` e entra por \`component:\`.
5. \`praeko studio check <slug>\`, \`praeko studio render <slug> --scale 0.5\` (prévia) e \`praeko studio contact-sheet <slug>\` (mosaico de quadros: **olhe a imagem**, não confie só no código).
6. Render final \`praeko studio render <slug>\`, \`praeko studio cover <slug>\`, preencha \`publication.json\` e rode \`praeko studio package <slug>\` (gera \`texts.md\`, confere limites e a declaração de IA).
7. Longo (16:9): \`praeko studio new <slug> --long\`; cortes verticais: \`praeko studio cut <long> <slug> --from … --to …\`.

## Regras do texto
- Texto falado: frases curtas, números por extenso, endereço como se fala (\`pronunciation\` no \`brand.json\`), poucas tags de emoção em inglês (\`[curious]\`, \`[confident]\`, \`[short pause]\`), cerca de 190 palavras por minuto.
- Sem nome de pessoa real sem consentimento (\`bannedNames\` no \`brand.json\`). Cada número tem fonte; o que não foi medido é dito como estimativa.
- Regras de estilo da marca ficam no \`brand.json\`, no \`brief.md\` e no \`playbook.md\` do projeto. O \`package\` avisa tiques de texto de IA (\`publishing.aiTics: false\` no \`brand.json\` desliga).

## Voz, custos e segredos
- Chaves **nunca** em arquivo do projeto, em log ou no chat: \`echo $CHAVE | praeko studio voice config key elevenlabs/principal\` guarda no cofre do sistema (macOS) ou em \`~/.config/praeko/secrets.json\`; variáveis \`ELEVENLABS_API_KEY\` e \`PRAEKO_KEY\` também valem.
- Use **somente a voz da própria pessoa** ou uma voz que ela tem autorização para usar. Antes de \`--quality final\`, mostre o texto e o saldo e espere o sim.

## Declaração de conteúdo de IA (obrigatória no pacote)
- Preencha \`"ai": { "synthetic": true|false }\` no \`publication.json\`. Voz sintética realista, ou imagem/vídeo gerado que pareça real, exige o rótulo de conteúdo alterado/sintético no YouTube, o "AI info" no Instagram e o rótulo de conteúdo gerado por IA no TikTok. \`praeko studio check\` e \`package\` avisam se estiver faltando.
- O YouTube recebe o campo pelo envio direto do Studio; no caminho pelo Praeko e no Instagram/TikTok **a pessoa marca o rótulo no app da rede** antes de publicar. Diga isso na lista "antes de publicar".

## Publicar pelo Praeko (só depois do sim da pessoa)
Nada é publicado sem a pessoa mandar. Duas formas:
1. **CLI:** \`praeko studio schedule <slug> --via praeko --when "dd/mm hh:mm"\` só **simula**. \`--send\` publica de verdade: nunca use sem a pessoa pedir.
2. **MCP do Praeko** (se conectado ao seu agente): arquivo local, em um passo \`create_media_upload { type, name, mime, size }\` (tamanho em bytes: \`wc -c < arquivo\`), envie com o \`curl\` devolvido, depois \`complete_media_upload { mediaId }\` até \`ready\`. Aí \`create_post\`/\`schedule_post\` com **dois passos obrigatórios**: a primeira chamada devolve só a **prévia** e um \`confirmation_code\`; **mostre a prévia inteira à pessoa** (canais, horário em BRT/UTC, mídia, textos, avisos), espere a aprovação explícita e só então repita a chamada com os mesmos argumentos mais \`confirm\`. Nunca confirme por conta própria.
Chave do Praeko (escopo \`write\`): \`echo $CHAVE | praeko studio schedule --via praeko --key\`.

## Motor de render
Remotion é o motor padrão para vídeos E capas (e para peças em \`scenes.tsx\`); \`--engine hyperframes\` renderiza vídeos e capas com o HyperFrames (Apache-2.0, baixa por npx no primeiro uso) e não usa nada do Remotion (cenas e capas com \`component:\` só renderizam no Remotion). Remotion tem licença própria: grátis para pessoas e empresas de até 3 pessoas; veja o aviso em \`praeko studio doctor\`.

## Projetos antigos
Um projeto do Studio 0.1.x (nomes de arquivos e chaves em português) se converte uma vez com \`praeko studio migrate --dry-run\` e depois \`praeko studio migrate\`.
`;

export const BODY: Record<Lang, string> = { en: EN, pt: PT };

---
name: praeko-studio
description: Cria vídeos curtos verticais (9:16) e longos (16:9) com o Praeko Studio: roteiro, voz, legenda palavra a palavra, cenas, capa e textos de publicação, e publica pelo Praeko (API/MCP) depois da aprovação da pessoa. Use ao fazer, ajustar, revisar ou publicar um vídeo num projeto que tenha marca.json e src/index.ts.
---

# Praeko Studio: como fazer um vídeo com o seu agente

Você (o agente) opera o Praeko Studio **na máquina da pessoa**: escreve o roteiro e o `episodio.yaml`, roda os comandos e entrega os arquivos. A pessoa paga a voz, o render e o seu próprio agente; o Studio não chama nenhum modelo de linguagem. Abra a sessão **na pasta do projeto** (onde está `marca.json`). O comando é `praeko studio <comando>` (ou `npx praeko-studio <comando>`).

Documentação completa da versão instalada: `praeko studio docs` (lista) e `praeko studio docs episodio-yaml`, `longo-yaml`, `voz`, `publicar`, `hyperframes`. Em dúvida sobre o formato do YAML, leia antes de chutar. `praeko studio doctor` confere o ambiente (Node, ffmpeg, Chromium, fontes, chaves, rede).

## Fluxo de um Short
1. `praeko studio novo <slug> --titulo "…"` cria `episodios/<slug>/` (roteiro, publicacao.json, episodio.yaml, cenas.tsx, capa) e registra no `src/Root.tsx`.
2. Confira cada fato contra a fonte e escreva `roteiro.txt`. **A pessoa aprova o texto antes de qualquer gasto** (voz final).
3. `praeko studio voz <slug> --qualidade rascunho`: voz **estimada e muda** (grátis, instantânea, sem rede) para montar as cenas. Não serve para publicar: `checar` avisa enquanto a voz for estimada. Quando a montagem estiver boa, `--qualidade final` (ElevenLabs, gasta caracteres da conta da pessoa: veja `praeko studio voz saldo`) e rode `compilar` de novo (os tempos mudam).
4. Escreva as cenas em `episodio.yaml`: cada item liga a uma frase da voz com `quando: "frase"`. `praeko studio compilar <slug>`: erro = frase que não está na voz, tipo ou cor inválidos, vírgula sem aspas dentro de `{ }`; aviso = item que estoura o painel ou se sobrepõe. O que o YAML não cobre vai em `cenas.tsx` e entra por `componente:`.
5. `praeko studio checar <slug>`, `praeko studio render <slug> --escala 0.5` (prévia) e `praeko studio folha <slug>` (mosaico de quadros: **olhe a imagem**, não confie só no código).
6. Render final `praeko studio render <slug>`, `praeko studio capa <slug>`, preencha `publicacao.json` e rode `praeko studio pacote <slug>` (gera `textos.md`, confere limites e a declaração de IA).
7. Longo (16:9): `praeko studio novo <slug> --longo`; cortes verticais: `praeko studio corte <longo> <slug> --de … --ate …`.

## Regras do texto
- Texto falado: frases curtas, números por extenso, endereço como se fala (`pronuncia` no `marca.json`), poucas tags de emoção em inglês (`[curious]`, `[confident]`, `[short pause]`), cerca de 190 palavras por minuto.
- Sem nome de pessoa real sem consentimento (`nomesProibidos` no `marca.json`). Cada número tem fonte; o que não foi medido é dito como estimativa.
- Regras de estilo da marca ficam no `marca.json` e no `playbook.md` do projeto, se existir. O `pacote` avisa tiques de texto de IA (`publicacao.tiquesDeIA: false` desliga).

## Voz, custos e segredos
- Chaves **nunca** em arquivo do projeto, em log ou no chat: `echo $CHAVE | praeko studio voz config chave elevenlabs/principal` guarda no cofre do sistema (macOS) ou em `~/.config/praeko/segredos.json`; variáveis `ELEVENLABS_API_KEY` e `PRAEKO_KEY` também valem.
- Use **somente a voz da própria pessoa** ou uma voz que ela tem autorização para usar. Antes de `--qualidade final`, mostre o texto e o saldo e espere o sim.

## Declaração de conteúdo de IA (obrigatória no pacote)
- Preencha `"ia": { "sintetico": true|false }` no `publicacao.json`. Voz sintética realista, ou imagem/vídeo gerado que pareça real, exige o rótulo de conteúdo alterado/sintético no YouTube, o "AI info" no Instagram e o rótulo de conteúdo gerado por IA no TikTok. `praeko studio checar` e `pacote` avisam se estiver faltando.
- O YouTube recebe o campo pelo envio direto do Studio; no caminho pelo Praeko e no Instagram/TikTok **a pessoa marca o rótulo no app da rede** antes de publicar. Diga isso na lista "antes de publicar".

## Publicar pelo Praeko (só depois do sim da pessoa)
Nada é publicado sem a pessoa mandar. Duas formas:
1. **CLI:** `praeko studio agendar <slug> --via praeko --quando "dd/mm hh:mm"` só **simula**. `--enviar` publica de verdade: nunca use sem a pessoa pedir.
2. **MCP do Praeko** (se conectado ao seu agente): arquivo local, em um passo `create_media_upload { type, name, mime, size }` (tamanho em bytes: `wc -c < arquivo`), envie com o `curl` devolvido, depois `complete_media_upload { mediaId }` até `ready`. Aí `create_post`/`schedule_post` com **dois passos obrigatórios**: a primeira chamada devolve só a **prévia** e um `confirmation_code`; **mostre a prévia inteira à pessoa** (canais, horário em BRT/UTC, mídia, textos, avisos), espere a aprovação explícita e só então repita a chamada com os mesmos argumentos mais `confirm`. Nunca confirme por conta própria.
Chave do Praeko (escopo `write`): `echo $CHAVE | praeko studio agendar --via praeko --chave`.

## Motor de render
Remotion é o padrão (necessário para capas e peças em `cenas.tsx`); `--motor hyperframes` renderiza o vídeo com o HyperFrames (Apache-2.0, baixa por npx no primeiro uso). Remotion tem licença própria: grátis para pessoas e empresas de até 3 pessoas; veja o aviso em `praeko studio doctor`.

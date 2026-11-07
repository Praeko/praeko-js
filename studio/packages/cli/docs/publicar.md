# Publicar pelo Praeko

O Studio **não publica nada sozinho**. `praeko studio pacote <slug>` gera `textos.md` e confere limites, hashtags e a declaração de IA; `praeko studio agendar` entrega vídeo, capa e textos ao Praeko, que agenda nas redes conectadas ao seu workspace.

## Pela CLI (`--via praeko`)
```sh
echo $CHAVE | praeko studio agendar --via praeko --chave        # chave praeko_… (escopo write); a mesma da `praeko` CLI
praeko studio agendar --canais --via praeko                     # lista os canais conectados
praeko studio agendar <slug> --quando "06/11 17:30" --via praeko            # SIMULA (só lê os canais)
praeko studio agendar <slug> --quando "06/11 17:30" --via praeko --enviar   # envia o vídeo e agenda de verdade
praeko studio agendar <slug> --status | --cancelar | --limpar
```
`marca.json` → `publicacao.provedor: "praeko"` torna o Praeko o padrão (o `init` já grava assim). `publicacao.praeko.canais` fixa a conta quando há mais de uma por rede. YouTube sobe privado e é agendado; TikTok vai como rascunho (`publicacao.praeko.tiktok.modo`); o horário mínimo é 5 minutos à frente.

## Pelo MCP do Praeko (agente com shell)
O arquivo do vídeo nunca passa pelo MCP. Em um passo: `create_media_upload { type: "video", name, mime, size }` (`size` em bytes: `wc -c < arquivo`) devolve o `curl` pronto; envie o arquivo; depois `complete_media_upload { mediaId }` até o estado `ready`. Então `create_post`/`schedule_post` em **dois passos**: a 1ª chamada devolve só a **prévia** e um `confirmation_code`; **mostre a prévia inteira à pessoa**, espere o sim e repita a chamada com os mesmos argumentos mais `confirm`. O agente nunca confirma sozinho. Veja a documentação de MCP em praeko.app/docs.

## Declaração de IA (conferida pelo `checar` e pelo `pacote`)
Preencha `"ia": { "sintetico": true|false }` no `publicacao.json`. Voz sintética realista, ou imagem/vídeo gerado que pareça real, precisa do rótulo de conteúdo alterado/sintético: YouTube (campo `containsSyntheticMedia`, enviado quando o Studio publica direto), "AI info" no Instagram e o rótulo de IA no TikTok. Pelo caminho do Praeko, **marque o rótulo no app de cada rede antes de publicar** (a API pública do Praeko ainda não leva esse campo). Rascunhar roteiro com IA ou clonar a **sua própria** voz para narrar não exigem o rótulo no YouTube, mas as regras mudam: confira a política vigente de cada rede.

## Avançado
`postar` (publicação direta com credenciais suas de cada rede), `fila` e `conta <rede>` seguem no pacote para quem precisa; `fila instalar` usa o launchd e só funciona no macOS. O provedor Buffer (`--via buffer`) é legado.

# Voz no Praeko Studio

`praeko studio voz <slug> --qualidade rascunho|final|local` gera `voz.mp3` e os tempos por palavra (`palavras.json`/`palavras.ts`).

| Qualidade | O que faz | Custo |
|---|---|---|
| `rascunho` | voz **estimada e muda** (~190 palavras/min), sem rede | grátis |
| `final` | ElevenLabs (TTS) + Scribe (tempos por palavra), conta e chave **suas** | caracteres do seu plano |
| `local` | VoiceStudio (servidor local compatível, `http://127.0.0.1:3900` por padrão) | grátis, precisa estar rodando |

## Configurar a sua voz
Camadas de `vozes.json` (a de cima vence): **projeto** (ao lado do `marca.json`) > **usuário** (`~/.config/praeko/studio/vozes.json`, ou `PRAEKO_STUDIO_CONFIG`) > padrão do pacote (sem ids).
1. Guarde a chave: `echo $CHAVE | praeko studio voz config chave elevenlabs/principal` (cofre do sistema no macOS; arquivo `~/.config/praeko/segredos.json` com permissão 600 em Linux; no Windows prefira a variável `ELEVENLABS_API_KEY`).
2. Cadastre a voz: `praeko studio voz conta adicionar principal --voz minha-voz --voz-id <id da voz>` (grava o id no `vozes.json` do projeto) ou defina `ELEVENLABS_VOICE_ID`.
3. No `marca.json`, `"voz": "minha-voz"` vale para `voz` sem `--qualidade`; com `--qualidade final` vale a voz de `qualidade.final`. O padrão do `init` é `rascunho-mudo`, para nunca gastar sem querer.
Mais de uma conta (failover por saldo): `conta adicionar <outra>`; o roteador pula a conta sem saldo ou com chave inválida.

## Regras
- Use **somente a sua voz** ou uma que você tem autorização para usar (termos do ElevenLabs).
- Voz sintética realista exige o rótulo de IA nas plataformas: preencha `"ia": { "sintetico": true }` no `publicacao.json`.
- Chave nunca em arquivo do projeto, em log ou em chat com agente. Ordem de leitura: variável de ambiente, cofre do macOS, arquivo de segredos.
- O modelo OmniVoice do VoiceStudio é CC-BY-NC (não comercial): não use em conteúdo monetizado.

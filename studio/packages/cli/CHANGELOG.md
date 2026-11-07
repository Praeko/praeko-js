# Changelog

Segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e [SemVer](https://semver.org/lang/pt-BR/). Na série 0.x uma mudança incompatível pode sair em versão menor, sempre registrada aqui.

## [0.1.0] - 2026-11-07

Primeira versão publicada. O Praeko Studio nasceu dentro de um projeto de divulgação e foi extraído para qualquer pessoa usar com o seu próprio agente de código.

- Comando `praeko-studio` (também por `praeko studio …`, pelo `@praeko/cli`): `init`, `novo`, `voz`, `compilar`, `corte`, `prever`, `render`, `capa`, `folha`, `checar`, `pacote`, `agendar`, e os novos `doctor`, `licencas`, `skill install` e `docs`.
- `init` cria projetos que dependem de pacotes publicados por semver (`@praeko/studio-core`, `@praeko/studio-kit`); `--dev <studio>` mantém o modo por caminho local para quem contribui.
- `skill install` grava as instruções para Claude Code, Codex, Gemini CLI, Cursor, opencode, Cline e Windsurf (pt-BR e en), com a regra de dois passos para publicar por MCP, o envio de arquivo local (`create_media_upload`) e a declaração de IA.
- Voz: `vozes.json` por projeto e por usuário (sem ids de ninguém no pacote); chaves por variável de ambiente, cofre do macOS ou arquivo `~/.config/praeko/segredos.json` (permissão 600); a chave do Praeko é a mesma da `praeko` CLI.
- Publicação padrão pelo Praeko (`--via praeko`); `links` do `marca.json` virou opcional; `publicacao.json` ganhou `ia.sintetico` (conferido por `checar` e `pacote`; vai ao YouTube como `containsSyntheticMedia` na publicação direta).
- Remotion **não é MIT**: veja `LICENSES.md` e `praeko studio licencas`.
- Removido: o alias `bardo`, o serviço antigo do cofre e `~/.config/bardo`. `fila instalar/remover` (launchd) só existe no macOS.

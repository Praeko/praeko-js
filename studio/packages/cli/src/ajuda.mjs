// Texto de `praeko studio --help`. Em módulo próprio para o teste da documentação pública conferir os comandos contra ele (docs-publica-studio.test.mjs).
export const ajuda = (versao) => `praeko studio <comando>   (versão ${versao})

  doctor [--json] [--offline]              confere Node, ffmpeg, Chrome, fontes, chaves (sem mostrá-las), rede e licenças
  licencas [--aceitar] [--en]              aviso de licenças (Remotion não é MIT); --aceitar registra que você leu
  skill install [--agent claude|codex|gemini|cursor|opencode|cline|windsurf|all] [--lang pt|en]
                                           grava as instruções do Studio no formato do seu agente de código
  docs [tema]                              documentação da versão instalada (episodio-yaml, longo-yaml, voz, publicar, hyperframes, licencas)
  init <pasta> [--nome N] [--handle @x] [--agent …] [--lang pt|en] [--dev <studio>] [--sem-instalar]
                                           cria um projeto novo (marca, Root, sfx, instruções para o agente)
  novo <slug> [--titulo "T"] [--longo]     cria um episódio (roteiro, cena, capa, publicacao.json) e registra no Root
  voz <slug> [--qualidade rascunho|final|local] [--voz apelido] [--alinhador scribe|voicestudio] [--sem-failover]
                                           gera a voz e os tempos por palavra. rascunho = mudo e estimado (grátis, sem rede);
                                           final = ElevenLabs (sua chave); local = VoiceStudio (precisa estar rodando)
  voz saldo | vozes | conta <listar|adicionar> | config chave <ref>
                                           contas e vozes (ElevenLabs, VoiceStudio)
  compilar <slug>                          lê episodio.yaml, confere âncoras e sobreposição, gera episodio.spec.json
  corte <longo> <slug> --de <ref> --ate <ref> [--abertura "gancho" [--qualidade …]]
                                           Short vertical fatiado da voz de um longo (ref: segundos, bloco:N ou "frase")
  prever [slug] [--motor hyperframes]      abre o Remotion Studio (ou o preview do HyperFrames, com slug)
  render <slug> [--escala 0.5] [--motor remotion|hyperframes]
                                           renderiza o vídeo (out/<slug>.mp4; HyperFrames: out/<slug>.hf.mp4)
  capa <slug>                              renderiza a capa (out/<slug>-capa.png)
  folha <slug|arquivo.mp4> [--n 12]        mosaico de quadros para conferir
  checar <slug>                            roteiro, voz, publicação, declaração de IA e (com vídeo) duração, volume e quadros vazios
  pacote <slug>                            gera textos.md (YouTube, Instagram, TikTok, UTM) a partir de publicacao.json
  agendar <slug> --quando "06/11 17:30" [--redes yt,ig,tt] [--via praeko|buffer] [--enviar]
                                           agenda pelo Praeko (padrão); sem --enviar só simula. agendar --canais lista os canais;
                                           echo $CHAVE | praeko studio agendar --via praeko --chave guarda a chave do Praeko
  postar <slug> --quando "06/11 17:30" [--redes yt,ig,tt] [--enviar]   publicação direta nas redes (avançado)
  fila [listar|executar|cancelar <id>|instalar|remover]               a fila própria (instalar/remover: só macOS)
  conta <youtube|instagram|tiktok> [conectar|status]                   autoriza o Studio numa rede (avançado)
`;

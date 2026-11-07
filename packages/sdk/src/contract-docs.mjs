// Documentação por rota do contrato público (inglês nos identificadores, português nos textos): título e descrição em PT-BR, esquema do corpo
// (campos, tipos, obrigatório/opcional, valores aceitos, padrões e limites), exemplo de corpo, exemplo de resposta e códigos de erro.
// É a fonte única do que a página #/docs, o openapi.json e a coleção do Postman mostram. `contract.mjs` (ROUTES) continua sendo a fonte das rotas;
// aqui a chave de cada entrada é o `key` da rota. Cada limite foi copiado da validação real do servidor e o teste
// docs-exemplos do servidor manda cada exemplo ao servidor de verdade, então um exemplo que deixa de valer quebra o teste.
// Sem dependências: roda no navegador, no Node e no Worker.

// ---------------------------------------------------------------------------------------------------------------- ids de exemplo
// Parecem os ids reais (26 caracteres, base32 de Crockford; webhooks e ideias levam prefixo). O teste troca estes por ids de verdade.
export const IDS_EXEMPLO = {
  midiaVideo: "01KA3VQ7M2T9XE4HB8N5RZ6C0D",
  midiaCapa: "01KA3VR1J5W8GD2KP7Y4FN9S3B",
  post: "01KA3W2Y6H1RC5ZQ8M0T4VXE7N",
  item: "01KA3W2Y6J9D3BNF7G2K5PQS8A",
  webhook: "wh_01KA3X4D8P6TQ1VZ0C7MH2NB5R",
  entrega: "01KA3X9F2Z4WJ8G6D1RT5YQK3C",
  ideia: "ide_01KA3XM5C7N0VB9H4Q2ZE6TW8F",
  chave: "01KA3Y1B9E5MK7PR3XD0V4SN2G",
  video: "dQw4w9WgXcQ",
  comentario: "UgzK3n8vYb2Qx4mH7dB4AaABAg",
};

/** Texto de um valor que depende do relógio: o servidor recusa horário no passado, então o exemplo traz "{{em3dias}}" e `materializar` troca pela data de verdade. */
export const DATA_FUTURA = "{{em3dias}}";
const em3dias = (agora) => { const d = new Date(agora + 3 * 86400e3); d.setUTCHours(20, 30, 0, 0); return d.toISOString(); };
/** Cópia profunda de `valor` com o "{{em3dias}}" trocado por uma data ISO daqui a 3 dias (20:30 UTC) e, opcionalmente, ids de exemplo trocados (`trocas`: { de: para }). */
export function materializar(valor, agora = Date.now(), trocas = {}) {
  if (Array.isArray(valor)) return valor.map((x) => materializar(x, agora, trocas));
  if (valor && typeof valor === "object") return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, materializar(v, agora, trocas)]));
  if (typeof valor === "string") { let s = valor === DATA_FUTURA ? em3dias(agora) : valor; for (const [de, para] of Object.entries(trocas)) s = s.split(de).join(para); return s; }
  return valor;
}

// ---------------------------------------------------------------------------------------------------------------- parâmetros de caminho
/** Parâmetros de caminho: descrição, valores fixos e exemplo (aparece na URL do código gerado enquanto o campo do Testar está vazio). `fixo`: valor sempre seguro, já vem preenchido no Testar. */
export const PARAMS = {
  network: { desc: "Rede: youtube, instagram ou tiktok.", enum: ["youtube", "instagram", "tiktok"], exemplo: "youtube", fixo: true },
  id: { desc: "Identificador do recurso (veja o exemplo ao lado).", exemplo: IDS_EXEMPLO.post },
  item: { desc: "Id do item do post (campo `items[].id` da resposta de `GET /v1/posts/:id`).", exemplo: IDS_EXEMPLO.item },
  part: { desc: "Número da parte, de 1 a 10000.", exemplo: "1", fixo: true },
  channel: { desc: "Id do canal (campo `id` de `GET /v1/channels`).", exemplo: "01KA3V0R5D8M2WQ7X4HT9NZ1BF" },
  delivery: { desc: "Id da entrega (campo `id` de `GET /v1/webhooks/:id/deliveries`).", exemplo: IDS_EXEMPLO.entrega },
  token: { desc: "Token do link público da mídia.", exemplo: "k7Qm2vXz9Rt4Lp8Wc3Nd6Hy1Bs5Fa0J" },
  name: { desc: "Nome do arquivo.", exemplo: "video.mp4" },
};
/** Descrição do `:id` por prefixo de chave de rota (o mesmo nome significa coisas diferentes em cada recurso). */
const ID_DE = { posts: ["Id do post.", IDS_EXEMPLO.post], media: ["Id da mídia.", IDS_EXEMPLO.midiaVideo], webhooks: ["Id do webhook (começa com `wh_`).", IDS_EXEMPLO.webhook], ideas: ["Id da ideia (começa com `ide_`).", IDS_EXEMPLO.ideia], apiKeys: ["Id da chave de API (não é a chave: é o campo `id`).", IDS_EXEMPLO.chave], youtube: ["Id do vídeo do YouTube ou da thread de comentário.", IDS_EXEMPLO.video], instagram: ["Id do comentário do Instagram.", "17858893269123456"] };
/** Descrição e exemplo de um parâmetro de caminho de uma rota. */
export function paramDe(route, nome) {
  const base = PARAMS[nome] || { desc: "Parte do caminho.", exemplo: "exemplo" };
  if (nome !== "id") return base;
  const grupo = route.key.split(".")[0], [desc, exemplo] = ID_DE[grupo] || [base.desc, base.exemplo];
  const comentario = /comments/.test(route.path);
  return { ...base, desc: comentario && grupo === "youtube" ? "Id da thread de comentário do YouTube." : grupo === "youtube" && !comentario ? "Id do vídeo no YouTube." : desc, exemplo: comentario && grupo === "youtube" ? IDS_EXEMPLO.comentario : exemplo };
}

// ---------------------------------------------------------------------------------------------------------------- grupos
export const GRUPOS = { apiKeys: "Chaves de API", posts: "Posts", media: "Mídia", channels: "Canais", connections: "Conexões", insights: "Insights", calendar: "Calendário", content: "Conteúdo", comments: "Comentários", mentions: "Comentários", tags: "Etiquetas", ideas: "Ideias", tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", health: "Saúde", system: "Sistema", usage: "Uso e log", preferences: "Preferências", webhooks: "Webhooks" };
/** Nome do grupo de uma rota (o primeiro pedaço da chave). */
export const grupoDe = (r) => GRUPOS[r.key.split(".")[0]] || r.key.split(".")[0];

// ---------------------------------------------------------------------------------------------------------------- títulos e descrições em português
export const TITULOS = {
  health: "Saúde do serviço", "health.v1": "Saúde do serviço (caminho versionado)", "connections.callback": "Retorno do OAuth", "media.public": "Mídia pública por token",
  "connections.start": "Iniciar conexão de rede", "connections.disconnect": "Desconectar rede", "connections.instagramToken": "Token do Instagram",
  "channels.list": "Listar canais", "channels.default": "Canal padrão da rede", "channels.remove": "Remover canal", "channels.avatar": "Foto do canal", "tiktok.creator": "Criador no TikTok",
  "channels.slots.get": "Horários do canal", "channels.slots.put": "Salvar horários do canal", "channels.followers.put": "Registrar seguidores", "channels.followers.get": "Seguidores do canal",
  "media.create": "Criar mídia", "media.list": "Listar mídias", "media.get": "Ver mídia", "media.part": "Enviar parte da mídia", "media.content.put": "Enviar arquivo da mídia", "media.content.get": "Baixar arquivo da mídia", "media.content.head": "Conferir arquivo da mídia", "media.complete": "Concluir envio da mídia", "media.delete": "Apagar mídia",
  "posts.create": "Criar post", "posts.adopt": "Adotar post já publicado", "posts.list": "Listar posts", "posts.get": "Ver post", "posts.update": "Editar post", "posts.cancel": "Cancelar post", "posts.publishNow": "Publicar agora", "posts.youtubeSchedule": "Agendar no YouTube", "posts.itemComment": "Comentário do item",
  "calendar.get": "Calendário", "insights.get": "Métricas", "insights.import": "Importar métricas", "insights.retention": "Retenção, impressões e CTR", "insights.retention.item": "Retenção de um post", "content.list": "Conteúdo publicado",
  "youtube.videos": "Vídeos do YouTube", "youtube.video": "Ver vídeo do YouTube", "youtube.editVideo": "Editar vídeo do YouTube", "youtube.comments": "Comentários do YouTube", "youtube.reply": "Responder comentário do YouTube", "youtube.resolve": "Resolver comentário do YouTube", "youtube.reopen": "Reabrir comentário do YouTube",
  "instagram.media": "Mídias do Instagram", "instagram.comments": "Comentários do Instagram", "instagram.reply": "Responder comentário do Instagram", "instagram.hide": "Ocultar comentário do Instagram", "instagram.resolve": "Resolver comentário do Instagram", "instagram.reopen": "Reabrir comentário do Instagram",
  "comments.list": "Comentários de todas as redes", "mentions.list": "Menções",
  "apiKeys.list": "Listar chaves de API", "apiKeys.create": "Criar chave de API", "apiKeys.revoke": "Revogar chave de API", "usage.get": "Resumo de uso", "usage.log": "Log de requisições",
  "preferences.get": "Ver preferências", "preferences.put": "Salvar preferências",
  "webhooks.list": "Listar webhooks", "webhooks.create": "Criar webhook", "webhooks.get": "Ver webhook", "webhooks.update": "Editar webhook", "webhooks.delete": "Apagar webhook", "webhooks.test": "Testar webhook", "webhooks.deliveries": "Entregas do webhook", "webhooks.redeliver": "Reenviar entrega", "webhooks.rotateSecret": "Trocar segredo do webhook",
  "ideas.list": "Listar ideias", "ideas.create": "Criar ideia", "ideas.import": "Importar ideias", "ideas.update": "Editar ideia", "ideas.delete": "Apagar ideia",
};

/** Descrição em português de cada rota (o `summary` do contrato continua em inglês e é o que sai em docs/api-contract.md). */
export const RESUMOS = {
  health: "Confere se o serviço está no ar. Não precisa de chave.", "health.v1": "O mesmo que `/health`, no caminho versionado. Não precisa de chave.",
  "connections.callback": "Endereço para onde YouTube, TikTok e Meta devolvem o navegador depois do login (página HTML). Os endereços já cadastrados continuam valendo.",
  "media.public": "Mídia pública acessada por um link com token (aceita Range). Também responde em `/m/…`. É o endereço que Meta e TikTok baixam.",
  "media.public#HEAD": "Igual ao GET, mas só devolve os cabeçalhos.",
  "connections.start": "Inicia o login OAuth de youtube, tiktok ou meta (Instagram) e devolve o endereço de autorização. Outra conta da mesma rede vira outro canal; a mesma conta é reconectada. Em `meta` valem `replace=true` (troca o token de uma conexão existente), `add=true` (conecta OUTRA conta do Instagram como novo canal), `instagram=<usuário>`, `instagram_id=<id|current>` e `probe=true` (só relata, não grava nada).",
  "connections.disconnect": "Desconecta uma conta de youtube, tiktok ou instagram (só o token da Meta; o canal do Buffer nunca é mexido). `channel` escolhe a conta; sem ele, vale o canal padrão. As outras contas, o canal e o histórico ficam. Se era o padrão, outra conta conectada assume.",
  "connections.instagramToken": "Guarda o token da API da Meta para o Instagram (cifrado). O token é conferido na Meta antes de gravar.",
  "channels.list": "Um item por canal conectado (várias contas da mesma rede viram vários itens; `default` marca a usada quando não se informa `channel`), mais um item \"não conectado\" para a rede sem conta. Traz o estado e a quantidade de horários.",
  "channels.default": "Torna esta conta a padrão da rede (usada quando uma rota de rede não traz `channel`); as outras contas da mesma rede perdem a marca. Dá 404 `channel_not_found` se não for um canal ativo deste workspace.",
  "channels.remove": "Tira da lista uma conta DESCONECTADA (o histórico fica). Recusa enquanto estiver conectada, com itens pendentes ou se for o canal do Instagram no Buffer.",
  "channels.avatar": "Imagem de perfil do canal (`channel` escolhe a conta).", "tiktok.creator": "O que a conta do TikTok conectada aceita (`creator_info`: privacidades, duração máxima…). `channel` escolhe a conta.",
  "channels.slots.get": "Horários semanais de publicação de um canal (`channel` escolhe a conta; sem ele, o padrão).",
  "channels.slots.put": "Troca todos os horários semanais de um canal e reorganiza o que está na fila (`channel` escolhe a conta).",
  "channels.followers.put": "Informa a contagem de seguidores à mão (só Instagram; `channel` escolhe a conta). Vira o registro do dia.",
  "channels.followers.get": "Os últimos 60 registros diários de seguidores (`channel` escolhe a conta).",
  "media.create": "Começa o envio de uma mídia (vídeo ou capa). Com `simple: true` e até 50 MB, envie o arquivo todo de uma vez em `PUT /v1/media/:id/content`; senão, envie em partes e conclua com `POST /v1/media/:id/complete`.",
  "media.list": "Lista as mídias (as últimas 100). Vídeos antigos ganham duração, largura e altura na primeira leitura.",
  "media.get": "Uma mídia (com `publicUrl` quando estiver pronta; vídeos trazem também `durationMs`, `width` e `height` quando o cabeçalho do arquivo diz).",
  "media.part": "Envia uma parte do arquivo (bytes crus no corpo). Reenviar a mesma parte é seguro. Toda parte, menos a última, precisa ter o mesmo tamanho (no mínimo 5 MiB).",
  "media.content.put": "Envia o arquivo inteiro de uma vez (mídia criada com `simple: true`, até 50 MB). O corpo são os bytes crus.",
  "media.content.get": "Baixa o arquivo (com chave; aceita Range).", "media.content.head": "Igual ao GET, mas só devolve os cabeçalhos.",
  "media.complete": "Junta as partes enviadas. Confere o tamanho combinado e a sequência 1..N. Chamar de novo é inofensivo.",
  "media.delete": "Remove uma mídia (recusa enquanto um post pendente a usa).",
  "posts.create": "Cria um post com um item por rede (fila, horário fixo ou rascunho). Cada item pode levar `channel` (a conta daquela rede; sem ele, vale o canal padrão).",
  "posts.adopt": "Registra no Praeko um Reel que já está agendado no Buffer (não chama o Buffer).",
  "posts.list": "Lista os posts, do mais recente para o mais antigo (na fila e nos rascunhos, do mais próximo para o mais distante). Filtros: `state`, `channel`, `tag`.",
  "posts.get": "Um post com seus itens e as ações seguintes.",
  "posts.update": "Edita título, textos, mídia, etiquetas e itens, ou move para rascunho ou fila. Só vai o que mudou; o resto fica.",
  "posts.cancel": "Cancela os itens pendentes de um post.",
  "posts.publishNow": "Tira os itens pendentes da fila e publica agora (`?network=` limita a uma rede).",
  "posts.youtubeSchedule": "Agenda a publicação de um vídeo que já subiu para o YouTube (privado).",
  "posts.itemComment": "Libera o comentário fixo guardado de um item.",
  "calendar.get": "Itens de um período e os horários livres.",
  "insights.get": "Cartões, melhores posts, resultado por canal (uma linha por conta quando a rede tem várias; `channel` filtra uma), resumo e a leitura de 48 h.",
  "insights.retention": "Retenção (% assistida e tempo médio), impressões e CTR do YouTube e taxa de pulo do Instagram, por post. Dado que a rede não entrega vem `null`, com o motivo em `retention.message`. Exige a permissão `yt-analytics.readonly`, que a conexão do YouTube já pede (canais conectados antes dela precisam reautorizar uma vez).",
  "insights.retention.item": "Curva de retenção de um post (`:item` é o id do post) e as métricas de alcance dele. Mesmo estado e mensagem da rota de lista.",
  "insights.import": "Importa o histórico do YouTube, do Buffer (Instagram) e do TikTok (todas as contas conectadas; `channel` junto com `network` limita a uma).",
  "content.list": "Tudo o que já foi publicado (pelo Praeko e importado).",
  "youtube.videos": "Vídeos do canal (inclusive privados e agendados); `channel` escolhe a conta.", "youtube.video": "Um vídeo do canal.",
  "youtube.editVideo": "Edita título, descrição e tags de um vídeo (com `dryRun: true` só mostra o antes e o depois, sem gravar).",
  "youtube.comments": "Threads de comentários do canal (`channel` escolhe a conta).", "youtube.reply": "Responde a uma thread (escreve no YouTube de verdade).",
  "youtube.resolve": "Marca uma thread como resolvida (só no Praeko).", "youtube.reopen": "Reabre uma thread resolvida.",
  "instagram.media": "A grade de posts do perfil (API da Meta).", "instagram.comments": "Comentários do Instagram (API da Meta).",
  "instagram.reply": "Responde a um comentário (escreve no Instagram de verdade).", "instagram.hide": "Oculta ou reexibe um comentário.",
  "instagram.resolve": "Marca um comentário como resolvido (só no Praeko).", "instagram.reopen": "Reabre um comentário resolvido.",
  "comments.list": "Comentários de todas as redes juntos, de TODAS as contas ativas de cada rede (cada comentário traz `channel`; `channel` filtra uma conta; uma conta que falha vai para `errors` e as outras respondem).",
  "mentions.list": "Menções (Instagram por marcação; o YouTube não tem).",
  "apiKeys.list": "Lista as chaves de API (nunca o segredo).", "apiKeys.create": "Cria uma chave. O segredo aparece UMA vez, na resposta.", "apiKeys.revoke": "Revoga uma chave (não dá para revogar a que está fazendo a chamada).",
  "usage.get": "Uso da API deste workspace nos últimos `days` (1 a 30, padrão 7, em UTC): total, com sucesso (< 400), erros, duração p95, pico de requisições em um minuto contra o limite por minuto, `byDay`, `byHour` (só com days=1: as últimas 24 horas) e `byKey` (`session` = o painel).",
  "usage.log": "Log das requisições, da mais nova para a mais antiga, guardado por 30 dias; só metadados (método, rota sem ids, status, duração, chave), nunca corpos, cabeçalhos nem query. Filtros: `key` (id ou `session`), `status` (`2xx`, `3xx`, `4xx`, `5xx` ou um código), `route` (trecho), `method`, `days` (1 a 30); `limit` (1 a 200, padrão 50) e `cursor` (o `next` da página anterior).",
  "preferences.get": "Preferências do painel de quem está logado neste workspace (uma chave de API lê a linha do workspace): `theme`, `language` e `notifications` por evento, com os sinais `email` e `panel`. O que falta volta com o padrão (tema escuro, pt-BR, sem e-mail, painel ligado).",
  "preferences.put": "Muda as preferências. Parcial (só muda o que for enviado) e estrito (campo ou valor desconhecido dá 422 `invalid_field`). Devolve as preferências completas. Os e-mails de `postSent`, `postFailed` e `scheduledFail` saem quando `email` é true; `weeklySummary` e `newComment` são guardados, mas ainda não há quem envie.",
  "webhooks.list": "Webhooks de saída deste workspace (nunca o segredo: só `secretHint`), com o sucesso das entregas dos últimos 7 dias (`recentDeliveries`) e os `events` que dá para assinar.",
  "webhooks.create": "Cria um webhook. A `url` precisa ser https e de um host público (IP privado, localhost e endereços de metadados de nuvem são recusados com `unsafe_url`). O `secret` de assinatura volta UMA vez. No máximo 10 por workspace.",
  "webhooks.get": "Um webhook (sem o segredo).",
  "webhooks.update": "Muda `url`, `events` ou `active`; só vai o que mudou. Pausar descarta as entregas pendentes; reativar zera a contagem de falhas.",
  "webhooks.delete": "Apaga um webhook e o histórico das entregas dele.",
  "webhooks.test": "Envia agora um evento `ping.test` (mesmo com o webhook pausado) e devolve o resultado em `delivery`. Não conta para a desativação automática.",
  "webhooks.deliveries": "Entregas recentes, da mais nova para a mais antiga (`limit` de 1 a 100, padrão 20; guardadas por 30 dias): evento, estado (pending, delivered, failed, discarded), tentativas, último status HTTP e erro, duração.",
  "webhooks.redeliver": "Reenvia uma entrega agora, com o mesmo id `Praeko-Delivery` (quem recebe consegue deduplicar).",
  "webhooks.rotateSecret": "Troca o segredo de assinatura: o novo `secret` volta UMA vez e o antigo para de assinar na hora.",
  "ideas.list": "O quadro de ideias deste workspace (a tela Criar), da mais nova para a mais antiga: `title`, `note`, `group` (idea, scripting, ready, posted), `tags` (a primeira é a série), `createdAt` e `updatedAt`.",
  "ideas.create": "Adiciona uma ideia. No máximo 2000 por workspace.",
  "ideas.import": "Adiciona várias ideias de uma vez (até 500 por chamada), como o painel faz com as ideias que guardava no navegador. Um item cujo `id` já foi importado é pulado (`skippedCount`), então repetir a chamada nunca duplica. Itens sem `title` válido são pulados.",
  "ideas.update": "Muda `title`, `note`, `group` (mover o cartão) ou `tags`; o que não for enviado fica.",
  "ideas.delete": "Apaga uma ideia.",
};
/** Título e descrição em português de uma rota (HEAD tem texto próprio). */
export const tituloDe = (r) => TITULOS[r.key] || "";
export const resumoDe = (r) => RESUMOS[`${r.key}#${r.method}`] || RESUMOS[r.key] || r.summary;

// ---------------------------------------------------------------------------------------------------------------- esquema do corpo
const f = (name, type, desc, o = {}) => ({ name, type, desc, ...o });
const texto = (name, desc, o) => f(name, "string", desc, o);
const lista = (name, desc, o) => f(name, "array", desc, o);
const ISO = "Data e hora ISO 8601 em UTC, por exemplo `2026-11-14T20:30:00Z`.";
const EVENTOS = ["post.sent", "post.failed", "post.scheduled-fail"];
const IDIOMAS = ["pt-BR", "en"], TEMAS = ["light", "dark", "system"];
const flagsAviso = (quem) => f(quem, "object", "Onde avisar este evento.", { fields: [f("email", "boolean", "Avisar por e-mail."), f("panel", "boolean", "Avisar no painel.")] });

const CORPO = {
  "webhooks.create": {
    fields: [
      texto("url", "Endereço que recebe os eventos. Precisa ser https, de um domínio público (sem usuário e senha; IP privado, localhost e nomes internos são recusados com `unsafe_url`).", { required: true, maxLength: 2048 }),
      lista("events", "Eventos que disparam o webhook. Pelo menos um.", { items: "string", enum: EVENTOS, default: ["post.sent", "post.failed"] }),
      f("active", "boolean", "Se o webhook começa ligado.", { default: true }),
    ],
    example: { url: "https://exemplo.com.br/hooks/praeko", events: ["post.sent", "post.failed"], active: true },
  },
  "webhooks.update": {
    fields: [
      texto("url", "Novo endereço (as mesmas regras de `POST /v1/webhooks`). Sem ele, a url não muda.", { maxLength: 2048 }),
      lista("events", "Nova lista de eventos (substitui a anterior; pelo menos um). Sem ela, não muda.", { items: "string", enum: EVENTOS }),
      f("active", "boolean", "`false` pausa (as entregas pendentes são descartadas); `true` reativa e zera a contagem de falhas seguidas."),
    ],
    example: { events: ["post.sent", "post.failed", "post.scheduled-fail"], active: true },
    nota: "Envie só os campos que quer mudar; um corpo `{}` não muda nada.",
  },
  "ideas.create": {
    fields: [
      texto("title", "Título da ideia.", { required: true, minLength: 1, maxLength: 200 }),
      texto("note", "Anotações livres.", { maxLength: 5000, default: "" }),
      texto("group", "Coluna do quadro.", { enum: ["idea", "scripting", "ready", "posted"], default: "idea" }),
      lista("tags", "Etiquetas (a primeira é a série). Repetidas e vazias são ignoradas.", { items: "string", maxItems: 20, maxItemLength: 40 }),
    ],
    example: { title: "O bug que só aparecia na segunda-feira", note: "Gravar o passo a passo do teste que falhava de segunda.", group: "scripting", tags: ["bastidores", "testes"] },
  },
  "ideas.import": {
    fields: [
      lista("ideas", "Ideias a importar (até 500 por chamada).", { required: true, items: "object", maxItems: 500, fields: [
        texto("id", "Id de origem (até 64 caracteres). Um id já importado é pulado, o que torna a chamada repetível."),
        texto("title", "Título (1 a 200 caracteres; mais longo é cortado). Sem título válido o item é pulado.", { required: true }),
        texto("note", "Anotações (até 5000 caracteres; mais longo é cortado)."),
        texto("group", "Coluna do quadro; valor desconhecido vira `idea`.", { enum: ["idea", "scripting", "ready", "posted"], default: "idea" }),
        lista("tags", "Etiquetas (até 20, 40 caracteres cada; o excesso é cortado).", { items: "string" }),
        texto("createdAt", "Data de criação original (ISO 8601). Só vale se for válida e não for futura; senão, agora."),
      ] }),
    ],
    example: { ideas: [{ id: "local-1", title: "Como o painel guarda as ideias", group: "idea", tags: ["painel"], createdAt: "2026-10-28T14:00:00Z" }, { id: "local-2", title: "Roteiro: 364 mil requisições para 42 heróis", note: "Mostrar o gráfico do log.", group: "ready", tags: ["bastidores"] }] },
  },
  "ideas.update": {
    fields: [
      texto("title", "Novo título.", { minLength: 1, maxLength: 200 }), texto("note", "Novas anotações.", { maxLength: 5000 }),
      texto("group", "Mover o cartão para esta coluna.", { enum: ["idea", "scripting", "ready", "posted"] }),
      lista("tags", "Nova lista de etiquetas (substitui a anterior).", { items: "string", maxItems: 20, maxItemLength: 40 }),
    ],
    example: { group: "ready", tags: ["bastidores", "testes", "serie-bugs"] },
    nota: "Envie só o que muda; os campos omitidos ficam como estão.",
  },
  "apiKeys.create": {
    fields: [
      texto("name", "Nome para você reconhecer a chave.", { required: true, minLength: 1, maxLength: 60 }),
      texto("scope", "Escopo da chave (cada nível inclui o anterior).", { enum: ["read", "write", "admin"], default: "write" }),
      f("expiresInDays", "integer", "Validade em dias. Sem ele a chave não expira.", { min: 1, max: 365 }),
    ],
    example: { name: "automação do roteiro", scope: "write", expiresInDays: 90 },
  },
  "preferences.put": {
    fields: [
      texto("theme", "Tema do painel.", { enum: TEMAS }), texto("language", "Idioma do painel.", { enum: IDIOMAS }),
      f("notifications", "object", "Avisos por evento. Só os eventos enviados mudam.", { fields: ["postSent", "postFailed", "scheduledFail", "weeklySummary", "newComment"].map(flagsAviso) }),
    ],
    fechado: true,
    example: { theme: "dark", language: "pt-BR", notifications: { postFailed: { email: true, panel: true }, weeklySummary: { email: false } } },
    nota: "Estrito: campo ou valor desconhecido dá 422 `invalid_field`. Parcial: só o que for enviado muda.",
  },
  "media.create": {
    fields: [
      texto("type", "Tipo da mídia.", { required: true, enum: ["video", "cover"] }),
      texto("name", "Nome do arquivo (guardado com os caracteres seguros).", { required: true, minLength: 1, maxLength: 200 }),
      texto("mime", "Tipo do arquivo. Vídeo: `video/mp4` ou `video/quicktime`. Capa: `image/png` ou `image/jpeg`.", { required: true, enum: ["video/mp4", "video/quicktime", "image/png", "image/jpeg"] }),
      f("size", "integer", "Tamanho em bytes. Vídeo até 5 GiB; capa até 20 MiB.", { required: true, min: 1, max: 5 * 1024 ** 3 }),
      f("simple", "boolean", "`true` envia o arquivo todo em um `PUT /v1/media/:id/content` (só até 50 MB). Sem ele, o envio é em partes.", { default: false }),
      texto("sha256", "Hash SHA-256 do arquivo, se quiser guardá-lo."),
    ],
    example: { type: "video", name: "dia-06-o-teste-que-falhava.mp4", mime: "video/mp4", size: 48230114, simple: true },
  },
  "channels.slots.put": {
    fields: [
      texto("timezone", "Fuso horário IANA do canal. Sem ele, mantém o atual.", { maxLength: 64 }),
      lista("slots", "Os horários semanais (substituem TODOS os atuais; no máximo 100). Cada um é um texto `\"fri 17:30\"` ou um objeto `{ \"day\": \"fri\", \"time\": \"17:30\" }`. Dias: sun, mon, tue, wed, thu, fri, sat (ou `weekday` de 0 a 6). Hora: HH:MM de 00:00 a 23:59. Repetidos viram um só.", { required: true, items: "string|object", maxItems: 100 }),
    ],
    example: { timezone: "America/Sao_Paulo", slots: ["mon 12:00", "fri 17:30", { day: "sun", time: "22:00" }] },
  },
  "channels.followers.put": {
    fields: [
      f("value", "integer", "Quantidade de seguidores.", { required: true, min: 0, max: 1e9 }),
      texto("day", "Dia do registro, `AAAA-MM-DD`, no máximo amanhã. Sem ele, hoje no fuso do canal.", { pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
    ],
    example: { value: 1842, day: "2026-11-06" },
    nota: "Só vale para `instagram` (no TikTok e no YouTube os seguidores já vêm da API; a rede errada dá 409 `followers_from_api`).",
  },
  "connections.instagramToken": {
    fields: [
      texto("token", "Token de acesso da API da Meta (Instagram).", { required: true, minLength: 20, maxLength: 4000 }),
      texto("userId", "Id numérico da conta do Instagram.", { required: true, maxLength: 40, pattern: "^\\d+$" }),
      texto("host", "Servidor da Meta.", { enum: ["https://graph.facebook.com", "https://graph.instagram.com"], default: "https://graph.facebook.com" }),
      texto("username", "Usuário, usado só se a Meta não devolver o nome."), texto("type", "Tipo da conta.", { default: "BUSINESS" }),
    ],
    example: { token: "IGAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", userId: "17841400000000000", host: "https://graph.instagram.com" },
    nota: "O token do exemplo é só um molde: use o seu. O servidor confere o token na Meta antes de guardar.",
  },
  "posts.create": {
    fields: [
      texto("title", "Título do post. Obrigatório, a não ser que `texts.youtube.title` exista.", { maxLength: 200 }),
      texto("baseText", "Texto base, guardado junto ao post."),
      f("media", "object", "Mídias do post (ids de `POST /v1/media`, já completadas).", { required: true, fields: [texto("video", "Id da mídia de vídeo.", { required: true }), texto("cover", "Id da mídia de capa (PNG ou JPEG).")] }),
      f("texts", "object", "Textos por rede. Cada rede de `items` precisa ter o seu `text`.", { required: true, fields: [
        f("youtube", "object", "Textos do YouTube.", { fields: [texto("title", "Título do vídeo (até 100 caracteres; mais longo é cortado)."), texto("text", "Descrição.", { required: true }), texto("pinnedComment", "Comentário fixo, publicado depois que o vídeo fica público.")] }),
        f("instagram", "object", "Textos do Instagram.", { fields: [texto("text", "Legenda: até 2200 caracteres e 30 hashtags.", { required: true }), texto("pinnedComment", "Comentário fixo.")] }),
        f("tiktok", "object", "Textos do TikTok.", { fields: [texto("text", "Legenda: até 2200 caracteres.", { required: true })] }),
      ] }),
      lista("items", "Um item por rede (não pode repetir a rede).", { required: true, items: "object", fields: [
        texto("network", "Rede do item.", { required: true, enum: ["youtube", "instagram", "tiktok"] }),
        texto("channel", "Id da conta daquela rede (de `GET /v1/channels`). Sem ele, o canal padrão."),
        texto("mode", "Como publicar. YouTube: `private`, `scheduled` ou `public`. TikTok: `draft` ou `direct`. Instagram: `now`.", { enum: ["private", "scheduled", "public", "draft", "direct", "now"], default: "private no YouTube, draft no TikTok, now no Instagram" }),
        texto("scheduledFor", `Horário fixo da publicação. ${ISO} No mínimo 30 s à frente (Instagram: 5 min pelo Buffer, 25 min pela Meta; YouTube \`scheduled\`: 5 min).`),
        f("queue", "boolean", "`true` usa o próximo horário livre do canal (veja `PUT /v1/channels/:network/slots`)."),
        texto("via", "Só Instagram: por onde publicar.", { enum: ["meta", "buffer"] }),
        f("replaces", "object", "Só Instagram com `via: meta`: apaga este post do Buffer ao publicar.", { fields: [texto("provider", "Sempre `buffer`.", { required: true, enum: ["buffer"] }), texto("id", "Id do post no Buffer.", { required: true })] }),
        f("media", "object", "Mídias só deste item (trocam as do post).", { fields: [texto("video", "Id da mídia de vídeo."), texto("cover", "Id da mídia de capa.")] }),
      ] }),
      f("queue", "boolean", "Vale para todos os itens que não trouxerem `queue` nem `scheduledFor`."),
      f("draft", "boolean", "`true` cria tudo como rascunho (sem horário obrigatório).", { default: false }),
      f("options", "object", "Opções por rede e gerais.", { fields: [
        texto("format", "`long` marca o post como vídeo longo (sem ele, é um Short).", { enum: ["long"] }),
        f("youtube", "object", "Opções do YouTube.", { fields: [texto("mode", "O mesmo de `items[].mode`.", { enum: ["private", "scheduled", "public"] }), texto("categoryId", "Categoria do vídeo.", { default: "28" }), lista("tags", "Etiquetas do vídeo.", { items: "string" }), f("notifySubscribers", "boolean", "Avisar os inscritos."), f("comment", "boolean", "`false` não publica o comentário fixo.")] }),
        f("tiktok", "object", "Opções do TikTok.", { fields: [texto("mode", "O mesmo de `items[].mode`.", { enum: ["draft", "direct"] }), texto("privacy", "Quem vê.", { enum: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"], default: "SELF_ONLY" }), f("coverFrameMs", "integer", "Quadro do vídeo usado como capa, em milissegundos.", { min: 0 }), f("disableComments", "boolean", "Desligar comentários."), f("disableDuet", "boolean", "Desligar dueto."), f("disableStitch", "boolean", "Desligar stitch."), f("commercialContent", "boolean", "Conteúdo comercial (exige `ownBrand` e/ou `thirdPartyBrand`)."), f("ownBrand", "boolean", "Divulga a própria marca."), f("thirdPartyBrand", "boolean", "Divulga marca de terceiros (não pode ser `SELF_ONLY` no modo `direct`).")] }),
        f("instagram", "object", "Opções do Instagram.", { fields: [texto("via", "Por onde publicar.", { enum: ["meta", "buffer"] }), f("shareToFeed", "boolean", "Mostrar também no feed.", { default: true }), f("coverFrameMs", "integer", "Quadro do vídeo usado como capa, em milissegundos.", { min: 0 })] }),
      ] }),
      lista("tags", "Etiquetas do post (até 40 caracteres cada).", { items: "string", maxItemLength: 40 }),
      texto("id", "Id escolhido por você (3 a 64 caracteres entre letras, números, `-` e `_`). Sem ele, o servidor gera. Repetido dá 409 `id_exists`.", { pattern: "^[A-Za-z0-9_-]{3,64}$" }),
      texto("origin", "Quem criou o post (texto livre; padrão `api`)."),
    ],
    example: { title: "O teste que só falhava na segunda", media: { video: IDS_EXEMPLO.midiaVideo }, texts: { youtube: { title: "O teste que só falhava na segunda", text: "Um teste que passava de terça a domingo. O que ele escondia.\n\n#programação #testes" } }, items: [{ network: "youtube", mode: "scheduled", scheduledFor: DATA_FUTURA }], tags: ["bastidores"] },
    nota: "O servidor devolve 422 `invalid_request` com a lista completa dos problemas em `details.errors`. A mídia precisa estar `ready` (completa).",
  },
  "posts.adopt": {
    fields: [
      texto("title", "Título do post.", { required: true, minLength: 1, maxLength: 200 }),
      texto("network", "Rede do post. Hoje só `instagram`.", { enum: ["instagram"], default: "instagram" }),
      texto("scheduledFor", `Horário em que o Reel sai. ${ISO} No passado, o post entra como já enviado.`, { required: true }),
      f("external", "object", "Onde o post está agendado fora do Praeko.", { required: true, fields: [texto("provider", "Sempre `buffer`.", { required: true, enum: ["buffer"] }), texto("id", "Id do post no Buffer.", { required: true })] }),
      f("texts", "object", "Textos.", { fields: [f("instagram", "object", "Legenda do Reel.", { fields: [texto("text", "Legenda.")] })] }),
      texto("text", "Legenda, se não usar `texts.instagram.text`."),
      f("media", "object", "Mídias só para exibição no painel.", { fields: [texto("video", "Id da mídia de vídeo."), texto("cover", "Id da mídia de capa (dá a miniatura).")] }),
      lista("tags", "Etiquetas (até 40 caracteres cada).", { items: "string", maxItemLength: 40 }),
      texto("id", "Id do post no Praeko (3 a 64 caracteres entre letras, números, `-` e `_`).", { pattern: "^[A-Za-z0-9_-]{3,64}$" }),
    ],
    example: { title: "Reel de segunda: o teste que falhava", network: "instagram", scheduledFor: DATA_FUTURA, external: { provider: "buffer", id: "6720a1b3c4d5e6f708192a3b" }, texts: { instagram: { text: "O teste que só falhava na segunda. #programação" } }, tags: ["bastidores"] },
  },
  "posts.update": {
    fields: [
      texto("title", "Novo título.", { minLength: 1, maxLength: 200 }),
      f("texts", "object", "Textos por rede que mudam. Os campos enviados substituem; os outros ficam. Um `text` não pode ficar vazio nem trazer marcador como `[LINK_DO_LONGO]`.", { fields: [f("youtube", "object", "Textos do YouTube.", { fields: [texto("title", "Título."), texto("text", "Descrição."), texto("pinnedComment", "Comentário fixo.")] }), f("instagram", "object", "Textos do Instagram.", { fields: [texto("text", "Legenda."), texto("pinnedComment", "Comentário fixo.")] }), f("tiktok", "object", "Textos do TikTok.", { fields: [texto("text", "Legenda.")] })] }),
      f("media", "object", "Troca de mídia.", { fields: [texto("cover", "Id da nova capa (ou `null` para tirar)."), texto("video", "Id do novo vídeo (só em post adotado ou ainda em rascunho; senão 409 `media_locked`).")] }),
      lista("tags", "Etiquetas (substituem as atuais).", { items: "string" }),
      lista("items", "Itens a editar, escolhidos por `id` ou por `network`. Só dá para editar item ainda pendente.", { items: "object", fields: [
        texto("id", "Id do item."), texto("network", "Rede do item (alternativa ao `id`).", { enum: ["youtube", "instagram", "tiktok"] }),
        texto("mode", "Novo modo (YouTube: private, scheduled, public; TikTok: draft, direct).", { enum: ["private", "scheduled", "public", "draft", "direct", "now"] }),
        texto("scheduledFor", `Novo horário fixo. ${ISO}`), f("queue", "boolean", "Volta para o próximo horário livre do canal."), f("draft", "boolean", "Vira rascunho."),
        texto("privacy", "TikTok: quem vê.", { enum: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"] }), f("coverFrameMs", "integer", "TikTok: quadro da capa em milissegundos.", { min: 0 }),
      ] }),
      texto("moveTo", "Move TODOS os itens editáveis para rascunho ou para a fila.", { enum: ["draft", "queue"] }),
    ],
    example: { title: "O teste que só falhava na segunda (versão final)", tags: ["bastidores", "testes"], items: [{ network: "youtube", scheduledFor: DATA_FUTURA }] },
    nota: "Envie só o que muda. Um post adotado do Buffer só aceita texto, horário e rascunho (o resto dá 409 `post_adopted`).",
  },
  "posts.youtubeSchedule": {
    fields: [texto("scheduledFor", `Quando o vídeo fica público. ${ISO}`, { required: true })],
    example: { scheduledFor: DATA_FUTURA },
    nota: "Sem `scheduledFor` o servidor responde 422 `missing_time`. O post precisa ter um vídeo já enviado ao YouTube (senão 404 `no_video`).",
  },
  "youtube.editVideo": {
    fields: [
      texto("title", "Novo título (1 a 100 caracteres, sem `<` nem `>`).", { maxLength: 100 }),
      texto("description", "Nova descrição (até 5000 caracteres; `\"\"` limpa).", { maxLength: 5000 }),
      lista("tags", "Novas etiquetas (todas juntas, até 500 caracteres).", { items: "string" }),
      f("dryRun", "boolean", "`true` só devolve o antes e o depois, sem gravar no YouTube.", { default: false }),
    ],
    example: { title: "O teste que só falhava na segunda", tags: ["programação", "testes"], dryRun: true },
    nota: "Pelo menos um entre `title`, `description` e `tags`. Comece com `dryRun: true`.",
  },
  "youtube.reply": {
    fields: [texto("text", "Texto da resposta.", { required: true, minLength: 1, maxLength: 10000 })],
    example: { text: "Valeu por assistir! O código do teste está na descrição." },
  },
  "instagram.reply": {
    fields: [texto("text", "Texto da resposta.", { required: true, minLength: 1, maxLength: 2200 })],
    example: { text: "Obrigado! Foi uma segunda-feira difícil mesmo." },
  },
  "instagram.hide": {
    fields: [f("hide", "boolean", "`true` oculta; `false` reexibe.", { default: true })],
    example: { hide: true },
    nota: "O corpo é opcional: sem ele, o comentário é ocultado.",
  },
};

// ---------------------------------------------------------------------------------------------------------------- consulta (query string)
const q = (name, desc, o = {}) => ({ name, desc, ...o });
const CANAL = q("channel", "Id da conta quando a rede tem várias (de `GET /v1/channels`). Sem ele, o canal padrão.");
const CONSULTA = {
  "connections.start": [q("replace", "Só `meta`: `true` troca o token de uma conexão existente.", { type: "boolean" }), q("add", "Só `meta`: `true` conecta OUTRA conta como novo canal.", { type: "boolean" }), q("probe", "Só `meta`: `true` só relata, não grava.", { type: "boolean" })],
  "connections.disconnect": [CANAL], "channels.avatar": [CANAL], "tiktok.creator": [CANAL], "channels.slots.get": [CANAL], "channels.slots.put": [CANAL], "channels.followers.put": [CANAL], "channels.followers.get": [CANAL],
  "media.list": [q("type", "Filtra por tipo.", { enum: ["video", "cover"] })],
  "posts.list": [q("state", "Filtra pelo estado.", { enum: ["queued", "draft", "sent", "error", "canceled"] }), q("channel", "Id do canal ou nome da rede."), q("tag", "Nome de uma etiqueta."), q("limit", "Itens por página (1 a 200).", { type: "integer", default: "50" }), q("offset", "Quantos pular.", { type: "integer", default: "0" })],
  "posts.publishNow": [q("network", "Publica só os itens desta rede.", { enum: ["youtube", "instagram", "tiktok"] })],
  "calendar.get": [q("from", "Início do período (ISO 8601)."), q("to", "Fim do período (ISO 8601).")],
  "insights.get": [CANAL],
  "insights.import": [q("network", "Limita a uma rede (`all` importa todas).", { enum: ["all", "youtube", "instagram", "tiktok"] }), CANAL],
  "youtube.videos": [CANAL, q("max", "Itens por página (até 50).", { type: "integer", default: "20" }), q("page", "Token da próxima página (o `next` da resposta anterior).")],
  "youtube.comments": [CANAL, q("video", "Só as threads deste vídeo."), q("unanswered", "`true` mostra só o que falta responder.", { type: "boolean" }), q("sort", "Ordem.", { enum: ["recent", "comments", "views"] }), q("max", "Itens por página (até 100).", { type: "integer", default: "20" }), q("page", "Token da próxima página.")],
  "instagram.media": [q("max", "Itens por página (até 50).", { type: "integer", default: "25" }), q("page", "Token da próxima página.")],
  "comments.list": [q("network", "Limita a uma rede (`all` junta todas).", { enum: ["all", "youtube", "instagram"] }), CANAL],
  "usage.get": [q("days", "Quantos dias olhar (1 a 30).", { type: "integer", default: "7" })],
  "usage.log": [q("key", "Id de uma chave ou `session` (o painel)."), q("status", "`2xx`, `3xx`, `4xx`, `5xx` ou um código."), q("route", "Trecho da rota."), q("method", "Método HTTP."), q("days", "Quantos dias olhar (1 a 30).", { type: "integer" }), q("limit", "Itens por página (1 a 200).", { type: "integer", default: "50" }), q("cursor", "O `next` da página anterior.")],
  "webhooks.deliveries": [q("limit", "Quantas entregas (1 a 100).", { type: "integer", default: "20" })],
};
// ---------------------------------------------------------------------------------------------------------------- cabeçalho Idempotency-Key
/** O cabeçalho `Idempotency-Key`. Só as rotas autenticadas de POST, PATCH e DELETE o aceitam (veja `aceitaIdempotencia`); sem ele, nada muda. */
export const CABECALHO_IDEMPOTENCIA = {
  name: "Idempotency-Key", type: "string", minLength: 1, maxLength: 255,
  desc: "Chave de idempotência (1 a 255 caracteres visíveis, por exemplo um UUID). Repetir o MESMO pedido com a mesma chave, em até 24 h, devolve a resposta guardada (com `Idempotent-Replayed: true`) sem executar de novo; outro pedido com a mesma chave dá 422 `idempotency_key_reuse`; um pedido ainda em andamento dá 409 `idempotency_in_progress`. Erros 5xx não são guardados. A chave vale por workspace e por rota. Veja docs/idempotencia.md.",
  example: "7f0c2a3e-5b8d-4f1a-9c64-2d1e8b7a4c90",
};
/** A rota aceita `Idempotency-Key`? Autenticada, método que muda estado (POST, PATCH, DELETE) e corpo que não é binário (partes e upload simples da mídia ficam de fora: são bytes crus e já são repetíveis). */
export const aceitaIdempotencia = (r) => r.scope !== "public" && ["POST", "PATCH", "DELETE"].includes(r.method) && r.body !== "bytes" && !r.raw;
/** Cabeçalhos de pedido documentados de uma rota (hoje só o `Idempotency-Key`). */
export const cabecalhosDe = (r) => (aceitaIdempotencia(r) ? [CABECALHO_IDEMPOTENCIA] : []);

/** Parâmetros de consulta documentados de uma rota. */
export const consultaDe = (r) => CONSULTA[r.key] || [];

// ---------------------------------------------------------------------------------------------------------------- respostas de exemplo
const ISO1 = "2026-11-07T14:02:11.482Z";
const webhook = (extra = {}) => ({ id: IDS_EXEMPLO.webhook, url: "https://exemplo.com.br/hooks/praeko", events: ["post.sent", "post.failed"], active: true, secretHint: "whsec_…k3Qw", consecutiveFailures: 0, createdAt: ISO1, updatedAt: ISO1, ...extra });
const itemPost = { id: IDS_EXEMPLO.item, network: "youtube", channel: "01KA3V0R5D8M2WQ7X4HT9NZ1BF", state: "scheduled", scheduledFor: "2026-11-10T20:30:00.000Z", custom: true, mode: "scheduled", runAt: "2026-11-10T19:30:00.000Z" };
const post = { id: IDS_EXEMPLO.post, title: "O teste que só falhava na segunda (versão final)", state: "queued", type: "short", origin: "api", media: { video: IDS_EXEMPLO.midiaVideo, cover: null }, texts: { youtube: { title: "O teste que só falhava na segunda", text: "Um teste que passava de terça a domingo. O que ele escondia.\n\n#programação #testes" } }, tags: ["bastidores", "testes"], thumb: null, items: [{ ...itemPost, thumb: null }], createdAt: ISO1, updatedAt: "2026-11-07T15:40:03.120Z", actions: [] };
const prefs = { theme: "dark", language: "pt-BR", notifications: { postSent: { email: false, panel: true }, postFailed: { email: true, panel: true }, scheduledFail: { email: false, panel: true }, weeklySummary: { email: false, panel: true }, newComment: { email: false, panel: true } } };

const RESPOSTA = {
  "webhooks.create": { status: 200, exemplo: webhook({ secret: "whsec_8vN2xQe4L1mTz7Hc0Yb5Wd3KfRj6PaUo9GtSi2XnVEw", warning: "guarde este segredo agora: ele não aparece de novo" }) },
  "webhooks.update": { status: 200, exemplo: webhook({ events: ["post.sent", "post.failed", "post.scheduled-fail"] }) },
  "webhooks.get": { status: 200, exemplo: webhook() },
  "webhooks.list": { status: 200, exemplo: { webhooks: [webhook({ recentDeliveries: { total: 12, ok: 12 } })], events: ["post.sent", "post.failed", "post.scheduled-fail"] } },
  "ideas.create": { status: 200, exemplo: { id: IDS_EXEMPLO.ideia, title: "O bug que só aparecia na segunda-feira", note: "Gravar o passo a passo do teste que falhava de segunda.", group: "scripting", tags: ["bastidores", "testes"], createdAt: ISO1, updatedAt: ISO1 } },
  "ideas.update": { status: 200, exemplo: { id: IDS_EXEMPLO.ideia, title: "O bug que só aparecia na segunda-feira", note: "Gravar o passo a passo do teste que falhava de segunda.", group: "ready", tags: ["bastidores", "testes", "serie-bugs"], createdAt: ISO1, updatedAt: "2026-11-07T15:40:03.120Z" } },
  "ideas.import": { status: 200, exemplo: { imported: 2, skippedCount: 0 } },
  "apiKeys.create": { status: 200, exemplo: { id: IDS_EXEMPLO.chave, name: "automação do roteiro", scope: "write", prefix: "praeko_8vN2xQe", expiresAt: "2027-02-05T14:02:11.482Z", key: "praeko_8vN2xQe4L1mTz7Hc0Yb5Wd3KfRj6PaUo9GtSi2XnVEwqLs", warning: "guarde esta chave agora: ela não aparece de novo" } },
  "connections.instagramToken": { status: 200, exemplo: { connected: true, username: "dev.ocioso", followers: 1842, mediaItems: 37, host: "https://graph.instagram.com" } },
  "preferences.put": { status: 200, exemplo: prefs },
  "preferences.get": { status: 200, exemplo: prefs },
  "media.create": { status: 200, exemplo: { id: IDS_EXEMPLO.midiaVideo, state: "uploading", uploadHint: `PUT /v1/media/${IDS_EXEMPLO.midiaVideo}/content` } },
  "channels.slots.put": { status: 200, exemplo: { network: "youtube", timezone: "America/Sao_Paulo", slots: [{ weekday: 0, day: "sun", time: "22:00", active: true }, { weekday: 1, day: "mon", time: "12:00", active: true }, { weekday: 5, day: "fri", time: "17:30", active: true }], rescheduled: [] } },
  "channels.followers.put": { status: 200, exemplo: { network: "instagram", day: "2026-11-06", followers: 1842, source: "manual" } },
  "posts.create": { status: 201, exemplo: { id: IDS_EXEMPLO.post, items: [itemPost] } },
  "posts.update": { status: 200, exemplo: post },
  "posts.get": { status: 200, exemplo: post },
  "posts.youtubeSchedule": { status: 200, exemplo: { id: IDS_EXEMPLO.video, publishAt: "2026-11-10T20:30:00.000Z", privacy: "private", url: `https://youtu.be/${IDS_EXEMPLO.video}` } },
  "youtube.editVideo": { status: 200, exemplo: { id: IDS_EXEMPLO.video, before: { title: "O teste que falhava", description: "", tags: [] }, after: { title: "O teste que só falhava na segunda", description: "", tags: ["programação", "testes"] }, changed: true, written: false } },
  "youtube.reply": { status: 200, exemplo: { id: "UgzK3n8vYb2Qx4mH7dB4AaABAg.9xYz", parentId: IDS_EXEMPLO.comentario, text: "Valeu por assistir! O código do teste está na descrição." } },
  "instagram.reply": { status: 200, exemplo: { id: "17900123456789012", parentId: "17858893269123456", text: "Obrigado! Foi uma segunda-feira difícil mesmo." } },
  "instagram.hide": { status: 200, exemplo: { id: "17858893269123456", hidden: true, ok: true } },
  "webhooks.delete": { status: 200, exemplo: { deleted: IDS_EXEMPLO.webhook } },
  "ideas.delete": { status: 200, exemplo: { deleted: IDS_EXEMPLO.ideia } },
  "apiKeys.revoke": { status: 200, exemplo: { revoked: IDS_EXEMPLO.chave } },
  "ideas.list": { status: 200, exemplo: { ideas: [{ id: IDS_EXEMPLO.ideia, title: "O bug que só aparecia na segunda-feira", note: "", group: "idea", tags: ["bastidores"], createdAt: ISO1, updatedAt: ISO1 }], total: 1 } },
  "webhooks.rotateSecret": { status: 200, exemplo: { id: IDS_EXEMPLO.webhook, secret: "whsec_3Tq9Zn1VbXc5Lm8Hd2Wk7RfYj0PaUo4GtSi6XnEwKe", secretHint: "whsec_…EwKe", warning: "guarde este segredo agora: ele não aparece de novo" } },
};

// ---------------------------------------------------------------------------------------------------------------- erros por rota
/** Erros que qualquer rota autenticada pode dar. */
export const ERROS_COMUNS = [
  [401, "unauthorized", "Faltou o cabeçalho `Authorization: Bearer …`."], [401, "invalid_api_key", "A chave não existe."], [401, "revoked_api_key", "A chave foi revogada."], [401, "expired_api_key", "A chave expirou."],
  [403, "forbidden", "O escopo da chave não basta para esta rota (veja o selo de escopo)."], [429, "rate_limited", "Passou do limite de requisições por minuto."],
];
const CORPO_ERROS = [[400, "empty_body", "O corpo veio vazio."], [400, "invalid_json", "O corpo não é um objeto JSON."], [413, "body_too_large", "O corpo passa de 1 MB."]];
const e = (status, code, desc) => [status, code, desc];
const ERROS = {
  "webhooks.create": [e(422, "invalid_field", "`url` ausente ou `events` vazio/desconhecido."), e(422, "unsafe_url", "A url não é https, aponta para rede privada ou localhost."), e(409, "webhook_limit_reached", "Já são 10 webhooks neste workspace.")],
  "webhooks.update": [e(404, "webhook_not_found", "O webhook não existe neste workspace."), e(422, "invalid_field", "`events` vazio ou com evento desconhecido."), e(422, "unsafe_url", "A nova url não é aceita.")],
  "ideas.create": [e(422, "invalid_field", "`title` ausente ou longo demais, `group` desconhecido, `tags` fora do limite."), e(409, "idea_limit_reached", "Já são 2000 ideias neste workspace.")],
  "ideas.import": [e(422, "invalid_field", "`ideas` não é uma lista ou passa de 500 itens."), e(409, "idea_limit_reached", "Passaria de 2000 ideias neste workspace.")],
  "ideas.update": [e(404, "idea_not_found", "A ideia não existe."), e(422, "invalid_field", "Algum campo fora do limite.")],
  "apiKeys.create": [e(422, "invalid_field", "`name` ausente, `scope` desconhecido ou `expiresInDays` fora de 1 a 365.")],
  "preferences.put": [e(422, "invalid_field", "Campo, evento, canal ou valor desconhecido.")],
  "media.create": [e(422, "invalid_field", "`type`, `mime`, `name` ou `size` inválidos."), e(422, "file_too_large", "`simple: true` com mais de 50 MB.")],
  "channels.slots.put": [e(422, "invalid_field", "Horário ou dia inválido, mais de 100 horários ou fuso desconhecido."), e(404, "channel_not_found", "A rede não está conectada."), e(404, "unknown_network", "Rede desconhecida.")],
  "channels.followers.put": [e(409, "followers_from_api", "A rede já traz os seguidores pela API (só `instagram` aceita valor manual)."), e(422, "invalid_field", "`value` ou `day` inválidos."), e(404, "channel_not_found", "Canal não conectado.")],
  "connections.instagramToken": [e(422, "invalid_field", "Token, `userId` ou `host` inválidos."), e(502, "instagram_error", "A Meta recusou o token.")],
  "posts.create": [e(422, "invalid_request", "Faltou algo; a lista completa vem em `details.errors`."), e(422, "invalid_field", "Id, canal, modo ou etiqueta inválidos."), e(422, "time_in_past", "O horário já passou ou está perto demais."), e(422, "missing_schedule", "Faltou `scheduledFor`, `queue` ou `draft`."), e(409, "channel_not_connected", "A rede não está conectada."), e(409, "no_slots", "`queue` num canal sem horários."), e(409, "id_exists", "Já existe um post com esse `id`."), e(409, "media_not_ready", "A mídia ainda não foi concluída."), e(422, "media_not_found", "A mídia não existe.")],
  "posts.adopt": [e(422, "invalid_field", "`external`, `scheduledFor` ou `id` inválidos."), e(409, "already_adopted", "Esse post do Buffer já está no Praeko."), e(409, "id_exists", "Já existe um post com esse `id`."), e(409, "channel_not_connected", "O Instagram não está conectado.")],
  "posts.update": [e(404, "post_not_found", "O post não existe."), e(404, "item_not_found", "O item não existe neste post."), e(409, "not_editable", "O item já saiu ou está em andamento."), e(409, "post_adopted", "Post adotado do Buffer: só texto, horário e rascunho mudam."), e(409, "media_locked", "O vídeo só troca em post adotado ou em rascunho."), e(422, "invalid_field", "Algum campo inválido.")],
  "posts.youtubeSchedule": [e(422, "missing_time", "Faltou `scheduledFor`."), e(404, "no_video", "O post não tem vídeo no YouTube ainda.")],
  "youtube.editVideo": [e(422, "invalid_field", "Título, descrição ou etiquetas fora do limite."), e(409, "youtube_not_connected", "O YouTube não está conectado."), e(502, "youtube_error", "O YouTube recusou.")],
  "youtube.reply": [e(422, "invalid_field", "`text` ausente ou com mais de 10000 caracteres."), e(502, "youtube_error", "O YouTube recusou.")],
  "instagram.reply": [e(422, "invalid_field", "`text` ausente ou com mais de 2200 caracteres."), e(409, "instagram_meta_not_connected", "A API da Meta não está conectada."), e(502, "instagram_error", "A Meta recusou.")],
  "instagram.hide": [e(409, "instagram_meta_not_connected", "A API da Meta não está conectada."), e(502, "instagram_error", "A Meta recusou.")],
  "webhooks.get": [e(404, "webhook_not_found", "O webhook não existe.")], "webhooks.delete": [e(404, "webhook_not_found", "O webhook não existe.")],
  "webhooks.test": [e(404, "webhook_not_found", "O webhook não existe.")], "webhooks.deliveries": [e(404, "webhook_not_found", "O webhook não existe."), e(422, "invalid_field", "`limit` fora de 1 a 100.")],
  "webhooks.redeliver": [e(404, "webhook_not_found", "O webhook não existe."), e(404, "delivery_not_found", "A entrega não existe.")],
  "webhooks.rotateSecret": [e(404, "webhook_not_found", "O webhook não existe.")],
  "ideas.delete": [e(404, "idea_not_found", "A ideia não existe.")],
  "apiKeys.revoke": [e(404, "api_key_not_found", "A chave não existe."), e(409, "api_key_in_use", "É a chave que está fazendo esta chamada.")],
  "posts.get": [e(404, "post_not_found", "O post não existe.")], "posts.cancel": [e(404, "post_not_found", "O post não existe.")],
  "media.get": [e(404, "media_not_found", "A mídia não existe.")], "media.delete": [e(404, "media_not_found", "A mídia não existe."), e(409, "media_in_use", "Um post pendente usa a mídia.")],
  "media.complete": [e(409, "parts_missing", "Falta alguma parte da sequência."), e(422, "size_mismatch", "O total enviado não bate com o `size` combinado."), e(422, "part_too_small", "Uma parte (que não a última) tem menos de 5 MiB.")],
};
/** Erros específicos de uma rota (os do corpo JSON entram junto quando há corpo). */
export const ERROS_IDEMPOTENCIA = [[422, "idempotency_key_reuse", "A `Idempotency-Key` já foi usada com outro pedido (método, caminho, query ou corpo diferentes)."], [409, "idempotency_in_progress", "Um pedido com a mesma `Idempotency-Key` ainda está em andamento (repita em instantes)."], [409, "idempotency_response_too_large", "A resposta original passou de 256 KB e não foi guardada; consulte o recurso por GET."]];
export const errosDe = (r) => [...(r.body === "json" ? CORPO_ERROS : []), ...(ERROS[r.key] || []), ...(aceitaIdempotencia(r) ? ERROS_IDEMPOTENCIA : [])];

// ---------------------------------------------------------------------------------------------------------------- consulta pública
/** Tudo o que a documentação sabe de uma rota: `{ corpo, consulta, cabecalhos, resposta, erros }` (campos ausentes ficam null ou vazios). */
export function docDe(r) {
  const corpo = r.body === "json" ? CORPO[r.key] || null : null;
  return { corpo, consulta: consultaDe(r), cabecalhos: cabecalhosDe(r), resposta: RESPOSTA[r.key] || null, erros: errosDe(r) };
}
/** Rotas com corpo JSON que ainda não têm esquema (a lista de pendências; o teste exige que esteja vazia). */
export const semEsquema = (routes) => routes.filter((r) => r.body === "json" && !CORPO[r.key]).map((r) => r.key);
export const ROTAS_COM_ESQUEMA = Object.keys(CORPO);

// ---------------------------------------------------------------------------------------------------------------- validação
/** Nomes dos campos aninhados em ordem, achatados (`items[].network`), com o nível, para a tabela "Corpo". */
export function achatar(fields, prefixo = "", nivel = 0) {
  return fields.flatMap((c) => [{ ...c, caminho: prefixo + c.name, nivel }, ...(c.fields ? achatar(c.fields, prefixo + c.name + (c.type === "array" ? "[]." : "."), nivel + 1) : [])]);
}
/** Limites e valores de um campo do corpo, em frases curtas (a tela #/docs e as docs públicas mostram a mesma coisa). */
export function restricoesDe(c) {
  const l = [];
  if (c.enum) l.push(`valores: ${c.enum.join(", ")}`);
  if (c.default !== undefined) l.push(`padrão: ${Array.isArray(c.default) ? c.default.join(", ") : String(c.default)}`);
  if (c.minLength !== undefined || c.maxLength !== undefined) l.push(c.minLength !== undefined && c.maxLength !== undefined ? `${c.minLength} a ${c.maxLength} caracteres` : c.maxLength !== undefined ? `até ${c.maxLength} caracteres` : `mínimo ${c.minLength} caractere(s)`);
  if (c.min !== undefined || c.max !== undefined) l.push(c.min !== undefined && c.max !== undefined ? `de ${c.min} a ${c.max}` : c.min !== undefined ? `mínimo ${c.min}` : `máximo ${c.max}`);
  if (c.maxItems !== undefined) l.push(`até ${c.maxItems} itens`);
  if (c.maxItemLength !== undefined) l.push(`cada um com até ${c.maxItemLength} caracteres`);
  return l;
}
/** O tipo de um campo em português ("texto", "inteiro", "texto[]"…). */
export const tipoTextoDe = (c) => (c.type === "array" ? `${c.items === "object" ? "objeto" : c.items || "texto"}[]` : c.type === "string" ? "texto" : c.type === "boolean" ? "verdadeiro/falso" : c.type === "integer" ? "inteiro" : c.type === "object" ? "objeto" : c.type);
const tipoDe = (v) => (Array.isArray(v) ? "array" : v === null ? "null" : Number.isInteger(v) ? "integer" : typeof v);
/**
 * Confere `valor` contra a lista de campos (tipo, obrigatório, valores aceitos, limites). Devolve a lista de problemas (vazia = ok).
 * `fechado`: campo que não está no esquema é problema. Um texto igual a DATA_FUTURA vale como data.
 */
export function validar(fields, valor, { fechado = false, caminho = "" } = {}) {
  const p = [];
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return [`${caminho || "corpo"}: precisa ser um objeto`];
  for (const c of fields) {
    const nome = caminho + c.name, v = valor[c.name];
    if (v === undefined || v === null) { if (c.required) p.push(`${nome}: obrigatório`); continue; }
    const t = tipoDe(v);
    const ok = c.type === "number" ? typeof v === "number" : c.type === "integer" ? t === "integer" : c.type.includes("|") ? c.type.split("|").includes(t) : t === c.type;
    if (!ok) { p.push(`${nome}: esperava ${c.type}, veio ${t}`); continue; }
    if (typeof v === "string") {
      if (c.enum && !c.enum.includes(v)) p.push(`${nome}: "${v}" não está em ${c.enum.join(", ")}`);
      if (c.minLength !== undefined && v.length < c.minLength) p.push(`${nome}: menos de ${c.minLength} caractere(s)`);
      if (c.maxLength !== undefined && v.length > c.maxLength) p.push(`${nome}: mais de ${c.maxLength} caracteres`);
      if (c.pattern && v !== DATA_FUTURA && !new RegExp(c.pattern).test(v)) p.push(`${nome}: fora do formato ${c.pattern}`);
    }
    if (typeof v === "number") { if (c.min !== undefined && v < c.min) p.push(`${nome}: menor que ${c.min}`); if (c.max !== undefined && v > c.max) p.push(`${nome}: maior que ${c.max}`); }
    if (Array.isArray(v)) {
      if (c.maxItems !== undefined && v.length > c.maxItems) p.push(`${nome}: mais de ${c.maxItems} itens`);
      v.forEach((x, i) => {
        if (c.items && c.items !== "object" && c.items !== "string|object" && tipoDe(x) !== c.items) p.push(`${nome}[${i}]: esperava ${c.items}`);
        if (typeof x === "string" && c.enum && !c.enum.includes(x)) p.push(`${nome}[${i}]: "${x}" não está em ${c.enum.join(", ")}`);
        if (typeof x === "string" && c.maxItemLength !== undefined && x.length > c.maxItemLength) p.push(`${nome}[${i}]: mais de ${c.maxItemLength} caracteres`);
        if (c.fields && x && typeof x === "object" && !Array.isArray(x)) p.push(...validar(c.fields, x, { caminho: `${nome}[${i}].` }));
      });
      if (c.required && c.items === "object" && v.length === 0) p.push(`${nome}: precisa de pelo menos um item`);
    } else if (c.fields && t === "object") p.push(...validar(c.fields, v, { fechado, caminho: `${nome}.` }));
  }
  if (fechado) for (const k of Object.keys(valor)) if (!fields.some((c) => c.name === k)) p.push(`${caminho}${k}: campo desconhecido`);
  return p;
}

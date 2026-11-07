export declare const GRUPOS_EN: {
    notifications: string;
    apiKeys: string;
    posts: string;
    media: string;
    channels: string;
    connections: string;
    insights: string;
    calendar: string;
    content: string;
    comments: string;
    mentions: string;
    tags: string;
    ideas: string;
    tiktok: string;
    instagram: string;
    youtube: string;
    health: string;
    system: string;
    usage: string;
    preferences: string;
    webhooks: string;
};
/** Group name of a route (the first segment of its key). */
export declare const grupoEn: (r: any) => any;
export declare const TITULOS_EN: {
    health: string;
    "health.v1": string;
    "connections.callback": string;
    "media.public": string;
    "connections.start": string;
    "connections.disconnect": string;
    "connections.instagramToken": string;
    "channels.list": string;
    "channels.default": string;
    "channels.remove": string;
    "channels.avatar": string;
    "tiktok.creator": string;
    "channels.slots.get": string;
    "channels.slots.put": string;
    "channels.followers.put": string;
    "channels.followers.get": string;
    "media.create": string;
    "media.list": string;
    "media.get": string;
    "media.part": string;
    "media.content.put": string;
    "media.content.get": string;
    "media.content.head": string;
    "media.complete": string;
    "media.delete": string;
    "posts.create": string;
    "posts.adopt": string;
    "posts.list": string;
    "posts.get": string;
    "posts.update": string;
    "posts.cancel": string;
    "posts.publishNow": string;
    "posts.youtubeSchedule": string;
    "posts.itemComment": string;
    "calendar.get": string;
    "insights.get": string;
    "insights.import": string;
    "insights.retention": string;
    "insights.retention.item": string;
    "content.list": string;
    "youtube.videos": string;
    "youtube.video": string;
    "youtube.editVideo": string;
    "youtube.comments": string;
    "youtube.reply": string;
    "youtube.resolve": string;
    "youtube.reopen": string;
    "instagram.media": string;
    "instagram.comments": string;
    "instagram.reply": string;
    "instagram.hide": string;
    "instagram.resolve": string;
    "instagram.reopen": string;
    "comments.list": string;
    "mentions.list": string;
    "apiKeys.list": string;
    "apiKeys.create": string;
    "apiKeys.revoke": string;
    "usage.get": string;
    "usage.log": string;
    "notifications.list": string;
    "notifications.read": string;
    "preferences.get": string;
    "preferences.put": string;
    "webhooks.list": string;
    "webhooks.create": string;
    "webhooks.get": string;
    "webhooks.update": string;
    "webhooks.delete": string;
    "webhooks.test": string;
    "webhooks.deliveries": string;
    "webhooks.redeliver": string;
    "webhooks.rotateSecret": string;
    "ideas.list": string;
    "ideas.create": string;
    "ideas.import": string;
    "ideas.update": string;
    "ideas.delete": string;
};
export declare const RESUMOS_EN: {
    health: string;
    "health.v1": string;
    "connections.callback": string;
    "media.public": string;
    "media.public#HEAD": string;
    "connections.start": string;
    "connections.disconnect": string;
    "connections.instagramToken": string;
    "channels.list": string;
    "channels.default": string;
    "channels.remove": string;
    "channels.avatar": string;
    "tiktok.creator": string;
    "channels.slots.get": string;
    "channels.slots.put": string;
    "channels.followers.put": string;
    "channels.followers.get": string;
    "media.create": string;
    "media.list": string;
    "media.get": string;
    "media.part": string;
    "media.content.put": string;
    "media.content.get": string;
    "media.content.head": string;
    "media.complete": string;
    "media.delete": string;
    "posts.create": string;
    "posts.adopt": string;
    "posts.list": string;
    "posts.get": string;
    "posts.update": string;
    "posts.cancel": string;
    "posts.publishNow": string;
    "posts.youtubeSchedule": string;
    "posts.itemComment": string;
    "calendar.get": string;
    "insights.get": string;
    "insights.retention": string;
    "insights.retention.item": string;
    "insights.import": string;
    "content.list": string;
    "youtube.videos": string;
    "youtube.video": string;
    "youtube.editVideo": string;
    "youtube.comments": string;
    "youtube.reply": string;
    "youtube.resolve": string;
    "youtube.reopen": string;
    "instagram.media": string;
    "instagram.comments": string;
    "instagram.reply": string;
    "instagram.hide": string;
    "instagram.resolve": string;
    "instagram.reopen": string;
    "comments.list": string;
    "mentions.list": string;
    "apiKeys.list": string;
    "apiKeys.create": string;
    "apiKeys.revoke": string;
    "usage.get": string;
    "usage.log": string;
    "notifications.list": string;
    "notifications.read": string;
    "preferences.get": string;
    "preferences.put": string;
    "webhooks.list": string;
    "webhooks.create": string;
    "webhooks.get": string;
    "webhooks.update": string;
    "webhooks.delete": string;
    "webhooks.test": string;
    "webhooks.deliveries": string;
    "webhooks.redeliver": string;
    "webhooks.rotateSecret": string;
    "ideas.list": string;
    "ideas.create": string;
    "ideas.import": string;
    "ideas.update": string;
    "ideas.delete": string;
};
/** English title of a route. */
export declare const tituloEn: (r: any) => any;
/** English summary of a route (HEAD has its own text); falls back to the contract's English `summary`. */
export declare const resumoEn: (r: any) => any;
export declare const COMUM_EN: {
    "Faltou o cabe\u00E7alho `Authorization: Bearer \u2026`.": string;
    "A chave n\u00E3o existe.": string;
    "A chave foi revogada.": string;
    "A chave expirou.": string;
    "O escopo da chave n\u00E3o basta para esta rota (veja o selo de escopo).": string;
    "Passou do limite de requisi\u00E7\u00F5es por minuto.": string;
    "O corpo veio vazio.": string;
    "O corpo n\u00E3o \u00E9 um objeto JSON.": string;
    "O corpo passa de 1 MB.": string;
    "A `Idempotency-Key` j\u00E1 foi usada com outro pedido (m\u00E9todo, caminho, query ou corpo diferentes).": string;
    "Um pedido com a mesma `Idempotency-Key` ainda est\u00E1 em andamento (repita em instantes).": string;
    "A resposta original passou de 256 KB e n\u00E3o foi guardada; consulte o recurso por GET.": string;
    "O webhook n\u00E3o existe.": string;
    "A m\u00EDdia n\u00E3o existe.": string;
    "O post n\u00E3o existe.": string;
    "A ideia n\u00E3o existe.": string;
    "O YouTube recusou.": string;
    "A Meta recusou.": string;
    "A API da Meta n\u00E3o est\u00E1 conectada.": string;
    "Id da conta quando a rede tem v\u00E1rias (de `GET /v1/channels`). Sem ele, o canal padr\u00E3o.": string;
    "Token da pr\u00F3xima p\u00E1gina.": string;
    "Itens por p\u00E1gina (at\u00E9 50).": string;
    "Itens por p\u00E1gina (1 a 200).": string;
    "O `next` da p\u00E1gina anterior.": string;
    "Quantos dias olhar (1 a 30).": string;
    "Novo t\u00EDtulo.": string;
    "Textos do YouTube.": string;
    "Textos do Instagram.": string;
    "Textos do TikTok.": string;
    "Coment\u00E1rio fixo.": string;
    "Legenda.": string;
    "Descri\u00E7\u00E3o.": string;
    "Sempre `buffer`.": string;
    "Id do post no Buffer.": string;
    "Id da m\u00EDdia de v\u00EDdeo.": string;
    "Id da m\u00EDdia de capa.": string;
    "Coluna do quadro.": string;
    "Texto da resposta.": string;
    "Quadro do v\u00EDdeo usado como capa, em milissegundos.": string;
    "O mesmo de `items[].mode`.": string;
    "Por onde publicar.": string;
    "O arquivo inteiro.": string;
    "S\u00F3 cabe\u00E7alhos do arquivo inteiro.": string;
    "S\u00F3 cabe\u00E7alhos do peda\u00E7o pedido por `Range`.": string;
};
/** Same as paramDe, with the description in English. */
export declare function paramEn(route: any, nome: any): {
    desc: any;
    enum?: readonly string[];
    exemplo: string;
    fixo?: boolean;
};
export declare const CAMPOS_EN: {
    "webhooks.create": {
        url: string;
        events: string;
        active: string;
    };
    "webhooks.update": {
        url: string;
        events: string;
        active: string;
    };
    "ideas.create": {
        title: string;
        note: string;
        tags: string;
    };
    "ideas.import": {
        ideas: string;
        "ideas[].id": string;
        "ideas[].title": string;
        "ideas[].note": string;
        "ideas[].group": string;
        "ideas[].tags": string;
        "ideas[].createdAt": string;
    };
    "ideas.update": {
        note: string;
        group: string;
        tags: string;
    };
    "apiKeys.create": {
        name: string;
        scope: string;
        expiresInDays: string;
    };
    "notifications.read": {
        ids: string;
        all: string;
    };
    "preferences.put": {
        theme: string;
        language: string;
        notifications: string;
    };
    "media.create": {
        type: string;
        name: string;
        mime: string;
        size: string;
        simple: string;
        sha256: string;
    };
    "channels.slots.put": {
        timezone: string;
        slots: string;
    };
    "channels.followers.put": {
        value: string;
        day: string;
    };
    "connections.instagramToken": {
        token: string;
        userId: string;
        host: string;
        username: string;
        type: string;
    };
    "posts.create": {
        title: string;
        baseText: string;
        media: string;
        "media.cover": string;
        texts: string;
        "texts.youtube.title": string;
        "texts.youtube.pinnedComment": string;
        "texts.instagram.text": string;
        "texts.tiktok.text": string;
        items: string;
        "items[].network": string;
        "items[].channel": string;
        "items[].mode": string;
        "items[].scheduledFor": string;
        "items[].queue": string;
        "items[].via": string;
        "items[].replaces": string;
        "items[].media": string;
        queue: string;
        draft: string;
        options: string;
        "options.format": string;
        "options.youtube": string;
        "options.youtube.categoryId": string;
        "options.youtube.tags": string;
        "options.youtube.notifySubscribers": string;
        "options.youtube.comment": string;
        "options.tiktok": string;
        "options.tiktok.privacy": string;
        "options.tiktok.disableComments": string;
        "options.tiktok.disableDuet": string;
        "options.tiktok.disableStitch": string;
        "options.tiktok.commercialContent": string;
        "options.tiktok.ownBrand": string;
        "options.tiktok.thirdPartyBrand": string;
        "options.instagram": string;
        "options.instagram.shareToFeed": string;
        tags: string;
        id: string;
        origin: string;
    };
    "posts.adopt": {
        title: string;
        network: string;
        scheduledFor: string;
        external: string;
        texts: string;
        "texts.instagram": string;
        text: string;
        media: string;
        "media.cover": string;
        tags: string;
        id: string;
    };
    "posts.update": {
        texts: string;
        "texts.youtube.title": string;
        media: string;
        "media.cover": string;
        "media.video": string;
        tags: string;
        items: string;
        "items[].id": string;
        "items[].network": string;
        "items[].mode": string;
        "items[].scheduledFor": string;
        "items[].queue": string;
        "items[].draft": string;
        "items[].privacy": string;
        "items[].coverFrameMs": string;
        "items[].videoTags": string;
        "items[].categoryId": string;
        moveTo: string;
    };
    "posts.youtubeSchedule": {
        scheduledFor: string;
    };
    "youtube.editVideo": {
        title: string;
        description: string;
        tags: string;
        dryRun: string;
    };
    "instagram.hide": {
        hide: string;
    };
};
export declare const NOTAS_EN: {
    "webhooks.update": string;
    "ideas.update": string;
    "notifications.read": string;
    "preferences.put": string;
    "channels.followers.put": string;
    "connections.instagramToken": string;
    "posts.create": string;
    "posts.update": string;
    "posts.youtubeSchedule": string;
    "youtube.editVideo": string;
    "instagram.hide": string;
};
/** Human-text defaults (not values) that need translating; every other `default` is kept as is. */
export declare const DEFAULTS_EN: {
    "posts.create": {
        "items[].mode": string;
    };
};
export declare const CONSULTA_EN: {
    "connections.start": {
        replace: string;
        add: string;
        probe: string;
    };
    "media.list": {
        type: string;
    };
    "posts.list": {
        state: string;
        channel: string;
        tag: string;
        offset: string;
    };
    "posts.publishNow": {
        network: string;
    };
    "calendar.get": {
        from: string;
        to: string;
    };
    "insights.import": {
        network: string;
    };
    "youtube.videos": {
        page: string;
    };
    "youtube.comments": {
        video: string;
        unanswered: string;
        sort: string;
        max: string;
    };
    "comments.list": {
        network: string;
    };
    "notifications.list": {
        unread: string;
        limit: string;
    };
    "usage.log": {
        key: string;
        status: string;
        route: string;
        method: string;
    };
    "webhooks.deliveries": {
        limit: string;
    };
};
export declare const CABECALHOS_EN: {
    "Idempotency-Key": string;
};
export declare const RESPOSTA_NOTAS_EN: {
    "media.create": string;
    "connections.callback": string;
    "connections.start": string;
    "channels.list": string;
    "channels.avatar": string;
    "tiktok.creator": string;
    "channels.followers.get": string;
    "media.list": string;
    "media.get": string;
    "media.part": string;
    "media.content.put": string;
    "media.content.get": string;
    "media.content.head": string;
    "media.public": string;
    "media.public#HEAD": string;
    "media.complete": string;
    "posts.list": string;
    "posts.adopt": string;
    "posts.cancel": string;
    "posts.publishNow": string;
    "posts.itemComment": string;
    "calendar.get": string;
    "insights.get": string;
    "insights.retention": string;
    "insights.retention.item": string;
    "insights.import": string;
    "content.list": string;
    "youtube.videos": string;
    "comments.list": string;
    "apiKeys.list": string;
    "usage.get": string;
    "usage.log": string;
    "webhooks.test": string;
    "webhooks.redeliver": string;
};
export declare const RESPOSTA_EXTRA_EN: {
    "webhooks.create": string;
    "webhooks.rotateSecret": string;
    "apiKeys.create": string;
    "connections.start": string;
    "channels.list": string;
    "posts.itemComment": string;
    "mentions.list": string;
    "insights.get": string;
    "insights.retention": string;
    "insights.retention.item": string;
    "notifications.list": string;
};
export declare const SUCESSOS_EN: {
    "media.content.get": {
        206: string;
    };
    "media.public": {
        206: string;
    };
};
export declare const ERROS_EN: {
    "webhooks.create": {
        invalid_field: string;
        unsafe_url: string;
        webhook_limit_reached: string;
    };
    "webhooks.update": {
        webhook_not_found: string;
        invalid_field: string;
        unsafe_url: string;
    };
    "ideas.create": {
        invalid_field: string;
        idea_limit_reached: string;
    };
    "ideas.import": {
        invalid_field: string;
        idea_limit_reached: string;
    };
    "ideas.update": {
        invalid_field: string;
    };
    "apiKeys.create": {
        invalid_field: string;
    };
    "notifications.list": {
        invalid_field: string;
    };
    "notifications.read": {
        invalid_field: string;
    };
    "preferences.put": {
        invalid_field: string;
    };
    "media.create": {
        invalid_field: string;
        file_too_large: string;
    };
    "channels.slots.put": {
        invalid_field: string;
        channel_not_found: string;
        unknown_network: string;
    };
    "channels.followers.put": {
        followers_from_api: string;
        invalid_field: string;
        channel_not_found: string;
    };
    "connections.instagramToken": {
        invalid_field: string;
        instagram_error: string;
    };
    "posts.create": {
        invalid_request: string;
        invalid_field: string;
        time_in_past: string;
        missing_schedule: string;
        channel_not_connected: string;
        no_slots: string;
        id_exists: string;
        media_not_ready: string;
        media_not_found: string;
    };
    "posts.adopt": {
        invalid_field: string;
        already_adopted: string;
        id_exists: string;
        channel_not_connected: string;
    };
    "posts.update": {
        item_not_found: string;
        not_editable: string;
        post_adopted: string;
        media_locked: string;
        video_not_private: string;
        video_not_found: string;
        time_in_past: string;
        youtube_error: string;
        invalid_field: string;
    };
    "posts.youtubeSchedule": {
        missing_time: string;
        no_video: string;
    };
    "youtube.editVideo": {
        invalid_field: string;
        youtube_not_connected: string;
    };
    "youtube.reply": {
        invalid_field: string;
    };
    "instagram.reply": {
        invalid_field: string;
    };
    "webhooks.deliveries": {
        invalid_field: string;
    };
    "webhooks.redeliver": {
        delivery_not_found: string;
    };
    "apiKeys.revoke": {
        api_key_not_found: string;
        api_key_in_use: string;
    };
    "media.delete": {
        media_in_use: string;
    };
    "media.complete": {
        parts_missing: string;
        size_mismatch: string;
        part_too_small: string;
    };
};
/** Errors any authenticated route can return, in English. */
export declare const ERROS_COMUNS_EN: any[][];
/** Portuguese sample strings in the examples -> English (exact match, applied to every string value, never to keys). */
export declare const EXEMPLOS_EN: {
    "O teste que s\u00F3 falhava na segunda": string;
    "O teste que s\u00F3 falhava na segunda (vers\u00E3o final)": string;
    "O teste que s\u00F3 falhava na segunda. #programa\u00E7\u00E3o": string;
    "O teste que s\u00F3 falhava na segunda me lembrou do meu \u00FAltimo deploy.": string;
    "Um teste que passava de ter\u00E7a a domingo. O que ele escondia.\n\n#programa\u00E7\u00E3o #testes": string;
    "Um teste que passava de ter\u00E7a a domingo.": string;
    "O teste que falhava": string;
    "Reel de segunda: o teste que falhava": string;
    "dia-06-o-teste-que-falhava.mp4": string;
    "capa.png": string;
    programação: string;
    testes: string;
    bastidores: string;
    "serie-bugs": string;
    painel: string;
    "O bug que s\u00F3 aparecia na segunda-feira": string;
    "Gravar o passo a passo do teste que falhava de segunda.": string;
    "Como o painel guarda as ideias": string;
    "Roteiro: 364 mil requisi\u00E7\u00F5es para 42 her\u00F3is": string;
    "Mostrar o gr\u00E1fico do log.": string;
    "automa\u00E7\u00E3o do roteiro": string;
    "Valeu por assistir! O c\u00F3digo do teste est\u00E1 na descri\u00E7\u00E3o.": string;
    "Obrigado! Foi uma segunda-feira dif\u00EDcil mesmo.": string;
    "Zika demais, qual banco voc\u00EA usa?": string;
    "Valeu! \u00C9 o D1 da Cloudflare.": string;
    "Muito bom, qual editor voc\u00EA usa?": string;
    "olha o @dev.ocioso": string;
    fulano: string;
    "Canal do Marcone": string;
    "via API da Meta": string;
    "n\u00E3o conectado (faltam os secrets TIKTOK_CLIENT_KEY e TIKTOK_CLIENT_SECRET)": string;
    "abra a url no navegador, autorize e volte; o retorno cai neste servi\u00E7o": string;
    "guarde este segredo agora: ele n\u00E3o aparece de novo": string;
    "guarde esta chave agora: ela n\u00E3o aparece de novo": string;
    "a API n\u00E3o fixa coment\u00E1rio: fixe pelo app": string;
    "o YouTube recusou o v\u00EDdeo (quota di\u00E1ria excedida)": string;
    "Reten\u00E7\u00E3o por v\u00EDdeo, impress\u00F5es e CTR, pela API do YouTube Analytics.": string;
    "Os Shorts t\u00E9cnicos lideram": string;
    "Os posts com bastidores de c\u00F3digo tiveram o dobro das visualiza\u00E7\u00F5es dos outros.": string;
    "| Data | Rede | Post | Views | Curtidas | Coment\u00E1rios | Seguidores | Fonte |\n|---|---|---|---|---|---|---|---|": string;
    "YouTube: a API de dados (v3) n\u00E3o tem endpoint de men\u00E7\u00F5es. Instagram: esta lista mostra as publica\u00E7\u00F5es em que o seu perfil foi marcado.": string;
};
/** Deep copy of an example with its Portuguese sample strings in English (keys, ids and `{{em3dias}}` untouched). */
export declare function exemploEn(v: any): any;
/** Same as docDe(r), with every human text in English and the examples translated (deep copies; the PT data is never mutated). */
export declare function docEn(r: any): {
    corpo: any;
    consulta: any[];
    cabecalhos: any[];
    resposta: any;
    erros: any[][];
};
/** Success statuses of a route, `[[status, when]]`, main one first (like statusDe). */
export declare function statusDeEn(r: any): any[];
/** Limits and values of a body field, as short English phrases (mirrors restricoesDe). */
export declare function restricoesEn(c: any): string[];
/** The type of a field in English ("string", "integer", "string[]", "object[]", "(string | object)[]"…). */
export declare function tipoTextoEn(c: any): any;
/**
 * Every PT text without an English version (`route: what`) and every English entry with no PT counterpart (`orphan: …`).
 * Empty means the English layer is complete and in sync with contract-docs.mjs.
 */
export declare function faltandoEn(routes: any): string[];

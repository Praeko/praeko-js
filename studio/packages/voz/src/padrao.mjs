// Configuração de voz padrão (sem ids e sem segredos). Em objeto JS (não em .json) para entrar no bundle sem import de JSON.
// Configuração padrão de voz do Praeko Studio. Sem ids e sem segredos. Para a sua voz: `praeko studio voz conta adicionar <nome> --voz-id <id>` (grava em vozes.json do projeto) ou defina ELEVENLABS_VOICE_ID. Cada pessoa usa SOMENTE a própria voz ou uma voz que tem autorização para usar.
export const VOZES_PADRAO = {
  "contas": {
    "elevenlabs": [
      "principal"
    ]
  },
  "vozes": {
    "rascunho-mudo": {
      "provedor": "estimado",
      "palavrasPorMin": 190
    },
    "minha-voz": {
      "provedor": "elevenlabs",
      "modelo": "eleven_v4",
      "ids": {},
      "alinhador": "scribe"
    },
    "voz-local": {
      "provedor": "voicestudio",
      "modelo": "",
      "id": "",
      "idioma": "pt-BR",
      "ajustes": {},
      "alinhador": "voicestudio"
    }
  },
  "estrategia": {
    "elevenlabs": "failover-saldo"
  },
  "qualidade": {
    "rascunho": "rascunho-mudo",
    "local": "voz-local",
    "final": "minha-voz"
  },
  "voicestudio": {
    "base": "http://127.0.0.1:3900"
  }
};

# Contribuindo

Obrigado pelo interesse. O que este repositório aceita e como:

- **Issues são bem-vindas**: bug no SDK ou na CLI, tipo errado, documentação confusa, pedido de recurso. Diga a versão (`praeko --version` ou a do `@praeko/sdk`), o Node e o sistema.
- **Pull requests são revisados**, sem prazo garantido. Para algo grande, abra uma issue antes para alinhar o rumo.
- **O comportamento da API vive no servidor, que é fechado.** Este repositório não define regras de negócio, limites nem formatos de resposta: se o problema estiver na API, a issue é aceita igual, mas a correção acontece do outro lado e chega aqui depois.
- Parte do código deste repositório (o contrato e os tipos) é **gerada** a partir da fonte no repositório privado; edições diretas nesses arquivos podem ser sobrescritas na próxima sincronização. Para eles, descreva a mudança na issue ou no PR e ela será aplicada na origem. Os arquivos gerados dizem isso no cabeçalho.

## Antes de abrir o PR

```sh
npm ci
npm test
npm run typecheck
npm run release:check
```

Os testes rodam sem rede e sem o servidor. Mantenha o código sem dependências em tempo de execução. Mensagens ao usuário da CLI ficam em português; identificadores da API nova, em inglês.

Ao contribuir, você concorda em licenciar sua contribuição sob a [MIT](./LICENSE).

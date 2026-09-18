# Facilita — dinâmicas colaborativas

## Começar agora

```bash
npm start
```

Abra `http://localhost:3000` para acessar a biblioteca de dinâmicas, organizada nas pastas **Retros** e **Workshops**.

## Dinâmicas disponíveis

- **Retro Road Trip** — check-in, post-its, votação e plano de ação;
- **Nexus — Workshop de Produto** — diagnóstico, tese de valor, árvore de oportunidades, votação e apostas.

Ao abrir uma dinâmica pela home, o navegador cria uma sala e adiciona seu código ao link:

```text
http://localhost:3000/retro-road-trip.html?room=retro-abc123
http://localhost:3000/nexus-workshop.html?room=nexus-abc123
```

## Publicar no Render

O arquivo `render.yaml` configura automaticamente um Web Service Node no plano gratuito. No painel do Render, escolha **New > Blueprint**, conecte este repositório e confirme **Apply**.

Clique em **Convidar** para copiar o link. Para pessoas na mesma rede Wi-Fi, troque `localhost` pelo endereço de rede exibido no terminal ao iniciar o servidor. Exemplo:

```text
http://192.168.1.28:3000/?room=retro-abc123
```

## O que é compartilhado

- participantes online e autoria dos post-its;
- inclusão, exclusão e movimentação de post-its;
- check-ins da Retro;
- votação do Workshop com três votos por participante em cada quadro, incluindo repetição e remoção;
- modo de reflexão do Workshop, no qual o master revela ou oculta os autores dos post-its;
- planos de ação da Retro e apostas do Workshop;
- limpeza da dinâmica para todas as pessoas.

Clique em **Convidar** dentro da dinâmica para copiar o link da sala. Todas as pessoas que abrirem exatamente esse link colaboram no mesmo board.

O cronômetro, a rolagem e a navegação entre telas são individuais, para cada pessoa explorar o conteúdo sem mudar a tela das demais.

## Limites desta versão

As salas ficam na memória do servidor. Reiniciar o processo ou fazer um novo deploy limpa todo o conteúdo compartilhado. Para manter o histórico permanentemente, será necessário conectar um banco como Supabase/Postgres.

O projeto não possui autenticação: qualquer pessoa com o link da sala pode visualizar e alterar o board.

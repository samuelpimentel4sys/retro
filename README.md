# Retro Road Trip colaborativa

## Começar agora

```bash
npm start
```

Abra `http://localhost:3000`. A primeira visita cria uma sala e adiciona seu código ao link, por exemplo `?room=retro-abc123`.

## Publicar no Render

O arquivo `render.yaml` configura automaticamente um Web Service Node no plano gratuito. No painel do Render, escolha **New > Blueprint**, conecte este repositório e confirme **Apply**.

Clique em **Convidar** para copiar o link. Para pessoas na mesma rede Wi-Fi, troque `localhost` pelo endereço de rede exibido no terminal ao iniciar o servidor. Exemplo:

```text
http://192.168.1.28:3000/?room=retro-abc123
```

## O que é compartilhado

- participantes online e autoria dos post-its;
- check-in, post-its e exclusões;
- votação com três votos por navegador;
- plano de ação e limpeza da dinâmica.

O cronômetro e a navegação entre telas são individuais, para cada pessoa explorar o quadro sem mudar a tela das demais.

## Limite deste MVP

As salas ficam na memória do servidor. Reiniciar o processo limpa o conteúdo. Para uso permanente ou fora da rede local, publique o app em uma hospedagem Node e conecte um banco como Supabase/Postgres.

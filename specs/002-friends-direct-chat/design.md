# Design — Amigos e chat direto

## Segurança

- `profiles.username` usa índice único e um flag de configuração; usernames provisórios nunca são retornados ao cliente.
- A Edge Function `social-action` faz descoberta exata e transições de amizade. O ator vem exclusivamente do JWT.
- `social_transition` só pode ser chamada por `service_role` e garante a dupla canônica, amizade única e criação idempotente da conversa.
- RLS limita relações, conversas, mensagens e Storage aos participantes; bloqueio nega tudo.
- O bucket `direct-message-images` é privado, limitado a 4 MB e possui allowlist de MIME.

## UI e consistência visual

- Reutilizar `channel-home`, `ProfileAvatar`, `StyledProfileName`, `Icon`, os tokens de `styles.css`, DM Sans e Space Grotesk.
- Não introduzir biblioteca visual, outra paleta, ícones externos, emojis como ícones ou uma sidebar global adicional.
- A entrada Amigos fica abaixo de Home. O workspace é painel social de 300 px e conversa flexível; em até 820 px, a conversa ocupa a área principal.
- Linhas selecionadas usam a mesma barra esquerda, borda e gradiente de baixo contraste dos canais.
- Mensagens repetem a linguagem do chat da call: remotas à esquerda, locais à direita, bordas assimétricas, fundo escuro e acento translúcido.
- Estados de loading, vazio, erro, pending, bloqueio e somente leitura precisam existir; não depender apenas de cor.

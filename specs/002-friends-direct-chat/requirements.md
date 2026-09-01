# Requisitos — Amigos e chat direto

## Identidade

- Todo perfil possui `@username` único; o nome visual continua independente.
- Username público: 3–24 caracteres, `a-z`, `0-9` e `_`, sem distinção de maiúsculas.
- Contas antigas recebem valor provisório interno e precisam escolher o username antes do lobby.

## Social

- Descoberta somente por username completo, sem diretório ou autocomplete.
- Pedidos podem ser enviados, aceitos, recusados ou cancelados.
- Amizade pode ser removida; o histórico permanece somente leitura.
- Bloqueio remove amizade/pedidos e revoga o histórico dos dois lados.
- Amigos aceitos veem presença e atividade usando o heartbeat existente.

## Conversas

- Uma conversa persistente por dupla, com texto de até 2.000 caracteres e uma imagem JPG/PNG/WEBP/GIF de até 4 MB.
- Histórico carrega em páginas de 50 mensagens, por cursor de ID.
- Mensagens podem ser apagadas pelo autor e viram tombstone; edição não existe.
- Não lidas são persistidas por participante.
- Notificações sem prévia de conteúdo ocorrem apenas para mensagens recebidas com o app em segundo plano e permissão concedida.

## Fora de escopo

- Grupos, calls diretas, reações, typing, edição, arquivos genéricos e confirmação de leitura visível.

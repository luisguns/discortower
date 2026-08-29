# Spec 001 — Autenticação por convite e painel administrativo

Status: proposta para aprovação  
Produto: DiscorTower Desktop/Web  
Escopo: plano de controle Supabase + autorização LiveKit  

## 1. Objetivo

Adicionar ao DiscorTower um sistema de contas acessível somente por convite e um painel administrativo dentro do próprio aplicativo. O Supabase será responsável por identidade, autorização, persistência e estado administrativo. O LiveKit continuará responsável exclusivamente por áudio, vídeo, compartilhamento de tela e eventos de mídia.

O sistema deve considerar o aplicativo Electron e todo código do frontend como ambiente não confiável. A presença da interface administrativa no bundle não pode conceder acesso a dados ou operações administrativas.

## 2. Resultados esperados

- Somente contas ativas e autenticadas podem criar ou entrar em calls.
- Novas contas só podem ser criadas a partir de convites emitidos pelo administrador.
- Existe exatamente um administrador inicial, vinculado por `auth.users.id` no banco.
- O administrador consegue visualizar calls abertas, participantes, usuários e convites.
- O administrador consegue convidar e desativar usuários.
- A emissão de tokens LiveKit passa por uma função autenticada e deixa de usar o Development Token Server no cliente.
- O frontend não recebe chaves administrativas do Supabase nem credenciais do LiveKit.
- Áudio, vídeo e tela não passam pelo Supabase.

## 3. Personas e permissões

### 3.1 Usuário convidado

- Aceita um convite e define sua credencial.
- Faz login e logout.
- Edita apenas o próprio perfil.
- Cria uma call ou entra em uma call por código.
- Não lista calls das quais não participou.
- Não acessa usuários, convites, logs ou ações administrativas.

### 3.2 Administrador proprietário

- Possui todas as permissões de usuário.
- Abre o painel administrativo dentro do aplicativo.
- Visualiza calls abertas e seus participantes.
- Visualiza usuários e seus estados de acesso.
- Cria e revoga convites.
- Desativa ou reativa usuários.
- Encerra uma call ou remove um participante, quando suportado pelo LiveKit.
- Não pode remover acidentalmente seu próprio acesso administrativo pela interface.

## 4. Requisitos funcionais

### AUTH — Autenticação

- **AUTH-01:** Ao iniciar sem sessão válida, o aplicativo deve mostrar a tela de login antes do lobby.
- **AUTH-02:** O login inicial será por e-mail e senha. Magic link pode ser adicionado depois, sem alterar o modelo de autorização.
- **AUTH-03:** O cadastro público deve permanecer desabilitado.
- **AUTH-04:** Uma conta só pode ser criada pelo fluxo de convite do Supabase iniciado por uma operação administrativa autorizada.
- **AUTH-05:** Convites devem possuir estado auditável: pendente, aceito, revogado ou expirado.
- **AUTH-06:** Usuários desativados devem perder acesso a novas operações e ser impedidos de obter novos tokens LiveKit.
- **AUTH-07:** O logout deve remover a sessão local e desconectar qualquer call ativa.
- **AUTH-08:** Expiração ou revogação da sessão deve levar o aplicativo de volta ao login sem expor dados anteriores.
- **AUTH-09:** Links de convite e recuperação devem usar callback previamente autorizado, código PKCE de uso único e validação estrita do destino.
- **AUTH-10:** Mensagens públicas de login e recuperação não devem confirmar se um e-mail possui conta.

### PROFILE — Perfil

- **PROFILE-01:** O nome exibido deve pertencer à conta autenticada, e não ser usado como identidade de autorização.
- **PROFILE-02:** O usuário pode editar apenas o próprio nome e avatar.
- **PROFILE-03:** A identidade LiveKit deve derivar do `user_id` autenticado mais um identificador de sessão, nunca apenas do nome exibido.

### ROOM — Calls

- **ROOM-01:** Apenas usuários ativos podem criar ou entrar em calls.
- **ROOM-02:** O cliente deve solicitar os detalhes de conexão a uma Edge Function autenticada.
- **ROOM-03:** A função deve validar sessão, estado da conta, código da sala e limites antes de emitir um token LiveKit.
- **ROOM-04:** O token deve permitir entrada somente na sala solicitada e carregar apenas as permissões necessárias.
- **ROOM-05:** O estado de calls abertas deve ser derivado prioritariamente de webhooks assinados do LiveKit.
- **ROOM-06:** Eventos duplicados devem ser processados de forma idempotente.
- **ROOM-07:** Usuários comuns não podem enumerar calls abertas globais.
- **ROOM-08:** A falha do painel ou do Supabase Realtime não deve transportar mídia pelo servidor de controle.

### ADMIN — Painel administrativo

- **ADMIN-01:** O menu do painel deve aparecer somente após uma verificação de papel administrativo feita no servidor.
- **ADMIN-02:** A rota e os componentes administrativos podem estar no bundle público, mas nenhuma consulta ou ação deve confiar na visibilidade do menu.
- **ADMIN-03:** O painel deve exibir calls abertas, horário de início, duração, quantidade de participantes e lista de participantes.
- **ADMIN-04:** O painel deve listar usuários com nome, e-mail, estado, criação e último acesso conhecido.
- **ADMIN-05:** O painel deve criar convites por e-mail e listar seu estado.
- **ADMIN-06:** O painel deve revogar convites ainda não aceitos.
- **ADMIN-07:** O painel deve desativar e reativar usuários, exceto o proprietário administrativo.
- **ADMIN-08:** Operações administrativas sensíveis devem gerar registro de auditoria.
- **ADMIN-09:** O painel deve atualizar calls e participantes sem recarregar a página, via Supabase Realtime ou refetch controlado.
- **ADMIN-10:** Erros de autorização devem resultar em `403`, mesmo quando a requisição é construída manualmente fora da interface.
- **ADMIN-11:** Ao desativar um usuário, o backend deve revogar suas sessões e removê-lo das calls ativas; expirar apenas o token de entrada não é suficiente.

### OPS — Operação e implantação

- **OPS-01:** Configurações públicas podem usar variáveis `VITE_*`.
- **OPS-02:** Chaves secretas devem existir somente nos secrets das Edge Functions.
- **OPS-03:** Builds de CI não devem receber `LIVEKIT_API_SECRET` nem chave administrativa Supabase.
- **OPS-04:** O Development Token Server deve ser removido do fluxo de produção após a migração.
- **OPS-05:** O deploy deve permitir rotação de credenciais sem gerar uma nova versão do aplicativo, exceto quando URLs públicas mudarem.

## 5. Requisitos não funcionais

- **SEC-01:** Negar por padrão toda operação não coberta explicitamente por RLS ou Edge Function.
- **SEC-02:** Não armazenar senha no aplicativo.
- **SEC-03:** No Electron, persistir o refresh token usando armazenamento protegido pelo sistema operacional; manter access token apenas pelo tempo necessário.
- **SEC-04:** Tokens LiveKit devem ter TTL curto, recomendado em até cinco minutos para entrada inicial.
- **SEC-05:** Convites, emissão de token e ações administrativas devem possuir limitação de frequência.
- **SEC-06:** Webhooks LiveKit devem ter assinatura validada antes de qualquer escrita.
- **SEC-07:** Logs não podem conter senhas, refresh tokens, JWTs completos ou chaves secretas.
- **SEC-08:** O painel deve funcionar sem acesso Node direto no renderer; `contextIsolation` permanece habilitado.
- **SEC-09:** RLS deve ser combinada com privilégios de coluna ou RPCs específicas para impedir que o dono de um perfil altere seu próprio `status`.
- **PERF-01:** Operações do plano de controle não devem interferir no transporte LiveKit.
- **PERF-02:** A listagem inicial do painel deve carregar em até dois segundos em condições normais para até mil usuários e cem calls recentes.
- **REL-01:** Eventos de webhook devem ser idempotentes e tolerar entrega fora de ordem.
- **PRIV-01:** Usuários comuns não podem consultar e-mails ou atividade de outros usuários.

## 6. Critérios de aceite em formato BDD

### Login obrigatório

```gherkin
Dado que não existe sessão válida no dispositivo
Quando o DiscorTower é iniciado
Então a tela de login é exibida
E o lobby e o painel não são acessíveis
```

### Conta sem convite

```gherkin
Dado que um e-mail não foi convidado
Quando alguém tenta criar uma conta diretamente pela API pública
Então a operação é recusada
E nenhum perfil ativo é criado
```

### Usuário comum tentando acessar o painel

```gherkin
Dado que um usuário autenticado não pertence a admin_users
Quando ele chama diretamente uma consulta ou Edge Function administrativa
Então recebe 403
E nenhum dado administrativo é retornado
```

### Código administrativo presente no cliente

```gherkin
Dado que alguém extraiu o bundle do Electron
Quando encontra as rotas e componentes do painel
Então não encontra credenciais secretas
E não consegue ler dados ou executar ações administrativas sem autorização server-side
```

### Entrada em call

```gherkin
Dado que o usuário está autenticado e ativo
Quando solicita entrada em uma sala válida
Então a Edge Function emite um token LiveKit de curta duração
E o token autoriza somente aquela sala e identidade
```

### Conta desativada

```gherkin
Dado que o administrador desativou uma conta
Quando essa conta solicita um novo token LiveKit
Então a operação é recusada
E a tentativa é registrada sem armazenar o JWT
```

### Call aberta no painel

```gherkin
Dado que o primeiro participante entrou numa sala LiveKit
Quando o webhook room_started é validado
Então a sala aparece como aberta no painel
E novos participantes aparecem após participant_joined
```

## 7. Fora do escopo inicial

- Transporte próprio de áudio, vídeo ou compartilhamento de tela.
- Gravação de chamadas.
- Pagamentos e assinaturas.
- Múltiplas organizações ou múltiplos administradores.
- Login social, telefone ou SSO.
- Mensagens persistentes do chat da call.
- Recuperação completa do estado LiveKit sem credenciais de API de produção.

## 8. Dependências para implementação

- Projeto Supabase criado.
- URL e chave pública/publishable do projeto.
- Conta do proprietário criada por convite no Supabase.
- `user_id` do proprietário associado manualmente em `admin_users`.
- Credenciais de produção do LiveKit: URL, API key e API secret.
- Endpoint de webhook LiveKit configurado para a Edge Function correspondente.

## 9. Questões que exigem decisão do proprietário

1. E-mail que será convidado como proprietário inicial; ele não será gravado no repositório.
2. Se usuários comuns podem criar salas livremente ou somente entrar em salas criadas pelo admin.
3. Tempo de retenção do histórico de calls e auditoria.
4. Se a versão Web continuará disponível ou se o login ficará restrito ao aplicativo Desktop.

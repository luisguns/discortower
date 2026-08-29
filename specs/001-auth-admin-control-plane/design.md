# Design técnico — Plano de controle seguro do DiscorTower

Este documento implementa os requisitos definidos em `requirements.md`. O princípio central é que o renderer Electron é um cliente não confiável: ele pode conhecer endpoints públicos, modelos e telas, mas não recebe autoridade por possuir o código.

## 1. Arquitetura

```text
┌──────────────────────── DiscorTower Desktop ────────────────────────┐
│ React renderer                                                      │
│  login, lobby, call, painel admin                                  │
│       │ JWT de usuário                       │ token de participante │
│       ▼                                      ▼                      │
│ Supabase Auth/REST/Realtime             LiveKit Client SDK          │
│       │                                      │                      │
│ Electron main: armazenamento protegido       │ mídia WebRTC          │
└───────┼──────────────────────────────────────┼──────────────────────┘
        │                                      │
        ▼                                      ▼
┌──────────────── Supabase ─────────────┐  ┌──── LiveKit Cloud ────┐
│ Postgres + RLS                        │  │ áudio, vídeo e tela    │
│ Edge Functions                        │◄─│ webhooks assinados     │
│  - issue-livekit-token                │  │ Room Service API       │
│  - admin-invite-user                  │  └────────────────────────┘
│  - admin-set-user-status              │
│  - admin-room-action                  │
│  - livekit-webhook                    │
└───────────────────────────────────────┘
```

O Supabase armazena somente metadados leves. Nenhum track, frame, pacote de áudio ou gravação passa por ele.

## 2. Fronteiras de confiança

### Público no cliente

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- Código das interfaces de login e painel
- Identificadores de tabela e formato das requisições
- URL retornada do LiveKit após autorização

Esses valores não concedem privilégio por si só. Toda leitura usa RLS e toda mutação sensível passa por uma função autenticada.

### Somente no Supabase Edge Runtime

- `SUPABASE_SECRET_KEY`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LIVEKIT_URL`
- segredo/credenciais usados para verificar webhooks

Esses valores nunca entram no GitHub Actions do frontend, em `VITE_*`, no `app.asar`, em logs ou respostas HTTP.

## 3. Modelo de dados

### `profiles`

| Campo | Tipo | Regra |
|---|---|---|
| `user_id` | uuid PK/FK auth.users | identidade canônica |
| `display_name` | text | 1–48 caracteres |
| `avatar_url` | text nullable | URL controlada; data URL local permanece opcional |
| `status` | enum | `active`, `disabled` |
| `created_at` | timestamptz | server default |
| `updated_at` | timestamptz | trigger |

O cliente comum pode ler e editar somente a própria linha. O campo `status` não pode ser alterado pelo usuário.

### `admin_users`

| Campo | Tipo | Regra |
|---|---|---|
| `user_id` | uuid PK/FK auth.users | proprietário autorizado |
| `created_at` | timestamptz | server default |
| `created_by` | uuid nullable | auditoria |

Não haverá endpoint público de promoção. Na primeira versão, somente uma linha é permitida por regra de negócio e ela será inserida manualmente pelo proprietário no painel SQL do Supabase.

### `invitations`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid PK | identificador interno |
| `email_normalized` | text | visível somente ao admin |
| `invited_user_id` | uuid nullable | preenchido ao vincular conta |
| `status` | enum | `pending`, `accepted`, `revoked`, `expired` |
| `created_by` | uuid | admin responsável |
| `created_at` | timestamptz | server default |
| `expires_at` | timestamptz | obrigatório |
| `accepted_at` | timestamptz nullable | auditoria |

O token real de convite é gerenciado pelo Supabase Auth e não será armazenado nessa tabela.

### `room_sessions`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid PK | sessão interna |
| `livekit_room_sid` | text unique nullable | atribuído pelo webhook |
| `room_name` | text | código normalizado |
| `status` | enum | `starting`, `open`, `closed` |
| `created_by` | uuid nullable | usuário que pediu a criação |
| `started_at` | timestamptz nullable | webhook autoritativo |
| `ended_at` | timestamptz nullable | webhook autoritativo |
| `last_event_at` | timestamptz | ordenação de eventos |

### `participant_sessions`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid PK | sessão do participante |
| `room_session_id` | uuid FK | call relacionada |
| `user_id` | uuid nullable | extraído de identidade/atributo assinado |
| `livekit_identity` | text | identidade da conexão |
| `participant_name` | text | apresentação |
| `joined_at` | timestamptz | webhook |
| `left_at` | timestamptz nullable | webhook |

### `webhook_events`

Mantém `event_id`, tipo, horário e resultado mínimo de processamento. O `event_id` é único para garantir idempotência. Payloads completos não são retidos indefinidamente.

### `audit_log`

Registra ator, ação, alvo, horário, resultado e metadados não secretos para convites, mudança de status, encerramento de sala e remoção de participante.

## 4. Autorização

### Funções SQL auxiliares

- `is_admin()` retorna verdadeiro quando `auth.uid()` existe em `admin_users`.
- Deve ser `security definer`, ter `search_path` fixo e conceder apenas execução.
- A tabela `admin_users` não precisa ser diretamente legível pelo cliente.

### Políticas RLS

- Todas as tabelas públicas têm RLS habilitado.
- `anon` não possui acesso aos dados da aplicação.
- Usuário autenticado lê/edita somente o próprio perfil. A edição usa privilégios de coluna ou RPC dedicada para que `status` nunca seja gravável pelo cliente.
- Usuário comum lê somente suas próprias participações e histórico permitido.
- Admin lê dados administrativos através de políticas com `is_admin()`.
- Nenhuma política permite `insert`, `update` ou `delete` em `admin_users` pelo cliente.
- Convites e auditoria são escritos apenas por Edge Functions com chave secreta.

Esconder um botão é somente UX. A decisão final acontece no banco ou na Edge Function.

## 5. Fluxos

### 5.1 Bootstrap do único administrador

1. Desabilitar cadastro público no Supabase.
2. Criar ou convidar a conta do proprietário pelo Dashboard.
3. Confirmar o e-mail e concluir o login.
4. Inserir o `auth.users.id` dessa conta em `admin_users` via SQL administrativo.
5. Validar que `is_admin()` retorna verdadeiro para essa sessão.

O e-mail do proprietário não entra em migration, código ou variável pública. Trocar o e-mail da conta não muda a autorização porque ela está vinculada ao UUID.

### 5.2 Convite

1. O painel chama `admin-invite-user` com JWT do usuário.
2. A função valida o JWT e consulta `admin_users` usando o `user_id` autenticado.
3. A função normaliza o e-mail, aplica rate limit e cria o convite pelo Auth Admin API.
4. A função registra metadados em `invitations` e `audit_log`.
5. A resposta contém somente estado e identificadores seguros.

### 5.3 Login

1. O renderer autentica com Supabase Auth.
2. A sessão é validada remotamente antes de carregar dados protegidos.
3. O perfil precisa estar `active`.
4. O aplicativo consulta uma RPC mínima `get_my_access_context`, que retorna apenas `user_id`, perfil e `is_admin`.
5. A UI apresenta o painel somente quando `is_admin` for verdadeiro.

Convites e recuperação usam PKCE e callback presente numa allowlist exata. O handler diferencia explicitamente callback de autenticação de links de sala; não interpreta parâmetros arbitrários como deep links. Até a definição do domínio definitivo, a URL final de callback permanece uma decisão de provisionamento e não será codificada na migration.

### 5.4 Emissão do token LiveKit

1. O usuário envia `roomCode` e dados de apresentação limitados para `issue-livekit-token`.
2. A função valida o JWT do Supabase.
3. Consulta o perfil e exige `status = active`.
4. Normaliza o código e aplica rate limit.
5. Gera identidade `usr_<uuid>_<nonce-curto>` e token de curta duração.
6. Concede `roomJoin` somente para a sala pedida e permissões mínimas de publicação/assinatura.
7. Retorna `{ serverUrl, participantToken }` no formato já consumido pelo cliente LiveKit.

O cliente deixa de usar `TokenSource.developmentTokenServer()` em produção.

### 5.5 Estado das calls

1. O LiveKit envia webhooks à função `livekit-webhook`.
2. A função lê o corpo bruto e valida a assinatura antes de parsear/confiar nos campos.
3. `room_started` abre ou reconcilia `room_sessions`.
4. `participant_joined` cria uma `participant_session`.
5. `participant_left` fecha a participação correspondente.
6. `room_finished` fecha a call e qualquer participação ainda aberta.
7. O painel recebe mudanças das tabelas via Realtime, protegido por RLS.

Eventos com o mesmo ID não alteram o estado novamente. Eventos antigos não sobrescrevem estado mais recente.

### 5.6 Desativação imediata

1. `admin-set-user-status` marca o perfil como desativado em transação controlada.
2. A função revoga/bane as sessões Auth usando a API administrativa.
3. A função localiza participações LiveKit abertas e solicita `RemoveParticipant` para cada identidade.
4. Políticas de banco também exigem conta ativa, bloqueando tokens de acesso ainda em memória.
5. Resultados parciais são registrados e reconciliados; a resposta não declara sucesso total se a remoção da call falhar.

O TTL do token LiveKit controla novas conexões, mas não encerra uma conexão já estabelecida. Por isso a remoção via Room Service é obrigatória para bloqueio imediato.

## 6. Integração com o aplicativo atual

### Estrutura proposta no React

```text
src/
  auth/
    AuthProvider.tsx
    LoginScreen.tsx
    InviteCompletionScreen.tsx
    ProtectedApp.tsx
  admin/
    AdminPanel.tsx
    CallsPage.tsx
    UsersPage.tsx
    InvitationsPage.tsx
  services/
    supabase.ts
    auth.ts
    admin.ts
    livekit.ts                 # troca a fonte do token
```

`App.tsx` passa a possuir os estados principais: inicializando sessão, não autenticado, autenticado no lobby/call e painel admin. Uma call ativa deve ser encerrada antes de logout ou troca de conta.

### Sessão no Electron

- Adicionar uma interface mínima no preload para ler, gravar e remover um blob de sessão.
- O processo principal usa `safeStorage` quando a criptografia está disponível.
- Senha nunca é persistida.
- O renderer recebe apenas a sessão necessária para funcionar como cliente autenticado.
- CSP continua restritiva e navegação externa continua bloqueada/isolada.

No build Web, usar o storage suportado pelo Supabase com a mesma política de expiração, aceitando que o navegador possui uma superfície diferente do Electron.

## 7. Edge Functions

| Função | Autenticação | Responsabilidade |
|---|---|---|
| `issue-livekit-token` | JWT de usuário | validar conta e emitir token LiveKit |
| `admin-invite-user` | JWT + admin no banco | criar/revogar convite |
| `admin-list-users` | JWT + admin no banco | combinar Auth Admin API e perfis sem expor a usuários comuns |
| `admin-set-user-status` | JWT + admin no banco | ativar/desativar conta |
| `admin-room-action` | JWT + admin no banco | encerrar sala/remover participante |
| `livekit-webhook` | assinatura LiveKit | persistir eventos de sala/participante |

As funções administrativas compartilham um helper que valida o usuário por ID e consulta `admin_users`. Nenhuma aceita `isAdmin`, `role`, e-mail administrativo ou ID de ator fornecido pelo corpo como prova de autorização.

## 8. Modelo de ameaças

| Ameaça | Controle obrigatório |
|---|---|
| Extração do `app.asar` | nenhum segredo no cliente; RLS e autorização server-side |
| Usuário força rota `/admin` | consultas retornam 403/zero linhas sem `is_admin()` |
| Usuário altera estado React para admin | servidor ignora estado do cliente |
| Roubo de token LiveKit antigo | TTL curto e escopo de sala único |
| Abuso de emissão de tokens | sessão ativa, rate limit e auditoria |
| Webhook falso | validação de assinatura sobre corpo bruto |
| Replay de webhook | `event_id` único e processamento idempotente |
| Usuário muda seu próprio status | coluna protegida e mutação apenas por função admin |
| Promoção indevida a admin | sem endpoint de promoção; tabela sem escrita pelo cliente |
| Vazamento em logs | redaction de JWT, segredo, senha e headers sensíveis |
| XSS no renderer | CSP, sem Node integration, context isolation e storage protegido |

## 9. Configuração por ambiente

### Cliente/GitHub Actions — públicas

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

### Supabase Edge Function secrets — privadas

```env
LIVEKIT_URL=wss://<projeto>.livekit.cloud
LIVEKIT_API_KEY=<secret>
LIVEKIT_API_SECRET=<secret>
SUPABASE_SECRET_KEY=<secret>
```

`VITE_LIVEKIT_TOKEN_SERVER_ID` é removida somente no cutover para a função autenticada. Não haverá fallback silencioso para o token server de desenvolvimento no build de produção.

## 10. Observabilidade e retenção

- Métricas mínimas: login falho, convite criado, token emitido/negado, webhook inválido e atraso de webhook.
- Auditoria retida por prazo configurável; proposta inicial: 90 dias.
- Histórico de calls proposto: 90 dias; presença detalhada pode ter retenção menor.
- Logs operacionais usam IDs, nunca JWTs ou credenciais.

## 11. Estratégia de migração

1. Implantar schema, RLS e funções sem alterar o cliente existente.
2. Criar e validar o proprietário administrativo.
3. Adicionar login e painel ao app atrás de configuração de ambiente.
4. Testar emissão autenticada de token em ambiente de desenvolvimento.
5. Configurar webhook e validar consistência do painel.
6. Remover o Development Token Server do cliente de produção.
7. Gerar nova release, validar login/call/admin e só então promover como versão recomendada.

Rollback: manter a release anterior disponível, sem reativar automaticamente o token server aberto. Um rollback de segurança deve corrigir o plano de controle ou suspender novas entradas, não restaurar emissão pública de tokens.

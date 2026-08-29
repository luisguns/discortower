# Plano de implementação — Spec 001

As tarefas abaixo são executadas somente após aprovação de `requirements.md` e `design.md`. Cada fase deve terminar com testes verdes e revisão dos controles de segurança antes de avançar.

## Fase 0 — Decisões e provisionamento

- [ ] Aprovar os quatro pontos em aberto da seção 9 dos requisitos.
- [ ] Criar projeto Supabase e selecionar região adequada.
- [ ] Desabilitar cadastro público.
- [ ] Obter credenciais de API de produção do LiveKit.
- [ ] Definir URLs de redirect permitidas para Web e protocolo Desktop.
- [ ] Definir retenção de auditoria e calls.

Saída: ambientes existem, mas nenhum segredo foi adicionado ao repositório.

## Fase 1 — Banco e autorização

- [ ] Criar enums e tabelas `profiles`, `admin_users`, `invitations`, `room_sessions`, `participant_sessions`, `webhook_events` e `audit_log`.
- [ ] Criar triggers de timestamps e criação controlada de perfil.
- [ ] Criar `is_admin()` com `security definer` e `search_path` fixo.
- [ ] Habilitar RLS em todas as tabelas públicas.
- [ ] Revogar privilégios padrão e conceder apenas operações necessárias.
- [ ] Criar políticas separadas para `select`, `insert`, `update` e `delete`.
- [ ] Criar RPC `get_my_access_context` com retorno mínimo.
- [ ] Adicionar testes SQL para usuário anônimo, comum, desativado e admin.

Critério de saída: usuário comum não consegue ler outro perfil, listar calls globais, acessar convites ou alterar seu papel/status, mesmo por requisição manual.

## Fase 2 — Bootstrap do proprietário

- [ ] Criar a conta do proprietário pelo Dashboard/convite.
- [ ] Confirmar a conta e capturar seu UUID.
- [ ] Inserir o UUID em `admin_users` usando operação administrativa fora do cliente.
- [ ] Confirmar que existe somente um proprietário.
- [ ] Confirmar que o e-mail/UUID não foi commitado no repositório.

Critério de saída: apenas a sessão do proprietário recebe `is_admin = true`.

## Fase 3 — Edge Functions

- [ ] Criar biblioteca compartilhada de CORS restrito, resposta de erro, autenticação e redaction de logs.
- [ ] Implementar `issue-livekit-token`.
- [ ] Implementar `admin-invite-user` e revogação.
- [ ] Implementar `admin-list-users` para dados do Auth indisponíveis pela API pública.
- [ ] Implementar `admin-set-user-status` com bloqueio de auto-desativação do proprietário.
- [ ] Revogar sessões e remover participantes LiveKit ativos durante a desativação.
- [ ] Implementar `admin-room-action`.
- [ ] Implementar `livekit-webhook` com validação sobre corpo bruto e idempotência.
- [ ] Adicionar rate limit para convite, token e ações administrativas.
- [ ] Configurar secrets diretamente no Supabase.
- [ ] Criar testes unitários de autorização e validação de payload.

Critério de saída: manipular o corpo da requisição ou copiar o frontend não permite elevar privilégios nem emitir token para conta desativada.

## Fase 4 — Autenticação no aplicativo

- [ ] Instalar e configurar `@supabase/supabase-js`.
- [ ] Atualizar `.env.example` somente com URL e chave pública.
- [ ] Criar `AuthProvider` e máquina de estados de sessão.
- [ ] Criar tela de login, conclusão do convite, logout e estados de erro.
- [ ] Implementar callback PKCE com allowlist exata e parsing separado dos deep links de sala.
- [ ] Bloquear lobby/call enquanto não houver sessão ativa.
- [ ] Sincronizar nome exibido com `profiles` sem usar esse nome como identidade.
- [ ] Desconectar call ao expirar sessão ou fazer logout.
- [ ] Implementar storage Electron com `safeStorage` e IPC mínimo.
- [ ] Manter `contextIsolation` e ausência de Node integration no renderer.

Critério de saída: reiniciar o app preserva sessão de forma protegida; logout elimina a sessão; senha nunca é persistida.

## Fase 5 — Integração LiveKit autenticada

- [ ] Substituir `TokenSource.developmentTokenServer` pela chamada à Edge Function.
- [ ] Enviar automaticamente o JWT Supabase válido.
- [ ] Adaptar erros amigáveis para 401, 403, conta desativada, rate limit e indisponibilidade.
- [ ] Validar identidade LiveKit baseada em UUID.
- [ ] Configurar webhook no projeto LiveKit.
- [ ] Testar criação, entrada, saída, reconexão e expiração do token.
- [ ] Remover `VITE_LIVEKIT_TOKEN_SERVER_ID` dos builds de produção.

Critério de saída: uma pessoa sem conta ativa não consegue obter credenciais LiveKit, ainda que conheça o código da sala.

## Fase 6 — Painel admin embutido

- [ ] Adicionar entrada administrativa ao shell do app condicionada a `is_admin` retornado pelo servidor.
- [ ] Criar página de calls abertas com participantes e duração.
- [ ] Criar página de usuários com ativação/desativação.
- [ ] Criar página de convites com criação, revogação e estados.
- [ ] Adicionar confirmações para ações destrutivas.
- [ ] Assinar atualizações Realtime com reconexão e refetch.
- [ ] Ocultar e limpar dados administrativos ao perder autorização ou sessão.
- [ ] Implementar estados vazios, loading, erro e acesso negado.

Critério de saída: o proprietário opera o painel; usuário comum recebe 403 mesmo forçando a interface ou chamando endpoints diretamente.

## Fase 7 — Verificação de segurança

- [ ] Extrair o `app.asar` do build e procurar chaves/segredos conhecidos.
- [ ] Procurar secrets e JWTs nos sourcemaps, logs, artefatos e histórico Git.
- [ ] Testar RLS usando anon key e JWT de usuário comum.
- [ ] Testar chamadas administrativas com JWT adulterado, expirado e de usuário comum.
- [ ] Testar replay e assinatura inválida de webhook.
- [ ] Testar rate limits.
- [ ] Verificar CSP, navegação externa, preload e IPC.
- [ ] Executar `npm run typecheck`, `npm run build` e empacotamento Windows.

Critério de saída: nenhuma credencial crítica aparece no cliente e todos os testes negativos falham de modo seguro.

## Fase 8 — Release controlada

- [ ] Adicionar somente variáveis públicas ao GitHub Actions.
- [ ] Confirmar que secrets LiveKit/Supabase existem apenas no Supabase.
- [ ] Gerar release candidata.
- [ ] Testar login por convite em instalação limpa.
- [ ] Testar call entre duas contas em computadores distintos.
- [ ] Validar painel com eventos reais do LiveKit.
- [ ] Publicar notas de migração e procedimento de rollback.

## Matriz mínima de testes

| Cenário | Resultado esperado |
|---|---|
| Sem sessão abre app | somente login |
| Cadastro direto sem convite | negado |
| Usuário ativo entra em sala | token e conexão válidos |
| Usuário desativado solicita token | 403 |
| Usuário comum força painel | 403/nenhum dado |
| Admin lista calls | apenas dados permitidos |
| Webhook válido repetido | uma única alteração |
| Webhook com assinatura inválida | 401/nenhuma escrita |
| Bundle extraído | nenhuma chave secreta |
| Logout durante call | desconecta e limpa sessão |

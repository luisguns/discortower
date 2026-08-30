# Supabase control plane

## Provisionamento

1. Crie o projeto Supabase e aplique as migrations em `migrations/` na ordem: controle de acesso e canais persistentes.
2. Desabilite o cadastro público e adicione o redirect usado pelo Desktop: `fordkall://auth/callback`.
3. Convide o proprietário pelo Dashboard, confirme o e-mail e insira seu UUID em `public.admin_users` usando o SQL Editor. O UUID não deve ser commitado.
4. Cadastre os secrets diretamente nas Edge Functions:

   - `SECRET_KEY` (chave administrativa do Supabase; o prefixo `SUPABASE_` é reservado)
   - `LIVEKIT_URL`
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`
   - `DESKTOP_INVITE_REDIRECT_URL=fordkall://auth/callback`
   - `FUNCTION_ALLOWED_ORIGINS`
   - `CALL_LIMIT_CRON_SECRET` (segredo usado pelo Supabase Cron para chamar `enforce-call-limits`)
   - `LIVEKIT_MONTHLY_PARTICIPANT_MINUTES_BUDGET` (opcional; padrão operacional 5.000)

5. Faça o deploy das funções em `functions/` e configure o webhook assinado do LiveKit para `livekit-webhook`.
6. Agende `enforce-call-limits` a cada minuto via Supabase Cron/`pg_cron`, armazenando o segredo no Vault e enviando-o no header `x-call-limit-secret`.

Os limites operacionais ficam em `public.call_guardrail_settings` e podem ser alterados na aba **Limites** do painel pelo proprietário. A função `admin-call-settings` valida os valores e impede que o kick aconteça antes do aviso ou que o aviso de duração ocorra depois do fim da call.

Exemplo de agendamento (depois de criar `project_url` e `publishable_key` no Vault):

```sql
select cron.schedule(
  'enforce-call-limits-every-minute',
  '* * * * *',
  $$select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/enforce-call-limits',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-call-limit-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'call_limit_cron_secret')),
    body := '{}'::jsonb
  )$$
);
```

O cliente só recebe `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Nenhum secret LiveKit/Supabase deve entrar em `VITE_*`, no CI do frontend ou no bundle Electron.

## Verificação

O arquivo `tests/authorization.sql` contém verificações mínimas de privilégios. Para validar RLS com sessões reais, execute também as matrizes negativas da spec usando a anon key e um JWT de usuário comum.

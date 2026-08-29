# Supabase control plane

## Provisionamento

1. Crie o projeto Supabase e aplique a migration em `migrations/20260829000000_auth_admin_control_plane.sql`.
2. Desabilite o cadastro público e adicione os redirects exatos usados pelo Web e pelo Desktop (`fordkall://auth/callback`, quando o protocolo Desktop estiver habilitado).
3. Convide o proprietário pelo Dashboard, confirme o e-mail e insira seu UUID em `public.admin_users` usando o SQL Editor. O UUID não deve ser commitado.
4. Cadastre os secrets diretamente nas Edge Functions:

   - `SUPABASE_SECRET_KEY` (ou `SUPABASE_SERVICE_ROLE_KEY`)
   - `LIVEKIT_URL`
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`
   - `INVITE_REDIRECT_URL`
   - `DESKTOP_INVITE_REDIRECT_URL` (normalmente `fordkall://auth/callback`)
   - `FUNCTION_ALLOWED_ORIGINS`

5. Faça o deploy das funções em `functions/` e configure o webhook assinado do LiveKit para `livekit-webhook`.

O cliente só recebe `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e, opcionalmente, uma URL pública de callback. Nenhum secret LiveKit/Supabase deve entrar em `VITE_*`, no CI do frontend ou no bundle Electron.

## Verificação

O arquivo `tests/authorization.sql` contém verificações mínimas de privilégios. Para validar RLS com sessões reais, execute também as matrizes negativas da spec usando a anon key e um JWT de usuário comum.

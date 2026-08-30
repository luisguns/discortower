# Supabase control plane

## Provisionamento

1. Crie o projeto Supabase e aplique a migration em `migrations/20260829000000_auth_admin_control_plane.sql`.
2. Desabilite o cadastro público e adicione o redirect usado pelo Desktop: `fordkall://auth/callback`.
3. Convide o proprietário pelo Dashboard, confirme o e-mail e insira seu UUID em `public.admin_users` usando o SQL Editor. O UUID não deve ser commitado.
4. Cadastre os secrets diretamente nas Edge Functions:

   - `SECRET_KEY` (chave administrativa do Supabase; o prefixo `SUPABASE_` é reservado)
   - `LIVEKIT_URL`
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`
   - `DESKTOP_INVITE_REDIRECT_URL=fordkall://auth/callback`
   - `FUNCTION_ALLOWED_ORIGINS`

5. Faça o deploy das funções em `functions/` e configure o webhook assinado do LiveKit para `livekit-webhook`.

O cliente só recebe `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Nenhum secret LiveKit/Supabase deve entrar em `VITE_*`, no CI do frontend ou no bundle Electron.

## Verificação

O arquivo `tests/authorization.sql` contém verificações mínimas de privilégios. Para validar RLS com sessões reais, execute também as matrizes negativas da spec usando a anon key e um JWT de usuário comum.

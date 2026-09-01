# Tarefas e gates

1. Aplicar a migration social e fazer deploy de `social-action`.
2. Validar RLS com Alice, Bruno e Carlos: terceiro não lê mensagens/imagens; bloqueio nega; remoção preserva leitura.
3. Validar onboarding de username, conflito concorrente e troca de username.
4. Validar pedidos, aceite, recusa, cancelamento, remoção e bloqueio.
5. Validar texto, imagem, paginação, tombstone, não lidas e Realtime em duas sessões.
6. Validar screenshots em 1440×900, 1024×768 e 390×844; Home, canais, perfil e chat de call não podem regredir.
7. Executar `npm run typecheck`, `npm run build`, testes SQL e advisors Supabase.

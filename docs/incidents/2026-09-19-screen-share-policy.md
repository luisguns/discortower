# Tela aparece e desaparece no receptor — 19/09/2026

Diagnóstico de produção e correção preparada para a versão 0.8.5.

## Evidência de produção

- Call: `a0b46d8a-1cc9-4c45-be3b-ba84f0433d8e`.
- Sala RTC: `DT_82BFB44300824189BF64B5236B159685`.
- Dois clientes WEB, versão 0.8.4, confirmados em `signal_session_ready`.
- Sentry registra primeiro frame e, depois, `rtc.trackUnsubscribed`,
  `rtc.trackUnpublished` e `video.detached` no receptor.
- Auditoria Supabase `audit_log`, consultada diretamente:

| Horário UTC | Evento | Resultado | Dimensões | Limite |
| --- | --- | --- | --- | --- |
| 04:22:13.087650 | screen_share_policy_violation | blocked | 1920×1080 | 1280 |
| 04:22:20.983443 | screen_share_policy_violation | blocked | 1920×1080 | 1280 |

Horários locais America/Sao_Paulo: 01:22:13 e 01:22:20.
`call_guardrail_settings.max_screen_share_dimension` está em 1280.

## Caminho confirmado no código

`supabase/functions/livekit-webhook/index.ts` trata `track_published` e compara
`Math.max(width, height)` ao limite global. Quando excedido, chama
`roomService().updateParticipant` permitindo apenas microfone/câmera e registra
o bloqueio por `resolution_limit`.

Em `control-tower/packages/server/src/room-manager.ts`, `updateParticipant`
fecha os producers de tela e áudio de tela. `Room.closeProducer` envia
`producerClosed` aos outros participantes (`broadcast(peer.id, ...)`), deixando
o publicador fora dessa notificação. A captura/prévia local pode continuar viva
mesmo após a transmissão remota ser removida.

Ao encerrar posteriormente a captura local, os logs do servidor registram
`PRODUCER_NOT_FOUND` em `closeProducer` (04:22:18.103/18.104 e
04:22:28.782 UTC). Esses erros são compatíveis com a remoção anterior pela
política; não constituem a causa inicial.

## Encaminhamento técnico

Alinhar a qualidade permitida pelo cliente com a política efetiva do backend;
verificar limites negociados e dimensões reais da captura; sincronizar no
publicador a revogação/remoção pelo servidor, encerrando a captura e exibindo
o motivo. Cobrir a sequência em teste com emissor e receptor. Não simplesmente
desativar a política global nem concluir que a observabilidade corrigiu o bug.

## Correção 0.8.5

A auditoria de emissão dos tokens confirmou uma conta host autorizada a 1080p30
e uma owner autorizada a 1080p60. A validação do webhook passa a usar a mesma
resolução de permissões da emissão do token (perfil, papel e configurações lidos
no servidor), em vez do limite legado global de 1280. Contas limitadas a 720p
continuam impedidas de publicar 1080p; dimensões acima de 1920 continuam bloqueadas.

O cliente limita as opções à autorização da conta e do token, e solicita dimensões
máximas de captura correspondentes. Remoções pelo servidor notificam também o
emissor: ele encerra a captura/prévia, atualiza o controle e registra o evento.
Fechar novamente uma publicação já removida é idempotente e restrito ao próprio
participante.

Testes reproduzem o webhook com 1080p autorizado/não autorizado, falha na consulta
de política, remoção de vídeo/áudio no cliente, notificação duplicada e nova
captura após a remoção. Não substituem a confirmação visual em duas máquinas.

Esta evidência explica os dois bloqueios desta rodada; não demonstra que todos
os bugs anteriores tenham a mesma causa. Relógios dos clientes podem divergir:
use também os horários do servidor/auditoria para ordenar eventos entre clientes.

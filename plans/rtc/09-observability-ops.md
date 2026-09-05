# 09 — Observabilidade e operação

## Logs

- Formato: JSON estruturado (uma linha por evento) para facilitar grep/ingestão.
- Campos base: `ts`, `level`, `roomName`, `roomSid`, `peerId`, `identity`, `event`, `msg`.
- Eventos mínimos a logar: connect/disconnect, criação/fim de sala, produce/consume,
  webhook enviado (com status), erros de handler, worker died, ICE restart.
- Níveis: `error`, `warn`, `info`, `debug`. Em prod, `info`. `logLevel` do worker mediasoup:
  `warn` em prod, `debug` para investigar mídia.
- **Não** logar `metadata` de participante em nível info (pode conter dado de perfil); só em debug.

## Métricas (`/metrics`, formato Prometheus)

Expor pelo menos:
- `rtc_rooms_total` (gauge)
- `rtc_peers_total` (gauge)
- `rtc_producers_total{kind,source}` (gauge)
- `rtc_consumers_total{kind}` (gauge)
- `rtc_worker_cpu` / `rtc_worker_load` por worker (via `worker.getResourceUsage()`)
- `rtc_webhook_sends_total{event,result}` (counter)
- `rtc_connect_total{result}` (counter)
- `rtc_bytes_sent` / `rtc_bytes_received` (via stats do transport, amostrado)
- `rtc_ice_restarts_total`, `rtc_errors_total{code}`

Coletar stats de transport periodicamente (`transport.getStats()`), agregando por sala, para
RTT/jitter/perda — úteis nos testes de carga (doc 10).

## Health

- `GET /healthz` → `200 { ok:true, workers:[{pid,alive}], rooms, peers, uptime }`.
- Se um worker morreu e não foi recriado: `503`.
- Usado pelo Docker healthcheck e por um monitor externo simples (uptime check).

## Alertas (mínimo viável)

- **CPU alto sustentado**: se média de `worker.getResourceUsage`/host CPU > 85% por > N min,
  logar `warn` e (opcional) postar num webhook de alerta (Discord/Telegram). Importante por
  causa do limite de 180 min a 100% da Hostinger.
- **Worker died**: `error` + reinício do processo (supervisor/systemd/docker `restart`).
- **Falha de webhook** repetida: `warn` com contagem; o `enforce-call-limits` reconcilia o DB.
- **Sala presa** (`starting` que nunca virou `open`): já coberto pelo `enforce-call-limits`
  (timeout `stale_start`).

## Guardrails de call (paridade com o comportamento atual)

Estes limites **já existem** no app/edge/DB e continuam valendo — a Control Tower só precisa fornecer
as primitivas (`listParticipants`, `sendData`, `removeParticipant`, `deleteRoom`,
`updateParticipant`) e webhooks fiéis. Referência: `enforce-call-limits/index.ts`,
`call_guardrail_settings`.

| Guardrail | Valor default | Mecanismo |
| --- | --- | --- |
| Aviso de "sozinho" | 240 s | cron `sendData(solo_timeout_warning)` |
| Kick de "sozinho" | 300 s | cron `removeParticipant` |
| Duração máxima da call | 21600 s (6 h) | cron `deleteRoom` + cooldown |
| Aviso de duração | 300 s antes | cron `sendData(max_duration_warning)` |
| Cooldown pós-limite | 900 s | DB `reopen_after` |
| Timeout de "starting" | 120 s | cron fecha sessão presa |
| Resolução máx. de tela | 1280 (maior lado) | webhook `track_published` → `updateParticipant` bloqueia |
| Limite de calls ativas | 5 (recomendado 1–2 no VPS novo) | RPC de reserva no DB |

O agente **não** reimplementa esses guardrails na Control Tower; eles vivem nas Edge Functions e no
DB. A Control Tower só garante que as 5 primitivas e os 6 webhooks funcionem como o LiveKit fazia.

## Enforce de resolução de tela (detalhe crítico)

Para o guardrail de resolução funcionar, o webhook `track_published` de um producer de
**screen_share** precisa trazer `track.width` e `track.height` reais. Fonte: o cliente envia
`appData.width/height` no `produce` (de `MediaStreamTrack.getSettings()`), e a Control Tower os copia
para o webhook. Sem isso, `livekit-webhook/index.ts` não consegue impor o limite.

## Runbook (operação na VPS)

- **Subir**: `docker compose -f deploy/docker-compose.vps.yml up -d`.
- **Logs**: `docker compose logs -f torre`.
- **Reiniciar Control Tower** (derruba calls ativas — avisar): `docker compose restart torre`.
  - A Control Tower envia `roomClosed{server_shutdown}`; clientes tentam reconectar; se a Control Tower voltar
    rápido, as calls se restabelecem (novos tokens não são necessários se ainda válidos).
- **Rotacionar secret**: adicionar segunda chave no mapa `iss`→secret, atualizar secrets do
  Supabase, remover a antiga depois (doc 07).
- **Trocar IP anunciado** (mudou o IP da VPS): editar `RTC_ANNOUNCED_IP`, `restart`.
- **Incidente de mídia** (sem áudio/vídeo): checar faixa UDP no firewall, `announcedIp`,
  e o caminho TURN (testar com `turnutils_uclient`). Ver doc 10 §diagnóstico.
- **Rollback para LiveKit**: reverter o import do seam e os secrets (doc 11 mantém o caminho).

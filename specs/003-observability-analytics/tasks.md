# Tarefas — Observabilidade e analytics

Ordem sugerida. Cada etapa tem um gate de verificação. Tags indicam o repo dono:
`[infra]` VPS, `[control-tower]` repo do servidor, `[discortower]` este app/Supabase.

## Etapa 0 — Fundação na nuvem (custo zero)
- [ ] `[infra]` Criar stack gratuito na Grafana Cloud; anotar URLs/usuários de Prometheus e Loki e
  gerar um token de Access Policy com escopos `metrics:write` + `logs:write`.
  - **Gate:** credenciais salvas num `.env` local (não versionado), a partir do `.env.example`.

## Etapa 1 — Saúde da VPS (entrega mais rápida, valor imediato)
- [ ] `[infra]` Subir `node_exporter` + `Grafana Alloy` via `docker-compose.observability.yml`.
- [ ] `[infra]` Importar no Grafana o dashboard **Node Exporter Full** (ID 1860).
  - **Gate (CA1):** dashboard mostra CPU, RAM, disco e **banda rx/tx** da VPS com defasagem ≤ 30 s.

## Etapa 2 — Instrumentar o SFU (o diferencial)
- [ ] `[control-tower]` Adicionar `prom-client` ao servidor; expor `GET /metrics` em porta interna
  (localhost), com default metrics + `ct_worker_cpu_ratio` de `worker.getResourceUsage()`.
- [ ] `[control-tower]` Amostrar `getStats()` de router/transport/producer/consumer num intervalo
  (ex.: 10 s) e alimentar os gauges/counters do contrato (`ct_bytes_*`, `ct_packets_lost_total`,
  `ct_jitter_seconds`, `ct_nack_total`, `ct_pli_total`, `ct_rooms_active`, `ct_participants_active`,
  `ct_producers_active`, `ct_consumers_active`), respeitando a **disciplina de cardinalidade**.
- [ ] `[control-tower]` Adicionar contadores de erro (`ct_ice_failures_total`, `ct_dtls_failures_total`,
  `ct_signaling_errors_total`) e de inconsistência (`ct_zombie_rooms_total`, `ct_orphan_consumers_total`,
  `ct_signaling_transport_drift`).
- [ ] `[infra]` Confirmar a porta do `/metrics` no `config.alloy` (scrape "control_tower").
  - **Gate (CA2):** `curl localhost:6789/metrics` na VPS lista as métricas `ct_*`; elas aparecem no
    Grafana Explore em ≤ 1 min.

## Etapa 3 — Dashboard de RTC + inconsistências
- [ ] `[infra]` Montar dashboard "RTC / Control Tower": salas/participantes ativos, banda agregada
  (`rate(ct_bytes_sent_total)`), perda de pacote, jitter, erros, workers.
- [ ] `[infra]` Painel de inconsistência: `rate(ct_bytes_sent_total)` sobreposto a
  `rate(node_network_transmit_bytes_total)` no mesmo gráfico.
  - **Gate (CA2, CA4):** ambos os painéis renderizam com dados reais de uma call de teste.

## Etapa 4 — Analytics do app (dados existentes)
- [ ] `[discortower]` Criar role Postgres read-only no Supabase com `SELECT` só na `audit`.
- [ ] `[infra]` Adicionar o Postgres do Supabase como datasource read-only no Grafana.
- [ ] `[infra]` Dashboard "Analytics do app": calls iniciadas, split de provider, destino RTC, falhas
  de auth (SQL sobre `audit` / `action='livekit_token_issued'`).
  - **Gate (CA3):** números batem com uma verificação manual de contagem no período.

## Etapa 5 — Logs (erros e inconsistências em texto)
- [ ] `[infra]` Confirmar que os logs dos containers chegam ao Loki com label `container` e `level`.
  - **Gate:** `{level="error"}` e `{container="control-tower"}` retornam linhas no Explore.

## Etapa 6 — Validação de custo e privacidade
- [ ] `[infra]` Após 24 h, checar a contagem de séries ativas na Grafana Cloud.
  - **Gate (CA5):** dentro do free tier, com folga.
- [ ] `[control-tower]` Revisar que nenhum label carrega id de usuário/sala/canal.
  - **Gate (CA6):** revisão de labels e de payloads de log aprovada.

## Não fazer nesta fase
- Regras de alerta, contatos de notificação, tracing, session replay (ver `requirements.md`).

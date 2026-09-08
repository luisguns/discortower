# Design — Observabilidade e analytics

## Contexto de arquitetura (o que investigamos)

O RTC próprio (**Control Tower**, provider `torre`) é um **SFU mediasoup** com uma fachada compatível
com `livekit-client`:

- Cliente: `@gunns-dev/control-tower-client` → usa `mediasoup-client`. Fallback real de LiveKit
  (`livekit-client`) coexiste no bundle, selecionado em runtime por `RTC_PROVIDER` (`torre` | `livekit`).
- Signaling: `@gunns-dev/control-tower-protocol` (envelope WebSocket próprio).
- Servidor: `@gunns-dev/control-tower-server-sdk`, roda na VPS, código em `github.com/luisguns/control-tower`.

**Consequência central:** mediasoup **não** expõe Prometheus nativo (LiveKit exporia). Métricas de RTC
só existem se o servidor for instrumentado a partir de `worker.getResourceUsage()` e dos `getStats()`
de `router`/`transport`/`producer`/`consumer`. Essa é a única peça que exige código novo de servidor.

### Dados que já emitimos (reaproveitáveis, sem código novo)

- Edge `issue-livekit-token` grava audit `livekit_token_issued` com `provider`, `rtcHost`,
  `channelId`, `callId`, `roomSessionId`, `role` → base para "calls iniciadas", "split de provider",
  "destino RTC". (`supabase/functions/issue-livekit-token/index.ts`)
- A mesma função responde 401/403/429 em falhas de autorização → base para "falhas de auth".
- Cliente loga `RTC_CONNECTION_DETAILS`, `RTC_JOIN_FAILED`, `RTC_TOKEN_ISSUED`
  (`src/hooks/useLiveKitRoom.ts`).

## Topologia de coleta (custo zero)

```
VPS (splotys / Control Tower)                     Grafana Cloud (free tier)
┌───────────────────────────────────┐             ┌───────────────────────────┐
│ Control Tower SFU ──/metrics────┐  │             │  Prometheus  (métricas)   │
│ node_exporter     ──/metrics────┼─▶ Alloy ─push─▶│  Loki        (logs)       │
│ docker logs ────────────────────┘  │  (agente)   │  Grafana     (dashboards) │
└───────────────────────────────────┘             └─────────────▲─────────────┘
                                                                 │ datasource (read-only)
Supabase (nuvem)  ─── Postgres: tabela audit ───────────────────┘
```

- **Só o agente `Grafana Alloy` + `node_exporter` rodam na VPS.** Dashboards e retenção ficam na nuvem.
  Se a VPS cair, o histórico sobrevive (e um alerta futuro de "server sumiu" continua possível).
- **Analytics do app** vêm da tabela `audit` do Supabase, conectada ao Grafana como **datasource
  Postgres read-only** — zero coleta nova, zero código novo.

> Free tier Grafana Cloud (referência de planejamento, confirmar na contratação): ~10k séries de
> métrica ativas, ~50 GB de logs/mês, retenção ~14 dias. Cabe folgado no nosso volume se respeitarmos
> a disciplina de cardinalidade abaixo.

## Contrato de métricas do Control Tower `[control-tower]`

O servidor deve expor `GET /metrics` (formato Prometheus, via `prom-client`) numa porta **interna**
(ex.: `:6789`, só acessível ao Alloy no localhost — **não** exposta à internet). Métricas mínimas:

### Processo / workers (baixo custo)
- `prom-client` default metrics: `process_cpu_seconds_total`, `process_resident_memory_bytes`,
  `nodejs_eventloop_lag_seconds`, GC.
- `ct_worker_cpu_ratio{worker="0"}` — de `worker.getResourceUsage()` por worker mediasoup.
- `ct_workers_total` — nº de workers vivos.

### Domínio RTC (agregado — ver Cardinalidade)
- `ct_rooms_active` (gauge)
- `ct_participants_active` (gauge)
- `ct_producers_active{kind="audio|video|screen"}` (gauge)
- `ct_consumers_active{kind="audio|video|screen"}` (gauge)
- `ct_bytes_sent_total{kind}` / `ct_bytes_received_total{kind}` (counter) → **banda** (taxa via `rate()`)
- `ct_packets_lost_total{kind}` (counter) → **perda de pacote**
- `ct_nack_total{kind}` / `ct_pli_total{kind}` (counter) → retransmissões / keyframes
- `ct_jitter_seconds{kind}` (gauge, média móvel dos consumers) → **jitter**
- `ct_ice_failures_total`, `ct_dtls_failures_total`, `ct_signaling_errors_total` (counter) → **erros**
- `ct_call_duration_seconds` (histogram) → duração de call
- `ct_join_latency_seconds` (histogram) → do token à mídia fluindo

### Inconsistências (contadores dedicados)
- `ct_zombie_rooms_total` — salas com 0 participantes que não foram limpas.
- `ct_orphan_consumers_total` — consumers sem producer correspondente.
- `ct_signaling_transport_drift` (gauge) — |participantes no signaling − transports ativos|.

A detecção "banda do SFU × banda da NIC" é feita no **dashboard**, cruzando `rate(ct_bytes_sent_total)`
com `rate(node_network_transmit_bytes_total)` — não precisa de métrica nova.

## Cardinalidade (requisito de custo zero)

Para caber no free tier, **labels são agregados**. Proibido usar como label: `participantId`,
`roomId`/`callId`, `userId`, `channelId`, IP. Labels permitidos: `instance`, `worker`, `kind`,
`provider`. Isso mantém a projeção em centenas de séries, não milhares. Séries por sala/participante
seriam ilimitadas e estourariam o tier — essas dimensões, quando necessárias, saem via **logs** (Loki),
não métricas.

## Infra na VPS `[infra]`

Dois arquivos, rodando ao lado do Control Tower via `docker compose`:

### `docker-compose.observability.yml`
- `node_exporter` (host network/pid) → CPU, RAM, disco, **banda rx/tx**, systemd.
- `grafana/alloy` → scrape de `localhost:9100` (node) e `localhost:6789` (SFU); coleta de logs dos
  containers via `docker.sock`; push para Prometheus e Loki da Grafana Cloud.

### `config.alloy` (resumo)
- `prometheus.scrape` "node" e "control_tower" → `prometheus.remote_write` (Grafana Cloud).
- `discovery.docker` + `loki.source.docker` → `loki.process` (marca `level=error|warn`) →
  `loki.write` (Grafana Cloud).

Credenciais (`GC_PROM_URL/USER`, `GC_LOKI_URL/USER`, `GC_TOKEN`) vêm de um `.env` **não versionado**.
Os arquivos de referência prontos estão anexados na conversa desta spec e devem ser commitados no
repo de infra do Control Tower, não neste app.

## Analytics do app `[discortower]`

Conectar a Postgres do Supabase ao Grafana como datasource **read-only** (role dedicada, `SELECT`
apenas na `audit`). Painéis via SQL:

- **Calls iniciadas**: `count(*)` de `audit` onde `action='livekit_token_issued'`, por bucket de tempo.
- **Split de provider**: `group by metadata->>'provider'`.
- **Destino RTC**: `group by metadata->>'rtcHost'`.
- **Falhas de auth**: eventos de audit com `result='failure'` nas ações de call, ou (alternativa) via
  logs da edge function no Loki se optarmos por enviá-los.

Nenhuma dessas leituras cria dependência nova no cliente nem grava nada novo.

## Privacidade e segurança

- `/metrics` do SFU nunca é exposto à internet — bind em localhost, scrape só pelo Alloy.
- Nenhum identificador de usuário/canal vira label de métrica (ver Cardinalidade) nem vai como campo
  livre para a nuvem sem necessidade.
- Datasource Postgres usa role read-only restrita à `audit`; sem acesso a mensagens/perfis.
- `.env` com tokens da Grafana Cloud fora do versionamento.

## Caminho preparado para alertas (fora de escopo, mas não bloqueado)

As métricas e labels acima já bastam para, depois, criar regras como "server sem `up` por 2 min" ou
"perda de pacote > X". Nada nesta fase impede isso; só **não** configuramos regras nem contatos agora.

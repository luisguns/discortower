# Spec 003 — Observabilidade e analytics (custo zero)

Status: **proposta aguardando aprovação do proprietário**.

Esta especificação segue o fluxo SDD: requisitos aprovados orientam o design; o design aprovado
orienta as tarefas; código/infra só depois dessas duas aprovações.

1. [`requirements.md`](requirements.md) — o que queremos enxergar, limites e critérios de aceite.
2. [`design.md`](design.md) — arquitetura de coleta, métricas do SFU, fontes já existentes e infra.
3. [`tasks.md`](tasks.md) — sequência de entrega e gates de verificação.

## Premissas fixadas (proprietário, 2026-09-07)

- **Custo zero.** Grafana Cloud free tier + agentes open-source na VPS. Sem serviço pago.
- **Sem alertas nesta fase.** Foco em *analytics* e visão de saúde. Regras de alerta ficam fora de
  escopo até pedido explícito (ver `Fora de escopo`).
- **Foco no RTC próprio.** O diferencial é observar o **Control Tower** — um **SFU mediasoup**, não
  LiveKit (ver `../../` memória de IA e `design.md`). Isso exige instrumentar o servidor; não há
  `/metrics` de graça.

## Fronteira entre repositórios (contrato R1)

Como nas specs de RTC, a instrumentação do **servidor** Control Tower pertence ao repo
`github.com/luisguns/control-tower`. Esta spec é a **coordenadora**: define o contrato de métricas
que o servidor deve expor e cobre as camadas que vivem aqui (Supabase, edge functions, app).
As tarefas marcadas `[control-tower]` são rastreadas lá; as `[discortower]` e `[infra]` aqui.

Alterações de escopo começam em `requirements.md`. Decisões técnicas sem mudança de comportamento
pertencem a `design.md`. Execução e progresso pertencem a `tasks.md`.

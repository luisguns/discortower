# Requisitos — Observabilidade e analytics

## Objetivo

Ter um painel único (Grafana Cloud) que responda, sem custo, quatro perguntas do proprietário:

1. **Largura de banda** — quanto de rede o server e cada call consomem, e onde está indo.
2. **Erros** — falhas de conexão RTC, de sinalização e de autorização, quantificadas ao longo do tempo.
3. **Inconsistências** — divergências entre o que o sistema *acha* que existe e o que existe de fato
   (salas órfãs, banda do SFU que não bate com a da placa de rede, split de provider anômalo).
4. **Saúde do server e do app** — CPU/RAM/disco da VPS, uso dos workers do SFU, calls e participantes
   ativos, latência de entrada em call.

## O que precisa ser observável

### Saúde da VPS (infra)
- CPU, memória, disco e IO da VPS.
- **Banda de rede** por interface (rx/tx bytes por segundo) — a referência "de verdade" da largura de banda.
- Estado dos processos/containers que deveriam estar no ar (Control Tower, agente de coleta).

### Saúde do RTC (Control Tower / SFU mediasoup)
- Nº de **salas ativas** e **participantes ativos** (agregado).
- Nº de **producers/consumers** por tipo de mídia (áudio, câmera, tela).
- **Banda agregada** enviada/recebida pelo SFU (bytes acumulados → taxa).
- Qualidade de mídia: **perda de pacote**, **jitter**, contagem de **NACK/PLI** (retransmissões e
  refresh de keyframe) — sinais de rede ruim.
- **Erros de transporte/sinalização**: falhas de ICE, falhas de DTLS, erros de protocolo de signaling.
- **Uso dos workers** mediasoup (CPU por worker) e saúde do processo Node (event-loop lag, memória).
- **Duração de call** e **latência de entrada** (do pedido de token até mídia fluindo).

### Analytics do app (a partir de dados que já emitimos — sem código novo no servidor)
- **Calls iniciadas** ao longo do tempo (por dia/hora).
- **Split de provider** (`torre` vs `livekit`) — acompanha o canary do RTC próprio.
- **Falhas de autorização** de entrada em call (respostas 401/403/429 da edge function).
- Distribuição por **canal** e por **host RTC** de destino.

## Critérios de aceite

- CA1. Um dashboard "Saúde da VPS" mostra CPU, RAM, disco e banda rx/tx da VPS, com dados vivos
  (defasagem ≤ 30 s).
- CA2. Um dashboard "RTC / Control Tower" mostra salas ativas, participantes, banda agregada do SFU,
  perda de pacote e jitter, alimentado pelo `/metrics` do servidor.
- CA3. Um dashboard "Analytics do app" mostra calls iniciadas, split de provider e falhas de auth,
  alimentado por dados que **já existem** (audit + logs de edge function), sem novas gravações no cliente.
- CA4. Uma inconsistência detectável de exemplo funciona: comparação entre banda reportada pelo SFU e
  banda da NIC da VPS aparece lado a lado no mesmo painel.
- CA5. Tudo opera **dentro do free tier** da Grafana Cloud — a contagem de séries de métrica projetada
  cabe no limite (ver `design.md`, seção Cardinalidade), verificada após 24 h de coleta.
- CA6. Nenhum dado pessoal (identidade de usuário, conteúdo, e-mail) sai da VPS como *label* de métrica
  ou vai para a nuvem em texto de log sem necessidade.

## Fora de escopo (nesta fase)

- **Alertas / paging** (Alertmanager, notificação no Discord/e-mail). Fica para uma fase posterior;
  o design deve deixar o caminho pronto mas não configurar regras.
- Tracing distribuído (OpenTelemetry spans) e APM por requisição.
- Session replay / gravação de mídia.
- Dashboards de negócio/receita.
- Retenção longa (> free tier) e data warehouse.

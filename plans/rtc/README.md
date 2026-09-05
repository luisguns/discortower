# Splotys RTC — substituto próprio do LiveKit (codinome "Control Tower")

Este diretório contém o plano completo para construirmos nosso próprio servidor de
mídia em tempo real (SFU) e os SDKs de cliente/servidor, substituindo a dependência
do LiveKit (Cloud ou self-hosted) por uma solução 100% nossa, hospedada em VPS.

O plano foi escrito para ser **executado por um agente de implementação de menor
capacidade**. Por isso cada documento é explícito: define nomes de arquivos, formatos
de mensagens, contratos de API, pseudo-código e critérios de "pronto" (Definition of
Done). Quando um documento diz "faça X", é para fazer exatamente X, sem improviso.

## Decisões já tomadas (não reabrir sem aprovação)

1. **Servidor de mídia (SFU):** Node.js + [mediasoup](https://mediasoup.org). O caminho
   quente de mídia (SRTP, ICE/DTLS, encaminhamento RTP) roda em workers nativos C++ do
   mediasoup, um por núcleo de CPU. A orquestração é TypeScript.
2. **Cliente:** protocolo de signaling próprio + um SDK de browser (`@control-tower/client`)
   que expõe uma **fachada compatível** com a superfície do `livekit-client` que o app
   já usa (classe `Room`, enum `RoomEvent`, `Track.Source`, `setMicrophoneEnabled`,
   `sendText`/`sendFile`, `registerTextStreamHandler`, etc.). Assim os hooks e componentes
   de chamada quase não mudam — trocamos apenas o import.
3. **SDK de servidor:** `@control-tower/server-sdk` em TypeScript, compatível com Deno,
   substituindo `livekit-server-sdk` no seam único `supabase/functions/_shared/livekit.ts`.
   Mantém os mesmos nomes: `AccessToken`, `RoomServiceClient`, `WebhookReceiver`, `TrackSource`.
4. **Idioma do código e dos comentários:** o app usa português nas mensagens de UI e
   inglês nos identificadores. Mantenha esse padrão.

## Ordem de leitura

| # | Documento | Para quê |
| --- | --- | --- |
| 00 | [Visão geral](00-overview.md) | Objetivo, escopo, glossário, monorepo, nomes |
| 01 | [Inventário LiveKit](01-livekit-inventory.md) | Tudo que o LiveKit nos atende hoje = alvo de paridade |
| 02 | [Arquitetura](02-architecture.md) | Componentes, diagramas, fluxos, deploy local vs VPS |
| 03 | [Protocolo de signaling](03-protocol.md) | Envelope, handshake, todas as mensagens e schemas |
| 04 | [Servidor de mídia (SFU)](04-media-server.md) | Design mediasoup: workers, routers, salas, produtores/consumidores |
| 05 | [SDK cliente](05-client-sdk.md) | Fachada compatível, mapeamento método a método |
| 06 | [SDK servidor](06-server-sdk.md) | AccessToken, RoomService HTTP, Webhooks (Deno) |
| 07 | [Segurança e auth](07-security-auth.md) | JWT, grants, assinatura de webhook, credenciais TURN |
| 08 | [Escalabilidade e VPS](08-scalability-vps.md) | Docker local, deploy VPS, portas, TURN, escala futura |
| 09 | [Observabilidade e operação](09-observability-ops.md) | Logs, métricas, health, guardrails, runbook |
| 10 | [Plano de testes](10-testing-plan.md) | Testes locais, carga, matriz funcional |
| 11 | [Migração e cutover](11-migration-cutover.md) | Feature flag, rollback, troca de secrets |
| 12 | [Marcos de implementação](12-roadmap-milestones.md) | Fases incrementais com Definition of Done |

## Princípio norteador

> **Primeiro rodar tudo localmente** (uma máquina, `docker compose up`), **depois** subir
> para o VPS sem reescrever nada — só configuração (DNS, TLS, IP anunciado, firewall).
> Toda decisão de arquitetura deve respeitar esse caminho.

## Relação com o roadmap anterior

O documento [`roadmap/self-hosted-livekit.md`](../../roadmap/self-hosted-livekit.md) descreve
self-hostar **o próprio LiveKit**. Este plano é a alternativa: construir **o nosso**. Os
requisitos de rede, portas e VPS daquele documento continuam válidos como referência de
infraestrutura e devem ser reaproveitados no doc 08.

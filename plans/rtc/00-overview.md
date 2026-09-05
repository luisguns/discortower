# 00 — Visão geral

## Objetivo

Substituir a dependência do LiveKit por um sistema de comunicação em tempo real
próprio, hospedado por nós, mantendo **paridade funcional** com o que o splotys usa
hoje: voz, câmera, compartilhamento de tela (com áudio da tela), chat por dados
(texto e imagem), presença/moderação e webhooks de estado das calls.

Não é objetivo reimplementar tudo que o LiveKit oferece — só o que o splotys usa
(ver [01-livekit-inventory.md](01-livekit-inventory.md)). Recursos fora de escopo:
gravação/egress, ingress RTMP, transcrição, SIP, agents server-side, E2EE por insertable
streams. Ficam anotados como "futuro" mas não entram no MVP.

## Resultado esperado

Ao final, trocar o provedor de mídia deve ser uma troca de **secrets e de um import**:

- Frontend: trocar `import { Room, RoomEvent, ... } from 'livekit-client'` por
  `import { Room, RoomEvent, ... } from '@control-tower/client'`.
- Edge Functions: trocar `npm:livekit-server-sdk` por `npm:@control-tower/server-sdk`
  dentro de `supabase/functions/_shared/livekit.ts` (seam único).
- Secrets: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` passam a apontar para
  a nossa Control Tower (podemos manter os mesmos nomes de variável para minimizar mudança, ou
  renomear para `RTC_URL`/`RTC_API_KEY`/`RTC_API_SECRET` — ver doc 11).

## Glossário

| Termo | Significado |
| --- | --- |
| **SFU** | Selective Forwarding Unit. Servidor que recebe as mídias de cada participante e as reencaminha aos demais sem misturar (sem MCU). É o modelo do LiveKit e do mediasoup. |
| **Control Tower** | Codinome do nosso servidor de mídia (`@control-tower/server`). |
| **Room / Sala** | Espaço lógico onde participantes publicam e assinam mídia. Mapeia 1:1 com o conceito de sala do LiveKit e com `room_sessions` no banco. |
| **Participant** | Um cliente conectado numa sala, com uma `identity` única. |
| **Producer** | (mediasoup) Um fluxo de mídia que um participante publica (mic, câmera, tela). |
| **Consumer** | (mediasoup) A assinatura de um participante a um producer de outro. |
| **Track** | Abstração do SDK cliente para uma faixa de mídia (áudio/vídeo). Mapeia a um producer/consumer. |
| **Track.Source** | Origem semântica da faixa: `Microphone`, `Camera`, `ScreenShare`, `ScreenShareAudio`. |
| **Router** | (mediasoup) Objeto que roteia RTP dentro de um worker; hospeda uma sala. |
| **Worker** | (mediasoup) Processo C++ que faz o trabalho de mídia. Um por núcleo de CPU. |
| **Transport** | Canal WebRTC (ICE/DTLS) entre cliente e Control Tower. Cada cliente tem um `send` e um `recv`. |
| **DataProducer/DataConsumer** | Fluxos de dados (SCTP) para chat e mensagens de sistema. |
| **Grant** | Permissões embutidas no JWT do participante (publicar, assinar, quais fontes). |
| **Guardrails** | Limites de call já existentes (solo timeout, duração máxima, cooldown, resolução de tela). Ver doc 09. |

## Nomes e monorepo

Criaremos um monorepo separado do app (ou um subdiretório `rtc/` no mesmo repo — decidir
no doc 02), com os pacotes:

```
@control-tower/protocol     # tipos e schemas do protocolo (compartilhado)
@control-tower/server       # a Control Tower: SFU + signaling + API de controle + webhooks
@control-tower/client       # SDK de browser com fachada compatível com livekit-client
@control-tower/server-sdk   # SDK para Edge Functions Deno (token, RoomService, webhook)
```

`protocol` é a fonte da verdade dos formatos de mensagem. `client` e `server`
importam dele. `server-sdk` reimplementa o necessário para Deno (JWT + HTTP), sem
depender de mediasoup.

## Restrições de plataforma que moldam o design

- **Electron desktop** (`window.splotysDesktop`): captura de tela usa um seletor próprio;
  o SDK cliente precisa suportar `getDisplayMedia` normal e o caminho desktop. Ver doc 05.
- **Deno** nas Edge Functions: o `server-sdk` não pode usar APIs Node-only; usar Web
  Crypto para JWT (HS256) e `fetch` para HTTP.
- **VPS básica** (2 vCPU / 8 GB, referência Hostinger KVM 2): 1 processo Node, N workers =
  núcleos, faixa de portas UDP para RTC, coturn para TURN. Ver doc 08.
- **Compatibilidade de API do app:** a fachada do `client` deve replicar exatamente
  os métodos/eventos listados no doc 01. Qualquer divergência quebra o app.

## Não-objetivos explícitos (MVP)

- Sem gravação/egress, sem RTMP ingress, sem SIP, sem transcrição.
- Sem multi-host/cluster no MVP (mas a arquitetura não pode impedir — ver doc 08 §"Escala futura").
- Sem E2EE (a mídia é descriptografada no SFU, como no LiveKit padrão).
- Sem compatibilidade de wire com o `livekit-client` original (nós trocamos o SDK).

# 10 — Plano de testes

Filosofia: **provar cada camada localmente** antes de subir. Testes na ordem de baixo para
cima: unidade → integração de protocolo → mídia real com 2+ navegadores → carga.

## Nível 1 — Unidade (por pacote)

**`protocol`**: validação de schemas (envelope, cada mensagem). Testar serialização/parse
e rejeição de payloads malformados.

**`server-sdk`** (roda em Deno — usar `deno test`):
- `AccessToken.toJwt()` produz JWT válido; `verifyJwt` aceita o próprio token e rejeita
  secret errado / expirado.
- `WebhookReceiver.receive` aceita corpo assinado corretamente e rejeita corpo adulterado
  (hash não bate) e assinatura inválida.
- `RoomServiceClient` monta as URLs/corpos certos (mockar `fetch`), e mapeia `state` (3 = disconnected).
- **Teste de compatibilidade**: gerar um token com o novo `AccessToken` e validá-lo com a
  lógica de auth da Control Tower (mesmo secret) — garante que o seam produz o que a Control Tower entende.

**`client`** (jsdom/vitest): fachada — `RoomEvent` tem os valores certos; `Track.Source`
idem; `sendText` retorna `{id,timestamp}`; parsing de `systemData` → `DataReceived`.

**`server`**: room-manager (criar/achar/destruir sala), escolha de worker, autorização de
`produce` por grant, validação de `appData`.

## Nível 2 — Integração de protocolo (sem mídia real)

Um teste que sobe a Control Tower em processo, abre um WebSocket com um token válido e roda o
handshake até `welcome` + `createTransport` (sem completar DTLS). Verifica:
- token inválido → close 4401.
- `produce` de fonte fora do grant → `FORBIDDEN_SOURCE`.
- `consume` de producer inexistente → `PRODUCER_NOT_FOUND`.
- Broadcast: peer B recebe `newProducer` quando A publica (usar dois WS no mesmo teste com
  producers "fake" via mediasoup PlainTransport ou mocks de transport, conforme viabilidade).

## Nível 3 — Mídia real (a prova de fogo)

Manual + semi-automatizado com 2 navegadores (ou 2 perfis) na mesma máquina:

Matriz funcional (cada linha deve passar):
| Caso | Como validar |
| --- | --- |
| Conectar 2 participantes | ambos aparecem na galeria |
| Voz A→B | B ouve A; `RemoteAudioRenderer` toca |
| Mute/unmute mic | ícone e `TrackMuted/Unmuted` corretos; áudio some/volta |
| Câmera on/off | vídeo aparece/some nos dois lados |
| Compartilhar tela (com áudio) | B vê a tela e ouve o áudio da tela |
| Qualidade 720p/1080p | encoding aplicado (checar stats) |
| Chat texto | mensagem chega com nome/avatar |
| Chat imagem (≤4 MB) | imagem renderiza; >4 MB é rejeitada |
| Active speakers | borda/indicador muda ao falar |
| Sair/entrar | `ParticipantConnected/Disconnected` + som de join/leave |
| Reconexão (derrubar wifi 5 s) | volta como `Reconnecting`→`Connected` sem recriar sala |
| Kick (admin) | `removeParticipant` expulsa; webhook `participant_left` |
| Encerrar sala (admin) | `deleteRoom`; todos recebem `roomClosed` |
| Guardrail solo | após 5 min sozinho, `sendData` avisa e depois kicka |
| Enforce resolução tela | tela > limite → `track_published` com width/height → bloqueio |
| Webhooks | cada evento chega assinado e a idempotência (id) funciona |

Automação possível: **Playwright** com `--use-fake-device-for-media-stream` e
`--use-fake-ui-for-media-stream` para simular mic/câmera e rodar 2 contextos que entram na
mesma sala e verificam DOM/estado. Cobrir ao menos: conectar, publicar, ver o remoto, chat.

### Diagnóstico de mídia (quando "não tem áudio/vídeo")
- `chrome://webrtc-internals` (candidatos ICE, estado DTLS, bitrate).
- Conferir `announcedIp` (candidato deve ter o IP alcançável).
- Faixa UDP aberta no firewall.
- Testar TURN isolado: `turnutils_uclient -T -u <user> -w <cred> turn.<domínio>`.
- `transport.getStats()` na Control Tower para ver se pacotes chegam.

## Nível 4 — Carga

Sem `lk load-test` (era do LiveKit). Opções:
1. **Script headless** (`test/load/`): N clientes headless (Playwright/Chromium com fake
   media, ou `mediasoup-client` em Node com faixas sintéticas) entrando numa sala, publicando
   áudio (e opcionalmente vídeo), medindo CPU/RAM/banda da Control Tower via `/metrics`.
2. **Perfis crescentes**: 3 → 5 → 8 participantes, como o roadmap previa. Medir por ≥ 1 h cada:
   CPU por worker, RAM, banda de saída, perda, RTT, jitter, uso de TURN, estabilidade.
3. **Cenário de tela**: 1 publica tela 720p, 4 assistem — medir upload do publicador e download
   dos espectadores; confirmar simulcast/dynacast reduzindo camadas para quem está com o vídeo
   pequeno.

Critério de aprovação para o VPS KVM 2: 1–2 calls simultâneas com voz + 1 tela 720p estáveis,
CPU < 85% sustentado, sem perda audível, por ≥ 1 semana de uso real.

## Gate de cutover

Só migrar do LiveKit (doc 11) quando **toda a matriz do Nível 3 passar localmente** e o
**Nível 4 (3/5/8) passar no VPS**. Antes disso, a Control Tower roda em paralelo atrás de feature flag.

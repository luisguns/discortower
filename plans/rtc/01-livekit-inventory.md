# 01 — Inventário do LiveKit: o que precisamos igualar

Este é o **alvo de paridade**. Cada item abaixo foi levantado do código atual do splotys.
Se o nosso sistema entregar tudo daqui, o app funciona sem regressão. Use isto como
checklist de aceitação.

Legenda de prioridade: **P0** = MVP obrigatório (sem isso não há call); **P1** = necessário
para paridade completa; **P2** = pode vir logo depois do cutover.

---

## A. Frontend — API do `livekit-client` usada hoje

Arquivos: `src/services/livekit.ts`, `src/hooks/useLiveKitRoom.ts`, `useScreenShare.ts`,
`useRoomChat.ts`, `useRoomSnapshot.ts`, `useMicrophoneProcessing.ts`, `useMicrophoneMonitor.ts`,
`components/Call/CallScreen.tsx`, `components/AudioControls/RemoteAudioRenderer.tsx`,
`components/Participants/*`, `hooks/useDesktopGameOverlay.ts`.

### A.1 Ciclo de vida da sala (P0)
- `new Room({ adaptiveStream, dynacast, disconnectOnPageLeave, webAudioMix })`
- `room.connect(serverUrl, participantToken)` — retorna Promise; conecta signaling + WebRTC.
- `room.disconnect(true)` — encerra e limpa.
- `room.removeAllListeners()`
- `room.canPlaybackAudio` — booleano de política de autoplay.
- Enum `ConnectionState`: `Connecting`, `Connected`, `Reconnecting`, `SignalReconnecting`, `Disconnected`.

### A.2 Eventos da sala — `RoomEvent` (P0 salvo indicado)
Todos usados com `room.on(...)` / `room.off(...)`:
- `ConnectionStateChanged(state)`
- `Disconnected`
- `ParticipantConnected` / `ParticipantDisconnected`
- `TrackPublished` / `TrackUnpublished` (remoto)
- `TrackSubscribed` / `TrackUnsubscribed`
- `TrackSubscriptionStatusChanged`
- `TrackMuted` / `TrackUnmuted`
- `LocalTrackPublished` / `LocalTrackUnpublished`
- `ActiveSpeakersChanged` (P1)
- `ParticipantNameChanged` / `ParticipantMetadataChanged`
- `DataReceived(payload: Uint8Array, participant, kind, topic)` — usado para mensagens de sistema (`system.call-limit`).

### A.3 Participantes (P0)
- `room.localParticipant` (LocalParticipant) e `room.remoteParticipants` (Map<identity, RemoteParticipant>).
- `room.activeSpeakers: Participant[]` (P1).
- Em cada participante: `.identity`, `.name`, `.metadata` (string JSON com perfil), `.getTrackPublication(source)`.
- Local: `.isMicrophoneEnabled`, `.isCameraEnabled`, `.isScreenShareEnabled`.

### A.4 Publicação de mídia local (P0)
- `localParticipant.setMicrophoneEnabled(true, captureOptions)` onde captureOptions =
  `{ autoGainControl, echoCancellation, noiseSuppression }`.
- `localParticipant.setCameraEnabled(boolean)`.
- `localParticipant.setScreenShareEnabled(true, captureOptions, publishOptions)`:
  - captureOptions: `{ audio: { restrictOwnAudio }, video: { displaySurface }, resolution, contentHint, surfaceSwitching, systemAudio, selfBrowserSurface }`
  - publishOptions: `{ screenShareEncoding, audioPreset, dtx, forceStereo, simulcast }`
- `LocalAudioTrack.applyConstraints({ autoGainControl, echoCancellation, noiseSuppression })` — muda supressão de ruído sem republicar.

### A.5 Publicações e faixas (P0)
- `Track.Source`: `Microphone`, `Camera`, `ScreenShare`, `ScreenShareAudio`.
- Publication: `.isMuted`, `.isDesired` (assinatura desejada), `.videoTrack`, `.track`, `.trackSid`.
- Tipos de faixa: `LocalVideoTrack`, `RemoteVideoTrack`, `LocalAudioTrack`, `RemoteAudioTrack`.
- `RemoteAudioTrack`: `.attach(htmlAudioElement)`, `.detach(el)`, `.setVolume(0..1)`, `.setSinkId(deviceId)`.
- Faixas de vídeo são anexadas a `<video>` via `.attach()` nos componentes de galeria (confirmar em `ParticipantGallery`/`ScreenShareStage`).

### A.6 Presets de qualidade (P0)
- `VideoPreset(width, height, bitrate, fps)` com `.resolution` e `.encoding`.
- `AudioPresets.musicHighQualityStereo`.
- Presets do app (`streamQualityPresets`): 720p30 (2.5 Mbps), 1080p30 (4.5 Mbps), 1080p60 (7 Mbps).

### A.7 Otimizações (P1)
- **simulcast**: `simulcast: true` no screen share; múltiplas camadas por faixa.
- **dynacast**: servidor para de enviar camadas sem assinantes.
- **adaptiveStream**: cliente pede camada menor quando o vídeo está pequeno/oculto.
- Ativação de `dtx: false` e `forceStereo: true` para áudio de tela.

### A.8 Dados / chat (P1, mas alto valor)
Sistema de **streams** do LiveKit (não é `publishData` cru):
- `localParticipant.sendText(text, { topic })` → retorna `{ id, timestamp }`.
- `localParticipant.sendFile(file, { topic })`.
- `room.registerTextStreamHandler(topic, (reader, participantInfo) => ...)` / `unregisterTextStreamHandler(topic)`.
- `room.registerByteStreamHandler(topic, (reader, participantInfo) => ...)` / `unregisterByteStreamHandler(topic)`.
- `reader.readAll({ signal })`, `reader.info` = `{ id, timestamp, mimeType, size, name }`.
- Tópicos usados: `ford-kall.chat.text.v1`, `ford-kall.chat.image.v1`.
- Limite: imagem até 4 MB; tipos `image/gif|jpeg|png|webp`.
- Também `DataReceived` cru para mensagens de sistema vindas do **servidor** (tópico `system.call-limit`).

### A.9 Desktop / overlay (P2)
- `useDesktopGameOverlay(room, enabled)` — provavelmente lê participantes/faixas; conferir
  no arquivo antes de implementar. Não deve exigir API nova além do já listado.

---

## B. Servidor — API do `livekit-server-sdk` usada hoje

Seam único: `supabase/functions/_shared/livekit.ts`. Consumidores:
`issue-livekit-token`, `livekit-webhook`, `admin-room-action`, `admin-set-user-status`,
`channel-action`, `enforce-call-limits`, `admin-usage-summary`.

### B.1 `AccessToken` (P0)
- `new AccessToken(apiKey, apiSecret, { identity, name, metadata, ttl })`.
- `.addGrant({ canPublish, canPublishData, canSubscribe, canPublishSources, room, roomJoin })`.
- `.toJwt(): Promise<string>`.
- `TrackSource` enum: `MICROPHONE`, `CAMERA`, `SCREEN_SHARE`, `SCREEN_SHARE_AUDIO`.
- TTL usado: `'5m'`.

### B.2 `RoomServiceClient` (P0/P1)
- `new RoomServiceClient(httpUrl, apiKey, apiSecret)`.
- `.deleteRoom(roomName)` — encerra a sala (P0).
- `.removeParticipant(roomName, identity)` — expulsa (P0).
- `.updateParticipant(roomName, identity, { permission: { canPublishSources } })` — muda
  permissões em tempo real, usado para bloquear screen share por resolução (P1).
- `.listParticipants(roomName)` → array com pelo menos `{ identity, state }` (state 3 = desconectado) (P1).
- `.sendData(roomName, payload: Uint8Array, kind: 'reliable', destinationSids: string[], topic)` —
  mensagem de sistema para toda a sala (P1).

### B.3 `WebhookReceiver` (P0)
- `new WebhookReceiver(apiKey, apiSecret)`.
- `.receive(rawBody, authorizationHeader)` → objeto de evento; lança se assinatura inválida.
- Formato de evento consumido pelo webhook:
  ```ts
  {
    id: string,
    event: string,            // ver B.4
    createdAt: number|string, // epoch s ou ms
    room?: { sid?: string, name?: string },
    participant?: { identity?: string, name?: string, joinedAt?: number|string },
    track?: { sid?: string, source?: string|number, width?: number, height?: number }
  }
  ```

### B.4 Eventos de webhook que precisamos emitir (P0)
- `room_started` — quando a sala começa (primeiro participante). Deve trazer `room.sid` e `room.name`.
- `room_finished` — quando a sala termina.
- `participant_joined` — traz `participant.identity`, `participant.name`, `participant.joinedAt`.
- `participant_left`.
- `track_published` — traz `track.source` e, para vídeo, `track.width`/`track.height`
  (usado para impor limite de resolução de tela!).
- `track_unpublished`.

Cada evento tem `id` único (idempotência via tabela `webhook_events`) e é enviado ao endpoint
com um header `Authorization` assinado (JWT) que o `WebhookReceiver` valida.

---

## C. Comportamentos de sistema que dependem do provedor (P0/P1)

Estes já existem no app/edge/DB e assumem semântica do LiveKit. A Control Tower precisa sustentá-los:

1. **Nome de sala** derivado no token (`DT_<uuid sem hífen>`); o webhook casa por `room.name` ou `room.sid`.
2. **Identity** no formato `usr_<uuid>_<10 hex>`; o webhook extrai o user id por regex. Manter esse formato.
3. **Metadata do participante**: string JSON com `{ splotysProfile: {...} }`. Enviada no token, lida no cliente via `participant.metadata`.
4. **Reserva de sessão**: a Edge Function reserva no banco antes de emitir token; a Control Tower não precisa saber disso, só precisa aceitar o token e reportar webhooks fiéis.
5. **Enforce de resolução de tela**: no `track_published` de screen share, se `max(width,height) > limite`, a Edge chama `updateParticipant` para remover a permissão de tela. Requer que o `track_published` traga width/height reais.
6. **Guardrails de tempo** (solo/duração/cooldown): a cron `enforce-call-limits` chama
   `listParticipants`, `sendData`, `removeParticipant`, `deleteRoom`. Precisamos desses 4.
7. **Estado do participante** em `listParticipants`: o código filtra `state !== 3`. Precisamos
   reportar um `state` numérico com 3 = desconectado (equivalente a `ParticipantInfo_State.DISCONNECTED`).

---

## D. Matriz de paridade (resumo para aceitação)

| Capacidade | Prioridade | Onde implementar |
| --- | --- | --- |
| Conectar/desconectar sala | P0 | protocolo, server, client |
| Publicar mic/câmera/tela + áudio de tela | P0 | server, client |
| Assinar faixas remotas e renderizar áudio/vídeo | P0 | client |
| Mute/unmute e eventos correspondentes | P0 | protocolo, client |
| Metadata e nome de participante | P0 | token, protocolo |
| Emissão de token (AccessToken) | P0 | server-sdk |
| Webhooks assinados (6 eventos) | P0 | server, server-sdk |
| RoomService: delete/remove/list/update/sendData | P0/P1 | server (API REST), server-sdk |
| Active speakers | P1 | server (AudioLevelObserver), client |
| simulcast / dynacast / adaptiveStream | P1 | server, client |
| Data streams (sendText/sendFile/handlers) | P1 | protocolo, client, server |
| Supressão de ruído em runtime (applyConstraints) | P1 | client (é local getUserMedia) |
| Reconexão automática (ICE restart) | P1 | server, client |
| Enforce de resolução de tela | P1 | server (width/height no webhook) |
| Guardrails de tempo (cron) | P1 | server-sdk (RoomService) |
| Egress/RTMP/SIP/transcrição/E2EE | fora do MVP | — |

# 05 — SDK cliente (`@control-tower/client`)

Objetivo: expor **a mesma superfície** que o app usa hoje do `livekit-client`, para que
`useLiveKitRoom`, `useScreenShare`, `useRoomChat`, `useRoomSnapshot`, etc. mudem apenas o
import. Internamente usa `mediasoup-client` + o protocolo do doc 03.

> Regra de ouro: se um método/propriedade/evento está no doc 01 §A, ele **precisa** existir
> aqui com o mesmo nome e semântica observável. Divergência = regressão no app.

## Superfície pública (re-exports de `index.ts`)

```ts
export { Room } from './room'
export { RoomEvent } from './room-event'
export { ConnectionState } from './connection-state'
export { Track } from './track'                 // Track.Source
export { VideoPreset, AudioPresets } from './presets'
export { LocalAudioTrack, LocalVideoTrack, RemoteAudioTrack, RemoteVideoTrack } from './track'
export type { Participant, LocalParticipant, RemoteParticipant } from './participant'
```

## `RoomEvent` (nomes idênticos aos do livekit-client)

```ts
export enum RoomEvent {
  ConnectionStateChanged = 'connectionStateChanged',
  Disconnected = 'disconnected',
  ParticipantConnected = 'participantConnected',
  ParticipantDisconnected = 'participantDisconnected',
  TrackPublished = 'trackPublished',
  TrackUnpublished = 'trackUnpublished',
  TrackSubscribed = 'trackSubscribed',
  TrackUnsubscribed = 'trackUnsubscribed',
  TrackSubscriptionStatusChanged = 'trackSubscriptionStatusChanged',
  TrackMuted = 'trackMuted',
  TrackUnmuted = 'trackUnmuted',
  LocalTrackPublished = 'localTrackPublished',
  LocalTrackUnpublished = 'localTrackUnpublished',
  ActiveSpeakersChanged = 'activeSpeakersChanged',
  ParticipantNameChanged = 'participantNameChanged',
  ParticipantMetadataChanged = 'participantMetadataChanged',
  DataReceived = 'dataReceived',
}
```
`Room` estende um EventEmitter (mesma API `.on/.off/.emit/.removeAllListeners`). O app usa
strings do enum; mantenha os **valores** estáveis.

## `ConnectionState`

```ts
export enum ConnectionState {
  Disconnected='disconnected', Connecting='connecting', Connected='connected',
  Reconnecting='reconnecting', SignalReconnecting='signalReconnecting',
}
```
Emitir `ConnectionStateChanged` a cada transição. Mapeamento interno:
- abrindo WS + transports → `Connecting`
- pronto → `Connected`
- WS caiu, reabrindo → `SignalReconnecting`
- ICE restart em andamento → `Reconnecting`
- encerrado → `Disconnected` (+ evento `Disconnected`)

## `Track.Source`

```ts
export namespace Track {
  export enum Source {
    Microphone='microphone', Camera='camera',
    ScreenShare='screen_share', ScreenShareAudio='screen_share_audio',
  }
}
```
Os valores casam com `TrackSource` do protocolo (doc 03). O `source` viaja no `appData` do
`produce`.

## `Room` (fachada)

```ts
class Room extends EventEmitter {
  constructor(opts: { adaptiveStream?: boolean; dynacast?: boolean;
                      disconnectOnPageLeave?: boolean; webAudioMix?: boolean })

  state: ConnectionState
  localParticipant: LocalParticipant
  remoteParticipants: Map<string, RemoteParticipant>
  get activeSpeakers(): Participant[]
  get canPlaybackAudio(): boolean

  async connect(serverUrl: string, token: string): Promise<void>
  async disconnect(stopTracks?: boolean): Promise<void>

  // data streams
  registerTextStreamHandler(topic, handler): void
  unregisterTextStreamHandler(topic): void
  registerByteStreamHandler(topic, handler): void
  unregisterByteStreamHandler(topic): void
}
```

### `connect(serverUrl, token)`
1. `state=Connecting`; abrir WS `${serverUrl}/rtc/connect?access_token=${token}&protocol=1`.
   - `serverUrl` pode chegar como `wss://...` (VPS) ou `ws://...` (local). Aceitar ambos.
2. Receber `welcome`. Guardar `self`, `iceServers`, `rtpCapabilities`.
3. `device = new mediasoupClient.Device()`; `await device.load({ routerRtpCapabilities })`.
4. Criar transports: `createTransport{direction:'send'}` e `{'recv'}`; instanciar
   `device.createSendTransport(params)` / `createRecvTransport(params)`.
   - No evento `'connect'` do transport → enviar `connectTransport`.
   - No evento `'produce'` do send transport → enviar `produce`, resolver com `producerId`.
   - No `'producedata'` → enviar `produceData`.
5. Popular `remoteParticipants` a partir de `welcome.peers` e assinar producers existentes
   (ver política de assinatura abaixo).
6. `state=Connected`.

### Política de assinatura (subscribe)
- **Auto-subscribe** de tudo (áudio e vídeo), como o app espera hoje (ele lê publicações e
  renderiza). Ao criar cada consumer, emitir `TrackSubscribed`.
- `adaptiveStream`: para consumers de vídeo, observar o tamanho/visibilidade do elemento
  `<video>` anexado (ResizeObserver + IntersectionObserver) e chamar
  `setConsumerPreferredLayers` para pedir camada menor quando pequeno/oculto. Espelha o
  comportamento do livekit-client. Se a complexidade for alta no MVP, ligar depois (P1).

### `disconnect(stopTracks)`
Fechar producers/consumers, transports, WS. Parar tracks locais se `stopTracks`. `state=Disconnected`;
emitir `Disconnected`.

## `LocalParticipant`

```ts
class LocalParticipant extends Participant {
  get isMicrophoneEnabled(): boolean
  get isCameraEnabled(): boolean
  get isScreenShareEnabled(): boolean

  async setMicrophoneEnabled(enabled: boolean, captureOptions?): Promise<void>
  async setCameraEnabled(enabled: boolean, captureOptions?): Promise<void>
  async setScreenShareEnabled(enabled: boolean, captureOptions?, publishOptions?): Promise<void>

  getTrackPublication(source: Track.Source): TrackPublication | undefined

  // data streams
  async sendText(text: string, opts: { topic: string }): Promise<{ id: string; timestamp: number }>
  async sendFile(file: File, opts: { topic: string }): Promise<{ id: string }>
}
```

### `setMicrophoneEnabled(true, captureOptions)`
1. Se já publicado: apenas `resumeProducer` (unmute). Se `false`: `pauseProducer` (mute) —
   **não** despublica (mantém a faixa, como o LiveKit por padrão). Emitir `TrackMuted/Unmuted`.
2. Se não publicado: `getUserMedia({ audio: captureOptions })`, criar `LocalAudioTrack`,
   `sendTransport.produce({ track, appData:{ source: Microphone } })`, guardar publication,
   emitir `LocalTrackPublished`.
   - captureOptions = `{ autoGainControl, echoCancellation, noiseSuppression }`.

### `setScreenShareEnabled(true, capture, publish)`
1. `getDisplayMedia(captureOptionsToDisplayMedia(capture))` — traduzir as opções:
   - `video: { displaySurface, ... , resolution }`, `audio` conforme `capture.audio`.
   - No **Electron** (`window.splotysDesktop`): o app já injeta um seletor próprio via
     `getDisplayMedia`; o SDK **não** deve instalar o wrapper `preferIsolatedWindowAudio`
     nesse caso (o hook `useScreenShare` já cuida disso — o SDK só chama `getDisplayMedia`).
2. Publicar o track de vídeo com **simulcast** quando `publish.simulcast`:
   - `sendTransport.produce({ track, encodings: buildScreenEncodings(publish.screenShareEncoding), appData:{ source: ScreenShare, width, height } })`
   - `width/height` = dimensões reais do `MediaStreamTrack.getSettings()`.
3. Se houver faixa de áudio da tela: publicar como `source: ScreenShareAudio` com
   `opusStereo/opusDtx` conforme `publish.audioPreset`/`dtx`/`forceStereo`.
4. `isScreenShareEnabled=true`; emitir `LocalTrackPublished` (uma vez por faixa).
5. `setScreenShareEnabled(false)`: fechar producers de tela (`closeProducer`), parar tracks,
   emitir `LocalTrackUnpublished`.

`buildScreenEncodings`: mapear `VideoPreset.encoding` (bitrate/fps) para o array de encodings
do mediasoup com camadas simulcast (ex.: 3 camadas escalando por `scaleResolutionDownBy` 4/2/1).

### Supressão de ruído em runtime
`useMicrophoneProcessing` chama `publication.track.applyConstraints(...)`. O `LocalAudioTrack`
do SDK deve expor `applyConstraints(constraints)` que chama no `MediaStreamTrack` subjacente.
É puramente local (não renegocia com o servidor).

## `RemoteParticipant` / `Participant`

```ts
class Participant {
  identity: string; name: string; metadata: string
  getTrackPublication(source: Track.Source): TrackPublication | undefined
}
```
`getTrackPublication` procura na lista de publications do participante pelo `source`.

## `TrackPublication`

```ts
class TrackPublication {
  source: Track.Source
  trackSid: string                 // usar o producerId como sid
  kind: 'audio'|'video'
  get isMuted(): boolean           // reflete producerPaused
  get isDesired(): boolean         // se o consumer local está ativo
  get track(): LocalTrack|RemoteTrack|undefined
  get videoTrack(): LocalVideoTrack|RemoteVideoTrack|undefined
}
```
Ao receber `newProducer` de um remoto: criar/atualizar a publication e emitir `TrackPublished`.
Ao consumir: setar `track`, emitir `TrackSubscribed`. `producerPaused/Resumed` → `TrackMuted/Unmuted`
e atualizar `isMuted`.

## Tracks de mídia

- `RemoteAudioTrack`: `attach(el: HTMLMediaElement)` → `el.srcObject = new MediaStream([mst])`;
  `detach(el)`; `setVolume(v)` → `el.volume=v` (guardar refs dos elementos anexados);
  `setSinkId(id)` → `el.setSinkId(id)`.
- `RemoteVideoTrack` / `LocalVideoTrack`: `attach(videoEl)`/`detach`. Os componentes de galeria
  anexam a `<video>`.
- `LocalAudioTrack`: encapsula o `MediaStreamTrack` do mic; `applyConstraints`.
- Todos expõem `.mediaStreamTrack` para casos avançados.

## Data streams (chat) — protocolo por cima do DataChannel

O app usa a API de **streams** do LiveKit (`sendText`, `sendFile`, `registerTextStreamHandler`,
`registerByteStreamHandler`, `reader.readAll`, `reader.info`). Reimplementar assim:

- Cada mensagem é enviada por um DataProducer com `appData.topic`. Framing por chunks:
  ```ts
  // Cabeçalho (primeiro frame): JSON
  { streamId, kind:'text'|'byte', topic, id, timestamp, totalChunks,
    mimeType?, size?, name? }
  // Frames seguintes: binário (chunk N) precedido de 4 bytes (streamId curto + índice)
  // Frame final: marcador de fim
  ```
  Simplificação aceitável no MVP: para **texto** (mensagens ≤ 16 KB), enviar 1 frame JSON
  `{ id, timestamp, topic, text }` e entregar direto. Para **imagem** (até 4 MB), chunk de
  16 KB com cabeçalho + índice + fim.
- `registerTextStreamHandler(topic, handler)`: ao chegar um stream do tópico, montar um
  `reader` com `.info` (`{ id, timestamp, mimeType, size, name }`) e `.readAll({signal})`
  que resolve com a string (texto) ou `Uint8Array[]` (bytes), respeitando `AbortSignal`.
- `sendText` retorna `{ id, timestamp }`; `sendFile` retorna `{ id }` (o app já trata assim).
- Confiabilidade: usar DataChannel **ordered + reliable** (SCTP) para casar com a semântica.

> Referência de comportamento exato: `src/hooks/useRoomChat.ts` (tópicos, limites, tipos de
> imagem, timeouts). O SDK só precisa entregar `reader.info` e `readAll` compatíveis.

## `DataReceived` (mensagens de sistema do servidor)

Ao receber `systemData{topic,payload,kind}` do servidor, emitir:
```ts
room.emit(RoomEvent.DataReceived, base64ToUint8Array(payload), /*participant*/ undefined, kind, topic)
```
Casa com o handler em `CallScreen.tsx` (`topic === 'system.call-limit'`).

## Diferenças conhecidas x livekit-client (documentar para o app)

- `trackSid` = `producerId` (formato diferente, mas opaco para o app).
- `reader.info.id` = id gerado pelo SDK (usado como key das mensagens; ok).
- Sem `publishData` cru público — o app só usa `DataReceived` (leitura) e streams; cobrimos ambos.
- `activeSpeakers` atualiza a cada ~400 ms (interval do observer).

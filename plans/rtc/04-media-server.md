# 04 — Servidor de mídia (a Control Tower)

Pacote `@control-tower/server`. Node ≥ 20 + mediasoup ≥ 3. Um processo, N workers.

## Bootstrap (`index.ts`)

1. Ler config (`config.ts`) de env vars.
2. Criar o pool de workers (`workers.ts`): `numWorkers = env.RTC_NUM_WORKERS || os.cpus().length`.
3. Subir servidor HTTP (Node `http`) com:
   - `GET /healthz` → `{ ok, workers, rooms, peers }`.
   - `GET /metrics` → Prometheus (ver doc 09).
   - Control API REST em `/rtc/rooms/*` (`control-api.ts`, ver doc 06).
4. Anexar servidor WebSocket (`ws`) em `/rtc/connect` (`signaling.ts`).
5. Registrar shutdown gracioso: em SIGTERM, notificar `roomClosed{reason:'server_shutdown'}`,
   fechar routers, fechar workers.

## Pool de workers (`workers.ts`)

```ts
import * as mediasoup from 'mediasoup'

export async function createWorkers(cfg: Config): Promise<mediasoup.types.Worker[]> {
  const workers = []
  for (let i = 0; i < cfg.numWorkers; i++) {
    const worker = await mediasoup.createWorker({
      logLevel: cfg.workerLogLevel,           // 'warn' em prod
      rtcMinPort: cfg.rtcMinPort,             // ex.: 40000
      rtcMaxPort: cfg.rtcMaxPort,             // ex.: 40999
      dtlsCertificateFile: cfg.dtlsCert,      // opcional
      dtlsPrivateKeyFile: cfg.dtlsKey,        // opcional
    })
    worker.on('died', () => { /* logar fatal e process.exit(1) — supervisor reinicia */ })
    workers.push(worker)
  }
  return workers
}
```

- **Escolha de worker por sala**: round-robin ou "menos carregado" (menos routers). Guardar
  um contador. Uma sala vive inteira em um worker (todos os participantes daquela sala no
  mesmo router) — simplifica no MVP. Escala cross-worker/cross-host é `pipeToRouter` (doc 08, futuro).

## Router / codecs (`room.ts`)

Cada sala cria um `Router` com os codecs suportados. Fixar a lista:

```ts
export const mediaCodecs: mediasoup.types.RtpCodecCapability[] = [
  { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2,
    parameters: { useinbandfec: 1, usedtx: 0, stereo: 1, 'sprop-stereo': 1 } },
  { kind: 'video', mimeType: 'video/VP8', clockRate: 90000,
    parameters: { 'x-google-start-bitrate': 1000 } },
  { kind: 'video', mimeType: 'video/H264', clockRate: 90000,
    parameters: { 'packetization-mode': 1, 'profile-level-id': '42e01f',
                  'level-asymmetry-allowed': 1, 'x-google-start-bitrate': 1000 } },
]
```
- Opus estéreo sem DTX para casar com o áudio de tela de alta qualidade do app.
- VP8 + H264 cobrem Chrome/Firefox/Safari/Electron. (VP9/AV1 podem entrar depois; VP8 é o
  mínimo seguro para simulcast amplo.)

## Classe `Room`

Responsabilidades:
- Dona de um `Router`.
- Mantém `peers: Map<peerId, Peer>`.
- Cria `WebRtcTransport` para cada peer (send/recv).
- Cria Producers/Consumers/DataProducers/DataConsumers.
- Mantém um `AudioLevelObserver` (active speakers).
- Emite webhooks (`room_started` no primeiro peer, `room_finished` quando esvazia).

```ts
class Room {
  id: string; name: string; sid: string
  router: mediasoup.types.Router
  peers = new Map<string, Peer>()
  audioObserver: mediasoup.types.AudioLevelObserver

  static async create(worker, name, sid, cfg): Promise<Room>
  async createWebRtcTransport(peer, direction): Promise<TransportParams>
  async connectTransport(peer, transportId, dtlsParameters): Promise<void>
  async produce(peer, {transportId, kind, rtpParameters, appData}): Promise<{producerId}>
  async consume(peer, {transportId, producerId, rtpCapabilities}): Promise<ConsumeResult>
  async closeProducer(peer, producerId): Promise<void>
  addPeer(peer); removePeer(peerId)
  broadcast(exceptPeerId, notify)  // envia notify a todos menos um
  snapshotFor(peer): PeerSnapshot[]  // para o welcome
}
```

### `WebRtcTransport` (config)
```ts
router.createWebRtcTransport({
  listenIps: [{ ip: '0.0.0.0', announcedIp: cfg.announcedIp }],  // announcedIp = IP público no VPS; 127.0.0.1 no local
  enableUdp: true,
  enableTcp: true,           // fallback TCP direto (porta 7881 no doc de portas via listenInfos)
  preferUdp: true,
  enableSctp: true,          // necessário para DataChannels (chat/sistema)
  numSctpStreams: { OS: 1024, MIS: 1024 },
  initialAvailableOutgoingBitrate: 1_000_000,
})
```
Depois: `transport.setMaxIncomingBitrate(...)` opcional para limitar publicação.

### Producer
```ts
const producer = await sendTransport.produce({ kind, rtpParameters, appData })
// appData: { source, muted, width, height }
producer.on('transportclose', () => { /* limpar */ })
// Se veio pausado (muted): await producer.pause()
```
Ao criar: guardar em `peer.producers`. Se for áudio de microfone, adicionar ao
`audioObserver.addProducer({ producerId })`. Emitir `newProducer` via `broadcast`. Disparar
webhook `track_published` (com width/height do appData para vídeo).

### Consumer
```ts
if (!router.canConsume({ producerId, rtpCapabilities })) throw CANNOT_CONSUME
const consumer = await recvTransport.consume({
  producerId, rtpCapabilities, paused: true,   // sempre pausado no início
})
consumer.on('producerclose', () => { /* notify consumerClosed */ })
consumer.on('producerpause', () => { /* notify producerPaused já cobre */ })
```
Guardar em `peer.consumers`. Retornar params ao cliente; cliente resume via `resumeConsumer`.

### dynacast (economia de upload do publicador)
mediasoup já suporta: um Producer com simulcast só envia as camadas que têm ao menos um
Consumer ativo. Além disso, implementar: se um Producer fica **sem nenhum Consumer**, chamar
`producer.pause()` no lado do publicador? Não — o mediasoup faz isso internamente para camadas
simulcast. Para MVP, confie no comportamento nativo. Documentar que "dynacast" = simulcast +
`canConsume`/preferred layers do mediasoup.

## `Peer` (`peer.ts`)

Estado por conexão WS:
```ts
class Peer {
  id: string           // = welcome.self.id (gerado)
  identity: string     // do token (usr_...)
  name: string; metadata: string; grant: Grant
  ws: WebSocket
  sendTransport?: WebRtcTransport
  recvTransport?: WebRtcTransport
  producers = new Map<string, Producer>()
  consumers = new Map<string, Consumer>()
  dataProducers = new Map<string, DataProducer>()
  dataConsumers = new Map<string, DataConsumer>()
  send(msg): void          // serializa e envia pelo ws
  request(method, data): Promise<any>  // req servidor→cliente (raro)
}
```

## Signaling (`signaling.ts` + `handlers/`)

- No `connection`: extrair `access_token`, validar (`auth.ts`), resolver `roomName` (claim
  `video.room`), obter/criar a `Room` no room-manager, criar `Peer`, enviar `welcome`.
- Roteador de mensagens: `req.method` → `handlers[method](peer, room, data)`. Cada handler é
  um arquivo pequeno em `handlers/` (ex.: `produce.ts`, `consume.ts`). Handler retorna `data`
  de sucesso ou lança um erro tipado (`ProtocolError(code)`), que o roteador converte em `ResErr`.
- Rate limit por peer (ex.: 50 req/10 s) → `RATE_LIMITED`.
- No `close` do WS: iniciar grace period; se não reconectar, `room.removePeer` + webhook
  `participant_left`; se a sala esvaziar, `room_finished` + destruir router.

## Active speakers (`audio-observer.ts`)

```ts
audioObserver = await router.createAudioLevelObserver({ maxEntries: 5, threshold: -60, interval: 400 })
audioObserver.on('volumes', (volumes) => {
  const speakers = volumes.map(v => ({ peerId: producerToPeer.get(v.producer.id), level: normalize(v.volume) }))
  room.broadcast(null, { t:'notify', method:'activeSpeakers', data:{ speakers } })
})
audioObserver.on('silence', () => room.broadcast(null, { method:'activeSpeakers', data:{ speakers: [] } }))
```
Adicionar cada Producer de **microfone** ao observer no `produce`; remover no close.

## Dados / chat (`data.ts`)

- DataChannels via SCTP: `transport.produceData(...)` e `transport.consumeData(...)`.
- Quando um peer faz `produceData` (tópico de chat), o servidor cria DataConsumers para os
  demais peers (encaminhamento SFU de dados) e notifica `newDataProducer`.
- **sendData do servidor** (RoomService, mensagens de sistema): usar um `DirectTransport`
  do router para o servidor injetar dados:
  ```ts
  const direct = await router.createDirectTransport()
  const dp = await direct.produceData({ label:'system', appData:{ topic } })
  // ao chamar sendData: dp.send(payload) ; os DataConsumers dos peers recebem
  ```
  O SDK cliente entrega isso como `DataReceived(payload, undefined, kind, topic)`.

## Webhooks de saída (`webhooks.ts`)

Disparar (assinados, ver doc 06/07) nos momentos:
| Momento | Evento |
| --- | --- |
| Primeiro peer entra e router inicia | `room_started` |
| Peer entra | `participant_joined` |
| Producer criado | `track_published` (com width/height p/ vídeo) |
| Producer fechado | `track_unpublished` |
| Peer sai (após grace) | `participant_left` |
| Sala esvazia / deletada / expira | `room_finished` |

- Enfileirar e enviar com retry (backoff) e `id` único por evento (idempotência no consumidor).
- `createdAt`: epoch ms. `room.sid`: gerar um id estável por sala (ex.: `RM_<random>`).
- Timeout de 5 s por POST; até 5 tentativas; se falhar, logar e seguir (o `enforce-call-limits`
  reconcilia o estado depois).

## Limites e proteção (MVP)

- Máx. de salas por processo e de peers por sala (config), retornando `ROOM_FULL` no connect.
- `setMaxIncomingBitrate` por transport para conter publicação abusiva.
- Validar `rtpParameters`/`appData` (nunca confiar no cliente): `source` ∈ enum, `width/height`
  numéricos e plausíveis.
- Timeout de sala "starting" sem `room_started` (o `enforce-call-limits` já cobre pelo DB).

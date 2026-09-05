# 06 — SDK servidor (`@control-tower/server-sdk`)

Usado **dentro das Supabase Edge Functions (Deno)**. Precisa ser um **drop-in** do
`livekit-server-sdk` no seam `supabase/functions/_shared/livekit.ts`. Sem mediasoup, sem
Node-only: só JWT (Web Crypto) e HTTP (`fetch`).

O seam atual importa: `AccessToken`, `RoomServiceClient`, `TrackSource`, `WebhookReceiver`.
Manter esses nomes e assinaturas.

## `TrackSource`

```ts
export enum TrackSource {
  MICROPHONE='microphone', CAMERA='camera',
  SCREEN_SHARE='screen_share', SCREEN_SHARE_AUDIO='screen_share_audio',
}
```
Valores casam com o protocolo (doc 03). O seam usa os membros `MICROPHONE`, `CAMERA`,
`SCREEN_SHARE`, `SCREEN_SHARE_AUDIO` — mantê-los.

## JWT (`jwt.ts`)

HS256 com Web Crypto (disponível no Deno):

```ts
export async function signJwt(payload: object, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const enc = (o: object) => base64url(JSON.stringify(o))
  const data = `${enc(header)}.${enc(payload)}`
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return `${data}.${base64urlBytes(new Uint8Array(sig))}`
}
export async function verifyJwt(token: string, secret: string): Promise<any> {
  // recomputar assinatura, comparar em tempo constante, checar exp/nbf
}
```

## `AccessToken` (`access-token.ts`)

Reproduz a API usada em `issueParticipantToken`:

```ts
interface AccessTokenOptions { identity: string; name?: string; metadata?: string; ttl?: string|number }
interface VideoGrant {
  room?: string; roomJoin?: boolean;
  canPublish?: boolean; canSubscribe?: boolean; canPublishData?: boolean;
  canPublishSources?: TrackSource[];
}

export class AccessToken {
  constructor(apiKey: string, apiSecret: string, opts: AccessTokenOptions)
  addGrant(grant: VideoGrant): void
  async toJwt(): Promise<string>
}
```

Estrutura do JWT emitido (claims):
```jsonc
{
  "iss": "<apiKey>",          // identifica a chave (o servidor escolhe o secret certo)
  "sub": "<identity>",        // usr_<uuid>_<hex>
  "name": "<display name>",
  "metadata": "<json string>",
  "video": {                  // grant (nome "video" por compat de mentalidade LiveKit)
    "room": "DT_ABC...",
    "roomJoin": true,
    "canPublish": true,
    "canSubscribe": true,
    "canPublishData": true,
    "canPublishSources": ["microphone","camera","screen_share","screen_share_audio"]
  },
  "iat": 1710000000,
  "exp": 1710000300           // iat + ttl (ttl '5m' → 300s)
}
```
- Parsear `ttl` string (`'5m'`, `'1h'`, número em s). Se ausente, default 6 h (como LiveKit).
- `toJwt()` = `signJwt(claims, apiSecret)`.
- A **Control Tower** valida esse JWT no `/rtc/connect` (mesmo secret) e extrai `sub`→identity,
  `name`, `metadata`, `video`→grant, `video.room`→sala.

> Compatibilidade: os campos que o app precisa (`identity`, `name`, `metadata`, grant com
> `canPublishSources`) estão todos aqui. `issue-livekit-token/index.ts` não muda além do import.

## `RoomServiceClient` (`room-service.ts`)

Cliente HTTP da Control API da Control Tower. Autentica cada chamada com um **JWT de admin**
(mesmo apiKey/secret, grant `{ roomAdmin: true }`), enviado em `Authorization: Bearer <jwt>`.

```ts
export class RoomServiceClient {
  constructor(url: string, apiKey: string, apiSecret: string)  // url = http(s) da Control Tower

  async deleteRoom(room: string): Promise<void>
  async removeParticipant(room: string, identity: string): Promise<void>
  async updateParticipant(room: string, identity: string,
     opts: { permission?: { canPublishSources?: TrackSource[] } }): Promise<void>
  async listParticipants(room: string): Promise<ParticipantInfo[]>
  async sendData(room: string, payload: Uint8Array, kind: 'reliable'|'lossy',
     destinationSids: string[], topic: string): Promise<void>
}

interface ParticipantInfo { identity: string; name: string; state: number /* 3 = DISCONNECTED */ }
```

Mapa método → endpoint (ver Control API abaixo). `httpUrl()` no seam converte `wss:`→`https:`
e `ws:`→`http:`; a Control Tower expõe a Control API no mesmo host, path `/rtc/rooms/*`.

**`listParticipants` deve retornar `state` numérico** com `3` = desconectado, porque
`enforce-call-limits` filtra `Number(item.state ?? 2) !== 3`. Mapear:
`0=JOINING,1=JOINED,2=ACTIVE,3=DISCONNECTED` (mesma tabela do LiveKit).

## `WebhookReceiver` (`webhook-receiver.ts`)

Valida o webhook que a Control Tower envia às Edge Functions.

```ts
export class WebhookReceiver {
  constructor(apiKey: string, apiSecret: string)
  async receive(body: string, authHeader: string): Promise<WebhookEvent>  // lança se inválido
}
```
- A Control Tower assina: cria um JWT cujo claim inclui o **hash SHA-256 do corpo** (`{ sha256: <b64>,
  iss: apiKey, exp }`) e envia em `Authorization`. `receive` recomputa o SHA-256 do `body`,
  verifica o JWT (secret) e compara os hashes; se baterem, faz `JSON.parse(body)` e retorna.
- Estrutura de `WebhookEvent` = exatamente a que `livekit-webhook/index.ts` consome (doc 01 §B.3).

## Control API da Control Tower (referência do lado servidor — ver também doc 04)

Todos exigem `Authorization: Bearer <adminJwt>`; a Control Tower valida grant `roomAdmin`.

| Método | Rota | Corpo | Resposta |
| --- | --- | --- | --- |
| deleteRoom | `POST /rtc/rooms/:room/delete` | — | `{ ok:true }` |
| removeParticipant | `POST /rtc/rooms/:room/participants/:identity/remove` | — | `{ ok:true }` |
| updateParticipant | `POST /rtc/rooms/:room/participants/:identity/update` | `{ permission:{canPublishSources} }` | `{ ok:true }` |
| listParticipants | `GET /rtc/rooms/:room/participants` | — | `{ participants: ParticipantInfo[] }` |
| sendData | `POST /rtc/rooms/:room/data` | `{ payload:b64, kind, topic, destinationIdentities?:[] }` | `{ ok:true }` |

- `:room` é o `room_name` (`DT_...`). `:identity` é o `usr_...`.
- `updateParticipant` altera o grant do peer conectado e, se removeu `screen_share`, a Control Tower
  fecha os producers de tela desse peer (efeito imediato de bloqueio de resolução).
- `sendData` injeta via DirectTransport (doc 04 §data) para todos (ou `destinationIdentities`).
- Se a sala/participante não existe: `404` com `{ error: 'ROOM_NOT_FOUND'|'PARTICIPANT_NOT_FOUND' }`.
  (O código atual já trata falhas com `try/catch` e reconciliação, então 404 é seguro.)

## Mudança no seam (o único arquivo do app que muda no servidor)

`supabase/functions/_shared/livekit.ts` passa a importar de `@control-tower/server-sdk`:
```ts
// antes:  import { AccessToken, RoomServiceClient, TrackSource } from 'npm:livekit-server-sdk@2.15.0'
// depois: import { AccessToken, RoomServiceClient, TrackSource } from 'npm:@control-tower/server-sdk@<v>'
//         (WebhookReceiver idem em livekit-webhook/index.ts)
```
Nenhuma outra mudança de lógica nas Edge Functions — as assinaturas são idênticas. Ver doc 11
para a estratégia de nomes de env (`LIVEKIT_*` vs `RTC_*`).

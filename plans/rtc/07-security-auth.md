# 07 — Segurança e autenticação

## Modelo de confiança

- **API key/secret** compartilhados entre a Control Tower e as Edge Functions (secrets do Supabase).
  Nunca chegam ao browser.
- **Participant token (JWT)**: emitido pela Edge (`issue-livekit-token`) com o secret; o
  browser recebe e apresenta à Control Tower. Curto (5 min) — só para conectar.
- **Admin token (JWT)**: gerado on-the-fly pelo `RoomServiceClient` para chamar a Control API.
  Grant `roomAdmin`, TTL curto (ex.: 60 s).
- **Webhook token (JWT)**: gerado pela Control Tower para provar autenticidade do webhook às Edge.

Todos HS256 com o mesmo `apiSecret` (simétrico — os dois lados confiam no segredo).

## Claims

### Participant
```jsonc
{ "iss":"<apiKey>", "sub":"usr_<uuid>_<hex>", "name":"...", "metadata":"{...}",
  "video": { "room":"DT_...", "roomJoin":true, "canPublish":true, "canSubscribe":true,
             "canPublishData":true, "canPublishSources":[...] },
  "iat":..., "exp":... }
```
Validação na Control Tower (`auth.ts`):
1. Verificar assinatura (secret pelo `iss`→ mapa de chaves, no MVP uma só chave).
2. `exp` não expirado, `nbf`/`iat` sãos.
3. `video.roomJoin === true` e `video.room` presente → nome da sala.
4. Derivar grant. Rejeitar connect (`4401`) se qualquer checagem falhar.

### Admin
```jsonc
{ "iss":"<apiKey>", "video": { "roomAdmin": true }, "iat":..., "exp":... }
```
Control API exige `video.roomAdmin === true`.

### Webhook
```jsonc
{ "iss":"<apiKey>", "sha256":"<base64 do SHA-256 do corpo>", "iat":..., "exp":... }
```
`WebhookReceiver.receive` recomputa o hash do corpo cru e compara.

## Identity e metadata (contratos que não podem mudar)

- **Identity**: `usr_<uuid>_<10 hex>`. O `livekit-webhook` extrai o user id por regex
  `^usr_([0-9a-f-]{36})_[a-z0-9]+$`. A Control Tower deve ecoar a identity **exata** do token nos
  webhooks e no `listParticipants`.
- **Metadata**: string JSON `{ "splotysProfile": {...} }`. A Control Tower trata como opaca: guarda,
  ecoa no `welcome`/`peerJoined`/`peerUpdated`, nunca interpreta.
- **Room name**: `DT_<uuid sem hífen, upper>`. A Control Tower usa como chave da sala e no webhook
  (`room.name`). O `room.sid` é gerado pela Control Tower (`RM_<random>`), estável pela vida da sala.

## TLS

- **VPS**: Caddy termina TLS (Let's Encrypt automático) para `media.<domínio>` e
  `turn.<domínio>`. A Control Tower escuta em `127.0.0.1:7880` (HTTP/WS puro atrás do proxy).
- **mediasoup DTLS**: o próprio mediasoup gera certificado DTLS para as conexões WebRTC
  (SRTP). Não precisa do certificado do Caddy. Opcionalmente fixar cert DTLS via
  `dtlsCertificateFile` para estabilidade de fingerprint.
- **Local**: sem TLS (`ws://`, `http://`), `announcedIp=127.0.0.1`.

## TURN / STUN (coturn)

Necessário para participantes atrás de NAT simétrico / firewall que bloqueia UDP.

- **STUN**: `stun:turn.<domínio>:3478`.
- **TURN**: `turn:turn.<domínio>:3478?transport=udp`, `turn:...?transport=tcp`,
  `turns:turn.<domínio>:5349?transport=tcp` (TLS).
- **Credenciais efêmeras** (recomendado): usar o mecanismo TURN REST (long-term credential com
  usuário=timestamp, senha=HMAC(secret, usuário)). A Edge ou a Control Tower gera `{username, credential}`
  válidos por alguns minutos e a Control Tower os inclui em `iceServers` no `welcome`.
  - `username = <expiryUnix>:<identity>`; `credential = base64(HMAC-SHA1(turnSecret, username))`.
  - coturn config: `use-auth-secret`, `static-auth-secret=<turnSecret>`.
- Alternativa MVP: credencial estática única (mais simples, menos segura) — aceitável no
  começo, migrar para efêmera antes de expor publicamente.

`iceServers` no `welcome`:
```jsonc
[
  { "urls":["stun:turn.<domínio>:3478"] },
  { "urls":["turn:turn.<domínio>:3478?transport=udp","turn:turn.<domínio>:3478?transport=tcp",
             "turns:turn.<domínio>:5349?transport=tcp"],
    "username":"<efêmero>", "credential":"<efêmero>" }
]
```

## Rate limiting e abuso

- Connect: limitar tentativas por identity/IP (a Edge já limita a emissão de token a 30/min
  por usuário; a Control Tower adiciona um limite por IP no WS).
- Requests no WS: 50 req / 10 s por peer → `RATE_LIMITED`.
- `produce`: validar `source` no grant e limites de faixas por peer (ex.: 1 mic, 1 câmera,
  1 tela, 1 áudio-de-tela).
- `setMaxIncomingBitrate` por transport para conter publicação abusiva.
- Control API: só aceita admin JWT; nunca exposta ao browser (fica atrás do mesmo host, mas
  o grant `roomAdmin` nunca é emitido para clientes).

## Segredos e rotação

- Secrets no Supabase: `RTC_URL`/`RTC_API_KEY`/`RTC_API_SECRET` (ou manter nomes `LIVEKIT_*`
  no cutover — ver doc 11) + `RTC_TURN_SECRET`.
- Na Control Tower (env): `RTC_API_KEY`, `RTC_API_SECRET`, `RTC_WEBHOOK_URL`, `RTC_TURN_SECRET`,
  `RTC_ANNOUNCED_IP`, faixas de porta.
- Rotação: suportar **duas chaves** (mapa `iss`→secret) para trocar sem downtime: emitir com a
  nova, aceitar as duas por um período, depois remover a antiga.

## Superfície de ataque a vigiar

- Nunca confiar em `rtpParameters`/`appData` do cliente sem validar tipos/limites.
- `metadata` é ecoada a outros participantes → o app já sanitiza o perfil; a Control Tower não deve
  renderizar nem confiar nela.
- Webhook endpoint das Edge só aceita corpo com assinatura válida (`WebhookReceiver`).
- Control API: 404 em vez de vazar existência de salas para não-admin (mas ela nem é exposta
  publicamente).

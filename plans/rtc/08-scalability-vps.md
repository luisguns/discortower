# 08 — Escalabilidade, deploy local e VPS

Princípio: **rodar local primeiro, subir para o VPS só mudando config**. O código é o mesmo;
mudam `announcedIp`, TLS (Caddy) e firewall.

## Config por env (`config.ts`)

| Var | Local | VPS | Uso |
| --- | --- | --- | --- |
| `RTC_HTTP_PORT` | 7880 | 7880 (interno) | HTTP/WS da Control Tower |
| `RTC_ANNOUNCED_IP` | `127.0.0.1` | IPv4 público | IP que o mediasoup anuncia nos ICE candidates |
| `RTC_RTC_MIN_PORT` | 40000 | 40000 | faixa UDP mediasoup |
| `RTC_RTC_MAX_PORT` | 40100 | 40999 | faixa UDP mediasoup (decisão Q-12: 1000 portas no 1º deploy; ampliar até 49999 se a carga exigir) |
| `RTC_NUM_WORKERS` | 1–2 | = nº de vCPU (2) | workers mediasoup |
| `RTC_API_KEY` / `RTC_API_SECRET` | dev | secret real | auth |
| `RTC_WEBHOOK_URL` | `http://127.0.0.1:54321/functions/v1/livekit-webhook` | URL da Edge | destino dos webhooks |
| `RTC_TURN_SECRET` | (opcional) | secret coturn | credenciais TURN efêmeras |
| `RTC_MAX_ROOMS` / `RTC_MAX_PEERS_PER_ROOM` | alto | conforme carga | limites |

## Deploy local (`deploy/docker-compose.local.yml`)

```yaml
services:
  torre:
    build: ../packages/server
    network_mode: host          # simplifica UDP no Linux; no macOS/Windows ver nota abaixo
    environment:
      RTC_ANNOUNCED_IP: "127.0.0.1"
      RTC_RTC_MIN_PORT: "40000"
      RTC_RTC_MAX_PORT: "40100"
      RTC_NUM_WORKERS: "1"
      RTC_API_KEY: "devkey"
      RTC_API_SECRET: "devsecret"
      RTC_WEBHOOK_URL: "http://127.0.0.1:54321/functions/v1/livekit-webhook"
    # sem network_mode:host (macOS/Windows): mapear portas explicitamente
    # ports: ["7880:7880", "40000-40100:40000-40100/udp"]

  coturn:                        # opcional no local; útil para testar o caminho TURN
    image: coturn/coturn
    network_mode: host
    volumes: ["./coturn/turnserver.conf:/etc/coturn/turnserver.conf:ro"]
```

Notas:
- **Linux**: `network_mode: host` evita dor de cabeça com a faixa UDP.
- **macOS/Windows (Docker Desktop)**: `host` não funciona igual; mapear as portas UDP
  explicitamente e usar `RTC_ANNOUNCED_IP=127.0.0.1`. Faixa pequena (40000–40100) para não
  mapear 10k portas.
- Supabase local: `supabase start` + `supabase functions serve`. O webhook aponta para
  `127.0.0.1:54321`.
- App: `npm run dev`; `issue-livekit-token` retorna `serverUrl: ws://127.0.0.1:7880`.

### Passo a passo local (o agente executa nesta ordem)
1. `docker compose -f deploy/docker-compose.local.yml up torre`
2. `supabase start && supabase functions serve` (secrets locais `RTC_*`).
3. `npm run dev` no app; entrar numa call com dois navegadores.
4. Validar áudio/vídeo/tela/chat e webhooks (ver doc 10).

## Deploy VPS (`deploy/docker-compose.vps.yml` + `Caddyfile`)

Topologia (Hostinger KVM 2, Ubuntu LTS):

```
Caddy (443) ── proxy ──> Control Tower (127.0.0.1:7880)
Control Tower ── UDP 40000-40999 ──> Internet (announcedIp = IP público)
coturn (3478/5349) <──> clientes atrás de NAT
```

`Caddyfile`:
```
media.<domínio> {
  reverse_proxy 127.0.0.1:7880
}
```
Caddy faz upgrade de WebSocket automaticamente; `wss://media.<domínio>/rtc/connect` e
`https://media.<domínio>/rtc/rooms/*` chegam à Control Tower.

`docker-compose.vps.yml` (essência):
```yaml
services:
  torre:
    build: ../packages/server
    network_mode: host
    restart: unless-stopped
    environment:
      RTC_ANNOUNCED_IP: "<IPv4 público>"
      RTC_RTC_MIN_PORT: "40000"
      RTC_RTC_MAX_PORT: "40999"   # Q-12: 1000 portas no 1º deploy; ampliar até 49999 conforme carga
      RTC_NUM_WORKERS: "2"
      RTC_HTTP_PORT: "7880"
      RTC_API_KEY: "${RTC_API_KEY}"
      RTC_API_SECRET: "${RTC_API_SECRET}"
      RTC_WEBHOOK_URL: "https://<projeto>.supabase.co/functions/v1/livekit-webhook"
      RTC_TURN_SECRET: "${RTC_TURN_SECRET}"
  caddy:
    image: caddy:2
    network_mode: host
    volumes: ["./Caddyfile:/etc/caddy/Caddyfile:ro", "caddy_data:/data"]
    restart: unless-stopped
  coturn:
    image: coturn/coturn
    network_mode: host
    volumes: ["./coturn/turnserver.conf:/etc/coturn/turnserver.conf:ro"]
    restart: unless-stopped
volumes: { caddy_data: {} }
```

### Firewall (painel Hostinger + UFW)
| Porta | Proto | |
| --- | --- | --- |
| 80, 443 | TCP | Caddy (TLS + WSS + HTTPS) |
| 7881 | TCP | WebRTC/TCP direto (fallback) |
| 3478 | UDP+TCP | TURN/STUN |
| 5349 | TCP | TURN/TLS |
| 40000–40999 | UDP | Mídia WebRTC (1º deploy; ampliar até 49999 conforme carga — Q-12) |
- A porta 7880 **não** é aberta ao público (só localhost, atrás do Caddy).
- Reaproveitar o levantamento de portas do `roadmap/self-hosted-livekit.md` (é o mesmo tipo
  de exigência de rede).

### DNS
- `media.<domínio>` → A record para o IPv4 da VPS.
- `turn.<domínio>` → A record para o mesmo IPv4.

## Capacidade na VPS básica (2 vCPU / 8 GB)

- O gargalo é **CPU de SRTP + banda**, não RAM. Com 2 workers, cabem várias faixas de áudio e
  algumas de vídeo/tela simultâneas.
- Recomendação inicial (herdada do roadmap): **1–2 calls simultâneas**, padrão **720p30**,
  liberar 1080p só após teste de carga. Guardrails de call já existentes ajudam a conter.
- Estimativa de banda de saída (roadmap): tela 720p ~1.5 Mbps p/ 4 espectadores ≈ 2.7 GB/h;
  1080p ~3 Mbps ≈ 5.4 GB/h. Com 8 TB/mês, sobra para uso pessoal.
- Alerta de CPU: a Hostinger limita uso 100% por >180 min. Emitir alerta antes (doc 09).

## Escala futura (não-MVP, mas a arquitetura já permite)

1. **Mais workers**: `RTC_NUM_WORKERS` acompanha vCPUs; sala por worker (round-robin).
2. **pipeToRouter**: para uma sala grande que estoure um worker, `router.pipeToRouter` conecta
   routers de workers diferentes no mesmo host.
3. **Multi-host (cluster)**:
   - Registro de salas em **Redis** (qual host hospeda cada sala).
   - Um **coordenador/roteador de conexão** decide o host no momento de emitir o token
     (o `serverUrl` do token aponta para o host certo) — sticky por sala.
   - Cross-host media via `pipeToRouter` sobre PlainTransport entre hosts, se uma sala precisar
     morar em mais de um host (raro no nosso caso).
   - Webhooks continuam idempotentes (id único), então múltiplos hosts não corrompem o DB.
4. **TURN dedicado**: mover coturn para um host próprio quando a banda de relay crescer.

> No MVP: **um host, um processo, N workers, salas pequenas.** Tudo acima fica documentado
> como caminho de crescimento, sem ser implementado agora.

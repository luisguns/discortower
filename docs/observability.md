# Observabilidade do splotys

Projeto: https://luisgustavo.sentry.io/projects/splotys/

O SDK inicia antes do React. WEB usa Sentry React; DESKTOP usa Sentry Electron
no main e no renderer (mesma versão do SDK base). O servidor RTC envia logs
estruturados ao mesmo projeto. A DSN no repositório é pública e só permite ingestão.
Nenhum token administrativo Sentry é necessário para executar ou compilar.

## Localizar uma falha

1. Em Issues, filtre `origin:WEB` ou `origin:DESKTOP` e a release `splotys@0.8.3`.
2. Abra o erro e leia os breadcrumbs. Copie `call_id`, `session_id` e o horário.
3. Em Explore > Logs, use o mesmo `call_id` para juntar os participantes. Use
   `session_id` para um cliente e `process:rtc-server` para a sinalização.
4. Siga `screen.start.requested` → `rtc.localTrackPublished` →
   `rtc.trackSubscribed` → `video.attached` → `video.first_frame`.
   `video.detached`, `capture.ended`, `video.no_frames`, `signal_request_failed`
   e `signal_socket_closed` mostram onde o fluxo mudou.
5. `rtc.health` a cada 15 segundos traz estados dos transports, captura e
   contadores WebRTC de áudio/vídeo (bytes, perdas, jitter, frames e freezes).
   Compare amostras; `video.no_frames` também pode ocorrer numa tela estática.

Eventos de infraestrutura usam `origin:SERVER`. Clientes antigos usam
`origin:UNKNOWN` no servidor; os novos enviam WEB/DESKTOP na conexão. Esses
campos são dicas de diagnóstico não confiáveis, nunca autorização. O log
`signal_session_ready` relaciona call/sessão ao peer e à sala RTC efêmera.

## Cobertura

- Exceções e promessas rejeitadas, falhas de renderização/bootstrap.
- Respostas HTTP (inclusive erros retornados como resposta) de autenticação,
  canais, perfis, amigos, mensagens e demais APIs via cliente Supabase.
- Entrada/saída/reconexão, participantes, publicações, assinaturas, mute,
  câmera/microfone, troca de dispositivos e processamento de voz.
- Início/fim/timeout do compartilhamento, qualidade, assistir/parar,
  primeiro frame, ausência de frames, encerramento da captura e reprodução.
- Chat da call, alterações de preferências (somente chave), áudio bloqueado.
- Electron: início, F5, minimize/restore, travamentos, saída de processos,
  seletor de tela, updater, exceções main e renderer.
- SFU: sessão/socket, comandos e duração, limites, falhas, workers e webhooks.

## Privacidade e volume

Sem replays, screenshots, dumps nativos, conteúdo de mensagens, mídia,
corpos HTTP, headers de autorização, SDP, ICE addresses, nomes de dispositivos
ou dados de conta. O scrubber remove query strings, tokens JWT, e-mails e
contexto de código/variáveis. Uma identificação de IP neutra evita geolocalização
derivada no evento. IDs aleatórios de sessão/call são usados para correlação.

Erros: até 20/min por renderer (30/min main). Logs: até 180/min por processo
cliente e 300/min no servidor. Traces: amostra de 20%; breadcrumbs: últimos 80.
Limites locais protegem contra loops; o plano gratuito também aplica quotas
compartilhadas pela organização. Não foi ativado plano pago nem overage.

Source maps web são publicados junto aos assets, coerente com o repositório
público. O Sentry pode buscá-los em produção. Mapas de localhost/arquivos
Electron não são acessíveis remotamente: para esses, use a mesma release/mapa
local; upload privado de artefatos pode ser configurado futuramente.

## Verificar

`npm run test:observability`, `npm run test:call-join`, `npm run test:desktop`.
`npm run build` e `npm run preview -- --host 127.0.0.1 --port 5182`.
Abra `http://127.0.0.1:5182/?observability-test=1` para enviar um erro sintético WEB.
`npx electron scripts/observability-smoke.cjs` verifica main e renderer DESKTOP
em um perfil temporário, janela oculta e sem capturar dispositivos.
Os testes sintéticos têm nomes SPLOTYS_OBSERVABILITY_SMOKE e
SPLOTYS_DESKTOP_MAIN_SMOKE. Não são falhas do produto.

Em desenvolvimento o envio fica desativado por padrão. Para habilitar,
use `VITE_SENTRY_ENABLED=true`; `VITE_SENTRY_ENVIRONMENT` define o ambiente
e `VITE_SENTRY_DSN` substitui o destino. Falhas de telemetria não bloqueiam calls.

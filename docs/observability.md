# Observabilidade do splotys

## Entrada e reconexão — 0.8.6

- `call.entry.requested/completed/rejected/failed`: inclui canal, call e operação,
  inclusive rejeições de perfil e exceções anteriores à conexão RTC.
- `rtc.join.failed/slow`: inclui tentativa e etapa (`previous_disconnect`,
  `authorization`, `room_creation`, `signaling_and_media`). Eventos atrasados
  preservam a call/tentativa original, mesmo após entrar em outra call.
- `rtc.authorization.refresh_*`, `rtc.reconnectAttemptFailed`, `rtc.reconnectFailed`,
  `rtc.signalError`, `rtc.disconnected_unexpectedly`: falhas e encerramentos durante a call.
- `rtc.trackSubscriptionFailed`, `rtc.dataChannelFailed`, `call.avatar.*`,
  `microphone.monitor.*`, `channels.list.*` e `channels.invite.*`: falhas antes
  silenciosas agora registradas sem conteúdo de mensagens, avatares ou convites.
- O servidor registra `call_entry_rejected`, `peer_session_replaced` e
  `peer_signal_replaced`, correlacionados à origem WEB/DESKTOP e à sessão.

A mesma tentativa reutiliza sua identidade ao renovar o token. Uma nova entrada
substitui a conexão anterior da mesma conta na mesma call, inclusive em outro
dispositivo. A troca preserva a sala e os demais participantes. Os limites de
volume e a remoção de dados sensíveis descritos abaixo continuam ativos.

Projeto: https://luisgustavo.sentry.io/projects/splotys/

Consulta salva e favoritada: **splotys — diagnóstico WEB / DESKTOP / RTC**
(Explore > All Queries, ID `2428651`), com timestamp, mensagem, origem e processo.

O SDK inicia antes do React. WEB usa Sentry React; DESKTOP usa Sentry Electron
no main e no renderer (mesma versão do SDK base). O servidor RTC envia logs
estruturados ao mesmo projeto. A DSN no repositório é pública e só permite ingestão.
Nenhum token administrativo Sentry é necessário para executar ou compilar.

## Localizar uma falha

1. Em Issues, filtre `origin:WEB` ou `origin:DESKTOP` e a release `splotys@0.8.4`.
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

### Falhas sem crash (0.8.4)

| Ponto | Evidência registrada |
| --- | --- |
| Captura inconsistente | `screen.capture_mismatch`: compartilhamento ativo sem track viva por 5s |
| Duplicata | `rtc.duplicate_account_candidate`: múltiplas sessões da mesma conta por 5s; somente contagens, pode ser intencional |
| Assinatura sem mídia | `rtc.subscription_no_media`: track desejada e não mutada ausente/encerrada por 15s |
| Conexão | `rtc.connection_stuck` após 20s; `rtc.connection_flapping` com 6 transições em 60s |
| Reprodução | `video.no_first_frame` após 15s visível, inclusive autoplay pausado; waiting/stalled/playing/pause/emptied; câmera e tela |
| Transporte de vídeo | Campos numéricos em `rtc.health`: bytes enviados/recebidos, frames codificados/decodificados/descartados, freezes e perdas |
| Compartilhar de novo | seletor já pendente, cancelamento/permissão, timeout ao parar, conclusão/falha tardia e limpeza de captura obsoleta |
| Qualidade | `screen.quality_request_burst`: 20 ajustes em até 10s, para investigar efeitos React repetidos |
| APIs/operações | started/completed/failed, `operation_id`, duração e aviso slow após 10s sem modificar/cancelar a operação |
| Presença | sequência de falhas, idade do último sucesso, recuperação e heartbeat ausente |
| Realtime social/canais | estado anterior/atual, conexão lenta após 15s e recuperação; fechamento intencional separado |
| Autenticação/perfil | callback, acesso, login, recuperação, convite, perfil, credenciais e logout, sem argumentos privados |
| Mensagens/amigos/canais | ação de domínio, listagem/leitura/download/exclusão, limpeza de anexos, além do HTTP |
| Dispositivos/UI | enumeração/restauração, detecção de atividade, desbloqueio de áudio, clipboard, PiP, fullscreen e pop-up bloqueado |
| Responsividade | tarefas acima de 500ms no foreground, agregadas por 30s, sem DOM/URLs |

Detectores RTC verificam a cada 5s. Condições persistentes emitem uma vez por
incidente; `.recovered` indica normalização, `.ended` indica remoção da publicação
sem afirmar recuperação. Eventos preservam o contexto da call que iniciou o
observador/operação. Ausência de frames também pode ser tela estática; os logs
não afirmam automaticamente que houve falha de transmissão.

Erros HTTP 4xx e cancelamento de captura são avisos pesquisáveis; 5xx e falhas
inesperadas geram Issues. Operações de domínio usam códigos de erro genéricos
para não enviar mensagens privadas do backend. Diagnósticos não coletam nomes,
conteúdo de mensagens, nomes de canais ou processos/jogos detectados.

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
No renderer, são 120 logs rotineiros e 60 avisos/erros por minuto, para reservar
espaço durante uma tempestade de eventos. Esses limites podem omitir eventos;
o plano gratuito não garante retenção completa de todas as sessões.

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

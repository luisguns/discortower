# Reentrada e compartilhamento repetido — 0.8.2

## Duplicação confirmada e corrigida

Logs de produção de 13/09, horário de Brasília:

- 01:31:52: sessão desconectada, mantida pelo servidor por 45 segundos.
- 01:31:56: nova entrada do mesmo usuário com outra identidade de sessão.
- 01:32:37: sessão anterior finalmente removida.

A tolerância para recuperar quedas de rede era aplicada também ao clique em sair.
A nova versão envia o código WebSocket 4000 (`CLIENT_LEAVE`). O servidor remove
essa sessão imediatamente; outros encerramentos mantêm a reconexão. A mídia
local para antes da espera pelo handshake, limitada a dois segundos.

O teste real, antes da correção, encontrava um participante remoto após sair e
entrar sozinho. Depois da correção, encontrou zero. O teste de servidor também
confirma que queda de rede continua retomando a mesma sessão.

Mudança de servidor: control-tower commit `75d900a`. O cliente precisa dessa
mudança no servidor; atualizar apenas o frontend não resolve o período de graça.

## Segundo compartilhamento: ainda não confirmado como corrigido

O console da página afetada registrou `RTC_SCREEN_SHARE_FAILED name=Error`, sem
a mensagem original. Agora o erro original é preservado no console local, e o
servidor registra método e código de requisições rejeitadas sem registrar payloads.

A hipótese de que `closeProducer` sem await explica a falha não foi confirmada:
o servidor processa requisições de cada socket em ordem e o teste real passou.
Não adicionamos uma espera especulativa no encerramento.

## Validação

- 39 testes do servidor/cliente Control Tower passaram.
- 17 testes de call e 4 testes de desktop do app passaram.
- Builds TypeScript/Vite passaram; lint dos arquivos TypeScript alterados passou.
- Instância isolada da mesma imagem do servidor, credenciais temporárias próprias,
  sem webhooks de produção. Navegador real, mediasoup real e fontes sintéticas de
  áudio/vídeo; nenhuma tela, câmera ou microfone pessoal capturado.
- Três ciclos de iniciar/parar, usando `useScreenShare` do app. Inclui evento
  `ended` equivalente à parada pela barra do navegador.
- No terceiro ciclo, um participante receptor decodificou quadros de vídeo de
  640×360. Depois de ambos saírem, nova entrada não encontrou sessão fantasma.

### Reproduzir o teste opcional

Com o workspace irmão `control-tower`, compile seus pacotes e inicie sua instância
de benchmark isolada e o túnel SSH conforme `scripts/benchmark/remote-control.mjs`.
O diretório temporário e config precisam pertencer ao UID do container (65532 na
imagem usada). O script de benchmark antigo assume 1000 e exige esse ajuste.

Execute `node scripts/rtc-repeat-server.mjs` neste workspace e abra
`http://127.0.0.1:5181`. Clique em “Run synthetic repeat test”. O script aceita
somente config com `apiKey=benchmark-only`. Pare a instância/túnel após o teste.

O comportamento da captura nativa na máquina do usuário ainda requer repetição
para obter a mensagem exata e identificar a falha da segunda transmissão.

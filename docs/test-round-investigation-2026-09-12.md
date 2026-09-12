# Investigação da rodada com amigos — 2026-09-12

## Evidência encontrada no código

- O botão sair aguardava o encerramento do compartilhamento (timeout de 8 s) antes de desconectar. Agora desconecta diretamente e para os dispositivos antes de aguardar o SDK.
- Uma saída durante `createRoom()` não invalidava o resultado antes de `connect()`. Agora verifica a geração também nesse ponto. Uma nova entrada aguarda o fechamento do socket anterior, sem prender a saída na interface.
- O cliente Control Tower não liberava toda a captura quando vídeo/áudio falhava ao publicar. O patch persistido desfaz publicações parciais, para todas as faixas e invalida capturas pendentes; chamadas duplicadas compartilham a mesma operação.
- Resolução/FPS agora também são enviados como constraints de vídeo, pois o Control Tower encaminha as opções diretamente ao navegador.
- Configurações tinham altura mínima integral dentro de um pai com overflow oculto. Agora têm altura limitada e scroll próprio.

## Tela preta: mitigação e recuperação, sem causa histórica confirmada

A janela principal mantém timers/renderização ativos em segundo plano. A minimização deixa de alterar assinaturas de vídeo: os controles explícitos de assistir continuam responsáveis por isso. Restaurar solicita repintura. Isso pode aumentar consumo enquanto minimizado.

F5 recarrega o app, encerrando a sessão de mídia atual. Um renderer encerrado inesperadamente permite uma recuperação por minuto, sem entrar automaticamente em call. Erros de renderização React mostram uma opção de recarregar, em vez de deixar a tela vazia.

Referência de API: https://www.electronjs.org/docs/latest/api/web-contents

## Logs históricos consultados

- `%APPDATA%/splotys` e `%APPDATA%/DiscorTower`: apenas arquivos `.log` de armazenamento LevelDB, não registros de falhas; não foram tratados como logs de diagnóstico.
- Diretório do pacote Microsoft Store `GunnsDev.splotys_648fc2rmc70fr`: nenhum `.log`/`.dmp` de diagnóstico encontrado.
- Eventos Application 1000/1001/1002 nos últimos 14 dias: nenhuma ocorrência correspondente a splotys/DiscorTower retornada.
- O workspace vizinho contém logs de benchmarks automatizados; isso não estabelece evidência da rodada com amigos.

Não houve acesso a logs de produção ou às máquinas dos amigos. Data, horário e versão da rodada foram solicitados para correlação.

## Novos registros

O app grava `logs/desktop.jsonl` dentro do diretório Electron `userData`, normalmente `%APPDATA%/splotys` (a instalação Store pode virtualizar o caminho). Rotação em 1 MiB, com um arquivo anterior `.1`. Registra versão, estado da janela/call, códigos RTC e motivo/código de término de renderer/processos auxiliares. Não persiste mensagens, tokens, URLs do console ou conteúdo de tela; não envia registros a servidores. Esses dados só existirão após executar esta versão.

## Validação

- 16 testes de entrada/saída/captura, incluindo três testes do ciclo assíncrono real do hook com dependências simuladas.
- 4 testes de F5, restauração, recuperação de renderer e filtragem dos logs (eventos Electron simulados).
- 2 testes de presença.
- Typecheck e build de produção.
- Scroll verificado no navegador local em modo demonstração, sem entrar em uma call real.

A reprodução de captura prolongada, minimização/restauração e saída com dois ou mais usuários no executável Windows ainda é necessária. Não foi publicado instalador nem atualização Store.

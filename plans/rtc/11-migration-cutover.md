# 11 — Migração e cutover

Meta: trocar LiveKit → Control Tower com **risco mínimo e rollback imediato**. O design garante que a
troca é de **import + secrets**, não de lógica.

## Seams (pontos de troca)

1. **Frontend**: `import ... from 'livekit-client'` → `'@control-tower/client'`.
   - Arquivos que importam: `services/livekit.ts`, hooks (`useLiveKitRoom`, `useScreenShare`,
     `useRoomChat`, `useRoomSnapshot`, `useMicrophoneProcessing`, `useMicrophoneMonitor`,
     `useDesktopGameOverlay`), componentes (`CallScreen`, `RemoteAudioRenderer`,
     `ParticipantGallery`, `ParticipantList`, `ScreenShareStage`), `types/index.ts`.
   - Como a fachada replica a superfície, o diff é quase só o caminho do import. Onde o app usa
     um tipo do livekit (`Room`, `RemoteAudioTrack`, etc.), re-exportar do `client`.
2. **Edge Functions**: `supabase/functions/_shared/livekit.ts` e `livekit-webhook/index.ts`:
   `npm:livekit-server-sdk` → `npm:@control-tower/server-sdk`.
3. **Secrets** (Supabase): apontar para a Control Tower.

## Estratégia de nomes de env

Duas opções:
- **A) Reusar `LIVEKIT_URL/API_KEY/API_SECRET`** — zero mudança de código nas Edge (o seam já
  lê esses nomes). Só troca os **valores** para a Control Tower. Mais rápido, menos limpo.
- **B) Renomear para `RTC_URL/RTC_API_KEY/RTC_API_SECRET`** — mais claro, exige editar o seam
  (`_shared/livekit.ts`) para ler os novos nomes. Recomendado a médio prazo.

Recomendação: **cutover com A** (menor risco), depois um PR de limpeza para **B**.

## Feature flag / execução em paralelo

Rodar as duas infra ao mesmo tempo durante a validação:

- A Edge `issue-livekit-token` decide qual provedor usar por um flag (`RTC_PROVIDER = 'livekit' | 'torre'`),
  possivelmente por usuário/porcentagem (canary). O `serverUrl` retornado aponta para o provedor
  escolhido; o app não sabe a diferença.
- **Importante**: uma sala precisa ficar 100% num provedor (não misturar clientes LiveKit e
  Control Tower na mesma sala — protocolos diferentes). Decidir o provedor **por sala** (ex.: hash do
  `roomName`), não por participante.
- Webhooks: as Edge já são idempotentes e agnósticas ao provedor (o `WebhookReceiver` do
  provedor ativo valida). Se rodar os dois, cada um assina com seu secret; a Edge precisa saber
  qual receiver usar — no MVP, um provedor por vez por ambiente é mais simples.

## Sequência de cutover (produção)

1. Provisionar VPS, DNS, TLS, coturn (doc 08). `GET /healthz` verde.
2. Rodar a matriz do doc 10 §Nível 3 **no VPS** com usuários internos (flag `torre` só para
   contas de teste).
3. Rodar carga 3/5/8 (doc 10 §Nível 4) por ≥ 1 semana.
4. Canary: mover uma fração das salas para `torre`; monitorar métricas e erros (doc 09).
5. Cutover total: `RTC_PROVIDER=torre` para todos.
6. Manter LiveKit "quente" por 1–2 semanas para rollback rápido.
7. Descomissionar LiveKit; PR de limpeza (renomear env para `RTC_*`, remover libs livekit).

## Rollback

- Reverter o flag `RTC_PROVIDER` para `livekit` (ou reverter os valores dos secrets `LIVEKIT_*`).
- Se o import já foi trocado no frontend: manter o `livekit-client` como dependência até o
  passo 7, e um build anterior disponível. Como o cutover principal é server-side (flag na
  Edge), o rollback não exige redeploy do app — o mesmo app fala com qualquer provedor **se**
  mantivermos os dois SDKs client-side durante a janela. 
  - Alternativa mais segura para a janela de canary: manter **ambos** os SDKs no bundle e o
    `room.connect` escolher a implementação conforme um campo extra no retorno do token
    (`provider: 'livekit'|'torre'`). Remover o livekit-client só no passo 7.

## Checklist de compatibilidade antes do cutover

- [ ] `AccessToken` da Control Tower é aceito pela Control Tower e carrega identity/name/metadata/grant.
- [ ] Os 6 webhooks chegam assinados e populam `room_sessions`/`participant_sessions` como antes.
- [ ] `track_published` de tela traz width/height → enforce de resolução funciona.
- [ ] `listParticipants` retorna `state` com 3 = desconectado.
- [ ] `deleteRoom`/`removeParticipant`/`updateParticipant`/`sendData` funcionam via Control API.
- [ ] Identity `usr_..._...` e room `DT_...` preservados ponta a ponta.
- [ ] Chat texto/imagem e mensagens de sistema (`system.call-limit`) funcionam.
- [ ] Reconexão, mute, active speakers, screen share com áudio — todos verdes na matriz.
- [ ] Rollback testado (voltar o flag e confirmar que uma call sobe no LiveKit de novo).

# Spec 002 — Smoke tests manuais por estágio

Objetivo deste documento: dar um **roteiro manual, repetível e rápido** para você, a cada estágio,
**provar que o estágio funciona** e **que os estágios anteriores continuam funcionando**
(regressão). É complementar — não substitui — os **gates de saída** do
[`implementation-plan.md`](implementation-plan.md) e os testes automatizados do
[`plan 10`](../../plans/rtc/10-testing-plan.md).

## Como usar

1. Rode o smoke do estágio ativo **antes de marcar o gate** em [`tracking.md`](tracking.md).
2. Rode também o **smoke de regressão** (bloco "Regressão acumulada" ao final de cada estágio):
   é o smoke curto dos estágios anteriores, para pegar quebra causada pelo novo código.
3. Cada passo tem **Esperado** (o que você deve observar). Se divergir, **não marque o gate** —
   registre em `tracking.md` e, se for indefinição de produto/infra, abra `Q-NN` (regra R2 do
   [`README.md`](README.md)).
4. Marque `[ ]`→`[x]` só quando **observou** o resultado. Estes checkboxes são de execução manual;
   os gates oficiais continuam em `implementation-plan.md`.

> Convenção de ambiente local (ajuste aos seus valores):
> - Segredos de teste: `LIVEKIT_API_KEY=devkey`, `LIVEKIT_API_SECRET=devsecret32chars_minimo_pra_hs256`.
> - Sala de teste: `DT_smoke`. Identity de teste: `usr_<uuid>_<sufixo>` (formato real do app).
> - Repo do servidor/SDKs: `fa/control-tower`. App/Edge: `fa/discortower`.

---

## E2 — `server-sdk` + troca do seam

**O que este smoke prova:** o `@gunns-dev/control-tower-server-sdk` emite/valida token, verifica webhooks
assinados e monta chamadas de RoomService **do jeito que a Control Tower e as Edge Functions
esperam** — e o seam do app compila apontando para o pacote novo.
🔗 gate oficial: [`implementation-plan.md` §E2](implementation-plan.md#e2--server-sdk--troca-do-seam).

**Pré-requisitos:** E1 verde. `deno` instalado. `supabase` CLI instalado (para o passo de compilar).

### Passos

1. **Unidade do SDK (Deno).** Em `fa/control-tower/packages/server-sdk`:
   ```bash
   deno test -A
   ```
   **Esperado:** todos os testes passam — token válido/inválido/expirado, webhook aceito quando
   assinado e rejeitado quando adulterado, RoomService montando URL/corpo certos e `state=3`
   mapeado como desconectado.

2. **Round-trip de token na mão ( vê identity/room preservados).** Crie
   `scratch/smoke-token.ts` em `fa/control-tower`:
   ```ts
   import { AccessToken, TrackSource, verifyJwt } from './packages/server-sdk/src/index.ts'
   const id = 'usr_11111111-1111-4111-8111-111111111111_ab12'
   const t = new AccessToken('devkey', 'devsecret32chars_minimo_pra_hs256', { identity: id, name: 'Smoke', ttl: '5m' })
   t.addGrant({ room: 'DT_smoke', roomJoin: true, canPublish: true, canSubscribe: true,
     canPublishSources: [TrackSource.MICROPHONE, TrackSource.CAMERA] })
   const jwt = await t.toJwt()
   console.log('JWT len:', jwt.length)
   const claims = await verifyJwt(jwt, 'devsecret32chars_minimo_pra_hs256')
   console.log('sub/identity:', claims.sub ?? claims.identity)
   console.log('room grant:', JSON.stringify(claims.video ?? claims))
   ```
   Rode: `deno run -A scratch/smoke-token.ts`
   **Esperado:** imprime a identity **exatamente** `usr_..._ab12` e o grant com `room: "DT_smoke"`.
   Troque o secret no `verifyJwt` por outro → deve **lançar** (assinatura inválida). (Ajuste os
   nomes de campo do claim ao que o pacote realmente emite; o ponto é ver identity e room íntegros.)

3. **Webhook assinado (aceita/rejeita).** No mesmo script, gere um corpo, calcule o hash/assinatura
   com o helper do pacote e passe por `WebhookReceiver.receive`; depois **altere 1 byte** do corpo.
   **Esperado:** corpo íntegro → evento retornado; corpo adulterado → erro.

4. **Seam compila com o import novo.** Em `fa/discortower`:
   ```bash
   supabase functions serve --no-verify-jwt --env-file supabase/.env.local livekit-webhook
   ```
   (ou `deno check supabase/functions/livekit-webhook/index.ts supabase/functions/_shared/livekit.ts`)
   **Esperado:** compila sem erro; o import `npm:@gunns-dev/control-tower-server-sdk@0.1.0` resolve.
   Confirme que `_shared/livekit.ts` e `livekit-webhook/index.ts` **só trocaram o import** (a lógica
   não mudou) — `git diff` deve mostrar apenas as linhas de `import`.

5. **Teste cruzado de auth (opcional agora, obrigatório até o E3).** Guarde o `jwt` do passo 2 —
   ele será reusado no smoke do E3 para conectar de fato na Control Tower com o **mesmo secret**.

### Registro E2

- [ ] `deno test -A` do `server-sdk` verde.
- [ ] Token round-trip preserva identity `usr_..._...` e room `DT_...`; secret errado é rejeitado.
- [ ] Webhook íntegro aceito, adulterado rejeitado.
- [ ] `supabase functions` compila com o import trocado; `git diff` do seam = só imports.

### Regressão acumulada (rodar sempre)

- [ ] `npm test` na raiz de `fa/control-tower` (E1: os 42 testes do `protocol` seguem verdes).

---

## E3 — Signaling e salas (sem mídia)

**O que este smoke prova:** dá para conectar via WebSocket com token real, receber `welcome`, e
dois peers se enxergam (`peerJoined`/`peerLeft`) — tudo **sem mídia**.
🔗 gate: [`implementation-plan.md` §E3](implementation-plan.md#e3--control-tower-signaling-e-salas-sem-mídia).

**Pré-requisitos:** E2 verde. Control Tower rodando local (`docker compose up torre` ou `npm run dev`
no `@gunns-dev/control-tower-server`), com os mesmos `LIVEKIT_API_KEY/SECRET` do E2.

### Passos

1. **Health.** `curl -s localhost:<porta>/healthz`
   **Esperado:** 200 com contadores de salas/peers (0/0 no início).

2. **Conectar com token válido.** Use o `jwt` do smoke E2 (mesmo secret). Um WS client simples
   (`websocat`, ou um script Deno) conecta em `wss://localhost:<porta>/...?token=<jwt>`.
   **Esperado:** recebe `welcome` com o estado inicial da sala. Este é o **teste cruzado** de auth
   do E2 fechando: o token do SDK é aceito pela Control Tower.

3. **Token inválido/expirado.** Conecte com o secret trocado (ou um `ttl` já vencido).
   **Esperado:** conexão fechada com código **4401**.

4. **Dois peers.** Abra dois WS na mesma sala `DT_smoke` com identities diferentes.
   **Esperado:** o peer A recebe `peerJoined` do B; ao fechar B, A recebe `peerLeft`. `/healthz`
   mostra 1 sala / 2 peers enquanto ambos estão conectados.

### Registro E3

- [ ] `/healthz` responde e conta salas/peers.
- [ ] Token válido → `welcome`; inválido/expirado → close 4401.
- [ ] `peerJoined`/`peerLeft` entre dois peers.

### Regressão acumulada

- [ ] Smoke E2 passos 1–2 (SDK + token) ainda verdes.

---

## E4 — Voz ponta a ponta

**O que este smoke prova:** dois navegadores na sala; **B ouve A**; mute/unmute reflete no estado
e no áudio; grant de fonte é respeitado.
🔗 gate: [`implementation-plan.md` §E4](implementation-plan.md#e4--voz-ponta-a-ponta) ·
matriz [`plan 10 §Nível 3`](../../plans/rtc/10-testing-plan.md).

**Pré-requisitos:** E3 verde. `docker compose up torre` local. **Página mínima de teste** do
`client` servida (a do entregável do E4, sem o app inteiro). Dois navegadores/perfis na mesma
máquina (ou um deles em aba anônima). Fone de ouvido nos dois para evitar eco/realimentação.

### Passos

1. **Entrar com dois participantes** na mesma sala `DT_smoke` (dois tokens, duas identities).
   **Esperado:** cada aba lista o outro participante (galeria/estado).
2. **Voz A→B.** Fale no mic da aba A.
   **Esperado:** a aba B **toca o áudio** de A (via renderer estilo `RemoteAudioRenderer`). Repita
   B→A.
3. **Mute/unmute.** Mute o mic em A.
   **Esperado:** B para de ouvir; evento `TrackMuted` em A; ícone reflete. Unmute → `TrackUnmuted`
   e áudio volta.
4. **Grant negado.** Emita um token **sem** `SCREEN_SHARE` no grant e tente `produce` dessa fonte.
   **Esperado:** erro `FORBIDDEN_SOURCE`.
5. **Diagnóstico se falhar áudio:** `chrome://webrtc-internals` (estado DTLS, candidatos ICE,
   bitrate de entrada/saída) conforme [`plan 10 §Diagnóstico`](../../plans/rtc/10-testing-plan.md).

### Registro E4

- [ ] Dois participantes se veem na galeria.
- [ ] B ouve A e A ouve B (áudio real).
- [ ] Mute/unmute: `TrackMuted/Unmuted` + áudio some/volta.
- [ ] `produce` fora do grant → `FORBIDDEN_SOURCE`.

### Regressão acumulada

- [ ] Smoke E3 (welcome + peerJoined/Left) ainda verde nesta mesma sessão de teste.

---

## E5 — Vídeo, tela e áudio de tela + presets

**O que este smoke prova:** câmera e compartilhamento de tela (com áudio de tela) entre dois
navegadores, presets aplicados e `width/height` reais visíveis no servidor.
🔗 gate: [`implementation-plan.md` §E5](implementation-plan.md#e5--vídeo-tela-e-áudio-de-tela--presets).

**Pré-requisitos:** E4 verde. Mesmo setup de dois navegadores.

### Passos

1. **Câmera.** Ative câmera em A e depois em B.
   **Esperado:** o vídeo aparece nos dois lados; desligar câmera some o vídeo dos dois.
2. **Tela com áudio.** Em A, compartilhe uma tela/aba **com áudio** (ex.: um vídeo tocando).
   **Esperado:** B **vê a tela** e **ouve o áudio da tela** (fonte `screen_share_audio`).
3. **Presets.** Force 720p e depois 1080p.
   **Esperado:** em `chrome://webrtc-internals` (ou `getStats`) o encoding reflete a resolução/bitrate
   do preset escolhido.
4. **width/height no servidor.** Nos logs/stats da Control Tower do `produce` de tela.
   **Esperado:** `width`/`height` reais aparecem no lado servidor (pré-requisito do enforce de
   resolução no E6).

### Registro E5

- [ ] Câmera aparece/some nos dois lados.
- [ ] Tela + áudio de tela chega em B.
- [ ] Preset 720p/1080p confirmado por stats.
- [ ] `width/height` reais disponíveis no servidor.

### Regressão acumulada

- [ ] Smoke E4 (voz + mute) ainda verde nesta sessão.

---

## E6 — Webhooks + Control API completa + active speakers

**O que este smoke prova:** o estado durável chega ao DB local via webhooks assinados
(idempotentes), a moderação/enforce funciona via Control API, e active speakers dispara.
🔗 gate: [`implementation-plan.md` §E6](implementation-plan.md#e6--webhooks--control-api-completa--active-speakers).

**Pré-requisitos:** E5 verde. `supabase start` + `supabase functions serve` local (Edge + DB).
Control Tower apontando os webhooks para a Edge local.

### Passos

1. **6 webhooks populam o DB.** Faça um ciclo completo: criar sala → 2 entram → publicam → saem.
   **Esperado:** `room_sessions`/`participant_sessions` populam como o LiveKit fazia; cada evento
   chega **assinado** (rejeição se assinatura não bate).
2. **Idempotência.** Reenvie o mesmo evento (mesmo `id`).
   **Esperado:** nenhuma alteração extra no DB (linha/contagem não muda).
3. **Enforce de resolução.** Publique tela **acima** do limite.
   **Esperado:** `track_published` traz `width/height`; `updateParticipant` bloqueia e **encerra os
   producers de tela**.
4. **Control API pela Edge.** Rode `enforce-call-limits` local e/ou chame manualmente:
   `listParticipants`, `sendData`, `removeParticipant`, `deleteRoom`.
   **Esperado:** todas funcionam contra a Control Tower; `listParticipants` traz `state` (3 =
   desconectado).
5. **Active speakers.** Fale em A.
   **Esperado:** `ActiveSpeakersChanged` dispara; indicador muda.

### Registro E6

- [ ] 6 webhooks assinados populam `room_sessions`/`participant_sessions`.
- [ ] Evento repetido (mesmo `id`) é idempotente.
- [ ] Enforce de resolução bloqueia tela acima do limite.
- [ ] `listParticipants`/`sendData`/`removeParticipant`/`deleteRoom` via Edge local.
- [ ] `ActiveSpeakersChanged` ao falar.

### Regressão acumulada

- [ ] Smoke E5 (câmera + tela) e E4 (voz) ainda verdes nesta sessão.

---

## E7 — Chat + mensagens de sistema + reconexão

**O que este smoke prova:** data streams (texto e imagem), mensagem de sistema e resiliência de
reconexão.
🔗 gate: [`implementation-plan.md` §E7](implementation-plan.md#e7--chat--mensagens-de-sistema--reconexão).

**Pré-requisitos:** E6 verde. Dois navegadores.

### Passos

1. **Chat texto.** Envie texto de A para B.
   **Esperado:** chega em B com **nome e avatar** corretos.
2. **Chat imagem.** Envie imagem ≤ 4 MB (gif/jpeg/png/webp).
   **Esperado:** renderiza. Tente > 4 MB → **rejeitada**. Tente tipo não suportado → rejeitado.
3. **Mensagem de sistema.** Dispare `system.call-limit` (via `sendData` do servidor).
   **Esperado:** chega como `DataReceived` no cliente.
4. **Reconexão curta.** Derrube a rede da aba A por ~5 s (DevTools → offline) e volte.
   **Esperado:** estado passa por `Reconnecting`/`SignalReconnecting` e volta a `Connected`
   **sem recriar a sala** (grace 45 s, decisão Q-08). A mídia/streams voltam.
5. **Reconexão após token expirado.** Deixe passar além do TTL e reconecte.
   **Esperado:** comportamento conforme a decisão Q-08 (ICE-restart → WS-resume → rejoin).

### Registro E7

- [ ] Chat texto com nome/avatar.
- [ ] Chat imagem ≤ 4 MB ok; > 4 MB e tipo inválido rejeitados.
- [ ] `system.call-limit` chega via `DataReceived`.
- [ ] Reconexão curta volta a `Connected` sem recriar a sala.
- [ ] Reconexão pós-expiração segue Q-08.

### Regressão acumulada

- [ ] Smoke E6 (webhooks + active speakers) ainda verde nesta sessão.

---

## E8 — Integração no app real (atrás de flag)

**O que este smoke prova:** o **app splotys real** roda na Control Tower localmente, atrás de flag,
com toda a matriz funcional passando — e o rollback client-side funciona.
🔗 gate: [`implementation-plan.md` §E8](implementation-plan.md#e8--integração-no-app-real-atrás-de-flag) ·
matriz completa [`plan 10 §Nível 3`](../../plans/rtc/10-testing-plan.md).

**Pré-requisitos:** E7 verde. App `discortower` rodando local; `issue-livekit-token` retornando
`serverUrl` da Control Tower quando `RTC_PROVIDER=torre`; ambos os SDKs no bundle (Q-15).

### Passos (matriz no app real)

1. Ligue a flag `RTC_PROVIDER=torre` para a sala de teste e abra o app em dois navegadores.
2. Percorra a **matriz completa** — cada item deve passar **no app real**:
   conectar · voz · mute · câmera · tela+áudio · qualidade · chat texto · chat imagem ·
   active speakers · entrar/sair (com som de join/leave) · reconexão · kick (admin) ·
   encerrar sala (admin) · guardrail solo · enforce de resolução · webhooks.
3. **Sem mudança de lógica na Edge.** `git diff` das Edge Functions = só imports.
4. **Rollback.** Volte a flag para o LiveKit e refaça conectar+voz.
   **Esperado:** a call sobe no LiveKit normalmente (rollback client-side funciona).

### Registro E8

- [ ] Matriz funcional completa passa no app real (todos os itens acima).
- [ ] Edge Functions só mudaram imports.
- [ ] Rollback para LiveKit testado.

### Regressão acumulada

- [ ] Smokes E4–E7 cobertos pela matriz do app (não precisam ser repetidos na página mínima).

---

## E9 — VPS + carga

**O que este smoke prova:** a Control Tower serve por HTTPS na VPS, uma call real entre **duas
máquinas distintas** funciona, e a carga alvo é estável.
🔗 gate: [`implementation-plan.md` §E9](implementation-plan.md#e9--vps--carga) ·
[`plan 10 §Nível 4`](../../plans/rtc/10-testing-plan.md).

**Pré-requisitos:** E8 verde. VPS provisionada; DNS `media.splotys.com` + `turn.splotys.com`;
Caddy (TLS), coturn, firewall (UDP 40000-40999). Duas máquinas em redes diferentes.

### Passos

1. **Health por HTTPS.** `curl https://media.splotys.com/healthz`
   **Esperado:** 200 verde por TLS válido.
2. **Call entre duas máquinas.** Conecte de duas redes distintas e faça voz + 1 tela 720p.
   **Esperado:** áudio/vídeo estáveis; se falhar, checar `announcedIp`, faixa UDP e TURN
   (`turnutils_uclient -T -u <user> -w <cred> turn.splotys.com`).
3. **Carga em perfis.** 3 → 5 → 8 participantes, ≥ 1 h cada.
   **Esperado:** medir CPU/RAM/banda/perda/RTT/jitter/uso de TURN via `/metrics`; sem perda audível.
4. **Estabilidade prolongada.** 1–2 calls simultâneas com voz + 1 tela 720p.
   **Esperado:** CPU < 85% sustentada por ≥ 1 semana de uso real.

### Registro E9

- [ ] `/healthz` verde por HTTPS.
- [ ] Call real entre duas máquinas distintas.
- [ ] Cargas 3/5/8 medidas por ≥ 1 h cada.
- [ ] Estabilidade ≥ 1 semana com CPU < 85%.

### Regressão acumulada

- [ ] Smoke E8 (matriz do app) refeito uma vez contra a VPS (não só local).

---

## E10 — Cutover

**O que este smoke prova:** 100% das salas na Control Tower com LiveKit desligado, e o rollback
ainda funciona antes do descomissionamento.
🔗 gate: [`implementation-plan.md` §E10](implementation-plan.md#e10--cutover).

**Pré-requisitos:** E9 verde. Canary conforme Q-14 (allowlist → hash% → 100%).

### Passos

1. **Canary por etapa.** Ligue A (allowlist) → B (hash %) → total; a cada etapa refaça
   conectar+voz+tela em uma sala real.
   **Esperado:** salas do percentual ativo sobem na Control Tower; as demais no LiveKit.
2. **100% + LiveKit off.** Confirme que todas as salas novas usam a Control Tower.
   **Esperado:** nenhuma sala nova no LiveKit; LiveKit mantido "quente" 1–2 semanas.
3. **Rollback.** Volte o flag e confirme que a call sobe no LiveKit de novo.
   **Esperado:** rollback funciona e está documentado.

### Registro E10

- [ ] Canary A→B→total validado com call real a cada etapa.
- [ ] 100% na Control Tower; LiveKit desligado.
- [ ] Rollback testado e documentado.

### Regressão acumulada

- [ ] Última passada da matriz completa (E8) em produção antes de remover o LiveKit.

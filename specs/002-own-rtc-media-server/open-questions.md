# Spec 002 — Registro de decisões em aberto (ODR)

Este é o mecanismo que garante **"pergunte, não assuma"**. Toda indefinição vira uma entrada
aqui. Uma entrada `OPEN` **bloqueia** o(s) estágio(s) listado(s): o agente não pode iniciar
esse estágio até a entrada virar `DECIDIDA`.

## Como usar (agente implementador)

1. Antes de iniciar um estágio (`tasks.md`), verifique se há entrada `OPEN` que o bloqueia.
   Se houver, **pergunte ao proprietário** e aguarde; não comece.
2. Ao topar com uma indefinição nova durante a execução, **pare** e adicione uma entrada com
   o template abaixo, depois pergunte. Não invente default.
3. Quando o proprietário decidir, preencha `Decisão`, mude `Status` para `DECIDIDA (AAAA-MM-DD)`
   e só então implemente conforme a decisão. Nunca edite a decisão depois sem nova aprovação.

### Template

```
### Q-NN — <título curto>
- Status: OPEN
- Bloqueia: <estágios, ex.: E0, E9>
- Contexto: <por que isso apareceu e onde no plano>
- Opções: <A / B / C, com trade-offs>
- Recomendação do agente: <uma opção + motivo curto>
- Decisão: <preencher quando o proprietário decidir>
```

> Regra: a "Recomendação do agente" **não** autoriza implementar. Só a "Decisão" autoriza.

---

## Decisões que bloqueiam o início (resolver antes do E0/E1)

### Q-01 — Monorepo separado ou subpasta no repo atual?
- Status: **DECIDIDA (2026-09-05)**
- Bloqueia: E0
- Contexto: o plano ([02](../../plans/rtc/02-architecture.md) §monorepo) recomenda repositório
  separado `control-tower`, mas admite subpasta `rtc/` no repo do app. Afeta build do Electron e CI.
- Opções:
  - **A) Repo separado** — isola build/deps do SFU do app; exige forma de distribuir os pacotes (ver Q-03).
  - **B) Subpasta `rtc/` no repo atual** — tudo junto, imports locais mais simples, mas infla o repo do app e o build.
- Recomendação do agente: A (repo separado), pela separação de ciclo de vida servidor vs app.
- **Decisão: A — repositório GitHub privado próprio `control-tower`, totalmente apartado do
  app splotys (sem subpasta, sem workspace compartilhado com o app).** Consequência: a
  distribuição dos pacotes para o app e para o Deno passa a depender de Q-03 (não há import
  relativo possível). Todo o desenvolvimento do RTC acontece nesse repo isolado.

### Q-02 — Nome do produto/codinome e escopo npm
- Status: **DECIDIDA (2026-09-05)**
- Bloqueia: E0
- Contexto: definir o nome do serviço de streaming e o escopo dos pacotes antes de criar o repo.
- Opções: `@control-tower/*`; `@sentinel/*`; ou manter `@splotys/rtc-*`.
- Recomendação do agente: `@control-tower/*`.
- **Decisão: nome do serviço "Control Tower" (forma curta "Tower"). Repo GitHub privado
  `control-tower`. Escopo npm `@control-tower/*` com os pacotes `@control-tower/protocol`,
  `@control-tower/server`, `@control-tower/client`, `@control-tower/server-sdk`.** O plano
  ([`plans/rtc/*`](../../plans/rtc/README.md)) e esta spec já foram renomeados para esses nomes;
  o codinome antigo "Torre" e o escopo `@splotys/rtc-*` estão descontinuados.

### Q-03 — Como distribuir `client` e `server-sdk`?
- Status: **DECIDIDA (2026-09-05)**
- Bloqueia: E2 (import no seam Deno), E8 (import no app)
- Contexto: o app importa `@control-tower/client`; as Edge Functions (Deno) importam
  `@control-tower/server-sdk` via specifier `npm:`. Deno resolve `npm:` do registry npm público
  por padrão. **Nota:** a opção C abaixo caiu porque Q-01 fixou repo separado (sem import relativo).
- Opções:
  - **A) Publicar no npm** (público ou privado com token) — `npm:@control-tower/server-sdk@x` funciona no Deno; app usa dependência normal.
  - **B) Tarball/git dependency** — sem registry; app via git/tarball; para Deno, vendored ou import por URL. Mais atrito no Deno.
  - ~~**C) repo único + imports relativos**~~ — descartada por Q-01 (repo apartado).
- Recomendação do agente: A (npm privado) — é o caminho que funciona limpo nos dois consumidores.
- **Decisão: A — publicar os pacotes no npm, começando como PÚBLICOS.** Racional e regras:
  - **É o mesmo mecanismo que o projeto já usa hoje:** o seam Deno já importa
    `npm:livekit-server-sdk@2.15.0`. Trocar para `npm:@control-tower/server-sdk@<versão>` é
    idêntico — nenhum conceito novo de Deno, nenhum registry para operar.
  - **Consumo:** app faz `npm install @control-tower/client` (dependência normal); Edge Functions
    fazem `import ... from 'npm:@control-tower/server-sdk@<versão>'`. `@control-tower/protocol`
    entra só como dependência transitiva dos dois.
  - **`@control-tower/server` (a torre) NÃO é publicado no npm** — é entregue como imagem Docker
    e roda no VPS. Só `client`, `server-sdk` e `protocol` viram pacotes.
  - **Privacidade:** o repositório-fonte segue privado (Q-01). Os pacotes publicados são apenas o
    build compilado, **sem segredos** (as chaves ficam em env, como nos SDKs do próprio LiveKit,
    que são públicos). Se no futuro quisermos ocultar até o build, migrar para GitHub Packages
    privado — isso adiciona um passo de token de auth (inclusive no Deno) e fica como item futuro,
    **não** no MVP.
  - **Versão:** publicar com semver; o seam e o app fixam a versão exata (como o `@2.15.0` atual).

---

## Decisões de comportamento/escopo (resolver antes do estágio indicado)

### Q-04 — adaptiveStream no MVP ou adiado?
- Status: **DECIDIDA (2026-09-05)**
- Bloqueia: E5 (escopo)
- Contexto: o plano ([05](../../plans/rtc/05-client-sdk.md)) marca adaptiveStream como P1 e permite
  adiar. Sem ele, quem tem o vídeo pequeno/oculto ainda baixa a camada cheia (mais banda/CPU).
- Opções:
  - **A) Adiar para depois do cutover** — MVP mais simples; custo de banda maior em salas com vídeo.
  - **B) Incluir no E5** — mais trabalho, melhor eficiência já no lançamento.
- Recomendação do agente: A (adiar), pois o uso é pessoal e salas pequenas; ligar quando houver carga real.
- **Decisão: A — adiar adaptiveStream para depois do cutover.** Requisito de arquitetura para não
  gerar retrabalho: o SDK cliente deve criar cada Consumer de vídeo de um jeito que permita
  **acrescentar** `setConsumerPreferredLayers` depois (guardar referência do consumer + do elemento
  `<video>` anexado), mas **não** implementar a observação de tamanho/visibilidade no MVP. Vira uma
  entrada P1 no backlog pós-cutover.

### Q-05 — simulcast/dynacast: ativar já no E5?
- Status: **DECIDIDA (2026-09-05)**
- Bloqueia: E5
- Contexto: simulcast é usado hoje no screen share (`useScreenShare` passa `simulcast:true`).
  dynacast é comportamento nativo do mediasoup.
- Opções: **A)** habilitar simulcast só para tela (como hoje) no E5; **B)** simulcast também para câmera.
- Recomendação do agente: A (paridade com hoje) — simulcast na tela; câmera single-layer no MVP.
- **Decisão: A — simulcast apenas no compartilhamento de tela (3 camadas via `buildScreenEncodings`),
  câmera single-layer no MVP.** dynacast fica por conta do comportamento nativo do mediasoup (só
  envia as camadas com assinante) — não implementar lógica extra. Simulcast de câmera pode entrar
  junto do adaptiveStream (Q-04) como P1 pós-cutover, se a carga justificar.

### Q-06 — Codecs de vídeo
- Status: **DECIDIDA (2026-09-05)**
- Bloqueia: E5
- Contexto: o plano fixa VP8 + H264 (cobre Chrome/Firefox/Safari/Electron). VP9/AV1 fora do MVP.
- Opções: **A)** VP8+H264; **B)** incluir VP9.
- Recomendação do agente: A (VP8+H264), por compatibilidade ampla e simulcast estável.
- **Decisão: A — VP8 + H264 (áudio Opus estéreo).** É a lista de codecs do `mediaCodecs` do
  Router no plano [04](../../plans/rtc/04-media-server.md). VP8 dá simulcast estável e amplo; H264
  cobre Safari/hardware. VP9/AV1 ficam fora do MVP (revisitar só se houver ganho medido).

### Q-07 — Política de assinatura (auto-subscribe)
- Status: **DECIDIDA (2026-09-05)**
- Bloqueia: E4/E5
- Contexto: o app hoje espera ver todas as publicações. O plano assume **auto-subscribe** de tudo.
  Em salas grandes isso custa banda; no uso atual (poucos participantes) é adequado.
- Opções: **A)** auto-subscribe de tudo; **B)** subscribe sob demanda (mais complexo, muda o app).
- Recomendação do agente: A (auto-subscribe), para paridade sem mexer no app.
- **Decisão: A — auto-subscribe de tudo (áudio e vídeo).** Ao entrar e a cada `newProducer`, o SDK
  cria o Consumer (pausado, padrão mediasoup) e o retoma após anexar, emitindo `TrackSubscribed`.
  Sem subscribe sob demanda no MVP. Revisitar só se surgir sala grande (ligar junto de Q-04/Q-05).

### Q-08 — Grace period, TTL de token e reconexão longa
- Status: **DECIDIDA (2026-09-05)**
- Bloqueia: E7 (reconexão)
- Contexto: o token tem TTL curto (5 min) e serve só para conectar; a call dura horas. Na
  reconexão **dentro** do grace, a sessão é retomada sem revalidar token. Mas se o WS cair por
  mais tempo que o grace, o cliente precisa reabrir — e o token pode ter expirado.
- Opções:
  - **A)** Cliente re-busca um token novo na Edge (`fetchConnectionDetails`) antes de reabrir o WS após grace.
  - **B)** Emitir tokens com TTL maior (ex.: horas) e aceitar reconexão sem re-fetch.
  - **C)** Grace period maior (ex.: 60 s) para cobrir quedas comuns sem reabrir.
- Recomendação do agente: A + C.
- **Decisão: A + C, com TTL de token mantido em 5 min.** Três níveis de reconexão:
  1. **Falha só de ICE, WS de pé** (hiccup de wifi): `restartIce` → estado `Reconnecting`. Sem
     re-fetch de token, sem recriar producers/consumers. É o caso mais comum.
  2. **WS caiu** → estado `SignalReconnecting`; cliente reabre o WS. **Grace period = 45 s.** Dentro
     do grace e com token ainda válido, a Control Tower retoma a sessão pela `identity` (reanexa
     producers/consumers). Se o token expirou ou passou do grace → passo 3.
  3. **Rejoin completo**: cliente re-busca connection details na Edge (`fetchConnectionDetails`) e
     refaz o join do zero.
  - **Verificação obrigatória no E7 (não assumir):** confirmar que o re-fetch durante uma call ativa
    **não** duplica `room_sessions`/`participant_sessions` no DB (esperado idempotente por
    identity/sala). Se duplicar, tratar no RPC de reserva — abrir sub-tarefa, não improvisar.

### Q-09 — Framing dos data streams (chat)
- Status: **DECIDIDA (2026-09-05)**
- Bloqueia: E7
- Contexto: o app usa a API de streams do LiveKit (`sendText`/`sendFile`/handlers/`reader`).
  Precisa de um formato de cabeçalho exato para o agente não inventar.
- Opções: **A)** framing do plano como está; **B)** um único formato de cabeçalho para texto e imagem.
- Recomendação do agente: B.
- **Decisão: B — um único framing para texto e imagem, sobre DataChannel ordenado+confiável (SCTP).**
  Formato exato (implementar assim):
  - **Frame 0 (cabeçalho, JSON como texto):**
    `{"h":1,"id":"<uuid>","topic":"<t>","kind":"text"|"byte","mime":<string|null>,"name":<string|null>,"size":<int|null>,"ts":<epoch ms>,"chunks":<int>}`
  - **Frames 1..chunks (binários):** payload em pedaços de ≤ 16 KB, **em ordem** (o canal ordenado
    garante a sequência — **sem índice por frame**).
  - **Texto:** UTF-8, `kind:"text"`, `mime:null`. **Imagem:** `kind:"byte"`, `mime` setado, `size`=bytes.
  - **Lado receptor:** monta `reader.info = { id, timestamp: ts, mimeType: mime, size, name }`;
    `reader.readAll({signal})` resolve a `string` (texto) ou `Uint8Array[]` (byte), respeitando `AbortSignal`.
  - **Limites preservados (validados no cliente, como hoje):** imagem ≤ 4 MB; tipos gif/jpeg/png/webp.
    Tópicos atuais: `ford-kall.chat.text.v1`, `ford-kall.chat.image.v1`.

---

## Decisões de infraestrutura (resolver antes do E9)

### Q-10 — VPS, domínio e subdomínios definitivos
- Status: **DECIDIDA (2026-09-05)**
- Bloqueia: E9
- Contexto: o roadmap aponta Hostinger KVM 2 (BR) como referência, e o plano prevê
  `media.<domínio>` e `turn.<domínio>`.
- Opções: confirmar Hostinger KVM 2 + domínio; ou outro.
- Recomendação do agente: seguir o roadmap e usar `splotys.com`.
- **Decisão: Hostinger KVM 2 (datacenter BR), domínio `splotys.com` (o app já usa esse domínio).
  Subdomínios: `media.splotys.com`** (signaling + Control API, atrás do Caddy) **e
  `turn.splotys.com`** (coturn). DNS: registros A dos dois subdomínios apontando para o IPv4 da
  VPS. O IPv4 concreto e a confirmação de compra são **fatos de provisionamento** (preencher no
  E9), não decisões de design.

### Q-11 — Credenciais TURN: efêmeras ou estáticas no início?
- Status: **DECIDIDA (2026-09-05)**
- Bloqueia: E9 (config coturn)
- Contexto: o plano ([07](../../plans/rtc/07-security-auth.md)) descreve TURN REST (credenciais
  efêmeras via HMAC) como recomendado, e credencial estática como atalho de MVP.
- Opções: **A)** efêmeras desde o início; **B)** estática no começo, migrar antes de abrir ao público.
- Recomendação do agente: A (efêmeras).
- **Decisão: A — credenciais TURN efêmeras (TURN REST) desde o início.** coturn com
  `use-auth-secret` + `static-auth-secret=<segredo TURN>`. A Control Tower gera, por conexão,
  `username = <expiryUnix>:<identity>` e `credential = base64(HMAC-SHA1(segredoTURN, username))`
  com validade curta (10 min) e os inclui em `welcome.iceServers`. Nunca há credencial fixa exposta.

### Q-12 — Faixa de portas UDP na VPS
- Status: **DECIDIDA (2026-09-05)**
- Bloqueia: E9
- Contexto: o plano sugeria UDP 40000–49999. Uma faixa menor reduz a superfície no primeiro deploy.
- Opções: **A)** 40000–49999; **B)** faixa menor (ex.: 40000–40999) para começar.
- Recomendação do agente: B.
- **Decisão: B — no primeiro deploy VPS usar UDP `40000–40999` (1000 portas, `rtcMinPort/rtcMaxPort`);
  local usa `40000–40100`.** Ampliar em direção a 49999 só se o teste de carga (E9) indicar
  esgotamento. O plano 08 foi atualizado para refletir isso.

---

## Decisões de cutover (resolver antes do E10)

### Q-13 — Nomes de env: reusar `LIVEKIT_*` ou renomear?
- Status: **DECIDIDA (2026-09-05)**
- Bloqueia: E8/E10
- Contexto: o plano ([11](../../plans/rtc/11-migration-cutover.md)) recomenda reusar `LIVEKIT_*` no
  cutover (zero mudança de código) e limpar depois.
- Opções: **A)** reusar `LIVEKIT_*` no cutover, renomear depois; **B)** já nascer com prefixo novo.
- Recomendação do agente: A.
- **Decisão: A.** No cutover, **reusar os secrets `LIVEKIT_URL` / `LIVEKIT_API_KEY` /
  `LIVEKIT_API_SECRET`** do Supabase — só repontar `LIVEKIT_URL` para a Control Tower e usar o mesmo
  `API_KEY`/`API_SECRET` nos dois lados (Edge e Control Tower). Zero mudança de código no seam.
  **PR de limpeza pós-cutover** renomeia esses três para **`CT_URL` / `CT_API_KEY` / `CT_API_SECRET`**
  em ambos os lados. **Nota:** as demais env vars internas da Control Tower (portas, `announcedIp`,
  workers, webhook URL, segredo TURN) permanecem com o prefixo **`RTC_*`** do plano — são internas
  do serviço e "RTC" é um termo técnico neutro (real-time communication), não a marca.

### Q-14 — Estratégia de canary
- Status: **DECIDIDA (2026-09-05)**
- Bloqueia: E10
- Contexto: o provedor é escolhido **por sala** (não por participante) para não misturar protocolos.
- Opções: **A)** só contas de teste; **B)** porcentagem por hash; **C)** flag global direto.
- Recomendação do agente: A → B → total.
- **Decisão: A → B → total, com o provedor fixado por sala e imutável durante a vida da sala.**
  - **Fase 1:** allowlist de contas de teste — salas dessas contas vão para a Control Tower.
  - **Fase 2:** `hash(room_name) % 100 < X` → Control Tower, aumentando `X` gradualmente.
  - **Fase 3:** 100%.
  - A cada fase, monitorar métricas e erros (doc 09) antes de avançar. Uma sala nunca troca de
    provedor no meio.

### Q-15 — Manter os dois SDKs no bundle durante a janela de rollback?
- Status: **DECIDIDA (2026-09-05)**
- Bloqueia: E8/E10
- Contexto: para rollback sem redeploy do app durante o canary.
- Opções: **A)** manter ambos no bundle; **B)** só um SDK (rollback exige redeploy).
- Recomendação do agente: A.
- **Decisão: A — durante o canary, manter `livekit-client` E `@control-tower/client` no bundle.**
  `issue-livekit-token` passa a retornar um campo **`provider: 'livekit' | 'control-tower'`**; uma
  fina camada de conexão no app instancia o SDK correspondente (a superfície é idêntica, então é só
  escolher qual módulo instanciar). Rollback = mudar o provedor no retorno do token, sem redeploy.
  O `livekit-client` é removido no **PR de limpeza pós-cutover**.

---

## Índice de bloqueio (rápido)

**Todas as 15 questões estão DECIDIDAS (2026-09-05).** Nenhum estágio está bloqueado por decisão
pendente — a trilha E0→E10 está liberada no eixo de decisões. (Bloqueios que restam são de
execução: E9 depende do provisionamento real da VPS; cada estágio ainda exige o gate do anterior verde.)

| Estágio | Decisões que o regem | Status |
|---|---|---|
| E0 | Q-01, Q-02 | ✓ liberado |
| E1 | — | ✓ liberado |
| E2 | Q-03 | ✓ liberado |
| E3 | — | ✓ liberado |
| E4 | Q-07 | ✓ liberado |
| E5 | Q-04, Q-05, Q-06, Q-07 | ✓ liberado |
| E6 | — | ✓ liberado |
| E7 | Q-08, Q-09 | ✓ liberado |
| E8 | Q-03, Q-13, Q-15 | ✓ liberado |
| E9 | Q-10, Q-11, Q-12 | ✓ decisões ok — falta provisionar VPS (fato de execução) |
| E10 | Q-13, Q-14, Q-15 | ✓ liberado |

> Regra do contrato mantida: se durante a execução surgir uma indefinição **nova** (algo não
> coberto por estas decisões, pelo plano ou pelo código do app), o agente **para e pergunta**
> (registra um novo `Q-NN`), nunca assume.

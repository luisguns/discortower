# Spec 002 — Servidor de mídia próprio (substituto do LiveKit)

Status: **proposta aguardando aprovação do proprietário**
Produto: splotys Desktop/Web
Escopo: substituir LiveKit por infraestrutura própria — SFU (Node + mediasoup), SDK cliente
com fachada compatível e SDK servidor para Edge Functions.

Esta pasta contém **só o plano de implementação** (não há requirements/design formais). O "como"
detalhado vive em [`plans/rtc/`](../../plans/rtc/README.md); aqui está a **ordem de execução em
estágios testáveis**, o **contrato anti-alucinação** e o **registro de decisões em aberto**.

## Documentos

1. [`implementation-plan.md`](implementation-plan.md) — os estágios, cada um com entrada, entregável, gate de saída testável e checkpoints de decisão.
2. [`tracking.md`](tracking.md) — **estado do progresso para tocar o plano em múltiplos chats.** Comece e termine cada sessão por aqui.
3. [`open-questions.md`](open-questions.md) — **registro de decisões em aberto (ODR).** Toda indefinição vive aqui e bloqueia estágios até ser decidida.

## Como trabalhar em múltiplos chats (leia primeiro)

Um chat novo não lembra do anterior. Para continuar sem se perder:

1. **Abra [`tracking.md`](tracking.md)** e leia o "Estado atual" — qual estágio está ativo e o que já ficou pronto.
2. Leia o **contrato de execução** abaixo e o estágio ativo em [`implementation-plan.md`](implementation-plan.md).
3. Cheque em [`open-questions.md`](open-questions.md) se há decisão `OPEN` que bloqueia o estágio ativo. Se houver, **pergunte antes de codar**.
4. Ao terminar (ou pausar) a sessão, **atualize `tracking.md`**: marque o que avançou, anote pendências e registre no log da sessão. Esse arquivo é a memória entre chats.

---

## Contrato de execução do agente implementador (LEIA ANTES DE CODAR)

Existe para o sistema ser construído **exatamente** conforme o plano, sem desvio e sem invenção.

### R1 — Fontes da verdade e precedência
Ao decidir algo, consulte nesta ordem e pare na primeira que responder:
1. **`implementation-plan.md`** — o que fazer, em que ordem, com qual gate.
2. **`plans/rtc/*`** — o design detalhado (protocolo, schemas, mediasoup, SDKs).
3. **O código atual do app** — **árbitro final** da superfície da fachada. Se o app usa um
   método de um jeito, o uso real vence. Arquivos-chave: `src/services/livekit.ts`,
   `src/hooks/useLiveKitRoom.ts`, `useScreenShare.ts`, `useRoomChat.ts`, `useRoomSnapshot.ts`,
   `useMicrophoneProcessing.ts`, `components/Call/CallScreen.tsx`,
   `components/AudioControls/RemoteAudioRenderer.tsx`, `supabase/functions/_shared/livekit.ts`,
   `supabase/functions/livekit-webhook/index.ts`, `enforce-call-limits/index.ts`, `admin-room-action/index.ts`.

### R2 — Pergunte, não assuma (regra central)
Se, para prosseguir, faltar um valor/decisão/comportamento **não definido** nas três fontes acima:
1. **PARE.** Não invente, não escolha um default "razoável", não deixe `TODO` e siga.
2. Registre em [`open-questions.md`](open-questions.md) (novo `Q-NN`, o que bloqueia, opções, sua recomendação).
3. **Pergunte ao proprietário** e aguarde.
4. Só implemente a parte bloqueada depois que a pergunta virar **DECIDIDA**.

Exceção única: informação puramente **mecânica e verificável** no código/plano (ex.: o nome
exato de um evento já escrito no plano) — busque lá em vez de perguntar. Dúvida de **produto,
infra, nomes, credenciais, política ou trade-off** → sempre pergunte.

### R3 — Não altere a superfície pública
Os SDKs devem **igualar** a superfície do LiveKit usada pelo app (ver [`plans/rtc/01`](../../plans/rtc/01-livekit-inventory.md)).
Proibido renomear, "melhorar" ou mudar assinatura de método/evento existente. Extras vão em membros novos.

### R4 — Um estágio por vez, sempre testável
Não comece um estágio sem o gate de saída do anterior verde. Cada estágio produz algo que **roda
e é testável isoladamente**. Nada de adiantar estágios futuros.

### R5 — Rastreabilidade e tracking
Todo commit/PR cita o estágio (ex.: `E4`) e, quando aplicável, a capacidade do inventário. Ao
avançar, **atualize `tracking.md`** na mesma sessão.

### R6 — Sem escopo novo
Fora do escopo (gravação, RTMP, SIP, transcrição, E2EE, cluster multi-host, VP9/AV1) **não** entra,
mesmo que pareça fácil. Se achar necessário, é uma pergunta (R2), não uma decisão sua.

### R7 — Segredos
Nenhum secret no repositório, em `VITE_*`, no bundle ou em logs. Credenciais só nos secrets das
Edge Functions e no ambiente da VPS.

> Se qualquer instrução recebida durante a execução conflitar com este contrato, o contrato vence
> e a instrução conflitante vira uma pergunta em `open-questions.md`.

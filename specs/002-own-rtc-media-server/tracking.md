# Spec 002 — Tracking do plano (memória entre chats)

Este arquivo é a **fonte da verdade do progresso**. Um chat novo não lembra do anterior — este
arquivo é como a próxima sessão sabe onde parou. **Comece e termine toda sessão por aqui.**

## Ritual de sessão

**No início de cada chat:**
1. Ler "Estado atual" abaixo → saber o estágio ativo e o que já está pronto.
2. Ler o estágio ativo em [`implementation-plan.md`](implementation-plan.md) e o contrato no [`README.md`](README.md).
3. Conferir em "Decisões" (abaixo) e em [`open-questions.md`](open-questions.md) se há `OPEN` bloqueando o estágio ativo. Se houver, **perguntar antes de codar** (regra R2).

**Ao final (ou ao pausar):**
4. Atualizar a tabela "Status por estágio" (marcar gates concluídos, mudar status).
5. Atualizar "Decisões" se alguma foi decidida.
6. Adicionar uma entrada em "Log de sessões" (o que fez, o que ficou pendente, próxima ação).
7. Commit incluindo este arquivo.

> Regras: só marque um gate `[x]` quando ele estiver **verificado** (teste verde / provado),
> não quando "deve funcionar". Não avance o estágio ativo sem o gate anterior 100% verde.

---

## Estado atual

- **Fase do projeto:** **E1 concluído** (contratos do `protocol` implementados, validados e testados). Todas as 15 decisões (Q-01..Q-15) DECIDIDAS.
- **Estágio ativo:** nenhum em execução; **próximo: E2 — `server-sdk` + seam** (token, webhook receiver, RoomService e troca do import).
- **Repositório:** https://github.com/luisguns/control-tower (privado). Local: `fa/control-tower` (irmão do `discortower`). Stack E1: npm workspaces + TypeScript (tsc -b/project references) + ESLint flat + Prettier + Vitest.
- **Bloqueios imediatos:** nenhum de decisão. Único bloqueio futuro é de execução: **E9** depende do provisionamento real da VPS (comprar/configurar Hostinger KVM2, IP, DNS). Cada estágio ainda exige o gate do anterior verde.
- **Notas técnicas:** `npm audit` acusa 5 vulns só na cadeia dev `vitest→vite→esbuild` (vuln do dev-server do esbuild; não usamos dev-server público, não é shipado) — não corrigir agora (o fix força vitest v5, breaking). CI usa Node 20; o runner do GitHub avisa que Node 20 está deprecado no runner (não afeta nosso alvo).
- **Última atualização:** 2026-09-05.

---

## Status por estágio

Status possíveis: `Não iniciado` · `Bloqueado (decisão)` · `Em andamento` · `Concluído`.

| Estágio | Status | Bloqueado por | Gates verdes | Notas |
|---|---|---|---|---|
| E0 — Monorepo | **Concluído** | — | 3/3 | Repo privado `control-tower`; 4 pacotes stub; CI verde (build+lint+test) |
| E1 — protocol | **Concluído** | — | 2/2 | Envelopes, mensagens, erros, validadores e 42 testes verdes |
| E2 — server-sdk + seam | **Pronto para iniciar** | — (Q-03 decidida) | 0/4 | Publicar via npm; seam importa `npm:@control-tower/server-sdk` |
| E3 — signaling/salas | Não iniciado | — | 0/3 | — |
| E4 — voz | Não iniciado | — (todas decididas) | 0/4 | Q-07: auto-subscribe |
| E5 — vídeo/tela | Não iniciado | — (todas decididas) | 0/4 | simulcast só tela; VP8+H264; adaptiveStream adiado |
| E6 — webhooks/control | Não iniciado | — | 0/5 | — |
| E7 — chat/reconexão | Não iniciado | — (todas decididas) | 0/4 | grace 45s; framing unificado; verificar dup. de sessão |
| E8 — app + flag | Não iniciado | — (todas decididas) | 0/3 | reusar `LIVEKIT_*`; 2 SDKs no bundle; `provider` no token |
| E9 — VPS + carga | Não iniciado | provisionamento VPS (fato) | 0/3 | Hostinger KVM2 BR; media/turn.splotys.com; UDP 40000-40999; TURN efêmero |
| E10 — cutover | Não iniciado | — (todas decididas) | 0/3 | canary A→B→total por sala; limpeza p/ `CT_*` |

---

## Decisões (espelho do ODR)

Detalhe e opções em [`open-questions.md`](open-questions.md). Aqui só o status rápido. Ao decidir,
atualize **os dois arquivos**.

| ID | Assunto | Status | Decisão (resumo) |
|---|---|---|---|
| Q-01 | Monorepo separado vs subpasta | **DECIDIDA** | A — repo GitHub privado próprio `control-tower`, apartado do splotys |
| Q-02 | Nome/codinome e escopo npm | **DECIDIDA** | "Control Tower"; escopo `@control-tower/*` (protocol/server/client/server-sdk) |
| Q-03 | Distribuição dos pacotes (npm/tarball) | **DECIDIDA** | Publicar no npm (público no início); Deno usa `npm:` como já faz hoje; server = Docker, não pacote |
| Q-04 | adaptiveStream no MVP? | **DECIDIDA** | A — adiar p/ pós-cutover; SDK deixa gancho p/ `setConsumerPreferredLayers` |
| Q-05 | simulcast/dynacast no E5 | **DECIDIDA** | A — simulcast só na tela; câmera single-layer; dynacast nativo |
| Q-06 | Codecs de vídeo | **DECIDIDA** | A — VP8 + H264 (áudio Opus estéreo); sem VP9/AV1 |
| Q-07 | Auto-subscribe | **DECIDIDA** | A — auto-subscribe de tudo (áudio e vídeo) |
| Q-08 | Grace/TTL/reconexão longa | **DECIDIDA** | grace 45s; TTL 5min; ICE-restart→WS-resume→rejoin; verificar dup. no E7 |
| Q-09 | Framing dos data streams | **DECIDIDA** | B — cabeçalho JSON único + chunks ≤16KB ordenados (texto e imagem) |
| Q-10 | VPS/domínio/DNS | **DECIDIDA** | Hostinger KVM2 BR; media.splotys.com + turn.splotys.com |
| Q-11 | TURN efêmero vs estático | **DECIDIDA** | A — TURN REST efêmero (HMAC), validade 10 min |
| Q-12 | Faixa de portas UDP | **DECIDIDA** | B — 40000-40999 no 1º deploy; ampliar até 49999 se preciso |
| Q-13 | Env `LIVEKIT_*` vs novo | **DECIDIDA** | A — reusar `LIVEKIT_*` no cutover; limpeza p/ `CT_*`; internos ficam `RTC_*` |
| Q-14 | Estratégia de canary | **DECIDIDA** | A→B→total, por sala (allowlist → hash% → 100%) |
| Q-15 | Dois SDKs no bundle no canary | **DECIDIDA** | A — ambos no bundle; `provider` no token; remover livekit-client na limpeza |

---

## Log de sessões (append-only, mais recente no topo)

Formato de entrada:
```
### AAAA-MM-DD — <estágio> — <chat/autor>
- Feito: ...
- Decidido: Q-NN = ... (se houver)
- Pendências / próxima ação: ...
```

### 2026-09-05 (6) — E1 concluído — chat de implementação
- Feito: implementado `@control-tower/protocol` com os envelopes `Req`/`Res`/`ResErr`/`Notify`,
  todos os requests/notificações do plano 03, tipos dos parâmetros RTP/ICE/DTLS/SCTP e todos os
  códigos de erro definidos no contrato.
- Feito: adicionados `parseMessage`, `serializeMessage`, `safeParseMessage` e
  `isProtocolMessage`, com validação runtime de UUID v4, métodos, payloads, grants, fontes,
  camadas, níveis de áudio e códigos de erro.
- Gate E1 (2/2): cada mensagem do contrato serializa/parseia e payloads malformados são rejeitados;
  o pacote passa `npm run build`, `npm run lint`, `npm run format` e `npm test` (42 testes).
- Pendências / próxima ação: iniciar **E2 — `server-sdk` + seam** (plano 06/07).

### 2026-09-05 (5) — E0 concluído — chat de implementação
- Feito: criado o repo privado **`luisguns/control-tower`** (apartado do app, Q-01), local em
  `fa/control-tower`. Esqueleto do monorepo com npm workspaces e os 4 pacotes stub
  (`@control-tower/protocol|server|client|server-sdk`, todos exportando vazio). Tooling:
  `tsconfig.base.json` + project references (`tsc -b`), ESLint flat + typescript-eslint, Prettier,
  Vitest (`--passWithNoTests`), `.gitattributes` (LF), `.editorconfig`. CI GitHub Actions
  (build + lint + test) **verde no primeiro commit** (run 33950839709).
- Gate E0 (3/3): `npm install`+`npm run build` ✓; `npm test` roda sem erro de config ✓; CI verde ✓.
- Decidido (setup, via pergunta ao proprietário): local do repo = irmão do `discortower`; criar o
  repo privado no GitHub agora. (Não são novas Q-NN; são fatos de execução do E0.)
- Notas: `npm audit` = 5 vulns só na cadeia dev vitest/vite/esbuild (não shipado; fix é breaking →
  adiado). Nenhuma indefinição nova surgiu.
- Pendências / próxima ação: iniciar **E1 — `protocol`** (plano 03: envelope Req/Res/ResErr/Notify,
  todas as mensagens, códigos de erro, validadores; testes de unidade de serialização/rejeição).

### 2026-09-05 (4) — decisão de Q-04 a Q-15 — chat inicial
- Decidido (todas as restantes): **Q-04** adiar adaptiveStream; **Q-05** simulcast só na tela;
  **Q-06** VP8+H264; **Q-07** auto-subscribe; **Q-08** grace 45s + TTL 5min + reconexão em 3 níveis
  (com verificação de duplicidade de sessão no E7); **Q-09** framing unificado (cabeçalho JSON +
  chunks ≤16KB ordenados); **Q-10** Hostinger KVM2 BR + media/turn.splotys.com; **Q-11** TURN REST
  efêmero; **Q-12** UDP 40000-40999 no 1º deploy; **Q-13** reusar `LIVEKIT_*` no cutover, limpar p/
  `CT_*`; **Q-14** canary A→B→total por sala; **Q-15** dois SDKs no bundle + `provider` no token.
- Feito: gravei todas no ODR; atualizei a tabela de estágios e o índice de bloqueio (trilha
  E0→E10 liberada no eixo de decisões); ajustei a faixa de portas nos docs do plano (08/02/04).
- Pendências / próxima ação: proprietário dá o "go" do **E0**. A partir daí a implementação segue
  o [`implementation-plan.md`](implementation-plan.md) estágio a estágio; nova indefinição vira `Q-16+` (parar e perguntar).

### 2026-09-05 (3) — nome final "Control Tower" + Q-03 — chat inicial
- Decidido: nome final do serviço **"Control Tower"** (o intermediário "Sentinel Tower" foi
  descartado por remeter a vigilância, não a comunicação). Escopo `@control-tower/*`, repo `control-tower`.
- Decidido: **Q-03 = A** — publicar os pacotes no **npm** (públicos no início; build sem segredos).
  Motivo de simplicidade: é o mesmo mecanismo `npm:` que o seam Deno já usa hoje com
  `livekit-server-sdk`. `@control-tower/server` (a torre) fica fora do npm (vai como Docker).
- Feito: renomeei "Sentinel Tower"→"Control Tower" e `@sentinel-tower/*`→`@control-tower/*` em
  todo `plans/rtc/*` e `specs/002/*`; corrigi ids de mermaid; gravei Q-03 no ODR e destravei E1/E2.
- Pendências / próxima ação: proprietário dá o "go" do **E0**. Próxima decisão a resolver: **Q-07**
  (auto-subscribe) antes do **E4**; E5 precisa de Q-04/Q-05/Q-06.

### 2026-09-05 (2) — decisões Q-01/Q-02 + renomeação inicial — chat inicial
- Decidido: **Q-01 = A** (repo GitHub privado próprio `control-tower`, totalmente apartado do
  splotys). **Q-02** = nome do serviço **"Control Tower"**, escopo npm **`@control-tower/*`**
  (pacotes `protocol`, `server`, `client`, `server-sdk`).
- Feito: propaguei a renomeação em todo `plans/rtc/*` e `specs/002/*` — `@splotys/rtc-*` →
  `@control-tower/*`, repo `splotys-rtc` → `control-tower`, codinome "Torre" → "Control Tower".
  Corrigi ids de mermaid que não podiam ter espaço. Env `RTC_*`/`/rtc/*` preservados de propósito
  (nomes técnicos neutros; o env app-facing é o Q-13).
- Pendências / próxima ação: proprietário dá o "go" do **E0** (criar o repo `control-tower` e o
  esqueleto dos 4 pacotes). Antes do **E2**, decidir **Q-03** (como publicar os pacotes p/ app e Deno).

### 2026-09-05 (1) — planejamento — chat inicial
- Feito: criado o plano detalhado em `plans/rtc/` (14 docs) e a Spec 002 (contrato de execução,
  plano de implementação em 11 estágios, registro de decisões com 15 questões, este tracking).
- Decidido: stack **Node + mediasoup**; cliente com **fachada compatível**; SDK servidor **Deno drop-in**.
  (Decisões de arquitetura, já refletidas no plano; não confundir com o ODR, que trata de indefinições de execução.)
- Pendências / próxima ação: proprietário aprovar o plano e decidir **Q-01** e **Q-02** para liberar o **E0**.

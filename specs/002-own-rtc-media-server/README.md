# Spec 002 — Servidor de mídia próprio (Control Tower) — movida

A Spec 002 (plano de implementação por estágios, contrato anti-alucinação, registro de decisões
`open-questions`, `tracking` e `smoke-tests`) foi **movida para o repositório do Control Tower**
em 2026-09-06 e agora vive lá:

- Repo: **`github.com/luisguns/control-tower`**
- Caminho: **`specs/002-own-rtc-media-server/`** (e o plano detalhado em `plans/rtc/`)

**Trabalhe a partir do repo `control-tower`.** Comece cada sessão pelo `tracking.md` de lá.

Este app (`discortower` / splotys) permanece o **árbitro final** da superfície da fachada
(uso real em `src/services/livekit.ts`, `src/hooks/*`, `supabase/functions/_shared/livekit.ts` e
demais consumidores), conforme o R1 do contrato.

> Não edite a spec aqui. Toda mudança acontece no repo `control-tower`.

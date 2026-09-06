# Plano RTC (Control Tower) — movido

O plano detalhado do RTC/Control Tower (docs 00–13) foi **movido para o repositório do
Control Tower** em 2026-09-06 e agora vive lá:

- Repo: **`github.com/luisguns/control-tower`**
- Caminho: **`plans/rtc/`**

Este app (`discortower` / splotys) continua sendo o **árbitro final** da superfície da fachada
(hooks e serviços em `src/`, seam em `supabase/functions/_shared/livekit.ts`), conforme o
contrato R1 da Spec 002 — que também foi movida (ver [`specs/002-own-rtc-media-server/README.md`](../../specs/002-own-rtc-media-server/README.md)).

> Não edite o plano aqui. Toda mudança acontece no repo `control-tower`.

# Spec 004 — Benchmark Control-tower e splotys

A spec canônica, resultados e ferramentas estão no repositório privado Control-tower:

- [Spec e resultados](https://github.com/luisguns/control-tower/tree/main/specs/004-control-tower-benchmark).
- [Harness reproduzível](https://github.com/luisguns/control-tower/tree/main/scripts/benchmark).
- Checkout local irmão: `../control-tower/specs/004-control-tower-benchmark/README.md`.

Escopo: performance, banda/dados, processamento, áudio/vídeo, custo da VPS própria e segurança.
Inclui hipóteses, propostas priorizadas e testes antes/depois para cada melhoria futura.
O proprietário autorizou liberdade de arquitetura e bibliotecas confiáveis e gratuitas.

Estado em 2026-09-08: benchmark sintético local/remoto e auditoria inicial registrados;
qualificação prolongada, redes adversas e diagnóstico com áudio humano ainda pendentes.
As melhorias do produto serão implementadas depois. LiveKit permanece disponível e a
remoção prevista no E10 da spec 002 depende dos gates registrados na nova spec.

Detalhes de segurança e evidências operacionais ficam na fonte privada. A spec 003 do app
continua responsável pela proposta de observabilidade persistente; esta spec define os
experimentos e critérios de validação, sem instalar agentes ou alertas.

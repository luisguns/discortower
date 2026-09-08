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
O pacote 0/1/2 está implementado localmente: correções de lifecycle/reconexão, dados,
segurança e diagnóstico local de áudio. Testes/evidências e gates pendentes estão em
`../control-tower/specs/004-control-tower-benchmark/package-012.md`. A subida será conjunta.
O pacote 3/4/5 acrescenta mute local real, pausa de recepção, qualidade por demanda,
preferências preservadas na recuperação e perfis de voz experimentais. Evidências e
limitações estão em `../control-tower/specs/004-control-tower-benchmark/package-345.md`.
Após as duas escutas aprovadas pelo proprietário, o app usa `speech32` por padrão,
com `standard` disponível para rollback; não houve publicação.
O pacote 6/7/8 reduz a cadência e os roundtrips de presença/token, carrega LiveKit
sob demanda e acrescenta imagem mínima, admissão por capacidade e hardening de TURN.
Resultados locais e gates remotos pendentes estão em
`../control-tower/specs/004-control-tower-benchmark/package-678.md`.
LiveKit permanece disponível e a
remoção prevista no E10 da spec 002 depende dos gates registrados na nova spec.

Detalhes de segurança e evidências operacionais ficam na fonte privada. A spec 003 do app
continua responsável pela proposta de observabilidade persistente; esta spec define os
experimentos e critérios de validação, sem instalar agentes ou alertas.

# Roadmap de infraestrutura de chamadas

Atualizado em: 30 de agosto de 2026

## Objetivo

Reduzir ou eliminar o custo do transporte de voz, câmera, compartilhamento de tela e dados em tempo real do DiscorTower sem reimplementar uma infraestrutura WebRTC completa.

A estratégia proposta é continuar usando o servidor e os SDKs open source do LiveKit, mas substituir o LiveKit Cloud por uma instalação administrada por nós em uma VPS.

## Decisão inicial

O **Hostinger KVM 2 em datacenter brasileiro** é o provedor e plano preferido para a primeira instalação de produção.

Configuração anunciada em 30 de agosto de 2026:

- 2 vCPU;
- 8 GB de RAM;
- 100 GB de armazenamento NVMe;
- 8 TB de tráfego mensal;
- conexão de até 1 Gbps;
- IPv4 dedicado;
- acesso root;
- suporte a Docker Compose;
- firewall configurável com intervalos de portas TCP e UDP;
- proteção contra DDoS e backup semanal;
- localização disponível no Brasil.

Preço anunciado:

- valor promocional equivalente a R$ 42,99 por mês;
- renovação anunciada a R$ 77,99 por mês por dois anos;
- o período contratado é pago antecipadamente e o prazo e o total exatos devem ser conferidos no checkout.

O KVM 2 foi preferido ao KVM 1 porque um único vCPU deixaria pouca margem para múltiplas publicações de vídeo, compartilhamento de tela, TURN e picos do SFU. O KVM 4 será considerado se os testes indicarem falta de CPU ou se for necessário suportar várias salas com vídeo simultaneamente.

## Alternativas pesquisadas

| Alternativa | Configuração de referência | Localização | Avaliação inicial |
| --- | --- | --- | --- |
| Oracle Always Free | até 2 OCPUs ARM e 12 GB de RAM no nível gratuito atual | São Paulo ou Vinhedo | Boa para prova de conceito, mas sem SLA, sujeita a falta de capacidade e recuperação de instâncias ociosas |
| Hostinger KVM 1 | 1 vCPU, 4 GB, 4 TB | Brasil | Mais barato, mas com pouca margem de CPU para produção |
| Hostinger KVM 4 | 4 vCPU, 16 GB, 16 TB | Brasil | Caminho de upgrade para múltiplas salas ou cargas de vídeo maiores |
| Vultr | Planos mensais com presença em São Paulo | São Paulo | Flexível, porém mais caro na configuração comparável |
| DigitalOcean | 2 vCPU, 4 GB e 4 TB por US$ 24/mês | Sem região brasileira | Simples de operar, mas sem vantagem de custo ou latência para este projeto |
| Hetzner | VPS com boa relação entre CPU, RAM e tráfego | EUA ou Europa | Barato, mas a distância aumenta a latência para usuários brasileiros |

## Compatibilidade com o projeto atual

O DiscorTower já usa interfaces compatíveis com LiveKit self-hosted:

- `livekit-client` no frontend;
- `livekit-server-sdk` nas Supabase Edge Functions;
- tokens de participante emitidos no servidor;
- URL do LiveKit retornada dinamicamente ao cliente;
- Room Service API para moderação e encerramento de salas;
- webhooks assinados para presença e estado das calls;
- tracks de microfone, câmera, tela, áudio da tela e dados.

Por isso, a migração não deve exigir uma reescrita da experiência de chamada. A maior parte do trabalho estará no provisionamento, DNS, firewall, observabilidade e troca dos secrets `LIVEKIT_URL`, `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET` no Supabase.

## Requisitos de rede

A instalação oficial em VM usa LiveKit, Redis e Caddy com certificados TLS automáticos. A VPS precisa permitir, no mínimo:

| Porta | Protocolo | Finalidade |
| --- | --- | --- |
| 80 | TCP | Emissão e renovação de certificados TLS |
| 443 | TCP | HTTPS, WebSocket seguro e TURN/TLS |
| 7881 | TCP | WebRTC sobre TCP |
| 3478 | UDP | TURN sobre UDP |
| 50000–60000 | UDP | Mídia WebRTC sobre UDP |

Subdomínios previstos:

- `livekit.<domínio>` para signaling e API;
- `turn.<domínio>` para TURN/TLS.

O firewall gerenciado da Hostinger aceita regras UDP com intervalos de portas, portanto é compatível com a faixa exigida pelo LiveKit.

## Capacidade e limites iniciais

O custo de um SFU cresce principalmente com:

- quantidade de tracks publicadas;
- quantidade de assinantes por track;
- bitrate efetivamente encaminhado;
- uso de TURN quando conexões diretas UDP não são possíveis.

Estimativa ilustrativa de tráfego de saída:

- uma tela a 720p e aproximadamente 1,5 Mbps para quatro espectadores: cerca de 2,7 GB por hora;
- uma tela a 1080p e aproximadamente 3 Mbps para quatro espectadores: cerca de 5,4 GB por hora.

Com 8 TB mensais, o tráfego tende a ser suficiente para o uso pessoal previsto. CPU, qualidade da rede e número de salas simultâneas provavelmente serão os primeiros limites.

O banco atualmente permite até cinco calls ativas. Para o primeiro deploy no KVM 2, a recomendação é limitar temporariamente a uma ou duas calls simultâneas, manter 720p30 como padrão e liberar 1080p somente após os testes de carga.

A Hostinger informa que uso contínuo de 100% de CPU por mais de 180 minutos pode resultar em limitação automática. A instalação deverá alertar antes de atingir esse cenário.

## Plano de execução proposto

1. Confirmar no checkout a disponibilidade do datacenter brasileiro, o prazo contratado, o valor total, o preço de renovação e a política de reembolso.
2. Provisionar Ubuntu LTS no Hostinger KVM 2.
3. Apontar os subdomínios de LiveKit e TURN para o IPv4 da VPS.
4. Gerar a configuração oficial para VM e instalar LiveKit, Redis e Caddy via Docker Compose.
5. Configurar firewall no painel da Hostinger e no sistema operacional.
6. Configurar os webhooks assinados para a Edge Function existente.
7. Atualizar os secrets do Supabase.
8. Executar testes funcionais com voz, câmera, tela, áudio do sistema, chat, kick, encerramento e reconexão.
9. Executar `lk load-test` e testes reais progressivos com 3, 5 e 8 participantes.
10. Medir CPU, memória, tráfego, perda de pacotes, RTT, jitter, uso de TURN e estabilidade durante pelo menos uma semana.
11. Decidir entre manter o KVM 2 ou subir para o KVM 4.

## Pesquisa ainda pendente

- confirmar se a localização Brasil está disponível no momento da compra;
- confirmar impostos e valor total no checkout;
- verificar política de reembolso aplicável ao VPS após uso e provisionamento;
- confirmar limites de quantidade de regras do firewall gerenciado;
- pesquisar SLA e histórico de incidentes da região brasileira;
- medir rota e latência a partir das cidades dos participantes;
- comparar custo mensal sem compromisso de longo prazo;
- confirmar processo de upgrade e se ele preserva IP e disco;
- definir monitoramento, alertas, backup das configurações e procedimento de recuperação;
- estimar capacidade com o padrão real de câmera e tela do DiscorTower;
- avaliar um servidor TURN externo de contingência;
- preparar plano de retorno temporário ao LiveKit Cloud em caso de falha da VPS.

## Fontes

- [Planos VPS da Hostinger](https://www.hostinger.com/br/servidor-vps)
- [VPS da Hostinger no Brasil](https://www.hostinger.com/vps/servers/brazil)
- [Firewall gerenciado da Hostinger](https://www.hostinger.com/support/8172641-how-to-use-a-managed-vps-firewall-at-hostinger/)
- [Limite mensal de tráfego da Hostinger](https://www.hostinger.com/support/8789965-what-happens-if-your-vps-bandwidth-resource-limits-are-exceeded/)
- [Política de uso de CPU da Hostinger](https://www.hostinger.com/br/support/6899741-o-que-e-o-limite-de-uso-da-cpu-na-vps-na-hostinger/)
- [Deploy do LiveKit em máquina virtual](https://docs.livekit.io/transport/self-hosting/vm/)
- [Benchmark e ferramenta de teste do LiveKit](https://docs.livekit.io/transport/self-hosting/benchmark/)
- [Recursos Always Free da Oracle](https://docs.oracle.com/pt-br/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [Imagem Docker oficial do LiveKit](https://hub.docker.com/r/livekit/livekit-server/tags)


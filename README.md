# Ford Kall

Call privada de voz e compartilhamento de tela entre amigos, com uma experiência compacta inspirada em ferramentas de voice chat e streaming. A V1 não possui cadastro, banco de dados ou backend próprio: pessoas que informam o mesmo código entram na mesma sala do LiveKit.

## O que já funciona

- lobby sem cadastro, com nome persistido no navegador e código de sala normalizado;
- links de convite no formato `?room=KIWI-123`, com sala preenchida automaticamente;
- chamada de voz, câmera e indicador de participante falando;
- lobby visual com cartões, iniciais e vídeos dos participantes;
- volume local e mute independente para o microfone de cada participante;
- deafen local sem perder os volumes individuais;
- screen share com vídeo e captura de áudio quando o navegador fornece a track;
- volume da transmissão separado do volume do microfone de quem transmite;
- seleção entre múltiplas transmissões simultâneas;
- Picture-in-Picture da transmissão selecionada;
- seleção de microfone e saídas separadas para voz/live quando `setSinkId` é suportado;
- presets 720p30, 1080p30 e 1080p60;
- tratamento de autoplay, reconexão, permissão negada e cleanup de tracks;
- layout responsivo para desktop, tablet e celular;
- deploy estático em GitHub Pages por GitHub Actions.

## Stack

- React 19 + TypeScript
- Vite
- `livekit-client`
- CSS próprio
- LiveKit Cloud
- GitHub Pages + GitHub Actions

## Requisitos

- Node.js 22 ou mais recente
- npm
- um projeto no [LiveKit Cloud](https://cloud.livekit.io/)
- Chrome ou Edge desktop (recomendados para screen share com áudio)

## Configuração do LiveKit

O projeto usa o **Development Token Server** hospedado pelo LiveKit Cloud. Ele gera credenciais temporárias sem exigir um backend neste protótipo.

1. Abra o projeto no LiveKit Cloud.
2. Vá a **Settings → Token server**.
3. Ative o Token server e copie o ID exibido.
4. Copie o arquivo de exemplo:

```bash
cp .env.example .env.local
```

5. Preencha o valor:

```env
VITE_LIVEKIT_TOKEN_SERVER_ID=token-server-xxxxxxxx
```

Consulte a [documentação oficial do Token server](https://docs.livekit.io/frontends/build/authentication/sandbox-token-server/) para localizar e habilitar a configuração.

> O Development Token Server é adequado somente para desenvolvimento, testes e protótipos privados. Qualquer frontend pode solicitar tokens sem restrições. Antes de uso público, substitua-o por um endpoint de autenticação real.

O ID do Token server não é segredo. Nunca adicione `LIVEKIT_API_KEY` ou `LIVEKIT_API_SECRET` ao frontend, a arquivos `VITE_*` ou ao workflow.

## Rodando localmente

```bash
npm install
npm run dev
```

Abra o endereço mostrado pelo Vite, normalmente `http://localhost:5173`.

Para validar o fluxo realtime, abra duas janelas/perfis de navegador, use nomes diferentes e informe o mesmo código de sala. Para compartilhar áudio, prefira uma aba do Chrome/Edge e marque **Compartilhar áudio da guia**.

## Qualidade e franquia do LiveKit

A resolução não é puramente local. Resolução, FPS, câmeras, transmissões simultâneas e número de espectadores aumentam os dados enviados pelo LiveKit. O preset 720p30 é o mais econômico; 1080p30 equilibra nitidez e consumo; 1080p60 deve ficar reservado para conteúdo em movimento.

No plano Build gratuito, os limites são compartilhados pelos projetos gratuitos da conta e funcionam como hard cap: ao atingir a franquia, novas solicitações falham em vez de gerar cobrança automática. Consulte [quotas e limites](https://docs.livekit.io/deploy/admin/quotas-and-limits/) e o [guia oficial de estimativa](https://livekit.io/field-guides/guide/estimating-pricing-video-conference-livestream).

## Validação e build

```bash
npm run typecheck
npm run build
npm run preview
```

O build estático é gerado em `dist/`.

## Deploy no GitHub Pages

O workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) executa em todo push para `main`:

```text
npm ci → npm run build → upload-pages-artifact → deploy-pages
```

Antes do primeiro deploy:

1. Em **Settings → Pages**, selecione **GitHub Actions** como Source.
2. Em **Settings → Secrets and variables → Actions → Variables**, crie a variável de repositório `VITE_LIVEKIT_TOKEN_SERVER_ID`.
3. Confirme o domínio customizado `fordkall.11a3.dev` em **Settings → Pages**.

O arquivo `public/CNAME` preserva o domínio customizado no artefato. A aplicação é uma SPA sem rotas reais e o Vite usa `base: '/'`, portanto não depende de fallback de servidor.

## Limitações conhecidas da V1

- o código da sala não é autenticação e qualquer string válida cria/seleciona uma room;
- não há chat ou persistência de sala;
- captura de áudio do desktop/tela depende do sistema operacional e do navegador;
- conteúdo protegido por DRM pode bloquear vídeo ou áudio e não é contornado;
- Safari e Firefox podem não permitir seleção de saída ou captura de áudio do screen share.
- Picture-in-Picture depende do suporte do navegador.

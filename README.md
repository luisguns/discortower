# DiscorTower

Call privada de voz e compartilhamento de tela entre amigos, com contas acessíveis por convite e autorização server-side para as salas LiveKit.

## O que já funciona

- lobby autenticado, com nome persistido no navegador e lista de canais salvos;
- links de canal no formato `?channel=<uuid>`, com seleção preenchida automaticamente;
- criação de canal persistente para proprietário, gerente e host;
- chamada de voz, câmera e indicador de participante falando;
- galeria responsiva com modos locais `Preencher` (até 4:3) e `Priorizar 16:9`, incluindo três participantes do mesmo tamanho;
- drawer de participantes fechado por padrão e menu contextual no clique ou botão direito;
- volume local de 0% a 400% e mute independente para voz e transmissão;
- deafen local sem perder os volumes individuais;
- supressão de ruído WebRTC opcional para o microfone;
- screen share com vídeo, captura de áudio e proteção anti-retorno quando o navegador oferece suporte;
- volume da transmissão separado do volume do microfone de quem transmite;
- seleção entre múltiplas transmissões simultâneas;
- chat realtime de texto e imagens de até 4 MB durante a call;
- Picture-in-Picture da transmissão selecionada;
- janela separada, redimensionável e encaixável no desktop para a transmissão selecionada;
- seleção persistente de microfone e webcam, além de saídas separadas para voz/live quando `setSinkId` é suportado;
- presets 720p30, 1080p30 e 1080p60;
- tratamento de autoplay, reconexão, permissão negada e cleanup de tracks;
- layout responsivo para desktop, tablet e celular;
- deploy estático em GitHub Pages por GitHub Actions.
- autenticação Supabase por convite, perfil protegido e logout que encerra a call;
- painel administrativo embutido para usuários, convites, calls e participantes;
- canais persistentes com papéis de proprietário, gerente, host e membro;
- limites de concorrência, participantes, duração e kick automático para chamadas solitárias;
- política de tela 720p30 para membros com fiscalização server-side de resoluções acima do limite;
- emissão de token LiveKit por Edge Function autenticada, com TTL curto;
- aplicativo Windows baseado em Electron, com instalador e executável portátil;
- seletor desktop próprio de telas/janelas, captura opcional do áudio do sistema e deep link `fordkall://`;
- bandeja do sistema e modo de fundo que mantém a voz, suspende vídeos e reduz atualizações visuais enquanto o app está minimizado.
- central de configurações por seções, com atalhos opcionais para microfone, deafen, câmera, tela e saída;
- atalhos locais no navegador e globais no aplicativo Windows, inclusive com um jogo em foco;
- atualização do aplicativo instalado por releases do GitHub, com download, instalação e reinício dentro do DiscorTower.

## Stack

- React 19 + TypeScript
- Vite
- `livekit-client`
- CSS próprio
- LiveKit Cloud
- Supabase Auth, Postgres, RLS, Realtime e Edge Functions
- GitHub Pages + GitHub Actions
- Electron + electron-builder (Windows)

## Requisitos

- Node.js 22 ou mais recente
- npm
- um projeto no [Supabase](https://supabase.com/) e um projeto no [LiveKit Cloud](https://cloud.livekit.io/)
- Chrome ou Edge desktop (recomendados para screen share com áudio)

## Configuração do Supabase e LiveKit

O fluxo de produção não usa o Development Token Server. O cliente recebe somente a URL e a chave pública do Supabase; as credenciais administrativas Supabase/LiveKit ficam nos secrets das Edge Functions.

1. Crie o projeto Supabase, desabilite o cadastro público e aplique a migration em `supabase/migrations/`.
2. Convide o proprietário pelo Dashboard, confirme a conta e insira o UUID dele em `public.admin_users` pelo SQL Editor. O e-mail e o UUID não entram no repositório.
3. Configure o redirect `fordkall://auth/callback` no Supabase Auth para o aplicativo Desktop.
4. Configure `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `SECRET_KEY`, `DESKTOP_INVITE_REDIRECT_URL` e `FUNCTION_ALLOWED_ORIGINS` nos secrets do Supabase. `INVITE_REDIRECT_URL` só é necessário se convites Web forem habilitados. Veja `supabase/README.md`.
5. Faça o deploy das funções em `supabase/functions/` e configure o webhook assinado do LiveKit para `livekit-webhook`.
6. Copie o arquivo de exemplo:

```bash
cp .env.example .env.local
```

7. Preencha apenas as variáveis públicas:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
VITE_SUPABASE_AUTH_REDIRECT_URL=https://<dominio-web>/
```

Nunca adicione `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `SECRET_KEY`, `SUPABASE_SECRET_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` ao frontend, a arquivos `VITE_*` ou ao workflow.

## Rodando localmente

```bash
npm install
npm run dev
```

Abra o endereço mostrado pelo Vite, normalmente `http://localhost:5173`.

Para validar o fluxo realtime, abra duas janelas/perfis de navegador, use nomes diferentes e entre no mesmo canal salvo. Para compartilhar áudio, prefira uma aba do Chrome/Edge e marque **Compartilhar áudio da guia**.

No Chrome/Edge, a captura solicita `restrictOwnAudio` para evitar que o áudio da própria call volte pela transmissão. Como essa proteção depende do navegador, fones de ouvido continuam sendo a opção mais segura ao compartilhar áudio do sistema.

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

## Aplicativo Windows

Para testar o Electron durante o desenvolvimento:

```bash
npm run desktop:dev
```

Para gerar o instalador assistido e o executável portátil de Windows x64:

```bash
npm run desktop:dist:windows
```

Os artefatos são gerados em `release/`:

- `DiscorTower-Setup-<versão>-x64.exe`: instalador com atalhos no Desktop e menu Iniciar;
- `DiscorTower-Portable-<versão>-x64.exe`: versão que roda sem instalação.

O aplicativo carrega o frontend empacotado localmente e continua usando o LiveKit Cloud para a call. Ao fechar a janela durante uma call, ele permanece na bandeja do Windows; **Sair do DiscorTower** no menu do ícone encerra de fato o processo. Quando minimizado ou oculto, publicações remotas de vídeo são suspensas e restauradas ao abrir a janela, reduzindo uso de GPU e banda sem interromper a voz.

Todos os atalhos começam vazios e são configurados em **Configurações → Atalhos**. No app instalado eles são globais; no navegador funcionam apenas com a página em foco. A versão Setup consulta updates 15 segundos depois de abrir e novamente a cada seis horas; o botão **Checar update** em **Configurações → Aplicativo** permite uma consulta imediata. O download usa os metadados e `.blockmap` da release para reaproveitar os blocos existentes, e a instalação só acontece após confirmação. A versão portátil continua sendo atualizada substituindo o executável manualmente.

O workflow [`.github/workflows/windows.yml`](.github/workflows/windows.yml) gera os executáveis e os metadados do updater manualmente ou ao enviar uma tag `v*`. Releases com tag exigem assinatura via Microsoft Artifact Signing e também publicam `DiscorTower-LTS-Windows-x64.exe`, um nome estável para links de download. Builds manuais e locais continuam aceitando saída sem assinatura para desenvolvimento.

### Assinatura de releases do Windows

Depois de criar e validar a conta e o perfil de certificado no Microsoft Artifact Signing, configure no repositório em **Settings → Secrets and variables → Actions**:

Variables:

- `AZURE_SIGNING_ENDPOINT`
- `AZURE_CODE_SIGNING_ACCOUNT_NAME`
- `AZURE_CERTIFICATE_PROFILE_NAME`
- `AZURE_PUBLISHER_NAME` (o distinguished name exato emitido no certificado)

Secrets:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`

O aplicativo registrado no Microsoft Entra ID precisa da função **Trusted Signing Certificate Profile Signer** no recurso de assinatura. Se qualquer valor estiver ausente, o build de uma tag falha antes de publicar uma release sem assinatura. Após a primeira release assinada, o link permanente do instalador é:

```text
https://github.com/luisguns/discortower/releases/latest/download/DiscorTower-LTS-Windows-x64.exe
```

## Deploy no GitHub Pages

O workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) executa em todo push para `main`:

```text
npm ci → npm run build → upload-pages-artifact → deploy-pages
```

Antes do primeiro deploy:

1. Em **Settings → Pages**, selecione **GitHub Actions** como Source.
2. Em **Settings → Secrets and variables → Actions → Variables**, crie `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_SUPABASE_AUTH_REDIRECT_URL`.
3. Confirme o domínio customizado `splotys.com` em **Settings → Pages** e registre a URL correspondente no Supabase Auth.

O arquivo `public/CNAME` preserva o domínio customizado no artefato. A aplicação é uma SPA sem rotas reais e usa assets relativos para funcionar tanto no domínio quanto dentro do protocolo local seguro do Electron.

Na versão web, a tela de login mostra **Baixar LTS para Windows** e direciona para a release estável mais recente. O link não aparece dentro do aplicativo desktop.

## Limitações conhecidas da V1

- canais persistentes são a única forma de iniciar novas calls; códigos de sala antigos não criam sessões;
- chat e imagens são entregues somente aos participantes conectados naquele momento e não possuem histórico persistente;
- captura de áudio do desktop/tela depende do sistema operacional e do navegador;
- `restrictOwnAudio` é uma proteção de melhor esforço disponível principalmente em navegadores Chromium;
- conteúdo protegido por DRM pode bloquear vídeo ou áudio e não é contornado;
- Safari e Firefox podem não permitir seleção de saída ou captura de áudio do screen share.
- transmissão da própria tela no celular depende de `getDisplayMedia`; quando o navegador não oferece a API, a interface informa a limitação sem bloquear câmera ou reprodução.
- Picture-in-Picture depende do suporte do navegador.
- ganho acima de 100% (até 400%) usa o mixer Web Audio local e pode causar clipping ou distorção; ele não aumenta o consumo do LiveKit.
- a janela separada depende da permissão de pop-ups do navegador.
- em celulares, a call pode continuar por algum tempo com o navegador minimizado e expõe metadados ao sistema quando suportado, mas uma página web pode ser suspensa pelo sistema; ouvir de forma confiável com o site fechado exige um aplicativo nativo com modo de áudio em segundo plano.

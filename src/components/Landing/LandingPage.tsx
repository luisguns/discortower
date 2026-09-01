import type { MouseEvent } from 'react'
import { downloadWindowsLts, WINDOWS_LTS_RELEASE_URL } from '../../services/downloads'
import { BrandMark } from '../ui/BrandMark'
import { Icon } from '../ui/Icon'

interface LandingPageProps {
  onEnter: () => void
}

const startDownload = (event: MouseEvent<HTMLAnchorElement>) => {
  event.preventDefault()
  void downloadWindowsLts()
}

export const LandingPage = ({ onEnter }: LandingPageProps) => (
  <main className="landing-shell">
    <div className="landing-orbits" aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
    <header className="landing-nav">
      <a className="landing-brand" href="#inicio" aria-label="splotys — início">
        <BrandMark />
        <span><strong>splotys</strong><small>conversas privadas</small></span>
      </a>
      <nav aria-label="Navegação principal">
        <a href="#produto">Produto</a>
        <a href="#convites">Convites</a>
        <a href="/privacy.html">Privacidade</a>
      </nav>
      <div className="landing-nav__actions">
        <button className="landing-nav__login" onClick={onEnter} type="button">Entrar</button>
        <a className="landing-nav__download" href={WINDOWS_LTS_RELEASE_URL} onClick={startDownload}>Baixar <Icon name="chevron" /></a>
      </div>
    </header>

    <section className="landing-hero" id="inicio">
      <div className="landing-hero__copy">
        <p className="landing-kicker"><span /> Voz, vídeo e tela em um espaço privado</p>
        <h1>Converse perto.<br /><em>Mesmo de longe.</em></h1>
        <p className="landing-lead">O splotys reúne sua turma em canais privados, com chamadas rápidas, compartilhamento de tela e controle total sobre microfone e câmera.</p>
        <div className="landing-hero__actions">
          <a className="landing-button landing-button--primary" href={WINDOWS_LTS_RELEASE_URL} onClick={startDownload}>Baixar para Windows <Icon name="chevron" /></a>
          <button className="landing-button landing-button--ghost" onClick={onEnter} type="button">Entrar na sua conta</button>
        </div>
        <p className="landing-meta"><span className="status-dot" /> Windows 10/11 · x64 · atualizações automáticas</p>
      </div>

      <div className="landing-preview" aria-label="Prévia do aplicativo splotys">
        <div className="landing-preview__bar"><i /><i /><i /><span>splotys / sala privada</span></div>
        <div className="landing-preview__body">
          <aside>
            <div className="landing-preview__logo"><BrandMark /><strong>splotys</strong></div>
            <small>CANAIS</small>
            <span className="is-active"># sala-geral</span>
            <span># jogos</span>
            <span># projeto</span>
            <footer><i /> você está online</footer>
          </aside>
          <section>
            <header><div><small>CANAL</small><strong>sala-geral</strong></div><span>3 conectados</span></header>
            <div className="landing-preview__call">
              <article><b>LT</b><span>Luis</span><small>falando agora</small></article>
              <article><b>MA</b><span>Marina</span><small>microfone ativo</small></article>
              <article className="is-screen"><Icon name="screen" /><span>Tela compartilhada</span><small>1080p · 60 fps</small></article>
            </div>
            <div className="landing-preview__controls"><i><Icon name="mic" /></i><i><Icon name="camera" /></i><i><Icon name="screen" /></i></div>
          </section>
        </div>
      </div>
    </section>

    <section className="landing-features" id="produto">
      <header><p className="landing-kicker">Feito para a sua turma</p><h2>Menos ruído.<br />Mais presença.</h2></header>
      <div className="landing-feature-grid">
        <article><Icon name="audio" /><span>01</span><h3>Voz com baixa latência</h3><p>Entre na conversa rapidamente e mantenha o áudio estável enquanto joga, trabalha ou compartilha ideias.</p></article>
        <article><Icon name="screen" /><span>02</span><h3>Tela em alta qualidade</h3><p>Compartilhe uma janela ou a tela inteira, com opção de áudio e qualidade ajustada ao momento.</p></article>
        <article><Icon name="users" /><span>03</span><h3>Canais por convite</h3><p>Sem descoberta pública. Você participa apenas dos espaços para os quais recebeu acesso.</p></article>
      </div>
    </section>

    <section className="landing-invite" id="convites">
      <div><p className="landing-kicker">Acesso por convite</p><h2>Seu espaço começa<br />com pessoas conhecidas.</h2></div>
      <div className="landing-invite__steps">
        <span><b>1</b><p><strong>Receba o link</strong>Um administrador ou membro autorizado envia seu convite.</p></span>
        <span><b>2</b><p><strong>Crie seu acesso</strong>Abra o link, defina sua senha e confirme sua identidade.</p></span>
        <span><b>3</b><p><strong>Entre no canal</strong>Use o navegador ou abra diretamente no aplicativo.</p></span>
        <button className="landing-button landing-button--ghost" onClick={onEnter} type="button">Já recebi um convite <Icon name="chevron" /></button>
      </div>
    </section>

    <footer className="landing-footer">
      <div className="landing-brand"><BrandMark /><span><strong>splotys</strong><small>Gunns Dev · 2026</small></span></div>
      <p>Comunicação privada para grupos que preferem estar juntos.</p>
      <div><a href="/privacy.html">Privacidade</a><a href="mailto:privacy@splotys.com">Contato</a></div>
    </footer>
  </main>
)

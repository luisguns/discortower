import { useState, type FormEvent, type MouseEvent } from 'react'
import { BrandMark } from '../components/ui/BrandMark'
import { Icon } from '../components/ui/Icon'

const WINDOWS_LTS_RELEASE_URL = 'https://github.com/luisguns/discortower/releases/latest'
const WINDOWS_LTS_API_URL = 'https://api.github.com/repos/luisguns/discortower/releases/latest'

interface GitHubReleaseAsset {
  name?: string
  browser_download_url?: string
}

const downloadWindowsLts = async (event: MouseEvent<HTMLAnchorElement>) => {
  event.preventDefault()
  try {
    const response = await fetch(WINDOWS_LTS_API_URL, { headers: { Accept: 'application/vnd.github+json' } })
    if (!response.ok) throw new Error('Release unavailable')
    const release = await response.json() as { assets?: GitHubReleaseAsset[] }
    const assets = release.assets ?? []
    const installer = assets.find((asset) => asset.name === 'DiscorTower-LTS-Windows-x64.exe')
      ?? assets.find((asset) => /^DiscorTower-Setup-[\w.-]+-x64\.exe$/.test(asset.name ?? ''))
    if (!installer?.browser_download_url) throw new Error('Installer unavailable')
    window.location.assign(installer.browser_download_url)
  } catch {
    window.location.assign(WINDOWS_LTS_RELEASE_URL)
  }
}

interface LoginScreenProps {
  error?: string
  onLogin: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>
  onResetPassword: (email: string) => Promise<{ ok: boolean; message?: string }>
}

export const LoginScreen = ({ error, onLogin, onResetPassword }: LoginScreenProps) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setNotice('')
    setFormError('')
    if (!email.trim() || !password) {
      setFormError('Informe e-mail e senha para entrar.')
      return
    }
    setBusy(true)
    const result = await onLogin(email, password)
    if (!result.ok) setFormError(result.message || 'Não foi possível entrar.')
    setBusy(false)
  }

  const forgotPassword = async () => {
    setFormError('')
    setNotice('Se esse e-mail estiver autorizado, você receberá instruções de recuperação em instantes.')
    await onResetPassword(email)
  }

  return (
    <main className="auth-shell">
      <div className="lobby-grid" aria-hidden="true" />
      <section className="auth-card" aria-labelledby="auth-title">
        <header className="auth-card__brand">
          <BrandMark />
          <div>
            <p className="brand__eyebrow">PRIVATE COMMS</p>
            <h1>DISCORTOWER</h1>
          </div>
        </header>
        <div className="auth-card__intro">
          <p className="eyebrow">ACESSO RESTRITO</p>
          <h2 id="auth-title">Entre na sua<br /><em>torre.</em></h2>
          <p>Use a conta autorizada para continuar. Novos acessos acontecem somente por convite.</p>
        </div>
        <form className="auth-form" onSubmit={submit} noValidate>
          <label className="field">
            <span>E-mail</span>
            <input
              autoComplete="email"
              autoFocus
              onChange={(event) => setEmail(event.target.value)}
              placeholder="voce@exemplo.com"
              type="email"
              value={email}
            />
          </label>
          <label className="field">
            <span>Senha</span>
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Sua senha"
              type="password"
              value={password}
            />
          </label>
          {(formError || error) && <div className="inline-error" role="alert"><Icon name="warning" /><span>{formError || error}</span></div>}
          {notice && <div className="auth-notice" role="status">{notice}</div>}
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? <><span className="spinner" /> Verificando</> : <>Entrar <Icon name="chevron" /></>}
          </button>
          <button className="auth-link" disabled={busy} onClick={() => void forgotPassword()} type="button">Esqueci minha senha</button>
        </form>
        {!window.fordKallDesktop && (
          <a className="auth-download" href={WINDOWS_LTS_RELEASE_URL} onClick={(event) => void downloadWindowsLts(event)}>
            <span><strong>Baixar LTS para Windows</strong><small>Setup x64 · atualização automática</small></span>
            <Icon name="chevron" />
          </a>
        )}
        <footer className="auth-card__footer"><span className="status-dot" /> Conta criada apenas por convite</footer>
      </section>
    </main>
  )
}

export const AuthLoadingScreen = () => (
  <main className="auth-shell auth-shell--loading">
    <div className="auth-loading"><span className="spinner" /> Validando sessão</div>
  </main>
)

export const AccountDisabledScreen = ({ onSignOut }: { onSignOut: () => Promise<void> }) => (
  <main className="auth-shell">
    <section className="auth-card auth-card--compact">
      <header className="auth-card__brand"><BrandMark /><div><p className="brand__eyebrow">ACESSO SUSPENSO</p><h1>DISCORTOWER</h1></div></header>
      <div className="auth-card__intro"><p className="eyebrow">CONTA DESATIVADA</p><h2>Fale com o<br /><em>administrador.</em></h2><p>Esta conta não pode iniciar novas operações enquanto estiver desativada.</p></div>
      <button className="secondary-button auth-card__action" onClick={() => void onSignOut()} type="button">Sair da conta</button>
    </section>
  </main>
)

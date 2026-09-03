import { useState, type FormEvent } from 'react'
import { BrandMark } from '../components/ui/BrandMark'
import { Icon } from '../components/ui/Icon'

interface InviteCodeScreenProps {
  onRedeem: (code: string, email: string, password: string) => Promise<{ ok: boolean; message?: string }>
  onBack: () => void
}

export const InviteCodeScreen = ({ onRedeem, onBack }: InviteCodeScreenProps) => {
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState(false)

  const formatCodeInput = (value: string) => {
    const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
    return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    const cleanCode = code.replace(/[^A-Z0-9]/gi, '')
    if (!cleanCode || cleanCode.length !== 8) {
      setError('Insira um código de convite válido (8 caracteres).')
      return
    }
    if (!email.trim()) {
      setError('Informe seu e-mail.')
      return
    }
    if (password.length < 8 || password.length > 128) {
      setError('A senha precisa ter entre 8 e 128 caracteres.')
      return
    }
    if (password !== confirmation) {
      setError('As senhas não conferem.')
      return
    }
    setBusy(true)
    const result = await onRedeem(cleanCode, email, password)
    if (result.ok) {
      setSuccess(true)
    } else {
      setError(result.message || 'Não foi possível criar a conta.')
    }
    setBusy(false)
  }

  if (success) {
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-labelledby="invite-code-title">
          <header className="auth-card__brand"><BrandMark /><div><p className="brand__eyebrow">CONTA CRIADA</p><h1>SPLOTYS</h1></div></header>
          <div className="auth-card__intro">
            <p className="eyebrow">TUDO PRONTO</p>
            <h2 id="invite-code-title">Bem-vindo à<br /><em>torre.</em></h2>
            <p>Sua conta foi criada. Use seu e-mail e senha para entrar.</p>
          </div>
          <button className="primary-button" onClick={onBack} type="button">Ir para o login <Icon name="chevron" /></button>
        </section>
      </main>
    )
  }

  return (
    <main className="auth-shell">
      <div className="lobby-grid" aria-hidden="true" />
      <section className="auth-card" aria-labelledby="invite-code-title">
        <header className="auth-card__brand"><BrandMark /><div><p className="brand__eyebrow">CÓDIGO DE CONVITE</p><h1>SPLOTYS</h1></div></header>
        <div className="auth-card__intro">
          <p className="eyebrow">NOVO ACESSO</p>
          <h2 id="invite-code-title">Entre com seu<br /><em>código.</em></h2>
          <p>Insira o código de convite que você recebeu para criar sua conta.</p>
        </div>
        <form className="auth-form" onSubmit={submit} noValidate>
          <label className="field">
            <span>Código de convite</span>
            <input
              autoComplete="off"
              autoFocus
              maxLength={9}
              onChange={(event) => setCode(formatCodeInput(event.target.value))}
              placeholder="XXXX-XXXX"
              style={{ fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.12em', textTransform: 'uppercase' }}
              type="text"
              value={code}
            />
          </label>
          <label className="field">
            <span>Seu e-mail</span>
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="voce@exemplo.com"
              type="email"
              value={email}
            />
          </label>
          <label className="field">
            <span>Senha</span>
            <input
              autoComplete="new-password"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Mínimo de 8 caracteres"
              type="password"
              value={password}
            />
          </label>
          <label className="field">
            <span>Confirme a senha</span>
            <input
              autoComplete="new-password"
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="Repita sua senha"
              type="password"
              value={confirmation}
            />
          </label>
          {error && <div className="inline-error" role="alert"><Icon name="warning" /><span>{error}</span></div>}
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? <><span className="spinner" /> Criando conta</> : <>Criar conta <Icon name="chevron" /></>}
          </button>
          <button className="auth-link" disabled={busy} onClick={onBack} type="button">Voltar ao login</button>
        </form>
      </section>
    </main>
  )
}

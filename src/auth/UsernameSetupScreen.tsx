import { useState, type FormEvent } from 'react'
import { BrandMark } from '../components/ui/BrandMark'
import { Icon } from '../components/ui/Icon'

interface Props {
  error?: string
  onSubmit: (username: string) => Promise<boolean>
}

export const UsernameSetupScreen = ({ error, onSubmit }: Props) => {
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const normalized = username.trim().toLowerCase().replace(/^@/, '')
  const valid = /^[a-z0-9_]{3,24}$/.test(normalized)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    await onSubmit(normalized)
    setBusy(false)
  }

  return <main className="auth-shell username-setup"><div className="lobby-grid" aria-hidden="true" />
    <section className="auth-card">
      <header className="auth-card__brand"><BrandMark /><div><p className="eyebrow">PRIVATE COMMS</p><h1>SPLOTYS</h1></div></header>
      <div className="auth-card__intro"><p className="eyebrow">IDENTIDADE ÚNICA</p><h2>Escolha seu <em>@username.</em></h2><p>Ele será usado para seus amigos encontrarem você. Seu nome visual continuará podendo ser personalizado.</p></div>
      <form className="auth-form username-setup__form" onSubmit={(event) => void submit(event)}>
        <label className="username-setup__field"><span>@USERNAME</span><div><Icon name="users" /><b>@</b><input autoCapitalize="none" autoComplete="username" disabled={busy} maxLength={25} onChange={(event) => setUsername(event.target.value)} placeholder="seu_nome" spellCheck={false} value={username} /><small>{normalized.length}/24</small></div></label>
        <p className={`username-setup__hint${username && !valid ? ' is-error' : ''}`}>{username && !valid ? 'Use de 3 a 24 caracteres: letras minúsculas, números ou _.' : '3–24 caracteres · letras, números e _'}</p>
        {error && <div className="inline-error" role="alert"><Icon name="warning" /><span>{error}</span></div>}
        <button className="primary-button" disabled={!valid || busy} type="submit">{busy ? 'CONFIRMANDO…' : 'CONFIRMAR IDENTIDADE'} <Icon name="chevron" /></button>
      </form>
      <footer className="auth-card__footer"><Icon name="eye" />Você poderá alterar esse identificador no seu perfil.</footer>
    </section>
  </main>
}

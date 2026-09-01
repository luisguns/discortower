import { useState, type FormEvent } from 'react'
import { BrandMark } from '../components/ui/BrandMark'
import { Icon } from '../components/ui/Icon'

interface InviteCompletionScreenProps {
  mode: 'invite' | 'recovery'
  onComplete: (password: string) => Promise<{ ok: boolean; message?: string }>
  onLogout: () => Promise<void>
}

export const InviteCompletionScreen = ({ mode, onComplete, onLogout }: InviteCompletionScreenProps) => {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (password.length < 8 || password.length > 128) {
      setError('A senha precisa ter entre 8 e 128 caracteres.')
      return
    }
    if (password !== confirmation) {
      setError('As senhas não conferem.')
      return
    }
    setBusy(true)
    const result = await onComplete(password)
    if (!result.ok) setError(result.message || 'Não foi possível salvar a senha.')
    setBusy(false)
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <header className="auth-card__brand"><BrandMark /><div><p className="brand__eyebrow">{mode === 'invite' ? 'CONVITE VALIDADO' : 'RECUPERAÇÃO'}</p><h1>SPLOTYS</h1></div></header>
        <div className="auth-card__intro"><p className="eyebrow">{mode === 'invite' ? 'PRIMEIRO ACESSO' : 'NOVA SENHA'}</p><h2>Proteja seu<br /><em>acesso.</em></h2><p>{mode === 'invite' ? 'Defina sua senha para concluir a entrada na torre.' : 'Escolha uma nova senha para voltar a usar sua conta.'}</p></div>
        <form className="auth-form" onSubmit={submit} noValidate>
          <label className="field"><span>Nova senha</span><input autoComplete="new-password" autoFocus minLength={8} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 8 caracteres" type="password" value={password} /></label>
          <label className="field"><span>Confirme a senha</span><input autoComplete="new-password" onChange={(event) => setConfirmation(event.target.value)} placeholder="Repita sua senha" type="password" value={confirmation} /></label>
          {error && <div className="inline-error" role="alert"><Icon name="warning" /><span>{error}</span></div>}
          <button className="primary-button" disabled={busy} type="submit">{busy ? <><span className="spinner" /> Salvando</> : <>Continuar <Icon name="chevron" /></>}</button>
          <button className="auth-link" disabled={busy} onClick={() => void onLogout()} type="button">Sair</button>
        </form>
      </section>
    </main>
  )
}


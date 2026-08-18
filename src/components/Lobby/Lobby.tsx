import { useState, type FormEvent } from 'react'
import { normalizeDisplayName, normalizeRoomCode } from '../../services/livekit'
import { getDisplayName } from '../../storage/preferences'
import type { ConnectionStatus } from '../../types'
import { Icon } from '../ui/Icon'

interface LobbyProps {
  status: ConnectionStatus
  connectionError: string
  onJoin: (displayName: string, roomCode: string) => Promise<boolean>
}

export const Lobby = ({ status, connectionError, onJoin }: LobbyProps) => {
  const [displayName, setDisplayName] = useState(getDisplayName)
  const [roomCode, setRoomCode] = useState('')
  const [validationError, setValidationError] = useState('')
  const connecting = status === 'connecting'

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const normalizedName = normalizeDisplayName(displayName)
    const normalizedRoom = normalizeRoomCode(roomCode)

    if (!normalizedName) {
      setValidationError('Diga como seus amigos devem chamar você.')
      return
    }
    if (!normalizedRoom) {
      setValidationError('Digite o código da sala.')
      return
    }

    setValidationError('')
    setDisplayName(normalizedName)
    setRoomCode(normalizedRoom)
    await onJoin(normalizedName, normalizedRoom)
  }

  return (
    <main className="lobby-shell">
      <div className="lobby-grid" aria-hidden="true" />
      <section className="lobby-card" aria-labelledby="lobby-title">
        <div className="brand brand--large">
          <span className="brand__mark">FK</span>
          <div>
            <p className="brand__eyebrow">PRIVATE COMMS</p>
            <h1 id="lobby-title">FORD KALL</h1>
          </div>
        </div>

        <div className="lobby-card__intro">
          <p className="eyebrow">IGNIÇÃO</p>
          <h2>Entre na frequência.</h2>
          <p>Voz e transmissão de tela. Sem cadastro, direto para a call.</p>
        </div>

        <form onSubmit={submit} noValidate>
          <label className="field">
            <span>Seu nome</span>
            <input
              autoComplete="nickname"
              autoFocus
              maxLength={48}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Tower"
              value={displayName}
            />
          </label>

          <label className="field">
            <span>Código da sala</span>
            <input
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={64}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
              placeholder="KIWI-7294"
              spellCheck={false}
              value={roomCode}
            />
          </label>

          {(validationError || connectionError) && (
            <div className="inline-error" role="alert">
              <Icon name="warning" />
              <span>{validationError || connectionError}</span>
            </div>
          )}

          <button className="primary-button" disabled={connecting} type="submit">
            {connecting ? (
              <>
                <span className="spinner" /> Conectando
              </>
            ) : (
              <>
                Entrar na call <Icon name="chevron" />
              </>
            )}
          </button>
        </form>

        <footer className="lobby-card__footer">
          <span className="status-dot" /> LiveKit Cloud
          <span>Chrome / Edge desktop</span>
        </footer>
      </section>
    </main>
  )
}

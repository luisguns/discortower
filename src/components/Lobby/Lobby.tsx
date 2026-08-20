import { useState, type FormEvent } from 'react'
import {
  generateRoomCode,
  getRoomCodeFromUrl,
  normalizeDisplayName,
  normalizeRoomCode,
} from '../../services/livekit'
import { primeCallSounds } from '../../services/callSounds'
import { getDisplayName } from '../../storage/preferences'
import type { ConnectionStatus } from '../../types'
import { BrandMark } from '../ui/BrandMark'
import { Icon } from '../ui/Icon'

interface LobbyProps {
  status: ConnectionStatus
  connectionError: string
  onJoin: (displayName: string, roomCode: string) => Promise<boolean>
}

export const Lobby = ({ status, connectionError, onJoin }: LobbyProps) => {
  const [displayName, setDisplayName] = useState(getDisplayName)
  const [roomCode, setRoomCode] = useState(getRoomCodeFromUrl)
  const [validationError, setValidationError] = useState('')
  const connecting = status === 'connecting' || status === 'reconnecting'

  const joinRoom = async (nextRoomCode: string) => {
    const normalizedName = normalizeDisplayName(displayName)
    const normalizedRoom = normalizeRoomCode(nextRoomCode)

    if (!normalizedName) {
      setRoomCode(normalizedRoom)
      setValidationError('Diga como seus amigos devem chamar você.')
      return
    }

    setValidationError('')
    setDisplayName(normalizedName)
    setRoomCode(normalizedRoom)
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    window.scrollTo({ top: 0, behavior: 'instant' })
    primeCallSounds()
    await onJoin(normalizedName, normalizedRoom)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const normalizedRoom = normalizeRoomCode(roomCode)

    if (!normalizedRoom) {
      setValidationError('Digite o código da sala.')
      return
    }

    await joinRoom(normalizedRoom)
  }

  const createRoom = async () => joinRoom(generateRoomCode())

  return (
    <main className="lobby-shell">
      <div className="lobby-grid" aria-hidden="true" />
      <section className="lobby-card" aria-labelledby="lobby-title">
        <div className="brand brand--large">
          <BrandMark />
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
            {roomCode && getRoomCodeFromUrl() === normalizeRoomCode(roomCode) && (
              <small className="room-link-hint">Sala carregada pelo link de convite</small>
            )}
          </label>

          {(validationError || connectionError) && (
            <div className="inline-error" role="alert">
              <Icon name="warning" />
              <span>{validationError || connectionError}</span>
            </div>
          )}

          <div className="lobby-actions">
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
            <span className="lobby-actions__divider">ou</span>
            <button
              className="secondary-button"
              disabled={connecting}
              onClick={() => void createRoom()}
              type="button"
            >
              <Icon name="users" /> Criar sala nova
            </button>
          </div>
        </form>

        <footer className="lobby-card__footer">
          <span className="status-dot" /> LiveKit Cloud
          <span>Chrome / Edge desktop</span>
        </footer>
      </section>
    </main>
  )
}

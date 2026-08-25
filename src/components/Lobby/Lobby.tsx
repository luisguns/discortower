import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  generateRoomCode,
  getRoomCodeFromUrl,
  normalizeDisplayName,
  normalizeRoomCode,
} from '../../services/livekit'
import { primeCallSounds } from '../../services/callSounds'
import {
  MAX_PROFILE_GIF_BYTES,
  prepareProfileAvatar,
} from '../../services/profile'
import { getLocalProfile, saveLocalProfile } from '../../storage/preferences'
import type { ConnectionStatus, LocalProfile } from '../../types'
import { BrandMark } from '../ui/BrandMark'
import { Icon } from '../ui/Icon'
import { ProfileAvatar } from '../ui/ProfileAvatar'

interface LobbyProps {
  status: ConnectionStatus
  connectionError: string
  initialRoomCode: string
  onJoin: (profile: LocalProfile, roomCode: string) => Promise<boolean>
}

export const Lobby = ({ status, connectionError, initialRoomCode, onJoin }: LobbyProps) => {
  const initialProfile = getLocalProfile()
  const [displayName, setDisplayName] = useState(initialProfile.displayName)
  const [avatarDataUrl, setAvatarDataUrl] = useState(initialProfile.avatarDataUrl)
  const [roomCode, setRoomCode] = useState(() => initialRoomCode || getRoomCodeFromUrl())
  const [validationError, setValidationError] = useState('')
  const [profileError, setProfileError] = useState('')
  const [preparingAvatar, setPreparingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const connecting = status === 'connecting' || status === 'reconnecting'

  useEffect(() => {
    if (initialRoomCode) setRoomCode(initialRoomCode)
  }, [initialRoomCode])

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
    const profile = { displayName: normalizedName, avatarDataUrl }
    saveLocalProfile(profile)
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    window.scrollTo({ top: 0, behavior: 'instant' })
    primeCallSounds()
    await onJoin(profile, normalizedRoom)
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

  const selectAvatar = async (file: File) => {
    setPreparingAvatar(true)
    setProfileError('')
    try {
      const nextAvatar = await prepareProfileAvatar(file)
      setAvatarDataUrl(nextAvatar)
      saveLocalProfile({ displayName, avatarDataUrl: nextAvatar })
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Não foi possível usar essa imagem.')
    } finally {
      setPreparingAvatar(false)
    }
  }

  const removeAvatar = () => {
    setAvatarDataUrl(undefined)
    setProfileError('')
    saveLocalProfile({ displayName })
  }

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
          <div className="profile-editor">
            <input
              accept="image/jpeg,image/png,image/webp,image/gif"
              aria-label="Escolher foto de perfil"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void selectAvatar(file)
                event.target.value = ''
              }}
              ref={avatarInputRef}
              type="file"
            />
            <button
              aria-label={avatarDataUrl ? 'Trocar foto de perfil' : 'Adicionar foto de perfil'}
              className="profile-editor__avatar"
              disabled={connecting || preparingAvatar}
              onClick={() => avatarInputRef.current?.click()}
              type="button"
            >
              <ProfileAvatar avatarDataUrl={avatarDataUrl} name={displayName || 'Você'} />
              <span className="profile-editor__badge"><Icon name="image" /></span>
            </button>
            <div className="profile-editor__copy">
              <span>Seu perfil local</span>
              <strong>{displayName.trim() || 'Escolha seu nome'}</strong>
              <small>PNG, JPG e WEBP são otimizados. GIF animado até {MAX_PROFILE_GIF_BYTES / 1024} KB.</small>
              <div>
                <button disabled={connecting || preparingAvatar} onClick={() => avatarInputRef.current?.click()} type="button">
                  {preparingAvatar ? 'Preparando…' : avatarDataUrl ? 'Trocar imagem' : 'Adicionar imagem'}
                </button>
                {avatarDataUrl && <button onClick={removeAvatar} type="button">Remover</button>}
              </div>
            </div>
          </div>

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

          {profileError && (
            <div className="inline-error" role="alert">
              <Icon name="warning" />
              <span>{profileError}</span>
            </div>
          )}

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
          <span>{window.fordKallDesktop ? 'Aplicativo Windows' : 'Chrome / Edge desktop'}</span>
        </footer>
      </section>
    </main>
  )
}

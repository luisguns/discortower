import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  generateRoomCode,
  getRoomCodeFromUrl,
  normalizeDisplayName,
  roomCodeFromInput,
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
  const [initialProfile] = useState(getLocalProfile)
  const [displayName, setDisplayName] = useState(initialProfile.displayName)
  const [avatarDataUrl, setAvatarDataUrl] = useState(initialProfile.avatarDataUrl)
  const [roomCode, setRoomCode] = useState(() => initialRoomCode || getRoomCodeFromUrl())
  const [validationError, setValidationError] = useState('')
  const [profileError, setProfileError] = useState('')
  const [preparingAvatar, setPreparingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const connecting = status === 'connecting' || status === 'reconnecting'

  useEffect(() => {
    if (initialRoomCode) setRoomCode(initialRoomCode)
  }, [initialRoomCode])

  const joinRoom = async (nextRoomCode: string) => {
    const normalizedName = normalizeDisplayName(displayName)
    const normalizedRoom = roomCodeFromInput(nextRoomCode)

    if (!normalizedName) {
      setRoomCode(normalizedRoom)
      setValidationError('Diga como seus amigos devem chamar você.')
      nameInputRef.current?.focus()
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
    const normalizedRoom = roomCodeFromInput(roomCode)

    if (!normalizedRoom) {
      setValidationError('Digite o código da sala.')
      return
    }

    await joinRoom(normalizedRoom)
  }

  const createRoom = async () => joinRoom(generateRoomCode())
  const roomFromInvite = getRoomCodeFromUrl()
  const normalizedRoomInput = roomCodeFromInput(roomCode)

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
    <main className="lobby-shell lobby-shell--welcome">
      <div className="lobby-grid" aria-hidden="true" />
      <header className="lobby-topbar">
        <div className="brand brand--welcome">
          <BrandMark />
          <div>
            <p className="brand__eyebrow">PRIVATE COMMS</p>
            <h1 id="lobby-title">FORD KALL</h1>
          </div>
        </div>
        <div className="lobby-topbar__status">
          <span className="status-dot" />
          <span>{window.fordKallDesktop ? 'Aplicativo Windows' : 'Pronto no navegador'}</span>
        </div>
      </header>

      <section className="lobby-home" aria-labelledby="lobby-title">
        <div className="lobby-hero">
          <div className="lobby-hero__copy">
            <p className="eyebrow">SUA GARAGEM DE VOZ</p>
            <h2>A call que<br /><em>pega no tranco.</em></h2>
            <p>Crie uma sala em um clique ou cole um convite. Voz, câmera, tela e chat sem cadastro e sem enrolação.</p>
          </div>

          <div className="lobby-capabilities" aria-label="Recursos disponíveis">
            <span><Icon name="mic" /> Voz</span>
            <span><Icon name="camera" /> Câmera</span>
            <span><Icon name="screen" /> Tela</span>
            <span><Icon name="chat" /> Chat</span>
          </div>

          <form className="lobby-entry-card" onSubmit={submit} noValidate>
            <header>
              <span>ENTRAR EM UMA SALA</span>
              <small>Código ou link de convite</small>
            </header>

            <label className="lobby-room-field">
              <span className="lobby-room-field__icon"><Icon name="users" /></span>
              <input
                aria-label="Código ou link da sala"
                autoCapitalize="characters"
                autoComplete="off"
                autoFocus={Boolean(displayName)}
                maxLength={240}
                onChange={(event) => setRoomCode(event.target.value)}
                placeholder="KIWI-7294 ou cole o convite"
                spellCheck={false}
                value={roomCode}
              />
              <button aria-label="Entrar na sala" disabled={connecting} type="submit">
                {connecting ? <><span className="spinner" /> Entrando</> : <>Entrar <Icon name="chevron" /></>}
              </button>
            </label>

            {normalizedRoomInput && (
              <div className={`lobby-room-ready ${roomFromInvite === normalizedRoomInput ? 'is-invite' : ''}`}>
                <span className="status-dot" />
                <span>{roomFromInvite === normalizedRoomInput ? 'Convite pronto' : 'Sala identificada'}</span>
                <strong>{normalizedRoomInput}</strong>
              </div>
            )}

            {(validationError || connectionError) && (
              <div className="inline-error" role="alert">
                <Icon name="warning" />
                <span>{validationError || connectionError}</span>
              </div>
            )}

            <div className="lobby-create-row">
              <span>Vai reunir a turma?</span>
              <button disabled={connecting} onClick={() => void createRoom()} type="button">
                <Icon name="users" /> Criar sala nova
              </button>
            </div>
          </form>
        </div>

        <aside className="lobby-profile-panel" aria-label="Seu perfil local">
          <div className="lobby-profile-panel__glow" aria-hidden="true" />
          <header>
            <div>
              <span>SEU ASSENTO</span>
              <strong>Como você chega na call</strong>
            </div>
            <small>Salvo neste dispositivo</small>
          </header>

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

          <div className="lobby-profile-preview">
            <div className="lobby-profile-preview__rings" aria-hidden="true" />
            <button
              aria-label={avatarDataUrl ? 'Trocar foto de perfil' : 'Adicionar foto de perfil'}
              className="lobby-profile-avatar"
              disabled={connecting || preparingAvatar}
              onClick={() => avatarInputRef.current?.click()}
              type="button"
            >
              <ProfileAvatar avatarDataUrl={avatarDataUrl} name={displayName || 'Você'} />
              <span className="lobby-profile-avatar__badge"><Icon name="image" /></span>
            </button>
            <span className="lobby-profile-preview__online"><span className="status-dot" /> Online</span>
          </div>

          <label className="lobby-name-field">
            <span>SEU NOME NA CALL</span>
            <input
              autoComplete="nickname"
              autoFocus={!displayName}
              maxLength={48}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Como podemos te chamar?"
              ref={nameInputRef}
              value={displayName}
            />
          </label>

          <div className="lobby-profile-actions">
            <button disabled={connecting || preparingAvatar} onClick={() => avatarInputRef.current?.click()} type="button">
              <Icon name="image" /> {preparingAvatar ? 'Preparando…' : avatarDataUrl ? 'Trocar foto' : 'Adicionar foto'}
            </button>
            {avatarDataUrl && <button onClick={removeAvatar} type="button">Remover</button>}
          </div>
          <small className="lobby-profile-hint">Fotos são otimizadas aqui. GIF animado até {MAX_PROFILE_GIF_BYTES / 1024} KB.</small>

          {profileError && (
            <div className="inline-error" role="alert">
              <Icon name="warning" />
              <span>{profileError}</span>
            </div>
          )}
        </aside>
      </section>

      <footer className="lobby-footer">
        <span><span className="status-dot" /> LiveKit Cloud</span>
        <span>Áudio, vídeo e tela em tempo real</span>
        <span>Ford Kall · 2026</span>
      </footer>
    </main>
  )
}

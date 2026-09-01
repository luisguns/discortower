import { useCallback, useEffect, useRef, useState } from 'react'
import { RoomEvent, type Room } from 'livekit-client'
import { useAudioDevices } from '../../hooks/useAudioDevices'
import { useAppUpdater } from '../../hooks/useAppUpdater'
import { useCallShortcuts } from '../../hooks/useCallShortcuts'
import { useDesktopGameOverlay } from '../../hooks/useDesktopGameOverlay'
import { useDesktopPerformanceMode } from '../../hooks/useDesktopPerformanceMode'
import { useMicrophoneMonitor } from '../../hooks/useMicrophoneMonitor'
import { useRoomSnapshot } from '../../hooks/useRoomSnapshot'
import { microphoneCaptureOptions, useMicrophoneProcessing } from '../../hooks/useMicrophoneProcessing'
import { useRoomChat } from '../../hooks/useRoomChat'
import { useScreenShare } from '../../hooks/useScreenShare'
import { playCallSound, primeCallSounds } from '../../services/callSounds'
import { createChannelInviteUrl, streamQualityPresets } from '../../services/livekit'
import {
  getCallSoundsEnabled,
  getGameOverlayEnabled,
  getGalleryLayout,
  getStreamQuality,
  saveCallSoundsEnabled,
  saveGameOverlayEnabled,
  saveGalleryLayout,
  saveStreamQuality,
} from '../../storage/preferences'
import type {
  ConnectionStatus,
  ContextMenuPoint,
  GalleryLayoutMode,
  StreamQualityId,
} from '../../types'
import { ChatPanel } from '../Chat/ChatPanel'
import { ParticipantAudioLayer } from '../Participants/ParticipantAudioLayer'
import { ParticipantContextMenu } from '../Participants/ParticipantContextMenu'
import { GalleryLayoutMenu } from '../Participants/GalleryLayoutMenu'
import { ParticipantList } from '../Participants/ParticipantList'
import { ScreenShareStage } from '../ScreenShare/ScreenShareStage'
import { SettingsModal } from '../Settings/SettingsModal'
import { BrandMark } from '../ui/BrandMark'
import { Icon, type IconName } from '../ui/Icon'

interface CallScreenProps {
  room: Room
  roomCode: string
  channelId?: string
  canHighQualityScreenShare?: boolean
  status: ConnectionStatus
  microphoneError: string
  microphoneStarting: boolean
  onMicrophoneErrorChange: (message: string) => void
  onLeave: () => Promise<void>
  onLogout: () => Promise<void>
  sidebarVisible?: boolean
  fullscreen?: boolean
  onToggleSidebar?: () => void
  onToggleFullscreen?: () => void
}

interface ControlButtonProps {
  icon: IconName
  label: string
  detail: string
  active?: boolean
  muted?: boolean
  danger?: boolean
  disabled?: boolean
  error?: boolean
  onClick: () => void
}

const ControlButton = ({
  icon,
  label,
  detail,
  active,
  muted,
  danger,
  disabled,
  error,
  onClick,
}: ControlButtonProps) => (
  <button
    aria-label={`${label}: ${detail}`}
    className={`call-control ${active ? 'call-control--active' : ''} ${muted ? 'call-control--muted' : ''} ${danger ? 'call-control--danger' : ''} ${error ? 'call-control--error' : ''}`}
    disabled={disabled}
    onClick={onClick}
    title={`${label} · ${detail}`}
    type="button"
  >
    <span className="call-control__icon"><Icon name={icon} /></span>
    <span>
      <strong>{label}</strong>
      <small>{detail}</small>
    </span>
  </button>
)

const Notice = ({
  children,
  warning = false,
  actionLabel,
  onAction,
  onClose,
}: {
  children: React.ReactNode
  warning?: boolean
  actionLabel?: string
  onAction?: () => void
  onClose: () => void
}) => (
  <div className={`notice ${warning ? 'notice--warning' : ''}`} role={warning ? 'alert' : 'status'}>
    <Icon name="warning" />
    <span>{children}</span>
    {actionLabel && onAction && (
      <button className="notice__action" onClick={onAction} type="button">{actionLabel}</button>
    )}
    <button aria-label="Fechar aviso" onClick={onClose} title="Fechar aviso" type="button">
      <Icon name="x" />
    </button>
  </div>
)

const connectionLabel: Record<ConnectionStatus, string> = {
  connecting: 'Conectando',
  connected: 'Conectado',
  reconnecting: 'Reconectando',
  disconnected: 'Desconectado',
  error: 'Erro',
}

export const CallScreen = ({
  room,
  roomCode,
  channelId,
  canHighQualityScreenShare = false,
  status,
  microphoneError,
  microphoneStarting,
  onMicrophoneErrorChange,
  onLeave,
  onLogout,
  sidebarVisible = true,
  fullscreen = false,
  onToggleSidebar,
  onToggleFullscreen,
}: CallScreenProps) => {
  const snapshot = useRoomSnapshot(room)
  useDesktopPerformanceMode(room)
  const devices = useAudioDevices(room)
  const microphoneProcessing = useMicrophoneProcessing(room)
  const microphoneMonitor = useMicrophoneMonitor(
    room,
    devices.preferences.voiceOutputId,
    `${devices.selectedInput}:${microphoneProcessing.noiseSuppression}`,
  )
  const chat = useRoomChat(room)
  const [deafened, setDeafened] = useState(false)
  const [callSoundsEnabled, setCallSoundsEnabled] = useState(getCallSoundsEnabled)
  const [gameOverlayEnabled, setGameOverlayEnabled] = useState(getGameOverlayEnabled)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [quality, setQuality] = useState<StreamQualityId>(getStreamQuality)
  const [galleryLayout, setGalleryLayout] = useState<GalleryLayoutMode>(getGalleryLayout)
  const [layoutMenuPoint, setLayoutMenuPoint] = useState<ContextMenuPoint | null>(null)
  const [micBusy, setMicBusy] = useState(false)
  const [cameraBusy, setCameraBusy] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [callLimitNotice, setCallLimitNotice] = useState('')
  const [copyState, setCopyState] = useState('Copiar link')
  const [audioBlocked, setAudioBlocked] = useState(!room.canPlaybackAudio)
  const [participantsOpen, setParticipantsOpen] = useState(true)
  const [chatOpen, setChatOpen] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const lastSeenMessageId = useRef('')
  const [participantMenu, setParticipantMenu] = useState<{
    participantId: string
    point: ContextMenuPoint
  } | null>(null)
  const effectiveQuality = canHighQualityScreenShare ? quality : '720p30'
  const screenShare = useScreenShare(room, effectiveQuality)
  const updater = useAppUpdater()
  const micEnabled = room.localParticipant.isMicrophoneEnabled
  const cameraEnabled = room.localParticipant.isCameraEnabled
  useEffect(() => { setParticipantsOpen(true) }, [room])
  useDesktopGameOverlay(room, gameOverlayEnabled)

  useEffect(() => {
    if (snapshot.participants.length > 1 && callLimitNotice.includes('sozinho')) setCallLimitNotice('')
  }, [callLimitNotice, snapshot.participants.length])

  useEffect(() => {
    const handleSystemMessage = (payload: Uint8Array, _participant: unknown, _kind: unknown, topic?: string) => {
      if (topic !== 'system.call-limit') return
      try {
        const message = JSON.parse(new TextDecoder().decode(payload)) as { type?: string; disconnectAt?: string }
        if (message.type === 'solo_timeout_warning') setCallLimitNotice('Você está sozinho nesta call. Se ninguém entrar, a conexão será encerrada em um minuto.')
        if (message.type === 'max_duration_warning') setCallLimitNotice('Esta call atingirá o limite de seis horas em breve.')
      } catch { /* ignore malformed system packets */ }
    }
    room.on(RoomEvent.DataReceived, handleSystemMessage as never)
    return () => { room.off(RoomEvent.DataReceived, handleSystemMessage as never) }
  }, [room])

  useEffect(() => {
    const handleParticipantConnected = () => playCallSound('join')
    const handleParticipantDisconnected = () => playCallSound('leave')

    room.on(RoomEvent.ParticipantConnected, handleParticipantConnected)
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected)
    playCallSound('join')

    return () => {
      room.off(RoomEvent.ParticipantConnected, handleParticipantConnected)
      room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected)
    }
  }, [room])

  useEffect(() => {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return

    navigator.mediaSession.metadata = new MediaMetadata({
      title: `Sala ${roomCode}`,
      artist: 'splotys',
      album: 'Call em andamento',
    })
    try {
      navigator.mediaSession.playbackState = 'playing'
    } catch {
      // Some mobile browsers expose Media Session without a writable state.
    }

    return () => {
      navigator.mediaSession.metadata = null
      try {
        navigator.mediaSession.playbackState = 'none'
      } catch {
        // The call teardown still disconnects every LiveKit track.
      }
    }
  }, [roomCode])

  useEffect(() => {
    const previousIndex = lastSeenMessageId.current
      ? chat.messages.findIndex((message) => message.id === lastSeenMessageId.current)
      : -1
    const added = chat.messages.slice(previousIndex + 1)
    if (!chatOpen) {
      setUnreadMessages((current) => current + added.filter((message) => !message.isLocal).length)
    }
    lastSeenMessageId.current = chat.messages.at(-1)?.id ?? ''
  }, [chat.messages, chatOpen])

  useEffect(() => {
    const handlePlayback = (playing: boolean) => setAudioBlocked(!playing)
    room.on(RoomEvent.AudioPlaybackStatusChanged, handlePlayback)
    setAudioBlocked(!room.canPlaybackAudio)
    return () => {
      room.off(RoomEvent.AudioPlaybackStatusChanged, handlePlayback)
    }
  }, [room])

  const toggleMicrophone = useCallback(async () => {
    if (micBusy || microphoneStarting || status === 'reconnecting') return
    setMicBusy(true)
    try {
      const enabling = !room.localParticipant.isMicrophoneEnabled
      await room.localParticipant.setMicrophoneEnabled(
        enabling,
        microphoneCaptureOptions(),
      )
      onMicrophoneErrorChange('')
      playCallSound(enabling ? 'unmute' : 'mute')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        onMicrophoneErrorChange(
          window.splotysDesktop?.platform === 'win32'
            ? 'Permissão do microfone negada. Libere o acesso no Windows e tente novamente.'
            : 'Permissão do microfone negada. Libere o acesso no navegador.',
        )
      } else {
        onMicrophoneErrorChange('Não foi possível alterar o estado do microfone.')
      }
    } finally {
      setMicBusy(false)
    }
  }, [micBusy, microphoneStarting, onMicrophoneErrorChange, room, status])

  const toggleCamera = useCallback(async () => {
    if (cameraBusy || status === 'reconnecting') return
    setCameraBusy(true)
    setCameraError('')
    try {
      await room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setCameraError('Permissão da câmera negada. Libere o acesso no navegador.')
      } else if (error instanceof DOMException && error.name === 'NotFoundError') {
        setCameraError('Nenhuma câmera foi encontrada neste dispositivo.')
      } else {
        setCameraError('Não foi possível alterar o estado da câmera.')
      }
    } finally {
      setCameraBusy(false)
    }
  }, [cameraBusy, room, status])

  const changeQuality = (nextQuality: StreamQualityId) => {
    const allowedQuality = canHighQualityScreenShare ? nextQuality : '720p30'
    setQuality(allowedQuality)
    saveStreamQuality(allowedQuality)
  }

  const changeCallSounds = (enabled: boolean) => {
    if (!enabled) playCallSound('mute')
    saveCallSoundsEnabled(enabled)
    setCallSoundsEnabled(enabled)
    if (enabled) {
      primeCallSounds()
      playCallSound('unmute')
    }
  }

  const changeGameOverlay = (enabled: boolean) => {
    saveGameOverlayEnabled(enabled)
    setGameOverlayEnabled(enabled)
  }

  const toggleDeafen = useCallback(() => {
    setDeafened((current) => {
      const next = !current
      playCallSound(next ? 'deafen' : 'undeafen')
      return next
    })
  }, [])

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(createChannelInviteUrl(channelId || roomCode))
      setCopyState('Link copiado')
      window.setTimeout(() => setCopyState('Copiar link'), 1600)
    } catch {
      setCopyState('Copie pela barra do navegador')
    }
  }

  const enableAudio = async () => {
    try {
      await room.startAudio()
      setAudioBlocked(false)
    } catch {
      setAudioBlocked(true)
    }
  }

  const leaveCall = useCallback(async () => {
    try {
      if (screenShare.isSharing) await screenShare.stop()
    } finally {
      await onLeave()
    }
  }, [onLeave, screenShare])

  const shortcuts = useCallShortcuts({
    microphone: () => void toggleMicrophone(),
    deafen: toggleDeafen,
    camera: () => void toggleCamera(),
    screenShare: () => {
      if (screenShare.isStarting || status === 'reconnecting') return
      void (screenShare.isSharing ? screenShare.stop() : screenShare.start())
    },
    leave: () => void leaveCall(),
  }, !settingsOpen)

  const openParticipantMenu = (participantId: string, point: ContextMenuPoint) => {
    setLayoutMenuPoint(null)
    setParticipantMenu({ participantId, point })
  }

  const changeGalleryLayout = (layout: GalleryLayoutMode) => {
    setGalleryLayout(layout)
    saveGalleryLayout(layout)
  }

  const selectedParticipant = participantMenu
    ? snapshot.participantMedia.find((participant) => participant.id === participantMenu.participantId)
    : undefined
  const selectedVoice = participantMenu
    ? snapshot.remoteVoices.find((voice) => voice.id === participantMenu.participantId)
    : undefined

  return (
    <main className={`call-shell ${chatOpen ? 'call-shell--chat-open' : ''} ${participantsOpen ? 'call-shell--participants-open' : ''}`}>
      <header className="call-header">
        <div className="brand brand--compact">
          <BrandMark />
          <h1>SPLOTYS</h1>
        </div>

        <div className="room-plate">
          <strong>{roomCode}</strong>
          <button
            aria-label="Copiar link de convite"
            onClick={() => void copyRoomCode()}
            title={copyState}
            type="button"
          >
            <Icon name="copy" />
          </button>
          <output
            aria-live="polite"
            className={`room-copy-feedback ${copyState !== 'Copiar link' ? 'is-visible' : ''}`}
          >
            {copyState}
          </output>
        </div>

          <div className="call-header__actions">
          {onToggleSidebar && <button aria-label={sidebarVisible ? 'Expandir call e recolher lateral' : 'Restaurar barra lateral'} className="participants-toggle" onClick={onToggleSidebar} title={sidebarVisible ? 'Expandir call' : 'Restaurar lateral'} type="button"><Icon name={sidebarVisible ? 'collapse' : 'layout'} /></button>}
          {onToggleFullscreen && <button aria-label={fullscreen ? 'Sair da tela cheia' : 'Usar tela cheia'} className={`participants-toggle ${fullscreen ? 'is-active' : ''}`} onClick={onToggleFullscreen} title={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'} type="button"><Icon name="expand" /></button>}
          <button
            aria-label={`Layout da galeria: ${galleryLayout === 'cinema' ? 'Priorizar 16:9' : 'Preencher'}`}
            className={`participants-toggle layout-toggle ${layoutMenuPoint ? 'is-active' : ''}`}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              setParticipantMenu(null)
              setChatOpen(false)
              setParticipantsOpen(false)
              setLayoutMenuPoint((current) => current ? null : { x: rect.right - 310, y: rect.bottom + 8 })
            }}
            title="Layout da galeria"
            type="button"
          >
            <Icon name="layout" />
          </button>
          <button
            aria-label={`Abrir participantes, ${snapshot.participants.length} na call`}
            className={`participants-toggle ${participantsOpen ? 'is-active' : ''}`}
            onClick={() => {
              setLayoutMenuPoint(null)
              setChatOpen(false)
              setParticipantsOpen(true)
            }}
            type="button"
          >
            <Icon name="users" />
            <span>{snapshot.participants.length}</span>
          </button>
          <button
            aria-label={`Abrir chat${unreadMessages ? `, ${unreadMessages} novas mensagens` : ''}`}
            className={`participants-toggle chat-toggle ${chatOpen ? 'is-active' : ''}`}
            onClick={() => {
              setLayoutMenuPoint(null)
              setParticipantsOpen(false)
              setChatOpen((current) => !current)
              setUnreadMessages(0)
            }}
            type="button"
          >
            <Icon name="chat" />
            {unreadMessages > 0 && <span>{Math.min(unreadMessages, 99)}</span>}
          </button>
          <div className={`connection-pill connection-pill--${status}`} title={connectionLabel[status]}>
            <i /> <span>{connectionLabel[status]}</span>
          </div>
          <button className="call-header__logout" onClick={() => void onLogout()} type="button">Sair</button>
        </div>
      </header>

      {audioBlocked && (
        <button className="audio-gate" onClick={() => void enableAudio()} type="button">
          <Icon name="audio" />
          <span><strong>Clique para ativar o áudio da call</strong>O navegador bloqueou a reprodução automática.</span>
          <Icon name="chevron" />
        </button>
      )}

      {status === 'reconnecting' && (
        <div className="reconnect-banner" role="status">
          <span className="spinner" /> Sinal instável. Tentando reconectar sem sair da sala…
        </div>
      )}

      <div className="call-workspace">
        <ScreenShareStage
          activeSpeakerIds={snapshot.activeSpeakerIds}
          deafened={deafened}
          galleryLayout={galleryLayout}
          lives={snapshot.lives}
          onParticipantMenu={openParticipantMenu}
          participants={snapshot.participantMedia}
          screenOutputId={devices.preferences.screenOutputId}
        />
      </div>

      {participantsOpen && (
        <button
          aria-label="Fechar participantes"
          className="participant-drawer-backdrop"
          onClick={() => setParticipantsOpen(false)}
          type="button"
        />
      )}
      <ParticipantList
        activeSpeakerIds={snapshot.activeSpeakerIds}
        onClose={() => setParticipantsOpen(false)}
        onParticipantMenu={openParticipantMenu}
        open={participantsOpen}
        participants={snapshot.participants}
        remoteVoices={snapshot.remoteVoices}
        room={room}
      />

      <ParticipantAudioLayer
        deafened={deafened}
        outputDeviceId={devices.preferences.voiceOutputId}
        voices={snapshot.remoteVoices}
      />

      {layoutMenuPoint && (
        <GalleryLayoutMenu
          layout={galleryLayout}
          onChange={changeGalleryLayout}
          onClose={() => setLayoutMenuPoint(null)}
          point={layoutMenuPoint}
        />
      )}

      {selectedParticipant && participantMenu && (
        <ParticipantContextMenu
          onClose={() => setParticipantMenu(null)}
          participant={selectedParticipant}
          point={participantMenu.point}
          voice={selectedVoice}
        />
      )}

      <ChatPanel
        error={chat.error}
        messages={chat.messages}
        onClose={() => setChatOpen(false)}
        onErrorClose={chat.clearError}
        onSendImage={chat.sendImage}
        onSendText={chat.sendText}
        open={chatOpen}
      />

      <div className="call-notices" aria-live="polite">
        {callLimitNotice && <Notice onClose={() => setCallLimitNotice('')} warning>{callLimitNotice}</Notice>}
        {microphoneError && (
          <Notice
            actionLabel={
              window.splotysDesktop?.platform === 'win32' &&
              microphoneError.includes('Permissão')
                ? 'Abrir permissões'
                : undefined
            }
            onAction={
              microphoneError.includes('Permissão')
                ? window.splotysDesktop?.openMicrophoneSettings
                : undefined
            }
            onClose={() => onMicrophoneErrorChange('')}
            warning
          >
            {microphoneError}
          </Notice>
        )}
        {cameraError && (
          <Notice onClose={() => setCameraError('')} warning>{cameraError}</Notice>
        )}
        {microphoneProcessing.error && (
          <Notice onClose={microphoneProcessing.clearError} warning>{microphoneProcessing.error}</Notice>
        )}
        {microphoneMonitor.error && (
          <Notice onClose={microphoneMonitor.clearError} warning>{microphoneMonitor.error}</Notice>
        )}
        {screenShare.error && (
          <Notice onClose={screenShare.clearError} warning>{screenShare.error}</Notice>
        )}
      </div>

      <footer className="call-dock">
        <div className="call-dock__group">
          <ControlButton
            detail={micBusy || microphoneStarting ? 'Aguarde' : micEnabled ? 'Transmitindo' : 'Silenciado'}
            disabled={micBusy || microphoneStarting || status === 'reconnecting'}
            error={Boolean(microphoneError)}
            icon={micEnabled ? 'mic' : 'micOff'}
            label="Microfone"
            muted={!micEnabled}
            onClick={() => void toggleMicrophone()}
          />
          <ControlButton
            detail={cameraBusy ? 'Aguarde' : cameraEnabled ? 'Câmera ligada' : 'Câmera desligada'}
            disabled={cameraBusy || status === 'reconnecting'}
            error={Boolean(cameraError)}
            icon={cameraEnabled ? 'camera' : 'cameraOff'}
            label="Câmera"
            muted={!cameraEnabled}
            onClick={() => void toggleCamera()}
          />
          <ControlButton
            detail={deafened ? 'Áudio remoto mudo' : 'Áudio remoto ativo'}
            icon={deafened ? 'deafen' : 'headphones'}
            label="Deafen"
            muted={deafened}
            onClick={toggleDeafen}
          />
        </div>

        <div className="call-dock__group call-dock__group--center">
          <ControlButton
            active={screenShare.isSharing}
            detail={
              screenShare.isStarting
                ? 'Aguarde'
                : screenShare.isSharing
                  ? 'Transmitindo agora'
                  : screenShare.isSupported
                    ? streamQualityPresets[effectiveQuality].label
                    : 'Indisponível neste navegador'
            }
            disabled={screenShare.isStarting || status === 'reconnecting'}
            icon="screen"
            label={screenShare.isSharing ? 'Parar transmissão' : 'Compartilhar tela'}
            onClick={() =>
              void (screenShare.isSharing ? screenShare.stop() : screenShare.start())
            }
          />
          <ControlButton
            detail="Áudio e qualidade"
            icon="settings"
            label="Configurações"
            onClick={() => setSettingsOpen(true)}
          />
        </div>

        <div className="call-dock__group call-dock__group--end">
          <ControlButton
            danger
            detail="Encerrar conexão"
            icon="leave"
            label="Sair da call"
            onClick={() => void leaveCall()}
          />
        </div>
      </footer>

      {settingsOpen && (
        <SettingsModal
          callSoundsEnabled={callSoundsEnabled}
          devices={devices}
          gameOverlayEnabled={gameOverlayEnabled}
          microphoneMonitor={microphoneMonitor}
          microphoneProcessing={microphoneProcessing}
          onCallSoundsChange={changeCallSounds}
          onClose={() => setSettingsOpen(false)}
          onGameOverlayChange={changeGameOverlay}
          onQualityChange={changeQuality}
          quality={effectiveQuality}
          canHighQualityScreenShare={canHighQualityScreenShare}
          shortcuts={shortcuts}
          updater={updater}
        />
      )}
    </main>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { RoomEvent, type Room } from 'livekit-client'
import { useAudioDevices } from '../../hooks/useAudioDevices'
import { useRoomSnapshot } from '../../hooks/useRoomSnapshot'
import { useScreenShare } from '../../hooks/useScreenShare'
import { streamQualityPresets } from '../../services/livekit'
import {
  getStreamQuality,
  saveStreamQuality,
} from '../../storage/preferences'
import type { ConnectionStatus, StreamQualityId } from '../../types'
import { ParticipantList } from '../Participants/ParticipantList'
import { ScreenShareStage } from '../ScreenShare/ScreenShareStage'
import { SettingsModal } from '../Settings/SettingsModal'
import { Icon, type IconName } from '../ui/Icon'

interface CallScreenProps {
  room: Room
  roomCode: string
  status: ConnectionStatus
  microphoneError: string
  onMicrophoneErrorChange: (message: string) => void
  onLeave: () => Promise<void>
}

interface ControlButtonProps {
  icon: IconName
  label: string
  detail: string
  active?: boolean
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
  danger,
  disabled,
  error,
  onClick,
}: ControlButtonProps) => (
  <button
    className={`call-control ${active ? 'call-control--active' : ''} ${danger ? 'call-control--danger' : ''} ${error ? 'call-control--error' : ''}`}
    disabled={disabled}
    onClick={onClick}
    type="button"
  >
    <span className="call-control__icon"><Icon name={icon} /></span>
    <span>
      <strong>{label}</strong>
      <small>{detail}</small>
    </span>
  </button>
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
  status,
  microphoneError,
  onMicrophoneErrorChange,
  onLeave,
}: CallScreenProps) => {
  const snapshot = useRoomSnapshot(room)
  const devices = useAudioDevices(room)
  const [deafened, setDeafened] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [quality, setQuality] = useState<StreamQualityId>(getStreamQuality)
  const [micBusy, setMicBusy] = useState(false)
  const [cameraBusy, setCameraBusy] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [copyState, setCopyState] = useState('Copiar')
  const [audioBlocked, setAudioBlocked] = useState(!room.canPlaybackAudio)
  const screenShare = useScreenShare(room, quality)
  const micEnabled = room.localParticipant.isMicrophoneEnabled
  const cameraEnabled = room.localParticipant.isCameraEnabled

  useEffect(() => {
    const handlePlayback = (playing: boolean) => setAudioBlocked(!playing)
    room.on(RoomEvent.AudioPlaybackStatusChanged, handlePlayback)
    setAudioBlocked(!room.canPlaybackAudio)
    return () => {
      room.off(RoomEvent.AudioPlaybackStatusChanged, handlePlayback)
    }
  }, [room])

  const toggleMicrophone = useCallback(async () => {
    setMicBusy(true)
    try {
      await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled)
      onMicrophoneErrorChange('')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        onMicrophoneErrorChange('Permissão do microfone negada. Libere o acesso no navegador.')
      } else {
        onMicrophoneErrorChange('Não foi possível alterar o estado do microfone.')
      }
    } finally {
      setMicBusy(false)
    }
  }, [onMicrophoneErrorChange, room])

  const toggleCamera = useCallback(async () => {
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
  }, [room])

  const changeQuality = (nextQuality: StreamQualityId) => {
    setQuality(nextQuality)
    saveStreamQuality(nextQuality)
  }

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode)
      setCopyState('Copiado')
      window.setTimeout(() => setCopyState('Copiar'), 1600)
    } catch {
      setCopyState('Selecione o código')
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

  const leaveCall = async () => {
    try {
      if (screenShare.isSharing) await screenShare.stop()
    } finally {
      await onLeave()
    }
  }

  return (
    <main className="call-shell">
      <header className="call-header">
        <div className="brand brand--compact">
          <span className="brand__mark">FK</span>
          <div>
            <p className="brand__eyebrow">PRIVATE COMMS</p>
            <h1>FORD KALL</h1>
          </div>
        </div>

        <div className="room-plate">
          <span>SALA ATUAL</span>
          <strong>{roomCode}</strong>
          <button onClick={() => void copyRoomCode()} title={copyState} type="button">
            <Icon name="copy" />
          </button>
          <output
            aria-live="polite"
            className={`room-copy-feedback ${copyState !== 'Copiar' ? 'is-visible' : ''}`}
          >
            {copyState}
          </output>
        </div>

        <div className={`connection-pill connection-pill--${status}`}>
          <i /> {connectionLabel[status]}
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
        <ParticipantList
          activeSpeakerIds={snapshot.activeSpeakerIds}
          deafened={deafened}
          participants={snapshot.participants}
          remoteVoices={snapshot.remoteVoices}
          room={room}
          voiceOutputId={devices.preferences.voiceOutputId}
        />
        <ScreenShareStage
          activeSpeakerIds={snapshot.activeSpeakerIds}
          deafened={deafened}
          lives={snapshot.lives}
          participants={snapshot.participantMedia}
          screenOutputId={devices.preferences.screenOutputId}
        />
      </div>

      <div className="call-notices" aria-live="polite">
        {microphoneError && (
          <div className="notice notice--warning">
            <Icon name="warning" /> {microphoneError}
          </div>
        )}
        {cameraError && (
          <div className="notice notice--warning">
            <Icon name="warning" /> {cameraError}
          </div>
        )}
        {screenShare.isSharing && !screenShare.hasAudio && !screenShare.isStarting && (
          <div className="notice">
            <Icon name="warning" /> Sua tela está sendo transmitida sem áudio. Em uma aba, marque “Compartilhar áudio”.
          </div>
        )}
        {screenShare.error && (
          <div className="notice notice--warning"><Icon name="warning" /> {screenShare.error}</div>
        )}
      </div>

      <footer className="call-dock">
        <div className="call-dock__group">
          <ControlButton
            active={!micEnabled}
            detail={micBusy ? 'Aguarde' : micEnabled ? 'Transmitindo' : 'Silenciado'}
            disabled={micBusy || status === 'reconnecting'}
            error={Boolean(microphoneError)}
            icon="mic"
            label="Microfone"
            onClick={() => void toggleMicrophone()}
          />
          <ControlButton
            active={!cameraEnabled}
            detail={cameraBusy ? 'Aguarde' : cameraEnabled ? 'Câmera ligada' : 'Câmera desligada'}
            disabled={cameraBusy || status === 'reconnecting'}
            error={Boolean(cameraError)}
            icon="camera"
            label="Câmera"
            onClick={() => void toggleCamera()}
          />
          <ControlButton
            active={deafened}
            detail={deafened ? 'Áudio remoto mudo' : 'Áudio remoto ativo'}
            icon="deafen"
            label="Deafen"
            onClick={() => setDeafened((current) => !current)}
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
                  : streamQualityPresets[quality].label
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
          devices={devices}
          onClose={() => setSettingsOpen(false)}
          onQualityChange={changeQuality}
          quality={quality}
        />
      )}
    </main>
  )
}

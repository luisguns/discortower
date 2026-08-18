import { useEffect, useRef, useState, type RefObject } from 'react'
import type { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client'
import { useParticipantVolume } from '../../hooks/useParticipantVolume'
import type { ParticipantMedia, ScreenShareLive } from '../../types'
import { RemoteAudioRenderer } from '../AudioControls/RemoteAudioRenderer'
import { VolumeControl } from '../AudioControls/VolumeControl'
import { ParticipantGallery } from '../Participants/ParticipantGallery'
import { Icon } from '../ui/Icon'

const VideoRenderer = ({
  track,
  videoRef,
}: {
  track: LocalVideoTrack | RemoteVideoTrack
  videoRef: RefObject<HTMLVideoElement | null>
}) => {
  useEffect(() => {
    const element = videoRef.current
    if (!element) return
    track.attach(element)
    return () => {
      track.detach(element)
      element.pause()
      element.srcObject = null
      element.removeAttribute('src')
      element.load()
    }
  }, [track, videoRef])

  return <video autoPlay muted playsInline ref={videoRef} />
}

interface LiveControlsProps {
  live: ScreenShareLive
  deafened: boolean
  screenOutputId: string
  open: boolean
  onClose: () => void
}

const LiveAudioControls = ({
  live,
  deafened,
  screenOutputId,
  open,
  onClose,
}: LiveControlsProps) => {
  const [volume, setVolume] = useParticipantVolume(live.participantIdentity, 'screen')
  const [mutedLocally, setMutedLocally] = useState(false)

  return (
    <>
      {!live.isLocal && (
        <RemoteAudioRenderer
          deafened={deafened}
          muted={mutedLocally || live.muted}
          outputDeviceId={screenOutputId}
          track={live.audioTrack}
          volume={volume}
        />
      )}

      {open && (
        <div aria-label="Controles da transmissão" className="live-controls-popover" role="dialog">
          <header>
            <div>
              <small>TRANSMISSÃO</small>
              <strong>{live.participantName}</strong>
            </div>
            <button aria-label="Fechar controles da transmissão" className="icon-button" onClick={onClose} type="button">
              <Icon name="x" />
            </button>
          </header>

          {live.isLocal ? (
            <p>Sua tela está no ar. Use o botão do dock para encerrar a transmissão.</p>
          ) : live.audioTrack ? (
            <div className="live-controls-popover__section">
              <div>
                <span>Áudio só para você</span>
                <small>Volume independente da voz</small>
              </div>
              <VolumeControl
                label={`Volume da transmissão de ${live.participantName}`}
                muted={mutedLocally || live.muted}
                onChange={setVolume}
                onMuteToggle={() => setMutedLocally((current) => !current)}
                value={volume}
              />
            </div>
          ) : (
            <p>Essa transmissão chegou sem uma faixa de áudio compartilhada.</p>
          )}
        </div>
      )}
    </>
  )
}

interface ScreenShareStageProps {
  lives: ScreenShareLive[]
  participants: ParticipantMedia[]
  activeSpeakerIds: Set<string>
  deafened: boolean
  screenOutputId: string
  onParticipantSelect: (participantId: string) => void
}

export const ScreenShareStage = ({
  lives,
  participants,
  activeSpeakerIds,
  deafened,
  screenOutputId,
  onParticipantSelect,
}: ScreenShareStageProps) => {
  const [selectedId, setSelectedId] = useState('')
  const [controlsOpen, setControlsOpen] = useState(false)
  const knownIds = useRef<Set<string>>(new Set())
  const stageRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [pipActive, setPipActive] = useState(false)

  const pipSupported =
    typeof document !== 'undefined' &&
    document.pictureInPictureEnabled &&
    'requestPictureInPicture' in HTMLVideoElement.prototype

  useEffect(() => {
    const currentIds = new Set(lives.map((live) => live.id))
    const newest = [...lives].reverse().find((live) => !knownIds.current.has(live.id))
    if (newest) setSelectedId(newest.id)
    else if (!currentIds.has(selectedId)) setSelectedId(lives.at(-1)?.id ?? '')
    knownIds.current = currentIds
  }, [lives, selectedId])

  const selectedLive = lives.find((live) => live.id === selectedId) ?? lives.at(-1)

  useEffect(() => {
    setControlsOpen(false)
    const video = videoRef.current
    if (!video) return
    const handleEnter = () => setPipActive(true)
    const handleLeave = () => setPipActive(false)
    video.addEventListener('enterpictureinpicture', handleEnter)
    video.addEventListener('leavepictureinpicture', handleLeave)
    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnter)
      video.removeEventListener('leavepictureinpicture', handleLeave)
    }
  }, [selectedLive?.id])

  const togglePictureInPicture = async () => {
    const video = videoRef.current
    if (!video || !pipSupported) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await video.requestPictureInPicture()
    } catch {
      setPipActive(false)
    }
  }

  if (!selectedLive) {
    return (
      <ParticipantGallery
        activeSpeakerIds={activeSpeakerIds}
        onParticipantSelect={onParticipantSelect}
        participants={participants}
      />
    )
  }

  return (
    <section className="stream-stage" ref={stageRef}>
      <div className="stream-stage__topbar">
        <div className="stream-stage__identity">
          <span className="live-badge"><i /> AO VIVO</span>
          <strong>{selectedLive.participantName}</strong>
        </div>
        <div className="stream-stage__actions">
          <button
            aria-label="Abrir controles da transmissão"
            className={`icon-button ${controlsOpen ? 'icon-button--active' : ''}`}
            onClick={() => setControlsOpen((current) => !current)}
            title="Áudio da transmissão"
            type="button"
          >
            <Icon name="controls" />
          </button>
          <button
            aria-label={pipActive ? 'Fechar Picture-in-Picture' : 'Abrir Picture-in-Picture'}
            className={`icon-button ${pipActive ? 'icon-button--active' : ''}`}
            disabled={!pipSupported}
            onClick={() => void togglePictureInPicture()}
            title={pipSupported ? 'Picture-in-Picture' : 'PiP não suportado neste navegador'}
            type="button"
          >
            <Icon name="pip" />
          </button>
          <button
            aria-label="Ver transmissão em tela cheia"
            className="icon-button"
            onClick={() => void stageRef.current?.requestFullscreen()}
            title="Tela cheia"
            type="button"
          >
            <Icon name="expand" />
          </button>
        </div>
      </div>

      <LiveAudioControls
        key={selectedLive.id}
        deafened={deafened}
        live={selectedLive}
        onClose={() => setControlsOpen(false)}
        open={controlsOpen}
        screenOutputId={screenOutputId}
      />

      {lives.length > 1 && (
        <div className="live-switcher" aria-label="Escolher transmissão">
          {lives.map((live) => (
            <button
              className={live.id === selectedLive.id ? 'is-active' : ''}
              key={live.id}
              onClick={() => setSelectedId(live.id)}
              type="button"
            >
              <i /> {live.participantName}
            </button>
          ))}
        </div>
      )}

      <div className="stream-stage__video">
        <VideoRenderer track={selectedLive.videoTrack} videoRef={videoRef} />
      </div>

      <ParticipantGallery
        activeSpeakerIds={activeSpeakerIds}
        compact
        onParticipantSelect={onParticipantSelect}
        participants={participants}
      />
    </section>
  )
}

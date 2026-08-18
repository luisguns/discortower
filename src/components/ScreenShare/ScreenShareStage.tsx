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
  }, [track])

  return <video autoPlay muted playsInline ref={videoRef} />
}

interface LiveControlsProps {
  live: ScreenShareLive
  deafened: boolean
  screenOutputId: string
}

const LiveAudioControls = ({ live, deafened, screenOutputId }: LiveControlsProps) => {
  const [volume, setVolume] = useParticipantVolume(live.participantIdentity, 'screen')
  const [mutedLocally, setMutedLocally] = useState(false)

  if (live.isLocal) {
    return <span className="live-self-label">Sua transmissão</span>
  }

  return (
    <>
      {live.audioTrack ? (
        <VolumeControl
          label={`Volume da live de ${live.participantName}`}
          muted={mutedLocally || live.muted}
          onChange={setVolume}
          onMuteToggle={() => setMutedLocally((current) => !current)}
          value={volume}
        />
      ) : (
        <span className="live-no-audio">Sem áudio compartilhado</span>
      )}
      <RemoteAudioRenderer
        deafened={deafened}
        muted={mutedLocally || live.muted}
        outputDeviceId={screenOutputId}
        track={live.audioTrack}
        volume={volume}
      />
    </>
  )
}

interface ScreenShareStageProps {
  lives: ScreenShareLive[]
  participants: ParticipantMedia[]
  activeSpeakerIds: Set<string>
  deafened: boolean
  screenOutputId: string
}

export const ScreenShareStage = ({
  lives,
  participants,
  activeSpeakerIds,
  deafened,
  screenOutputId,
}: ScreenShareStageProps) => {
  const [selectedId, setSelectedId] = useState('')
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
        participants={participants}
      />
    )
  }

  return (
    <section className="stream-stage" ref={stageRef}>
      <div className="stream-stage__topbar">
        <div>
          <span className="live-badge"><i /> AO VIVO</span>
          <strong>{selectedLive.participantName}</strong>
        </div>
        <div className="stream-stage__actions">
          <LiveAudioControls
            key={selectedLive.id}
            deafened={deafened}
            live={selectedLive}
            screenOutputId={screenOutputId}
          />
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
        participants={participants}
      />
    </section>
  )
}

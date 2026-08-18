import { useEffect, useRef, useState } from 'react'
import type { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client'
import { useParticipantVolume } from '../../hooks/useParticipantVolume'
import type { ScreenShareLive } from '../../types'
import { RemoteAudioRenderer } from '../AudioControls/RemoteAudioRenderer'
import { VolumeControl } from '../AudioControls/VolumeControl'
import { Icon } from '../ui/Icon'

const VideoRenderer = ({
  track,
}: {
  track: LocalVideoTrack | RemoteVideoTrack
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)

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
  const [volume, setVolume] = useParticipantVolume(live.participantName, 'screen')

  if (live.isLocal) {
    return <span className="live-self-label">Sua transmissão</span>
  }

  return (
    <>
      {live.audioTrack ? (
        <VolumeControl
          label={`Volume da live de ${live.participantName}`}
          onChange={setVolume}
          value={volume}
        />
      ) : (
        <span className="live-no-audio">Sem áudio compartilhado</span>
      )}
      <RemoteAudioRenderer
        deafened={deafened}
        outputDeviceId={screenOutputId}
        track={live.audioTrack}
        volume={live.muted ? 0 : volume}
      />
    </>
  )
}

interface ScreenShareStageProps {
  lives: ScreenShareLive[]
  deafened: boolean
  screenOutputId: string
}

export const ScreenShareStage = ({
  lives,
  deafened,
  screenOutputId,
}: ScreenShareStageProps) => {
  const [selectedId, setSelectedId] = useState('')
  const knownIds = useRef<Set<string>>(new Set())
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const currentIds = new Set(lives.map((live) => live.id))
    const newest = [...lives].reverse().find((live) => !knownIds.current.has(live.id))
    if (newest) setSelectedId(newest.id)
    else if (!currentIds.has(selectedId)) setSelectedId(lives.at(-1)?.id ?? '')
    knownIds.current = currentIds
  }, [lives, selectedId])

  const selectedLive = lives.find((live) => live.id === selectedId) ?? lives.at(-1)

  if (!selectedLive) {
    return (
      <section className="stream-stage stream-stage--empty">
        <div className="stream-empty__icon">
          <Icon name="screen" />
          <span />
        </div>
        <p className="eyebrow">PALCO LIVRE</p>
        <h2>Nenhuma transmissão ativa</h2>
        <p>Compartilhe uma aba, janela ou tela para começar.</p>
        <small>Para transmitir som, marque “Compartilhar áudio da guia”.</small>
      </section>
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
            deafened={deafened}
            live={selectedLive}
            screenOutputId={screenOutputId}
          />
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
        <VideoRenderer track={selectedLive.videoTrack} />
      </div>
    </section>
  )
}

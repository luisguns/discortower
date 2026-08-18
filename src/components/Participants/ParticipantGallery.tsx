import { useEffect, useRef } from 'react'
import type { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client'
import type { ParticipantMedia } from '../../types'
import { Icon } from '../ui/Icon'

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

const CameraRenderer = ({
  isLocal,
  track,
}: {
  isLocal: boolean
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

  return (
    <video
      autoPlay
      className={isLocal ? 'is-local' : ''}
      muted
      playsInline
      ref={videoRef}
    />
  )
}

interface ParticipantGalleryProps {
  participants: ParticipantMedia[]
  activeSpeakerIds: Set<string>
  compact?: boolean
}

export const ParticipantGallery = ({
  participants,
  activeSpeakerIds,
  compact = false,
}: ParticipantGalleryProps) => (
  <section className={`participant-gallery ${compact ? 'participant-gallery--compact' : ''}`}>
    {!compact && (
      <header className="participant-gallery__header">
        <div>
          <p className="eyebrow">PÁTIO DA CALL</p>
          <h2>Todo mundo por aqui</h2>
        </div>
        <span><i /> {participants.length} online</span>
      </header>
    )}

    <div className="participant-gallery__grid">
      {participants.map((participant) => {
        const speaking = activeSpeakerIds.has(participant.id)
        return (
          <article
            className={`gallery-person ${speaking ? 'gallery-person--speaking' : ''} ${participant.cameraTrack && participant.cameraEnabled ? 'gallery-person--camera' : ''}`}
            key={participant.id}
          >
            {participant.cameraTrack && participant.cameraEnabled ? (
              <CameraRenderer isLocal={participant.isLocal} track={participant.cameraTrack} />
            ) : (
              <div className="gallery-person__avatar">
                <span>{initials(participant.name)}</span>
                <small>{speaking ? 'Falando agora' : 'Na escuta'}</small>
              </div>
            )}
            <div className="gallery-person__meta">
              <strong>{participant.name}{participant.isLocal ? ' · Você' : ''}</strong>
              <span className={participant.microphoneMuted ? 'is-muted' : ''}>
                <Icon name="mic" />
              </span>
            </div>
          </article>
        )
      })}
    </div>

    {!compact && (
      <footer className="participant-gallery__hint">
        <Icon name="camera" /> Ligue a câmera ou compartilhe sua tela para ocupar o palco.
      </footer>
    )}
  </section>
)

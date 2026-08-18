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

  return <video autoPlay className={isLocal ? 'is-local' : ''} muted playsInline ref={videoRef} />
}

interface ParticipantGalleryProps {
  participants: ParticipantMedia[]
  activeSpeakerIds: Set<string>
  compact?: boolean
  onParticipantSelect: (participantId: string) => void
}

export const ParticipantGallery = ({
  participants,
  activeSpeakerIds,
  compact = false,
  onParticipantSelect,
}: ParticipantGalleryProps) => (
  <section
    aria-label="Pessoas na call"
    className={`participant-gallery ${compact ? 'participant-gallery--compact' : ''}`}
    data-count={Math.min(participants.length, 6)}
  >
    <div className="participant-gallery__grid">
      {participants.map((participant) => {
        const speaking = activeSpeakerIds.has(participant.id)
        return (
          <button
            aria-label={`Abrir controles de ${participant.name}`}
            className={`gallery-person ${speaking ? 'gallery-person--speaking' : ''} ${participant.cameraTrack && participant.cameraEnabled ? 'gallery-person--camera' : ''}`}
            key={participant.id}
            onClick={() => onParticipantSelect(participant.id)}
            type="button"
          >
            {participant.cameraTrack && participant.cameraEnabled ? (
              <CameraRenderer isLocal={participant.isLocal} track={participant.cameraTrack} />
            ) : (
              <div className="gallery-person__avatar"><span>{initials(participant.name)}</span></div>
            )}
            <div className="gallery-person__meta">
              <strong>{participant.name}{participant.isLocal ? ' · Você' : ''}</strong>
              <span className={participant.microphoneMuted ? 'is-muted' : ''}>
                <Icon name="mic" />
              </span>
            </div>
          </button>
        )
      })}
    </div>
  </section>
)

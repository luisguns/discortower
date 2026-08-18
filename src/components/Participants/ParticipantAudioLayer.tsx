import { useParticipantVolume } from '../../hooks/useParticipantVolume'
import type { RemoteVoice } from '../../types'
import { RemoteAudioRenderer } from '../AudioControls/RemoteAudioRenderer'

const ParticipantVoice = ({
  voice,
  deafened,
  outputDeviceId,
}: {
  voice: RemoteVoice
  deafened: boolean
  outputDeviceId: string
}) => {
  const [volume] = useParticipantVolume(voice.participant.identity, 'voice')
  return (
    <RemoteAudioRenderer
      deafened={deafened}
      muted={voice.muted || volume === 0}
      outputDeviceId={outputDeviceId}
      track={voice.track}
      volume={volume}
    />
  )
}

export const ParticipantAudioLayer = ({
  voices,
  deafened,
  outputDeviceId,
}: {
  voices: RemoteVoice[]
  deafened: boolean
  outputDeviceId: string
}) => (
  <>
    {voices.map((voice) => (
      <ParticipantVoice
        deafened={deafened}
        key={voice.id}
        outputDeviceId={outputDeviceId}
        voice={voice}
      />
    ))}
  </>
)

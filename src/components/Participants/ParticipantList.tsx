import { useState } from 'react'
import { Track, type Participant, type Room } from 'livekit-client'
import { useParticipantVolume } from '../../hooks/useParticipantVolume'
import type { RemoteVoice } from '../../types'
import { RemoteAudioRenderer } from '../AudioControls/RemoteAudioRenderer'
import { VolumeControl } from '../AudioControls/VolumeControl'
import { Icon } from '../ui/Icon'

interface ParticipantListProps {
  room: Room
  participants: Participant[]
  remoteVoices: RemoteVoice[]
  activeSpeakerIds: Set<string>
  deafened: boolean
  voiceOutputId: string
}

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

const LocalParticipantRow = ({ room, speaking }: { room: Room; speaking: boolean }) => {
  const participant = room.localParticipant
  const name = participant.name || participant.identity
  const publication = participant.getTrackPublication(Track.Source.Microphone)
  const muted = !participant.isMicrophoneEnabled || publication?.isMuted

  return (
    <li className={`participant ${speaking ? 'participant--speaking' : ''}`}>
      <div className="participant__topline">
        <span className="participant__avatar">{initials(name)}</span>
        <span className="participant__identity">
          <strong>{name}</strong>
          <small>Você</small>
        </span>
        <span className={`participant__mic ${muted ? 'participant__mic--muted' : ''}`}>
          <Icon name="mic" />
        </span>
      </div>
    </li>
  )
}

interface RemoteParticipantRowProps {
  voice: RemoteVoice
  speaking: boolean
  deafened: boolean
  outputDeviceId: string
}

const RemoteParticipantRow = ({
  voice,
  speaking,
  deafened,
  outputDeviceId,
}: RemoteParticipantRowProps) => {
  const name = voice.participant.name || voice.participant.identity
  const [volume, setVolume] = useParticipantVolume(voice.participant.identity, 'voice')
  const [mutedLocally, setMutedLocally] = useState(false)

  return (
    <li className={`participant ${speaking ? 'participant--speaking' : ''}`}>
      <div className="participant__topline">
        <span className="participant__avatar">{initials(name)}</span>
        <span className="participant__identity">
          <strong>{name}</strong>
          <small>{voice.track ? (speaking ? 'Falando' : 'Na escuta') : 'Sem microfone'}</small>
        </span>
        <span className={`participant__mic ${voice.muted ? 'participant__mic--muted' : ''}`}>
          <Icon name="mic" />
        </span>
      </div>

      <VolumeControl
        label={`Volume do microfone de ${name}`}
        muted={mutedLocally}
        onChange={setVolume}
        onMuteToggle={() => setMutedLocally((current) => !current)}
        value={volume}
      />
      <RemoteAudioRenderer
        deafened={deafened}
        outputDeviceId={outputDeviceId}
        muted={mutedLocally}
        track={voice.track}
        volume={volume}
      />
    </li>
  )
}

export const ParticipantList = ({
  room,
  participants,
  remoteVoices,
  activeSpeakerIds,
  deafened,
  voiceOutputId,
}: ParticipantListProps) => (
  <aside className="participants-panel">
    <div className="panel-heading">
      <span>
        <Icon name="users" /> Participantes
      </span>
      <b>{participants.length.toString().padStart(2, '0')}</b>
    </div>

    <ul className="participants-list">
      <LocalParticipantRow
        room={room}
        speaking={activeSpeakerIds.has(room.localParticipant.identity)}
      />
      {remoteVoices.map((voice) => (
        <RemoteParticipantRow
          deafened={deafened}
          key={voice.id}
          outputDeviceId={voiceOutputId}
          speaking={activeSpeakerIds.has(voice.participant.identity)}
          voice={voice}
        />
      ))}
    </ul>

    {participants.length === 1 && (
      <div className="participants-empty">
        <span className="signal-bars" aria-hidden="true">
          <i /> <i /> <i />
        </span>
        <p>Aguardando os outros pilotos.</p>
        <small>Compartilhe o código da sala.</small>
      </div>
    )}
  </aside>
)

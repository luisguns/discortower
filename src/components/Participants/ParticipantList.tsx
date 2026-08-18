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
  open: boolean
  selectedParticipantId: string | null
  onClose: () => void
  onParticipantSelect: (participantId: string) => void
}

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

interface LocalParticipantRowProps {
  room: Room
  speaking: boolean
  selected: boolean
  onSelect: () => void
}

const LocalParticipantRow = ({
  room,
  speaking,
  selected,
  onSelect,
}: LocalParticipantRowProps) => {
  const participant = room.localParticipant
  const name = participant.name || participant.identity
  const publication = participant.getTrackPublication(Track.Source.Microphone)
  const muted = !participant.isMicrophoneEnabled || publication?.isMuted

  return (
    <li className={`participant ${speaking ? 'participant--speaking' : ''} ${selected ? 'participant--selected' : ''}`}>
      <button
        aria-expanded={selected}
        className="participant__summary"
        onClick={onSelect}
        type="button"
      >
        <span className="participant__avatar">{initials(name)}</span>
        <span className="participant__identity">
          <strong>{name}</strong>
          <small>{speaking ? 'Falando agora' : 'Você'}</small>
        </span>
        <span className={`participant__mic ${muted ? 'participant__mic--muted' : ''}`}>
          <Icon name="mic" />
        </span>
      </button>
      {selected && (
        <div className="participant__details">
          <p>Seus controles de microfone e câmera ficam no dock da call.</p>
        </div>
      )}
    </li>
  )
}

interface RemoteParticipantRowProps {
  voice: RemoteVoice
  speaking: boolean
  deafened: boolean
  outputDeviceId: string
  selected: boolean
  onSelect: () => void
}

const RemoteParticipantRow = ({
  voice,
  speaking,
  deafened,
  outputDeviceId,
  selected,
  onSelect,
}: RemoteParticipantRowProps) => {
  const name = voice.participant.name || voice.participant.identity
  const [volume, setVolume] = useParticipantVolume(voice.participant.identity, 'voice')
  const [mutedLocally, setMutedLocally] = useState(false)

  return (
    <li className={`participant ${speaking ? 'participant--speaking' : ''} ${selected ? 'participant--selected' : ''}`}>
      <button
        aria-expanded={selected}
        className="participant__summary"
        onClick={onSelect}
        type="button"
      >
        <span className="participant__avatar">{initials(name)}</span>
        <span className="participant__identity">
          <strong>{name}</strong>
          <small>{voice.track ? (speaking ? 'Falando agora' : 'Na call') : 'Sem microfone'}</small>
        </span>
        <span className={`participant__mic ${voice.muted ? 'participant__mic--muted' : ''}`}>
          <Icon name="mic" />
        </span>
      </button>

      {selected && (
        <div className="participant__details">
          <div className="participant__details-heading">
            <span>Áudio só para você</span>
            <small>Não afeta os outros</small>
          </div>
          <VolumeControl
            label={`Volume do microfone de ${name}`}
            muted={mutedLocally}
            onChange={setVolume}
            onMuteToggle={() => setMutedLocally((current) => !current)}
            value={volume}
          />
        </div>
      )}

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
  open,
  selectedParticipantId,
  onClose,
  onParticipantSelect,
}: ParticipantListProps) => (
  <aside
    aria-hidden={!open}
    aria-label="Participantes da call"
    className={`participants-panel ${open ? 'is-open' : ''}`}
  >
    <div className="panel-heading">
      <span><Icon name="users" /> Pessoas na call</span>
      <div>
        <b>{participants.length}</b>
        <button
          aria-label="Fechar participantes"
          className="icon-button"
          onClick={onClose}
          type="button"
        >
          <Icon name="x" />
        </button>
      </div>
    </div>

    <p className="participants-panel__hint">Clique em alguém para abrir os controles individuais.</p>

    <ul className="participants-list">
      <LocalParticipantRow
        onSelect={() => onParticipantSelect(room.localParticipant.identity)}
        room={room}
        selected={selectedParticipantId === room.localParticipant.identity}
        speaking={activeSpeakerIds.has(room.localParticipant.identity)}
      />
      {remoteVoices.map((voice) => (
        <RemoteParticipantRow
          deafened={deafened}
          key={voice.id}
          onSelect={() => onParticipantSelect(voice.participant.identity)}
          outputDeviceId={voiceOutputId}
          selected={selectedParticipantId === voice.participant.identity}
          speaking={activeSpeakerIds.has(voice.participant.identity)}
          voice={voice}
        />
      ))}
    </ul>

    {participants.length === 1 && (
      <div className="participants-empty">
        <span className="signal-bars" aria-hidden="true"><i /> <i /> <i /></span>
        <p>Só você por enquanto.</p>
        <small>Copie o link da sala para chamar alguém.</small>
      </div>
    )}
  </aside>
)

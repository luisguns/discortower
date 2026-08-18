import { useCallback, useState } from 'react'
import { getParticipantVolume, saveParticipantVolume } from '../storage/preferences'
import type { AudioChannel } from '../types'

export const useParticipantVolume = (participantName: string, channel: AudioChannel) => {
  const [volume, setVolumeState] = useState(() => getParticipantVolume(participantName, channel))

  const setVolume = useCallback(
    (nextVolume: number) => {
      const normalized = Math.min(1, Math.max(0, nextVolume))
      setVolumeState(normalized)
      saveParticipantVolume(participantName, channel, normalized)
    },
    [channel, participantName],
  )

  return [volume, setVolume] as const
}

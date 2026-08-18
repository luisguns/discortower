import { useCallback, useEffect, useState } from 'react'
import {
  getParticipantVolume,
  MAX_PARTICIPANT_VOLUME,
  PARTICIPANT_VOLUME_EVENT,
  saveParticipantVolume,
} from '../storage/preferences'
import type { AudioChannel } from '../types'

export const useParticipantVolume = (participantName: string, channel: AudioChannel) => {
  const [volume, setVolumeState] = useState(() => getParticipantVolume(participantName, channel))

  useEffect(() => {
    const syncVolume = (event: Event) => {
      const detail = (event as CustomEvent<{
        participantName: string
        channel: AudioChannel
        volume: number
      }>).detail
      if (detail.participantName === participantName && detail.channel === channel) {
        setVolumeState(detail.volume)
      }
    }
    window.addEventListener(PARTICIPANT_VOLUME_EVENT, syncVolume)
    return () => window.removeEventListener(PARTICIPANT_VOLUME_EVENT, syncVolume)
  }, [channel, participantName])

  const setVolume = useCallback(
    (nextVolume: number) => {
      const normalized = Math.min(MAX_PARTICIPANT_VOLUME, Math.max(0, nextVolume))
      setVolumeState(normalized)
      saveParticipantVolume(participantName, channel, normalized)
    },
    [channel, participantName],
  )

  return [volume, setVolume] as const
}

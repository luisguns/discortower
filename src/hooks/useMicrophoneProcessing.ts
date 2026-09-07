import { useCallback, useEffect, useState } from 'react'
import { RoomEvent, Track, type LocalAudioTrack, type Room } from '@gunns-dev/control-tower-client'
import {
  getNoiseSuppression,
  saveNoiseSuppression,
} from '../storage/preferences'

export const microphoneCaptureOptions = () => ({
  autoGainControl: true,
  echoCancellation: true,
  noiseSuppression: getNoiseSuppression(),
})

export const useMicrophoneProcessing = (room: Room) => {
  const [noiseSuppression, setNoiseSuppression] = useState(getNoiseSuppression)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const supported =
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices?.getSupportedConstraints().noiseSuppression === true

  const apply = useCallback(
    async (enabled: boolean) => {
      const publication = room.localParticipant.getTrackPublication(Track.Source.Microphone)
      if (publication?.kind !== Track.Kind.Audio || !publication.track) return
      await (publication.track as LocalAudioTrack).applyConstraints({
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: enabled,
      })
    },
    [room],
  )

  useEffect(() => {
    const restore = () => void apply(getNoiseSuppression()).catch(() => undefined)
    room.on(RoomEvent.LocalTrackPublished, restore)
    restore()
    return () => {
      room.off(RoomEvent.LocalTrackPublished, restore)
    }
  }, [apply, room])

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      if (!supported) return
      setBusy(true)
      setError('')
      saveNoiseSuppression(enabled)
      setNoiseSuppression(enabled)
      try {
        await apply(enabled)
      } catch {
        setError('O navegador não conseguiu alterar o tratamento de ruído deste microfone.')
      } finally {
        setBusy(false)
      }
    },
    [apply, supported],
  )

  return {
    noiseSuppression,
    supported,
    busy,
    error,
    clearError: () => setError(''),
    setEnabled,
  }
}

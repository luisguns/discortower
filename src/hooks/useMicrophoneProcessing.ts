import { useCallback, useEffect, useRef, useState } from 'react'
import { RoomEvent, Track, type LocalAudioTrack, type Room } from '@gunns-dev/control-tower-client'
import {
  saveNoiseSuppression,
  saveAutoGainControl,
  saveEchoCancellation,
  getMicrophoneProcessingEnabled, saveMicrophoneProcessingEnabled, getMicrophoneProcessingOptions,
} from '../storage/preferences'

export const microphoneCaptureOptions = getMicrophoneProcessingOptions

type ProcessingKey = keyof ReturnType<typeof microphoneCaptureOptions>
const save = {
  autoGainControl: saveAutoGainControl,
  echoCancellation: saveEchoCancellation,
  noiseSuppression: saveNoiseSuppression,
}

export const useMicrophoneProcessing = (room: Room) => {
  const [processingEnabled, setProcessingEnabledState] = useState(getMicrophoneProcessingEnabled)
  const [settings, setSettings] = useState(microphoneCaptureOptions)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [error, setError] = useState('')
  const supported = typeof navigator !== 'undefined'
    ? navigator.mediaDevices?.getSupportedConstraints() ?? {} : {}

  const apply = useCallback(async (options: ReturnType<typeof microphoneCaptureOptions>) => {
    const publication = room.localParticipant.getTrackPublication(Track.Source.Microphone)
    if (publication?.kind !== Track.Kind.Audio || !publication.track) return
    const track = publication.track as LocalAudioTrack
    // applyConstraints replaces the constraint set: retain the chosen device.
    await track.applyConstraints({ ...track.mediaStreamTrack.getConstraints(), ...options })
  }, [room])

  useEffect(() => {
    const restore = () => void apply(microphoneCaptureOptions()).catch(() => {
      setError('Não foi possível restaurar o processamento do microfone. Tente ajustar os filtros novamente.')
    })
    room.on(RoomEvent.LocalTrackPublished, restore)
    restore()
    return () => { room.off(RoomEvent.LocalTrackPublished, restore) }
  }, [apply, room])

  const setProcessing = useCallback(async (key: ProcessingKey, enabled: boolean) => {
    if (!getMicrophoneProcessingEnabled() || !supported[key] || pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const next = { ...microphoneCaptureOptions(), [key]: enabled }
      await apply(next)
      save[key](enabled)
      setSettings(next)
    } catch {
      setError('Não foi possível alterar o processamento deste microfone. A preferência anterior foi mantida.')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }, [apply, supported])

  const setProcessingEnabled = useCallback(async (enabled: boolean) => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const next = getMicrophoneProcessingOptions(enabled)
      await apply(next)
      saveMicrophoneProcessingEnabled(enabled)
      setProcessingEnabledState(enabled)
      setSettings(next)
    } catch {
      setError('Não foi possível alterar o processamento deste microfone. A preferência anterior foi mantida.')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }, [apply])

  return { ...settings, processingEnabled, setProcessingEnabled, supported, busy, error, setProcessing, clearError: () => setError('') }
}

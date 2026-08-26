import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Room,
  RoomEvent,
  supportsAudioOutputSelection,
  type Room as LiveKitRoom,
} from 'livekit-client'
import {
  getDevicePreferences,
  saveDevicePreferences,
} from '../storage/preferences'
import type { DevicePreferences } from '../types'

export const useAudioDevices = (room: LiveKitRoom) => {
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([])
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([])
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([])
  const [preferences, setPreferences] = useState<DevicePreferences>(getDevicePreferences)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const restoredInput = useRef(false)
  const restoredVideoInput = useRef(false)
  const outputSelectionSupported = supportsAudioOutputSelection()

  const refresh = useCallback(async () => {
    try {
      const [nextInputs, nextVideoInputs, nextOutputs] = await Promise.all([
        Room.getLocalDevices('audioinput', false),
        Room.getLocalDevices('videoinput', false),
        outputSelectionSupported
          ? Room.getLocalDevices('audiooutput', false)
          : Promise.resolve([]),
      ])
      setInputs(nextInputs)
      setVideoInputs(nextVideoInputs)
      setOutputs(nextOutputs)
      setError('')

      if (
        !restoredInput.current &&
        preferences.inputId &&
        nextInputs.some((device) => device.deviceId === preferences.inputId)
      ) {
        restoredInput.current = true
        await room.switchActiveDevice('audioinput', preferences.inputId, true)
      }

      if (
        !restoredVideoInput.current &&
        preferences.videoInputId &&
        nextVideoInputs.some((device) => device.deviceId === preferences.videoInputId)
      ) {
        restoredVideoInput.current = true
        await room.switchActiveDevice('videoinput', preferences.videoInputId, true)
      }
    } catch {
      setError('Não foi possível listar os dispositivos de mídia.')
    } finally {
      setLoading(false)
    }
  }, [outputSelectionSupported, preferences.inputId, preferences.videoInputId, room])

  useEffect(() => {
    void refresh()
    room.on(RoomEvent.MediaDevicesChanged, refresh)
    return () => {
      room.off(RoomEvent.MediaDevicesChanged, refresh)
    }
  }, [refresh, room])

  const updatePreferences = useCallback((patch: Partial<DevicePreferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch }
      saveDevicePreferences(next)
      return next
    })
  }, [])

  const switchInput = useCallback(
    async (deviceId: string) => {
      setLoading(true)
      setError('')
      try {
        await room.switchActiveDevice('audioinput', deviceId, true)
        updatePreferences({ inputId: deviceId })
      } catch {
        setError('Não foi possível trocar o microfone.')
      } finally {
        setLoading(false)
      }
    },
    [room, updatePreferences],
  )

  const selectedInput = useMemo(
    () => preferences.inputId || room.getActiveDevice('audioinput') || '',
    [preferences.inputId, room],
  )

  const switchVideoInput = useCallback(
    async (deviceId: string) => {
      setLoading(true)
      setError('')
      try {
        await room.switchActiveDevice('videoinput', deviceId, true)
        updatePreferences({ videoInputId: deviceId })
      } catch {
        setError('Não foi possível trocar a câmera.')
      } finally {
        setLoading(false)
      }
    },
    [room, updatePreferences],
  )

  const selectedVideoInput = useMemo(
    () => preferences.videoInputId || room.getActiveDevice('videoinput') || '',
    [preferences.videoInputId, room],
  )

  return {
    inputs,
    videoInputs,
    outputs,
    preferences,
    selectedInput,
    selectedVideoInput,
    loading,
    error,
    outputSelectionSupported,
    switchInput,
    switchVideoInput,
    setVoiceOutput: (voiceOutputId: string) => updatePreferences({ voiceOutputId }),
    setScreenOutput: (screenOutputId: string) => updatePreferences({ screenOutputId }),
  }
}

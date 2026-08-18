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
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([])
  const [preferences, setPreferences] = useState<DevicePreferences>(getDevicePreferences)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const restoredInput = useRef(false)
  const outputSelectionSupported = supportsAudioOutputSelection()

  const refresh = useCallback(async () => {
    try {
      const [nextInputs, nextOutputs] = await Promise.all([
        Room.getLocalDevices('audioinput', false),
        outputSelectionSupported
          ? Room.getLocalDevices('audiooutput', false)
          : Promise.resolve([]),
      ])
      setInputs(nextInputs)
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
    } catch {
      setError('Não foi possível listar os dispositivos de áudio.')
    } finally {
      setLoading(false)
    }
  }, [outputSelectionSupported, preferences.inputId, room])

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

  return {
    inputs,
    outputs,
    preferences,
    selectedInput,
    loading,
    error,
    outputSelectionSupported,
    switchInput,
    setVoiceOutput: (voiceOutputId: string) => updatePreferences({ voiceOutputId }),
    setScreenOutput: (screenOutputId: string) => updatePreferences({ screenOutputId }),
  }
}

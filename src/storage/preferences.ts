import type { AudioChannel, DevicePreferences, StreamQualityId } from '../types'

const DISPLAY_NAME_KEY = 'ford-kall:display-name'
const VOLUMES_KEY = 'ford-kall:participant-volumes'
const DEVICES_KEY = 'ford-kall:devices'
const QUALITY_KEY = 'ford-kall:stream-quality'

export const MAX_PARTICIPANT_VOLUME = 2

const safeRead = (key: string): string | null => {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const safeWrite = (key: string, value: string) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage may be unavailable in private/restricted browser contexts.
  }
}

export const getDisplayName = () => safeRead(DISPLAY_NAME_KEY) ?? ''

export const saveDisplayName = (name: string) => safeWrite(DISPLAY_NAME_KEY, name)

const volumeKey = (participantName: string, channel: AudioChannel) =>
  `${participantName.trim().toLocaleLowerCase()}:${channel}`

const readVolumes = (): Record<string, number> => {
  const stored = safeRead(VOLUMES_KEY)
  if (!stored) return {}

  try {
    const parsed: unknown = JSON.parse(stored)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {}
  } catch {
    return {}
  }
}

export const getParticipantVolume = (participantName: string, channel: AudioChannel) => {
  const volume = readVolumes()[volumeKey(participantName, channel)]
  return typeof volume === 'number' && Number.isFinite(volume)
    ? Math.min(MAX_PARTICIPANT_VOLUME, Math.max(0, volume))
    : channel === 'screen'
      ? 0.85
      : 0.8
}

export const saveParticipantVolume = (
  participantName: string,
  channel: AudioChannel,
  volume: number,
) => {
  const volumes = readVolumes()
  volumes[volumeKey(participantName, channel)] = Math.min(
    MAX_PARTICIPANT_VOLUME,
    Math.max(0, volume),
  )
  safeWrite(VOLUMES_KEY, JSON.stringify(volumes))
}

const defaultDevices: DevicePreferences = {
  inputId: '',
  voiceOutputId: '',
  screenOutputId: '',
}

export const getDevicePreferences = (): DevicePreferences => {
  const stored = safeRead(DEVICES_KEY)
  if (!stored) return defaultDevices

  try {
    const parsed: unknown = JSON.parse(stored)
    if (!parsed || typeof parsed !== 'object') return defaultDevices
    return { ...defaultDevices, ...(parsed as Partial<DevicePreferences>) }
  } catch {
    return defaultDevices
  }
}

export const saveDevicePreferences = (preferences: DevicePreferences) =>
  safeWrite(DEVICES_KEY, JSON.stringify(preferences))

export const getStreamQuality = (): StreamQualityId => {
  const quality = safeRead(QUALITY_KEY)
  return quality === '720p30' || quality === '1080p60' ? quality : '1080p30'
}

export const saveStreamQuality = (quality: StreamQualityId) =>
  safeWrite(QUALITY_KEY, quality)

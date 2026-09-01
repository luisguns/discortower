import {
  Room,
  VideoPreset,
} from 'livekit-client'
import type { StreamQualityId } from '../types'
import type { LocalProfile } from '../types'
import { serializeParticipantProfile } from './profile'
import { getSupabase } from './supabase'

export const normalizeDisplayName = (value: string) => value.trim().replace(/\s+/g, ' ')

export const normalizeRoomCode = (value: string) =>
  value.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase()

export const roomCodeFromInput = (value: string) => {
  const trimmedValue = value.trim()
  if (!trimmedValue) return ''

  const roomQuery = trimmedValue.match(/[?&]room=([^&#]+)/i)?.[1]
  if (roomQuery) {
    try {
      return normalizeRoomCode(decodeURIComponent(roomQuery))
    } catch {
      return normalizeRoomCode(roomQuery)
    }
  }

  if (trimmedValue.toLocaleLowerCase().startsWith('splotys://')) {
    try {
      const url = new URL(trimmedValue)
      if (['auth', 'invite'].includes(url.hostname.toLocaleLowerCase())) return ''
      const explicitRoom = url.searchParams.get('room')
      const routeRoom = url.hostname.toLocaleLowerCase() === 'join'
        ? url.pathname.replace(/^\/+/, '')
        : url.hostname
      return normalizeRoomCode(explicitRoom || routeRoom)
    } catch {
      return ''
    }
  }

  return normalizeRoomCode(trimmedValue)
}

export const getRoomCodeFromUrl = () => {
  if (typeof window === 'undefined') return ''
  const room = new URL(window.location.href).searchParams.get('room')
  return room ? normalizeRoomCode(room) : ''
}

export const createRoomInviteUrl = (roomCode: string) => {
  const normalizedRoom = normalizeRoomCode(roomCode)
  if (typeof window === 'undefined') return `?room=${encodeURIComponent(normalizedRoom)}`

  const url = new URL(
    window.splotysDesktop ? 'https://splotys.com/' : window.location.href,
  )
  url.search = ''
  url.searchParams.set('room', normalizedRoom)
  url.hash = ''
  return url.toString()
}

export const replaceRoomCodeInCurrentUrl = (roomCode: string) => {
  if (typeof window === 'undefined') return
  const normalizedRoom = normalizeRoomCode(roomCode)
  const url = new URL(window.location.href)
  url.search = ''
  if (normalizedRoom) url.searchParams.set('room', normalizedRoom)
  url.hash = ''
  window.history.replaceState(null, '', url)
}

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export const generateRoomCode = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  const characters = [...bytes].map(
    (value) => ROOM_CODE_ALPHABET[value % ROOM_CODE_ALPHABET.length],
  )
  return `${characters.slice(0, 3).join('')}-${characters.slice(3, 7).join('')}-${characters.slice(7).join('')}`
}

export const createLiveKitRoom = () =>
  new Room({
    adaptiveStream: true,
    dynacast: true,
    disconnectOnPageLeave: true,
    webAudioMix: true,
  })

export const fetchConnectionDetails = async (
  callId: string,
  profile: LocalProfile,
): Promise<{ serverUrl: string; participantToken: string }> => {
  if (!callId) throw new Error('CALL_INVALID')
  const { data, error } = await getSupabase().functions.invoke('issue-livekit-token', {
    body: {
      participantMetadata: serializeParticipantProfile(profile),
      participantName: normalizeDisplayName(profile.displayName),
      callId,
    },
  })
  if (error) {
    const status = error.context?.status
    throw new Error(status ? `AUTH_FUNCTION_${status}` : 'AUTH_FUNCTION_UNAVAILABLE')
  }
  if (
    !data ||
    typeof data !== 'object' ||
    typeof (data as { serverUrl?: unknown }).serverUrl !== 'string' ||
    typeof (data as { participantToken?: unknown }).participantToken !== 'string'
  ) {
    throw new Error('AUTH_FUNCTION_INVALID_RESPONSE')
  }
  return data as { serverUrl: string; participantToken: string }
}

export const createChannelInviteUrl = (channelId: string) => {
  if (typeof window === 'undefined') return `?channel=${encodeURIComponent(channelId)}`
  const url = new URL(window.splotysDesktop ? 'https://splotys.com/' : window.location.href)
  url.search = ''; url.searchParams.set('channel', channelId); url.hash = ''
  return url.toString()
}

export const getChannelIdFromUrl = () => {
  if (typeof window === 'undefined') return ''
  return new URL(window.location.href).searchParams.get('channel') || ''
}

export const replaceChannelIdInCurrentUrl = (channelId: string) => {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.search = channelId ? `?channel=${encodeURIComponent(channelId)}` : ''
  url.hash = ''
  window.history.replaceState(null, '', url)
}

export const streamQualityPresets: Record<
  StreamQualityId,
  { label: string; shortLabel: string; usageLabel: string; preset: VideoPreset }
> = {
  '720p30': {
    label: '720p · 30 FPS',
    shortLabel: '720p30',
    usageLabel: 'Menor consumo',
    preset: new VideoPreset(1280, 720, 2_500_000, 30),
  },
  '1080p30': {
    label: '1080p · 30 FPS',
    shortLabel: '1080p30',
    usageLabel: 'Equilibrado',
    preset: new VideoPreset(1920, 1080, 4_500_000, 30),
  },
  '1080p60': {
    label: '1080p · 60 FPS',
    shortLabel: '1080p60',
    usageLabel: 'Alto consumo',
    preset: new VideoPreset(1920, 1080, 7_000_000, 60),
  },
}

export const friendlyConnectionError = (error: unknown) => {
  if (error instanceof Error && error.message === 'SUPABASE_NOT_INITIALIZED') {
    return 'A autenticação ainda não está pronta. Tente novamente em instantes.'
  }
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'O navegador bloqueou a permissão necessária. Revise as permissões do site.'
  }
  if (error instanceof Error && /AUTH_FUNCTION_401|AUTH_FUNCTION_403|AUTH_REQUIRED|ACCOUNT_DISABLED/i.test(error.message)) {
    return 'Sua conta não tem autorização para entrar nessa sala.'
  }
  if (error instanceof Error && /AUTH_FUNCTION_429/i.test(error.message)) {
    return 'Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.'
  }
  if (error instanceof Error && /CHANNEL_COOLDOWN|ACTIVE_CALL_LIMIT_REACHED/i.test(error.message)) {
    return error.message.includes('COOLDOWN')
      ? 'Este canal está em pausa após atingir o limite de duração. Tente novamente em alguns minutos.'
      : 'O limite de calls simultâneas foi atingido. Aguarde uma call terminar.'
  }
  if (error instanceof Error && /CHANNEL_NOT_FOUND|CALL_NOT_FOUND|INVALID_CHANNEL|INVALID_CALL/i.test(error.message)) {
    return 'Esse canal não existe mais ou não está disponível para sua conta.'
  }
  if (error instanceof Error && /CALL_BLOCKED|CHANNEL_ACCESS_DENIED/i.test(error.message)) return 'Você não tem acesso a esta call.'
  if (error instanceof Error && /AUTH_FUNCTION_UNAVAILABLE|AUTH_FUNCTION_5/i.test(error.message)) {
    return 'O serviço de autorização está indisponível. Tente novamente em instantes.'
  }
  return 'Não foi possível entrar na call. Verifique sua conexão e tente novamente.'
}

export const friendlyMicrophoneError = (error: unknown) => {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return window.splotysDesktop?.platform === 'win32'
      ? 'Permissão do microfone negada. Libere o acesso no Windows e clique no microfone para tentar novamente.'
      : 'Permissão do microfone negada. Você entrou apenas para ouvir.'
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'Nenhum microfone foi encontrado neste dispositivo.'
  }
  return 'Não foi possível iniciar o microfone. Você ainda pode ouvir a call.'
}

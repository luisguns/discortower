import {
  Room,
  TokenSource,
  VideoPreset,
  type TokenSourceResponseObject,
} from 'livekit-client'
import type { StreamQualityId } from '../types'

export const normalizeDisplayName = (value: string) => value.trim().replace(/\s+/g, ' ')

export const normalizeRoomCode = (value: string) =>
  value.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase()

const createParticipantIdentity = (displayName: string) => {
  const prefix = displayName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28) || 'driver'
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

export const createLiveKitRoom = () =>
  new Room({
    adaptiveStream: true,
    dynacast: true,
    disconnectOnPageLeave: true,
  })

export const fetchConnectionDetails = async (
  roomCode: string,
  displayName: string,
): Promise<TokenSourceResponseObject> => {
  const tokenServerId = import.meta.env.VITE_LIVEKIT_TOKEN_SERVER_ID?.trim()
  if (!tokenServerId) {
    throw new Error('TOKEN_SERVER_NOT_CONFIGURED')
  }

  const tokenSource = TokenSource.developmentTokenServer(tokenServerId)
  return tokenSource.fetch({
    roomName: roomCode,
    participantName: displayName,
    participantIdentity: createParticipantIdentity(displayName),
  })
}

export const streamQualityPresets: Record<
  StreamQualityId,
  { label: string; shortLabel: string; preset: VideoPreset }
> = {
  '720p30': {
    label: '720p · 30 FPS',
    shortLabel: '720p30',
    preset: new VideoPreset(1280, 720, 2_500_000, 30),
  },
  '1080p30': {
    label: '1080p · 30 FPS',
    shortLabel: '1080p30',
    preset: new VideoPreset(1920, 1080, 4_500_000, 30),
  },
  '1080p60': {
    label: '1080p · 60 FPS',
    shortLabel: '1080p60',
    preset: new VideoPreset(1920, 1080, 7_000_000, 60),
  },
}

export const friendlyConnectionError = (error: unknown) => {
  if (error instanceof Error && error.message === 'TOKEN_SERVER_NOT_CONFIGURED') {
    return 'O LiveKit ainda não foi configurado. Defina VITE_LIVEKIT_TOKEN_SERVER_ID.'
  }
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'O navegador bloqueou a permissão necessária. Revise as permissões do site.'
  }
  if (error instanceof Error && /token|credential|unauthorized|401|403/i.test(error.message)) {
    return 'Não foi possível obter acesso à sala. Confira o ID do Development Token Server.'
  }
  return 'Não foi possível entrar na call. Verifique sua conexão e tente novamente.'
}

export const friendlyMicrophoneError = (error: unknown) => {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Permissão do microfone negada. Você entrou apenas para ouvir.'
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'Nenhum microfone foi encontrado neste dispositivo.'
  }
  return 'Não foi possível iniciar o microfone. Você ainda pode ouvir a call.'
}

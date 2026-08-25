import type {
  LocalVideoTrack,
  RemoteAudioTrack,
  RemoteParticipant,
  RemoteTrackPublication,
  RemoteVideoTrack,
} from 'livekit-client'

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error'

export type StreamQualityId = '720p30' | '1080p30' | '1080p60'

export type GalleryLayoutMode = 'cinema' | 'expanded'

export type AudioChannel = 'voice' | 'screen'

export type ShortcutAction =
  | 'microphone'
  | 'deafen'
  | 'camera'
  | 'screenShare'
  | 'leave'

export type ShortcutBindings = Record<ShortcutAction, string>

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'ready'
  | 'upToDate'
  | 'error'
  | 'unsupported'

export interface AppUpdateState {
  status: AppUpdateStatus
  currentVersion: string
  availableVersion?: string
  percent?: number
  message?: string
}

export interface LocalProfile {
  displayName: string
  avatarDataUrl?: string
}

export interface RemoteVoice {
  id: string
  participant: RemoteParticipant
  track?: RemoteAudioTrack
  muted: boolean
}

export interface ScreenShareLive {
  id: string
  participantIdentity: string
  participantName: string
  isLocal: boolean
  videoTrack?: LocalVideoTrack | RemoteVideoTrack
  audioTrack?: RemoteAudioTrack
  videoPublication?: RemoteTrackPublication
  audioPublication?: RemoteTrackPublication
  subscribed: boolean
  hasAudio: boolean
  muted: boolean
}

export interface ParticipantMedia {
  id: string
  name: string
  avatarDataUrl?: string
  isLocal: boolean
  cameraTrack?: LocalVideoTrack | RemoteVideoTrack
  cameraEnabled: boolean
  microphoneMuted: boolean
}

export interface DevicePreferences {
  inputId: string
  voiceOutputId: string
  screenOutputId: string
}

export interface ChatMessage {
  id: string
  kind: 'text' | 'image'
  senderIdentity: string
  senderName: string
  senderAvatarUrl?: string
  isLocal: boolean
  sentAt: number
  text?: string
  imageUrl?: string
  imageName?: string
  status?: 'sending' | 'sent' | 'error'
}

export interface ContextMenuPoint {
  x: number
  y: number
}

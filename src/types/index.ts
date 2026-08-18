import type {
  LocalVideoTrack,
  RemoteAudioTrack,
  RemoteParticipant,
  RemoteVideoTrack,
} from 'livekit-client'

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error'

export type StreamQualityId = '720p30' | '1080p30' | '1080p60'

export type AudioChannel = 'voice' | 'screen'

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
  videoTrack: LocalVideoTrack | RemoteVideoTrack
  audioTrack?: RemoteAudioTrack
  muted: boolean
}

export interface ParticipantMedia {
  id: string
  name: string
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

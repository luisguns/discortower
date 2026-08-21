/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LIVEKIT_TOKEN_SERVER_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface FordKallDesktopInfo {
  platform: string
  version: string
  publicAppUrl: string
}

interface FordKallOverlayParticipant {
  id: string
  name: string
  isLocal: boolean
  muted: boolean
  speaking: boolean
}

interface FordKallOverlayState {
  enabled: boolean
  participants: FordKallOverlayParticipant[]
}

interface FordKallDesktopApi {
  readonly isDesktop: true
  readonly platform: string
  minimize: () => void
  openMicrophoneSettings: () => void
  setInCall: (inCall: boolean) => void
  setGameOverlayState: (state: FordKallOverlayState) => void
  getInfo: () => Promise<FordKallDesktopInfo | null>
  onOpenRoom: (listener: (roomCode: string) => void) => () => void
}

interface Window {
  readonly fordKallDesktop?: FordKallDesktopApi
}

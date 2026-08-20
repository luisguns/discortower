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

interface FordKallDesktopApi {
  readonly isDesktop: true
  readonly platform: string
  minimize: () => void
  setInCall: (inCall: boolean) => void
  getInfo: () => Promise<FordKallDesktopInfo | null>
  onOpenRoom: (listener: (roomCode: string) => void) => () => void
}

interface Window {
  readonly fordKallDesktop?: FordKallDesktopApi
}

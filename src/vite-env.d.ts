/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_SUPABASE_AUTH_REDIRECT_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface SplotysDesktopInfo {
  platform: string
  version: string
  publicAppUrl: string
}

interface SplotysOverlayParticipant {
  id: string
  name: string
  avatarDataUrl?: string
  isLocal: boolean
  muted: boolean
  speaking: boolean
}

interface SplotysOverlayState {
  enabled: boolean
  participants: SplotysOverlayParticipant[]
}

interface SplotysDesktopApi {
  readonly isDesktop: true
  readonly platform: string
  minimize: () => void
  openMicrophoneSettings: () => void
  setInCall: (inCall: boolean) => void
  setGameOverlayState: (state: SplotysOverlayState) => void
  setGameOverlaySpeakers: (participantIds: string[]) => void
  setShortcutBindings: (bindings: import('./types').ShortcutBindings) => void
  setShortcutCaptureActive: (active: boolean) => void
  getUpdateState: () => Promise<import('./types').AppUpdateState>
  checkForUpdates: () => Promise<import('./types').AppUpdateState>
  installUpdate: () => void
  getInfo: () => Promise<SplotysDesktopInfo | null>
  detectKnownActivity: (candidates: Array<{ id: string; processNames: string[] }>) => Promise<{ activityId: string; iconDataUrl?: string } | null>
  setFullscreen: (fullscreen: boolean) => Promise<boolean>
  getAuthCallback: () => Promise<string | null>
  getInviteToken: () => Promise<string | null>
  getAuthSessionBlob: () => Promise<string | null>
  setAuthSessionBlob: (session: string) => Promise<boolean>
  clearAuthSession: () => Promise<boolean>
  onOpenRoom: (listener: (roomCode: string) => void) => () => void
  onOpenInvite: (listener: (token: string) => void) => () => void
  onAuthCallback: (listener: (callbackUrl: string) => void) => () => void
  onShortcut: (listener: (action: import('./types').ShortcutAction) => void) => () => void
  onShortcutStatus: (listener: (status: { failedActions: import('./types').ShortcutAction[] }) => void) => () => void
  onUpdateState: (listener: (state: import('./types').AppUpdateState) => void) => () => void
  onFullscreenChange: (listener: (fullscreen: boolean) => void) => () => void
}

interface Window {
  readonly splotysDesktop?: SplotysDesktopApi
}

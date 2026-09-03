const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('splotysDesktop', {
  isDesktop: true,
  platform: process.platform,
  minimize: () => ipcRenderer.send('desktop:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('desktop:toggle-maximize'),
  isMaximized: () => ipcRenderer.invoke('desktop:is-maximized'),
  closeWindow: () => ipcRenderer.send('desktop:close-window'),
  openMicrophoneSettings: () => ipcRenderer.send('desktop:open-microphone-settings'),
  setInCall: (inCall) => ipcRenderer.send('desktop:set-in-call', inCall === true),
  setGameOverlayState: (state) => ipcRenderer.send('desktop:set-game-overlay-state', state),
  setGameOverlaySpeakers: (participantIds) => ipcRenderer.send('desktop:set-game-overlay-speakers', participantIds),
  setShortcutBindings: (bindings) => ipcRenderer.send('desktop:set-shortcut-bindings', bindings),
  setShortcutCaptureActive: (active) => ipcRenderer.send('desktop:set-shortcut-capture-active', active === true),
  getUpdateState: () => ipcRenderer.invoke('desktop:get-update-state'),
  checkForUpdates: () => ipcRenderer.invoke('desktop:check-for-updates'),
  installUpdate: () => ipcRenderer.send('desktop:install-update'),
  getInfo: () => ipcRenderer.invoke('desktop:get-info'),
  detectKnownActivity: (candidates) => ipcRenderer.invoke('desktop:detect-known-activity', candidates),
  setFullscreen: (fullscreen) => ipcRenderer.invoke('desktop:set-fullscreen', fullscreen === true),
  getAuthCallback: () => ipcRenderer.invoke('auth:get-callback'),
  getInviteToken: () => ipcRenderer.invoke('invite:get-pending'),
  getAuthSessionBlob: () => ipcRenderer.invoke('auth:get-session'),
  setAuthSessionBlob: (session) => ipcRenderer.invoke('auth:set-session', typeof session === 'string' ? session : ''),
  clearAuthSession: () => ipcRenderer.invoke('auth:clear-session'),
  onOpenRoom: (listener) => {
    const wrappedListener = (_event, roomCode) => listener(roomCode)
    ipcRenderer.on('desktop:open-room', wrappedListener)
    return () => ipcRenderer.removeListener('desktop:open-room', wrappedListener)
  },
  onOpenInvite: (listener) => {
    const wrappedListener = (_event, token) => listener(token)
    ipcRenderer.on('desktop:open-invite', wrappedListener)
    return () => ipcRenderer.removeListener('desktop:open-invite', wrappedListener)
  },
  onAuthCallback: (listener) => {
    const wrappedListener = (_event, callbackUrl) => listener(callbackUrl)
    ipcRenderer.on('desktop:auth-callback', wrappedListener)
    return () => ipcRenderer.removeListener('desktop:auth-callback', wrappedListener)
  },
  onShortcut: (listener) => {
    const wrappedListener = (_event, action) => listener(action)
    ipcRenderer.on('desktop:shortcut', wrappedListener)
    return () => ipcRenderer.removeListener('desktop:shortcut', wrappedListener)
  },
  onShortcutStatus: (listener) => {
    const wrappedListener = (_event, status) => listener(status)
    ipcRenderer.on('desktop:shortcut-status', wrappedListener)
    return () => ipcRenderer.removeListener('desktop:shortcut-status', wrappedListener)
  },
  onUpdateState: (listener) => {
    const wrappedListener = (_event, state) => listener(state)
    ipcRenderer.on('desktop:update-state', wrappedListener)
    return () => ipcRenderer.removeListener('desktop:update-state', wrappedListener)
  },
  onFullscreenChange: (listener) => {
    const wrappedListener = (_event, fullscreen) => listener(fullscreen === true)
    ipcRenderer.on('desktop:fullscreen-changed', wrappedListener)
    return () => ipcRenderer.removeListener('desktop:fullscreen-changed', wrappedListener)
  },
  onMaximizedChange: (listener) => {
    const wrappedListener = (_event, maximized) => listener(maximized === true)
    ipcRenderer.on('desktop:maximized-changed', wrappedListener)
    return () => ipcRenderer.removeListener('desktop:maximized-changed', wrappedListener)
  },
})

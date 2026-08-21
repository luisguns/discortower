const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('fordKallDesktop', {
  isDesktop: true,
  platform: process.platform,
  minimize: () => ipcRenderer.send('desktop:minimize'),
  openMicrophoneSettings: () => ipcRenderer.send('desktop:open-microphone-settings'),
  setInCall: (inCall) => ipcRenderer.send('desktop:set-in-call', inCall === true),
  setGameOverlayState: (state) => ipcRenderer.send('desktop:set-game-overlay-state', state),
  getInfo: () => ipcRenderer.invoke('desktop:get-info'),
  onOpenRoom: (listener) => {
    const wrappedListener = (_event, roomCode) => listener(roomCode)
    ipcRenderer.on('desktop:open-room', wrappedListener)
    return () => ipcRenderer.removeListener('desktop:open-room', wrappedListener)
  },
})

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('splotysOverlay', {
  onState: (listener) => {
    const wrappedListener = (_event, state) => listener(state)
    ipcRenderer.on('game-overlay:state', wrappedListener)
    return () => ipcRenderer.removeListener('game-overlay:state', wrappedListener)
  },
  onSpeakers: (listener) => {
    const wrappedListener = (_event, participantIds) => listener(participantIds)
    ipcRenderer.on('game-overlay:speakers', wrappedListener)
    return () => ipcRenderer.removeListener('game-overlay:speakers', wrappedListener)
  },
})

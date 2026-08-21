const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('fordKallOverlay', {
  onState: (listener) => {
    const wrappedListener = (_event, state) => listener(state)
    ipcRenderer.on('game-overlay:state', wrappedListener)
    return () => ipcRenderer.removeListener('game-overlay:state', wrappedListener)
  },
})

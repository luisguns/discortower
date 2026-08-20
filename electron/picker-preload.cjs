const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('fordKallCapturePicker', {
  platform: process.platform,
  listSources: () => ipcRenderer.invoke('capture-picker:list'),
  select: (id, withAudio) => ipcRenderer.send('capture-picker:select', { id, withAudio }),
  cancel: () => ipcRenderer.send('capture-picker:cancel'),
})

// Isolated Electron smoke test. Loads the built renderer with the real preload.
// No real account, call, microphone, screen or user's app profile is opened.
const { app, BrowserWindow, ipcMain } = require('electron')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
app.setPath('userData', mkdtempSync(path.join(tmpdir(), 'splotys-observability-')))
process.env.SPLOTYS_OBSERVABILITY_TEST = '1'
const telemetry = require('../electron/observability.cjs')
const Sentry = require('@sentry/electron/main')
app.whenReady().then(async () => {
  for (const channel of ['auth:get-session', 'invite:get-pending', 'auth:get-callback']) ipcMain.handle(channel, () => null)
  ipcMain.handle('desktop:is-maximized', () => false)
  telemetry.record('observability-smoke', { synthetic: true })
  telemetry.capture(new Error('SPLOTYS_DESKTOP_MAIN_SMOKE'))
  const win = new BrowserWindow({ show: false, webPreferences: {
    preload: path.resolve(__dirname, '../electron/preload.cjs'),
    contextIsolation: true, sandbox: true, backgroundThrottling: false,
  } })
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error' || event.message?.includes('OBSERVABILITY')) console.log(event.message)
  })
  await win.loadURL('http://127.0.0.1:5182/?observability-test=1')
  setTimeout(async () => {
    console.log('Sentry flush:', await Sentry.flush(5000))
    win.destroy()
    app.quit()
  }, 10000)
}).catch(error => { console.error(error); app.exit(1) })

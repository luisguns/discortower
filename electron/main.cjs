const {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  Menu,
  nativeImage,
  protocol,
  session,
  shell,
  Tray,
} = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

const APP_ID = 'dev.11a3.fordkall'
const APP_SCHEME = 'fordkall-app'
const APP_ORIGIN = `${APP_SCHEME}://app`
const PICKER_ORIGIN = `${APP_SCHEME}://picker`
const PUBLIC_APP_URL = 'https://fordkall.11a3.dev/'
const DEV_SERVER_URL = 'http://127.0.0.1:5173'
const isDevelopment = process.argv.includes('--dev') || !app.isPackaged

let mainWindow = null
let tray = null
let isQuitting = false
let isInCall = false
let trayHintShown = false
let pendingRoomCode = ''
let activePicker = null

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      codeCache: true,
      stream: true,
    },
  },
])

app.setAppUserModelId(APP_ID)

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

const normalizeRoomCode = (value) =>
  value.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase()

const roomCodeFromDeepLink = (value) => {
  if (typeof value !== 'string' || !value.toLowerCase().startsWith('fordkall://')) return ''
  try {
    const url = new URL(value)
    const explicitRoom = url.searchParams.get('room')
    if (explicitRoom) return normalizeRoomCode(explicitRoom)

    const routeRoom = url.hostname.toLowerCase() === 'join'
      ? url.pathname.replace(/^\/+/, '')
      : url.hostname
    return normalizeRoomCode(routeRoom)
  } catch {
    return ''
  }
}

const findRoomCodeInArguments = (argumentsList) => {
  for (const argument of argumentsList) {
    const roomCode = roomCodeFromDeepLink(argument)
    if (roomCode) return roomCode
  }
  return ''
}

const showMainWindow = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

const sendRoomCode = (roomCode) => {
  const normalizedRoom = normalizeRoomCode(roomCode)
  if (!normalizedRoom) return
  pendingRoomCode = normalizedRoom
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) return
  mainWindow.webContents.send('desktop:open-room', normalizedRoom)
  pendingRoomCode = ''
}

app.on('second-instance', (_event, commandLine) => {
  showMainWindow()
  const roomCode = findRoomCodeInArguments(commandLine)
  if (roomCode) sendRoomCode(roomCode)
})

app.on('open-url', (event, url) => {
  event.preventDefault()
  const roomCode = roomCodeFromDeepLink(url)
  if (roomCode) sendRoomCode(roomCode)
})

const iconPath = () => app.isPackaged
  ? path.join(process.resourcesPath, 'desktop-assets', 'icon.png')
  : path.join(__dirname, '..', 'build', 'icon.png')

const isTrustedRendererUrl = (value) => {
  try {
    const url = new URL(value)
    if (!isDevelopment && url.protocol === `${APP_SCHEME}:` && url.hostname === 'app') {
      return true
    }
    if (isDevelopment) {
      return url.origin === DEV_SERVER_URL || url.origin === 'http://localhost:5173'
    }
    return false
  } catch {
    return false
  }
}

const hasTrustedRendererUrl = (...values) => values.some((value) =>
  typeof value === 'string' && isTrustedRendererUrl(value),
)

const contentTypeFor = (filePath) => {
  const extension = path.extname(filePath).toLowerCase()
  return {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  }[extension] || 'application/octet-stream'
}

const installAppProtocol = () => {
  const rendererRoot = path.resolve(app.getAppPath(), 'dist')
  const pickerRoot = path.resolve(app.getAppPath(), 'electron')
  protocol.handle(APP_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const resourceRoot = url.hostname === 'app'
        ? rendererRoot
        : url.hostname === 'picker'
          ? pickerRoot
          : null
      if (!resourceRoot) return new Response('Not found', { status: 404 })

      let pathname = decodeURIComponent(url.pathname)
      if (!pathname || pathname === '/') {
        pathname = url.hostname === 'picker' ? '/screen-picker.html' : '/index.html'
      }

      const filePath = path.resolve(resourceRoot, `.${pathname}`)
      if (filePath !== resourceRoot && !filePath.startsWith(`${resourceRoot}${path.sep}`)) {
        return new Response('Not found', { status: 404 })
      }

      const data = await fs.readFile(filePath)
      const headers = new Headers({
        'Content-Type': contentTypeFor(filePath),
        'Cross-Origin-Resource-Policy': 'same-site',
      })
      if (path.extname(filePath).toLowerCase() === '.html') {
        if (url.hostname === 'app') {
          headers.set(
            'Content-Security-Policy',
            "default-src 'self'; connect-src 'self' https: wss:; img-src 'self' data: blob:; media-src 'self' blob:; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; worker-src 'self' blob:; frame-src 'self' blob: about:; object-src 'none'; base-uri 'self'; form-action 'self'",
          )
          headers.set(
            'Permissions-Policy',
            'camera=(self), microphone=(self), display-capture=(self), fullscreen=(self), picture-in-picture=(self)',
          )
        } else {
          headers.set(
            'Content-Security-Policy',
            "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
          )
        }
      }
      return new Response(data, { status: 200, headers })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

const finishPicker = (result) => {
  const picker = activePicker
  if (!picker) return
  activePicker = null
  picker.resolve(result)
  if (!picker.window.isDestroyed()) picker.window.close()
}

const openCapturePicker = async () => {
  if (activePicker) finishPicker(null)

  const ownSourceIds = new Set()
  if (mainWindow && !mainWindow.isDestroyed()) {
    ownSourceIds.add(mainWindow.getMediaSourceId())
  }

  const sources = (await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 400, height: 225 },
    fetchWindowIcons: true,
  }))
    .filter((source) => !ownSourceIds.has(source.id))
    .sort((left, right) => Number(right.id.startsWith('screen:')) - Number(left.id.startsWith('screen:')))

  if (!sources.length) return null

  const pickerWindow = new BrowserWindow({
    width: 980,
    height: 690,
    minWidth: 720,
    minHeight: 520,
    parent: mainWindow || undefined,
    modal: Boolean(mainWindow),
    show: false,
    title: 'Escolher o que compartilhar · Ford Kall',
    icon: iconPath(),
    backgroundColor: '#080a09',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'picker-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const result = new Promise((resolve) => {
    activePicker = { window: pickerWindow, sources, resolve }
  })

  pickerWindow.once('ready-to-show', () => pickerWindow.show())
  pickerWindow.once('closed', () => {
    if (activePicker?.window === pickerWindow) finishPicker(null)
  })
  pickerWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  pickerWindow.webContents.on('will-navigate', (event, url) => {
    const allowedUrl = isDevelopment
      ? url.startsWith('file:')
      : url.startsWith(`${PICKER_ORIGIN}/`)
    if (!allowedUrl) event.preventDefault()
  })

  try {
    if (isDevelopment) {
      await pickerWindow.loadFile(path.join(__dirname, 'screen-picker.html'))
    } else {
      await pickerWindow.loadURL(`${PICKER_ORIGIN}/screen-picker.html`)
    }
  } catch (error) {
    if (activePicker?.window === pickerWindow) finishPicker(null)
    throw error
  }
  return result
}

const rejectDisplayRequest = (callback) => {
  try {
    void Promise.resolve(callback({})).catch(() => undefined)
  } catch {
    // The renderer receives NotAllowedError when Chromium rejects the request.
  }
}

const installCapturePicker = () => {
  ipcMain.handle('capture-picker:list', (event) => {
    if (!activePicker || event.sender !== activePicker.window.webContents) return []
    return activePicker.sources.map((source) => ({
      id: source.id,
      name: source.name,
      kind: source.id.startsWith('screen:') ? 'screen' : 'window',
      thumbnail: source.thumbnail.isEmpty() ? '' : source.thumbnail.toDataURL(),
      appIcon: source.appIcon?.isEmpty() === false ? source.appIcon.toDataURL() : '',
    }))
  })

  ipcMain.on('capture-picker:select', (event, selection) => {
    if (!activePicker || event.sender !== activePicker.window.webContents) return
    const source = activePicker.sources.find((candidate) => candidate.id === selection?.id)
    if (!source) return
    finishPicker({
      source,
      withAudio: process.platform === 'win32' && selection?.withAudio !== false,
    })
  })

  ipcMain.on('capture-picker:cancel', (event) => {
    if (!activePicker || event.sender !== activePicker.window.webContents) return
    finishPicker(null)
  })
}

const installSessionSecurity = () => {
  const appSession = session.defaultSession
  const allowedPermissions = new Set([
    'clipboard-sanitized-write',
    'display-capture',
    'fullscreen',
    'media',
  ])

  appSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    const trusted = hasTrustedRendererUrl(
      details.requestingUrl,
      details.securityOrigin,
      requestingOrigin,
      webContents?.getURL(),
    )
    return allowedPermissions.has(permission) && trusted
  })

  appSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const trusted = hasTrustedRendererUrl(
      details.requestingUrl,
      details.securityOrigin,
      webContents.getURL(),
    )
    callback(allowedPermissions.has(permission) && trusted)
  })

  appSession.setDisplayMediaRequestHandler(async (request, callback) => {
    const trusted = hasTrustedRendererUrl(
      request.securityOrigin,
      request.frame?.url,
      request.frame?.origin,
    )
    if (!trusted) {
      rejectDisplayRequest(callback)
      return
    }

    try {
      const selection = await openCapturePicker()
      if (!selection) {
        rejectDisplayRequest(callback)
        return
      }

      callback({
        video: selection.source,
        ...(request.audioRequested && selection.withAudio ? { audio: 'loopback' } : {}),
      })
    } catch {
      rejectDisplayRequest(callback)
    }
  })
}

const installRendererIpc = () => {
  ipcMain.on('desktop:set-in-call', (event, value) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return
    isInCall = value === true
    rebuildTrayMenu()
  })

  ipcMain.on('desktop:minimize', (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return
    mainWindow.minimize()
  })

  ipcMain.on('desktop:open-microphone-settings', (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return
    if (process.platform === 'win32') {
      void shell.openExternal('ms-settings:privacy-microphone')
    }
  })

  ipcMain.handle('desktop:get-info', (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return null
    return {
      platform: process.platform,
      version: app.getVersion(),
      publicAppUrl: PUBLIC_APP_URL,
    }
  })
}

const rebuildTrayMenu = () => {
  if (!tray) return
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: isInCall ? 'Voltar para a call' : 'Abrir Ford Kall',
      click: showMainWindow,
    },
    {
      label: 'Minimizar para jogar',
      enabled: Boolean(mainWindow?.isVisible()),
      click: () => mainWindow?.minimize(),
    },
    { type: 'separator' },
    {
      label: 'Sair do Ford Kall',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ]))
}

const createTray = () => {
  const trayImage = nativeImage.createFromPath(iconPath()).resize({ width: 20, height: 20 })
  tray = new Tray(trayImage)
  tray.setToolTip('Ford Kall')
  tray.on('click', showMainWindow)
  rebuildTrayMenu()
}

const configureWindowNavigation = (window) => {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          backgroundColor: '#030403',
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      }
    }

    if (url.startsWith('fordkall://')) {
      const roomCode = roomCodeFromDeepLink(url)
      if (roomCode) sendRoomCode(roomCode)
      return { action: 'deny' }
    }

    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (isTrustedRendererUrl(url)) return
    event.preventDefault()
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
  })
}

const createMainWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 760,
    minHeight: 560,
    show: false,
    title: 'Ford Kall',
    icon: iconPath(),
    backgroundColor: '#080a09',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: true,
    },
  })

  configureWindowNavigation(mainWindow)

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingRoomCode) sendRoomCode(pendingRoomCode)
  })
  mainWindow.on('close', (event) => {
    if (isQuitting || !isInCall) return
    event.preventDefault()
    mainWindow?.hide()
    if (!trayHintShown && tray && process.platform === 'win32') {
      trayHintShown = true
      tray.displayBalloon({
        title: 'Ford Kall continua na call',
        content: 'A janela foi fechada, mas seu áudio continua ativo. Use o ícone perto do relógio para voltar ou sair.',
        iconType: 'info',
      })
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.on('show', rebuildTrayMenu)
  mainWindow.on('hide', rebuildTrayMenu)
  mainWindow.on('minimize', rebuildTrayMenu)
  mainWindow.on('restore', rebuildTrayMenu)

  if (isDevelopment) {
    await mainWindow.loadURL(DEV_SERVER_URL)
  } else {
    await mainWindow.loadURL(`${APP_ORIGIN}/index.html`)
  }
}

const registerDeepLinkProtocol = () => {
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient('fordkall', process.execPath, [path.resolve(process.argv[1])])
  } else {
    app.setAsDefaultProtocolClient('fordkall')
  }
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return
  registerDeepLinkProtocol()
  if (!isDevelopment) installAppProtocol()
  installCapturePicker()
  installRendererIpc()
  installSessionSecurity()
  createTray()

  pendingRoomCode = findRoomCodeInArguments(process.argv)
  await createMainWindow()

  app.on('activate', () => {
    if (mainWindow) showMainWindow()
    else void createMainWindow()
  })
}).catch((error) => {
  console.error('Ford Kall failed to start', error)
  app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
  if (activePicker) finishPicker(null)
})

app.on('window-all-closed', () => {
  if (process.platform === 'darwin' || isInCall) return
  app.quit()
})

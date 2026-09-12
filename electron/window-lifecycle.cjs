exports.installWindowLifecycle = (window, { diagnostic, resetCall, isQuitting }) => {
  let lastRecovery = 0
  const contents = window.webContents
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.key !== 'F5' || input.isAutoRepeat) return
    event.preventDefault()
    diagnostic('reload-f5')
    contents.reload()
  })
  contents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) resetCall()
  })
  contents.on('console-message', (_event, details) => {
    const code = details.message?.match(/^(RTC_[A-Z_]+|SPLOTYS_RENDERER_ERROR|SPLOTYS_UNHANDLED_REJECTION)\b/)?.[1]
    // Do not persist console text: it can contain tokens, names and URLs.
    if (code) diagnostic(code)
  })
  contents.on('render-process-gone', (_event, details) => {
    diagnostic('renderer-gone', { reason: details.reason, exitCode: details.exitCode })
    resetCall()
    // Recover the interface once per minute, without automatically joining media.
    if (!isQuitting() && details.reason !== 'clean-exit' && Date.now() - lastRecovery > 60_000) {
      lastRecovery = Date.now()
      contents.reload()
    }
  })
  window.on('unresponsive', () => diagnostic('window-unresponsive'))
  window.on('responsive', () => diagnostic('window-responsive'))
  window.on('minimize', () => diagnostic('window-minimized'))
  window.on('restore', () => {
    diagnostic('window-restored')
    contents.invalidate()
  })
}

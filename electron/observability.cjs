const Sentry = require('@sentry/electron/main')
const { app } = require('electron')
const { randomUUID } = require('node:crypto')
const { dsn } = require('../shared/sentry.json')
const { scrub, prepareEvent, createBudget } = require('../shared/telemetry-policy.cjs')
const sessionId = randomUUID()
const errors = createBudget(30, 60_000)
const logs = createBudget(180, 60_000)
Sentry.init({
  dsn,
  enabled: app.isPackaged || process.env.SPLOTYS_OBSERVABILITY_TEST === '1',
  release: `splotys@${app.getVersion()}`,
  environment: app.isPackaged ? 'production' : 'development',
  sendDefaultPii: false,
  dataCollection: { userInfo: false, httpBodies: [] },
  enableLogs: true,
  tracesSampleRate: 0.2,
  attachScreenshot: false,
  // Native dumps can contain auth/media memory. Capture process-exit metadata instead.
  integrations: defaults => defaults.filter(i => !['SentryMinidump', 'ElectronMinidump', 'ContextLines', 'LocalVariables', 'Console', 'Screenshots'].includes(i.name)),
  initialScope: { tags: { origin: 'DESKTOP', process: 'main', session_id: sessionId, app_version: app.getVersion() } },
  beforeSend: event => {
    if (!errors()) return null
    if (event.platform !== 'javascript') event.tags = { ...event.tags, process: 'main', session_id: sessionId }
    return prepareEvent(event, 'DESKTOP', 'main', sessionId)
  },
  beforeSendTransaction: event => prepareEvent(event, 'DESKTOP', 'main', sessionId),
  beforeSendLog: log => logs() ? { ...scrub(log), attributes: { ...scrub(log.attributes), origin: 'DESKTOP', process: log.attributes?.process || 'main', session_id: log.attributes?.session_id || sessionId } } : null,
  beforeSendSpan: span => ({ ...scrub(span), data: { ...scrub(span.data), origin: 'DESKTOP' } }),
  beforeBreadcrumb: crumb => crumb.category === 'splotys.desktop' ? scrub(crumb) : null,
})
exports.record = (event, data = {}) => {
  try {
    const safe = scrub({ ...data, origin: 'DESKTOP', process: 'main', session_id: sessionId })
    Sentry.addBreadcrumb({ category: 'splotys.desktop', message: event, data: safe })
    Sentry.logger.info(`desktop.${event}`, safe)
    if (/gone|unresponsive|failed|error/i.test(event)) {
      Sentry.captureMessage(`desktop.${event}`, { level: 'error', tags: { origin: 'DESKTOP', process: 'main', session_id: sessionId }, contexts: { desktop: safe } })
    }
  } catch { /* Best effort. */ }
}
exports.capture = (error) => Sentry.captureException(error)

import * as Sentry from '@sentry/react'
import config from '../../shared/sentry.json'
import { createBudget, prepareEvent, scrub } from '../../shared/telemetry-policy.cjs'

export const origin = typeof window !== 'undefined' && window.splotysDesktop ? 'DESKTOP' : 'WEB'
const sessionId = crypto.randomUUID()
const release = `splotys@${__SPLOTYS_VERSION__}`
const processName = origin === 'DESKTOP' ? 'renderer' : 'browser'
const logBudget = createBudget(180, 60_000)
const errorBudget = createBudget(20, 60_000)
let context: Record<string, string> = {}
let initialized = false
type Fields = Record<string, string | number | boolean | undefined>

export function rtcConnectionUrl(serverUrl: string) {
  const url = new URL(serverUrl)
  url.searchParams.set('client_origin', origin)
  url.searchParams.set('client_version', __SPLOTYS_VERSION__)
  url.searchParams.set('client_session_id', sessionId)
  if (context.call_id) url.searchParams.set('client_call_id', context.call_id)
  return url.toString()
}

export async function initializeObservability() {
  if (initialized) return
  initialized = true
  const options: Sentry.BrowserOptions = {
    dsn: import.meta.env.VITE_SENTRY_DSN || config.dsn,
    enabled: import.meta.env.PROD || import.meta.env.VITE_SENTRY_ENABLED === 'true',
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || (import.meta.env.PROD ? 'production' : 'development'),
    release,
    sendDefaultPii: false,
    dataCollection: { userInfo: false, httpBodies: [] },
    enableLogs: true,
    tracesSampleRate: 0.2,
    tracePropagationTargets: [],
    maxBreadcrumbs: 80,
    integrations: (defaults) => [
      ...defaults.filter(i => i.name !== 'Breadcrumbs'),
      Sentry.breadcrumbsIntegration({ console: false, dom: false, fetch: false, xhr: false, history: false }),
      Sentry.browserTracingIntegration({ instrumentPageLoad: true, instrumentNavigation: true, traceFetch: false, traceXHR: false }),
    ],
    beforeSend: event => errorBudget() ? prepareEvent(event, origin, processName, sessionId) : null,
    beforeSendTransaction: event => prepareEvent(event, origin, processName, sessionId),
    beforeSendLog: log => logBudget() ? { ...scrub(log), attributes: { ...scrub(log.attributes), origin, process: processName, session_id: sessionId, release } } : null,
    beforeSendSpan: span => ({ ...scrub(span), data: { ...scrub(span.data), origin, process: processName, session_id: sessionId, release } }),
    beforeBreadcrumb: crumb => crumb.category?.startsWith('splotys') ? scrub(crumb) : null,
  }
  if (origin === 'DESKTOP') {
    const electron = await import('@sentry/electron/renderer')
    electron.init(options, Sentry.init)
  } else Sentry.init(options)
  Sentry.setTags({ origin, process: processName, session_id: sessionId, app_version: __SPLOTYS_VERSION__ })
  observe('app.started')
  for (const event of ['online', 'offline', 'pagehide'] as const) {
    window.addEventListener(event, () => observe(`app.${event}`))
  }
  document.addEventListener('visibilitychange', () => observe('app.visibility', { visibility: document.visibilityState }))
  // Explicitly opt-in smoke test: harmless event, no crash and no media capture.
  if (new URLSearchParams(location.search).get('observability-test') === '1') {
    observe('observability.smoke', { synthetic: true })
    reportFailure('observability.smoke', new Error('SPLOTYS_OBSERVABILITY_SMOKE'), { synthetic: true })
    void Sentry.flush(5000)
  }
}

export function setCallContext(callId?: string, attemptId?: string, provider?: string) {
  context = callId ? { call_id: callId, attempt_id: attemptId || '', provider: provider || '' } : {}
  for (const key of ['call_id', 'attempt_id', 'provider']) Sentry.setTag(key, context[key])
}

export function observe(event: string, fields: Fields = {}, level: 'info' | 'warn' = 'info') {
  try {
    const attributes = scrub({ ...context, ...fields, origin, process: processName, session_id: sessionId, release })
    Sentry.addBreadcrumb({ category: 'splotys', message: event, level: level === 'warn' ? 'warning' : 'info', data: attributes })
    Sentry.logger[level](event, attributes)
  } catch { /* Diagnostics must never interrupt a call. */ }
}

export function reportFailure(operation: string, error: unknown, fields: Fields = {}) {
  try {
    observe(`${operation}.failed`, fields, 'warn')
    Sentry.withScope(scope => {
      scope.setTags({ ...context, operation, origin, process: processName, session_id: sessionId })
      scope.setContext('operation', scrub(fields))
      // Preserve stack/type for Error objects. Never serialize arbitrary response bodies.
      Sentry.captureException(error instanceof Error ? error : new Error(operation))
    })
  } catch { /* Best effort. */ }
}

export function measure(name: string, milliseconds: number) {
  try { Sentry.metrics.distribution(name, milliseconds, { unit: 'millisecond', attributes: { origin, process: processName, release } }) } catch { /* Best effort. */ }
}

export const observedFetch: typeof fetch = async (input, init) => {
  const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  // Only static API route names; strip filters, identifiers, keys and query strings.
  let route = 'api'
  try {
    const path = new URL(rawUrl, location.origin).pathname
    route = path.match(/\/(auth|rest|functions)\/v1\/(?:rpc\/)?[a-z_-]+/i)?.[0] || 'storage-or-other'
  } catch { /* Invalid URLs are handled by fetch. */ }
  const started = performance.now()
  return Sentry.startSpan({ name: route, op: 'http.client', attributes: { origin } }, async () => {
    try {
      const response = await fetch(input, init)
      const duration = Math.round(performance.now() - started)
      observe('api.response', { route, status: response.status, duration_ms: duration }, response.ok ? 'info' : 'warn')
      measure('api.duration', duration)
      if (!response.ok) reportFailure('api.response', new Error(`HTTP_${response.status} ${route}`), { route, status: response.status })
      return response
    } catch (error) {
      reportFailure('api.network', error, { route })
      throw error
    }
  })
}

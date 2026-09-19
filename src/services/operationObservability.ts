import { observe, reportFailure, measure, getCallContext } from './observability'

// Never pass request bodies or user input here. Operation names are static codes.
export async function observeOperation<T>(operation: string, work: () => Promise<T>, slowMs = 10_000): Promise<T> {
  const started = performance.now()
  const fields = { ...getCallContext(), operation_id: crypto.randomUUID() }
  observe(`${operation}.started`, fields)
  const timer = window.setTimeout(() => observe(`${operation}.slow`, { ...fields, duration_ms: Math.round(performance.now() - started) }, 'warn'), slowMs)
  try {
    const result = await work()
    observe(`${operation}.completed`, { ...fields, duration_ms: Math.round(performance.now() - started) })
    return result
  } catch (error) {
    // Domain errors can contain server/user text; retain the original only for callers.
    const status = error && typeof error === 'object' && 'context' in error && error.context instanceof Response ? error.context.status : undefined
    const expected = error instanceof Error && ['USERNAME_INVALID', 'USERNAME_TAKEN', 'PROFILE_NAME_INVALID', 'MESSAGE_EMPTY', 'IMAGE_TYPE_INVALID', 'IMAGE_TOO_LARGE', 'AUTH_REQUIRED', 'AbortError'].includes(error.name === 'AbortError' ? error.name : error.message)
    const failureFields = { ...fields, status, duration_ms: Math.round(performance.now() - started) }
    if (expected || (status !== undefined && status >= 400 && status < 500)) observe(`${operation}.rejected`, failureFields, 'warn')
    else reportFailure(operation, new Error(`OPERATION_FAILED ${operation}`), failureFields)
    throw error
  } finally {
    window.clearTimeout(timer)
    measure(`${operation}.duration`, performance.now() - started)
  }
}

export function observeRealtime(scope: string) {
  let stopped = false, previous = 'CONNECTING', failedAt: number | undefined
  const started = performance.now()
  observe('realtime.connecting', { scope })
  const timer = window.setTimeout(() => {
    if (!stopped && previous === 'CONNECTING') observe('realtime.slow', { scope, duration_ms: Math.round(performance.now() - started) }, 'warn')
  }, 15_000)
  return {
    status(status: string) {
      if (stopped || status === previous) return
      window.clearTimeout(timer)
      const failed = status !== 'SUBSCRIBED'
      observe('realtime.state', { scope, previous_state: previous, state: status }, failed ? 'warn' : 'info')
      if (failed && failedAt === undefined) failedAt = performance.now()
      if (!failed && failedAt !== undefined) {
        observe('realtime.recovered', { scope, duration_ms: Math.round(performance.now() - failedAt) })
        failedAt = undefined
      }
      previous = status
    },
    stop() { stopped = true; window.clearTimeout(timer); observe('realtime.stopped', { scope }) },
  }
}

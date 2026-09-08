import type { Room } from '@gunns-dev/control-tower-client'

type DiagnosticEvent =
  | 'cut-marked'
  | 'playback-started'
  | 'playback-blocked'
  | 'output-device-failed'
  | 'waiting'
  | 'stalled'
type Entry = { at: number; data: unknown }
let samples: Entry[] = []
let events: Entry[] = []
let running = false
let collectionMs = 0

const pruneWindow = () => {
  const since = Date.now() - 120_000
  samples = samples.filter((entry) => entry.at >= since).slice(-60)
  events = events.filter((entry) => entry.at >= since).slice(-120)
}

export const recordAudioEvent = (kind: DiagnosticEvent) => {
  if (!running) return
  events.push({ at: Date.now(), data: { kind } })
  pruneWindow()
}

export const startAudioDiagnostics = (room: Room) => {
  samples = []
  events = []
  collectionMs = 0
  running = true
  let stopped = false
  let busy = false
  let longTaskMs = 0
  const observer =
    typeof PerformanceObserver !== 'undefined' &&
    PerformanceObserver.supportedEntryTypes.includes('longtask')
      ? new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) longTaskMs += entry.duration
        })
      : undefined
  observer?.observe({ type: 'longtask', buffered: false })
  const sample = async () => {
    if (busy || stopped) return
    busy = true
    const start = performance.now()
    try {
      const data =
        typeof room.getAudioDiagnostics === 'function'
          ? await room.getAudioDiagnostics()
          : { state: room.state, providerMetricsUnavailable: true }
      if (!stopped) {
        samples.push({
          at: Date.now(),
          data: { ...data, longTaskMs, visibility: document.visibilityState },
        })
        pruneWindow()
      }
      longTaskMs = 0
    } catch {
      if (!stopped)
        samples.push({ at: Date.now(), data: { collectionFailed: true } })
      pruneWindow()
    } finally {
      if (!stopped) collectionMs += performance.now() - start
      busy = false
    }
  }
  void sample()
  const timer = window.setInterval(() => void sample(), 2000)
  return () => {
    stopped = true
    running = false
    clearInterval(timer)
    observer?.disconnect()
    samples = []
    events = []
  }
}

export const exportAudioDiagnostics = () => {
  recordAudioEvent('cut-marked')
  const report = {
    version: 1,
    clock: 'Date.now UTC milliseconds',
    samplePeriodMs: 2000,
    collectionWallMs: collectionMs,
    samples,
    events,
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `splotys-audio-${Date.now()}.json`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

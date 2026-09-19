type Fields = Record<string, string | number | boolean | undefined>
type Emit = (event: string, fields: Fields, level?: 'info' | 'warn') => void

// One warning per incident, followed by recovery. Keys are internal and never sent.
export function createConditionMonitor(emit: Emit, now = () => performance.now()) {
  const incidents = new Map<string, { since: number; reported: boolean; event: string; fields: Fields }>()
  return {
    check(key: string, event: string, active: boolean, fields: Fields = {}, graceMs = 15_000) {
      let incident = incidents.get(key)
      if (!active) {
        if (incident?.reported) emit(`${incident.event}.recovered`, { ...incident.fields, duration_ms: Math.round(now() - incident.since) })
        incidents.delete(key)
        return
      }
      if (!incident) {
        incident = { since: now(), reported: false, event, fields }
        incidents.set(key, incident)
      }
      incident.fields = fields
      if (!incident.reported && now() - incident.since >= graceMs) {
        incident.reported = true
        emit(event, { ...fields, duration_ms: Math.round(now() - incident.since) }, 'warn')
      }
    },
    retain(keys: Set<string>) {
      // Disappearing publications were removed, not necessarily recovered.
      for (const [key, incident] of incidents) if (!keys.has(key)) {
        if (incident.reported) emit(`${incident.event}.ended`, { ...incident.fields, duration_ms: Math.round(now() - incident.since) })
        incidents.delete(key)
      }
    },
    clear() { incidents.clear() },
  }
}

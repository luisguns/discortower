import { adminClient, handleFunctionError, HttpError, jsonResponse, optionsResponse } from '../_shared/http.ts'
import { roomService } from '../_shared/livekit.ts'
import { writeAudit } from '../_shared/audit.ts'

const requiredCronSecret = () => Deno.env.get('CALL_LIMIT_CRON_SECRET') || ''
const sendSystem = async (service: any, room: string, payload: Record<string, unknown>) => {
  try { await service.sendData(room, new TextEncoder().encode(JSON.stringify(payload)), 'reliable', [], 'system.call-limit') } catch { /* best effort; DB remains authoritative */ }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request)
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED')
    if (!requiredCronSecret() || request.headers.get('x-call-limit-secret') !== requiredCronSecret()) throw new HttpError(401, 'CRON_REQUIRED')
    const client = adminClient()
    const service = roomService()
    const { data: settings } = await client.from('call_guardrail_settings').select('solo_warning_seconds,solo_kick_seconds,max_call_seconds,max_warning_seconds,cooldown_seconds,starting_timeout_seconds').eq('id', true).single()
    const soloWarningSeconds = Number(settings?.solo_warning_seconds || 240)
    const soloKickSeconds = Number(settings?.solo_kick_seconds || 300)
    const maxCallSeconds = Number(settings?.max_call_seconds || 21600)
    const maxWarningSeconds = Number(settings?.max_warning_seconds || 300)
    const cooldownSeconds = Number(settings?.cooldown_seconds || 900)
    const startingTimeoutSeconds = Number(settings?.starting_timeout_seconds || 120)
    const { data: sessions, error } = await client.from('room_sessions').select('id,room_name,channel_id,started_at,created_at,status,solo_since,solo_warning_sent_at,max_warning_sent_at').in('status', ['starting', 'open']).limit(100)
    if (error) throw new Error('LIMIT_LOOKUP_FAILED')
    const now = Date.now()
    let kicked = 0
    for (const session of sessions || []) {
      if (session.status === 'starting' && now - new Date(session.created_at).getTime() >= startingTimeoutSeconds * 1000) {
        const end = new Date(now).toISOString()
        await client.from('room_sessions').update({ status: 'closed', ended_at: end, ended_reason: 'stale_start', last_event_at: end }).eq('id', session.id)
        await client.from('channels').update({ current_room_session_id: null, participant_count: 0, call_started_at: null }).eq('id', session.channel_id)
        continue
      }
      let participants: any[] = []
      try { participants = await (service as any).listParticipants(session.room_name) } catch { continue }
      const active = participants.filter((item) => Number(item.state ?? 2) !== 3)
      await client.from('channels').update({ participant_count: active.length, call_started_at: session.started_at || null }).eq('id', session.channel_id)
      const currentSoloSince = active.length === 1 ? (session.solo_since || new Date(now).toISOString()) : null
      if (currentSoloSince !== session.solo_since) await client.from('room_sessions').update({ solo_since: currentSoloSince, solo_warning_sent_at: null }).eq('id', session.id)
      if (active.length === 1 && currentSoloSince) {
        const soloSeconds = (now - new Date(currentSoloSince).getTime()) / 1000
        const identity = active[0].identity
        if (soloSeconds >= soloWarningSeconds && !session.solo_warning_sent_at) {
          await sendSystem(service, session.room_name, { type: 'solo_timeout_warning', disconnectAt: new Date(new Date(currentSoloSince).getTime() + soloKickSeconds * 1000).toISOString() })
          await client.from('room_sessions').update({ solo_warning_sent_at: new Date(now).toISOString() }).eq('id', session.id)
          await writeAudit(client, { action: 'solo_timeout_warning', result: 'success', metadata: { roomSessionId: session.id } })
        }
        if (soloSeconds >= soloKickSeconds) {
          try { await service.removeParticipant(session.room_name, identity) } catch { /* webhook will reconcile */ }
          await client.from('room_sessions').update({ ended_reason: 'solo_timeout', last_event_at: new Date(now).toISOString() }).eq('id', session.id)
          kicked++
        }
      }
      const elapsed = session.started_at ? now - new Date(session.started_at).getTime() : 0
      if (session.started_at && elapsed >= (maxCallSeconds - maxWarningSeconds) * 1000 && elapsed < maxCallSeconds * 1000 && !session.max_warning_sent_at) {
        await sendSystem(service, session.room_name, { type: 'max_duration_warning', disconnectAt: new Date(new Date(session.started_at).getTime() + maxCallSeconds * 1000).toISOString() })
        await client.from('room_sessions').update({ max_warning_sent_at: new Date(now).toISOString() }).eq('id', session.id)
      }
      if (session.started_at && elapsed >= maxCallSeconds * 1000) {
        try { await service.deleteRoom(session.room_name) } catch { /* webhook will reconcile */ }
        const end = new Date(now).toISOString()
        await client.from('room_sessions').update({ status: 'closed', ended_at: end, ended_reason: 'max_duration', last_event_at: end }).eq('id', session.id)
        await client.from('channels').update({ current_room_session_id: null, participant_count: 0, call_started_at: null, reopen_after: cooldownSeconds > 0 ? new Date(now + cooldownSeconds * 1000).toISOString() : null }).eq('id', session.channel_id)
      }
    }
    return jsonResponse(request, { ok: true, inspected: sessions?.length || 0, kicked })
  } catch (error) { return handleFunctionError(request, error) }
})

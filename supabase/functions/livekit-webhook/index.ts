import { WebhookReceiver } from 'npm:livekit-server-sdk@2.15.0'
import { writeAudit } from '../_shared/audit.ts'
import { adminClient, handleFunctionError, HttpError, jsonResponse, optionsResponse } from '../_shared/http.ts'
import { livekitConfig, roomService, TrackSource } from '../_shared/livekit.ts'

type LiveKitEvent = {
  id?: string
  event?: string
  createdAt?: number | string
  room?: { sid?: string; name?: string }
  participant?: { identity?: string; name?: string; joinedAt?: number | string }
  track?: { sid?: string; source?: string | number; width?: number; height?: number }
}

const eventTime = (event: LiveKitEvent) => {
  const value = Number(event.createdAt)
  return Number.isFinite(value) && value > 0 ? new Date(value < 10_000_000_000 ? value * 1000 : value).toISOString() : new Date().toISOString()
}

const userIdFromIdentity = (identity: string) => {
  const match = identity.match(/^usr_([0-9a-f-]{36})_[a-z0-9]+$/i)
  return match?.[1] || null
}

const roomForEvent = async (client: ReturnType<typeof adminClient>, event: LiveKitEvent, occurredAt: string) => {
  const sid = event.room?.sid || ''
  const roomName = event.room?.name || ''
  const bySid = sid ? await client.from('room_sessions').select('id,room_name,channel_id,channel_call_id,status,last_event_at').eq('livekit_room_sid', sid).maybeSingle() : { data: null, error: null }
  if (bySid.data) return bySid.data
  if (!roomName) return null
  const byName = await client.from('room_sessions').select('id,room_name,channel_id,channel_call_id,status,last_event_at').eq('room_name', roomName).in('status', ['starting', 'open']).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (byName.data) return byName.data
  const { data } = await client.from('room_sessions').insert({ room_name: roomName, livekit_room_sid: sid || null, status: 'starting', last_event_at: occurredAt }).select('id,room_name,channel_id,channel_call_id,status,last_event_at').single()
  return data
}

const syncChannelPresence = async (client: ReturnType<typeof adminClient>, roomId: string, channelId: string | null | undefined) => {
  if (!channelId) return
  const { count } = await client.from('participant_sessions').select('id', { count: 'exact', head: true }).eq('room_session_id', roomId).is('left_at', null)
  await client.from('channels').update({ participant_count: count || 0 }).eq('id', channelId)
  const { data: room } = await client.from('room_sessions').select('channel_call_id').eq('id', roomId).maybeSingle()
  if (room?.channel_call_id) await client.from('channel_calls').update({ participant_count: count || 0 }).eq('id', room.channel_call_id)
}

const isNewerEvent = (lastEventAt: string | null | undefined, occurredAt: string) => !lastEventAt || new Date(occurredAt).getTime() >= new Date(lastEventAt).getTime()

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request)
  let eventId = ''
  let client: ReturnType<typeof adminClient> | null = null
  try {
    client = adminClient()
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED')
    const rawBody = await request.text()
    const signature = request.headers.get('authorization') || ''
    const config = livekitConfig()
    let event: LiveKitEvent
    try {
      event = await new WebhookReceiver(config.apiKey, config.apiSecret).receive(rawBody, signature) as LiveKitEvent
    } catch {
      throw new HttpError(401, 'WEBHOOK_SIGNATURE_INVALID')
    }
    eventId = typeof event.id === 'string' ? event.id : ''
    const eventType = typeof event.event === 'string' ? event.event : ''
    if (!eventId || !eventType) throw new HttpError(400, 'WEBHOOK_PAYLOAD_INVALID')
    const occurredAt = eventTime(event)

    const { error: insertError } = await client.from('webhook_events').insert({ event_id: eventId, event_type: eventType, occurred_at: occurredAt })
    if (insertError?.code === '23505') {
      const { data: existingEvent } = await client.from('webhook_events').select('result').eq('event_id', eventId).maybeSingle()
      if (existingEvent?.result === 'processed') return jsonResponse(request, { duplicate: true, ok: true })
    }
    if (insertError && insertError.code !== '23505') throw new Error('WEBHOOK_EVENT_RECORD_FAILED')

    const room = await roomForEvent(client, event, occurredAt)
    if (eventType === 'room_started' && room && room.status !== 'closed' && isNewerEvent(room.last_event_at, occurredAt)) {
      await client.from('room_sessions').update({ livekit_room_sid: event.room?.sid || null, last_event_at: occurredAt, started_at: occurredAt, status: 'open' }).eq('id', room.id)
      if (room.channel_id) await client.from('channels').update({ call_started_at: occurredAt, current_room_session_id: room.id }).eq('id', room.channel_id)
      if (room.channel_call_id) await client.from('channel_calls').update({ call_started_at: occurredAt, current_room_session_id: room.id }).eq('id', room.channel_call_id)
    } else if (eventType === 'participant_joined' && room) {
      const identity = event.participant?.identity || ''
      if (!identity) throw new Error('WEBHOOK_PARTICIPANT_INVALID')
      const { data: existing } = await client.from('participant_sessions').select('id').eq('room_session_id', room.id).eq('livekit_identity', identity).is('left_at', null).maybeSingle()
      if (!existing) {
        await client.from('participant_sessions').insert({
          joined_at: event.participant?.joinedAt ? eventTime({ createdAt: event.participant.joinedAt }) : occurredAt,
          livekit_identity: identity,
          participant_name: String(event.participant?.name || 'Participante').slice(0, 48),
          room_session_id: room.id,
          user_id: userIdFromIdentity(identity),
        })
      }
      await syncChannelPresence(client, room.id, room.channel_id)
    } else if (eventType === 'participant_left' && room) {
      const identity = event.participant?.identity || ''
      const { data: participant } = await client.from('participant_sessions').select('id').eq('room_session_id', room.id).eq('livekit_identity', identity).is('left_at', null).order('joined_at', { ascending: false }).limit(1).maybeSingle()
      if (participant) await client.from('participant_sessions').update({ left_at: occurredAt, screen_sharing: false }).eq('id', participant.id)
      await syncChannelPresence(client, room.id, room.channel_id)
    } else if (eventType === 'track_published' && room) {
      const identity = event.participant?.identity || ''
      const source = String(event.track?.source || '').toLowerCase()
      const isScreen = source.includes('screen') || source === '3' || source === '4'
      if (identity && isScreen) await client.from('participant_sessions').update({ screen_sharing: true }).eq('room_session_id', room.id).eq('livekit_identity', identity).is('left_at', null)
      const width = Number(event.track?.width || 0)
      const height = Number(event.track?.height || 0)
      const { data: guardrails } = await client.from('call_guardrail_settings').select('max_screen_share_dimension').eq('id', true).maybeSingle()
      const maxScreenShareDimension = Number(guardrails?.max_screen_share_dimension || 1280)
      if (identity && isScreen && Math.max(width, height) > maxScreenShareDimension) {
        try { await roomService().updateParticipant(room.room_name, identity, { permission: { canPublishSources: [TrackSource.MICROPHONE, TrackSource.CAMERA] } } as any) } catch { /* participant may have left */ }
        const userId = userIdFromIdentity(identity)
        if (userId) await client.from('call_media_restrictions').upsert({ room_session_id: room.id, user_id: userId, screen_share_blocked: true, reason: 'resolution_limit' })
        await writeAudit(client, { action: 'screen_share_policy_violation', actorUserId: userId || undefined, targetRoomId: room.id, result: 'blocked', metadata: { width, height, maxScreenShareDimension } })
      }
    } else if (eventType === 'track_unpublished' && room) {
      const identity = event.participant?.identity || ''
      const source = String(event.track?.source || '').toLowerCase()
      const isScreen = source.includes('screen') || source === '3' || source === '4'
      if (identity && isScreen) await client.from('participant_sessions').update({ screen_sharing: false }).eq('room_session_id', room.id).eq('livekit_identity', identity).is('left_at', null)
    } else if (eventType === 'room_finished' && room && isNewerEvent(room.last_event_at, occurredAt)) {
      await client.from('room_sessions').update({ ended_at: occurredAt, last_event_at: occurredAt, status: 'closed', ended_reason: 'livekit_finished' }).eq('id', room.id)
      await client.from('participant_sessions').update({ left_at: occurredAt, screen_sharing: false }).eq('room_session_id', room.id).is('left_at', null)
      if (room.channel_id) await client.from('channels').update({ current_room_session_id: null, participant_count: 0, call_started_at: null }).eq('id', room.channel_id)
      if (room.channel_call_id) await client.from('channel_calls').update({ current_room_session_id: null, participant_count: 0, call_started_at: null }).eq('id', room.channel_call_id)
    }

    await client.from('webhook_events').update({ processed_at: new Date().toISOString(), result: 'processed' }).eq('event_id', eventId)
    return jsonResponse(request, { ok: true })
  } catch (error) {
    if (eventId && client) await client.from('webhook_events').update({ processed_at: new Date().toISOString(), result: 'failed' }).eq('event_id', eventId)
    return handleFunctionError(request, error)
  }
})

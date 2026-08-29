import { WebhookReceiver } from 'npm:livekit-server-sdk@2.15.0'
import { writeAudit } from '../_shared/audit.ts'
import { adminClient, handleFunctionError, HttpError, jsonResponse, optionsResponse } from '../_shared/http.ts'
import { livekitConfig } from '../_shared/livekit.ts'

type LiveKitEvent = {
  id?: string
  event?: string
  createdAt?: number | string
  room?: { sid?: string; name?: string }
  participant?: { identity?: string; name?: string; joinedAt?: number | string }
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
  const bySid = sid ? await client.from('room_sessions').select('id,room_name,status,last_event_at').eq('livekit_room_sid', sid).maybeSingle() : { data: null, error: null }
  if (bySid.data) return bySid.data
  if (!roomName) return null
  const byName = await client.from('room_sessions').select('id,room_name,status,last_event_at').eq('room_name', roomName).in('status', ['starting', 'open']).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (byName.data) return byName.data
  const { data } = await client.from('room_sessions').insert({ room_name: roomName, livekit_room_sid: sid || null, status: 'starting', last_event_at: occurredAt }).select('id,room_name,status,last_event_at').single()
  return data
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
    } else if (eventType === 'participant_left' && room) {
      const identity = event.participant?.identity || ''
      const { data: participant } = await client.from('participant_sessions').select('id').eq('room_session_id', room.id).eq('livekit_identity', identity).is('left_at', null).order('joined_at', { ascending: false }).limit(1).maybeSingle()
      if (participant) await client.from('participant_sessions').update({ left_at: occurredAt }).eq('id', participant.id)
    } else if (eventType === 'room_finished' && room && isNewerEvent(room.last_event_at, occurredAt)) {
      await client.from('room_sessions').update({ ended_at: occurredAt, last_event_at: occurredAt, status: 'closed' }).eq('id', room.id)
      await client.from('participant_sessions').update({ left_at: occurredAt }).eq('room_session_id', room.id).is('left_at', null)
    }

    await client.from('webhook_events').update({ processed_at: new Date().toISOString(), result: 'processed' }).eq('event_id', eventId)
    return jsonResponse(request, { ok: true })
  } catch (error) {
    if (eventId && client) await client.from('webhook_events').update({ processed_at: new Date().toISOString(), result: 'failed' }).eq('event_id', eventId)
    return handleFunctionError(request, error)
  }
})

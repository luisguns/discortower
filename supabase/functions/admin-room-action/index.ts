import { writeAudit } from '../_shared/audit.ts'
import { effectiveRole, handleFunctionError, HttpError, jsonResponse, optionsResponse, readJson, requireUser } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate-limit.ts'
import { roomService } from '../_shared/livekit.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request)
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED')
    const { client, user } = await requireUser(request)
    const actorRole = await effectiveRole(client, user.id)
    if (!['owner', 'manager', 'host'].includes(actorRole)) throw new HttpError(403, 'ADMIN_REQUIRED')
    await enforceRateLimit(client, `admin-room:${user.id}`, 60, 3600)
    const body = await readJson(request)
    const action = body?.action === 'end_room' || body?.action === 'remove_participant' ? body.action : ''
    const roomId = typeof body?.roomId === 'string' ? body.roomId : ''
    const participantId = typeof body?.participantId === 'string' ? body.participantId : ''
    if (!action || !roomId || (action === 'remove_participant' && !participantId)) throw new HttpError(400, 'INVALID_PAYLOAD')

    const { data: room, error: roomError } = await client.from('room_sessions').select('id,room_name,status,channel_id').eq('id', roomId).maybeSingle()
    if (roomError || !room) throw new HttpError(404, 'ROOM_NOT_FOUND')
    const { data: channel } = room.channel_id ? await client.from('channels').select('created_by').eq('id', room.channel_id).maybeSingle() : { data: null }
    const ownerId = channel?.created_by
    if (actorRole === 'host' && ownerId !== user.id) throw new HttpError(403, 'FORBIDDEN')
    const service = roomService()

    if (action === 'end_room') {
      await service.deleteRoom(room.room_name)
      const now = new Date().toISOString()
      await client.from('room_sessions').update({ ended_at: now, last_event_at: now, status: 'closed' }).eq('id', roomId)
      await client.from('participant_sessions').update({ left_at: now }).eq('room_session_id', roomId).is('left_at', null)
      await writeAudit(client, { action: 'room_ended', actorUserId: user.id, targetRoomId: roomId, result: 'success', metadata: { room: room.room_name } })
      return jsonResponse(request, { ok: true })
    }

    const { data: participant, error: participantError } = await client
      .from('participant_sessions')
      .select('id,livekit_identity,participant_name')
      .eq('id', participantId)
      .eq('room_session_id', roomId)
      .is('left_at', null)
      .maybeSingle()
    if (participantError || !participant) throw new HttpError(404, 'PARTICIPANT_NOT_FOUND')
    await service.removeParticipant(room.room_name, participant.livekit_identity)
    await client.from('participant_sessions').update({ left_at: new Date().toISOString() }).eq('id', participant.id)
    await writeAudit(client, { action: 'participant_removed', actorUserId: user.id, targetRoomId: roomId, result: 'success', metadata: { participantId: participant.id } })
    return jsonResponse(request, { ok: true })
  } catch (error) {
    return handleFunctionError(request, error)
  }
})

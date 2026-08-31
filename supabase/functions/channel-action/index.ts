import { assertCapability, effectiveRole, handleFunctionError, HttpError, jsonResponse, optionsResponse, readJson, requireUser } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate-limit.ts'
import { roomService } from '../_shared/livekit.ts'
import { writeAudit } from '../_shared/audit.ts'

const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ')
const response = (row: Record<string, unknown>) => ({ id: row.id, name: row.name, createdBy: row.created_by, status: row.status, participantCount: row.participant_count || 0, callStartedAt: row.call_started_at || undefined, reopenAfter: row.reopen_after || undefined })
const callResponse = (row: Record<string, unknown>) => ({ id: row.id, channelId: row.channel_id, name: row.name, createdBy: row.created_by, status: row.status, participantCount: row.participant_count || 0, callStartedAt: row.call_started_at || undefined })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request)
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED')
    const { client, user } = await requireUser(request)
    const body = await readJson(request)
    const action = typeof body?.action === 'string' ? body.action : ''
    const role = await effectiveRole(client, user.id)
    await enforceRateLimit(client, `channel-action:${user.id}`, 30, 3600)

    if (action === 'create') {
      await assertCapability(client, user.id, 'create_channel')
      const name = normalizeName(typeof body?.name === 'string' ? body.name : '')
      if (name.length < 2 || name.length > 48) throw new HttpError(400, 'INVALID_CHANNEL_NAME')
      const { data, error } = await client.from('channels').insert({ name, created_by: user.id }).select('id,name,created_by,status,participant_count,call_started_at,reopen_after').single()
      if (error || !data) throw new HttpError(error?.code === '23505' ? 409 : 400, error?.code === '23505' ? 'CHANNEL_NAME_TAKEN' : 'CHANNEL_CREATE_FAILED')
      const { error: memberError } = await client.from('channel_members').insert({ channel_id: data.id, user_id: user.id, role: 'owner', added_by: user.id })
      if (memberError) throw new Error('CHANNEL_MEMBER_CREATE_FAILED')
      await writeAudit(client, { action: 'channel_created', actorUserId: user.id, targetRoomId: undefined, result: 'success', metadata: { channelId: data.id, role } })
      return jsonResponse(request, { channel: response(data) })
    }

    const channelId = typeof body?.channelId === 'string' ? body.channelId : ''
    if (!channelId) throw new HttpError(400, 'INVALID_PAYLOAD')
    const { data: channel, error: channelError } = await client.from('channels').select('id,name,created_by,status,participant_count,call_started_at,reopen_after,current_room_session_id').eq('id', channelId).maybeSingle()
    if (channelError || !channel) throw new HttpError(404, 'CHANNEL_NOT_FOUND')
    const localRole = role === 'owner' || role === 'manager' ? 'owner' : String((await client.from('channel_members').select('role').eq('channel_id', channelId).eq('user_id', user.id).maybeSingle()).data?.role || '')
    const canManage = role === 'owner' || role === 'manager' || ['owner', 'admin'].includes(localRole)
    if (!canManage) throw new HttpError(403, 'FORBIDDEN')

    if (action === 'rename') {
      const name = normalizeName(typeof body?.name === 'string' ? body.name : '')
      if (name.length < 2 || name.length > 48) throw new HttpError(400, 'INVALID_CHANNEL_NAME')
      const { data, error } = await client.from('channels').update({ name }).eq('id', channelId).select('id,name,created_by,status,participant_count,call_started_at,reopen_after').single()
      if (error || !data) throw new HttpError(error?.code === '23505' ? 409 : 400, error?.code === '23505' ? 'CHANNEL_NAME_TAKEN' : 'CHANNEL_UPDATE_FAILED')
      await writeAudit(client, { action: 'channel_renamed', actorUserId: user.id, result: 'success', metadata: { channelId } })
      return jsonResponse(request, { channel: response(data) })
    }

    if (action === 'create_call') {
      const name = normalizeName(typeof body?.name === 'string' ? body.name : '')
      if (name.length < 2 || name.length > 48) throw new HttpError(400, 'INVALID_CALL_NAME')
      const { data, error } = await client.from('channel_calls').insert({ channel_id: channelId, name, created_by: user.id }).select('id,channel_id,name,created_by,status,participant_count,call_started_at').single()
      if (error || !data) throw new HttpError(error?.code === '23505' ? 409 : 400, error?.code === '23505' ? 'CALL_NAME_TAKEN' : 'CALL_CREATE_FAILED')
      return jsonResponse(request, { call: callResponse(data) })
    }

    const callId = typeof body?.callId === 'string' ? body.callId : ''
    if (action === 'rename_call' || action === 'archive_call') {
      if (!callId) throw new HttpError(400, 'INVALID_CALL')
      const { data: call } = await client.from('channel_calls').select('id,channel_id,name,created_by,status,participant_count,call_started_at').eq('id', callId).eq('channel_id', channelId).maybeSingle()
      if (!call) throw new HttpError(404, 'CALL_NOT_FOUND')
      if (action === 'rename_call') {
        const name = normalizeName(typeof body?.name === 'string' ? body.name : '')
        if (name.length < 2 || name.length > 48) throw new HttpError(400, 'INVALID_CALL_NAME')
        const { data, error } = await client.from('channel_calls').update({ name }).eq('id', callId).select('id,channel_id,name,created_by,status,participant_count,call_started_at').single()
        if (error || !data) throw new HttpError(error?.code === '23505' ? 409 : 400, error?.code === '23505' ? 'CALL_NAME_TAKEN' : 'CALL_UPDATE_FAILED')
        return jsonResponse(request, { call: callResponse(data) })
      }
      await client.from('channel_calls').update({ status: 'archived', current_room_session_id: null }).eq('id', callId)
      return jsonResponse(request, { ok: true })
    }

    if (action !== 'archive' && action !== 'restore') throw new HttpError(400, 'INVALID_ACTION')
    const nextStatus = action === 'archive' ? 'archived' : 'active'
    const now = new Date().toISOString()
    const { error: updateError } = await client.from('channels').update({ status: nextStatus, reopen_after: action === 'archive' ? null : channel.reopen_after }).eq('id', channelId)
    if (updateError) throw new Error('CHANNEL_UPDATE_FAILED')
    if (action === 'archive' && channel.current_room_session_id) {
      try { await roomService().deleteRoom(String((await client.from('room_sessions').select('room_name').eq('id', channel.current_room_session_id).single()).data?.room_name || '')) } catch { /* webhook reconciliation remains authoritative */ }
      await client.from('room_sessions').update({ status: 'closed', ended_at: now, ended_reason: 'channel_archived', last_event_at: now }).eq('id', channel.current_room_session_id)
      await client.from('channels').update({ current_room_session_id: null, participant_count: 0, call_started_at: null }).eq('id', channelId)
    }
    await writeAudit(client, { action: `channel_${action}d`, actorUserId: user.id, result: 'success', metadata: { channelId } })
    return jsonResponse(request, { ok: true })
  } catch (error) { return handleFunctionError(request, error) }
})

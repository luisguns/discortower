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
    if (!['owner', 'manager'].includes(actorRole)) throw new HttpError(403, 'ADMIN_REQUIRED')
    await enforceRateLimit(client, `admin-status:${user.id}`, 60, 3600)
    const body = await readJson(request)
    const targetUserId = typeof body?.userId === 'string' ? body.userId : ''
    const status = body?.status === 'disabled' || body?.status === 'active' ? body.status : ''
    if (!targetUserId || !status) throw new HttpError(400, 'INVALID_PAYLOAD')

    const { data: targetAdmin } = await client.from('admin_users').select('user_id').eq('user_id', targetUserId).maybeSingle()
    if (targetAdmin || targetUserId === user.id) throw new HttpError(403, 'OWNER_PROTECTED')
    const { data: targetProfile } = await client.from('profiles').select('role').eq('user_id', targetUserId).maybeSingle()
    if (actorRole === 'manager' && (!targetProfile || targetProfile.role === 'manager')) throw new HttpError(403, 'ROLE_ASSIGNMENT_FORBIDDEN')

    const { error: updateError } = await client.from('profiles').update({ status }).eq('user_id', targetUserId)
    if (updateError) throw new Error('USER_STATUS_UPDATE_FAILED')

    let revokedSessions = false
    const removalFailures: string[] = []
    if (status === 'disabled') {
      try {
        const { error: revokeError } = await client.auth.admin.signOut(targetUserId, 'global')
        if (revokeError) throw revokeError
        revokedSessions = true
      } catch {
        await writeAudit(client, { action: 'user_sessions_revoked', actorUserId: user.id, targetUserId, result: 'failed', metadata: { reason: 'auth_revoke_failed' } })
      }

      const { data: activeParticipants } = await client
        .from('participant_sessions')
        .select('id,livekit_identity,room_session_id,room_sessions!inner(room_name)')
        .eq('user_id', targetUserId)
        .is('left_at', null)
      try {
        const service = roomService()
        for (const participant of activeParticipants || []) {
          try {
            const roomName = (participant.room_sessions as { room_name?: string } | null)?.room_name
            if (!roomName) throw new Error('ROOM_NOT_FOUND')
            await service.removeParticipant(roomName, participant.livekit_identity)
            await client.from('participant_sessions').update({ left_at: new Date().toISOString() }).eq('id', participant.id)
          } catch {
            removalFailures.push(participant.id)
          }
        }
      } catch {
        removalFailures.push(...(activeParticipants || []).map((participant) => participant.id))
      }
    }

    const result = removalFailures.length || (status === 'disabled' && !revokedSessions) ? 'partial' : 'success'
    await writeAudit(client, { action: 'user_status_changed', actorUserId: user.id, targetUserId, result, metadata: { revokedSessions, removalFailures: removalFailures.length, status } })
    return jsonResponse(request, { ok: result === 'success', removalFailures: removalFailures.length, revokedSessions, status })
  } catch (error) {
    return handleFunctionError(request, error)
  }
})

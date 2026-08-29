import { enforceRateLimit } from '../_shared/rate-limit.ts'
import { handleFunctionError, HttpError, jsonResponse, optionsResponse, readJson, requireUser } from '../_shared/http.ts'
import { writeAudit } from '../_shared/audit.ts'
import { issueParticipantToken } from '../_shared/livekit.ts'

const normalizeRoomCode = (value: string) => value.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase()
const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ').slice(0, 48)

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request)
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED')
    const { client, user } = await requireUser(request)
    const body = await readJson(request)
    const roomCode = normalizeRoomCode(typeof body?.roomCode === 'string' ? body.roomCode : '')
    if (!roomCode || roomCode.length > 96) throw new HttpError(400, 'INVALID_PAYLOAD')

    await enforceRateLimit(client, `issue-token:${user.id}`, 30, 60)
    const [{ data: profile, error: profileError }, { data: owner }, { data: acceptedInvitation }] = await Promise.all([
      client.from('profiles').select('status,display_name,avatar_url').eq('user_id', user.id).maybeSingle(),
      client.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle(),
      client.from('invitations').select('id').eq('invited_user_id', user.id).eq('status', 'accepted').maybeSingle(),
    ])
    if (profileError || !profile || profile.status !== 'active' || (!owner && !acceptedInvitation)) {
      await writeAudit(client, { action: 'livekit_token_denied', actorUserId: user.id, result: 'denied', metadata: { room: roomCode, reason: 'inactive_account' } })
      throw new HttpError(403, 'ACCOUNT_DISABLED')
    }
    const participantName = normalizeName(profile.display_name)
    if (!participantName) throw new HttpError(400, 'PROFILE_REQUIRED')
    const avatarUrl = typeof profile.avatar_url === 'string' && profile.avatar_url.length <= 180000 && /^data:image\/(?:gif|jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(profile.avatar_url)
      ? profile.avatar_url
      : undefined
    const participantMetadata = JSON.stringify({ fordKallProfile: { version: 1, avatarDataUrl: avatarUrl } })

    const { data: currentRoom, error: currentRoomError } = await client
      .from('room_sessions')
      .select('id')
      .eq('room_name', roomCode)
      .in('status', ['starting', 'open'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (currentRoomError) throw new Error('ROOM_LOOKUP_FAILED')
    if (currentRoom) {
      const { count: activeParticipants, error: participantCountError } = await client
        .from('participant_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('room_session_id', currentRoom.id)
        .is('left_at', null)
      if (participantCountError) throw new Error('ROOM_CAPACITY_LOOKUP_FAILED')
      if ((activeParticipants || 0) >= 50) throw new HttpError(429, 'ROOM_CAPACITY_REACHED')
    }
    if (!currentRoom) {
      const { error } = await client.from('room_sessions').insert({ room_name: roomCode, created_by: user.id, status: 'starting' })
      if (error && error.code !== '23505') throw new Error('ROOM_CREATE_FAILED')
    }

    const identity = `usr_${user.id}_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`
    const token = await issueParticipantToken(roomCode, identity, participantName, participantMetadata)
    await writeAudit(client, { action: 'livekit_token_issued', actorUserId: user.id, result: 'success', metadata: { room: roomCode } })
    return jsonResponse(request, token)
  } catch (error) {
    return handleFunctionError(request, error)
  }
})

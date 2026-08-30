import { enforceRateLimit } from '../_shared/rate-limit.ts'
import { handleFunctionError, HttpError, jsonResponse, optionsResponse, readJson, requireUser, effectiveRole } from '../_shared/http.ts'
import { writeAudit } from '../_shared/audit.ts'
import { issueParticipantToken } from '../_shared/livekit.ts'

const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ').slice(0, 48)
const roomNameFor = (sessionId: string) => `DT_${sessionId.replaceAll('-', '').toUpperCase()}`

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request)
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED')
    const { client, user } = await requireUser(request)
    const body = await readJson(request)
    const channelId = typeof body?.channelId === 'string' ? body.channelId : ''
    if (!channelId || !/^[0-9a-f-]{36}$/i.test(channelId)) throw new HttpError(400, 'INVALID_CHANNEL')
    await enforceRateLimit(client, `issue-token:${user.id}`, 30, 60)

    const [{ data: profile, error: profileError }, role] = await Promise.all([
      client.from('profiles').select('status,display_name,avatar_url').eq('user_id', user.id).maybeSingle(),
      effectiveRole(client, user.id),
    ])
    if (profileError || !profile || profile.status !== 'active') throw new HttpError(403, 'ACCOUNT_DISABLED')
    const participantName = normalizeName(profile.display_name)
    if (!participantName) throw new HttpError(400, 'PROFILE_REQUIRED')

    const sessionRoomName = roomNameFor(crypto.randomUUID())
    let session: Record<string, unknown>
    try {
      const { data, error } = await client.rpc('reserve_channel_session', {
        p_channel_id: channelId, p_user_id: user.id, p_room_name: sessionRoomName, p_max_active: 5,
      })
      if (error || !data) throw new Error(error?.message || 'ROOM_RESERVATION_FAILED')
      session = data as Record<string, unknown>
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message.includes('ACTIVE_CALL_LIMIT_REACHED')) throw new HttpError(429, 'ACTIVE_CALL_LIMIT_REACHED')
      if (message.includes('CHANNEL_COOLDOWN')) throw new HttpError(429, 'CHANNEL_COOLDOWN')
      if (message.includes('CHANNEL_NOT_FOUND')) throw new HttpError(404, 'CHANNEL_NOT_FOUND')
      throw new Error('ROOM_RESERVATION_FAILED')
    }

    const roomName = String(session.room_name || sessionRoomName)
    const identity = `usr_${user.id}_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`
    const participantMetadata = JSON.stringify({ fordKallProfile: { version: 1, avatarDataUrl: typeof profile.avatar_url === 'string' ? profile.avatar_url : undefined } })
    const restricted = await client.from('call_media_restrictions').select('screen_share_blocked').eq('room_session_id', session.id).eq('user_id', user.id).maybeSingle()
    let token: { participantToken: string; serverUrl: string }
    try {
      token = await issueParticipantToken(roomName, identity, participantName, participantMetadata, {
        canHighQualityScreenShare: ['owner', 'manager', 'host'].includes(role),
        canScreenShare: !restricted.data?.screen_share_blocked,
      })
    } catch (error) {
      console.error('LIVEKIT_TOKEN_ISSUE_FAILED', { channelId, roomSessionId: session.id, error: String(error) })
      throw new Error('LIVEKIT_TOKEN_ISSUE_FAILED')
    }
    const { error: membershipError } = await client.from('channel_members').upsert({
      channel_id: channelId,
      last_seen_at: new Date().toISOString(),
      user_id: user.id,
    }, { onConflict: 'channel_id,user_id' })
    if (membershipError) throw new Error('CHANNEL_MEMBERSHIP_FAILED')
    await writeAudit(client, { action: 'livekit_token_issued', actorUserId: user.id, result: 'success', metadata: { channelId, roomSessionId: session.id, role } })
    return jsonResponse(request, { ...token, channelId, roomSessionId: session.id, screenSharePolicy: ['owner', 'manager', 'host'].includes(role) ? 'high' : '720p30' })
  } catch (error) {
    return handleFunctionError(request, error)
  }
})

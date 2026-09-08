import { enforceRateLimit } from '../_shared/rate-limit.ts'
import { handleFunctionError, HttpError, jsonResponse, optionsResponse, readJson, requireUser } from '../_shared/http.ts'
import { writeAudit } from '../_shared/audit.ts'
import { issueParticipantToken } from '../_shared/livekit.ts'

const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ').slice(0, 48)
const roomNameFor = (sessionId: string) => `DT_${sessionId.replaceAll('-', '').toUpperCase()}`

interface TokenIssueProfile {
  status: string
  display_name: string
  name_font: string
  name_color: string
  name_effect: string
  name_weight: string
  name_spacing: string
  name_case: string
  name_badge: string
  name_animation: string
  screen_share_quality_override?: string | null
}

interface TokenMediaSettings {
  member_screen_share_quality: string
  host_screen_share_quality: string
  manager_screen_share_quality: string
}

Deno.serve(async (request) => {
  const startedAt = performance.now()
  const timings: string[] = []
  const mark = (name: string, since: number) => timings.push(`${name};dur=${(performance.now() - since).toFixed(1)}`)
  if (request.method === 'OPTIONS') {
    const response = optionsResponse(request)
    // Cache only the CORS permission check, never a token or authorization result.
    response.headers.set('Access-Control-Max-Age', '600')
    return response
  }
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED')
    let phaseAt = performance.now()
    const { client, user } = await requireUser(request)
    mark('auth', phaseAt)
    const body = await readJson(request)
    let callId = typeof body?.callId === 'string' ? body.callId : ''
    const channelId = typeof body?.channelId === 'string' ? body.channelId : ''
    if (!callId && channelId) {
      const { data: fallback } = await client.from('channel_calls').select('id').eq('channel_id', channelId).eq('name_normalized', 'geral').eq('status', 'active').maybeSingle()
      callId = fallback?.id || ''
    }
    if (!callId || !/^[0-9a-f-]{36}$/i.test(callId)) throw new HttpError(400, 'INVALID_CALL')
    // Rate limit runs alongside the reads instead of gating them: it only writes
    // a counter and throws when exceeded, so overlapping it with the profile
    // fetch shaves a round-trip off the hot join path.
    phaseAt = performance.now()
    const [, { data: context, error: contextError }] = await Promise.all([
      enforceRateLimit(client, `issue-token:${user.id}`, 30, 60),
      client.rpc('get_token_issue_context', { p_user_id: user.id }),
    ])
    mark('context', phaseAt)
    const issueContext = context as { profile?: TokenIssueProfile; role?: string; mediaSettings?: TokenMediaSettings } | null
    const profile = issueContext?.profile
    const role = String(issueContext?.role || 'member')
    const mediaSettings = issueContext?.mediaSettings
    if (contextError || !profile || !mediaSettings || profile.status !== 'active') throw new HttpError(403, 'ACCOUNT_DISABLED')
    const participantName = normalizeName(profile.display_name)
    if (!participantName) throw new HttpError(400, 'PROFILE_REQUIRED')
    const maxScreenShareQuality = profile.screen_share_quality_override || (
      role === 'owner' ? '1080p60'
        : role === 'manager' ? mediaSettings.manager_screen_share_quality
          : role === 'host' ? mediaSettings.host_screen_share_quality
            : mediaSettings.member_screen_share_quality
    )

    const sessionRoomName = roomNameFor(crypto.randomUUID())
    let session: Record<string, unknown>
    let screenShareBlocked = false
    try {
      phaseAt = performance.now()
      const { data, error } = await client.rpc('reserve_channel_call_access', {
        p_call_id: callId, p_user_id: user.id, p_room_name: sessionRoomName,
      })
      if (error || !data) throw new Error(error?.message || 'ROOM_RESERVATION_FAILED')
      const access = data as { session?: Record<string, unknown>; screenShareBlocked?: boolean }
      if (!access.session) throw new Error('ROOM_RESERVATION_FAILED')
      session = access.session
      screenShareBlocked = access.screenShareBlocked === true
      mark('reserve', phaseAt)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message.includes('ACTIVE_CALL_LIMIT_REACHED')) throw new HttpError(429, 'ACTIVE_CALL_LIMIT_REACHED')
      if (message.includes('CHANNEL_COOLDOWN')) throw new HttpError(429, 'CHANNEL_COOLDOWN')
      if (message.includes('CALL_NOT_FOUND')) throw new HttpError(404, 'CALL_NOT_FOUND')
      if (message.includes('CHANNEL_ACCESS_DENIED')) throw new HttpError(403, 'CHANNEL_ACCESS_DENIED')
      if (message.includes('CALL_BLOCKED')) throw new HttpError(403, 'CALL_BLOCKED')
      throw new Error('ROOM_RESERVATION_FAILED')
    }

    const roomName = String(session.room_name || sessionRoomName)
    const resolvedChannelId = String(session.channel_id || channelId)
    const identity = `usr_${user.id}_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`
    // The avatar is intentionally NOT embedded here: a data-URL avatar can be
    // hundreds of KB, which bloats the JWT and the `?access_token=` query on the
    // signaling WebSocket URL past the browser/proxy request-line limit, so the
    // upgrade is dropped before it reaches the RTC server and the call fails.
    // Avatars are exchanged peer-to-peer over the RTC data channel instead
    // (see useParticipantProfiles). Keep this metadata small.
    const participantMetadata = JSON.stringify({ splotysProfile: { version: 2, nameStyle: { font: profile.name_font, color: profile.name_color, effect: profile.name_effect, weight: profile.name_weight, spacing: profile.name_spacing, casing: profile.name_case, badge: profile.name_badge, animation: profile.name_animation }, media: { maxScreenShareQuality } } })
    let token: { participantToken: string; serverUrl: string; provider: 'livekit' | 'torre' }
    try {
      phaseAt = performance.now()
      token = await issueParticipantToken(roomName, identity, participantName, participantMetadata, {
        canHighQualityScreenShare: maxScreenShareQuality !== '720p30',
        canScreenShare: !screenShareBlocked,
      })
      mark('token', phaseAt)
    } catch (error) {
      console.error('RTC_TOKEN_ISSUE_FAILED', { error: error instanceof Error ? error.message : 'unknown' })
      throw new Error('LIVEKIT_TOKEN_ISSUE_FAILED')
    }
    const rtcHost = new URL(token.serverUrl).host
    // Membership bookkeeping and the audit row are side effects the client never
    // waits on. Defer them past the response (kept alive by EdgeRuntime.waitUntil)
    // so the token — the only thing the join is blocked on — returns immediately.
    const finalizeSideEffects = (async () => {
      const { error: membershipError } = await client.from('channel_members').upsert({
        channel_id: resolvedChannelId,
        last_seen_at: new Date().toISOString(),
        user_id: user.id,
      }, { onConflict: 'channel_id,user_id' })
      if (membershipError) console.error('CHANNEL_MEMBERSHIP_FAILED', { error: membershipError.message })
      await writeAudit(client, { action: 'livekit_token_issued', actorUserId: user.id, result: 'success', metadata: { channelId: resolvedChannelId, callId, roomSessionId: session.id, role, maxScreenShareQuality, provider: token.provider, rtcHost } })
    })().catch((error) => console.error('TOKEN_SIDE_EFFECTS_FAILED', { error: error instanceof Error ? error.message : 'unknown' }))
    const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime
    runtime?.waitUntil?.(finalizeSideEffects)
    mark('total', startedAt)
    console.info('RTC_TOKEN_ISSUED', { provider: token.provider, timings })
    return jsonResponse(request, { ...token, channelId: resolvedChannelId, callId, roomSessionId: session.id, screenSharePolicy: maxScreenShareQuality }, 200, {
      'Server-Timing': timings.join(', '),
      'Timing-Allow-Origin': request.headers.get('origin') || 'https://splotys.com',
      'Access-Control-Expose-Headers': 'Server-Timing',
    })
  } catch (error) {
    return handleFunctionError(request, error)
  }
})

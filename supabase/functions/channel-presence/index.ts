import { handleFunctionError, HttpError, jsonResponse, optionsResponse, requireUser } from '../_shared/http.ts'

const assertActiveAccount = async (client: Awaited<ReturnType<typeof requireUser>>['client'], userId: string) => {
  const [{ data: profile }, { data: admin }, { data: invitation }] = await Promise.all([
    client.from('profiles').select('status').eq('user_id', userId).maybeSingle(),
    client.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle(),
    client.from('invitations').select('id').eq('invited_user_id', userId).eq('status', 'accepted').limit(1).maybeSingle(),
  ])
  if (profile?.status !== 'active' || (!admin && !invitation)) throw new HttpError(403, 'ACCOUNT_INACTIVE')
}

const catalog = async (client: Awaited<ReturnType<typeof requireUser>>['client']) => {
  const { data, error } = await client.from('activity_catalog').select('id,slug,display_name,kind,process_names').eq('enabled', true).order('display_name')
  if (error) throw error
  return (data || []).map((item) => ({
    id: item.id,
    slug: item.slug,
    displayName: item.display_name,
    kind: item.kind,
    processNames: item.process_names,
  }))
}

const summaries = async (client: Awaited<ReturnType<typeof requireUser>>['client']) => {
  const { data: channels, error: channelError } = await client.from('channels')
    .select('id')
    .eq('status', 'active')
  if (channelError) throw channelError
  const channelIds = (channels || []).map((channel) => channel.id)
  const { data: memberships, error: membershipError } = channelIds.length
    ? await client.from('channel_members').select('channel_id,user_id,joined_at,last_seen_at').in('channel_id', channelIds).order('joined_at')
    : { data: [], error: null }
  if (membershipError) throw membershipError
  const { data: calls, error: callError } = channelIds.length
    ? await client.from('channel_calls').select('id,channel_id,name,current_room_session_id,participant_count').in('channel_id', channelIds).eq('status', 'active')
    : { data: [], error: null }
  if (callError) throw callError
  const roomIds = (calls || []).map((call) => call.current_room_session_id).filter(Boolean) as string[]
  const { data: participants, error: participantError } = roomIds.length
    ? await client.from('participant_sessions').select('id,room_session_id,user_id,participant_name,joined_at,screen_sharing').in('room_session_id', roomIds).is('left_at', null).order('joined_at')
    : { data: [], error: null }
  if (participantError) throw participantError

  const userIds = [...new Set([
    ...(memberships || []).map((member) => member.user_id),
    ...(participants || []).map((participant) => participant.user_id).filter(Boolean),
  ])] as string[]
  const [{ data: profiles }, { data: onlinePresence }] = await Promise.all([
    userIds.length
      ? client.from('profiles').select('user_id,display_name,avatar_url,name_font,name_color,name_effect,name_weight,name_spacing,name_case,name_badge,name_animation').in('user_id', userIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? client.from('user_presence').select('user_id,activity_catalog(id,slug,display_name,kind)').in('user_id', userIds).gt('expires_at', new Date().toISOString())
      : Promise.resolve({ data: [], error: null }),
  ])
  const profileByUser = new Map((profiles || []).map((profile) => [profile.user_id, profile]))
  const nameStyle = (profile: Record<string, unknown> | undefined) => profile ? ({ font: profile.name_font, color: profile.name_color, effect: profile.name_effect, weight: profile.name_weight, spacing: profile.name_spacing, casing: profile.name_case, badge: profile.name_badge, animation: profile.name_animation }) : undefined
  const presenceByUser = new Map((onlinePresence || []).map((item) => [item.user_id, item.activity_catalog]))
  const onlineUserIds = new Set((onlinePresence || []).map((item) => item.user_id))

  return (channels || []).map((channel) => {
    const channelCalls = (calls || []).filter((call) => call.channel_id === channel.id)
    const channelParticipants = (participants || []).filter((participant) => channelCalls.some((call) => call.current_room_session_id === participant.room_session_id))
    return {
      channelId: channel.id,
      callActive: channelCalls.some((call) => Boolean(call.current_room_session_id)),
      screenSharing: channelParticipants.some((participant) => participant.screen_sharing),
      members: (memberships || []).filter((member) => member.channel_id === channel.id).map((member) => {
        const memberProfile = profileByUser.get(member.user_id)
        return {
          userId: member.user_id,
          displayName: memberProfile?.display_name || 'Membro',
          avatarDataUrl: memberProfile?.avatar_url || undefined,
          nameStyle: nameStyle(memberProfile),
          joinedAt: member.joined_at,
          online: onlineUserIds.has(member.user_id),
        }
      }),
      participants: channelParticipants.map((participant) => {
        const profile = participant.user_id ? profileByUser.get(participant.user_id) : undefined
        const activity = participant.user_id ? presenceByUser.get(participant.user_id) : undefined
        return {
          userId: participant.user_id,
          displayName: profile?.display_name || participant.participant_name,
          avatarDataUrl: profile?.avatar_url || undefined,
          nameStyle: nameStyle(profile),
          joinedAt: participant.joined_at,
          screenSharing: participant.screen_sharing,
          activity: activity ? {
            id: activity.id,
            slug: activity.slug,
            displayName: activity.display_name,
            kind: activity.kind,
          } : undefined,
        }
      }),
      calls: channelCalls.map((call) => ({
        callId: call.id,
        name: call.name,
        callActive: Boolean(call.current_room_session_id),
        participantCount: Number(call.participant_count || 0),
        participants: channelParticipants.filter((participant) => participant.room_session_id === call.current_room_session_id).map((participant) => {
          const profile = participant.user_id ? profileByUser.get(participant.user_id) : undefined
          const activity = participant.user_id ? presenceByUser.get(participant.user_id) : undefined
          return { userId: participant.user_id, displayName: profile?.display_name || participant.participant_name, avatarDataUrl: profile?.avatar_url || undefined, nameStyle: nameStyle(profile), joinedAt: participant.joined_at, screenSharing: participant.screen_sharing, activity: activity ? { id: activity.id, slug: activity.slug, displayName: activity.display_name, kind: activity.kind } : undefined }
        }),
      })),
    }
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request)
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED')
    const { client, user } = await requireUser(request)
    await assertActiveAccount(client, user.id)
    const body = await request.json().catch(() => ({})) as { action?: string; channelId?: string; activityId?: string | null }

    if (body.action === 'catalog') return jsonResponse(request, { catalog: await catalog(client) })
    if (body.action === 'summary') return jsonResponse(request, { channels: await summaries(client) })
    if (body.action === 'heartbeat') {
      let activityId: string | null = null
      if (body.activityId) {
        const { data: activity } = await client.from('activity_catalog').select('id').eq('id', body.activityId).eq('enabled', true).maybeSingle()
        if (!activity) throw new HttpError(400, 'ACTIVITY_INVALID')
        activityId = activity.id
      }
      const now = new Date()
      const { error } = await client.from('user_presence').upsert({
        activity_id: activityId,
        expires_at: new Date(now.getTime() + 45_000).toISOString(),
        last_seen_at: now.toISOString(),
        user_id: user.id,
      })
      if (error) throw error
      return jsonResponse(request, { ok: true, online: true })
    }
    if (body.action === 'offline') {
      await client.from('user_presence').delete().eq('user_id', user.id)
      return jsonResponse(request, { ok: true, online: false })
    }
    if (body.action !== 'report') throw new HttpError(400, 'ACTION_INVALID')
    if (!body.channelId || !/^[0-9a-f-]{36}$/i.test(body.channelId)) throw new HttpError(400, 'CHANNEL_INVALID')

    const { data: channel } = await client.from('channels').select('current_room_session_id').eq('id', body.channelId).eq('status', 'active').maybeSingle()
    if (!channel?.current_room_session_id) return jsonResponse(request, { ok: true, active: false })
    const { data: participant } = await client.from('participant_sessions').select('id').eq('room_session_id', channel.current_room_session_id).eq('user_id', user.id).is('left_at', null).maybeSingle()
    if (!participant) throw new HttpError(409, 'NOT_IN_CALL')

    if (!body.activityId) {
      await client.from('participant_activities').delete().eq('room_session_id', channel.current_room_session_id).eq('user_id', user.id)
      return jsonResponse(request, { ok: true, active: true })
    }
    const { data: activity } = await client.from('activity_catalog').select('id').eq('id', body.activityId).eq('enabled', true).maybeSingle()
    if (!activity) throw new HttpError(400, 'ACTIVITY_INVALID')
    const now = new Date()
    const { error } = await client.from('participant_activities').upsert({
      activity_id: activity.id,
      expires_at: new Date(now.getTime() + 90_000).toISOString(),
      observed_at: now.toISOString(),
      room_session_id: channel.current_room_session_id,
      user_id: user.id,
    })
    if (error) throw error
    return jsonResponse(request, { ok: true, active: true })
  } catch (error) {
    return handleFunctionError(request, error)
  }
})

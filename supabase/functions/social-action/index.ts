import { handleFunctionError, HttpError, jsonResponse, optionsResponse, readJson, requireUser } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate-limit.ts'

const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)
const normalizeUsername = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase().replace(/^@/, '') : ''
const reportReasons = new Set(['harassment', 'hate_or_discrimination', 'sexual_content', 'violence_or_threat', 'spam_or_scam', 'other'])

const assertActiveAccount = async (client: Awaited<ReturnType<typeof requireUser>>['client'], userId: string) => {
  const [{ data: profile }, { data: admin }, { data: invitation }] = await Promise.all([
    client.from('profiles').select('status,username_configured').eq('user_id', userId).maybeSingle(),
    client.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle(),
    client.from('invitations').select('id').eq('invited_user_id', userId).eq('status', 'accepted').limit(1).maybeSingle(),
  ])
  if (profile?.status !== 'active' || (!admin && !invitation)) throw new HttpError(403, 'ACCOUNT_INACTIVE')
  if (!profile.username_configured) throw new HttpError(409, 'USERNAME_REQUIRED')
}

const publicProfile = (profile: Record<string, unknown>) => ({
  userId: profile.user_id,
  username: profile.username,
  displayName: profile.display_name,
  avatarDataUrl: profile.avatar_url || undefined,
  nameStyle: {
    font: profile.name_font,
    color: profile.name_color,
    effect: profile.name_effect,
    weight: profile.name_weight,
    spacing: profile.name_spacing,
    casing: profile.name_case,
    badge: profile.name_badge,
    animation: profile.name_animation,
  },
})

const searchUser = async (client: Awaited<ReturnType<typeof requireUser>>['client'], actorId: string, rawUsername: unknown) => {
  const username = normalizeUsername(rawUsername)
  if (!/^[a-z0-9_]{3,24}$/.test(username)) throw new HttpError(400, 'USERNAME_INVALID')
  await enforceRateLimit(client, `social-search:${actorId}`, 30, 60)
  const { data: profile, error } = await client
    .from('profiles')
    .select('user_id,username,display_name,avatar_url,name_font,name_color,name_effect,name_weight,name_spacing,name_case,name_badge,name_animation')
    .eq('username', username)
    .eq('username_configured', true)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw error
  if (!profile) return { profile: null, relationship: null }
  if (profile.user_id === actorId) return { profile: publicProfile(profile), relationship: 'self' }
  const { data: block } = await client.from('user_blocks').select('blocker_id').or(`and(blocker_id.eq.${actorId},blocked_id.eq.${profile.user_id}),and(blocker_id.eq.${profile.user_id},blocked_id.eq.${actorId})`).limit(1).maybeSingle()
  if (block) return { profile: null, relationship: null }
  const pair = [actorId, profile.user_id].sort()
  const { data: friendship } = await client.from('friendships').select('status,requester_id,addressee_id').eq('user_low_id', pair[0]).eq('user_high_id', pair[1]).maybeSingle()
  const relationship = friendship?.status === 'accepted'
    ? 'friend'
    : friendship?.status === 'pending'
      ? friendship.requester_id === actorId ? 'outgoing' : 'incoming'
      : 'none'
  return { profile: publicProfile(profile), relationship }
}

const listSocial = async (client: Awaited<ReturnType<typeof requireUser>>['client'], actorId: string) => {
  const [{ data: relationships, error: relationshipsError }, { data: blocked, error: blocksError }, { data: conversations, error: conversationsError }] = await Promise.all([
    client.from('friendships').select('id,user_low_id,user_high_id,requester_id,addressee_id,status,updated_at,accepted_at').or(`user_low_id.eq.${actorId},user_high_id.eq.${actorId}`).in('status', ['pending', 'accepted', 'removed']).order('updated_at', { ascending: false }),
    client.from('user_blocks').select('blocked_id,created_at').eq('blocker_id', actorId).order('created_at', { ascending: false }),
    client.from('direct_conversations').select('id,user_low_id,user_high_id,last_message_id,last_message_at').or(`user_low_id.eq.${actorId},user_high_id.eq.${actorId}`).order('last_message_at', { ascending: false, nullsFirst: false }),
  ])
  if (relationshipsError || blocksError || conversationsError) throw relationshipsError || blocksError || conversationsError

  const otherUserIds = new Set<string>()
  for (const item of relationships || []) otherUserIds.add(item.user_low_id === actorId ? item.user_high_id : item.user_low_id)
  for (const item of conversations || []) otherUserIds.add(item.user_low_id === actorId ? item.user_high_id : item.user_low_id)
  for (const item of blocked || []) otherUserIds.add(item.blocked_id)

  const userIds = [...otherUserIds]
  const [{ data: profiles, error: profilesError }, { data: presence, error: presenceError }, { data: messages, error: messagesError }, { data: states, error: statesError }, { data: unreadMessages, error: unreadMessagesError }] = await Promise.all([
    userIds.length ? client.from('profiles').select('user_id,username,display_name,avatar_url,name_font,name_color,name_effect,name_weight,name_spacing,name_case,name_badge,name_animation').in('user_id', userIds) : Promise.resolve({ data: [], error: null }),
    userIds.length ? client.from('user_presence').select('user_id,activity_catalog(id,slug,display_name,kind)').in('user_id', userIds).gt('expires_at', new Date().toISOString()) : Promise.resolve({ data: [], error: null }),
    (conversations || []).filter((item) => item.last_message_id).length ? client.from('direct_messages').select('id,conversation_id,sender_id,kind,text_content,created_at,deleted_at').in('id', (conversations || []).map((item) => item.last_message_id).filter(Boolean)) : Promise.resolve({ data: [], error: null }),
    (conversations || []).length ? client.from('direct_conversation_state').select('conversation_id,last_read_message_id').eq('user_id', actorId).in('conversation_id', (conversations || []).map((item) => item.id)) : Promise.resolve({ data: [], error: null }),
    (conversations || []).length ? client.from('direct_messages').select('id,conversation_id').eq('recipient_id', actorId).in('conversation_id', (conversations || []).map((item) => item.id)) : Promise.resolve({ data: [], error: null }),
  ])
  if (profilesError || presenceError || messagesError || statesError || unreadMessagesError) throw profilesError || presenceError || messagesError || statesError || unreadMessagesError

  const profileByUser = new Map((profiles || []).map((profile) => [profile.user_id, publicProfile(profile)]))
  const presenceByUser = new Map((presence || []).map((item) => [item.user_id, item.activity_catalog]))
  const messageById = new Map((messages || []).map((message) => [message.id, message]))
  const stateByConversation = new Map((states || []).map((state) => [state.conversation_id, state.last_read_message_id || 0]))
  const relationshipByUser = new Map((relationships || []).map((item) => [item.user_low_id === actorId ? item.user_high_id : item.user_low_id, item]))
  const unreadByConversation = new Map<string, number>()
  for (const item of unreadMessages || []) {
    if (item.id > (stateByConversation.get(item.conversation_id) || 0)) unreadByConversation.set(item.conversation_id, (unreadByConversation.get(item.conversation_id) || 0) + 1)
  }

  const friends = (relationships || []).filter((item) => item.status === 'accepted').map((item) => {
    const userId = item.user_low_id === actorId ? item.user_high_id : item.user_low_id
    return { ...profileByUser.get(userId), friendshipId: item.id, online: presenceByUser.has(userId), activity: presenceByUser.get(userId) || undefined }
  }).filter((item) => item.userId)
  const incoming = (relationships || []).filter((item) => item.status === 'pending' && item.addressee_id === actorId).map((item) => ({ ...profileByUser.get(item.requester_id), friendshipId: item.id, requestedAt: item.updated_at })).filter((item) => item.userId)
  const outgoing = (relationships || []).filter((item) => item.status === 'pending' && item.requester_id === actorId).map((item) => ({ ...profileByUser.get(item.addressee_id), friendshipId: item.id, requestedAt: item.updated_at })).filter((item) => item.userId)
  const blockedUsers = (blocked || []).map((item) => ({ ...profileByUser.get(item.blocked_id), blockedAt: item.created_at })).filter((item) => item.userId)

  const directConversations = (conversations || []).map((conversation) => {
    const otherUserId = conversation.user_low_id === actorId ? conversation.user_high_id : conversation.user_low_id
    const lastMessage = conversation.last_message_id ? messageById.get(conversation.last_message_id) : null
    return {
      id: conversation.id,
      friend: profileByUser.get(otherUserId),
      friendshipStatus: relationshipByUser.get(otherUserId)?.status || 'removed',
      lastMessage: lastMessage ? { id: lastMessage.id, senderId: lastMessage.sender_id, kind: lastMessage.kind, text: lastMessage.deleted_at ? 'Mensagem apagada' : lastMessage.text_content, createdAt: lastMessage.created_at } : null,
      lastMessageAt: conversation.last_message_at,
      unreadCount: unreadByConversation.get(conversation.id) || 0,
    }
  }).filter((item) => item.friend)

  return { friends, incoming, outgoing, blocked: blockedUsers, conversations: directConversations }
}

const submitContentReport = async (client: Awaited<ReturnType<typeof requireUser>>['client'], actorId: string, body: Record<string, unknown>) => {
  if (!isUuid(body?.targetUserId) || body.targetUserId === actorId) throw new HttpError(400, 'TARGET_INVALID')
  const reason = typeof body?.reason === 'string' ? body.reason : ''
  const details = typeof body?.details === 'string' ? body.details.trim().slice(0, 1000) : ''
  if (!reportReasons.has(reason)) throw new HttpError(400, 'REPORT_REASON_INVALID')
  await enforceRateLimit(client, `content-report:${actorId}`, 10, 3600)
  const { data: target, error: targetError } = await client.from('profiles').select('user_id').eq('user_id', body.targetUserId).maybeSingle()
  if (targetError) throw targetError
  if (!target) throw new HttpError(404, 'SOCIAL_TARGET_NOT_FOUND')
  const { error } = await client.from('content_reports').insert({ reporter_id: actorId, subject_user_id: body.targetUserId, reason, details })
  if (error) throw error
  return { ok: true }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request)
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED')
    const { client, user } = await requireUser(request)
    await assertActiveAccount(client, user.id)
    const body = await readJson(request)
    const action = typeof body?.action === 'string' ? body.action : ''
    if (action === 'search_user') return jsonResponse(request, await searchUser(client, user.id, body?.username))
    if (action === 'list_social') return jsonResponse(request, await listSocial(client, user.id))
    if (action === 'report_user') return jsonResponse(request, await submitContentReport(client, user.id, body))
    if (!['send_request', 'accept_request', 'decline_request', 'cancel_request', 'remove_friend', 'block_user', 'unblock_user'].includes(action)) throw new HttpError(400, 'ACTION_INVALID')
    if (!isUuid(body?.targetUserId)) throw new HttpError(400, 'TARGET_INVALID')
    await enforceRateLimit(client, `social-action:${user.id}`, action === 'send_request' ? 10 : 60, action === 'send_request' ? 3600 : 60)
    const { data, error } = await client.rpc('social_transition', { p_actor_id: user.id, p_target_id: body.targetUserId, p_action: action })
    if (error) throw error
    return jsonResponse(request, { ok: true, result: data })
  } catch (error) {
    return handleFunctionError(request, error)
  }
})

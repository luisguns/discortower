import { adminClient, effectiveRole, handleFunctionError, HttpError, jsonResponse, optionsResponse, requireUser } from '../_shared/http.ts'
import { writeAudit } from '../_shared/audit.ts'

const token = () => crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '')
const digest = async (value: string) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].map((part) => part.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request)
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED')
    const { client, user } = await requireUser(request)
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const action = String(body.action || '')
    const role = await effectiveRole(client, user.id)
    const isGlobal = role === 'owner' || role === 'manager'
    const channelId = typeof body.channelId === 'string' ? body.channelId : ''
    if (action === 'accept_invite') {
      const raw = typeof body.token === 'string' ? body.token : ''
      if (!raw) throw new HttpError(400, 'INVITE_INVALID')
      const { data: invite } = await client.from('channel_invites').select('id,channel_id,created_by,expires_at,max_uses,use_count,revoked_at').eq('token_hash', await digest(raw)).maybeSingle()
      if (!invite || invite.revoked_at || new Date(invite.expires_at).getTime() <= Date.now() || invite.use_count >= invite.max_uses) throw new HttpError(410, 'INVITE_EXPIRED')
      const { data: channel } = await client.from('channels').select('id,status').eq('id', invite.channel_id).eq('status', 'active').maybeSingle()
      if (!channel) throw new HttpError(404, 'CHANNEL_NOT_FOUND')
      const { error } = await client.from('channel_members').upsert({ channel_id: invite.channel_id, user_id: user.id, role: 'member', added_by: invite.created_by }, { onConflict: 'channel_id,user_id' })
      if (error) throw error
      const { error: useError } = await client.from('channel_invites').update({ use_count: invite.use_count + 1 }).eq('id', invite.id).lt('use_count', invite.max_uses)
      if (useError) throw useError
      await writeAudit(client, { action: 'channel_invite_accepted', actorUserId: user.id, result: 'success', metadata: { channelId: invite.channel_id } })
      return jsonResponse(request, { ok: true, channelId: invite.channel_id })
    }
    if (!channelId) throw new HttpError(400, 'INVALID_CHANNEL')
    const { data: membership } = await client.from('channel_members').select('role').eq('channel_id', channelId).eq('user_id', user.id).maybeSingle()
    const localRole = String(membership?.role || '')
    if (!isGlobal && !['owner', 'admin'].includes(localRole)) throw new HttpError(403, 'FORBIDDEN')
    if (action === 'create_invite') {
      const raw = token()
      const { data, error } = await client.from('channel_invites').insert({ channel_id: channelId, token_hash: await digest(raw), created_by: user.id, expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), max_uses: 10 }).select('id,expires_at,max_uses').single()
      if (error || !data) throw new Error('INVITE_CREATE_FAILED')
      return jsonResponse(request, { invite: { ...data, token: raw } })
    }
    if (action === 'revoke_invite') {
      if (typeof body.inviteId !== 'string') throw new HttpError(400, 'INVALID_INVITE')
      await client.from('channel_invites').update({ revoked_at: new Date().toISOString() }).eq('id', body.inviteId).eq('channel_id', channelId)
      return jsonResponse(request, { ok: true })
    }
    if (action === 'block_call' || action === 'unblock_call') {
      if (typeof body.callId !== 'string' || typeof body.userId !== 'string') throw new HttpError(400, 'INVALID_PAYLOAD')
      if (action === 'block_call') await client.from('channel_call_blocks').upsert({ call_id: body.callId, user_id: body.userId, blocked_by: user.id })
      else await client.from('channel_call_blocks').delete().eq('call_id', body.callId).eq('user_id', body.userId)
      return jsonResponse(request, { ok: true })
    }
    throw new HttpError(400, 'INVALID_ACTION')
  } catch (error) { return handleFunctionError(request, error) }
})

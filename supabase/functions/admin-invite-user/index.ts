import { writeAudit } from '../_shared/audit.ts'
import { assertAdmin, handleFunctionError, HttpError, jsonResponse, optionsResponse, readJson, requireUser } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate-limit.ts'

const normalizeEmail = (value: string) => value.trim().toLocaleLowerCase()
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const invitationResponse = (row: Record<string, unknown>) => ({
  id: row.id,
  email: row.email_normalized,
  status: row.status,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  acceptedAt: row.accepted_at || undefined,
})

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request)
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED')
    const { client, user } = await requireUser(request)
    await assertAdmin(client, user.id)
    const body = await readJson(request)
    const action = body?.action === 'revoke' ? 'revoke' : 'create'
    await enforceRateLimit(client, `admin-invite:${user.id}`, action === 'create' ? 20 : 60, 3600)

    if (action === 'revoke') {
      const invitationId = typeof body?.invitationId === 'string' ? body.invitationId : ''
      if (!invitationId) throw new HttpError(400, 'INVALID_PAYLOAD')
      const { data, error } = await client
        .from('invitations')
        .update({ status: 'revoked' })
        .eq('id', invitationId)
        .eq('status', 'pending')
        .select('id,email_normalized,status,created_at,expires_at,accepted_at')
        .maybeSingle()
      if (error) throw new Error('INVITATION_REVOKE_FAILED')
      if (!data) throw new HttpError(404, 'INVITATION_NOT_PENDING')
      await writeAudit(client, { action: 'invitation_revoked', actorUserId: user.id, result: 'success', metadata: { invitationId } })
      return jsonResponse(request, { invitation: invitationResponse(data) })
    }

    const email = normalizeEmail(typeof body?.email === 'string' ? body.email : '')
    if (!email || email.length > 320 || !emailPattern.test(email)) throw new HttpError(400, 'INVALID_EMAIL')
    const { data: existing } = await client.from('invitations').select('id').eq('email_normalized', email).eq('status', 'pending').maybeSingle()
    if (existing) throw new HttpError(409, 'INVITATION_ALREADY_PENDING')
    const defaultRedirect = Deno.env.get('INVITE_REDIRECT_URL')?.trim() || ''
    const desktopRedirect = Deno.env.get('DESKTOP_INVITE_REDIRECT_URL')?.trim() || ''
    const requestedRedirect = typeof body?.redirectTo === 'string' ? body.redirectTo.trim() : ''
    if (requestedRedirect && ![defaultRedirect, desktopRedirect].includes(requestedRedirect)) throw new HttpError(400, 'REDIRECT_NOT_ALLOWED')
    const redirectTo = requestedRedirect || defaultRedirect
    if (!redirectTo) throw new Error('INVITE_REDIRECT_NOT_CONFIGURED')

    const { data: invited, error: inviteError } = await client.auth.admin.inviteUserByEmail(email, { redirectTo })
    if (inviteError || !invited.user) throw new HttpError(400, 'INVITATION_NOT_SENT')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: invitation, error: insertError } = await client
      .from('invitations')
      .insert({ created_by: user.id, email_normalized: email, expires_at: expiresAt, invited_user_id: invited.user.id })
      .select('id,email_normalized,status,created_at,expires_at,accepted_at')
      .single()
    if (insertError || !invitation) {
      await client.auth.admin.deleteUser(invited.user.id)
      throw new Error('INVITATION_RECORD_FAILED')
    }
    await writeAudit(client, { action: 'invitation_created', actorUserId: user.id, result: 'success', metadata: { invitationId: invitation.id } })
    return jsonResponse(request, { invitation: invitationResponse(invitation) })
  } catch (error) {
    return handleFunctionError(request, error)
  }
})

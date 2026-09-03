import { writeAudit } from '../_shared/audit.ts'
import { adminClient, handleFunctionError, HttpError, jsonResponse, optionsResponse, readJson, userIp } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate-limit.ts'

const normalizeEmail = (value: string) => value.trim().toLocaleLowerCase()
const normalizeCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '')
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request)
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED')
    const client = adminClient()
    const ip = userIp(request)
    await enforceRateLimit(client, `redeem-invite-code:${ip}`, 5, 3600)

    const body = await readJson(request)
    const rawCode = typeof body?.code === 'string' ? body.code : ''
    const rawEmail = typeof body?.email === 'string' ? body.email : ''
    const password = typeof body?.password === 'string' ? body.password : ''

    const code = normalizeCode(rawCode)
    const email = normalizeEmail(rawEmail)

    if (!code || code.length !== 8) throw new HttpError(400, 'INVALID_CODE')
    if (!email || email.length > 320 || !emailPattern.test(email)) throw new HttpError(400, 'INVALID_EMAIL')
    if (password.length < 8 || password.length > 128) throw new HttpError(400, 'INVALID_PASSWORD')

    const { data: codeRow, error: codeLookupError } = await client
      .from('invite_codes')
      .select('id,code,role,status,expires_at,created_by')
      .eq('code', code)
      .eq('status', 'active')
      .maybeSingle()
    if (codeLookupError || !codeRow) throw new HttpError(400, 'INVALID_OR_EXPIRED_CODE')
    if (new Date(codeRow.expires_at) <= new Date()) {
      await client.from('invite_codes').update({ status: 'expired' }).eq('id', codeRow.id)
      throw new HttpError(400, 'INVALID_OR_EXPIRED_CODE')
    }

    const { data: existingUsers } = await client.auth.admin.listUsers({ filter: email, page: 1, perPage: 1 })
    if (existingUsers?.users?.some((u: { email?: string }) => u.email?.toLowerCase() === email)) {
      throw new HttpError(409, 'EMAIL_ALREADY_REGISTERED')
    }

    const { data: created, error: createError } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createError || !created.user) throw new HttpError(400, 'ACCOUNT_CREATION_FAILED')

    const userId = created.user.id
    const role = codeRow.role as string

    const { error: roleError } = await client.from('profiles').update({ role }).eq('user_id', userId)
    if (roleError) {
      await client.auth.admin.deleteUser(userId)
      throw new Error('ROLE_ASSIGNMENT_FAILED')
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { error: invitationError } = await client.from('invitations').insert({
      created_by: codeRow.created_by,
      email_normalized: email,
      invited_user_id: userId,
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      expires_at: expiresAt,
      role,
    })
    if (invitationError) {
      await client.from('profiles').update({ role: 'member' }).eq('user_id', userId)
      await client.auth.admin.deleteUser(userId)
      throw new Error('INVITATION_RECORD_FAILED')
    }

    await client.from('invite_codes').update({
      status: 'used',
      used_by: userId,
      used_at: new Date().toISOString(),
    }).eq('id', codeRow.id)

    await writeAudit(client, {
      action: 'invite_code_redeemed',
      targetUserId: userId,
      result: 'success',
      metadata: { codeId: codeRow.id, role, email },
    })

    return jsonResponse(request, { ok: true, email })
  } catch (error) {
    return handleFunctionError(request, error)
  }
})

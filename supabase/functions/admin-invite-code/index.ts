import { writeAudit } from '../_shared/audit.ts'
import { effectiveRole, handleFunctionError, HttpError, jsonResponse, optionsResponse, readJson, requireUser } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate-limit.ts'

const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8

const generateCode = (): string => {
  const bytes = new Uint8Array(CODE_LENGTH)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => CHARSET[b % CHARSET.length]).join('')
}

const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`

const codeResponse = (row: Record<string, unknown>) => ({
  id: row.id,
  code: formatCode(row.code as string),
  label: row.label || '',
  role: row.role || 'member',
  status: row.status,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  usedAt: row.used_at || undefined,
})

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request)
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED')
    const { client, user } = await requireUser(request)
    const actorRole = await effectiveRole(client, user.id)
    if (!['owner', 'manager'].includes(actorRole)) throw new HttpError(403, 'ADMIN_REQUIRED')
    const body = await readJson(request)
    const action = typeof body?.action === 'string' ? body.action : 'create'

    if (action === 'revoke') {
      await enforceRateLimit(client, `admin-invite-code-revoke:${user.id}`, 60, 3600)
      const codeId = typeof body?.codeId === 'string' ? body.codeId : ''
      if (!codeId) throw new HttpError(400, 'INVALID_PAYLOAD')
      const { data, error } = await client
        .from('invite_codes')
        .update({ status: 'revoked' })
        .eq('id', codeId)
        .eq('status', 'active')
        .select('id,code,label,role,status,created_at,expires_at,used_at')
        .maybeSingle()
      if (error) throw new Error('CODE_REVOKE_FAILED')
      if (!data) throw new HttpError(404, 'CODE_NOT_ACTIVE')
      await writeAudit(client, { action: 'invite_code_revoked', actorUserId: user.id, result: 'success', metadata: { codeId } })
      return jsonResponse(request, { code: codeResponse(data) })
    }

    if (action === 'create') {
      await enforceRateLimit(client, `admin-invite-code-create:${user.id}`, 20, 3600)
      const requestedRole = body?.role === 'host' || body?.role === 'manager' || body?.role === 'member' ? body.role : 'member'
      if (requestedRole === 'manager' && actorRole !== 'owner') throw new HttpError(403, 'ROLE_ASSIGNMENT_FORBIDDEN')
      const label = typeof body?.label === 'string' ? body.label.trim().slice(0, 100) : ''
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

      let code = ''
      for (let attempt = 0; attempt < 5; attempt++) {
        code = generateCode()
        const { data: existing } = await client.from('invite_codes').select('id').eq('code', code).maybeSingle()
        if (!existing) break
        if (attempt === 4) throw new Error('CODE_GENERATION_FAILED')
      }

      const { data, error } = await client
        .from('invite_codes')
        .insert({ code, label, role: requestedRole, created_by: user.id, expires_at: expiresAt })
        .select('id,code,label,role,status,created_at,expires_at,used_at')
        .single()
      if (error || !data) throw new Error('CODE_INSERT_FAILED')
      await writeAudit(client, { action: 'invite_code_created', actorUserId: user.id, result: 'success', metadata: { codeId: data.id, role: requestedRole } })
      return jsonResponse(request, { code: codeResponse(data) })
    }

    throw new HttpError(400, 'INVALID_ACTION')
  } catch (error) {
    return handleFunctionError(request, error)
  }
})

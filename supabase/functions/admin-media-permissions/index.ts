import { effectiveRole, handleFunctionError, HttpError, jsonResponse, optionsResponse, readJson, requireUser } from '../_shared/http.ts'
import { writeAudit } from '../_shared/audit.ts'

type Quality = '720p30' | '1080p30' | '1080p60'
const qualities: Quality[] = ['720p30', '1080p30', '1080p60']
const isQuality = (value: unknown): value is Quality => typeof value === 'string' && qualities.includes(value as Quality)

const provider = () => Deno.env.get('RTC_PROVIDER')?.trim().toLowerCase() === 'torre' ? 'torre' : 'livekit'

const getRolePermissions = async (client: any) => {
  const { data, error } = await client
    .from('call_guardrail_settings')
    .select('member_screen_share_quality,host_screen_share_quality,manager_screen_share_quality')
    .eq('id', true)
    .single()
  if (error || !data) throw new Error('MEDIA_PERMISSION_SETTINGS_LOOKUP_FAILED')
  return {
    member: data.member_screen_share_quality as Quality,
    host: data.host_screen_share_quality as Quality,
    manager: data.manager_screen_share_quality as Quality,
    owner: '1080p60' as Quality,
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request)
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED')
    const { client, user } = await requireUser(request)
    if (await effectiveRole(client, user.id) !== 'owner') throw new HttpError(403, 'OWNER_REQUIRED')
    const body = await readJson(request)
    const action = typeof body?.action === 'string' ? body.action : 'get'

    if (action === 'get') return jsonResponse(request, { provider: provider(), rolePermissions: await getRolePermissions(client) })

    if (action === 'update_roles') {
      const permissions = body?.rolePermissions
      if (!permissions || typeof permissions !== 'object') throw new HttpError(400, 'INVALID_PAYLOAD')
      const values = permissions as Record<string, unknown>
      if (!isQuality(values.member) || !isQuality(values.host) || !isQuality(values.manager)) throw new HttpError(400, 'INVALID_QUALITY')
      const { error } = await client.from('call_guardrail_settings').update({
        member_screen_share_quality: values.member,
        host_screen_share_quality: values.host,
        manager_screen_share_quality: values.manager,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }).eq('id', true)
      if (error) throw new Error('MEDIA_PERMISSION_SETTINGS_UPDATE_FAILED')
      await writeAudit(client, { action: 'media_role_permissions_updated', actorUserId: user.id, result: 'success', metadata: { rolePermissions: values } })
      return jsonResponse(request, { provider: provider(), rolePermissions: await getRolePermissions(client) })
    }

    if (action === 'set_user') {
      const userId = typeof body?.userId === 'string' ? body.userId : ''
      const quality = body?.quality
      if (!/^[0-9a-f-]{36}$/i.test(userId) || (quality !== null && !isQuality(quality))) throw new HttpError(400, 'INVALID_PAYLOAD')
      const { data, error } = await client.from('profiles').update({ screen_share_quality_override: quality }).eq('user_id', userId).select('user_id').maybeSingle()
      if (error || !data) throw new HttpError(404, 'USER_NOT_FOUND')
      await writeAudit(client, { action: 'media_user_permission_updated', actorUserId: user.id, targetUserId: userId, result: 'success', metadata: { quality } })
      return jsonResponse(request, { ok: true })
    }

    throw new HttpError(400, 'INVALID_ACTION')
  } catch (error) {
    return handleFunctionError(request, error)
  }
})

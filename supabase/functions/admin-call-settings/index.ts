import { effectiveRole, handleFunctionError, HttpError, jsonResponse, optionsResponse, readJson, requireUser } from '../_shared/http.ts'
import { writeAudit } from '../_shared/audit.ts'

const fields = ['solo_warning_seconds', 'solo_kick_seconds', 'max_call_seconds', 'max_warning_seconds', 'cooldown_seconds', 'max_screen_share_dimension', 'active_call_limit', 'starting_timeout_seconds'] as const
const output = (row: Record<string, unknown>) => ({
  soloWarningSeconds: Number(row.solo_warning_seconds),
  soloKickSeconds: Number(row.solo_kick_seconds),
  maxCallSeconds: Number(row.max_call_seconds),
  maxWarningSeconds: Number(row.max_warning_seconds),
  cooldownSeconds: Number(row.cooldown_seconds),
  maxScreenShareDimension: Number(row.max_screen_share_dimension),
  activeCallLimit: Number(row.active_call_limit),
  startingTimeoutSeconds: Number(row.starting_timeout_seconds),
  updatedAt: row.updated_at,
})

const readSettings = async (client: any) => {
  const { data, error } = await client.from('call_guardrail_settings').select('*').eq('id', true).single()
  if (error || !data) throw new Error('SETTINGS_LOOKUP_FAILED')
  return data
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request)
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED')
    const { client, user } = await requireUser(request)
    if (await effectiveRole(client, user.id) !== 'owner') throw new HttpError(403, 'OWNER_REQUIRED')
    const body = await readJson(request)
    const action = typeof body?.action === 'string' ? body.action : 'get'
    if (action === 'get') return jsonResponse(request, { settings: output(await readSettings(client)) })
    if (action !== 'update' || !body?.settings || typeof body.settings !== 'object') throw new HttpError(400, 'INVALID_PAYLOAD')
    const settings = body.settings as Record<string, unknown>
    const update: Record<string, number | string> = {}
    for (const field of fields) {
      const value = settings[field] ?? settings[field.replace(/_([a-z])/g, (_, letter) => String(letter).toUpperCase())]
      if (typeof value !== 'number' || !Number.isInteger(value) || !Number.isFinite(value)) throw new HttpError(400, 'INVALID_SETTINGS')
      update[field] = value
    }
    if (update.solo_kick_seconds <= update.solo_warning_seconds) throw new HttpError(400, 'KICK_AFTER_WARNING_REQUIRED')
    if (update.max_warning_seconds >= update.max_call_seconds) throw new HttpError(400, 'MAX_WARNING_BEFORE_END_REQUIRED')
    const { data, error } = await client.from('call_guardrail_settings').update({ ...update, updated_by: user.id, updated_at: new Date().toISOString() }).eq('id', true).select('*').single()
    if (error || !data) throw new HttpError(400, 'SETTINGS_UPDATE_FAILED')
    await writeAudit(client, { action: 'call_guardrail_settings_updated', actorUserId: user.id, result: 'success', metadata: { settings: output(data) } })
    return jsonResponse(request, { settings: output(data) })
  } catch (error) { return handleFunctionError(request, error) }
})

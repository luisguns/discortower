import { effectiveRole, handleFunctionError, HttpError, jsonResponse, optionsResponse, requireUser } from '../_shared/http.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request)
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED')
    const { client, user } = await requireUser(request)
    const role = await effectiveRole(client, user.id)
    if (!['owner', 'manager'].includes(role)) throw new HttpError(403, 'ADMIN_REQUIRED')
    const monthStart = new Date()
    monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0)
    const { data, error } = await client.from('participant_sessions').select('joined_at,left_at').gte('joined_at', monthStart.toISOString())
    if (error) throw new Error('USAGE_LOOKUP_FAILED')
    const now = Date.now()
    const seconds = (data || []).reduce((total, row) => total + Math.max(0, (new Date(row.left_at || now).getTime() - new Date(row.joined_at).getTime()) / 1000), 0)
    const estimatedMinutes = Math.ceil(seconds / 60)
    const budget = Number(Deno.env.get('LIVEKIT_MONTHLY_PARTICIPANT_MINUTES_BUDGET') || 5000)
    return jsonResponse(request, { estimatedMinutes, budget, percentage: budget > 0 ? Math.round((estimatedMinutes / budget) * 100) : null, monthStart: monthStart.toISOString() })
  } catch (error) { return handleFunctionError(request, error) }
})

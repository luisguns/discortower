import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0'

export const writeAudit = async (
  client: SupabaseClient,
  values: { actorUserId?: string; action: string; targetUserId?: string; targetRoomId?: string; result: string; metadata?: Record<string, unknown> },
) => {
  await client.from('audit_log').insert({
    action: values.action,
    actor_user_id: values.actorUserId || null,
    metadata: values.metadata || {},
    result: values.result,
    target_room_id: values.targetRoomId || null,
    target_user_id: values.targetUserId || null,
  })
}


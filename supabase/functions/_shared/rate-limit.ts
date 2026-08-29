import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0'

export const enforceRateLimit = async (client: SupabaseClient, key: string, limit: number, windowSeconds: number) => {
  const { data, error } = await client.rpc('consume_rate_limit', {
    p_bucket_key: key.slice(0, 180),
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })
  if (error || data !== true) {
    const rateLimitError = new Error('RATE_LIMITED')
    rateLimitError.name = 'RateLimitError'
    throw rateLimitError
  }
}


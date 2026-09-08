-- S04: explicit grants survive REVOKE FROM PUBLIC. Only trusted Edge code may
-- choose bucket names and policy. Do not change unrelated default privileges.
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- Atomic INSERT/UPDATE also serializes first use of a previously absent bucket.
create or replace function public.consume_rate_limit(p_bucket_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare accepted boolean;
begin
  if p_bucket_key is null or char_length(p_bucket_key) not between 1 and 180
     or p_limit is null or p_limit < 1 or p_window_seconds is null
     or p_window_seconds not between 1 and 86400 then return false; end if;
  insert into public.rate_limit_buckets as bucket (bucket_key, window_started_at, request_count)
  values (p_bucket_key, timezone('utc', now()), 1)
  on conflict (bucket_key) do update set
    window_started_at = case when bucket.window_started_at + make_interval(secs => p_window_seconds) <= timezone('utc', now())
      then excluded.window_started_at else bucket.window_started_at end,
    request_count = case when bucket.window_started_at + make_interval(secs => p_window_seconds) <= timezone('utc', now())
      then 1 else bucket.request_count + 1 end
  where bucket.window_started_at + make_interval(secs => p_window_seconds) <= timezone('utc', now())
     or bucket.request_count < p_limit
  returning true into accepted;
  return coalesce(accepted, false);
end;
$$;

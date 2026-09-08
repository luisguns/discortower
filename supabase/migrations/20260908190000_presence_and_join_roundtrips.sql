-- H10/H11: keep authorization in the database while reducing periodic writes
-- and sequential Edge-to-DB round trips. These functions are backend-only.
create or replace function public.set_user_presence(
  p_user_id uuid, p_activity_id uuid, p_ttl_seconds integer
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_user_id is null or p_ttl_seconds not between 120 and 300 then
    raise exception using errcode = '22023', message = 'PRESENCE_INVALID';
  end if;
  if not exists (select 1 from public.profiles where user_id = p_user_id and status = 'active')
     or (not exists (select 1 from public.admin_users where user_id = p_user_id)
       and not exists (select 1 from public.invitations where invited_user_id = p_user_id and status = 'accepted')) then
    raise exception using errcode = '42501', message = 'ACCOUNT_INACTIVE';
  end if;
  if p_activity_id is not null and not exists (
    select 1 from public.activity_catalog where id = p_activity_id and enabled
  ) then raise exception using errcode = '22023', message = 'ACTIVITY_INVALID'; end if;
  insert into public.user_presence as presence (user_id, activity_id, last_seen_at, expires_at)
  values (p_user_id, p_activity_id, timezone('utc', now()),
    timezone('utc', now()) + make_interval(secs => p_ttl_seconds))
  on conflict (user_id) do update set activity_id = excluded.activity_id,
    last_seen_at = excluded.last_seen_at, expires_at = excluded.expires_at
  where presence.activity_id is distinct from excluded.activity_id
     or presence.expires_at < timezone('utc', now()) + make_interval(secs => p_ttl_seconds - 30);
  return true;
end; $$;

create or replace function public.get_token_issue_context(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'profile', to_jsonb(p),
    'role', public.get_effective_role(p_user_id),
    'mediaSettings', to_jsonb(s)
  )
  from public.profiles p cross join public.call_guardrail_settings s
  where p.user_id = p_user_id and s.id = true;
$$;

create or replace function public.reserve_channel_call_access(
  p_call_id uuid, p_user_id uuid, p_room_name text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare session_row public.room_sessions; restricted boolean;
begin
  session_row := public.reserve_channel_call_session(p_call_id, p_user_id, p_room_name);
  select coalesce(r.screen_share_blocked, false) into restricted
  from public.call_media_restrictions r
  where r.room_session_id = session_row.id and r.user_id = p_user_id;
  return jsonb_build_object('session', to_jsonb(session_row), 'screenShareBlocked', coalesce(restricted, false));
end; $$;

revoke all on function public.set_user_presence(uuid, uuid, integer),
  public.get_token_issue_context(uuid),
  public.reserve_channel_call_access(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.set_user_presence(uuid, uuid, integer),
  public.get_token_issue_context(uuid),
  public.reserve_channel_call_access(uuid, uuid, text) to service_role;

-- H12: the summary always asks for open participants by room. Keep the older
-- general index for history and add a smaller partial index for the hot path.
create index if not exists participant_sessions_open_room_idx
  on public.participant_sessions (room_session_id, joined_at) where left_at is null;

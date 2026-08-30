create table public.call_guardrail_settings (
  id boolean primary key default true check (id),
  solo_warning_seconds integer not null default 240 check (solo_warning_seconds between 30 and 3600),
  solo_kick_seconds integer not null default 300 check (solo_kick_seconds between 60 and 86400),
  max_call_seconds integer not null default 21600 check (max_call_seconds between 300 and 86400),
  max_warning_seconds integer not null default 300 check (max_warning_seconds between 30 and 3600),
  cooldown_seconds integer not null default 900 check (cooldown_seconds between 0 and 86400),
  max_screen_share_dimension integer not null default 1280 check (max_screen_share_dimension between 360 and 3840),
  active_call_limit integer not null default 5 check (active_call_limit between 1 and 100),
  starting_timeout_seconds integer not null default 120 check (starting_timeout_seconds between 30 and 900),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now()),
  check (max_warning_seconds < max_call_seconds)
);

insert into public.call_guardrail_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.call_guardrail_settings enable row level security;
revoke all on public.call_guardrail_settings from anon, authenticated;

create or replace function public.reserve_channel_session(
  p_channel_id uuid,
  p_user_id uuid,
  p_room_name text,
  p_max_active integer default 5
)
returns public.room_sessions
language plpgsql security definer set search_path = public
as $$
declare
  current_session public.room_sessions;
  configured_limit integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('channel:' || p_channel_id::text, 0));
  select * into current_session from public.room_sessions
  where channel_id = p_channel_id and status in ('starting', 'open')
  order by created_at desc limit 1;
  if found then return current_session; end if;
  select active_call_limit into configured_limit from public.call_guardrail_settings where id = true;
  if (select count(*) from public.room_sessions where status in ('starting', 'open')) >= coalesce(configured_limit, p_max_active) then
    raise exception using errcode = '53400', message = 'ACTIVE_CALL_LIMIT_REACHED';
  end if;
  if not exists (select 1 from public.channels where id = p_channel_id and status = 'active') then
    raise exception using errcode = '22023', message = 'CHANNEL_NOT_FOUND';
  end if;
  if exists (select 1 from public.channels where id = p_channel_id and reopen_after is not null and reopen_after > timezone('utc', now())) then
    raise exception using errcode = '55006', message = 'CHANNEL_COOLDOWN';
  end if;
  insert into public.room_sessions (channel_id, room_name, created_by, status)
  values (p_channel_id, p_room_name, p_user_id, 'starting')
  returning * into current_session;
  update public.channels set current_room_session_id = current_session.id, participant_count = 0, call_started_at = null where id = p_channel_id;
  return current_session;
end;
$$;

revoke all on function public.reserve_channel_session(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_channel_session(uuid, uuid, text, integer) to service_role;

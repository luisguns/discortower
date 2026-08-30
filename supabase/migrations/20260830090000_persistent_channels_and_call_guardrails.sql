create type public.account_role as enum ('manager', 'host', 'member');
create type public.channel_status as enum ('active', 'archived');
create type public.call_end_reason as enum ('livekit_finished', 'solo_timeout', 'max_duration', 'admin', 'channel_archived', 'stale_start', 'capacity');

alter table public.profiles
  add column if not exists role public.account_role not null default 'member';

alter table public.invitations
  add column if not exists role public.account_role not null default 'member';

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 48),
  name_normalized text generated always as (lower(regexp_replace(trim(name), '\s+', ' ', 'g'))) stored,
  created_by uuid not null references auth.users(id) on delete restrict,
  status public.channel_status not null default 'active',
  current_room_session_id uuid,
  participant_count integer not null default 0 check (participant_count >= 0),
  call_started_at timestamptz,
  reopen_after timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index channels_active_name_idx on public.channels (name_normalized) where status = 'active';
create index channels_created_by_idx on public.channels (created_by, created_at desc);

alter table public.room_sessions
  add column if not exists channel_id uuid references public.channels(id) on delete set null,
  add column if not exists ended_reason public.call_end_reason,
  add column if not exists solo_since timestamptz,
  add column if not exists solo_warning_sent_at timestamptz,
  add column if not exists max_warning_sent_at timestamptz;

create unique index room_sessions_one_active_per_channel_idx
  on public.room_sessions (channel_id) where channel_id is not null and status in ('starting', 'open');
create index room_sessions_channel_idx on public.room_sessions (channel_id, created_at desc);

alter table public.channels
  add constraint channels_current_session_fk foreign key (current_room_session_id)
  references public.room_sessions(id) on delete set null;

create table public.call_media_restrictions (
  room_session_id uuid not null references public.room_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  screen_share_blocked boolean not null default false,
  reason text not null default 'resolution_limit',
  created_at timestamptz not null default timezone('utc', now()),
  primary key (room_session_id, user_id)
);

create or replace function public.is_active_user()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and status = 'active'
  ) and (
    public.is_admin() or exists (
      select 1 from public.invitations
      where invited_user_id = auth.uid() and status = 'accepted'
    )
  );
$$;

create or replace function public.get_effective_role(p_user_id uuid default auth.uid())
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when auth.uid() is not null and p_user_id <> auth.uid() then 'member'
    when exists (select 1 from public.admin_users where user_id = p_user_id) then 'owner'
    else coalesce((select role::text from public.profiles where user_id = p_user_id), 'member')
  end;
$$;

create or replace function public.get_my_access_context()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  current_profile public.profiles;
  effective_role text;
begin
  if auth.uid() is null then raise exception using errcode = '42501'; end if;
  update public.invitations set status = 'expired'
  where status = 'pending' and expires_at <= timezone('utc', now());
  update public.invitations
  set status = 'accepted', accepted_at = coalesce(accepted_at, timezone('utc', now()))
  where invited_user_id = auth.uid() and status = 'pending' and expires_at > timezone('utc', now());
  select * into current_profile from public.profiles where user_id = auth.uid();
  if not found then raise exception using errcode = '42501'; end if;
  if not public.is_admin() and not exists (
    select 1 from public.invitations where invited_user_id = auth.uid() and status = 'accepted'
  ) then current_profile.status = 'disabled'; end if;
  effective_role := public.get_effective_role(auth.uid());
  return jsonb_build_object(
    'user_id', auth.uid(),
    'is_admin', effective_role in ('owner', 'manager'),
    'role', effective_role,
    'capabilities', jsonb_build_object(
      'can_create_channel', effective_role in ('owner', 'manager', 'host'),
      'can_manage_all_channels', effective_role in ('owner', 'manager'),
      'can_manage_users', effective_role in ('owner', 'manager'),
      'can_invite_managers', effective_role = 'owner',
      'can_moderate_all_calls', effective_role in ('owner', 'manager'),
      'can_high_quality_screen_share', effective_role in ('owner', 'manager', 'host')
    ),
    'profile', jsonb_build_object(
      'user_id', current_profile.user_id,
      'display_name', current_profile.display_name,
      'avatar_url', current_profile.avatar_url,
      'status', current_profile.status,
      'role', current_profile.role,
      'created_at', current_profile.created_at,
      'updated_at', current_profile.updated_at
    )
  );
end;
$$;

create or replace function public.touch_channel_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = timezone('utc', now()); return new; end; $$;

create trigger channels_touch_updated_at before update on public.channels
for each row execute function public.touch_channel_updated_at();

alter table public.channels enable row level security;
alter table public.call_media_restrictions enable row level security;

revoke all on public.channels from anon, authenticated;
revoke all on public.call_media_restrictions from anon, authenticated;
grant select on public.channels to authenticated;

create policy channels_read_active on public.channels
  for select to authenticated
  using ((status = 'active' and public.is_active_user()) or public.is_admin());

create policy manager_read_profiles on public.profiles
  for select to authenticated using (public.get_effective_role(auth.uid()) in ('owner', 'manager'));
create policy manager_read_invitations on public.invitations
  for select to authenticated using (public.get_effective_role(auth.uid()) in ('owner', 'manager'));
create policy manager_read_rooms on public.room_sessions
  for select to authenticated using (public.get_effective_role(auth.uid()) in ('owner', 'manager'));
create policy manager_read_participants on public.participant_sessions
  for select to authenticated using (public.get_effective_role(auth.uid()) in ('owner', 'manager'));
create policy manager_read_audit on public.audit_log
  for select to authenticated using (public.get_effective_role(auth.uid()) in ('owner', 'manager'));

revoke all on function public.is_active_user() from public;
revoke all on function public.get_effective_role(uuid) from public;
grant execute on function public.is_active_user() to authenticated, service_role;
grant execute on function public.get_effective_role(uuid) to authenticated, service_role;
grant execute on function public.get_my_access_context() to authenticated, service_role;

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
begin
  perform pg_advisory_xact_lock(hashtextextended('channel:' || p_channel_id::text, 0));
  select * into current_session from public.room_sessions
  where channel_id = p_channel_id and status in ('starting', 'open')
  order by created_at desc limit 1;
  if found then return current_session; end if;
  if (select count(*) from public.room_sessions where status in ('starting', 'open')) >= p_max_active then
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

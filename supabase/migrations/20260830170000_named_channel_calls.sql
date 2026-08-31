-- Persistent, named calls inside private channels.
create type public.channel_member_role as enum ('owner', 'admin', 'member');

alter table public.channel_members
  add column if not exists role public.channel_member_role not null default 'member',
  add column if not exists added_by uuid references auth.users(id) on delete set null;

update public.channel_members cm
set role = 'owner'
from public.channels c
where c.id = cm.channel_id and c.created_by = cm.user_id;

create table public.channel_calls (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 48),
  name_normalized text generated always as (lower(regexp_replace(trim(name), '\\s+', ' ', 'g'))) stored,
  created_by uuid not null references auth.users(id) on delete restrict,
  status public.channel_status not null default 'active',
  current_room_session_id uuid,
  participant_count integer not null default 0 check (participant_count >= 0),
  call_started_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create unique index channel_calls_active_name_idx on public.channel_calls(channel_id, name_normalized) where status = 'active';
create index channel_calls_channel_idx on public.channel_calls(channel_id, status, created_at);

alter table public.room_sessions add column if not exists channel_call_id uuid references public.channel_calls(id) on delete set null;
create index room_sessions_call_idx on public.room_sessions(channel_call_id, created_at desc);

create table public.channel_call_blocks (
  call_id uuid not null references public.channel_calls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  blocked_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (call_id, user_id)
);

create table public.channel_invites (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null default (timezone('utc', now()) + interval '7 days'),
  max_uses integer not null default 10 check (max_uses between 1 and 1000),
  use_count integer not null default 0 check (use_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);
create index channel_invites_channel_idx on public.channel_invites(channel_id, created_at desc);

alter table public.channel_calls enable row level security;
alter table public.channel_call_blocks enable row level security;
alter table public.channel_invites enable row level security;
revoke all on public.channel_calls, public.channel_call_blocks, public.channel_invites from anon, authenticated;
grant select on public.channel_calls to authenticated;

create or replace function public.is_channel_member(p_channel_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.channel_members where channel_id = p_channel_id and user_id = p_user_id
  );
$$;

create or replace function public.get_channel_member_role(p_channel_id uuid, p_user_id uuid default auth.uid())
returns text language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then 'owner' else coalesce((select role::text from public.channel_members where channel_id = p_channel_id and user_id = p_user_id), '') end;
$$;

drop policy if exists channels_read_active on public.channels;
create policy channels_read_member on public.channels for select to authenticated
using (public.is_channel_member(id) and status = 'active');

create policy channel_calls_read_member on public.channel_calls for select to authenticated
using (public.is_channel_member(channel_id));

-- Backfill one reusable call per existing active channel and attach the current session.
insert into public.channel_calls(channel_id, name, created_by)
select c.id, 'Geral', c.created_by from public.channels c
where c.status = 'active'
  and not exists (select 1 from public.channel_calls cc where cc.channel_id = c.id);
update public.room_sessions rs set channel_call_id = cc.id
from public.channel_calls cc where rs.channel_id = cc.channel_id and rs.channel_call_id is null
  and rs.status in ('starting', 'open');
update public.channel_calls cc set current_room_session_id = rs.id, participant_count = c.participant_count,
  call_started_at = c.call_started_at
from public.room_sessions rs, public.channels c
where c.id = cc.channel_id and rs.id = c.current_room_session_id and rs.channel_call_id = cc.id;

create or replace function public.reserve_channel_call_session(
  p_call_id uuid, p_user_id uuid, p_room_name text
) returns public.room_sessions language plpgsql security definer set search_path = public as $$
declare current_session public.room_sessions; call_row public.channel_calls; configured_limit integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('call:' || p_call_id::text, 0));
  select * into call_row from public.channel_calls where id = p_call_id and status = 'active';
  if not found or not exists (select 1 from public.channels c where c.id = call_row.channel_id and c.status = 'active') then
    raise exception using errcode = '22023', message = 'CALL_NOT_FOUND';
  end if;
  if not public.is_channel_member(call_row.channel_id, p_user_id) then raise exception using errcode = '42501', message = 'CHANNEL_ACCESS_DENIED'; end if;
  if exists (select 1 from public.channel_call_blocks where call_id = p_call_id and user_id = p_user_id) then raise exception using errcode = '42501', message = 'CALL_BLOCKED'; end if;
  select * into current_session from public.room_sessions where channel_call_id = p_call_id and status in ('starting','open') order by created_at desc limit 1;
  if found then return current_session; end if;
  select active_call_limit into configured_limit from public.call_guardrail_settings where id = true;
  if (select count(*) from public.room_sessions where status in ('starting','open')) >= coalesce(configured_limit, 5) then raise exception using errcode = '53400', message = 'ACTIVE_CALL_LIMIT_REACHED'; end if;
  insert into public.room_sessions(channel_id, channel_call_id, room_name, created_by, status) values (call_row.channel_id, p_call_id, p_room_name, p_user_id, 'starting') returning * into current_session;
  update public.channel_calls set current_room_session_id = current_session.id, participant_count = 0, call_started_at = null where id = p_call_id;
  return current_session;
end; $$;
revoke all on function public.reserve_channel_call_session(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_channel_call_session(uuid, uuid, text) to service_role;

revoke all on function public.is_channel_member(uuid, uuid), public.get_channel_member_role(uuid, uuid) from public;
grant execute on function public.is_channel_member(uuid, uuid), public.get_channel_member_role(uuid, uuid) to authenticated, service_role;

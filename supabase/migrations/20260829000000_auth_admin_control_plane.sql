create extension if not exists pgcrypto;

create type public.account_status as enum ('active', 'disabled');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.room_session_status as enum ('starting', 'open', 'closed');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) between 0 and 48),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 430000),
  status public.account_status not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users(id) on delete set null
);

-- The initial owner is inserted out-of-band by the project owner. This index
-- makes the single-owner rule enforceable even if SQL is run twice.
create unique index admin_users_single_owner on public.admin_users ((true));

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null check (email_normalized = lower(trim(email_normalized))),
  invited_user_id uuid references auth.users(id) on delete set null,
  status public.invitation_status not null default 'pending',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  accepted_at timestamptz
);

create unique index one_pending_invitation_per_email
  on public.invitations (email_normalized) where status = 'pending';
create index invitations_created_at_idx on public.invitations (created_at desc);

create table public.room_sessions (
  id uuid primary key default gen_random_uuid(),
  livekit_room_sid text unique,
  room_name text not null check (room_name ~ '^[A-Z0-9_-]{1,96}$'),
  status public.room_session_status not null default 'starting',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  ended_at timestamptz,
  last_event_at timestamptz not null default timezone('utc', now())
);

create index room_sessions_status_idx on public.room_sessions (status, created_at desc);
create index room_sessions_name_idx on public.room_sessions (room_name, created_at desc);

create table public.participant_sessions (
  id uuid primary key default gen_random_uuid(),
  room_session_id uuid not null references public.room_sessions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  livekit_identity text not null,
  participant_name text not null check (char_length(participant_name) between 1 and 48),
  joined_at timestamptz not null default timezone('utc', now()),
  left_at timestamptz
);

create index participant_sessions_room_idx on public.participant_sessions (room_session_id, joined_at);
create index participant_sessions_open_idx on public.participant_sessions (user_id, left_at) where left_at is null;

create table public.webhook_events (
  event_id text primary key,
  event_type text not null,
  occurred_at timestamptz not null,
  processed_at timestamptz,
  result text not null default 'received' check (char_length(result) <= 120)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 1 and 80),
  target_user_id uuid references auth.users(id) on delete set null,
  target_room_id uuid references public.room_sessions(id) on delete set null,
  result text not null check (char_length(result) between 1 and 40),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index audit_log_created_at_idx on public.audit_log (created_at desc);

alter publication supabase_realtime add table public.room_sessions, public.participant_sessions, public.invitations;

create table public.rate_limit_buckets (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0)
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 48)
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
$$;

create or replace function public.consume_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_bucket public.rate_limit_buckets;
begin
  if p_limit < 1 or p_window_seconds < 1 or char_length(p_bucket_key) > 180 then
    return false;
  end if;

  select * into current_bucket
  from public.rate_limit_buckets
  where bucket_key = p_bucket_key
  for update;

  if not found or current_bucket.window_started_at + make_interval(secs => p_window_seconds) <= timezone('utc', now()) then
    insert into public.rate_limit_buckets (bucket_key, window_started_at, request_count)
    values (p_bucket_key, timezone('utc', now()), 1)
    on conflict (bucket_key) do update set
      window_started_at = excluded.window_started_at,
      request_count = 1;
    return true;
  end if;

  if current_bucket.request_count >= p_limit then return false; end if;
  update public.rate_limit_buckets
  set request_count = request_count + 1
  where bucket_key = p_bucket_key;
  return true;
end;
$$;

create or replace function public.get_my_access_context()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.profiles;
begin
  if auth.uid() is null then raise exception using errcode = '42501'; end if;

  update public.invitations
  set status = 'expired'
  where status = 'pending' and expires_at <= timezone('utc', now());

  update public.invitations
  set status = 'accepted', accepted_at = coalesce(accepted_at, timezone('utc', now()))
  where invited_user_id = auth.uid() and status = 'pending' and expires_at > timezone('utc', now());

  select * into current_profile from public.profiles where user_id = auth.uid();
  if not found then raise exception using errcode = '42501'; end if;

  -- An invited identity cannot be used after its only pending invitation was revoked.
  if not public.is_admin()
     and not exists (select 1 from public.invitations where invited_user_id = auth.uid() and status = 'accepted') then
    current_profile.status = 'disabled';
  end if;

  return jsonb_build_object(
    'user_id', auth.uid(),
    'is_admin', public.is_admin(),
    'profile', jsonb_build_object(
      'user_id', current_profile.user_id,
      'display_name', current_profile.display_name,
      'avatar_url', current_profile.avatar_url,
      'status', current_profile.status,
      'created_at', current_profile.created_at,
      'updated_at', current_profile.updated_at
    )
  );
end;
$$;

create or replace function public.update_my_profile(p_display_name text, p_avatar_url text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or char_length(trim(p_display_name)) not between 1 and 48 then
    raise exception using errcode = '22023';
  end if;
  if p_avatar_url is not null and char_length(p_avatar_url) > 430000 then
    raise exception using errcode = '22023';
  end if;

  update public.profiles
  set display_name = regexp_replace(trim(p_display_name), '\s+', ' ', 'g'),
      avatar_url = p_avatar_url
  where user_id = auth.uid();
  return public.get_my_access_context();
end;
$$;

alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.invitations enable row level security;
alter table public.room_sessions enable row level security;
alter table public.participant_sessions enable row level security;
alter table public.webhook_events enable row level security;
alter table public.audit_log enable row level security;
alter table public.rate_limit_buckets enable row level security;

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on function public.is_admin() from public;
revoke all on function public.get_my_access_context() from public;
revoke all on function public.update_my_profile(text, text) from public;
revoke all on function public.consume_rate_limit(text, integer, integer) from public;
revoke all on function public.touch_updated_at() from public;
revoke all on function public.handle_new_user() from public;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.get_my_access_context() to authenticated, service_role;
grant execute on function public.update_my_profile(text, text) to authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant select on public.participant_sessions to authenticated;
grant select on public.room_sessions to authenticated;
grant select on public.invitations to authenticated;
grant select on public.audit_log to authenticated;

create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy profiles_update_own_fields on public.profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy admin_users_admin_read on public.admin_users
  for select to authenticated using (public.is_admin());

create policy invitations_admin_read on public.invitations
  for select to authenticated using (public.is_admin());

create policy room_sessions_admin_read on public.room_sessions
  for select to authenticated using (public.is_admin());

create policy participant_sessions_admin_or_own_read on public.participant_sessions
  for select to authenticated using (public.is_admin() or user_id = auth.uid());

create policy audit_log_admin_read on public.audit_log
  for select to authenticated using (public.is_admin());

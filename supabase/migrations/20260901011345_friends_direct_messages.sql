-- Social graph, unique usernames and persistent direct messages.
-- The client can read only rows authorised by RLS; relationship transitions are
-- performed by the authenticated social Edge Function.

create schema if not exists private;

do $$ begin
  create type public.friendship_status as enum ('pending', 'accepted', 'removed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.direct_message_kind as enum ('text', 'image');
exception when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists username text,
  add column if not exists username_configured boolean not null default false,
  add column if not exists username_updated_at timestamptz;

update public.profiles
set username = 'pending_' || replace(user_id::text, '-', '')
where username is null;

alter table public.profiles
  alter column username set not null;

alter table public.profiles
  drop constraint if exists profiles_username_shape;
alter table public.profiles
  add constraint profiles_username_shape check (
    (not username_configured and username ~ '^pending_[0-9a-f]{32}$')
    or (
      username_configured
      and username ~ '^[a-z0-9_]{3,24}$'
      and username not in ('admin', 'administrator', 'moderator', 'support', 'system', 'splotys')
    )
  );

create unique index if not exists profiles_username_unique_idx
  on public.profiles (lower(username));

create or replace function public.normalize_profile_username()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.username is distinct from old.username then
    new.username := lower(trim(new.username));
    if new.username !~ '^[a-z0-9_]{3,24}$'
      or new.username in ('admin', 'administrator', 'moderator', 'support', 'system', 'splotys') then
      raise exception 'USERNAME_INVALID' using errcode = '22023';
    end if;
    new.username_configured := true;
    new.username_updated_at := timezone('utc', now());
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_normalize_username on public.profiles;
create trigger profiles_normalize_username
before update of username on public.profiles
for each row execute function public.normalize_profile_username();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name, username, username_configured)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 48),
    'pending_' || replace(new.id::text, '-', ''),
    false
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function public.claim_my_username(p_username text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  normalized_username text := lower(trim(coalesce(p_username, '')));
begin
  if auth.uid() is null then raise exception using errcode = '42501'; end if;
  if normalized_username !~ '^[a-z0-9_]{3,24}$'
    or normalized_username in ('admin', 'administrator', 'moderator', 'support', 'system', 'splotys') then
    raise exception 'USERNAME_INVALID' using errcode = '22023';
  end if;

  update public.profiles
  set username = normalized_username,
      display_name = case when trim(display_name) = '' then normalized_username else display_name end
  where user_id = auth.uid();
  return public.get_my_access_context();
exception
  when unique_violation then raise exception 'USERNAME_TAKEN' using errcode = '23505';
end;
$$;

grant update (username) on public.profiles to authenticated;
revoke all on function public.claim_my_username(text) from public, anon, service_role;
grant execute on function public.claim_my_username(text) to authenticated;

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_low_id uuid not null references auth.users(id) on delete cascade,
  user_high_id uuid not null references auth.users(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  accepted_at timestamptz,
  removed_at timestamptz,
  constraint friendships_canonical_pair check (user_low_id < user_high_id),
  constraint friendships_distinct_users check (requester_id <> addressee_id),
  constraint friendships_participants_match check (
    requester_id in (user_low_id, user_high_id)
    and addressee_id in (user_low_id, user_high_id)
  ),
  unique (user_low_id, user_high_id)
);

create index friendships_requester_status_idx on public.friendships (requester_id, status);
create index friendships_addressee_status_idx on public.friendships (addressee_id, status);

create table public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_distinct_users check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

create table public.direct_conversations (
  id uuid primary key default gen_random_uuid(),
  user_low_id uuid not null references auth.users(id) on delete cascade,
  user_high_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  last_message_id bigint,
  last_message_at timestamptz,
  constraint direct_conversations_canonical_pair check (user_low_id < user_high_id),
  unique (user_low_id, user_high_id)
);

create table public.direct_conversation_state (
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_message_id bigint,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (conversation_id, user_id)
);

create index direct_conversation_state_user_idx on public.direct_conversation_state (user_id);

create table public.direct_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  kind public.direct_message_kind not null,
  text_content text,
  storage_path text,
  image_name text,
  image_mime text,
  image_size integer,
  created_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint direct_messages_distinct_users check (sender_id <> recipient_id),
  constraint direct_messages_payload check (
    (kind = 'text' and char_length(trim(coalesce(text_content, ''))) between 1 and 2000 and storage_path is null and image_name is null and image_mime is null and image_size is null)
    or
    (kind = 'image' and text_content is null and storage_path is not null and image_name is not null and image_mime in ('image/jpeg', 'image/png', 'image/webp', 'image/gif') and image_size between 1 and 4194304)
  )
);

alter table public.direct_conversations
  add constraint direct_conversations_last_message_fk
  foreign key (last_message_id) references public.direct_messages(id) on delete set null;

create index direct_messages_conversation_id_idx on public.direct_messages (conversation_id, id desc);
create index direct_messages_recipient_id_idx on public.direct_messages (recipient_id, id desc);
create index direct_messages_sender_id_idx on public.direct_messages (sender_id, id desc);

create or replace function public.touch_friendship_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create trigger friendships_touch_updated_at
before update on public.friendships
for each row execute function public.touch_friendship_updated_at();

create or replace function public.update_direct_conversation_after_message()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.direct_conversations
  set last_message_id = new.id, last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger direct_messages_update_conversation
after insert on public.direct_messages
for each row execute function public.update_direct_conversation_after_message();

create or replace function public.social_transition(
  p_actor_id uuid,
  p_target_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  pair_low uuid;
  pair_high uuid;
  relationship public.friendships;
  conversation_id uuid;
begin
  if p_actor_id is null or p_target_id is null or p_actor_id = p_target_id then
    raise exception 'SOCIAL_TARGET_INVALID' using errcode = '22023';
  end if;
  if p_action not in ('send_request', 'accept_request', 'decline_request', 'cancel_request', 'remove_friend', 'block_user', 'unblock_user') then
    raise exception 'SOCIAL_ACTION_INVALID' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.profiles
    where user_id = p_target_id and status = 'active' and username_configured
  ) then
    raise exception 'SOCIAL_TARGET_NOT_FOUND' using errcode = 'P0002';
  end if;

  pair_low := least(p_actor_id, p_target_id);
  pair_high := greatest(p_actor_id, p_target_id);

  if p_action = 'unblock_user' then
    delete from public.user_blocks where blocker_id = p_actor_id and blocked_id = p_target_id;
    return jsonb_build_object('status', 'unblocked');
  end if;

  if p_action = 'block_user' then
    insert into public.user_blocks (blocker_id, blocked_id)
    values (p_actor_id, p_target_id)
    on conflict do nothing;
    update public.friendships
    set status = 'removed', removed_at = timezone('utc', now())
    where user_low_id = pair_low and user_high_id = pair_high and status <> 'removed';
    return jsonb_build_object('status', 'blocked');
  end if;

  if exists (
    select 1 from public.user_blocks
    where (blocker_id = p_actor_id and blocked_id = p_target_id)
       or (blocker_id = p_target_id and blocked_id = p_actor_id)
  ) then
    raise exception 'SOCIAL_ACTION_UNAVAILABLE' using errcode = '42501';
  end if;

  select * into relationship
  from public.friendships
  where user_low_id = pair_low and user_high_id = pair_high
  for update;

  if p_action = 'send_request' then
    if not found then
      insert into public.friendships (user_low_id, user_high_id, requester_id, addressee_id, status)
      values (pair_low, pair_high, p_actor_id, p_target_id, 'pending')
      returning * into relationship;
    elsif relationship.status = 'accepted' then
      raise exception 'FRIEND_ALREADY_ACCEPTED' using errcode = '23505';
    elsif relationship.status = 'pending' and relationship.requester_id = p_actor_id then
      raise exception 'FRIEND_REQUEST_ALREADY_SENT' using errcode = '23505';
    elsif relationship.status = 'pending' and relationship.requester_id = p_target_id then
      update public.friendships
      set status = 'accepted', accepted_at = timezone('utc', now()), removed_at = null
      where id = relationship.id
      returning * into relationship;
    else
      update public.friendships
      set requester_id = p_actor_id, addressee_id = p_target_id, status = 'pending', accepted_at = null, removed_at = null
      where id = relationship.id
      returning * into relationship;
    end if;
  elsif p_action = 'accept_request' then
    if not found or relationship.status <> 'pending' or relationship.addressee_id <> p_actor_id then
      raise exception 'FRIEND_REQUEST_NOT_FOUND' using errcode = 'P0002';
    end if;
    update public.friendships
    set status = 'accepted', accepted_at = timezone('utc', now()), removed_at = null
    where id = relationship.id
    returning * into relationship;
  elsif p_action = 'decline_request' then
    if not found or relationship.status <> 'pending' or relationship.addressee_id <> p_actor_id then
      raise exception 'FRIEND_REQUEST_NOT_FOUND' using errcode = 'P0002';
    end if;
    update public.friendships
    set status = 'removed', removed_at = timezone('utc', now())
    where id = relationship.id
    returning * into relationship;
  elsif p_action = 'cancel_request' then
    if not found or relationship.status <> 'pending' or relationship.requester_id <> p_actor_id then
      raise exception 'FRIEND_REQUEST_NOT_FOUND' using errcode = 'P0002';
    end if;
    update public.friendships
    set status = 'removed', removed_at = timezone('utc', now())
    where id = relationship.id
    returning * into relationship;
  elsif p_action = 'remove_friend' then
    if not found or relationship.status <> 'accepted' then
      raise exception 'FRIENDSHIP_NOT_FOUND' using errcode = 'P0002';
    end if;
    update public.friendships
    set status = 'removed', removed_at = timezone('utc', now())
    where id = relationship.id
    returning * into relationship;
  end if;

  if relationship.status = 'accepted' then
    insert into public.direct_conversations (user_low_id, user_high_id)
    values (pair_low, pair_high)
    on conflict (user_low_id, user_high_id) do nothing;
    select id into conversation_id from public.direct_conversations
    where user_low_id = pair_low and user_high_id = pair_high;
    insert into public.direct_conversation_state (conversation_id, user_id)
    values (conversation_id, pair_low), (conversation_id, pair_high)
    on conflict do nothing;
  end if;

  return jsonb_build_object('status', relationship.status, 'friendship_id', relationship.id, 'conversation_id', conversation_id);
end;
$$;

revoke all on function public.social_transition(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.social_transition(uuid, uuid, text) to service_role;

create or replace function private.can_access_direct_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.direct_conversations c
    where c.id = p_conversation_id
      and (select auth.uid()) in (c.user_low_id, c.user_high_id)
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = c.user_low_id and b.blocked_id = c.user_high_id)
           or (b.blocker_id = c.user_high_id and b.blocked_id = c.user_low_id)
      )
  );
$$;

revoke all on function private.can_access_direct_conversation(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.can_access_direct_conversation(uuid) to authenticated;

alter table public.friendships enable row level security;
alter table public.user_blocks enable row level security;
alter table public.direct_conversations enable row level security;
alter table public.direct_conversation_state enable row level security;
alter table public.direct_messages enable row level security;

revoke all on public.friendships, public.user_blocks, public.direct_conversations, public.direct_conversation_state, public.direct_messages from public, anon, authenticated;
grant select on public.friendships, public.user_blocks, public.direct_conversations, public.direct_conversation_state, public.direct_messages to authenticated;
grant insert on public.direct_messages to authenticated;
grant update (deleted_at) on public.direct_messages to authenticated;
grant update (last_read_message_id) on public.direct_conversation_state to authenticated;
grant usage, select on sequence public.direct_messages_id_seq to authenticated;

create policy friendships_select_participant on public.friendships
  for select to authenticated
  using ((select auth.uid()) in (user_low_id, user_high_id));

create policy user_blocks_select_participant on public.user_blocks
  for select to authenticated
  using ((select auth.uid()) in (blocker_id, blocked_id));

create policy direct_conversations_select_participant on public.direct_conversations
  for select to authenticated
  using ((select private.can_access_direct_conversation(id)));

create policy direct_conversation_state_select_own on public.direct_conversation_state
  for select to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_direct_conversation(conversation_id)));

create policy direct_conversation_state_update_own on public.direct_conversation_state
  for update to authenticated
  using ((select auth.uid()) = user_id and (select private.can_access_direct_conversation(conversation_id)))
  with check ((select auth.uid()) = user_id and (select private.can_access_direct_conversation(conversation_id)));

create policy direct_messages_select_participant on public.direct_messages
  for select to authenticated
  using ((select private.can_access_direct_conversation(conversation_id)));

create policy direct_messages_insert_active_friends on public.direct_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select private.can_access_direct_conversation(conversation_id))
    and exists (
      select 1
      from public.direct_conversations c
      join public.friendships f on f.user_low_id = c.user_low_id and f.user_high_id = c.user_high_id
      where c.id = conversation_id
        and f.status = 'accepted'
        and recipient_id in (c.user_low_id, c.user_high_id)
        and sender_id in (c.user_low_id, c.user_high_id)
    )
  );

create policy direct_messages_delete_own on public.direct_messages
  for update to authenticated
  using (sender_id = (select auth.uid()) and (select private.can_access_direct_conversation(conversation_id)))
  with check (
    sender_id = (select auth.uid())
    and deleted_at is not null
    and (select private.can_access_direct_conversation(conversation_id))
  );

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_social_context on public.profiles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
    or (
      not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = (select auth.uid()) and b.blocked_id = profiles.user_id)
           or (b.blocker_id = profiles.user_id and b.blocked_id = (select auth.uid()))
      )
      and (
        exists (
          select 1 from public.friendships f
          where profiles.user_id in (f.user_low_id, f.user_high_id)
            and (select auth.uid()) in (f.user_low_id, f.user_high_id)
        )
        or exists (
          select 1 from public.direct_conversations c
          where profiles.user_id in (c.user_low_id, c.user_high_id)
            and (select auth.uid()) in (c.user_low_id, c.user_high_id)
        )
      )
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'direct-message-images',
  'direct-message-images',
  false,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "direct message images read by participant" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'direct-message-images'
    and (select private.can_access_direct_conversation((storage.foldername(name))[1]::uuid))
  );

create policy "direct message images upload by active friend" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'direct-message-images'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.can_access_direct_conversation((storage.foldername(name))[1]::uuid))
    and exists (
      select 1
      from public.direct_conversations c
      join public.friendships f on f.user_low_id = c.user_low_id and f.user_high_id = c.user_high_id
      where c.id = (storage.foldername(name))[1]::uuid and f.status = 'accepted'
    )
  );

create policy "direct message images owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'direct-message-images'
    and owner_id = (select auth.uid()::text)
  );

alter publication supabase_realtime add table public.friendships, public.direct_messages;

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
      'username', case when current_profile.username_configured then current_profile.username else null end,
      'username_configured', current_profile.username_configured,
      'avatar_url', current_profile.avatar_url,
      'status', current_profile.status,
      'role', current_profile.role,
      'name_font', current_profile.name_font,
      'name_color', current_profile.name_color,
      'name_effect', current_profile.name_effect,
      'name_weight', current_profile.name_weight,
      'name_spacing', current_profile.name_spacing,
      'name_case', current_profile.name_case,
      'name_badge', current_profile.name_badge,
      'name_animation', current_profile.name_animation,
      'created_at', current_profile.created_at,
      'updated_at', current_profile.updated_at
    )
  );
end;
$$;

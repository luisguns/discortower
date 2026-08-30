create table public.channel_members (
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  primary key (channel_id, user_id)
);

create index channel_members_user_idx on public.channel_members (user_id, last_seen_at desc);

alter table public.channel_members enable row level security;
revoke all on public.channel_members from public, anon, authenticated;
grant all on public.channel_members to service_role;

insert into public.channel_members (channel_id, user_id, joined_at, last_seen_at)
select c.id, c.created_by, c.created_at, c.updated_at
from public.channels c
on conflict (channel_id, user_id) do nothing;

insert into public.channel_members (channel_id, user_id, joined_at, last_seen_at)
select rs.channel_id, ps.user_id, min(ps.joined_at), max(coalesce(ps.left_at, timezone('utc', now())))
from public.participant_sessions ps
join public.room_sessions rs on rs.id = ps.room_session_id
where rs.channel_id is not null and ps.user_id is not null
group by rs.channel_id, ps.user_id
on conflict (channel_id, user_id) do update
set joined_at = least(channel_members.joined_at, excluded.joined_at),
    last_seen_at = greatest(channel_members.last_seen_at, excluded.last_seen_at);

comment on table public.channel_members is 'Persistent channel roster. Joining a call enrolls the user in the channel; online state remains ephemeral.';

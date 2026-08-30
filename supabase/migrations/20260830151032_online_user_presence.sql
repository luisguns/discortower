create table public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  activity_id uuid references public.activity_catalog(id) on delete set null,
  last_seen_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default timezone('utc', now()) + interval '45 seconds'
);

create index user_presence_expiry_idx on public.user_presence (expires_at);

alter table public.user_presence enable row level security;
revoke all on public.user_presence from public, anon, authenticated;
grant all on public.user_presence to service_role;

insert into public.user_presence (user_id, activity_id, last_seen_at, expires_at)
select distinct on (pa.user_id) pa.user_id, pa.activity_id, pa.observed_at, pa.expires_at
from public.participant_activities pa
where pa.expires_at > timezone('utc', now())
order by pa.user_id, pa.observed_at desc
on conflict (user_id) do update
set activity_id = excluded.activity_id,
    last_seen_at = excluded.last_seen_at,
    expires_at = excluded.expires_at;

comment on table public.user_presence is 'Short-lived app-online heartbeat and optional recognized activity, independent from call membership.';

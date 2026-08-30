alter table public.participant_sessions
  add column if not exists screen_sharing boolean not null default false;

create table public.activity_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,47}$'),
  display_name text not null check (char_length(trim(display_name)) between 2 and 48),
  kind text not null check (kind in ('game', 'ide')),
  process_names text[] not null check (cardinality(process_names) between 1 and 24),
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.participant_activities (
  room_session_id uuid not null references public.room_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid not null references public.activity_catalog(id) on delete restrict,
  observed_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default timezone('utc', now()) + interval '90 seconds',
  primary key (room_session_id, user_id)
);

create index participant_activities_expiry_idx on public.participant_activities (expires_at);

alter table public.activity_catalog enable row level security;
alter table public.participant_activities enable row level security;

revoke all on public.activity_catalog from public, anon, authenticated;
revoke all on public.participant_activities from public, anon, authenticated;
grant all on public.activity_catalog to service_role;
grant all on public.participant_activities to service_role;

insert into public.activity_catalog (slug, display_name, kind, process_names) values
  ('counter-strike-2', 'Counter-Strike 2', 'game', array['cs2.exe']),
  ('valorant', 'VALORANT', 'game', array['valorant-win64-shipping.exe']),
  ('league-of-legends', 'League of Legends', 'game', array['league of legends.exe']),
  ('fortnite', 'Fortnite', 'game', array['fortniteclient-win64-shipping.exe']),
  ('minecraft', 'Minecraft', 'game', array['minecraft.exe', 'javaw.exe']),
  ('rocket-league', 'Rocket League', 'game', array['rocketleague.exe']),
  ('gta-v', 'Grand Theft Auto V', 'game', array['gta5.exe', 'playgtav.exe']),
  ('elden-ring', 'Elden Ring', 'game', array['eldenring.exe']),
  ('steam', 'Steam', 'game', array['steam.exe']),
  ('visual-studio-code', 'Visual Studio Code', 'ide', array['code.exe']),
  ('visual-studio', 'Visual Studio', 'ide', array['devenv.exe']),
  ('jetbrains-idea', 'IntelliJ IDEA', 'ide', array['idea64.exe']),
  ('jetbrains-webstorm', 'WebStorm', 'ide', array['webstorm64.exe']),
  ('android-studio', 'Android Studio', 'ide', array['studio64.exe']),
  ('cursor', 'Cursor', 'ide', array['cursor.exe'])
on conflict (slug) do update set
  display_name = excluded.display_name,
  kind = excluded.kind,
  process_names = excluded.process_names,
  enabled = true,
  updated_at = timezone('utc', now());

comment on table public.activity_catalog is 'Allowlist of applications that the desktop client may report as call activity.';
comment on column public.activity_catalog.process_names is 'Lowercase executable basenames only; never window titles or paths.';
comment on table public.participant_activities is 'Short-lived recognized activity heartbeat for users currently in a call.';

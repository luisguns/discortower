-- Auth users may predate the profile-creation trigger installed by the
-- control-plane migration. Backfill only missing profiles without changing
-- accounts that already exist.
insert into public.profiles (user_id)
select id
from auth.users
on conflict (user_id) do nothing;

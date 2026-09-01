-- Run with the Supabase SQL test harness after applying the migration.
-- The service role is intentionally the only role that can write control-plane
-- records directly. Client sessions must use the policies/RPCs below.
begin;

set local role anon;
select has_table_privilege('anon', 'public.profiles', 'select') = false as anon_cannot_read_profiles;
select has_table_privilege('anon', 'public.invitations', 'select') = false as anon_cannot_read_invitations;
select has_table_privilege('anon', 'public.channels', 'select') = false as anon_cannot_read_channels;
select has_table_privilege('anon', 'public.friendships', 'select') = false as anon_cannot_read_friendships;
select has_table_privilege('anon', 'public.direct_messages', 'select') = false as anon_cannot_read_direct_messages;

reset role;
select has_function_privilege('authenticated', 'public.update_my_profile(text,text)', 'execute') as profile_rpc_is_available;
select has_function_privilege('authenticated', 'public.get_my_access_context()', 'execute') as access_rpc_is_available;
select has_function_privilege('authenticated', 'public.consume_rate_limit(text,integer,integer)', 'execute') = false as rate_limit_is_server_only;
select has_function_privilege('authenticated', 'public.reserve_channel_session(uuid,uuid,text,integer)', 'execute') = false as channel_reservation_is_server_only;
select has_table_privilege('authenticated', 'public.channels', 'insert') = false as clients_cannot_insert_channels;
select has_table_privilege('authenticated', 'public.friendships', 'insert') = false as clients_cannot_mutate_friendships_directly;
select has_function_privilege('authenticated', 'public.claim_my_username(text)', 'execute') as username_claim_rpc_is_available;
select has_function_privilege('authenticated', 'public.social_transition(uuid,uuid,text)', 'execute') = false as social_transition_is_server_only;

rollback;

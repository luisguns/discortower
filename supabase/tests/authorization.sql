-- Run with the Supabase SQL test harness after applying the migration.
-- The service role is intentionally the only role that can write control-plane
-- records directly. Client sessions must use the policies/RPCs below.
begin;

set local role anon;
select has_table_privilege('anon', 'public.profiles', 'select') = false as anon_cannot_read_profiles;
select has_table_privilege('anon', 'public.invitations', 'select') = false as anon_cannot_read_invitations;

reset role;
select has_function_privilege('authenticated', 'public.update_my_profile(text,text)', 'execute') as profile_rpc_is_available;
select has_function_privilege('authenticated', 'public.get_my_access_context()', 'execute') as access_rpc_is_available;
select has_function_privilege('authenticated', 'public.consume_rate_limit(text,integer,integer)', 'execute') = false as rate_limit_is_server_only;

rollback;


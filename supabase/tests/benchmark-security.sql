-- Local/staging only. Assertions raise on failure; all fixtures roll back.
begin;
create function pg_temp.check_result(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;
select pg_temp.check_result(not has_function_privilege('anon', 'public.consume_rate_limit(text,integer,integer)', 'execute'), 'anon rate ACL');
select pg_temp.check_result(not has_function_privilege('authenticated', 'public.consume_rate_limit(text,integer,integer)', 'execute'), 'authenticated rate ACL');
select pg_temp.check_result(has_function_privilege('service_role', 'public.consume_rate_limit(text,integer,integer)', 'execute'), 'service rate ACL');
select pg_temp.check_result(not has_function_privilege('anon', f, 'execute'), 'anon helper ACL') from unnest(array['public.get_effective_role(uuid)', 'public.is_channel_member(uuid,uuid)', 'public.get_channel_member_role(uuid,uuid)']) f;
select pg_temp.check_result(not has_function_privilege('authenticated', f, 'execute'), 'presence/join backend ACL')
from unnest(array[
  'public.set_user_presence(uuid,uuid,integer)',
  'public.get_token_issue_context(uuid)',
  'public.reserve_channel_call_access(uuid,uuid,text)'
]) f;
select pg_temp.check_result(has_function_privilege('service_role', f, 'execute'), 'presence/join service ACL')
from unnest(array[
  'public.set_user_presence(uuid,uuid,integer)',
  'public.get_token_issue_context(uuid)',
  'public.reserve_channel_call_access(uuid,uuid,text)'
]) f;
select pg_temp.check_result(exists (
  select 1 from pg_indexes where schemaname='public' and indexname='participant_sessions_open_room_idx'
), 'open participant hot-path index');

insert into auth.users(id, email) select ('00000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid, 'benchmark-' || i || '@example.invalid' from generate_series(1,6) i;
insert into public.admin_users(user_id) values ('00000000-0000-4000-8000-000000000001') on conflict ((true)) do update set user_id=excluded.user_id;
update public.profiles set role='manager' where user_id='00000000-0000-4000-8000-000000000002';
update public.profiles set status='disabled' where user_id='00000000-0000-4000-8000-000000000006';
insert into public.channels(id,name,created_by) values ('00000000-0000-4000-8000-000000000100','Benchmark ACL','00000000-0000-4000-8000-000000000001');
insert into public.channel_members(channel_id,user_id,role) values
('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000003','owner'),
('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000004','member');

set local role authenticated;
do $$
declare i integer; uid uuid; membership boolean; role_name text;
begin
  for i in 1..6 loop
    uid := ('00000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid;
    perform set_config('request.jwt.claim.sub',uid::text,true);
    membership := public.is_channel_member('00000000-0000-4000-8000-000000000100');
    role_name := public.get_channel_member_role('00000000-0000-4000-8000-000000000100');
    perform pg_temp.check_result(membership = (i <= 4), 'self membership ' || i);
    perform pg_temp.check_result(role_name = case when i <= 3 then 'owner' when i=4 then 'member' else '' end, 'self channel role ' || i);
    if i <> 1 then
      perform pg_temp.check_result(public.get_effective_role('00000000-0000-4000-8000-000000000001')='member','third-party global role');
      perform pg_temp.check_result(not public.is_channel_member('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000001'),'third-party membership');
      perform pg_temp.check_result(public.get_channel_member_role('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000001')='','third-party channel role');
    end if;
  end loop;
end $$;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.check_result(public.get_effective_role('00000000-0000-4000-8000-000000000001')='member','missing identity');
reset role;
set local role service_role;
select pg_temp.check_result(public.set_user_presence('00000000-0000-4000-8000-000000000001',null,150),'presence RPC');
select pg_temp.check_result((public.get_token_issue_context('00000000-0000-4000-8000-000000000001')->>'role')='owner','joined token context');
select pg_temp.check_result(public.get_effective_role('00000000-0000-4000-8000-000000000001')='owner','backend explicit owner');
select pg_temp.check_result(public.is_channel_member('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000003'),'backend explicit host');
select pg_temp.check_result(public.consume_rate_limit('benchmark-transactional-test',2,60),'first request');
select pg_temp.check_result(public.consume_rate_limit('benchmark-transactional-test',2,60),'second request');
select pg_temp.check_result(not public.consume_rate_limit('benchmark-transactional-test',2,60),'limit reached');
select pg_temp.check_result(not public.consume_rate_limit(null,2,60),'null bucket');
select pg_temp.check_result(not public.consume_rate_limit('benchmark-invalid',null,60),'null limit');
select pg_temp.check_result(not public.consume_rate_limit('benchmark-invalid',1,0),'invalid window');
rollback;

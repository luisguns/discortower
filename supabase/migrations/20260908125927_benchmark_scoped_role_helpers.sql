-- Client helpers may only inspect the caller. Backend RPCs retain explicit-user
-- lookups via the trusted database role (never user-editable JWT metadata).
create or replace function public.get_effective_role(p_user_id uuid default auth.uid())
returns text language sql stable security definer set search_path = '' as $$
  select case
    when p_user_id is null then 'member'
    when current_setting('role', true) <> 'service_role'
      and (auth.uid() is null or p_user_id is distinct from auth.uid()) then 'member'
    when exists (select 1 from public.admin_users where user_id = p_user_id) then 'owner'
    else coalesce((select role::text from public.profiles where user_id = p_user_id), 'member')
  end;
$$;
create or replace function public.is_channel_member(p_channel_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select case when p_user_id is null or (current_setting('role', true) <> 'service_role'
    and (auth.uid() is null or p_user_id is distinct from auth.uid())) then false
  else public.get_effective_role(p_user_id) in ('owner', 'manager') or exists (
    select 1 from public.channel_members where channel_id = p_channel_id and user_id = p_user_id
  ) end;
$$;
create or replace function public.get_channel_member_role(p_channel_id uuid, p_user_id uuid default auth.uid())
returns text language sql stable security definer set search_path = '' as $$
  select case when p_user_id is null or (current_setting('role', true) <> 'service_role'
    and (auth.uid() is null or p_user_id is distinct from auth.uid())) then ''
  when public.get_effective_role(p_user_id) in ('owner', 'manager') then 'owner'
  else coalesce((select role::text from public.channel_members
    where channel_id = p_channel_id and user_id = p_user_id), '') end;
$$;
revoke all on function public.get_effective_role(uuid), public.is_channel_member(uuid, uuid), public.get_channel_member_role(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_effective_role(uuid), public.is_channel_member(uuid, uuid), public.get_channel_member_role(uuid, uuid) to authenticated, service_role;

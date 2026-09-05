-- Global administrators can see every active channel, so their call-entry check
-- must use the explicitly authenticated user id supplied by the Edge Function.
-- The previous implementation delegated the admin branch to is_admin(), which
-- reads auth.uid(); service-role RPC calls have no auth.uid() and denied admins.
create or replace function public.is_channel_member(
  p_channel_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and (
    public.get_effective_role(p_user_id) in ('owner', 'manager')
    or exists (
      select 1
      from public.channel_members as membership
      where membership.channel_id = p_channel_id
        and membership.user_id = p_user_id
    )
  );
$$;

create or replace function public.get_channel_member_role(
  p_channel_id uuid,
  p_user_id uuid default auth.uid()
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_user_id is not null
      and public.get_effective_role(p_user_id) in ('owner', 'manager') then 'owner'
    else coalesce((
      select membership.role::text
      from public.channel_members as membership
      where membership.channel_id = p_channel_id
        and membership.user_id = p_user_id
    ), '')
  end;
$$;

revoke all on function public.is_channel_member(uuid, uuid) from public;
revoke all on function public.get_channel_member_role(uuid, uuid) from public;
grant execute on function public.is_channel_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_channel_member_role(uuid, uuid) to authenticated, service_role;

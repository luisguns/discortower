do $$ begin
  create type public.screen_share_quality as enum ('720p30', '1080p30', '1080p60');
exception when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists screen_share_quality_override public.screen_share_quality;

alter table public.call_guardrail_settings
  add column if not exists member_screen_share_quality public.screen_share_quality not null default '720p30',
  add column if not exists host_screen_share_quality public.screen_share_quality not null default '1080p30',
  add column if not exists manager_screen_share_quality public.screen_share_quality not null default '1080p60';

create or replace function public.get_my_access_context()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  current_profile public.profiles;
  effective_role text;
  configured_quality public.screen_share_quality;
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
  select case effective_role
    when 'owner' then '1080p60'::public.screen_share_quality
    when 'manager' then settings.manager_screen_share_quality
    when 'host' then settings.host_screen_share_quality
    else settings.member_screen_share_quality
  end into configured_quality
  from public.call_guardrail_settings settings where settings.id = true;
  configured_quality := coalesce(current_profile.screen_share_quality_override, configured_quality, '720p30'::public.screen_share_quality);
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
      'can_high_quality_screen_share', configured_quality <> '720p30'::public.screen_share_quality,
      'max_screen_share_quality', configured_quality
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

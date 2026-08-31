alter table public.profiles
  add column if not exists name_font text not null default 'mono'
    check (name_font in ('mono', 'condensed', 'rounded', 'serif')),
  add column if not exists name_color text not null default '#DDE5DE'
    check (name_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists name_effect text not null default 'none'
    check (name_effect in ('none', 'glow', 'shadow', 'outline')),
  add column if not exists name_weight smallint not null default 600
    check (name_weight in (500, 600, 700)),
  add column if not exists name_spacing text not null default 'normal'
    check (name_spacing in ('tight', 'normal', 'wide')),
  add column if not exists name_case text not null default 'normal'
    check (name_case in ('normal', 'uppercase')),
  add column if not exists name_badge text not null default 'none'
    check (name_badge in ('none', 'soft', 'outline', 'pill'));

create or replace function public.get_my_access_context()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  current_profile public.profiles;
  effective_role text;
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
      'can_high_quality_screen_share', effective_role in ('owner', 'manager', 'host')
    ),
    'profile', jsonb_build_object(
      'user_id', current_profile.user_id,
      'display_name', current_profile.display_name,
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
      'created_at', current_profile.created_at,
      'updated_at', current_profile.updated_at
    )
  );
end;
$$;

drop function if exists public.update_my_profile(text, text);

create function public.update_my_profile(
  p_display_name text,
  p_avatar_url text,
  p_name_font text,
  p_name_color text,
  p_name_effect text,
  p_name_weight smallint,
  p_name_spacing text,
  p_name_case text,
  p_name_badge text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception using errcode = '42501'; end if;
  if p_display_name is null or char_length(trim(p_display_name)) not between 1 and 48 then
    raise exception 'PROFILE_NAME_INVALID' using errcode = '22023';
  end if;
  if p_avatar_url is not null and (char_length(p_avatar_url) > 430000 or p_avatar_url !~ '^data:image/(gif|jpeg|png|webp);base64,') then
    raise exception 'PROFILE_AVATAR_INVALID' using errcode = '22023';
  end if;
  if p_name_font not in ('mono', 'condensed', 'rounded', 'serif')
    or p_name_color !~ '^#[0-9A-Fa-f]{6}$'
    or p_name_effect not in ('none', 'glow', 'shadow', 'outline')
    or p_name_weight not in (500, 600, 700)
    or p_name_spacing not in ('tight', 'normal', 'wide')
    or p_name_case not in ('normal', 'uppercase')
    or p_name_badge not in ('none', 'soft', 'outline', 'pill') then
    raise exception 'PROFILE_STYLE_INVALID' using errcode = '22023';
  end if;

  update public.profiles
  set display_name = regexp_replace(trim(p_display_name), '\s+', ' ', 'g'),
      avatar_url = p_avatar_url,
      name_font = p_name_font,
      name_color = upper(p_name_color),
      name_effect = p_name_effect,
      name_weight = p_name_weight,
      name_spacing = p_name_spacing,
      name_case = p_name_case,
      name_badge = p_name_badge
  where user_id = auth.uid();
  return public.get_my_access_context();
end;
$$;

revoke all on function public.get_my_access_context() from public, anon;
revoke all on function public.update_my_profile(text, text, text, text, text, smallint, text, text, text) from public, anon, service_role;
grant execute on function public.get_my_access_context() to authenticated, service_role;
grant execute on function public.update_my_profile(text, text, text, text, text, smallint, text, text, text) to authenticated;
grant update (name_font, name_color, name_effect, name_weight, name_spacing, name_case, name_badge) on public.profiles to authenticated;

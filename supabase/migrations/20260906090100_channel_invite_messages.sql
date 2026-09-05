-- Channel invitations delivered as actionable chat messages.
-- A friend can invite another friend to a channel; the invite shows up inside
-- their direct conversation as a "channel_invite" message with accept/decline.
-- Creation and responses are performed by the social Edge Function (service
-- role), so no additional client-side write grants are required.

alter table public.direct_messages
  add column if not exists invite_channel_id uuid references public.channels(id) on delete cascade,
  add column if not exists invite_status text;

-- Extend the payload guard so the new kind is well-formed while keeping the
-- text/image branches free of invite metadata.
alter table public.direct_messages
  drop constraint if exists direct_messages_payload;
alter table public.direct_messages
  add constraint direct_messages_payload check (
    (
      kind = 'text'
      and char_length(trim(coalesce(text_content, ''))) between 1 and 2000
      and storage_path is null and image_name is null and image_mime is null and image_size is null
      and invite_channel_id is null and invite_status is null
    )
    or (
      kind = 'image'
      and text_content is null
      and storage_path is not null and image_name is not null
      and image_mime in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
      and image_size between 1 and 4194304
      and invite_channel_id is null and invite_status is null
    )
    or (
      kind = 'channel_invite'
      and char_length(trim(coalesce(text_content, ''))) between 1 and 80
      and storage_path is null and image_name is null and image_mime is null and image_size is null
      and invite_channel_id is not null
      and invite_status in ('pending', 'accepted', 'declined', 'revoked')
    )
  );

create index if not exists direct_messages_invite_channel_idx
  on public.direct_messages (invite_channel_id)
  where kind = 'channel_invite';

-- Respond to a channel invite message: the recipient either joins the channel
-- (accept) or dismisses the offer (decline). Runs as the caller supplied by the
-- Edge Function so the acting user is always explicit.
create or replace function public.respond_channel_invite_message(
  p_actor_id uuid,
  p_message_id bigint,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.direct_messages;
  target_channel public.channels;
begin
  if p_actor_id is null or p_message_id is null then
    raise exception 'INVITE_INVALID' using errcode = '22023';
  end if;

  select * into invite
  from public.direct_messages
  where id = p_message_id and kind = 'channel_invite'
  for update;

  if not found or invite.recipient_id <> p_actor_id then
    raise exception 'INVITE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if invite.invite_status <> 'pending' then
    raise exception 'INVITE_ALREADY_HANDLED' using errcode = '22023';
  end if;

  if not p_accept then
    update public.direct_messages set invite_status = 'declined' where id = invite.id;
    return jsonb_build_object('status', 'declined', 'channel_id', invite.invite_channel_id);
  end if;

  select * into target_channel
  from public.channels
  where id = invite.invite_channel_id and status = 'active';
  if not found then
    update public.direct_messages set invite_status = 'revoked' where id = invite.id;
    raise exception 'CHANNEL_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.channel_members (channel_id, user_id, role, added_by)
  values (invite.invite_channel_id, p_actor_id, 'member', invite.sender_id)
  on conflict (channel_id, user_id) do nothing;

  update public.direct_messages set invite_status = 'accepted' where id = invite.id;

  return jsonb_build_object('status', 'accepted', 'channel_id', invite.invite_channel_id);
end;
$$;

revoke all on function public.respond_channel_invite_message(uuid, bigint, boolean) from public, anon, authenticated;
grant execute on function public.respond_channel_invite_message(uuid, bigint, boolean) to service_role;

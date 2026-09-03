-- Invite codes: shareable codes that authorize account creation without email delivery.
-- An admin generates a code, shares it through any channel, and the recipient
-- redeems it on the platform to create an account with the assigned role.

create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  label text not null default '',
  role public.account_role not null default 'member',
  status text not null default 'active',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  constraint invite_codes_status_values check (status in ('active', 'used', 'revoked', 'expired')),
  constraint invite_codes_role_assignable check (role in ('manager', 'host', 'member'))
);

create unique index if not exists invite_codes_code_unique_idx on public.invite_codes (code);
create index if not exists invite_codes_created_at_idx on public.invite_codes (created_at desc);
create index if not exists invite_codes_active_lookup_idx on public.invite_codes (code) where status = 'active';

alter table public.invite_codes enable row level security;

create policy invite_codes_manager_read on public.invite_codes
  for select to authenticated
  using (public.get_effective_role(auth.uid()) in ('owner', 'manager'));

create type public.content_report_reason as enum ('harassment', 'hate_or_discrimination', 'sexual_content', 'violence_or_threat', 'spam_or_scam', 'other');
create type public.content_report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  subject_user_id uuid not null references auth.users(id) on delete cascade,
  direct_message_id bigint references public.direct_messages(id) on delete set null,
  reason public.content_report_reason not null,
  details text not null default '' check (char_length(details) <= 1000),
  status public.content_report_status not null default 'open',
  created_at timestamptz not null default timezone('utc', now()),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 1000),
  constraint content_reports_distinct_users check (reporter_id <> subject_user_id)
);

create index content_reports_open_created_idx on public.content_reports (status, created_at desc);
create index content_reports_subject_idx on public.content_reports (subject_user_id, created_at desc);

alter table public.content_reports enable row level security;
revoke all on public.content_reports from public, anon, authenticated;
grant insert, select on public.content_reports to authenticated;

create policy content_reports_reporter_read on public.content_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or public.is_admin());

create policy content_reports_reporter_create on public.content_reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and reporter_id <> subject_user_id
  );

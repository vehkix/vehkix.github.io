-- Notification and account-deletion tables
-- Run as step 2 in the Supabase setup sequence documented in README.md.

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  requested_username text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists account_deletion_requests_pending_user
  on public.account_deletion_requests (user_id)
  where status = 'pending' and user_id is not null;

alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon, authenticated;

create table if not exists public.app_notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'vehicle_share_sent', 'vehicle_share_received',
    'vehicle_share_accepted', 'vehicle_share_rejected',
    'account_deletion_requested', 'account_deletion_rejected'
  )),
  actor_id uuid references auth.users (id) on delete set null,
  vehicle_id uuid,
  share_id uuid,
  deletion_request_id uuid references public.account_deletion_requests (id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists app_notifications_recipient_created_idx
  on public.app_notifications (recipient_id, created_at desc);

alter table public.app_notifications enable row level security;
revoke all on public.app_notifications from anon, authenticated;


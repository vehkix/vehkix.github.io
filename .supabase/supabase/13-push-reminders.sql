-- Browser push subscriptions and vehicle reminder preferences.
-- Run after the existing Supabase setup files.

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  reminder_types text[] not null default array['service', 'pucc', 'insurance', 'tax', 'registration'],
  days_before integer[] not null default array[30, 14, 7, 1],
  repeat_mode text not null default 'daily_until_due'
    check (repeat_mode in ('once', 'daily_until_due', 'daily_until_complete')),
  notification_time time not null default '09:00',
  timezone text not null default 'Asia/Kolkata',
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '07:00',
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

create table if not exists public.vehicle_reminder_deliveries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id text not null,
  reminder_type text not null,
  due_date date not null,
  days_before integer not null,
  delivery_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, vehicle_id, reminder_type, due_date, days_before, delivery_date)
);

alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.vehicle_reminder_deliveries enable row level security;

drop policy if exists notification_preferences_self on public.notification_preferences;
create policy notification_preferences_self on public.notification_preferences
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_self on public.push_subscriptions;
create policy push_subscriptions_self on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists vehicle_reminder_deliveries_self on public.vehicle_reminder_deliveries;
create policy vehicle_reminder_deliveries_self on public.vehicle_reminder_deliveries
  for select to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select on public.vehicle_reminder_deliveries to authenticated;
grant usage, select on sequence public.push_subscriptions_id_seq to authenticated;


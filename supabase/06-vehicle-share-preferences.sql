-- Vehicle share preferences
-- Run as step 6 in the Supabase setup sequence documented in README.md.

create table if not exists public.user_vehicle_share_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  share_field_keys text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.user_vehicle_share_preferences enable row level security;
drop policy if exists user_vehicle_share_preferences_read_own on public.user_vehicle_share_preferences;
create policy user_vehicle_share_preferences_read_own
  on public.user_vehicle_share_preferences for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists user_vehicle_share_preferences_insert_own on public.user_vehicle_share_preferences;
create policy user_vehicle_share_preferences_insert_own
  on public.user_vehicle_share_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists user_vehicle_share_preferences_update_own on public.user_vehicle_share_preferences;
create policy user_vehicle_share_preferences_update_own
  on public.user_vehicle_share_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update on public.user_vehicle_share_preferences to authenticated;


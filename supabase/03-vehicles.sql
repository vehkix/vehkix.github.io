-- Vehicle records and row-level security
-- Run as step 3 in the Supabase setup sequence documented in README.md.

create table if not exists public.user_vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_number text,
  name text,
  model text,
  company text,
  year integer,
  taken_date date,
  last_service_date date,
  last_service_km integer,
  next_service_date date,
  next_service_km integer,
  last_pucc_date date,
  next_pucc_date date,
  insurance_taken_date date,
  insurance_next_renewal_date date,
  notes text,
  uploaded_by text,
  uploaded_date date not null default current_date,
  images text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.app_notifications
  drop constraint if exists app_notifications_vehicle_id_fkey;
alter table public.app_notifications
  add constraint app_notifications_vehicle_id_fkey
  foreign key (vehicle_id) references public.user_vehicles (id) on delete set null;

alter table public.user_vehicles
  add column if not exists rc_owner_name text,
  add column if not exists chassis_no text,
  add column if not exists engine_no text,
  add column if not exists tax_valid_upto date,
  add column if not exists registration_validity date,
  add column if not exists primary_image text,
  add column if not exists notes text;

create index if not exists user_vehicles_user_created_idx
  on public.user_vehicles (user_id, created_at desc);

alter table public.user_vehicles enable row level security;

drop policy if exists user_vehicles_read_own on public.user_vehicles;
create policy user_vehicles_read_own
  on public.user_vehicles
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists user_vehicles_read_admin on public.user_vehicles;
create policy user_vehicles_read_admin
  on public.user_vehicles
  for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists user_vehicles_insert_own on public.user_vehicles;
create policy user_vehicles_insert_own
  on public.user_vehicles
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists user_vehicles_update_own on public.user_vehicles;
create policy user_vehicles_update_own
  on public.user_vehicles
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists user_vehicles_update_admin on public.user_vehicles;
create policy user_vehicles_update_admin
  on public.user_vehicles
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists user_vehicles_delete_own on public.user_vehicles;
create policy user_vehicles_delete_own
  on public.user_vehicles
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists user_vehicles_delete_admin on public.user_vehicles;
create policy user_vehicles_delete_admin
  on public.user_vehicles
  for delete
  to authenticated
  using ((select public.is_admin()));

grant select, insert, update, delete on public.user_vehicles to authenticated;


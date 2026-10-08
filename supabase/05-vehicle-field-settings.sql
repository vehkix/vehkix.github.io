-- Vehicle field visibility settings
-- Run as step 5 in the Supabase setup sequence documented in README.md.

create table if not exists public.vehicle_field_visibility (
  field_key text primary key,
  show_in_form boolean not null default true,
  show_in_details boolean not null default true,
  allow_share boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.vehicle_field_visibility
  drop constraint if exists vehicle_field_visibility_key;
alter table public.vehicle_field_visibility
  add constraint vehicle_field_visibility_key check (field_key in (
    'vehicle_title', 'vehicle_number', 'company', 'model', 'year', 'taken_date',
    'last_service_date', 'last_service_km', 'next_service_date', 'next_service_km',
    'next_pucc_date', 'insurance_next_renewal_date', 'tax_valid_upto',
    'registration_validity', 'last_pucc_date', 'insurance_taken_date',
    'rc_owner_name', 'chassis_no', 'engine_no', 'notes', 'images', 'owner_username',
    'print_timestamp', 'id', 'uploaded_by', 'uploaded_date'
  ));

insert into public.vehicle_field_visibility (field_key, show_in_form, show_in_details, allow_share)
values
  ('vehicle_title', false, true, true),
  ('vehicle_number', true, true, true),
  ('company', true, true, true),
  ('model', true, true, true),
  ('year', true, true, true),
  ('taken_date', false, false, false),
  ('last_service_date', true, true, true),
  ('last_service_km', true, true, true),
  ('next_service_date', true, true, true),
  ('next_service_km', true, true, true),
  ('next_pucc_date', true, true, true),
  ('insurance_next_renewal_date', true, true, true),
  ('tax_valid_upto', true, true, true),
  ('registration_validity', true, true, true),
  ('last_pucc_date', true, true, true),
  ('insurance_taken_date', true, true, true),
  ('rc_owner_name', true, true, true),
  ('chassis_no', true, true, true),
  ('engine_no', true, true, true),
  ('notes', true, true, true),
  ('images', true, true, true),
  ('owner_username', false, true, true),
  ('print_timestamp', false, false, true),
  ('id', false, false, false),
  ('uploaded_by', false, false, false),
  ('uploaded_date', false, false, false)
on conflict (field_key) do nothing;

alter table public.vehicle_field_visibility enable row level security;
drop policy if exists vehicle_field_visibility_read on public.vehicle_field_visibility;
create policy vehicle_field_visibility_read
  on public.vehicle_field_visibility for select to authenticated using (true);
drop policy if exists vehicle_field_visibility_update_admin on public.vehicle_field_visibility;
create policy vehicle_field_visibility_update_admin
  on public.vehicle_field_visibility for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
grant select, update on public.vehicle_field_visibility to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'vehicle_field_visibility'
    ) then
    alter publication supabase_realtime add table public.vehicle_field_visibility;
  end if;
end;
$$;


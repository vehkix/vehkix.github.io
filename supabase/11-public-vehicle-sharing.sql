-- Revocable, read-only vehicle links for guests
-- Run as step 9 after supabase/08-storage-policies.sql.

create table if not exists public.vehicle_public_shares (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.user_vehicles (id) on delete cascade,
  shared_by uuid not null references auth.users (id) on delete cascade,
  field_ids text[] not null,
  created_at timestamptz not null default now(),
  constraint vehicle_public_shares_nonempty_fields check (cardinality(field_ids) > 0)
);

create index if not exists vehicle_public_shares_vehicle_idx
  on public.vehicle_public_shares (vehicle_id);

alter table public.vehicle_public_shares enable row level security;
revoke all on public.vehicle_public_shares from public, anon, authenticated;

create or replace function public.vehicle_public_share_setting_key(target_field_id text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case target_field_id
    when 'vehicle-title' then 'vehicle_title'
    when 'vehicle-number' then 'vehicle_number'
    when 'make' then 'company'
    when 'model' then 'model'
    when 'year' then 'year'
    when 'taken-date' then 'taken_date'
    when 'owner' then 'owner_username'
    when 'record-id' then 'id'
    when 'next-service-date' then 'next_service_date'
    when 'next-service-mileage' then 'next_service_km'
    when 'last-service-date' then 'last_service_date'
    when 'last-service-mileage' then 'last_service_km'
    when 'next_pucc_date' then 'next_pucc_date'
    when 'insurance_next_renewal_date' then 'insurance_next_renewal_date'
    when 'tax_valid_upto' then 'tax_valid_upto'
    when 'registration_validity' then 'registration_validity'
    when 'last-pucc' then 'last_pucc_date'
    when 'policy-date' then 'insurance_taken_date'
    when 'rc-owner' then 'rc_owner_name'
    when 'chassis-number' then 'chassis_no'
    when 'engine-number' then 'engine_no'
    when 'notes' then 'notes'
    when 'uploaded-by' then 'uploaded_by'
    when 'uploaded-on' then 'uploaded_date'
    else case when target_field_id ~ '^photo-[1-9][0-9]*$' then 'images' end
  end;
$$;

revoke all on function public.vehicle_public_share_setting_key(text) from public, anon, authenticated;

create or replace function public.create_vehicle_public_share(
  target_vehicle_id uuid,
  selected_field_ids text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_share_id uuid;
begin
  if not public.user_can_vehicle(target_vehicle_id, 'share') then
    raise exception 'You do not have permission to share this vehicle';
  end if;

  if selected_field_ids is null or cardinality(selected_field_ids) = 0 then
    raise exception 'Select at least one detail to share';
  end if;

  if exists (
    select 1
    from unnest(selected_field_ids) as selected(field_id)
    left join public.vehicle_field_visibility as setting
      on setting.field_key = public.vehicle_public_share_setting_key(selected.field_id)
    where setting.allow_share is not true
  ) then
    raise exception 'One or more selected details cannot be shared';
  end if;

  insert into public.vehicle_public_shares (vehicle_id, shared_by, field_ids)
  values (target_vehicle_id, (select auth.uid()), selected_field_ids)
  returning id into new_share_id;

  return new_share_id;
end;
$$;

revoke all on function public.create_vehicle_public_share(uuid, text[]) from public, anon;
grant execute on function public.create_vehicle_public_share(uuid, text[]) to authenticated;

create or replace function public.list_vehicle_public_shares(target_vehicle_id uuid)
returns table (share_id uuid, field_ids text[], created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.user_can_vehicle(target_vehicle_id, 'share') then
    raise exception 'You do not have permission to manage sharing for this vehicle';
  end if;

  return query
  select share.id, share.field_ids, share.created_at
  from public.vehicle_public_shares as share
  where share.vehicle_id = target_vehicle_id
  order by share.created_at desc;
end;
$$;

revoke all on function public.list_vehicle_public_shares(uuid) from public, anon;
grant execute on function public.list_vehicle_public_shares(uuid) to authenticated;

create or replace function public.revoke_vehicle_public_share(target_share_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  share_vehicle_id uuid;
begin
  select share.vehicle_id
  into share_vehicle_id
  from public.vehicle_public_shares as share
  where share.id = target_share_id
    and (
      share.shared_by = (select auth.uid())
      or exists (
        select 1 from public.user_vehicles as vehicle
        where vehicle.id = share.vehicle_id
          and vehicle.user_id = (select auth.uid())
      )
    );

  if share_vehicle_id is null then
    raise exception 'This public share link was not found or cannot be revoked';
  end if;

  if not public.user_can_vehicle(share_vehicle_id, 'share') then
    raise exception 'You do not have permission to revoke this link';
  end if;

  delete from public.vehicle_public_shares where id = target_share_id;
end;
$$;

revoke all on function public.revoke_vehicle_public_share(uuid) from public, anon;
grant execute on function public.revoke_vehicle_public_share(uuid) to authenticated;

create or replace function public.vehicle_public_share_is_active(
  target_vehicle_id uuid,
  link_creator_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_vehicles as vehicle
    where vehicle.id = target_vehicle_id
      and vehicle.user_id = link_creator_id
  )
  or exists (
    select 1
    from public.user_vehicle_shares as vehicle_share
    where vehicle_share.vehicle_id = target_vehicle_id
      and vehicle_share.shared_with_user_id = link_creator_id
      and vehicle_share.status = 'accepted'
      and vehicle_share.can_share
      and (
        vehicle_share.parent_share_id is null
        or exists (
          select 1
          from public.user_vehicle_shares as parent_share
          where parent_share.id = vehicle_share.parent_share_id
            and parent_share.shared_with_user_id = vehicle_share.shared_by
            and parent_share.status = 'accepted'
            and parent_share.can_share
        )
      )
  );
$$;

revoke all on function public.vehicle_public_share_is_active(uuid, uuid) from public, anon, authenticated;

create or replace function public.get_vehicle_public_share(share_token uuid)
returns table (
  vehicle_name text,
  field_ids text[],
  field_values jsonb,
  image_paths text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
  case
    when 'vehicle-title' = any(share.field_ids) and title_setting.allow_share then
      coalesce(
        nullif(btrim(concat_ws(
          ' ',
          case when company_setting.allow_share then vehicle.company end,
          case when model_setting.allow_share then vehicle.model end
        )), ''),
        'Shared vehicle'
      )
    else 'Shared vehicle'
  end,
    array(
      select selected.field_id
      from unnest(share.field_ids) with ordinality as selected(field_id, position)
      join public.vehicle_field_visibility as setting
        on setting.field_key = public.vehicle_public_share_setting_key(selected.field_id)
       and setting.allow_share
      order by selected.position
    ),
    jsonb_strip_nulls(jsonb_build_object(
      'vehicle-title', case
        when 'vehicle-title' = any(share.field_ids) and title_setting.allow_share
          then coalesce(
            nullif(btrim(concat_ws(
              ' ',
              case when company_setting.allow_share then vehicle.company end,
              case when model_setting.allow_share then vehicle.model end
            )), ''),
            'Vehicle'
          )
      end,
      'vehicle-number', case when 'vehicle-number' = any(share.field_ids) and number_setting.allow_share then vehicle.vehicle_number end,
      'make', case when 'make' = any(share.field_ids) and company_setting.allow_share then vehicle.company end,
      'model', case when 'model' = any(share.field_ids) and model_setting.allow_share then vehicle.model end,
      'year', case when 'year' = any(share.field_ids) and year_setting.allow_share then vehicle.year end,
      'taken-date', case when 'taken-date' = any(share.field_ids) and taken_setting.allow_share then vehicle.taken_date end,
      'owner', case when 'owner' = any(share.field_ids) and owner_setting.allow_share then profile.username end,
      'record-id', case when 'record-id' = any(share.field_ids) and id_setting.allow_share then vehicle.id end,
      'next-service-date', case when 'next-service-date' = any(share.field_ids) and next_service_date_setting.allow_share then vehicle.next_service_date end,
      'next-service-mileage', case when 'next-service-mileage' = any(share.field_ids) and next_service_km_setting.allow_share then vehicle.next_service_km end,
      'last-service-date', case when 'last-service-date' = any(share.field_ids) and last_service_date_setting.allow_share then vehicle.last_service_date end,
      'last-service-mileage', case when 'last-service-mileage' = any(share.field_ids) and last_service_km_setting.allow_share then vehicle.last_service_km end,
      'next_pucc_date', case when 'next_pucc_date' = any(share.field_ids) and next_pucc_setting.allow_share then vehicle.next_pucc_date end,
      'insurance_next_renewal_date', case when 'insurance_next_renewal_date' = any(share.field_ids) and insurance_renewal_setting.allow_share then vehicle.insurance_next_renewal_date end,
      'tax_valid_upto', case when 'tax_valid_upto' = any(share.field_ids) and tax_setting.allow_share then vehicle.tax_valid_upto end,
      'registration_validity', case when 'registration_validity' = any(share.field_ids) and registration_setting.allow_share then vehicle.registration_validity end,
      'last-pucc', case when 'last-pucc' = any(share.field_ids) and last_pucc_setting.allow_share then vehicle.last_pucc_date end,
      'policy-date', case when 'policy-date' = any(share.field_ids) and insurance_date_setting.allow_share then vehicle.insurance_taken_date end,
      'rc-owner', case when 'rc-owner' = any(share.field_ids) and rc_owner_setting.allow_share then vehicle.rc_owner_name end,
      'chassis-number', case when 'chassis-number' = any(share.field_ids) and chassis_setting.allow_share then vehicle.chassis_no end,
      'engine-number', case when 'engine-number' = any(share.field_ids) and engine_setting.allow_share then vehicle.engine_no end,
      'notes', case when 'notes' = any(share.field_ids) and notes_setting.allow_share then vehicle.notes end,
      'uploaded-by', case when 'uploaded-by' = any(share.field_ids) and uploaded_by_setting.allow_share then vehicle.uploaded_by end,
      'uploaded-on', case when 'uploaded-on' = any(share.field_ids) and uploaded_date_setting.allow_share then vehicle.uploaded_date end
    )),
    coalesce((
      select array_agg(photo.path order by photo.position)
      from unnest(vehicle.images) with ordinality as photo(path, position)
      where ('photo-' || photo.position::text) = any(share.field_ids)
        and images_setting.allow_share
    ), '{}'::text[])
  from public.vehicle_public_shares as share
  join public.user_vehicles as vehicle on vehicle.id = share.vehicle_id
  left join public.profiles as profile on profile.id = vehicle.user_id
  cross join public.vehicle_field_visibility as title_setting
  cross join public.vehicle_field_visibility as number_setting
  cross join public.vehicle_field_visibility as company_setting
  cross join public.vehicle_field_visibility as model_setting
  cross join public.vehicle_field_visibility as year_setting
  cross join public.vehicle_field_visibility as taken_setting
  cross join public.vehicle_field_visibility as owner_setting
  cross join public.vehicle_field_visibility as id_setting
  cross join public.vehicle_field_visibility as next_service_date_setting
  cross join public.vehicle_field_visibility as next_service_km_setting
  cross join public.vehicle_field_visibility as last_service_date_setting
  cross join public.vehicle_field_visibility as last_service_km_setting
  cross join public.vehicle_field_visibility as next_pucc_setting
  cross join public.vehicle_field_visibility as insurance_renewal_setting
  cross join public.vehicle_field_visibility as tax_setting
  cross join public.vehicle_field_visibility as registration_setting
  cross join public.vehicle_field_visibility as last_pucc_setting
  cross join public.vehicle_field_visibility as insurance_date_setting
  cross join public.vehicle_field_visibility as rc_owner_setting
  cross join public.vehicle_field_visibility as chassis_setting
  cross join public.vehicle_field_visibility as engine_setting
  cross join public.vehicle_field_visibility as notes_setting
  cross join public.vehicle_field_visibility as uploaded_by_setting
  cross join public.vehicle_field_visibility as uploaded_date_setting
  cross join public.vehicle_field_visibility as images_setting
  where share.id = share_token
    and public.vehicle_public_share_is_active(share.vehicle_id, share.shared_by)
    and title_setting.field_key = 'vehicle_title'
    and number_setting.field_key = 'vehicle_number'
    and company_setting.field_key = 'company'
    and model_setting.field_key = 'model'
    and year_setting.field_key = 'year'
    and taken_setting.field_key = 'taken_date'
    and owner_setting.field_key = 'owner_username'
    and id_setting.field_key = 'id'
    and next_service_date_setting.field_key = 'next_service_date'
    and next_service_km_setting.field_key = 'next_service_km'
    and last_service_date_setting.field_key = 'last_service_date'
    and last_service_km_setting.field_key = 'last_service_km'
    and next_pucc_setting.field_key = 'next_pucc_date'
    and insurance_renewal_setting.field_key = 'insurance_next_renewal_date'
    and tax_setting.field_key = 'tax_valid_upto'
    and registration_setting.field_key = 'registration_validity'
    and last_pucc_setting.field_key = 'last_pucc_date'
    and insurance_date_setting.field_key = 'insurance_taken_date'
    and rc_owner_setting.field_key = 'rc_owner_name'
    and chassis_setting.field_key = 'chassis_no'
    and engine_setting.field_key = 'engine_no'
    and notes_setting.field_key = 'notes'
    and uploaded_by_setting.field_key = 'uploaded_by'
    and uploaded_date_setting.field_key = 'uploaded_date'
    and images_setting.field_key = 'images';
$$;

revoke all on function public.get_vehicle_public_share(uuid) from public, authenticated;
grant execute on function public.get_vehicle_public_share(uuid) to anon, authenticated;

create or replace function public.public_vehicle_image_is_shared(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.vehicle_public_shares as share
    join public.user_vehicles as vehicle on vehicle.id = share.vehicle_id
    join public.vehicle_field_visibility as setting on setting.field_key = 'images'
    where object_name = any(vehicle.images)
      and public.vehicle_public_share_is_active(share.vehicle_id, share.shared_by)
      and setting.allow_share
      and exists (
        select 1
        from unnest(vehicle.images) with ordinality as photo(path, position)
        where photo.path = object_name
          and ('photo-' || photo.position::text) = any(share.field_ids)
      )
  );
$$;

revoke all on function public.public_vehicle_image_is_shared(text) from public, authenticated;
grant execute on function public.public_vehicle_image_is_shared(text) to anon, authenticated;

drop policy if exists vehicle_images_read_public_share on storage.objects;
create policy vehicle_images_read_public_share
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'user-vehicle-images'
    and (select public.public_vehicle_image_is_shared(objects.name))
  );

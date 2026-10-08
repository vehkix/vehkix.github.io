-- Private image buckets and storage policies
-- Run as step 8 in the Supabase setup sequence documented in README.md.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-vehicle-images',
  'user-vehicle-images',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-profile-images',
  'user-profile-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

grant select, insert, delete on storage.objects to authenticated;

drop policy if exists user_profile_images_read_own on storage.objects;
create policy user_profile_images_read_own
  on storage.objects for select to authenticated
  using (
    bucket_id = 'user-profile-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists user_profile_images_upload_own on storage.objects;
create policy user_profile_images_upload_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'user-profile-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists user_profile_images_update_own on storage.objects;
create policy user_profile_images_update_own
  on storage.objects for update to authenticated
  using (
    bucket_id = 'user-profile-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'user-profile-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists user_profile_images_delete_own on storage.objects;
create policy user_profile_images_delete_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'user-profile-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists user_vehicle_images_read_own on storage.objects;
create policy user_vehicle_images_read_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'user-vehicle-images'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_admin())
      or exists (
        select 1 from public.user_vehicles as vehicle
        where (
          vehicle.id::text = (storage.foldername(name))[2]
          or vehicle.images @> array[storage.objects.name]::text[]
        )
          and (select public.user_can_vehicle(vehicle.id, 'view'))
      )
    )
  );

drop policy if exists user_vehicle_images_upload_own on storage.objects;
create policy user_vehicle_images_upload_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'user-vehicle-images'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_admin())
      or exists (
        select 1 from public.user_vehicles as vehicle
        where vehicle.id::text = (storage.foldername(name))[2]
          and (select public.user_can_vehicle(vehicle.id, 'edit'))
      )
    )
  );

drop policy if exists user_vehicle_images_delete_own on storage.objects;
create policy user_vehicle_images_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'user-vehicle-images'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_admin())
      or exists (
        select 1 from public.user_vehicles as vehicle
        where vehicle.id::text = (storage.foldername(name))[2]
          and (
            (select public.user_can_vehicle(vehicle.id, 'edit'))
            or (select public.user_can_vehicle(vehicle.id, 'delete'))
          )
      )
    )
  );

-- After creating an account, promote it manually in the SQL Editor:
-- insert into public.admin_users (user_id)
-- select id from auth.users where lower(email) = lower('admin@example.com')
-- on conflict (user_id) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  email text,
  avatar_path text,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,32}$')
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists avatar_path text;

update public.profiles as profile
set email = auth_user.email
from auth.users as auth_user
where profile.id = auth_user.id
  and profile.email is distinct from auth_user.email;

create unique index if not exists profiles_username_unique_ci
  on public.profiles (lower(username));

with candidate_profiles as (
  select distinct on (lower(btrim(auth_user.raw_user_meta_data ->> 'username')))
    auth_user.id,
    btrim(auth_user.raw_user_meta_data ->> 'username') as username,
    auth_user.email
  from auth.users as auth_user
  where btrim(auth_user.raw_user_meta_data ->> 'username') ~ '^[A-Za-z0-9_]{3,32}$'
  order by
    lower(btrim(auth_user.raw_user_meta_data ->> 'username')),
    auth_user.created_at,
    auth_user.id
)
insert into public.profiles (id, username, email)
select candidate.id, candidate.username, candidate.email
from candidate_profiles as candidate
where not exists (
  select 1
  from public.profiles as existing
  where existing.id = candidate.id
    or lower(existing.username) = lower(candidate.username)
)
on conflict (id) do update
  set email = excluded.email;

alter table public.profiles enable row level security;

drop policy if exists profiles_read_self on public.profiles;
create policy profiles_read_self
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

grant select on public.profiles to authenticated;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.is_my_username_available(candidate_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select candidate_username ~ '^[A-Za-z0-9_]{3,32}$'
    and not exists (
      select 1
      from public.profiles as profile
      where lower(profile.username) = lower(btrim(candidate_username))
        and profile.id <> (select auth.uid())
    );
$$;

revoke all on function public.is_my_username_available(text) from public, anon;
grant execute on function public.is_my_username_available(text) to authenticated;

create or replace function public.update_my_username(new_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned_username text := btrim(new_username);
begin
  if cleaned_username !~ '^[A-Za-z0-9_]{3,32}$' then
    raise exception 'Username must contain 3 to 32 letters, numbers, or underscores';
  end if;

  update public.profiles
  set username = cleaned_username
  where id = (select auth.uid());

  if not found then
    raise exception 'Profile not found';
  end if;

  update auth.users
  set raw_user_meta_data = jsonb_set(
    coalesce(raw_user_meta_data, '{}'::jsonb),
    '{username}',
    to_jsonb(cleaned_username),
    true
  )
  where id = (select auth.uid());
end;
$$;

revoke all on function public.update_my_username(text) from public, anon;
grant execute on function public.update_my_username(text) to authenticated;

create or replace function public.update_my_avatar_path(new_avatar_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new_avatar_path is not null and new_avatar_path not like (select auth.uid())::text || '/%' then
    raise exception 'Avatar path must belong to your account';
  end if;

  update public.profiles
  set avatar_path = new_avatar_path
  where id = (select auth.uid());

  if not found then
    raise exception 'Profile not found';
  end if;
end;
$$;

revoke all on function public.update_my_avatar_path(text) from public, anon;
grant execute on function public.update_my_avatar_path(text) to authenticated;

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

create or replace function public.request_account_deletion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  requester_username text;
  request_id uuid;
begin
  if requester_id is null then
    raise exception 'Sign in to request account deletion';
  end if;

  select profile.username into requester_username
  from public.profiles as profile
  where profile.id = requester_id;
  if requester_username is null then
    raise exception 'Profile not found';
  end if;

  insert into public.account_deletion_requests (user_id, requested_username)
  values (requester_id, requester_username)
  on conflict (user_id) where status = 'pending' and user_id is not null
  do update set updated_at = now()
  returning id into request_id;

  insert into public.app_notifications (kind, actor_id, deletion_request_id)
  values ('account_deletion_requested', requester_id, request_id);
end;
$$;

revoke all on function public.request_account_deletion() from public, anon;
grant execute on function public.request_account_deletion() to authenticated;

create or replace function public.get_my_deletion_request()
returns table (status text, requested_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select request.status, request.requested_at
  from public.account_deletion_requests as request
  where request.user_id = (select auth.uid())
  order by request.requested_at desc
  limit 1;
$$;

revoke all on function public.get_my_deletion_request() from public, anon;
grant execute on function public.get_my_deletion_request() to authenticated;

create or replace function public.list_account_deletion_requests()
returns table (id uuid, user_id uuid, username text, requested_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'Administrator access is required';
  end if;

  return query
  select request.id, request.user_id, request.requested_username, request.requested_at
  from public.account_deletion_requests as request
  where request.status = 'pending'
  order by request.requested_at;
end;
$$;

revoke all on function public.list_account_deletion_requests() from public, anon;
grant execute on function public.list_account_deletion_requests() to authenticated;

create or replace function public.admin_delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'Administrator access is required';
  end if;
  if target_user_id = (select auth.uid()) then
    raise exception 'You cannot delete your own administrator account here';
  end if;
  if exists (select 1 from public.admin_users where user_id = target_user_id)
    and not exists (
      select 1 from public.admin_users
      where user_id <> target_user_id
    ) then
    raise exception 'The last administrator account cannot be deleted';
  end if;

  update public.account_deletion_requests
  set status = 'approved', updated_at = now()
  where user_id = target_user_id and status = 'pending';

  delete from storage.objects
  where (bucket_id = 'user-vehicle-images' or bucket_id = 'user-profile-images')
    and name like target_user_id::text || '/%';

  delete from public.profiles where id = target_user_id;

  delete from auth.users where id = target_user_id;
  if not found then
    raise exception 'User account not found';
  end if;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

create or replace function public.resolve_account_deletion_request(
  target_request_id uuid,
  approve_request boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.account_deletion_requests%rowtype;
begin
  if not (select public.is_admin()) then
    raise exception 'Administrator access is required';
  end if;

  select * into request_row
  from public.account_deletion_requests
  where id = target_request_id and status = 'pending'
  for update;
  if not found then
    raise exception 'Pending deletion request not found';
  end if;

  if approve_request then
    perform public.admin_delete_user(request_row.user_id);
  else
    update public.account_deletion_requests
    set status = 'rejected', updated_at = now()
    where id = target_request_id;
    insert into public.app_notifications (recipient_id, kind)
    values (request_row.user_id, 'account_deletion_rejected');
  end if;
end;
$$;

revoke all on function public.resolve_account_deletion_request(uuid, boolean) from public, anon;
grant execute on function public.resolve_account_deletion_request(uuid, boolean) to authenticated;

create or replace function public.mark_my_notification_read(target_notification_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.app_notifications
  set read_at = now()
  where id = target_notification_id
    and (
      recipient_id = (select auth.uid())
      or (recipient_id is null and (select public.is_admin()))
    );
$$;

revoke all on function public.mark_my_notification_read(bigint) from public, anon;
grant execute on function public.mark_my_notification_read(bigint) to authenticated;

create or replace function public.clear_my_notifications()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.app_notifications
  where recipient_id = (select auth.uid())
     or (
       recipient_id is null
       and kind = 'account_deletion_requested'
       and (select public.is_admin())
     );
$$;

revoke all on function public.clear_my_notifications() from public, anon;
grant execute on function public.clear_my_notifications() to authenticated;

drop policy if exists profiles_read_admin on public.profiles;
create policy profiles_read_admin
  on public.profiles
  for select
  to authenticated
  using ((select public.is_admin()));

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
begin
  requested_username := btrim(new.raw_user_meta_data ->> 'username');

  if requested_username is null or requested_username !~ '^[A-Za-z0-9_]{3,32}$' then
    raise exception 'Username must contain 3 to 32 letters, numbers, or underscores';
  end if;

  insert into public.profiles (id, username, email)
  values (new.id, requested_username, new.email)
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

create or replace function public.sync_my_profile()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  auth_email text;
  auth_username text;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select email, btrim(raw_user_meta_data ->> 'username')
  into auth_email, auth_username
  from auth.users
  where id = current_user_id;

  if not found then
    raise exception 'Authenticated user was not found';
  end if;

  update public.profiles
  set email = auth_email
  where id = current_user_id;

  if not found then
    if auth_username is null or auth_username !~ '^[A-Za-z0-9_]{3,32}$' then
      raise exception 'Profile username is invalid';
    end if;

    insert into public.profiles (id, username, email)
    values (current_user_id, auth_username, auth_email)
    on conflict (id) do update
      set email = excluded.email;
  end if;
end;
$$;

revoke all on function public.sync_my_profile() from public, anon;
grant execute on function public.sync_my_profile() to authenticated;

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

create or replace function public.list_my_notifications()
returns table (
  id bigint,
  kind text,
  actor_username text,
  vehicle_id uuid,
  share_id uuid,
  vehicle_label text,
  deletion_request_id uuid,
  created_at timestamptz,
  read_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select notification.id, notification.kind, profile.username,
    notification.vehicle_id, notification.share_id,
    coalesce(nullif(btrim(concat_ws(' ', vehicle.company, vehicle.model)), ''), vehicle.vehicle_number, 'vehicle'),
    notification.deletion_request_id, notification.created_at, notification.read_at
  from public.app_notifications as notification
  left join public.profiles as profile on profile.id = notification.actor_id
  left join public.user_vehicles as vehicle on vehicle.id = notification.vehicle_id
  where notification.recipient_id = (select auth.uid())
     or (
       notification.recipient_id is null
       and notification.kind = 'account_deletion_requested'
       and (select public.is_admin())
     )
  order by notification.created_at desc
  limit 100;
$$;

revoke all on function public.list_my_notifications() from public, anon;
grant execute on function public.list_my_notifications() to authenticated;

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
  uploaded_by text,
  uploaded_date date not null default current_date,
  images text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.user_vehicles enable row level security;

drop policy if exists user_vehicles_read_own on public.user_vehicles;
create policy user_vehicles_read_own
  on public.user_vehicles
  for select
  to authenticated
  using (user_id = (select auth.uid()));

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

drop policy if exists user_vehicles_delete_own on public.user_vehicles;
create policy user_vehicles_delete_own
  on public.user_vehicles
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.user_vehicles to authenticated;

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

create table if not exists public.user_vehicle_shares (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.user_vehicles (id) on delete cascade,
  shared_by uuid not null references auth.users (id) on delete cascade,
  shared_with_user_id uuid not null references auth.users (id) on delete cascade,
  parent_share_id uuid references public.user_vehicle_shares (id) on delete cascade,
  can_view boolean not null default true,
  can_share boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  constraint user_vehicle_shares_not_self check (shared_by <> shared_with_user_id),
  constraint user_vehicle_shares_view_required check (can_view),
  constraint user_vehicle_shares_unique_grant unique (vehicle_id, shared_by, shared_with_user_id)
);

alter table public.app_notifications
  drop constraint if exists app_notifications_share_id_fkey;
alter table public.app_notifications
  add constraint app_notifications_share_id_fkey
  foreign key (share_id) references public.user_vehicle_shares (id) on delete set null;

alter table public.user_vehicle_shares
  add column if not exists status text not null default 'accepted'
  check (status in ('pending', 'accepted', 'rejected'));

create index if not exists user_vehicle_shares_recipient_idx
  on public.user_vehicle_shares (shared_with_user_id, vehicle_id);

alter table public.user_vehicle_shares enable row level security;
drop policy if exists user_vehicle_shares_read_related on public.user_vehicle_shares;
create policy user_vehicle_shares_read_related
  on public.user_vehicle_shares for select to authenticated
  using (shared_by = (select auth.uid()) or shared_with_user_id = (select auth.uid()));
revoke all on public.user_vehicle_shares from anon, authenticated;
grant select on public.user_vehicle_shares to authenticated;

create or replace function public.user_can_vehicle(
  target_vehicle_id uuid,
  requested_permission text
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
      and vehicle.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.user_vehicle_shares as vehicle_share
    where vehicle_share.vehicle_id = target_vehicle_id
      and vehicle_share.shared_with_user_id = (select auth.uid())
      and vehicle_share.status = 'accepted'
      and case requested_permission
        when 'view' then vehicle_share.can_view
        when 'share' then vehicle_share.can_share
        when 'edit' then vehicle_share.can_edit
        when 'delete' then vehicle_share.can_delete
        else false
      end
      and (
        vehicle_share.parent_share_id is null
        or exists (
          select 1
          from public.user_vehicle_shares as parent_share
          where parent_share.id = vehicle_share.parent_share_id
            and parent_share.shared_with_user_id = vehicle_share.shared_by
            and parent_share.status = 'accepted'
            and parent_share.can_share
            and case requested_permission
              when 'edit' then parent_share.can_edit
              when 'delete' then parent_share.can_delete
              else true
            end
        )
      )
  );
$$;

revoke all on function public.user_can_vehicle(uuid, text) from public, anon;
grant execute on function public.user_can_vehicle(uuid, text) to authenticated;

create or replace function public.vehicle_owner_user_id(target_vehicle_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select vehicle.user_id
  from public.user_vehicles as vehicle
  where vehicle.id = target_vehicle_id;
$$;

revoke all on function public.vehicle_owner_user_id(uuid) from public, anon;
grant execute on function public.vehicle_owner_user_id(uuid) to authenticated;

create or replace function public.resolve_vehicle_share_recipient(recipient_identifier text)
returns table (user_id uuid, username text)
language sql
stable
security definer
set search_path = ''
as $$
  select profile.id, profile.username
  from public.profiles as profile
  where (lower(profile.username) = lower(btrim(recipient_identifier))
      or lower(profile.email) = lower(btrim(recipient_identifier)))
    and profile.id <> (select auth.uid())
  limit 1;
$$;

revoke all on function public.resolve_vehicle_share_recipient(text) from public, anon;
grant execute on function public.resolve_vehicle_share_recipient(text) to authenticated;

drop function if exists public.list_my_vehicle_shares(uuid);
create or replace function public.list_my_vehicle_shares(target_vehicle_id uuid)
returns table (
  share_id uuid,
  shared_user_id uuid,
  username text,
  can_share boolean,
  can_edit boolean,
  can_delete boolean,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.user_can_vehicle(target_vehicle_id, 'share') then
    raise exception 'You do not have permission to manage sharing for this vehicle';
  end if;

  return query
  select vehicle_share.id, vehicle_share.shared_with_user_id, profile.username,
    vehicle_share.can_share, vehicle_share.can_edit, vehicle_share.can_delete,
    vehicle_share.status
  from public.user_vehicle_shares as vehicle_share
  join public.profiles as profile on profile.id = vehicle_share.shared_with_user_id
  where vehicle_share.vehicle_id = target_vehicle_id
    and vehicle_share.shared_by = (select auth.uid())
  order by lower(profile.username);
end;
$$;

revoke all on function public.list_my_vehicle_shares(uuid) from public, anon;
grant execute on function public.list_my_vehicle_shares(uuid) to authenticated;

create or replace function public.grant_vehicle_share(
  target_vehicle_id uuid,
  recipient_user_id uuid,
  recipient_can_share boolean,
  recipient_can_edit boolean,
  recipient_can_delete boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_share public.user_vehicle_shares%rowtype;
  existing_share public.user_vehicle_shares%rowtype;
  new_parent_share_id uuid;
  current_share_id uuid;
  vehicle_owner_id uuid;
  had_existing_share boolean := false;
  existing_share_was_accepted boolean := false;
begin
  if recipient_user_id = (select auth.uid()) then
    raise exception 'You cannot share a vehicle with yourself';
  end if;

  select vehicle.user_id into vehicle_owner_id
  from public.user_vehicles as vehicle
  where vehicle.id = target_vehicle_id;
  if not found then
    raise exception 'Vehicle was not found';
  end if;

  if vehicle_owner_id = (select auth.uid()) then
    new_parent_share_id := null;
  else
    select vehicle_share.* into source_share
    from public.user_vehicle_shares as vehicle_share
    where vehicle_share.vehicle_id = target_vehicle_id
      and vehicle_share.shared_with_user_id = (select auth.uid())
      and vehicle_share.can_share
      and vehicle_share.status = 'accepted'
      and (not recipient_can_edit or vehicle_share.can_edit)
      and (not recipient_can_delete or vehicle_share.can_delete)
    limit 1;
    if not found then
      raise exception 'You do not have permission to share this vehicle';
    end if;
    if (recipient_can_share and not source_share.can_share)
      or (recipient_can_edit and not source_share.can_edit)
      or (recipient_can_delete and not source_share.can_delete) then
      raise exception 'You cannot grant permissions you do not have';
    end if;
    new_parent_share_id := source_share.id;
  end if;

  if not exists (
    select 1 from public.profiles as profile where profile.id = recipient_user_id
  ) then
    raise exception 'The recipient account was not found';
  end if;

  select vehicle_share.* into existing_share
  from public.user_vehicle_shares as vehicle_share
  where vehicle_share.vehicle_id = target_vehicle_id
    and vehicle_share.shared_by = (select auth.uid())
    and vehicle_share.shared_with_user_id = recipient_user_id;

  had_existing_share := found;
  existing_share_was_accepted := found and existing_share.status = 'accepted';
  if found and (
    (existing_share.can_share and not recipient_can_share)
    or (existing_share.can_edit and not recipient_can_edit)
    or (existing_share.can_delete and not recipient_can_delete)
  ) then
    delete from public.user_vehicle_shares
    where parent_share_id = existing_share.id;
  end if;

  insert into public.user_vehicle_shares (
    vehicle_id, shared_by, shared_with_user_id, parent_share_id,
    can_view, can_share, can_edit, can_delete, status
  )
  values (
    target_vehicle_id, (select auth.uid()), recipient_user_id, new_parent_share_id,
    true, recipient_can_share, recipient_can_edit, recipient_can_delete,
    case when existing_share_was_accepted then 'accepted' else 'pending' end
  )
  on conflict (vehicle_id, shared_by, shared_with_user_id)
  do update set
    parent_share_id = excluded.parent_share_id,
    can_view = true,
    can_share = excluded.can_share,
    can_edit = excluded.can_edit,
    can_delete = excluded.can_delete,
    status = excluded.status
  returning id into current_share_id;

  if not had_existing_share or not existing_share_was_accepted then
    insert into public.app_notifications (recipient_id, kind, actor_id, vehicle_id, share_id)
    values
      (recipient_user_id, 'vehicle_share_received', (select auth.uid()), target_vehicle_id, current_share_id),
      ((select auth.uid()), 'vehicle_share_sent', recipient_user_id, target_vehicle_id, current_share_id);
  end if;
end;
$$;

revoke all on function public.grant_vehicle_share(uuid, uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.grant_vehicle_share(uuid, uuid, boolean, boolean, boolean) to authenticated;

create or replace function public.respond_to_vehicle_share(
  target_share_id uuid,
  accept_share boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  share_row public.user_vehicle_shares%rowtype;
begin
  select * into share_row
  from public.user_vehicle_shares
  where id = target_share_id
    and shared_with_user_id = (select auth.uid())
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Pending vehicle share not found';
  end if;

  update public.user_vehicle_shares
  set status = case when accept_share then 'accepted' else 'rejected' end
  where id = target_share_id;

  update public.app_notifications
  set read_at = now()
  where recipient_id = (select auth.uid())
    and kind = 'vehicle_share_received'
    and share_id = target_share_id;

  insert into public.app_notifications (recipient_id, kind, actor_id, vehicle_id, share_id)
  values
    (share_row.shared_by,
      case when accept_share then 'vehicle_share_accepted' else 'vehicle_share_rejected' end,
      (select auth.uid()), share_row.vehicle_id, target_share_id);

  if not accept_share then
    delete from public.user_vehicle_shares where id = target_share_id;
  end if;
end;
$$;

revoke all on function public.respond_to_vehicle_share(uuid, boolean) from public, anon;
grant execute on function public.respond_to_vehicle_share(uuid, boolean) to authenticated;

create or replace function public.revoke_vehicle_share(target_share_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.user_vehicle_shares
  where id = target_share_id
    and shared_by = (select auth.uid());

  if not found then
    raise exception 'The share was not found or you do not have permission to revoke it';
  end if;
end;
$$;

revoke all on function public.revoke_vehicle_share(uuid) from public, anon;
grant execute on function public.revoke_vehicle_share(uuid) to authenticated;

create or replace function public.transfer_vehicle_ownership(
  target_vehicle_id uuid,
  recipient_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select vehicle.user_id into current_owner_id
  from public.user_vehicles as vehicle
  where vehicle.id = target_vehicle_id
  for update;

  if not found then
    raise exception 'Vehicle not found';
  end if;

  if current_owner_id <> (select auth.uid())
     and not (select public.is_admin()) then
    raise exception 'Only the vehicle owner or an admin can transfer ownership';
  end if;

  if recipient_user_id = current_owner_id then
    raise exception 'The recipient already owns this vehicle';
  end if;

  if not exists (
    select 1 from public.profiles as profile where profile.id = recipient_user_id
  ) then
    raise exception 'Recipient account not found';
  end if;

  delete from public.user_vehicle_shares
  where vehicle_id = target_vehicle_id;

  update public.user_vehicles
  set user_id = recipient_user_id
  where id = target_vehicle_id;
end;
$$;

revoke all on function public.transfer_vehicle_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_vehicle_ownership(uuid, uuid) to authenticated;

create or replace function public.resolve_vehicle_transfer_recipient(
  target_vehicle_id uuid,
  recipient_identifier text
)
returns table (user_id uuid, username text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_owner_id uuid;
begin
  select vehicle.user_id into current_owner_id
  from public.user_vehicles as vehicle
  where vehicle.id = target_vehicle_id;

  if not found then
    raise exception 'Vehicle not found';
  end if;

  if current_owner_id <> (select auth.uid())
     and not (select public.is_admin()) then
    raise exception 'Only the vehicle owner or an admin can transfer ownership';
  end if;

  return query
  select profile.id, profile.username
  from public.profiles as profile
  where (lower(profile.username) = lower(btrim(recipient_identifier))
      or lower(profile.email) = lower(btrim(recipient_identifier)))
    and profile.id <> current_owner_id
  limit 1;
end;
$$;

revoke all on function public.resolve_vehicle_transfer_recipient(uuid, text) from public, anon;
grant execute on function public.resolve_vehicle_transfer_recipient(uuid, text) to authenticated;

drop policy if exists user_vehicles_read_own on public.user_vehicles;
drop policy if exists user_vehicles_read_shared on public.user_vehicles;
create policy user_vehicles_read_shared
  on public.user_vehicles for select to authenticated
  using ((select public.user_can_vehicle(id, 'view')));

drop policy if exists user_vehicles_update_own on public.user_vehicles;
drop policy if exists user_vehicles_update_shared on public.user_vehicles;
create policy user_vehicles_update_shared
  on public.user_vehicles for update to authenticated
  using ((select public.user_can_vehicle(id, 'edit')))
  with check (
    user_id = (select auth.uid())
    or (
      (select public.user_can_vehicle(id, 'edit'))
      and user_id = (select public.vehicle_owner_user_id(id))
    )
  );

drop policy if exists user_vehicles_delete_own on public.user_vehicles;
drop policy if exists user_vehicles_delete_shared on public.user_vehicles;
create policy user_vehicles_delete_shared
  on public.user_vehicles for delete to authenticated
  using ((select public.user_can_vehicle(id, 'delete')));

drop policy if exists profiles_read_shared_vehicle_owners on public.profiles;
create policy profiles_read_shared_vehicle_owners
  on public.profiles for select to authenticated
  using (
    exists (
      select 1 from public.user_vehicles as vehicle
      where vehicle.user_id = profiles.id
        and (select public.user_can_vehicle(vehicle.id, 'view'))
    )
  );

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
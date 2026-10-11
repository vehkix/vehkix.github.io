-- Account-deletion and notification workflows
-- Run as step 4 in the Supabase setup sequence documented in README.md.

drop function if exists public.request_account_deletion();

create or replace function public.request_account_deletion(confirmation_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  requester_username text;
  requester_email text;
begin
  if requester_id is null then
    raise exception 'Sign in to request account deletion';
  end if;

  select profile.username, auth_user.email
  into requester_username, requester_email
  from public.profiles as profile
  join auth.users as auth_user on auth_user.id = profile.id
  where profile.id = requester_id;
  if requester_username is null or requester_email is null then
    raise exception 'Profile not found';
  end if;

  if lower(btrim(confirmation_email)) is distinct from lower(btrim(requester_email)) then
    raise exception 'The confirmation email does not match your account email';
  end if;

  if exists (
    select 1 from public.admin_users as admin
    where admin.user_id = requester_id
  ) and not exists (
    select 1 from public.admin_users as other_admin
    where other_admin.user_id <> requester_id
  ) then
    raise exception 'The last administrator cannot schedule account deletion';
  end if;

  update public.profiles
  set active = false
  where id = requester_id;

  insert into public.account_deletion_requests (user_id, requested_username)
  values (requester_id, requester_username)
  on conflict (user_id) where status = 'pending' and user_id is not null
  do update set updated_at = now();
end;
$$;

revoke all on function public.request_account_deletion(text) from public, anon;
grant execute on function public.request_account_deletion(text) to authenticated;

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

-- Old requests lacked email confirmation and must not be treated as deletion consent.
update public.account_deletion_requests as request
set status = 'cancelled', updated_at = now()
from public.profiles as profile
where request.user_id = profile.id
  and request.status = 'pending'
  and profile.active;

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
  join public.profiles as profile on profile.id = request.user_id
  where request.status = 'pending'
    and not profile.active
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

drop function if exists public.resolve_account_deletion_request(uuid, boolean);

create or replace function public.purge_expired_account_deletions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.account_deletion_requests%rowtype;
  deleted_count integer := 0;
begin
  for request_row in
    select request.*
    from public.account_deletion_requests as request
    join public.profiles as profile on profile.id = request.user_id
    where request.status = 'pending'
      and not profile.active
      and request.requested_at <= now() - interval '1 month'
      and (
        not exists (
          select 1 from public.admin_users as admin
          where admin.user_id = request.user_id
        )
        or exists (
          select 1 from public.admin_users as other_admin
          where other_admin.user_id <> request.user_id
        )
      )
    for update of request skip locked
  loop
    update public.account_deletion_requests
    set status = 'approved', updated_at = now()
    where id = request_row.id;

    delete from storage.objects
    where (bucket_id = 'user-vehicle-images' or bucket_id = 'user-profile-images')
      and name like request_row.user_id::text || '/%';

    delete from auth.users
    where id = request_row.user_id;
    if found then
      deleted_count := deleted_count + 1;
    end if;
  end loop;

  return deleted_count;
end;
$$;

revoke all on function public.purge_expired_account_deletions() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule(jobid)
from cron.job
where jobname = 'purge_expired_account_deletions';

select cron.schedule(
  'purge_expired_account_deletions',
  '* * * * *',
  'select public.purge_expired_account_deletions();'
);

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

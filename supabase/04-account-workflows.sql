-- Account-deletion and notification workflows
-- Run as step 4 in the Supabase setup sequence documented in README.md.

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


-- Vehicle sharing and ownership transfer
-- Run as step 7 in the Supabase setup sequence documented in README.md.

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


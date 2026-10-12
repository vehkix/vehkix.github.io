-- Per-user guest-share choices and compact share tokens
-- Run after supabase/11-public-vehicle-sharing.sql.

alter table public.user_vehicle_share_preferences
  add column if not exists public_share_field_keys text[] not null default '{}';

alter table public.vehicle_public_shares
  add column if not exists token text;

update public.vehicle_public_shares
set token = substr(
  translate(rtrim(encode(uuid_send(gen_random_uuid()), 'base64'), '='), '+/', '-_'),
  1,
  16
)
where token is null;

alter table public.vehicle_public_shares
  alter column token set default substr(
    translate(rtrim(encode(uuid_send(gen_random_uuid()), 'base64'), '='), '+/', '-_'),
    1,
    16
  ),
  alter column token set not null;

create unique index if not exists vehicle_public_shares_token_idx
  on public.vehicle_public_shares (token);

create or replace function public.create_vehicle_public_share_link(
  target_vehicle_id uuid,
  selected_field_ids text[]
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_share_id uuid;
  new_share_token text;
begin
  new_share_id := public.create_vehicle_public_share(target_vehicle_id, selected_field_ids);

  select share.token
  into new_share_token
  from public.vehicle_public_shares as share
  where share.id = new_share_id;

  return new_share_token;
end;
$$;

revoke all on function public.create_vehicle_public_share_link(uuid, text[]) from public, anon;
grant execute on function public.create_vehicle_public_share_link(uuid, text[]) to authenticated;

create or replace function public.list_vehicle_public_share_links(target_vehicle_id uuid)
returns table (share_id text, field_ids text[], created_at timestamptz)
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
  select share.token, share.field_ids, share.created_at
  from public.vehicle_public_shares as share
  where share.vehicle_id = target_vehicle_id
  order by share.created_at desc;
end;
$$;

revoke all on function public.list_vehicle_public_share_links(uuid) from public, anon;
grant execute on function public.list_vehicle_public_share_links(uuid) to authenticated;

create or replace function public.revoke_vehicle_public_share_link(target_share_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_share_id uuid;
begin
  select share.id
  into target_share_id
  from public.vehicle_public_shares as share
  where share.token = target_share_token;

  if target_share_id is null then
    raise exception 'This public share link was not found or cannot be revoked';
  end if;

  perform public.revoke_vehicle_public_share(target_share_id);
end;
$$;

revoke all on function public.revoke_vehicle_public_share_link(text) from public, anon;
grant execute on function public.revoke_vehicle_public_share_link(text) to authenticated;

create or replace function public.get_vehicle_public_share_by_token(share_token text)
returns table (
  vehicle_name text,
  field_ids text[],
  field_values jsonb,
  image_paths text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_share_id uuid;
begin
  select share.id
  into target_share_id
  from public.vehicle_public_shares as share
  where share.token = share_token
     or share.id::text = share_token
  limit 1;

  if target_share_id is null then
    return;
  end if;

  return query
  select details.vehicle_name, details.field_ids, details.field_values, details.image_paths
  from public.get_vehicle_public_share(target_share_id) as details;
end;
$$;

revoke all on function public.get_vehicle_public_share_by_token(text) from public, authenticated;
grant execute on function public.get_vehicle_public_share_by_token(text) to anon, authenticated;

revoke all on function public.get_vehicle_public_share(uuid) from public, anon, authenticated;

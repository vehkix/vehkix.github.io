-- Accounts and profiles
-- Run as step 1 in the Supabase setup sequence documented in README.md.

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


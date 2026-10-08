-- Legacy public vehicle access. This exposes every row in public.vehicles.

alter table public.vehicles enable row level security;

drop policy if exists vehicles_read_public
  on public.vehicles;

create policy vehicles_read_public
  on public.vehicles
  for select
  to anon, authenticated
  using (true);

grant select on public.vehicles to anon, authenticated;